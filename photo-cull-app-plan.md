# Photo Cull App — Build Plan

## Overview

A local web app for fast photo previewing, culling, and organizing from a NAS (Synology). The core idea: extract embedded JPEG previews and EXIF metadata from RAW/JPEG files on a NAS, cache them locally, and serve a snappy browser UI for browsing by **date**, **map location**, and **folder** — with tagging/rating so the user can mark selects and export a clean set of paths for Lightroom import.

This replaces the sluggish Lightroom import → preview → reject cycle and the underwhelming Synology Photos experience.

---

## Architecture

```
NAS (SMB/NFS mount)          Local Machine
┌─────────────────┐     ┌──────────────────────────────┐
│  /photos/        │────▶│  Indexer (Python CLI)         │
│   RAW + JPEG     │     │  - Walks directories          │
│   files on NAS   │     │  - Extracts embedded JPEGs    │
│                  │     │  - Reads EXIF (GPS, date, etc)│
└─────────────────┘     │  - Writes to SQLite + thumbs/ │
                        └──────────┬───────────────────┘
                                   │
                        ┌──────────▼───────────────────┐
                        │  Web Server (FastAPI or Flask)│
                        │  - Serves REST API            │
                        │  - Serves thumbnail files     │
                        │  - Serves React frontend      │
                        └──────────┬───────────────────┘
                                   │
                        ┌──────────▼───────────────────┐
                        │  Browser UI (React)           │
                        │  - Timeline view              │
                        │  - Map view                   │
                        │  - Folder view                │
                        │  - Tagging / rating / culling │
                        │  - Export selects              │
                        └──────────────────────────────┘
```

**Tech stack:**
- **Backend:** Python 3.11+ with FastAPI
- **Indexer:** Python CLI script (can be run on-demand or as a cron)
- **Database:** SQLite (single file, zero config)
- **Thumbnail cache:** Local directory of extracted JPEGs, named by hash
- **Frontend:** React (Vite) with TypeScript
- **Map:** Leaflet + OpenStreetMap (free, no API key)

---

## Part 1 — Indexer (Python CLI)

### Purpose
Walk a mounted NAS photo directory, extract metadata and thumbnails, and store everything in a local SQLite DB + thumbnail cache folder.

### CLI interface

```bash
# First-time full scan
photocull index --source /Volumes/photos/2024 --db ./photocull.db --thumbs ./thumbs/

# Incremental update (only new/modified files)
photocull index --source /Volumes/photos/2024 --db ./photocull.db --thumbs ./thumbs/ --incremental

# Scan multiple directories
photocull index --source /Volumes/photos/2024 --source /Volumes/photos/2025 --db ./photocull.db --thumbs ./thumbs/
```

### What it does per file

1. **Check if already indexed** — compare file path + mtime against DB. Skip if unchanged.
2. **Extract embedded JPEG preview** — Use `rawpy` for RAW files (CR2, CR3, ARW, NEF, RAF, DNG, ORF, RW2) to pull the embedded full-size JPEG. For JPEG/HEIC inputs, just read the file directly. Generate two sizes:
   - `thumb_sm` — 400px on long edge (for grid view)
   - `thumb_lg` — 1600px on long edge (for single-image preview)
3. **Extract EXIF metadata** — Use `exifread` or `Pillow` + `piexif`. Pull:
   - `date_taken` (EXIF DateTimeOriginal) → store as ISO 8601
   - `gps_lat`, `gps_lon` (convert from DMS to decimal degrees)
   - `camera_make`, `camera_model`
   - `lens_model`
   - `focal_length`, `aperture`, `shutter_speed`, `iso`
   - `image_width`, `image_height`
   - `file_size_bytes`
4. **Write to DB + save thumbnails** to the thumbs directory.

### SQLite Schema

```sql
CREATE TABLE photos (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    file_path       TEXT NOT NULL UNIQUE,    -- full path on NAS
    file_name       TEXT NOT NULL,
    file_size_bytes INTEGER,
    file_mtime      REAL,                    -- for incremental indexing
    
    -- EXIF
    date_taken      TEXT,                    -- ISO 8601
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
    
    -- Thumbnails (relative paths in thumbs dir)
    thumb_sm_path   TEXT,
    thumb_lg_path   TEXT,
    
    -- User cull data
    rating          INTEGER DEFAULT 0,       -- 0-5 stars
    label           TEXT DEFAULT '',          -- 'red','green','blue','yellow','purple' or ''
    flagged         BOOLEAN DEFAULT 0,       -- pick flag
    rejected        BOOLEAN DEFAULT 0,       -- reject flag
    
    -- Timestamps
    indexed_at      TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_date_taken ON photos(date_taken);
CREATE INDEX idx_gps ON photos(gps_lat, gps_lon);
CREATE INDEX idx_rating ON photos(rating);
CREATE INDEX idx_label ON photos(label);
CREATE INDEX idx_flagged ON photos(flagged);
CREATE INDEX idx_rejected ON photos(rejected);
```

### Key libraries
- `rawpy` — extract embedded preview from RAW files
- `Pillow` — resize, read JPEG EXIF
- `exifread` — more robust EXIF parsing (especially GPS)
- `click` or `typer` — CLI framework
- Standard `sqlite3` module

### Performance notes
- Use `concurrent.futures.ThreadPoolExecutor` for parallel thumbnail extraction (I/O bound over network)
- Show a progress bar with `tqdm`
- Target: index ~1000 photos/minute on a gigabit LAN

---

## Part 2 — API Server (FastAPI)

### Endpoints

```
GET  /api/photos
     Query params: 
       ?sort=date_taken|file_name  &order=asc|desc
       ?date_from=2024-01-01  &date_to=2024-12-31
       ?has_gps=true
       ?rating_min=3
       ?label=green
       ?flagged=true
       ?rejected=false          (default: false — hide rejects)
       ?folder=substring        (filter by directory path)
       ?page=1  &per_page=100
     Returns: paginated JSON array of photo objects

GET  /api/photos/:id
     Returns: single photo object with full metadata

PATCH /api/photos/:id
     Body: { rating?: number, label?: string, flagged?: bool, rejected?: bool }
     Updates cull metadata for a single photo

PATCH /api/photos/batch
     Body: { ids: number[], updates: { rating?, label?, flagged?, rejected? } }
     Bulk update — for selecting a range and applying a label

GET  /api/photos/:id/thumb/sm
     Returns: small thumbnail JPEG (for grid)

GET  /api/photos/:id/thumb/lg
     Returns: large thumbnail JPEG (for preview)

GET  /api/stats
     Returns: { total, flagged, rejected, unlabeled, by_date: {...}, by_label: {...} }

GET  /api/folders
     Returns: distinct directory paths in the index, with counts

POST /api/export
     Body: { filter: { flagged?: true, rating_min?: 3, label?: "green" }, mode: "list" | "copy", dest?: "/path/to/staging" }
     Returns: list of NAS file paths matching filter, or copies files to dest
```

### Server setup
- Use `uvicorn` to run FastAPI
- Serve the React build as static files from the same server
- CORS enabled for local dev
- Single `photocull serve --db ./photocull.db --thumbs ./thumbs/ --port 8899` command

---

## Part 3 — Frontend (React + Vite + TypeScript)

### Design direction
- **Dark theme** — this is a photo app, dark backgrounds make photos pop
- **Minimal chrome** — the photos are the UI. Toolbars and panels should be subtle
- **Keyboard-first** — culling speed depends on keyboard shortcuts

### Layout — three main views (tabs or sidebar toggle)

#### 1. Grid View (default)
- Responsive masonry or fixed-ratio grid of `thumb_sm` images
- Infinite scroll (virtualized with `react-window` or `tanstack-virtual` for performance with 10k+ photos)
- Clicking a photo opens it in **Loupe View** (overlay/lightbox showing `thumb_lg`)
- Photos show a small overlay: rating stars, color label dot, flag/reject icon
- Filter bar at top: date range picker, label filter chips, rating filter, folder dropdown, show/hide rejected toggle
- Sort toggle: by date or by filename

#### 2. Timeline View
- Photos grouped by date (day), with date headers
- Collapsible day groups
- Same grid within each group
- Sticky date header as you scroll
- Optional: a small date histogram / scrubber on the side for fast jumping

#### 3. Map View
- Full-width Leaflet map with photo markers clustered (use `react-leaflet` + `leaflet.markercluster`)
- Only photos with GPS data shown
- Clicking a cluster zooms in; clicking a single marker shows a thumbnail popup
- Popup has: thumbnail, filename, date, rating controls
- Sidebar or bottom drawer shows photos for the current map viewport as a mini grid
- User can select photos on the map and bulk-tag them

### Loupe View (overlay on any view)
- Large `thumb_lg` preview, centered, dark overlay background
- Left/right arrow keys (or on-screen arrows) to navigate
- Keyboard shortcuts displayed in a small help tooltip:
  - `1-5` — set star rating
  - `p` — toggle flagged (pick)
  - `x` — toggle rejected
  - `6-0` or `r/g/b/y/u` — set color label (red/green/blue/yellow/purple)
  - `→` / `←` — next/previous photo
  - `Escape` — close loupe
- Bottom bar shows: filename, date taken, camera + lens, focal/aperture/shutter/ISO
- Rating and label controls also clickable (not just keyboard)

### Bulk actions
- Shift-click or click-drag to select a range in grid view
- Toolbar appears: "X selected" — Set Rating, Set Label, Flag All, Reject All
- Keyboard shortcuts work on selection too

### Export panel
- Accessible from a button in the top nav
- Shows current filter summary and count of matching photos
- Two export modes:
  - **Copy to folder** — copies matching NAS files to a local staging directory (user picks path)
  - **Export file list** — generates a `.txt` file with one NAS file path per line
- Both are useful for Lightroom import (Lightroom can import from a folder, or you can script an import from a file list)

### Tech details
- **Vite + React + TypeScript**
- **State management:** Zustand or React Query (TanStack Query) for server state + caching
- **Virtualization:** `@tanstack/react-virtual` for grid performance
- **Map:** `react-leaflet` + `leaflet.markercluster`
- **Styling:** Tailwind CSS with a custom dark theme
- **Keyboard handling:** custom `useHotkeys` hook or `react-hotkeys-hook`

---

## Part 4 — Project Structure

```
photocull/
├── backend/
│   ├── photocull/
│   │   ├── __init__.py
│   │   ├── cli.py              # CLI entry point (index + serve commands)
│   │   ├── indexer.py           # NAS scanning, EXIF extraction, thumbnail generation
│   │   ├── db.py                # SQLite helpers, schema, queries
│   │   ├── server.py            # FastAPI app
│   │   └── exif_utils.py        # EXIF parsing and GPS conversion helpers
│   ├── pyproject.toml
│   └── requirements.txt
│       # rawpy, Pillow, exifread, fastapi, uvicorn, typer, tqdm
│
├── frontend/
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── api/
│   │   │   └── client.ts        # API client (fetch wrappers)
│   │   ├── stores/
│   │   │   └── photoStore.ts    # Zustand store for UI state
│   │   ├── hooks/
│   │   │   ├── usePhotos.ts     # TanStack Query hooks for photo data
│   │   │   └── useHotkeys.ts    # Keyboard shortcut hook
│   │   ├── components/
│   │   │   ├── Layout.tsx       # App shell, nav, sidebar
│   │   │   ├── FilterBar.tsx    # Date, label, rating, folder filters
│   │   │   ├── PhotoGrid.tsx    # Virtualized grid of thumbnails
│   │   │   ├── PhotoCard.tsx    # Single thumbnail with overlay badges
│   │   │   ├── TimelineView.tsx # Date-grouped grid
│   │   │   ├── MapView.tsx      # Leaflet map with clusters
│   │   │   ├── LoupeView.tsx    # Full-screen preview overlay
│   │   │   ├── ExportPanel.tsx  # Export dialog
│   │   │   └── RatingStars.tsx  # Reusable star rating component
│   │   └── styles/
│   │       └── globals.css      # Tailwind config + dark theme vars
│   ├── index.html
│   ├── tailwind.config.ts
│   ├── vite.config.ts
│   ├── tsconfig.json
│   └── package.json
│
├── README.md
└── Makefile                     # Convenience commands: make index, make serve, make dev
```

---

## Part 5 — Build Order

Build and test in this sequence:

### Phase 1 — Indexer + DB (backend only)
1. Set up `pyproject.toml` and install deps
2. Implement `db.py` — schema creation, insert/update/query functions
3. Implement `exif_utils.py` — EXIF date parsing, GPS DMS→decimal, safe extraction
4. Implement `indexer.py` — directory walk, file type detection, rawpy preview extraction, Pillow resize, write thumbs + DB rows
5. Implement `cli.py` — `index` command with `--source`, `--db`, `--thumbs`, `--incremental` flags
6. **Test:** Run against a real folder of ~100 photos on the NAS. Verify DB has correct metadata, thumbnails look right.

### Phase 2 — API Server
1. Implement `server.py` — all endpoints listed above
2. Serve thumbnail files as static
3. Wire up `serve` CLI command
4. **Test:** Use `curl` or httpie to hit endpoints, confirm filtering/pagination works

### Phase 3 — Frontend core (Grid + Loupe)
1. Scaffold Vite + React + TS + Tailwind
2. Build `PhotoGrid` with virtualization, loading from API
3. Build `PhotoCard` with overlay badges
4. Build `LoupeView` with keyboard navigation and rating/label shortcuts
5. Build `FilterBar` with date range, label chips, rating slider
6. **Test:** Browse and cull photos in the grid view

### Phase 4 — Timeline + Map views
1. Build `TimelineView` — date-grouped grid with sticky headers
2. Build `MapView` — Leaflet + marker clusters + thumbnail popups
3. **Test:** Verify map shows GPS-tagged photos correctly, clusters work

### Phase 5 — Export + Polish
1. Build `ExportPanel` — filter summary, copy or list export
2. Implement backend export endpoint (file copy + list generation)
3. Add bulk select and bulk actions
4. Polish: loading states, error handling, empty states, responsive layout
5. **Test:** End-to-end — index NAS folder → browse → cull → export → import to Lightroom

---

## Key UX Details

- **Speed is everything.** Thumbnails are pre-extracted and served locally. The browser never touches the NAS directly. Grid scrolling should feel instant.
- **Keyboard shortcuts match Lightroom conventions** where possible (1-5 for ratings, P for pick, X for reject) so muscle memory transfers.
- **Rejected photos are hidden by default** but can be toggled visible. This keeps the grid clean as you cull.
- **The map view is the killer feature** for trip/travel photography — see all your shots from a location, select a cluster, and bulk-flag them.
- **Export is deliberately simple** — a folder of files or a text list. No proprietary catalog. Lightroom handles the rest.
