"""FastAPI server — REST API for photo browsing, culling, and export."""

import os
import shutil
import sqlite3
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from starlette.middleware.base import BaseHTTPMiddleware

from photocull.db import get_connection

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


class ExportRequest(BaseModel):
    filter: dict[str, Any] = {}
    mode: str = "list"  # "list" or "copy"
    dest: str | None = None


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


@app.post("/api/export")
def export_photos(body: ExportRequest):
    """Export filtered photos as a file list or copy to a destination folder."""
    conn = _get_db()
    try:
        conditions: list[str] = []
        params: list[Any] = []

        filt = body.filter
        if filt.get("flagged"):
            conditions.append("flagged = 1")
        if filt.get("rating_min") is not None:
            conditions.append("rating >= ?")
            params.append(filt["rating_min"])
        if filt.get("label"):
            conditions.append("label = ?")
            params.append(filt["label"])
        if filt.get("rejected") is not None:
            conditions.append("rejected = ?")
            params.append(int(filt["rejected"]))
        else:
            # Default: exclude rejected
            conditions.append("rejected = 0")

        where = " AND ".join(conditions) if conditions else "1"
        rows = conn.execute(
            f"SELECT file_path FROM photos WHERE {where} ORDER BY date_taken",
            params,
        ).fetchall()

        paths = [row["file_path"] for row in rows]

        if body.mode == "copy":
            if not body.dest:
                raise HTTPException(status_code=400, detail="dest is required for copy mode")
            dest_dir = Path(body.dest)
            dest_dir.mkdir(parents=True, exist_ok=True)
            copied = 0
            for p in paths:
                src = Path(p)
                if src.exists():
                    shutil.copy2(src, dest_dir / src.name)
                    copied += 1
            return {"mode": "copy", "count": copied, "dest": str(dest_dir)}

        # mode == "list"
        return {"mode": "list", "count": len(paths), "paths": paths}
    finally:
        conn.close()
