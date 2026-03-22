"""Photo indexer — walks directories, extracts thumbnails and metadata.

Scans mounted NAS directories for RAW/JPEG/HEIC files, extracts embedded
JPEG previews, generates thumbnails, reads EXIF metadata, and writes
everything to the SQLite database.
"""

import io
import sqlite3
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import asdict
from pathlib import Path

import xxhash
from PIL import Image, ImageOps
from tqdm import tqdm

from photocull.db import is_indexed, upsert_photo
from photocull.exif_utils import extract_exif

# File extensions we handle
RAW_EXTENSIONS = {".cr2", ".cr3", ".arw", ".nef", ".raf", ".dng", ".orf", ".rw2"}
JPEG_EXTENSIONS = {".jpg", ".jpeg"}
HEIC_EXTENSIONS = {".heic", ".heif"}
ALL_EXTENSIONS = RAW_EXTENSIONS | JPEG_EXTENSIONS | HEIC_EXTENSIONS

# Thumbnail sizes (long edge in pixels)
THUMB_SM_SIZE = 400
THUMB_LG_SIZE = 1600


def compute_file_hash(file_path: Path, chunk_size: int = 65536) -> str:
    """Compute xxhash of first 64KB + file size for fast dedup."""
    h = xxhash.xxh64()
    with open(file_path, "rb") as f:
        data = f.read(chunk_size)
        h.update(data)
    h.update(str(file_path.stat().st_size).encode())
    return h.hexdigest()


def _resize_to_long_edge(img: Image.Image, max_size: int) -> Image.Image:
    """Resize an image so its longest edge is max_size pixels."""
    w, h = img.size
    if max(w, h) <= max_size:
        return img.copy()
    if w >= h:
        new_w = max_size
        new_h = int(h * max_size / w)
    else:
        new_h = max_size
        new_w = int(w * max_size / h)
    return img.resize((new_w, new_h), Image.LANCZOS)


def _extract_preview_image(file_path: Path) -> Image.Image | None:
    """Extract the embedded JPEG preview from a RAW file, or open JPEG/HEIC directly."""
    suffix = file_path.suffix.lower()

    if suffix in JPEG_EXTENSIONS:
        try:
            return Image.open(file_path)
        except Exception:
            return None

    if suffix in RAW_EXTENSIONS:
        try:
            import rawpy
            with rawpy.imread(str(file_path)) as raw:
                thumb = raw.extract_thumb()
                if thumb.format == rawpy.ThumbFormat.JPEG:
                    return Image.open(io.BytesIO(thumb.data))
                elif thumb.format == rawpy.ThumbFormat.BITMAP:
                    return Image.fromarray(thumb.data)
        except Exception:
            pass
        return None

    if suffix in HEIC_EXTENSIONS:
        # pillow-heif or Pillow with HEIF plugin
        try:
            return Image.open(file_path)
        except Exception:
            return None

    return None


def _generate_thumbnails(
    img: Image.Image, file_hash: str, thumbs_dir: Path
) -> tuple[str, str]:
    """Generate small and large thumbnails. Returns (sm_path, lg_path) relative to thumbs_dir."""
    sm = _resize_to_long_edge(img, THUMB_SM_SIZE)
    lg = _resize_to_long_edge(img, THUMB_LG_SIZE)

    sm_filename = f"{file_hash}_sm.jpg"
    lg_filename = f"{file_hash}_lg.jpg"

    sm.save(thumbs_dir / sm_filename, "JPEG", quality=80)
    lg.save(thumbs_dir / lg_filename, "JPEG", quality=85)

    return sm_filename, lg_filename


def _collect_files(source_dirs: list[Path]) -> list[Path]:
    """Recursively collect all supported photo files from source directories."""
    files = []
    for source in source_dirs:
        if not source.is_dir():
            continue
        for p in source.rglob("*"):
            if p.is_file() and p.suffix.lower() in ALL_EXTENSIONS:
                files.append(p)
    return sorted(files)


def _process_single_file(
    file_path: Path, thumbs_dir: Path
) -> dict | None:
    """Process a single file: extract preview, generate thumbs, read EXIF.

    Returns a dict ready for upsert_photo, or None on failure.
    """
    try:
        stat = file_path.stat()
        file_hash = compute_file_hash(file_path)

        # Check if thumbnails already exist (idempotent)
        sm_filename = f"{file_hash}_sm.jpg"
        lg_filename = f"{file_hash}_lg.jpg"
        sm_exists = (thumbs_dir / sm_filename).exists()
        lg_exists = (thumbs_dir / lg_filename).exists()

        if sm_exists and lg_exists:
            thumb_sm_path = sm_filename
            thumb_lg_path = lg_filename
        else:
            img = _extract_preview_image(file_path)
            if img is None:
                return None
            # Apply EXIF orientation so thumbnails are always upright
            img = ImageOps.exif_transpose(img)
            thumb_sm_path, thumb_lg_path = _generate_thumbnails(
                img, file_hash, thumbs_dir
            )
            img.close()

        exif = extract_exif(file_path)

        return {
            "file_path": str(file_path),
            "file_name": file_path.name,
            "folder": str(file_path.parent),
            "file_size_bytes": stat.st_size,
            "file_mtime": stat.st_mtime,
            "file_hash": file_hash,
            "thumb_sm_path": thumb_sm_path,
            "thumb_lg_path": thumb_lg_path,
            **asdict(exif),
        }
    except Exception as e:
        tqdm.write(f"Error processing {file_path}: {e}")
        return None


def index_photos(
    source_dirs: list[Path],
    db_conn: sqlite3.Connection,
    thumbs_dir: Path,
    incremental: bool = False,
    workers: int = 4,
) -> tuple[int, int]:
    """Index photos from source directories into the database.

    Args:
        source_dirs: Directories to scan for photos.
        db_conn: SQLite database connection.
        thumbs_dir: Directory to store generated thumbnails.
        incremental: If True, skip files that haven't changed since last index.
        workers: Number of parallel worker threads for thumbnail extraction.

    Returns:
        Tuple of (processed_count, skipped_count).
    """
    thumbs_dir.mkdir(parents=True, exist_ok=True)

    all_files = _collect_files(source_dirs)
    if not all_files:
        return 0, 0

    # Filter for incremental mode
    if incremental:
        files_to_process = []
        skipped = 0
        for f in all_files:
            if is_indexed(db_conn, str(f), f.stat().st_mtime):
                skipped += 1
            else:
                files_to_process.append(f)
    else:
        files_to_process = all_files
        skipped = 0

    if not files_to_process:
        return 0, skipped

    processed = 0
    batch_size = 200
    pending = 0
    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {
            executor.submit(_process_single_file, f, thumbs_dir): f
            for f in files_to_process
        }
        with tqdm(total=len(files_to_process), desc="Indexing", unit="photo") as pbar:
            for future in as_completed(futures):
                result = future.result()
                if result is not None:
                    upsert_photo(db_conn, result, commit=False)
                    processed += 1
                    pending += 1
                    if pending >= batch_size:
                        db_conn.commit()
                        pending = 0
                pbar.update(1)
    # Commit any remaining batch
    if pending > 0:
        db_conn.commit()

    return processed, skipped
