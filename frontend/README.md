# 3D Change Detection Viewer

A web-based 3D change detection tool for monitoring illegal waste sites in Asan City, South Korea. Built with **React + CesiumJS** on the frontend, talking to an external REST API (port 8080) for projects, observations, and diff jobs.

Drone surveys produce 3D meshes and point clouds that are converted to 3D Tiles and loaded into a Cesium globe. The viewer computes volumetric differences between survey dates by voxelizing the point clouds server-side and comparing occupied voxel columns.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend framework | React 18 + Vite |
| 3D globe | CesiumJS 1.116 |
| 3D data format | 3D Tiles (mago3d-tiler for mesh + point cloud) |
| Backend API | External REST API at `localhost:8080` |
| Voxelization | Dedicated backend voxelizer (polled via job status) |

---

## Repository layout

```
3d-change-detection/
└── frontend/
    ├── public/
    │   └── data/                      ← 3D Tiles served statically by Vite
    │       └── <site_id>/
    │           └── <date_code>/
    │               └── tiles/
    │
    └── src/
        ├── components/
        │   ├── NavBar.jsx             ← top nav: tabs + active site chip
        │   ├── Panel.jsx              ← left sidebar: site info, diff history, compute controls
        │   ├── RightPanel.jsx         ← right sidebar: results + stats (A/B and timeline)
        │   ├── MapOverlayControls.jsx ← floating basemap picker + terrain toggle
        │   ├── BottomBar.jsx          ← status + legend + shortcuts + coords
        │   ├── TimelineBar.jsx        ← full-width timeline scrubber (hidden in split mode)
        │   ├── TimelinePanel.jsx      ← timeline stats + inline MiniTimelineBar scrubber
        │   ├── ProjectLauncher.jsx    ← full-screen project selection page
        │   ├── DataUploadPage.jsx     ← upload tab (date list + upload per date + voxelize)
        │   ├── NewProjectModal.jsx    ← create new site form
        │   ├── DiffHistory.jsx        ← past + in-progress diff list
        │   ├── DrawBanner.jsx         ← polygon drawing overlay banner
        │   └── Toasts.jsx             ← toast notification stack
        │
        ├── cesium/
        │   ├── cesiumInit.js          ← viewer init, flyTo, basemap, terrain, split-view secondary viewer
        │   ├── layers.js              ← tileset loading, visibility sync, voxel shader, layer controller factory
        │   ├── polygonDraw.js         ← interactive polygon drawing tool
        │   └── viewerSync.js          ← bidirectional camera sync between split-view viewports
        │
        ├── App.jsx                    ← root component (all UI state + orchestration)
        ├── api.js                     ← adapter to external REST API (projects, observations, diffs)
        ├── config.js                  ← Cesium ion token, visual defaults
        ├── TimelineDiffs.js           ← loads + caches pre-computed TIME_SERIES diff snapshots
        └── main.jsx
```

---

## Quickstart

### Prerequisites

- Node.js 18+
- External API running at `http://localhost:8080` (set `VITE_EXTERNAL_API_URL` to override)

### Frontend

```bash
npm install
npm install --save-dev vite-plugin-static-copy
npm run dev
# → http://localhost:5173
```

Create `.env.local` if your API is not on port 8080:

```
VITE_EXTERNAL_API_URL=http://localhost:8080
```

---

## Convert raw drone data to 3D Tiles

Raw `.obj`, `.fbx`, `.las`, or `.laz` files need to be converted once with mago3d-tiler.

**Mesh (from .fbx / .obj):**
```bash
pip install mago3d-tiler --break-system-packages

mago3d-tiler \
  -i "simplified_3d_mesh.fbx" \
  -o "./tiles" \
  -pg -rx 90 \
  -lon 127.00669157 -lat 36.90993259 -zo 119.575
```

**Point cloud (from .las / .laz):**
```bash
mago3d-tiler \
  -i "densified_point_cloud.las" \
  -o "./tiles" \
  -c 5186
```

Place the output `tiles/` folder under `public/data/<site_id>/<date_code>/tiles/` and upload via the UI.

---

## Data model

The frontend maps the external API's terminology to its own internal names:

| External API | Internal |
|---|---|
| Project | Site |
| Observation | Survey date |

Each site has multiple survey dates. Each date can have a point cloud tileset and/or a voxelized representation (computed server-side and polled for completion).

---

## UI overview

### Navigation tabs

| Tab | Description |
|---|---|
| 프로젝트 | Full-screen project selection page |
| 데이터 업로드 | Upload datasets, trigger voxelization per date |
| 변화탐지 | Analysis view: map + panels |

### Analysis view layout

```
┌──────────────────────────────────────────────────┐
│ NavBar                                           │
├──────────────────────────────────────────────────┤
│  Left panel  │  Cesium map  │  Right panel       │
│              │              │                    │
│  Site info   │  [map]       │  Results + stats   │
│  Diff history│              │  (or timeline      │
│  New compute │              │   panel)           │
│  controls    │              │                    │
├──────────────┴──────────────┴────────────────────┤
│  [Timeline bar — timeline mode only]             │
├──────────────────────────────────────────────────┤
│  BottomBar: status · legend · shortcuts · coords │
└──────────────────────────────────────────────────┘
```

### Modes

- **A vs B 비교** — select two dates, trigger a voxel diff job, visualise added/removed volumes
- **시계열 변화탐지** — scrub through pre-computed TIME_SERIES diff snapshots with a timeline bar
- **Split view** — load two diff history entries side by side with synced cameras

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
| `← →` | Step through timeline |
| `Space` | Play / pause timeline |