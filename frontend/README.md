# 3D Change Detection Viewer

A web-based 3D change detection tool for monitoring illegal waste sites in Asan City, South Korea. Built with **React + CesiumJS** on the frontend and **FastAPI + Python** on the backend.

Drone surveys produce 3D meshes and point clouds that are converted to 3D Tiles and loaded into a Cesium globe. The viewer computes volumetric differences between two survey dates by voxelizing the point clouds and comparing occupied voxel columns — without any server-side preprocessing of the raw scan files.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend framework | React 18 + Vite |
| 3D globe | CesiumJS 1.116 |
| 3D data format | 3D Tiles (mago3d-tiler for mesh + point cloud) |
| Backend API | FastAPI + Uvicorn |
| Computation | NumPy (vectorised GLB parsing + voxelization) |
| Database | SQLAlchemy async — SQLite (dev) |
| Migrations | Alembic |

---

## Repository layout

```
3d-change-detection/
├── frontend/                          ← React + CesiumJS application
│
│   ├── public/
│   │   └── data/                      ← 3D Tiles served statically by Vite
│   │       └── <site_id>/
│   │           └── <date_code>/
│   │               └── tiles/         ← tileset.json + *.glb (mago3d-tiler)
│
│   ├── src/
│   │   ├── components/
│   │   │   ├── NavBar.jsx             ← top nav: tabs + active site chip
│   │   │   ├── MapSubHeader.jsx       ← "A vs B" / "시계열" mode tabs
│   │   │   ├── Panel.jsx              ← left sidebar: site info + date list + camera
│   │   │   ├── RightPanel.jsx         ← right sidebar: compare controls + results
│   │   │   ├── MapOverlayControls.jsx ← floating basemap thumbnail picker + terrain toggle
│   │   │   ├── BottomBar.jsx          ← status + legend + keyboard shortcuts + coords
│   │   │   ├── TimelineBar.jsx        ← scrubber bar shown in timeline mode
│   │   │   ├── TimelinePanel.jsx      ← timeline stats panel inside RightPanel
│   │   │   ├── ProjectLauncher.jsx    ← full-screen project selection page
│   │   │   ├── DataUploadPage.jsx     ← data upload tab (date list + upload per date)
│   │   │   ├── NewProjectModal.jsx    ← create new site form
│   │   │   ├── DrawBanner.jsx         ← polygon drawing overlay banner
│   │   │   └── Toasts.jsx             ← toast notification stack
│   │   │
│   │   ├── cesium/
│   │   │   ├── cesiumInit.js          ← viewer init, flyTo, basemap switcher, terrain toggle
│   │   │   ├── layers.js              ← tileset loading, visibility sync, voxel rendering
│   │   │   └── polygonDraw.js         ← interactive polygon drawing tool
│   │   │
│   │   ├── styles/
│   │   │   └── viewer.css
│   │   │
│   │   ├── App.jsx                    ← root component (all UI state + orchestration)
│   │   ├── config.js                  ← Cesium ion token, visual defaults
│   │   ├── diff.js                    ← calls /api/diff, cancellation, voxel state
│   │   ├── TimelineDiffs.js           ← pre-computed diff snapshot loader + cache
│   │   └── main.jsx
│   │
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
│
└── server/                            ← FastAPI backend
    ├── main.py                        ← API routes: sites, dates, upload, diff
    ├── glb_parser.py                  ← NumPy GLB → geodetic point cloud
    ├── voxelizer.py                   ← voxelization + solidification + diff engine
    ├── database.py                    ← SQLAlchemy async engine/session
    ├── models.py                      ← ORM models (Site, SurveyDate)
    ├── seed.py                        ← filesystem → DB importer
    ├── requirements.txt
    ├── .env                           ← local config (NOT committed)
    └── alembic/                       ← database migrations
        ├── env.py
        └── versions/
```

---

## Quickstart

### Prerequisites

- Node.js 18+
- Python 3.12+

---

### 1 — Frontend

```bash
# Install dependencies
npm install

# Required for Cesium static assets 
npm install --save-dev vite-plugin-static-copy

# Start the Vite dev server
npm run dev
# → http://localhost:5173
```

---

### 2 — Backend (FastAPI)

```bash
cd server

# Install Python dependencies
pip install -r requirements.txt

# Copy and edit config
cp .env.example .env

# Set up the database (first time only)
alembic upgrade head
python seed.py

# Start the API server
uvicorn main:app --reload
# → http://127.0.0.1:8000
```

Minimum `.env`:

```
DATA_ROOT=../frontend/public/data
DATABASE_URL=sqlite+aiosqlite:///./3dchange_detection.db
ALLOWED_ORIGINS=http://localhost:5173
```

---

### 3 — Convert raw drone data to 3D Tiles

Raw `.obj`, `.fbx`, `.las`, or `.laz` files must be converted once with mago3d-tiler before the viewer can load them.

**Mesh (3D Tiles from .fbx / .obj):**
```bash
pip install mago3d-tiler --break-system-packages

mago3d-tiler \
  -i "simplified_3d_mesh.fbx" \
  -o "./tiles" \
  -pg \
  -rx 90 \
  -lon 127.00669157 -lat 36.90993259 -zo 119.575
```

**Point cloud (3D Tiles from .las / .laz):**
```bash
mago3d-tiler \
  -i "densified_point_cloud.las" \
  -o "./tiles" \
  -c 5186
```

After converting, place the output `tiles/` folder in `public/data/<site_id>/<date_code>/tiles/` and run `python seed.py` (or use the UI upload).

---

## Data model

Each **site** (physical location) has multiple **survey dates**. Each survey date has exactly **one dataset** — either a 3D mesh or a point cloud (different dates within the same project can have different types). The dataset type and path are stored in the database and drive which rendering and computation path is used.

```
Site
 └─ SurveyDate  (date_code + label + dataset_path + dataset_type)
 └─ SurveyDate
 └─ ...
```

---

## Adding a new survey date

### Option A — UI (recommended)

1. Open the **데이터 업로드** tab while a project is selected
2. Click **+ 새 날짜 추가** and enter the 6-digit YYMMDD code
3. Select the dataset type (Point Cloud or 3D Mesh)
4. Drag-drop the converted `tiles/` folder or a `.zip` of it

### Option B — seed.py

1. Convert drone data to 3D Tiles
2. Place tiles in `public/data/<site_id>/<date_code>/tiles/`
3. Run `python seed.py`

---

## Keyboard shortcuts

| Key | Action |
|---|---|
| `A` | Toggle added voxels |
| `R` | Toggle removed voxels |
| `D` | Draw polygon area (compare mode) |
| `M` | Toggle active date layer |
| `1` | Site camera |
| `2` | Top-down camera |
| `← →` | Step through timeline (timeline mode) |
| `Space` | Play / pause timeline |

---

## UI overview

### Navigation tabs

| Tab | Description |
|---|---|
| 프로젝트 | Full-screen project selection page |
| 데이터 업로드 | Upload or replace datasets per date |
| 변화탐지 | Analysis view with map + panels |

### Analysis view layout

```
┌──────────────────────────────────────────────────┐
│ NavBar                                           │
├──────────────────────────────────────────────────┤
│  Left panel  │  Cesium map  │  Right panel       │
│              │              │                    │
│  Site info   │  [map]       │  A vs B compare    │
│  Date list   │              │  Draw area         │
│  Camera btns │  [basemap    │  Voxel size        │
│              │   picker]    │  Run diff / Clear  │
│              │              │  Results + stats   │
│              │              │  (or timeline      │
│              │              │   panel)           │
├──────────────┴──────────────┴────────────────────┤
│  [Timeline bar — timeline mode only]             │
├──────────────────────────────────────────────────┤
│  BottomBar: status · legend · shortcuts · coords │
└──────────────────────────────────────────────────┘
```

### Modes

- **A vs B 비교** — select two dates, run a voxel diff, visualise added/removed volumes
- **시계열 변화탐지** — scrub through pre-computed diff snapshots across all date pairs; timeline bar shown at bottom

---

## Known limitations

- **Mixed-type diff not yet supported** — both datasets sent to `/api/diff` must be point clouds. Mesh-vs-mesh or mesh-vs-pointcloud comparison is not yet implemented.
- **Voxel accuracy** — column-fill solidification over-estimates volume for concave or overhanging shapes.
- **Single-threaded diff** — large point clouds at fine voxel sizes (< 0.3 m) can take several minutes.