# Technical Documentation — 3D Change Detection Viewer

---

## Table of contents

0. [System overview / Functionalities](#0-system-overview)
1. [Architecture overview](#1-architecture-overview)
2. [Frontend — React + CesiumJS](#2-frontend--react--cesiumjs)
3. [View mode](#3-view-mode)
4. [Compare mode](#4-compare-mode)
5. [Polygon area filter](#5-polygon-area-filter)
6. [Voxel diff algorithm](#6-voxel-diff-algorithm)
7. [Backend API](#7-backend-api)
8. [Database layer](#8-database-layer)
9. [Configuration reference](#9-configuration-reference)
10. [Known limitations and future work](#10-known-limitations-and-future-work)

---

## 0. System Overview / Functionalities

### 🗺️ 3D visualization
- Render Cesium-based 3D globe
- Load:
  - 3D mesh (3D Tiles)
  - Point cloud data
  - Terrain (Cesium World Terrain)
- Switch between **View mode** and **Compare mode**

### 📅 Survey management
- Multiple sites (locations/projects)
- Multiple survey dates per site
- Select and switch datasets dynamically

### 🔄 Change detection (core feature)
- Select two survey dates (A = before, B = after)
- Run voxel-based comparison
- Compute:
  - Added material
  - Removed material
  - Net volume change
- Visualize results as 3D voxel blocks

### ✏️ Area-based analysis
- Draw polygon on map to limit analysis area
- Run diff only inside selected region
- Optional full-area computation if no polygon is defined

### 📊 Results & statistics
- Volume change in cubic meters (m³)
- Voxel count statistics
- Net change summary
- Visual classification (added vs removed)

### 🎛️ Layer control system
- Toggle:
  - Mesh visibility
  - Point cloud visibility
  - Terrain
  - Date A / Date B layers
  - Added / Removed voxels
- Adjust:
  - Opacity per dataset
  - Point cloud size
  - Color tint per dataset

### ⌨️ Interaction system
- Keyboard shortcuts for fast navigation:
  - Toggle layers (M, P, A, R)
  - Switch modes (V, C)
  - Camera views (1, 2, 3)
  - Drawing mode (D)

### 📤 Export & backend integration (planned + partial)
- REST API-based architecture
- Diff computation on backend (Python + NumPy)

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
│  SQLite / PostgreSQL (metadata only)            │
│  public/data/ (tile files — on disk)            │
└─────────────────────────────────────────────────┘
```

Note 1: The (temporary) database stores **metadata only** (site names, camera positions, paths to tile files). The actual 3D tile data (`.glb` files, `tileset.json`) stays on disk inside `public/data/` and is served statically by Vite in development or a static host in production.

Note 2: Heavy computation (GLB parsing, voxelization, diff) runs on the Python server using NumPy — not in the browser — to avoid memory and CPU limits.

---

## 2. Frontend — React + CesiumJS

### State management

All UI state lives in `App.jsx` as React `useState`. No external state library is used. The pattern is:

```
User action → React state update → useEffect → imperative Cesium call
```

Cesium is entirely imperative — it owns the `<div id="cesiumContainer">` and React never re-renders it. React only controls the panel UI and calls functions in `cesiumInit.js` / `layers.js` as side effects.

### File responsibilities

| File | Responsibility |
|---|---|
| `App.jsx` | All UI state, event handlers, orchestrates everything |
| `config.js` | Ion token, visual defaults, terrain settings |
| `diff.js` | Calls `/api/diff`, stores results in `window.diffState`, triggers re-render |
| `cesium/cesiumInit.js` | Creates the Cesium viewer, exposes `flyTo`, `toast`, `requestRender` |
| `cesium/layers.js` | Loads tilesets, controls visibility, renders voxel boxes |
| `cesium/polygonDraw.js` | Interactive polygon tool, exposes `togglePolygonDraw`, `getPolygonGeo` |
| `lib/glbParser.js` | Browser-side GLB parser (not used when server is running) |
| `lib/voxelizer.js` | Browser-side voxelizer (not used when server is running) |
| `lib/polygonUtils.js` | Pure `pip()` function — point-in-polygon ray casting |

### Visibility rules

Enforced by `syncVisibility(mode, checkboxState)` in `layers.js`. Called whenever the mode tab or any visibility checkbox changes.

| Layer | Visible when |
|---|---|
| `state.mesh` | mesh toggle ON |
| `state.pc` | point cloud toggle ON |
| `state.meshA` | Compare tab AND Date A toggle ON |
| `state.meshB` | Compare tab AND Date B toggle ON |
| `state.diffPrim` | filtered by chk-added / chk-removed |

Switching tabs never loads or unloads data — it only changes the `show` flag on already-loaded tilesets. The diff voxel boxes persist across tab switches.

### Terrain toggle

`setTerrainVisible(show)` in `cesiumInit.js` swaps the terrain provider at runtime:
- ON → Cesium World Terrain (ion asset 4807084 — Korean terrain dataset)
- OFF → `EllipsoidTerrainProvider` (smooth reference ellipsoid)

The terrain toggle is in the View mode Layers panel. Switching it does not reload any mesh or point cloud data. Allows to see full mesh or point cloud if partially inside the terrain

---

## 3. View mode

In View mode the user selects one survey date and sees its 3D mesh and/or point cloud.

### Loading a date

`loadDate(site, dateObj, mode, checkboxState)` in `layers.js`:
1. Removes any previously loaded `state.mesh` and `state.pc`
2. Fetches and adds both tilesets to `viewer.scene.primitives`
3. Applies a Z offset to the mesh tileset so it sits on the terrain surface (`CONFIG.DEFAULTS.MESH_Z_OFFSET`)
4. Calls `syncVisibility()` with the current mode and checkbox state

The mesh Z offset is a global constant in `config.js` **(needs to modified to be dependent of the site and adjustable for new sites)**. It compensates for the fact that mago3d-tiler outputs coordinates relative to a local origin, not absolute terrain height. Tune this value until the mesh visually aligns with the terrain surface.

### Layer controls

| Control | Effect |
|---|---|
| 3D Mesh toggle | Shows/hides `state.mesh` |
| Point Cloud toggle | Shows/hides `state.pc` |
| Point cloud size slider | Sets `pointCloudShading.maximumAttenuation` |
| Terrain toggle | Swaps terrain provider |

### Camera buttons

| Button | Behaviour |
|---|---|
| ↗ Site | Flies to site's configured lon/lat at −40° pitch |
| ↓ Top | Flies to site at −90° pitch (plan view) |

---

## 4. Compare mode

In Compare mode the user selects two survey dates (A = before, B = after) and runs a volumetric diff to visualise material added or removed between surveys.

### What is loaded

The layers in the view mode keep loaded for visual display in compare mode. The diff computation uses the point clouds fetched server-side directly from disk.

- Date A mesh: tinted amber (`rgba(212, 144, 80, alpha)`)
- Date B mesh: tinted blue (`rgba(77, 159, 255, alpha)`)

Tint colour and opacity are configurable per-dataset with a colour picker and slider in the Datasets section of the panel.

### Dataset visibility toggles

Each of Date A and Date B has an independent visibility toggle. Hiding a dataset hides only its mesh — the diff voxels are controlled separately by the Added/Removed toggles.

### Diff voxels

After running a diff, coloured 3D boxes are rendered on top of the meshes:
- **Red boxes** — material added between date A and date B (present in B, absent in A)
- **Blue boxes** — material removed between date A and date B (present in A, absent in B)

Voxel boxes are rendered as `Cesium.Primitive` instances with `PerInstanceColorAppearance`. They persist across tab switches (View ↔ Compare) until explicitly cleared.

### Clear comparison

The "✖ Clear comparison" button calls `clearCompareLayers()` which removes `state.meshA`, `state.meshB`, and `state.diffPrim` from the scene. `state.mesh` and `state.pc` (view mode layers) are **not** affected.

If a diff is in progress when Clear is clicked, `cancelVoxelDiff()` sends a cancel request to the server and safely aborts the fetch.

---

## 5. Polygon area filter

Drawing a polygon restricts the diff computation to a specific geographic area. Without a polygon the diff runs on the full extent of both point clouds.

### Drawing workflow

1. Click **✏ Draw Area** in the Compare panel
2. The camera flies top-down to the active site (same as clicking the Top button)
3. Date A's mesh loads as a visual reference
4. A drawing banner appears on the map with instructions
5. **Left-click** on the map to place vertices — a live yellow dashed outline updates as you draw
6. **Right-click** or **double-click** to close the polygon
7. The button label changes to **✕ Clear Area**
8. Click **⚡ Run diff** — the polygon is sent to the server with the request
9. Click **✕ Clear Area** to discard the polygon and return to full-extent mode

### Implementation

`polygonDraw.js` maintains a private `_poly` object:

```
_poly.pts  — Cesium.Cartesian3[] picked from the globe surface
_poly.geo  — [{lon, lat}] degrees — sent to the server as the polygon filter
```

The polygon is drawn using two live Cesium entities with `CallbackProperty` so the outline and fill update continuously as vertices are added without re-creating entities.

`getPolygonGeo()` returns `_poly.geo` if the polygon is closed, or `null` if not — this is what `diff.js` sends to the server.

The server applies a vectorised point-in-polygon test (`voxelizer.py → _pip()`) to every point before voxelizing, discarding points outside the polygon.

---

## 6. Voxel diff algorithm

The diff runs entirely on the server. The browser only renders the resulting voxel list.

### Step 1 — Parse point clouds

`glb_parser.py` reads every `.glb` tile listed in `tileset.json` directly from disk **(needs to be changed to API request to database later)**. Each tile is parsed with NumPy:

1. Read `POSITION` accessor — `uint16`, normalised (÷65535), stride 8 bytes
2. Apply `PointCloudNode` matrix (column-major 4×4) → local glTF world space
3. Add `RootNode` translation → glTF scene space (Y-up)
4. Swap axes for ECEF Z-up: `ecef = (gx, −gz, gy)`
5. Convert ECEF → geodetic `(lon°, lat°, h m)` via Bowring iterative method (10 iterations, mm accuracy)

### Step 2 — Build sparse surface maps

`build_surface()` bins every geodetic point into a voxel grid:

```
iLon = floor(lon / lonStep)
iLat = floor(lat / latStep)
iH   = floor(h   / hStep)
key  = f"{iLon},{iLat},{iH}"
```

Grid steps are computed from the average latitude so each voxel is approximately cubic in metres regardless of location.

Points outside the polygon are discarded before binning.

The result is a sparse dict of occupied voxel keys — the surface shell of the point cloud.

### Step 3 — Solidify columns

Point clouds only scan surfaces — a pile appears as a thin shell, not a solid object. Diffing two shells directly gives wrong results (floor appears as "added" because it was hidden under the pile in date A).

`solidify()` converts each shell into a solid volume:

For each `(iLon, iLat)` column:
- Find `minH` and `maxH` — lowest and highest voxel in that column
- Fill every voxel from `floor` to `maxH`

The **floor** is per-column, not global. `colFloor[col] = min(minH_A, minH_B)` — the lowest point that column has in either dataset. This prevents a single noisy outlier in one column dragging the fill floor down for every other column (which produced underground boxes in the global-floor approach).

### Step 4 — Compute diff

```python
added   = keys in solid_B but not in solid_A   # material appeared
removed = keys in solid_A but not in solid_B   # material disappeared
```

Each result voxel carries its `(iLon, iLat, iH)` indices. The browser reconstructs geographic coordinates from the grid definition:

```js
lon = (iLon + 0.5) * lonStep
lat = (iLat + 0.5) * latStep
h   = (iH   + 0.5) * hStep
```

### Volume statistics

Reported in the stats panel:

```
Added volume   = count_added   × voxSize³  m³
Removed volume = count_removed × voxSize³  m³
Net change     = added − removed
```

---

## 7. Backend API

Base URL: `http://127.0.0.1:8000` (configurable via `VITE_API_URL` env var in the frontend)

The database part (GET /api/sites) needs to be modified later.

### `GET /health`

Returns server status and the resolved `DATA_ROOT` path.

```json
{ "status": "ok", "data_root": "/absolute/path/to/public/data" }
```

### `GET /api/sites`

Returns all sites and their survey dates from the database.

```json
{
  "sites": [
    {
      "id": "dunpo",
      "label": "둔포면 — Waste Site",
      "labelEn": "Dunpo-myeon",
      "camera": { "lon": 127.0071, "lat": 36.9102, "height": 600 },
      "dates": [
        {
          "id": "251106",
          "label": "Nov 6, 2025",
          "mesh": "data/dunpo/251106/3d_mesh/tiles/tileset.json",
          "pointCloud": "data/dunpo/251106/point_cloud/tiles/tileset.json",
          "meshZOffset": null
        }
      ]
    }
  ]
}
```

### `POST /api/diff`

Runs the full voxel diff pipeline and returns the result.

**Request body:**
```json
{
  "job_id":  "uuid-generated-client-side",
  "path_a":  "data/dunpo/251106/point_cloud/tiles/tileset.json",
  "path_b":  "data/dunpo/251209/point_cloud/tiles/tileset.json",
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
  "job_id": "...",
  "vox_size": 0.5,
  "clipped": true,
  "grid_def": { "lon_step": 0.0000045, "lat_step": 0.0000045, "h_step": 0.5 },
  "added":   [{ "iLon": 12345, "iLat": 67890, "iH": 48, "type": "added" }, ...],
  "removed": [{ "iLon": 12345, "iLat": 67890, "iH": 52, "type": "removed" }, ...],
  "stats": { "added_count": 142, "removed_count": 891, "net": -749 }
}
```

### `POST /api/diff/cancel/{job_id}`

Signals the server to stop the in-progress computation for a given job. The server sets a cancel flag that is checked between pipeline stages. The fetch in the browser is also aborted immediately via `AbortController` — the UI unblocks right away regardless of server response time.

### Cancellation flow

```
Browser                          Server
  │                                 │
  │  POST /api/diff  ─────────────► │  starts computation in thread pool
  │                                 │  (checking cancel flag between stages)
  │
  │  user clicks "Clear"
  │
  │  POST /api/diff/cancel/{id} ──► │  sets cancel_flags[id] = True
  │  _abortController.abort()       │  thread exits at next checkpoint
  │
  │  fetch throws AbortError        │
  │  → "Computation cancelled"      │
```

---

## 8. Database layer

> ⚠️ **Planned migration**: The current local database (SQLite) will be replaced with API calls to a database in backend. The DB schema and seeding approach are designed to make this transition straightforward — only `DATABASE_URL` in `.env` and the `/api/sites` endpoint in `main.py` need to change.

### What is stored currently

The database stores **metadata only**. Tile files stay on disk.

| Table | Stores |
|---|---|
| `sites` | Site ID, display labels, camera home position |
| `survey_dates` | Date code, human label, paths to mesh and point cloud tilesets, optional per-date Z offset |

### Schema

```
sites
  id            TEXT  PRIMARY KEY          e.g. "dunpo"
  label         TEXT                       "둔포면 — Waste Site"
  label_en      TEXT                       "Dunpo-myeon"
  camera_lon    REAL
  camera_lat    REAL
  camera_height REAL
  created_at    DATETIME

survey_dates
  id               TEXT  PRIMARY KEY       e.g. "dunpo_251106"
  site_id          TEXT  FK → sites.id
  date_code        TEXT                    "251106"
  label            TEXT                    "Nov 6, 2025"
  mesh_path        TEXT  NULLABLE          relative URL for the frontend
  point_cloud_path TEXT  NULLABLE
  mesh_z_offset    REAL  NULLABLE          overrides global default if set
  created_at       DATETIME
```

### Seeding

`seed.py` reads the `public/data/` folder structure and inserts a row for each site and date it finds. It is safe to re-run — existing rows are skipped.

```bash
python seed.py
```

After adding a new survey: drop the tiles into `public/data/<site>/<date>/`, then run `seed.py` again. The new date appears in the frontend immediately on next page load.

### Migrations

Alembic manages schema changes. The `alembic/` folder contains the migration history.

```bash
# Apply all pending migrations
alembic upgrade head

# Generate a new migration after editing models.py
alembic revision --autogenerate -m "description of change"
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

## 9. Configuration reference

### `src/config.js`

| Key | Default | Description |
|---|---|---|
| `ION_TOKEN` | — | Cesium ion token (required for background terrain) |
| `DEFAULTS.SHOW_MESH` | `true` | Initial mesh visibility |
| `DEFAULTS.SHOW_PC` | `false` | Initial point cloud visibility |
| `DEFAULTS.POINT_SIZE` | `1` | Initial point cloud attenuation size |
| `DEFAULTS.SHOW_ADDED` | `true` | Initial visibility of added voxels |
| `DEFAULTS.SHOW_REMOVED` | `true` | Initial visibility of removed voxels |
| `DEFAULTS.VOXEL_SIZE` | `0.5` | Default voxel size in metres |
| `DEFAULTS.MESH_Z_OFFSET` | `119.575` | Metres added to mesh height to align with terrain |
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
| `DATA_ROOT` | `./public/data` | Absolute or relative path to tile data folder |
| `DATABASE_URL` | `sqlite+aiosqlite:///./asan.db` | SQLAlchemy async database URL |

### Frontend API URL

The frontend reads `VITE_API_URL` from the Vite environment. Create a `.env.local` at the project root:

```
VITE_API_URL=http://127.0.0.1:8000
```

---

## 10. Known limitations and future work

### Current limitations

**Voxel accuracy** — The voxelization approximates volume by filling columns from ground to surface peak. This gives correct results for simple convex piles but may over-estimate volume for concave or overhanging shapes (e.g. a pile with a hollow underneath).

**Single-threaded diff per request** — Each `/api/diff` request runs in a single thread in the thread pool. Large point clouds with small voxel sizes (< 0.3 m) or large polygons can take several minutes and use significant memory.

### Planned improvements

- **Server-side diff pre-computation**: run the voxel diff offline when a new survey is uploaded and store the result as a 3D Tiles tileset. This would eliminate the wait time and the memory pressure of on-demand computation.
- **Shared database**: migrate from local SQLite to shared PostgreSQL instance.
- **Project management system**: introduce multi-project support: show available projects on entry, allow switching between project dynamically and be able to create new peojects.
- **Voxelizer readiness state**: expose status in UI (ready/processing/unavailable).
- **Time series analysis**: compute change evolution accross myultiple survey pairs using precomputed diffs.
- **Improved reporting view**: dedicated report section for added/removed/net volume, per-date comparision, exportable summaries (for the backend voxelizer).
- **Fast computation or advanced computation choice**: be able to choose a fast but estimated diff computation (server folder simple voxelizer) or slower(?) but accurate (backend folder fully developed voxelizer).
- **Opacity blending fixes**: resolve layer blending inconsistencies in Date A and Date B meshes.