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

## Front-end and server Repository layout
```
3d-change-detection/
├── frontend/                          ← React + CesiumJS application (previous "cesium-viewer-react")
│
│   ├── public/
│   │   └── data/                      ← 3D Tiles served statically by Vite (DEV / fallback)
│   │       ├── <site_id>/
│   │       │   ├── <date_code>/
│   │       │   │   ├── 3d_mesh/tiles/      ← tileset.json + *.glb (mago3d-tiler)
│   │       │   │   └── point_cloud/tiles/  ← tileset.json + *.glb (mago3d-tiler)
│   │       │   └── ...
│   │       └── ...
│
│   ├── src/                           ← React + Cesium frontend
│   │   ├── components/
│   │   │   ├── DrawBanner.jsx
│   │   │   ├── Panel.jsx
│   │   │   ├── StatusBar.jsx
│   │   │   ├── Toasts.jsx
│   │   │   └── TopBar.jsx
│   │   │
│   │   ├── cesium/
│   │   │   ├── cesiumInit.js          ← viewer init, flyTo, terrain toggle
│   │   │   ├── layers.js              ← tileset loading, visibility, voxel rendering
│   │   │   └── polygonDraw.js         ← interactive polygon drawing tool
│   │   │
│   │   ├── lib/
│   │   │   ├── glbParser.js           ← browser-side GLB parser (fallback / dev)
│   │   │   ├── voxelizer.js           ← browser-side voxelizer (fallback / dev)
│   │   │   └── polygonUtils.js        ← point-in-polygon utility
│   │   │
│   │   ├── styles/
│   │   │   └── viewer.css
│   │   │
│   │   ├── App.jsx                    ← root component (UI state + orchestration)
│   │   ├── config.js                  ← Cesium config, defaults, terrain settings
│   │   ├── diff.js                    ← calls /api/diff and handles results
│   │   └── main.jsx
│   │
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
│
├── server/                             ← FastAPI backend (core computation layer)
│   ├── main.py                         ← API routes: /health, /api/sites, /api/diff
│   ├── glb_parser.py                  ← NumPy GLB → point cloud extraction
│   ├── voxelizer.py                   ← voxelization + solidification + diff engine
│   ├── database.py                    ← SQLAlchemy async engine/session
│   ├── models.py                      ← ORM models (Site, SurveyDate)
│   ├── seed.py                        ← filesystem → DB importer
│   ├── requirements.txt
│   ├── .env                           ← local config (NOT committed)
│   └── alembic/                       ← database migrations
│       ├── env.py
│       └── versions/
│
└── backend/                           
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

# Copy environment config and edit DATA_ROOT to point at your public/data folder
cp .env.example .env

# Set up the database (first time only)
alembic upgrade head
python seed.py

# Start the API server
uvicorn main:app --reload
# → http://127.0.0.1:8000
```

Create a `.env` file with at minimum:

```
DATA_ROOT=../public/data
DATABASE_URL=sqlite+aiosqlite:///./3dchange_detection.db
ALLOWED_ORIGINS=http://localhost:5173
```

---

### 3 — Convert raw drone data to 3D Tiles

Raw `.obj` mesh and `.las`/`.laz` point cloud files cannot be loaded by CesiumJS directly. Convert them once with mago3d-tiler:

**Mesh:**
```bash
pip install mago3d-tiler --break-system-packages

mago3d-tiler \
  -input  "path/to/251106_mesh.obj" \
  -inputType OBJ \
  -output "public/data/dunpo/251106/3d_mesh/tiles" \
  -crs 5186
```

**Point cloud:**
```bash
mago3d-tiler \
  -input  "path/to/251106_pointcloud.las" \
  -inputType LAS \
  -output "public/data/dunpo/251106/point_cloud/tiles" \
  -crs 5186
```

After converting, run `python seed.py` to register the new date in the database.

---

## Adding a new survey date

1. Convert drone data to 3D Tiles (see above)
2. Place tiles in `public/data/<site>/<date_code>/`
3. Run `python seed.py` — the new date appears in the UI automatically
4. No code changes needed

---

## Keyboard shortcuts

| Key | Action |
|---|---|
| `M` | Toggle 3D mesh |
| `P` | Toggle point cloud |
| `A` | Toggle added volume |
| `R` | Toggle removed volume |
| `D` | Draw area (compare mode) |
| `V` | Switch to View mode |
| `C` | Switch to Compare mode |
| `1` | Site camera |
| `2` | Top-down camera |