"""FastAPI server — REST API for photo browsing, culling, and export."""

import os
import shutil
import sqlite3
import subprocess
import threading
import uuid
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import PlainTextResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from starlette.middleware.base import BaseHTTPMiddleware

from photocull.db import get_connection, init_db
from photocull.indexer import index_photos

# ---------------------------------------------------------------------------
# Config from environment (set by cli.py before uvicorn starts)
# ---------------------------------------------------------------------------

_db_path: str = ""
_thumbs_path: str = ""


def _get_db() -> sqlite3.Connection:
    return get_connection(_db_path)


# ---------------------------------------------------------------------------
# Lifespan — resolve config once at startup
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    global _db_path, _thumbs_path
    _db_path = os.environ.get("PHOTOCULL_DB", "photocull.db")
    _thumbs_path = os.environ.get("PHOTOCULL_THUMBS", "thumbs")

    # Mount thumbnails as static files with long cache
    thumbs_dir = Path(_thumbs_path)
    if thumbs_dir.is_dir():
        app.mount(
            "/thumbs",
            StaticFiles(directory=str(thumbs_dir)),
            name="thumbs",
        )

    # Serve frontend build if it exists
    frontend_dist = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"
    if frontend_dist.is_dir():
        app.mount(
            "/",
            StaticFiles(directory=str(frontend_dist), html=True),
            name="frontend",
        )

    yield


app = FastAPI(title="PhotoCull", version="0.1.0", lifespan=lifespan)

# CORS for local dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ThumbCacheMiddleware(BaseHTTPMiddleware):
    """Set Cache-Control headers on thumbnail static files."""

    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        if request.url.path.startswith("/thumbs/"):
            response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        return response


app.add_middleware(ThumbCacheMiddleware)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_PHOTO_COLUMNS = [
    "id", "file_path", "file_name", "folder", "file_size_bytes", "file_mtime",
    "file_hash", "date_taken", "gps_lat", "gps_lon", "camera_make",
    "camera_model", "lens_model", "focal_length", "aperture", "shutter_speed",
    "iso", "image_width", "image_height", "orientation",
    "thumb_sm_path", "thumb_lg_path",
    "rating", "label", "flagged", "rejected", "indexed_at",
]


def _row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    d = dict(row)
    # Add thumb URLs so the frontend doesn't need to construct them
    if d.get("thumb_sm_path"):
        d["thumb_sm_url"] = f"/thumbs/{d['thumb_sm_path']}"
    else:
        d["thumb_sm_url"] = None
    if d.get("thumb_lg_path"):
        d["thumb_lg_url"] = f"/thumbs/{d['thumb_lg_path']}"
    else:
        d["thumb_lg_url"] = None
    # Coerce boolean columns
    d["flagged"] = bool(d.get("flagged"))
    d["rejected"] = bool(d.get("rejected"))
    return d


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class PhotoUpdate(BaseModel):
    rating: int | None = None
    label: str | None = None
    flagged: bool | None = None
    rejected: bool | None = None


class BatchUpdate(BaseModel):
    ids: list[int]
    updates: PhotoUpdate


class ExportFilters(BaseModel):
    date_from: str | None = None
    date_to: str | None = None
    has_gps: bool | None = None
    rating_min: int | None = None
    label: str | None = None
    flagged: bool | None = None
    rejected: bool | None = None
    folder: str | None = None


class ExportListRequest(BaseModel):
    filters: ExportFilters | None = None
    photo_ids: list[int] | None = None


class ExportCopyRequest(BaseModel):
    filters: ExportFilters | None = None
    photo_ids: list[int] | None = None
    dest: str
    include_xmp: bool = True


class ImportStartRequest(BaseModel):
    source_dir: str
    incremental: bool = True


# ---------------------------------------------------------------------------
# XMP sidecar generation
# ---------------------------------------------------------------------------

_XMP_TEMPLATE = """\
<?xml version="1.0" encoding="UTF-8"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/rdf-syntax-ns#">
    <rdf:Description
      xmlns:xmp="http://ns.adobe.com/xap/1.0/"
{attrs}
    />
  </rdf:RDF>
</x:xmpmeta>
"""


def _generate_xmp(rating: int | None, label: str | None) -> str | None:
    """Generate minimal XMP sidecar content for Lightroom Classic.

    Returns None if no meaningful metadata to write.
    """
    attrs = []
    if rating and rating > 0:
        attrs.append(f'      xmp:Rating="{rating}"')
    if label:
        attrs.append(f'      xmp:Label="{label.capitalize()}"')
    if not attrs:
        return None
    return _XMP_TEMPLATE.format(attrs="\n".join(attrs))


# ---------------------------------------------------------------------------
# Background export job tracking
# ---------------------------------------------------------------------------

_export_jobs: dict[str, dict[str, Any]] = {}
_export_jobs_lock = threading.Lock()

# ---------------------------------------------------------------------------
# Background import job tracking (single job at a time)
# ---------------------------------------------------------------------------

_import_job: dict[str, Any] | None = None
_import_lock = threading.Lock()


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/photos")
def list_photos(
    sort: str = Query("date_taken", pattern="^(date_taken|file_name|id)$"),
    order: str = Query("asc", pattern="^(asc|desc)$"),
    date_from: str | None = None,
    date_to: str | None = None,
    has_gps: bool | None = None,
    rating_min: int | None = None,
    label: str | None = None,
    flagged: bool | None = None,
    rejected: bool | None = Query(False),
    folder: str | None = None,
    after_id: int | None = None,
    limit: int = Query(100, ge=1, le=1000),
):
    """List photos with filtering and cursor-based pagination."""
    conn = _get_db()
    try:
        conditions: list[str] = []
        params: list[Any] = []

        if date_from:
            conditions.append("date_taken >= ?")
            params.append(date_from)
        if date_to:
            conditions.append("date_taken <= ?")
            params.append(date_to)
        if has_gps is True:
            conditions.append("gps_lat IS NOT NULL AND gps_lon IS NOT NULL")
        elif has_gps is False:
            conditions.append("(gps_lat IS NULL OR gps_lon IS NULL)")
        if rating_min is not None:
            conditions.append("rating >= ?")
            params.append(rating_min)
        if label is not None:
            conditions.append("label = ?")
            params.append(label)
        if flagged is not None:
            conditions.append("flagged = ?")
            params.append(int(flagged))
        if rejected is not None:
            conditions.append("rejected = ?")
            params.append(int(rejected))
        if folder:
            conditions.append("folder LIKE ?")
            params.append(f"%{folder}%")

        # Cursor-based pagination: use the sort column + id for stable ordering
        if after_id is not None:
            # Get the cursor row's sort value
            cursor_row = conn.execute(
                f"SELECT {sort}, id FROM photos WHERE id = ?", (after_id,)
            ).fetchone()
            if cursor_row:
                sort_val = cursor_row[sort]
                if order == "asc":
                    conditions.append(
                        f"({sort} > ? OR ({sort} = ? AND id > ?))"
                    )
                    params.extend([sort_val, sort_val, after_id])
                else:
                    conditions.append(
                        f"({sort} < ? OR ({sort} = ? AND id < ?))"
                    )
                    params.extend([sort_val, sort_val, after_id])

        where = " AND ".join(conditions) if conditions else "1"
        id_order = "ASC" if order == "asc" else "DESC"
        sql = (
            f"SELECT * FROM photos WHERE {where} "
            f"ORDER BY {sort} {order.upper()}, id {id_order} "
            f"LIMIT ?"
        )
        params.append(limit)

        rows = conn.execute(sql, params).fetchall()
        photos = [_row_to_dict(r) for r in rows]

        # next_cursor is the id of the last item returned
        next_cursor = photos[-1]["id"] if photos else None

        return {
            "photos": photos,
            "next_cursor": next_cursor,
            "count": len(photos),
        }
    finally:
        conn.close()


@app.patch("/api/photos/batch")
def batch_update(body: BatchUpdate):
    """Bulk update cull metadata for multiple photos."""
    conn = _get_db()
    try:
        updates = body.updates.model_dump(exclude_none=True)
        if not updates:
            raise HTTPException(status_code=400, detail="No fields to update")

        for key in ("flagged", "rejected"):
            if key in updates:
                updates[key] = int(updates[key])

        set_clause = ", ".join(f"{k} = ?" for k in updates)
        placeholders = ", ".join("?" for _ in body.ids)
        values = list(updates.values()) + body.ids
        conn.execute(
            f"UPDATE photos SET {set_clause} WHERE id IN ({placeholders})",
            values,
        )
        conn.commit()
        return {"updated": len(body.ids)}
    finally:
        conn.close()


@app.get("/api/photos/{photo_id}")
def get_photo(photo_id: int):
    """Get a single photo by ID."""
    conn = _get_db()
    try:
        row = conn.execute("SELECT * FROM photos WHERE id = ?", (photo_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Photo not found")
        return _row_to_dict(row)
    finally:
        conn.close()


@app.patch("/api/photos/{photo_id}")
def update_photo(photo_id: int, body: PhotoUpdate):
    """Update cull metadata for a single photo."""
    conn = _get_db()
    try:
        updates = body.model_dump(exclude_none=True)
        if not updates:
            raise HTTPException(status_code=400, detail="No fields to update")

        # Convert booleans to int for SQLite
        for key in ("flagged", "rejected"):
            if key in updates:
                updates[key] = int(updates[key])

        set_clause = ", ".join(f"{k} = ?" for k in updates)
        values = list(updates.values()) + [photo_id]
        result = conn.execute(
            f"UPDATE photos SET {set_clause} WHERE id = ?", values
        )
        conn.commit()
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Photo not found")

        row = conn.execute("SELECT * FROM photos WHERE id = ?", (photo_id,)).fetchone()
        return _row_to_dict(row)
    finally:
        conn.close()


@app.get("/api/stats")
def get_stats():
    """Return aggregate stats about the photo library."""
    conn = _get_db()
    try:
        total = conn.execute("SELECT COUNT(*) FROM photos").fetchone()[0]
        flagged = conn.execute("SELECT COUNT(*) FROM photos WHERE flagged = 1").fetchone()[0]
        rejected = conn.execute("SELECT COUNT(*) FROM photos WHERE rejected = 1").fetchone()[0]
        unlabeled = conn.execute("SELECT COUNT(*) FROM photos WHERE label = '' OR label IS NULL").fetchone()[0]

        by_rating = {}
        for row in conn.execute("SELECT rating, COUNT(*) as cnt FROM photos GROUP BY rating"):
            by_rating[str(row[0])] = row[1]

        by_label = {}
        for row in conn.execute("SELECT label, COUNT(*) as cnt FROM photos GROUP BY label"):
            by_label[row[0] if row[0] else ""] = row[1]

        by_date = {}
        for row in conn.execute(
            "SELECT DATE(date_taken) as day, COUNT(*) as cnt FROM photos "
            "WHERE date_taken IS NOT NULL GROUP BY day ORDER BY day"
        ):
            by_date[row[0]] = row[1]

        return {
            "total": total,
            "flagged": flagged,
            "rejected": rejected,
            "unlabeled": unlabeled,
            "by_rating": by_rating,
            "by_label": by_label,
            "by_date": by_date,
        }
    finally:
        conn.close()


@app.get("/api/folders")
def get_folders():
    """Return distinct folder paths with photo counts."""
    conn = _get_db()
    try:
        rows = conn.execute(
            "SELECT folder, COUNT(*) as count FROM photos GROUP BY folder ORDER BY folder"
        ).fetchall()
        return [{"folder": row["folder"], "count": row["count"]} for row in rows]
    finally:
        conn.close()


def _build_export_where(
    filters: ExportFilters | None,
    photo_ids: list[int] | None,
) -> tuple[str, list[Any]]:
    """Build a WHERE clause from export filters or explicit IDs."""
    conditions: list[str] = []
    params: list[Any] = []

    if photo_ids:
        placeholders = ", ".join("?" for _ in photo_ids)
        conditions.append(f"id IN ({placeholders})")
        params.extend(photo_ids)
    else:
        filt = filters or ExportFilters()
        if filt.date_from:
            conditions.append("date_taken >= ?")
            params.append(filt.date_from)
        if filt.date_to:
            conditions.append("date_taken <= ?")
            params.append(filt.date_to)
        if filt.has_gps is True:
            conditions.append("gps_lat IS NOT NULL AND gps_lon IS NOT NULL")
        if filt.rating_min is not None:
            conditions.append("rating >= ?")
            params.append(filt.rating_min)
        if filt.label is not None:
            conditions.append("label = ?")
            params.append(filt.label)
        if filt.flagged is not None:
            conditions.append("flagged = ?")
            params.append(int(filt.flagged))
        if filt.rejected is not None:
            conditions.append("rejected = ?")
            params.append(int(filt.rejected))
        else:
            conditions.append("rejected = 0")
        if filt.folder:
            conditions.append("folder LIKE ?")
            params.append(f"%{filt.folder}%")

    where = " AND ".join(conditions) if conditions else "1"
    return where, params


@app.get("/api/export/default-dest")
def export_default_dest():
    """Return a default export destination path based on current timestamp."""
    ts = datetime.now().strftime("%Y%m%d-%H:%M:%S")
    pictures = Path.home() / "Pictures" / ts
    return {"path": str(pictures)}


@app.post("/api/export/browse")
def export_browse():
    """Open a native macOS folder picker dialog. Returns the selected path."""
    try:
        result = subprocess.run(
            [
                "osascript",
                "-e",
                'POSIX path of (choose folder with prompt "Select export destination")',
            ],
            capture_output=True,
            text=True,
            timeout=120,
        )
        if result.returncode != 0:
            # User cancelled the dialog
            return {"path": None}
        return {"path": result.stdout.strip().rstrip("/")}
    except subprocess.TimeoutExpired:
        return {"path": None}


@app.post("/api/export/count")
def export_count(body: ExportListRequest):
    """Return the count of photos that would be exported."""
    conn = _get_db()
    try:
        where, params = _build_export_where(body.filters, body.photo_ids)
        count = conn.execute(
            f"SELECT COUNT(*) FROM photos WHERE {where}", params
        ).fetchone()[0]
        return {"count": count}
    finally:
        conn.close()


@app.post("/api/export/list")
def export_list(body: ExportListRequest):
    """Return a downloadable .txt file with one NAS file_path per line."""
    conn = _get_db()
    try:
        where, params = _build_export_where(body.filters, body.photo_ids)
        rows = conn.execute(
            f"SELECT file_path FROM photos WHERE {where} ORDER BY date_taken",
            params,
        ).fetchall()
        paths = [row["file_path"] for row in rows]
        content = "\n".join(paths) + ("\n" if paths else "")
        return PlainTextResponse(
            content=content,
            media_type="text/plain",
            headers={"Content-Disposition": "attachment; filename=export-paths.txt"},
        )
    finally:
        conn.close()


@app.post("/api/export/copy")
def export_copy(body: ExportCopyRequest):
    """Start a background copy job. Returns a job_id to poll for progress."""
    # Resolve photo data from DB first
    conn = _get_db()
    try:
        where, params = _build_export_where(body.filters, body.photo_ids)
        rows_raw = conn.execute(
            f"SELECT file_path, rating, label FROM photos WHERE {where} ORDER BY date_taken",
            params,
        ).fetchall()
        # Convert to plain dicts — sqlite3.Row objects aren't safe across threads
        photo_rows = [dict(row) for row in rows_raw]
    finally:
        conn.close()

    if not photo_rows:
        raise HTTPException(status_code=400, detail="No photos match the export criteria")

    include_xmp = body.include_xmp
    job_id = str(uuid.uuid4())
    job: dict[str, Any] = {
        "status": "running",
        "total": len(photo_rows),
        "copied": 0,
        "failed": 0,
        "dest": body.dest,
    }
    with _export_jobs_lock:
        _export_jobs[job_id] = job

    def _do_copy():
        dest_dir = Path(body.dest)
        dest_dir.mkdir(parents=True, exist_ok=True)
        for row in photo_rows:
            src = Path(row["file_path"])
            try:
                if src.exists():
                    shutil.copy2(src, dest_dir / src.name)
                    if include_xmp:
                        xmp_content = _generate_xmp(row["rating"], row["label"])
                        if xmp_content:
                            xmp_path = dest_dir / (src.stem + ".xmp")
                            xmp_path.write_text(xmp_content, encoding="utf-8")
                    job["copied"] += 1
                else:
                    job["failed"] += 1
            except OSError:
                job["failed"] += 1
        job["status"] = "done"

    thread = threading.Thread(target=_do_copy, daemon=True)
    thread.start()

    return {"job_id": job_id, "total": len(photo_rows)}


@app.get("/api/export/status/{job_id}")
def export_status(job_id: str):
    """Poll progress of a background copy job."""
    with _export_jobs_lock:
        job = _export_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


# ---------------------------------------------------------------------------
# Import endpoints — browse NAS folders and trigger indexing from the UI
# ---------------------------------------------------------------------------


@app.post("/api/import/browse")
def import_browse():
    """Open a native macOS folder picker dialog for selecting a NAS folder to import."""
    try:
        result = subprocess.run(
            [
                "osascript",
                "-e",
                'POSIX path of (choose folder with prompt "Select folder to import")',
            ],
            capture_output=True,
            text=True,
            timeout=120,
        )
        if result.returncode != 0:
            return {"path": None}
        return {"path": result.stdout.strip().rstrip("/")}
    except subprocess.TimeoutExpired:
        return {"path": None}


@app.post("/api/import/start")
def import_start(body: ImportStartRequest):
    """Start a background indexing job. Only one import can run at a time."""
    global _import_job

    source = Path(body.source_dir)
    if not source.is_dir():
        raise HTTPException(status_code=400, detail=f"Directory not found: {body.source_dir}")

    with _import_lock:
        if _import_job and _import_job.get("status") == "running":
            raise HTTPException(status_code=409, detail="An import is already running")
        job: dict[str, Any] = {
            "status": "running",
            "phase": "scanning",
            "source_dir": body.source_dir,
            "processed": 0,
            "skipped": 0,
            "total": 0,
            "error": None,
        }
        _import_job = job

    def _do_import():
        try:
            conn = get_connection(_db_path)
            try:
                init_db(conn)

                def _on_progress(processed: int, skipped: int, total: int, done: bool):
                    job["processed"] = processed
                    job["skipped"] = skipped
                    job["total"] = total
                    if total > 0:
                        job["phase"] = "indexing"
                    if done:
                        job["status"] = "done"
                        job["phase"] = "done"

                index_photos(
                    source_dirs=[source],
                    db_conn=conn,
                    thumbs_dir=Path(_thumbs_path),
                    incremental=body.incremental,
                    workers=4,
                    progress_callback=_on_progress,
                )
                # Ensure status is set even if callback already set it
                job["status"] = "done"
                job["phase"] = "done"
            finally:
                conn.close()
        except Exception as e:
            job["status"] = "error"
            job["phase"] = "error"
            job["error"] = str(e)

    thread = threading.Thread(target=_do_import, daemon=True)
    thread.start()

    return {"status": "started", "source_dir": body.source_dir}


@app.get("/api/import/status")
def import_status():
    """Return the current import job status, or idle if none."""
    if _import_job is None:
        return {"status": "idle"}
    return _import_job
