# Technical Documentation — 3D Change Detection Viewer

---

## Table of contents

0. [System overview](#0-system-overview)
1. [Architecture overview](#1-architecture-overview)
2. [Frontend — React + CesiumJS](#2-frontend--react--cesiumjs)
3. [Project management UI](#3-project-management-ui)
4. [Analysis view — compare mode](#4-analysis-view--compare-mode)
5. [Analysis view — timeline mode](#5-analysis-view--timeline-mode)
6. [Polygon area filter](#6-polygon-area-filter)
7. [Voxel diff algorithm](#7-voxel-diff-algorithm)
8. [Backend API](#8-backend-api)
9. [Database layer](#9-database-layer)
10. [Configuration reference](#10-configuration-reference)
11. [Known limitations and future work](#11-known-limitations-and-future-work)

---

## 0. System overview

### 🗺️ 3D visualization
- Cesium-based 3D globe with Korean terrain (ion asset 4807084)
- Load 3D mesh (3D Tiles) or point cloud data per survey date
- Basemap thumbnail picker: Bing Maps (Aerial, Aerial + Labels, Roads), Google Maps (Satellite, Satellite + Labels, Roadmap, Contour), OSM, Dark Map, Globe Only
- Terrain toggle inside the basemap panel (not a separate control)

### 📅 Survey management
- Multiple sites (physical locations / projects)
- Multiple survey dates per site
- Each date has exactly **one dataset** — either a 3D mesh or a point cloud (independently configurable per date)

### 🗂️ Project management
- **Project Launcher** — full-screen page shown on the Projects tab; site cards + "New project" button
- **New Project modal** — create a site from scratch (ID, display labels, camera position) via `POST /api/sites`
- **Data Upload tab** — lists all survey dates for the active site; each date has one upload slot with a type selector (Point Cloud / 3D Mesh) and a drag-drop zone

### 🔄 Change detection (core feature)
- **A vs B compare mode** — select two dates, run a server-side voxel diff, visualise added and removed volumes as coloured 3D boxes
- **Timeline mode** — scrub through pre-computed diff snapshots across all consecutive date pairs with a play/pause timeline bar
- Area polygon filter — restrict computation to a drawn geographic region
- Results: volume in m³, voxel count, net change

### 🎛️ Layer controls
- Left panel: site info card + date list (click to toggle the layer on/off) + camera buttons
- Right panel: A/B date selectors with colour tint + opacity sliders, analysis controls (draw area, voxel size, run/clear diff), results + statistics
- Floating: basemap thumbnail grid + terrain toggle; point cloud size slider when active date is a point cloud

### ⌨️ Keyboard shortcuts
| Key | Action |
|---|---|
| `A` | Toggle added voxels |
| `R` | Toggle removed voxels |
| `D` | Draw polygon area |
| `M` | Toggle active date layer |
| `1` | Site camera |
| `2` | Top-down camera |
| `← →` | Step through timeline |
| `Space` | Play / pause timeline |

---

## 1. Architecture overview

```
┌─────────────────────────────────────────────────┐
│  Browser                                        │
│                                                 │
│  React (App.jsx)                                │
│    ↕ state / callbacks                          │
│  Cesium layer (cesiumInit, layers, polygonDraw) │
│    ↕ imperative Cesium API                      │
│  CesiumJS globe                                 │
│                                                 │
│  diff.js ──── POST /api/diff ──────────────────►│
└─────────────────────────────────────────────────┘
                                                  │
┌─────────────────────────────────────────────────┤
│  FastAPI server                                 │
│                                                 │
│  /api/sites  ←── reads DB                      │
│  /api/diff   ←── reads .glb from disk          │
│                  runs numpy voxelization         │
│                  returns voxel list as JSON     │
│                                                 │
│  SQLite (metadata only)                         │
│  public/data/ (tile files — on disk)            │
└─────────────────────────────────────────────────┘
```

**Note:** The database stores metadata only (site names, camera positions, paths to tile files). The actual 3D tile data (`.glb`, `tileset.json`) lives on disk inside `public/data/` and is served statically by Vite in development.

Heavy computation (GLB parsing, voxelization, diff) runs on the Python server using NumPy.

---

## 2. Frontend — React + CesiumJS

### State management

All UI state lives in `App.jsx` as React `useState`. No external state library is used. The pattern is:

```
User action → React state update → useEffect → imperative Cesium call
```

Cesium is entirely imperative — it owns the `<div id="cesiumContainer">` and React never re-renders it. React controls the panel UI and calls functions in `cesiumInit.js` / `layers.js` as side effects.

### File responsibilities

| File | Responsibility |
|---|---|
| `App.jsx` | All UI state, event handlers, orchestrates everything |
| `config.js` | Ion token, visual defaults, terrain settings |
| `diff.js` | Calls `/api/diff`, manages cancellation, stores results in `window.diffState` |
| `TimelineDiffs.js` | Loads and caches pre-computed diff snapshots per site |
| `cesium/cesiumInit.js` | Creates the Cesium viewer; exposes `flyTo`, `toast`, `requestRender`, `setBasemap`, `setTerrainVisible` |
| `cesium/layers.js` | Loads tilesets, controls visibility via `syncVisibility()`, renders voxel boxes |
| `cesium/polygonDraw.js` | Interactive polygon drawing tool; exposes `togglePolygonDraw`, `getPolygonGeo`, `setPolygonVisible` |
| `components/NavBar.jsx` | Top navigation bar: tabs (Projects / Upload / Analysis) + active site chip |
| `components/MapSubHeader.jsx` | Sub-header bar below NavBar: "A vs B 비교" / "시계열 변화탐지" mode tabs + dataset labels |
| `components/Panel.jsx` | Left sidebar: selected project info, date toggle list, camera buttons |
| `components/RightPanel.jsx` | Right sidebar: compare controls (A/B dates, tint, opacity), analysis settings (draw area, voxel size, run/clear), results + stats; or `TimelinePanel` in timeline mode |
| `components/MapOverlayControls.jsx` | Floating top-right: thumbnail basemap picker (grid), terrain toggle, point cloud size slider |
| `components/BottomBar.jsx` | Fixed bottom: status, legend, keyboard shortcuts, coordinates; wraps `TimelineBar` |
| `components/TimelineBar.jsx` | Proportional timeline scrubber with play/pause, step buttons, date markers |
| `components/TimelinePanel.jsx` | Right panel content in timeline mode: snapshot list, stats, toggles |
| `components/ProjectLauncher.jsx` | Full-screen project selection page; site cards + new project button |
| `components/DataUploadPage.jsx` | Data upload tab: date list with per-date upload (type selector + drag-drop zone) and new date creation |
| `components/NewProjectModal.jsx` | Modal for creating a new site (ID, labels, camera position) |
| `components/DrawBanner.jsx` | Banner overlay shown during polygon drawing with cancel button |
| `components/Toasts.jsx` | Auto-dismissing toast notification stack |

### Visibility rules

Enforced by `syncVisibility(mode, checkboxState)` in `layers.js`. Called whenever the mode tab or any visibility checkbox changes.

| Layer | Visible when |
|---|---|
| `state.mesh` | View date active AND dataset toggle ON |
| `state.pc` | View date active AND dataset toggle ON |
| `state.meshA` | Compare mode AND Date A toggle ON |
| `state.meshB` | Compare mode AND Date B toggle ON |
| `state.diffPrim` | Compare mode (filtered by added/removed toggles) OR timeline mode |

Switching tabs never loads or unloads data — only the `show` flag on already-loaded tilesets changes. Diff voxels persist across mode switches until explicitly cleared.

### Basemap switcher

`setBasemap(id)` in `cesiumInit.js` swaps the imagery layer at runtime. The `ION_ASSETS` map is the single source of truth for ion asset IDs — add or remove entries there to change the catalogue without touching `MapOverlayControls.jsx`.

| ID | Provider | Source |
|---|---|---|
| `aerial` | Bing Maps Aerial | ion asset 2 |
| `aerial_labels` | Bing Maps Aerial with Labels | ion asset 3 |
| `roads` | Bing Maps Roads | ion asset 4 |
| `gmaps_sat` | Google Maps 2D Satellite | ion asset 3830182 |
| `gmaps_sat_labels` | Google Maps 2D Satellite with Labels | ion asset 3830183 |
| `gmaps_road` | Google Maps 2D Roadmap | ion asset 3830184 |
| `gmaps_contour` | Google Maps 2D Contour | ion asset 3830186 |
| `osm` | OpenStreetMap | tile.openstreetmap.org (no ion) |
| `dark` | OSM darkened | OSM with brightness 0.3 / contrast 1.8 |
| `none` | Globe only | no imagery layer |

All ion-backed options require the asset to be present in your Cesium ion account. The Google Maps assets (3830182–3830186) may require terms acceptance in the ion dashboard on first use.

### Terrain toggle

`setTerrainVisible(show)` swaps the terrain provider at runtime:
- ON → Cesium World Terrain (ion asset 4807084 — Korean terrain dataset)
- OFF → `EllipsoidTerrainProvider` (smooth reference ellipsoid, useful to see data that would be clipped by terrain)

---

## 3. Project management UI

### Navigation tabs

The `NavBar` shows three tabs. The Upload and Analysis tabs are disabled until a project is selected.

| Tab | Content |
|---|---|
| 프로젝트 | `ProjectLauncher` — full-screen site selection page |
| 데이터 업로드 | `DataUploadPage` — upload/replace datasets per date |
| 변화탐지 | Analysis view — Cesium map + left/right panels + bottom bar |

When the Projects or Upload tab is active the Cesium map is hidden (`cesium-hidden` class) — only the tab content fills the screen.

### ProjectLauncher

Full-screen page shown on the Projects tab.

- Displays all sites as cards showing survey count, date range, and status badge
- A **+ 새 프로젝트** button opens `NewProjectModal`
- Clicking a site card calls `handleOpenProject(site)` in `App.jsx`, which clears the scene, resets state, and switches to the Analysis tab

### NewProjectModal

Fields for creating a new site:

| Field | Description |
|---|---|
| Site ID | Short lowercase ASCII key (e.g. `mysite`) — used in file paths |
| Label | Full display label, may include Korean characters |
| English label | Used in status messages |
| Longitude / Latitude | Camera home position |
| Camera height (m) | Altitude of the initial fly-to |

Calls `POST /api/sites`. On success, refreshes the site list and auto-opens the new project.

### DataUploadPage

Shown on the Upload tab. Lists all survey dates for the active site.

Each date row shows:
- Date label + code
- Dataset type badge (3D Mesh / Point Cloud / 미업로드)
- Expand to upload: type selector (Point Cloud ↔ 3D Mesh) + drag-drop zone

**+ 새 날짜 추가** card at the bottom lets you create a new date and optionally upload its dataset in one step.

Accepts either a folder (via `webkitRelativePath`) or a single `.zip` file. The server discovers `tileset.json` inside the uploaded content and stores its relative path.

---

## 4. Analysis view — compare mode

In compare mode the user selects two survey dates (A = before, B = after) and runs a volumetric diff.

### Left panel (Panel.jsx)

- **선택된 프로젝트** — site info card: name, survey count, date range, status
- **관측 데이터** — list of all dates; click any date to load/unload it as the background layer
- **카메라** — Site view and Top-down buttons

### Right panel — compare controls (RightPanel.jsx)

**날짜 비교 section:**
- Date A selector + colour picker for tint
- Opacity slider for Date A
- Date B selector + colour picker for tint
- Opacity slider for Date B

**분석 설정 section:**
- Draw Area button — activates polygon drawing tool
- Voxel size input (metres)
- Run diff / Clear buttons + status message

**분석 결과 section:**
- Added volume toggle (checkbox + ADD badge)
- Removed volume toggle (checkbox + REM badge)
- Stats table: added volume (m³), removed volume (m³), net change, resolution

### Diff voxels

After running a diff, coloured 3D boxes are rendered over the map:
- **Red boxes** — material added between A and B (present in B, absent in A)
- **Blue boxes** — material removed between A and B (present in A, absent in B)

Rendered as a single `Cesium.Primitive` with `PerInstanceColorAppearance`. Persist across mode switches until cleared.

---

## 5. Analysis view — timeline mode

Timeline mode scrubs through pre-computed diff snapshots across all consecutive date pairs.

### How it works

1. Switching to "시계열 변화탐지" triggers `loadDiffSnapshots(site)` in `TimelineDiffs.js`
2. Snapshots are cached in memory per site (invalidated on explicit recompute)
3. The active snapshot's voxels are passed to `renderVoxelDiff()` — the same renderer as compare mode
4. The timeline bar and right panel update to show the active snapshot's stats

### TimelineBar (BottomBar area)

A proportional scrubber positioned above the bottom bar:
- Date markers spaced by real timestamps
- Draggable scrubber + click-to-seek
- Play / Pause with 2.5 s auto-advance
- Step buttons (‹ ›) and snapshot counter

### Dummy mode

`TimelineDiffs.js` has a `USE_DUMMY = true` flag for development. When set, it generates synthetic snapshots from the site's dates so the timeline UI works without a real backend endpoint. Set `USE_DUMMY = false` and implement `GET /api/sites/{site_id}/diffs` to connect real data.

---

## 6. Polygon area filter

Drawing a polygon restricts the diff computation to a specific geographic area. Without a polygon the diff runs on the full extent of both point clouds.

### Drawing workflow

1. Click **✏ Draw Area** in the Analysis settings section
2. The camera flies top-down to the active site
3. A drawing banner appears at the top of the map
4. **Left-click** to add vertices — a live yellow dashed outline updates as you draw
5. **Right-click** or **double-click** to close the polygon (minimum 3 vertices)
6. The button label changes to **✕ Clear Area**
7. Click **⚡ 차이 계산** — the polygon coordinates are sent with the diff request
8. Click **✕ Clear Area** to discard the polygon

### Implementation

`polygonDraw.js` maintains a private `_poly` object:

```
_poly.pts  — Cesium.Cartesian3[] picked from the globe surface
_poly.geo  — [{lon, lat}] degrees — sent to the server as the polygon filter
```

The polygon is drawn using two live Cesium entities with `CallbackProperty` (outline + fill), updating continuously as vertices are added without recreating entities.

`getPolygonGeo()` returns `_poly.geo` when the polygon is closed, or `null` otherwise.

Switching to timeline mode hides the polygon entities (`setPolygonVisible(false)`) without destroying them; returning to compare mode restores them.

---

## 7. Voxel diff algorithm

The diff runs entirely on the server. The browser only renders the resulting voxel list.

### Step 1 — Parse point clouds

`glb_parser.py` reads every `.glb` tile listed in `tileset.json` from disk. Each tile is parsed with NumPy:

1. Read `POSITION` accessor — `uint16`, normalised (÷ 65535), stride 8 bytes
2. Apply `PointCloudNode` matrix (column-major 4×4) → local glTF world space
3. Add `RootNode` translation → glTF scene space (Y-up)
4. Swap axes for ECEF Z-up: `ecef = (gx, −gz, gy)`
5. Convert ECEF → geodetic `(lon°, lat°, h m)` via Bowring iterative method (10 iterations)

> **Current limitation:** only point cloud GLB files (mago3d-tiler output) are supported. 3D mesh tilesets cannot yet be used as a diff input.

### Step 2 — Build sparse surface maps

`build_surface()` bins every geodetic point into a voxel grid:

```
iLon = floor(lon / lonStep)
iLat = floor(lat / latStep)
iH   = floor(h   / hStep)
key  = f"{iLon},{iLat},{iH}"
```

Grid steps are computed from the average latitude so each voxel is approximately cubic in metres regardless of location. Points outside the polygon are discarded before binning.

### Step 3 — Solidify columns

Point clouds only scan surfaces. `solidify()` fills each surface shell into a solid volume:

For each `(iLon, iLat)` column:
- Find `minH` and `maxH` — lowest and highest occupied voxel
- `colFloor = min(minH_A, minH_B)` — per-column floor (prevents global outlier contamination)
- Fill every voxel from `colFloor` to `maxH`

### Step 4 — Compute diff

```python
added   = keys in solid_B but not in solid_A   # material appeared
removed = keys in solid_A but not in solid_B   # material disappeared
```

Each result voxel carries its `(iLon, iLat, iH)` indices. The browser reconstructs coordinates:

```js
lon = (iLon + 0.5) * lonStep
lat = (iLat + 0.5) * latStep
h   = (iH   + 0.5) * hStep
```

### Volume statistics

```
Added volume   = count_added   × voxSize³  m³
Removed volume = count_removed × voxSize³  m³
Net change     = added − removed
```

---

## 8. Backend API

Base URL: `http://127.0.0.1:8000` (configurable via `VITE_API_URL` env var)

### `GET /health`

```json
{ "status": "ok", "data_root": "/absolute/path/to/public/data" }
```

### `GET /api/sites`

Returns all sites and their survey dates.

```json
{
  "sites": [
    {
      "id": "dunpo",
      "label": "둔포면 — Waste Site",
      "labelEn": "Dunpo-myeon",
      "meshZOffset": null,
      "camera": { "lon": 127.0071, "lat": 36.9102, "height": 600 },
      "dates": [
        {
          "id": "251106",
          "label": "Nov 6, 2025",
          "datasetPath": "data/dunpo/251106/tiles/tileset.json",
          "datasetType": "pointcloud"
        }
      ]
    }
  ]
}
```

### `POST /api/sites`

Creates a new site.

**Request body:**
```json
{
  "id":            "mysite",
  "label":         "My Site — Waste Site",
  "label_en":      "My Site",
  "camera_lon":    127.0067,
  "camera_lat":    36.9099,
  "camera_height": 600
}
```

Returns 409 if the ID already exists.

### `POST /api/sites/{site_id}/dates`

Creates a new survey date.

**Request body:**
```json
{
  "date_code":    "260601",
  "label":        "Jun 1, 2026",
  "dataset_type": "pointcloud"
}
```

`dataset_type` must be `"mesh"` or `"pointcloud"`. Returns 409 if the date already exists for that site.

### `POST /api/sites/{site_id}/dates/{date_code}/upload`

Uploads the dataset for a date. Optional `?dataset_type=mesh|pointcloud` query param updates the stored type.

Accepts:
- A **single `.zip` file** containing `tileset.json` + `.glb` files
- **Raw folder files** via `webkitRelativePath` (browser folder drag-and-drop)

Both flat and nested `tileset.json` locations are handled. Existing data is replaced.

**Response:**
```json
{
  "ok": true,
  "dataset_path": "data/dunpo/260601/tiles/tileset.json",
  "dataset_type": "pointcloud"
}
```

### `POST /api/diff`

Runs the full voxel diff pipeline.

**Request body:**
```json
{
  "job_id":   "uuid-generated-client-side",
  "path_a":   "data/dunpo/251106/tiles/tileset.json",
  "path_b":   "data/dunpo/251209/tiles/tileset.json",
  "vox_size": 0.5,
  "polygon": [
    { "lon": 127.005, "lat": 36.909 },
    { "lon": 127.007, "lat": 36.909 },
    { "lon": 127.007, "lat": 36.911 },
    { "lon": 127.005, "lat": 36.911 }
  ]
}
```

`polygon` is optional — omit for full-extent diff.

**Response:**
```json
{
  "job_id":   "...",
  "vox_size": 0.5,
  "clipped":  true,
  "grid_def": { "lon_step": 0.0000045, "lat_step": 0.0000045, "h_step": 0.5 },
  "added":    [{ "iLon": 12345, "iLat": 67890, "iH": 48, "type": "added" }],
  "removed":  [{ "iLon": 12345, "iLat": 67890, "iH": 52, "type": "removed" }],
  "stats":    { "added_count": 142, "removed_count": 891, "net": -749 }
}
```

### `POST /api/diff/cancel/{job_id}`

Signals the server to stop a running computation. The cancel flag is checked between pipeline stages. The browser also aborts the fetch immediately via `AbortController`.

```
Browser                          Server
  │  POST /api/diff  ───────────► starts computation in thread pool
  │
  │  user clicks "Clear"
  │
  │  POST /api/diff/cancel/{id} ► sets cancel_flags[id] = True
  │  _abortController.abort()     thread exits at next checkpoint
  │
  │  fetch throws AbortError
  │  → status: "Computation cancelled"
```

---

## 9. Database layer

> **Planned migration:** The local SQLite database will be replaced with calls to a shared backend API. Only `DATABASE_URL` in `.env` and the `/api/sites` endpoint in `main.py` need to change when that happens.

### Schema

```
sites
  id            TEXT  PRIMARY KEY          e.g. "dunpo"
  label         TEXT                       "둔포면 — Waste Site"
  label_en      TEXT                       "Dunpo-myeon"
  camera_lon    REAL
  camera_lat    REAL
  camera_height REAL
  mesh_z_offset REAL  NULLABLE
  created_at    DATETIME

survey_dates
  id            TEXT  PRIMARY KEY          e.g. "dunpo_251106"
  site_id       TEXT  FK → sites.id
  date_code     TEXT                       "251106"
  label         TEXT                       "Nov 6, 2025"
  dataset_path  TEXT  NULLABLE             relative URL to tileset.json
  dataset_type  TEXT  NULLABLE             "mesh" | "pointcloud"
  created_at    DATETIME
```

### Seeding

`seed.py` reads `public/data/` and inserts a row for each site/date it finds. Safe to re-run (existing rows are skipped).

### Migrations

```bash
alembic upgrade head

# After editing models.py:
alembic revision --autogenerate -m "description"
alembic upgrade head
```

### Planned: migration to shared API

When the  database is ready, the transition is:

1. Remove `database.py`, `models.py`, `seed.py`, and Alembic from the server
2. Replace the `GET /api/sites` endpoint in `main.py` with an HTTP call to the  API:

```python
@app.get("/api/sites")
async def list_sites():
    res = await httpx.get("https://api.example.com/sites")
    return res.json()
```

3. All other server code (GLB parsing, voxelization, `/api/diff`) remains unchanged

---

## 10. Configuration reference

### `src/config.js`

| Key | Default | Description |
|---|---|---|
| `ION_TOKEN` | — | Cesium ion token (required for terrain + Bing basemaps) |
| `DEFAULTS.SHOW_DATASET` | `true` | Initial dataset layer visibility |
| `DEFAULTS.POINT_SIZE` | `1` | Initial point cloud attenuation size |
| `DEFAULTS.SHOW_ADDED` | `true` | Initial visibility of added voxels |
| `DEFAULTS.SHOW_REMOVED` | `true` | Initial visibility of removed voxels |
| `DEFAULTS.VOXEL_SIZE` | `0.5` | Default voxel size in metres |
| `DEFAULTS.MESH_Z_OFFSET` | `200.0` | Global fallback Z offset for mesh alignment |
| `TERRAIN.ENABLED` | `true` | Whether to load Cesium World Terrain on startup |
| `TERRAIN.ASSET_ID` | `4807084` | ion asset ID for the Korean terrain dataset |
| `DIFF_COLORS.ADDED` | `#ff4d4d` | Colour for added voxels |
| `DIFF_COLORS.REMOVED` | `#4d9fff` | Colour for removed voxels |

### `server/.env`

| Variable | Default | Description |
|---|---|---|
| `HOST` | `127.0.0.1` | Server bind address |
| `PORT` | `8000` | Server port |
| `ALLOWED_ORIGINS` | `http://localhost:5173` | CORS allowed origins (comma-separated) |
| `DATA_ROOT` | `./public/data` | Path to tile data folder |
| `DATABASE_URL` | `sqlite+aiosqlite:///./3dchange_detection.db` | SQLAlchemy async DB URL |

### Frontend API URL

Create `.env.local` in the frontend root:

```
VITE_API_URL=http://127.0.0.1:8000
```

---

## 11. Known limitations and future work

### Current limitations

**Mixed-type diff not supported** — both datasets sent to `/api/diff` must be point clouds (mago3d-tiler GLB format). Diffing a mesh against a point cloud, or mesh against mesh, is not yet implemented. Until the voxelizer supports mesh input, always use point cloud datasets for the dates you intend to diff.

**Voxel accuracy** — Column-fill solidification over-estimates volume for concave or overhanging shapes (e.g. a pile with a hollow underneath).

**Single-threaded diff per request** — Each `/api/diff` request runs in one thread. Large point clouds at fine voxel sizes (< 0.3 m) can take several minutes.

**Timeline dummy mode** — `TimelineDiffs.js` uses `USE_DUMMY = true` and generates synthetic snapshot data. Set to `false` and implement `GET /api/sites/{site_id}/diffs` on the server to use real pre-computed diffs.

**Mesh Z offset** — The global `DEFAULTS.MESH_Z_OFFSET` value is a coarse fallback. The per-site value from the database takes priority. The offset UI has been removed; values must be set directly in the database or via seed.py.

### Planned improvements

- **Mixed-type diff** — extend the voxelizer to accept mesh tilesets as input so any two datasets can be compared regardless of type
- **Pre-computed diffs** — run the voxel diff server-side when a new survey is uploaded and expose results via `GET /api/sites/{site_id}/diffs`; eliminates the on-demand wait time
- **Shared database** — migrate from local SQLite to shared PostgreSQL
- **Side-by-side view** — optional split-screen slider to compare two dates visually without a diff computation
- **Voxelized tiles toggle** — option to visualise the raw voxelized representation of a dataset (not just the diff result)
- **Improved reporting** — exportable per-date comparison summaries
- **Fast vs accurate diff** — user choice between a quick estimated diff (server-side column voxelizer) and a slower but more accurate method (dedicated backend voxelizer)