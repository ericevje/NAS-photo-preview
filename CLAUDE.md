# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Photo Cull App** — a local web app for fast photo previewing, culling, and organizing from a Synology NAS. Extracts embedded JPEG previews and EXIF metadata from RAW/JPEG files on a mounted NAS, caches them locally, and serves a browser UI for browsing by date, map location, and folder with tagging/rating for Lightroom import.

## Architecture

Three-tier local app:

1. **Indexer (Python CLI)** — walks mounted NAS directories, extracts embedded JPEGs from RAW files (via `rawpy`), reads EXIF, writes to SQLite + local thumbnail cache. Two thumb sizes: 400px (grid) and 1600px (preview).
2. **API Server (FastAPI + uvicorn)** — REST API over SQLite, serves thumbnails as static files, serves the React frontend build.
3. **Frontend (React + Vite + TypeScript)** — dark-themed photo UI with Grid, Timeline, and Map views. Tailwind CSS, Zustand for state, TanStack Query for server cache, TanStack Virtual for grid virtualization, react-leaflet for maps.

The browser never touches the NAS directly — all thumbnails are pre-extracted and served locally.

## Tech Stack

- **Backend:** Python 3.11+, FastAPI, SQLite, rawpy, Pillow, exifread, typer, tqdm
- **Frontend:** React, TypeScript, Vite, Tailwind CSS, Zustand, TanStack Query, TanStack Virtual, react-leaflet + leaflet.markercluster, react-hotkeys-hook

## Project Structure

```
backend/photocull/    — Python package (cli.py, indexer.py, db.py, server.py, exif_utils.py)
frontend/src/         — React app (components, api, stores, hooks, styles)
```

## Commands

```bash
# Backend
cd backend && pip install -e .
photocull index --source /Volumes/photos/2024 --db ./photocull.db --thumbs ./thumbs/
photocull index --source /Volumes/photos/2024 --db ./photocull.db --thumbs ./thumbs/ --incremental
photocull serve --db ./photocull.db --thumbs ./thumbs/ --port 8899

# Frontend
cd frontend && npm install
npm run dev          # Vite dev server
npm run build        # Production build
```

## Key Design Constraints

- **Keyboard-first culling:** shortcuts match Lightroom (1-5 stars, P pick, X reject, arrow keys navigate). Speed is the primary UX goal.
- **Rejected photos hidden by default** in all views, togglable.
- **Map view** is the differentiating feature — clustered GPS markers with bulk-tag from map selection.
- **Export is deliberately simple:** folder copy or text file list of NAS paths for Lightroom import. No proprietary catalog.
- **Thumbnail extraction is I/O-bound:** use ThreadPoolExecutor for parallel processing over network mount.

## Database

Single SQLite file. Schema in `photo-cull-app-plan.md`. Key tables: `photos` with EXIF metadata, thumb paths, and user cull data (rating, label, flagged, rejected). Indexed on date_taken, GPS coords, rating, label, flagged, rejected.

## Build Phases

Detailed in `photo-cull-app-plan.md`. Order: Indexer+DB → API Server → Grid+Loupe → Timeline+Map → Export+Polish.
