"""CLI entry point for photocull — index and serve commands."""

from pathlib import Path
from typing import Optional

import typer

from photocull.db import get_connection, get_photo_count, init_db
from photocull.indexer import index_photos

app = typer.Typer(help="PhotoCull — fast photo culling from NAS")


@app.command()
def index(
    source: list[Path] = typer.Option(
        ..., help="Source directories to scan for photos (can specify multiple)"
    ),
    db: Path = typer.Option(
        "photocull.db", help="Path to SQLite database file"
    ),
    thumbs: Path = typer.Option(
        "thumbs", help="Directory to store generated thumbnails"
    ),
    incremental: bool = typer.Option(
        False, help="Only index new or modified files"
    ),
    workers: int = typer.Option(
        4, help="Number of parallel worker threads"
    ),
):
    """Index photos from NAS directories into the local database."""
    for s in source:
        if not s.exists():
            typer.echo(f"Warning: source directory does not exist: {s}", err=True)

    conn = get_connection(db)
    init_db(conn)

    existing = get_photo_count(conn)
    typer.echo(f"Database: {db} ({existing} photos already indexed)")
    typer.echo(f"Scanning: {', '.join(str(s) for s in source)}")

    processed, skipped = index_photos(
        source_dirs=source,
        db_conn=conn,
        thumbs_dir=thumbs,
        incremental=incremental,
        workers=workers,
    )

    total = get_photo_count(conn)
    conn.close()

    typer.echo(f"Done. Processed: {processed}, Skipped: {skipped}, Total in DB: {total}")


@app.command()
def serve(
    db: Path = typer.Option(
        "photocull.db", help="Path to SQLite database file"
    ),
    thumbs: Path = typer.Option(
        "thumbs", help="Directory containing thumbnails"
    ),
    port: int = typer.Option(
        8899, help="Port to serve on"
    ),
    host: str = typer.Option(
        "127.0.0.1", help="Host to bind to"
    ),
):
    """Start the PhotoCull web server."""
    import uvicorn

    # Pass config to the FastAPI app via environment
    import os
    os.environ["PHOTOCULL_DB"] = str(db)
    os.environ["PHOTOCULL_THUMBS"] = str(thumbs)

    typer.echo(f"Starting PhotoCull server on http://{host}:{port}")
    uvicorn.run("photocull.server:app", host=host, port=port, reload=False)


if __name__ == "__main__":
    app()
