"""SQLite database helpers — schema creation, insert/upsert, queries."""

import sqlite3
from pathlib import Path
from typing import Any

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS photos (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path       TEXT NOT NULL UNIQUE,
    file_name       TEXT NOT NULL,
    folder          TEXT NOT NULL,
    file_size_bytes INTEGER,
    file_mtime      REAL,
    file_hash       TEXT,

    -- EXIF
    date_taken      TEXT,
    gps_lat         REAL,
    gps_lon         REAL,
    camera_make     TEXT,
    camera_model    TEXT,
    lens_model      TEXT,
    focal_length    REAL,
    aperture        REAL,
    shutter_speed   TEXT,
    iso             INTEGER,
    image_width     INTEGER,
    image_height    INTEGER,
    orientation     INTEGER,

    -- Thumbnails (relative paths in thumbs dir)
    thumb_sm_path   TEXT,
    thumb_lg_path   TEXT,

    -- User cull data
    rating          INTEGER DEFAULT 0,
    label           TEXT DEFAULT '',
    flagged         BOOLEAN DEFAULT 0,
    rejected        BOOLEAN DEFAULT 0,

    -- Timestamps
    indexed_at      TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_date_taken ON photos(date_taken);
CREATE INDEX IF NOT EXISTS idx_gps ON photos(gps_lat, gps_lon);
CREATE INDEX IF NOT EXISTS idx_rating ON photos(rating);
CREATE INDEX IF NOT EXISTS idx_label ON photos(label);
CREATE INDEX IF NOT EXISTS idx_flagged ON photos(flagged);
CREATE INDEX IF NOT EXISTS idx_rejected ON photos(rejected);
CREATE INDEX IF NOT EXISTS idx_folder ON photos(folder);
CREATE INDEX IF NOT EXISTS idx_file_hash ON photos(file_hash);
"""


def get_connection(db_path: str | Path) -> sqlite3.Connection:
    """Open a SQLite connection with WAL mode and row factory."""
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db(conn: sqlite3.Connection) -> None:
    """Create tables and indexes if they don't exist."""
    conn.executescript(SCHEMA_SQL)


_UPSERT_COLS = [
    "file_path", "file_name", "folder", "file_size_bytes", "file_mtime",
    "file_hash", "date_taken", "gps_lat", "gps_lon", "camera_make",
    "camera_model", "lens_model", "focal_length", "aperture",
    "shutter_speed", "iso", "image_width", "image_height", "orientation",
    "thumb_sm_path", "thumb_lg_path",
]
_UPSERT_SQL = (
    f"INSERT INTO photos ({', '.join(_UPSERT_COLS)}) "
    f"VALUES ({', '.join(['?'] * len(_UPSERT_COLS))}) "
    f"ON CONFLICT(file_path) DO UPDATE SET "
    + ", ".join(f"{c} = excluded.{c}" for c in _UPSERT_COLS if c != "file_path")
    + ", indexed_at = datetime('now')"
)


def upsert_photo(conn: sqlite3.Connection, data: dict[str, Any], commit: bool = True) -> int:
    """Insert or update a photo row. Returns the row id.

    Set commit=False when batching inserts (caller manages transactions).
    """
    values = [data.get(c) for c in _UPSERT_COLS]
    cursor = conn.execute(_UPSERT_SQL, values)
    if commit:
        conn.commit()
    return cursor.lastrowid


def is_indexed(conn: sqlite3.Connection, file_path: str, mtime: float) -> bool:
    """Check if a file is already indexed with the same mtime."""
    row = conn.execute(
        "SELECT file_mtime FROM photos WHERE file_path = ?", (file_path,)
    ).fetchone()
    if row is None:
        return False
    return row["file_mtime"] == mtime


def get_photo_count(conn: sqlite3.Connection) -> int:
    """Return total number of indexed photos."""
    row = conn.execute("SELECT COUNT(*) as cnt FROM photos").fetchone()
    return row["cnt"]
