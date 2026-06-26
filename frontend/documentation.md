# Technical Documentation — 3D Change Detection Viewer

---

## Table of contents

0. [System overview](#0-system-overview)
1. [Architecture overview](#1-architecture-overview)
2. [Frontend — React + CesiumJS](#2-frontend--react--cesiumjs)
3. [Project management UI](#3-project-management-ui)
4. [Analysis view — compare mode](#4-analysis-view--compare-mode)
5. [Analysis view — timeline mode](#5-analysis-view--timeline-mode)
6. [Split view](#6-split-view)
7. [Polygon area filter](#7-polygon-area-filter)
8. [Voxel diff algorithm](#8-voxel-diff-algorithm)
9. [External API](#9-external-api)
10. [Configuration reference](#10-configuration-reference)
11. [Known limitations and future work](#11-known-limitations-and-future-work)

---

## 0. System overview

### 🗺️ 3D visualization
- Cesium-based 3D globe with Korean terrain (ion asset 4807084)
- Load 3D mesh (3D Tiles) or point cloud data per survey date
- Basemap thumbnail picker: Bing Maps (Aerial, Aerial + Labels, Roads), Google Maps (Satellite, Satellite + Labels, Roadmap, Contour), OSM, Dark Map, Globe Only
- Terrain toggle inside the basemap panel

### 📅 Survey management
- Multiple sites (physical locations / projects)
- Multiple survey dates per site
- Each date can have a point cloud tileset and/or a voxelized representation

### 🗂️ Project management
- **Project Launcher** — full-screen project selection page
- **New Project modal** — create a site (name, camera position) via the external API
- **Observations tab** — list all dates per site, upload tilesets, trigger voxelization jobs

### 🔄 Change detection (core feature)
- **A vs B compare mode** — select two dates, run a server-side voxel diff job, visualise added/removed volumes as coloured 3D voxels via a tileset
- **Timeline mode** — scrub through pre-computed TIME_SERIES diff snapshots across all consecutive date pairs
- **Split view** — load two diff history entries side by side with synced cameras
- Area polygon filter — restrict computation to a drawn geographic region
- Results: volume in m³, voxel count, net change

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
│  React (App.jsx) — all UI state                 │
│    ↕ state / callbacks                          │
│  Cesium layer (cesiumInit, layers, polygonDraw) │
│    ↕ imperative Cesium API                      │
│  CesiumJS globe(s) — primary + optional split   │
└─────────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────────┐
│  External REST API  (localhost:8080)            │
│                                                 │
│  /api/projects   — CRUD for sites               │
│  /api/observations — CRUD for survey dates      │
│  /api/diffs      — trigger + poll diff jobs     │
│  /files/…        — serve voxel tilesets         │
└─────────────────────────────────────────────────┘
```

All API calls go through `api.js`, which maps the external API's terminology (project / observation) to the internal naming (site / date) used everywhere else in the app.

---

## 2. Frontend — React + CesiumJS

### State management

All UI state lives in `App.jsx` as React `useState`. No external state library. The pattern is:

```
User action → React state update → useEffect → imperative Cesium call
```

Cesium is entirely imperative — it owns the `<div id="cesiumContainer">` and React never re-renders it. React controls the panel UI and calls functions in `cesiumInit.js` / `layers.js` as side effects.

### File responsibilities

| File | Responsibility |
|---|---|
| `App.jsx` | All UI state, event handlers, orchestrates everything |
| `api.js` | Adapter to external REST API — maps project↔site, observation↔date |
| `config.js` | Ion token, visual defaults, terrain settings |
| `TimelineDiffs.js` | Loads and caches TIME_SERIES diff snapshots per site |
| `cesium/cesiumInit.js` | Creates the Cesium viewer; flyTo, basemap, terrain, secondary viewer for split mode |
| `cesium/layers.js` | Loads tilesets, syncs visibility, renders voxel shader; exports `createLayerController` for split-view slot B |
| `cesium/polygonDraw.js` | Interactive polygon drawing; per-tab state so compare/timeline don't bleed into each other |
| `cesium/viewerSync.js` | Bidirectional camera sync between the two split-view viewports |
| `components/NavBar.jsx` | Top nav: tabs + active site chip |
| `components/Panel.jsx` | Left sidebar: site info, diff history, new computation form (date selectors, draw area, run button) |
| `components/RightPanel.jsx` | Right sidebar: results + stats for A/B or timeline; stacks two halves in split view |
| `components/MapOverlayControls.jsx` | Floating basemap picker grid + terrain toggle |
| `components/BottomBar.jsx` | Fixed bottom: status, legend, shortcuts, coords; hosts TimelineBar |
| `components/TimelineBar.jsx` | Full-width timeline scrubber (hidden in split mode) |
| `components/TimelinePanel.jsx` | Timeline stats: mini chart, snapshot stats, visibility toggles, inline `MiniTimelineBar` scrubber |
| `components/DiffHistory.jsx` | List of past and in-progress diff jobs; click to load, ✕ to delete/cancel |
| `components/ProjectLauncher.jsx` | Full-screen project selection page |
| `components/DataUploadPage.jsx` | Upload tab: date list, per-date upload, voxelize trigger |
| `components/NewProjectModal.jsx` | Modal for creating a new site |
| `components/DrawBanner.jsx` | Banner overlay shown while drawing a polygon |
| `components/Toasts.jsx` | Auto-dismissing toast stack |

### Visibility rules

Enforced by `syncVisibility()` in `layers.js`. Called whenever the mode or any visibility toggle changes.

| Layer | Visible when |
|---|---|
| `mesh` / `pc` | Active date toggle ON |
| `diffApiTs` | compare-api mode, result loaded |
| `timeseriesTs[i]` | timeline mode, index i is active |

Switching mode tabs never reloads data — only the `.show` flag changes. Diff tilesets persist until cleared.

### Basemap switcher

`setBasemap(id)` in `cesiumInit.js` swaps the imagery layer at runtime.

| ID | Provider |
|---|---|
| `aerial` | Bing Maps Aerial (ion 2) |
| `aerial_labels` | Bing Maps Aerial + Labels (ion 3) |
| `roads` | Bing Maps Roads (ion 4) |
| `gmaps_sat` | Google Maps Satellite (ion 3830182) |
| `gmaps_sat_labels` | Google Maps Satellite + Labels (ion 3830183) |
| `gmaps_road` | Google Maps Roadmap (ion 3830184) |
| `gmaps_contour` | Google Maps Contour (ion 3830186) |
| `osm` | OpenStreetMap |
| `dark` | OSM darkened (brightness 0.3 / contrast 1.8) |
| `none` | Globe only |

Google Maps assets may require terms acceptance in the ion dashboard on first use.

### Layer controller factory

`createLayerController({ viewer })` in `layers.js` returns an independent set of layer functions scoped to a given Cesium viewer. The primary viewer uses a default instance (the module-level exports). Split view's slot B gets its own via `createLayerController({ viewer: viewer2 })`. This is how both viewports can load tilesets independently.

---

## 3. Project management UI

### Navigation tabs

| Tab | Content |
|---|---|
| 프로젝트 | `ProjectLauncher` — full-screen site selection |
| 관측 데이터 | `DataUploadPage` — manage dates and uploads |
| 변화탐지 | Analysis view — Cesium map + panels |

The map is hidden (`cesium-hidden`) while the Projects or Upload tab is active.

### ProjectLauncher

- Displays all sites as cards (survey count, date range, status)
- **+ 새 프로젝트** opens `NewProjectModal`
- Clicking a card calls `handleOpenProject(site)` — clears the scene, resets state, switches to Analysis

### DataUploadPage

Lists all survey dates for the active site. Each date row has:
- Edit name/date, delete, set as camera location (reads coords from the tileset's bounding region)
- Per-date **PC / Mesh / VOX** preview buttons — clicking one loads that representation directly into `window.viewer` (no separate Cesium instance). VOX is only enabled when `voxelStatus === 'SUCCEEDED'`.
- Upload a new tileset (drag-drop folder or `.zip`)
- Trigger / cancel voxelization (needed before running a diff)

**+ 새 날짜 추가** creates a new date and optionally uploads its dataset immediately.

Multiple uploads can run concurrently. Progress is tracked in `App.jsx`'s `uploadingDateInfo` map (`tempId → { name, observedAt, datasetType, phase, pct, error }`) and displayed as per-row cards. On success the new date is patched directly into state — no full `refreshSites()` round-trip.

---

## 4. Analysis view — compare mode

The user selects two survey dates (A = before, B = after) and runs a volumetric diff.

### Left panel — new computation view

- Date A / Date B selectors
- Draw Area button
- Voxel size input + diff name
- **⚡ 차이 계산** — triggers a diff job, polls for completion, then loads the result tileset
- Running jobs appear immediately in Diff History with a spinner

### Right panel — results

When a diff result is loaded:
- Added volume toggle (red, ADD badge)
- Removed volume toggle (blue, REM badge)
- Stats: added volume (m³), removed volume (m³), net change, voxel size

### Diff voxels

Results are rendered as a 3D Tiles tileset loaded from the API (`resultTilesetUrl`). A CustomShader classifies voxels by their baked colour (red = added, blue = removed, grey = unchanged) and applies exact brand colours, discarding hidden categories.

### Diff History

`DiffHistory.jsx` shows all past and in-progress diffs for the active site. Click a SUCCEEDED entry to load its result tileset. In-flight diffs show a spinner and a cancel button.

In split view, each entry shows A/B assignment pills. `handleAssignSlot(entry)` in `App.jsx` routes clicks: fills A first, then B; clicking an already-assigned entry toggles it off; clicking a new entry while both are filled replaces B.

---

## 5. Analysis view — timeline mode

Timeline mode scrubs through pre-computed TIME_SERIES diff snapshots across all consecutive date pairs.

### How it works

1. Switching to "시계열 변화탐지" calls `loadDiffSnapshots(site)` in `TimelineDiffs.js`
2. Fetches the latest SUCCEEDED TIME_SERIES diff for the site, builds one snapshot per diff item
3. Each snapshot's tileset is pre-loaded (hidden), then `showSnapshotTileset(index)` flips only the active one visible — no reload on scrub
4. Stats come from `mass-summary.json` fetched per item (finest resolution `levelCounts` entry)

### TimelineBar / MiniTimelineBar

A compact inline scrubber lives in the right panel header (`MiniTimelineBar`). The full `TimelineBar` above the bottom bar is hidden in split mode (both slots have their own inline scrubber in the right panel).
- Equally-spaced date markers (independent of real timestamps)
- Draggable scrubber + click-to-seek
- Play / Pause with auto-advance
- Step buttons and snapshot counter

### TimelinePanel (right panel)

- Mini bar chart of added/removed per snapshot
- Active snapshot stats (volumes, voxel count, voxel size)
- Visibility toggles (added / removed / unchanged)
- Playback controls

### Per-diffId history

`loadDiffSnapshotsByDiffId(diffId, projectId)` loads a specific historical diff — used when restoring a Diff History entry, so you always get exactly the data from that run rather than silently falling back to the latest.

---

## 6. Split view

Split view renders two independent Cesium viewports side by side, each showing a different diff result (A/B or timeline). Cameras are kept in sync bidirectionally by `viewerSync.js`.

### How it works

1. **Enable split** — `initSecondaryViewer('cesiumContainer2')` creates `viewer2` with the same terrain and scene settings. `startCameraSync(viewer, viewer2)` hooks both viewports' `postRender` events.
2. **Assign slots** — clicking a Diff History entry assigns it to slot A or B. Each slot has its own summary state, timeline state, and visibility flags.
3. **Slot B layers** — `createLayerController({ viewer: viewer2 })` gives slot B its own tileset management. Loading a date for background context also loads it in slot B.
4. **Disable split** — `destroySecondaryViewer()` destroys `viewer2` and the sync is stopped.

### Camera sync details (`viewerSync.js`)

Both viewers listen to each other's `scene.postRender`. A `syncing` flag prevents infinite ping-pong. Sync is deferred via `requestAnimationFrame` to avoid interleaving render passes from different WebGL contexts (which would cause "object does not belong to this context" errors).

---

## 7. Polygon area filter

Drawing a polygon restricts the diff computation to a specific geographic area.

### Drawing workflow

1. Click **✏ Draw Area** (or press `D`)
2. Camera flies top-down to the site
3. A drawing banner appears at the top of the map
4. **Left-click** to add vertices — live yellow dashed outline updates as you draw
5. **Right-click** or **double-click** to close (minimum 3 vertices)
6. Button changes to **✕ Clear Area**
7. Run the diff — polygon coordinates are sent with the job request as WKT
8. **✕ Clear Area** discards the polygon

### Implementation

`polygonDraw.js` keeps independent state per tab key (`compare-api`). Each tab has its own entity list so switching tabs doesn't destroy another tab's polygon — it just hides it. The polygon is drawn with two `CallbackProperty`-based entities (fill + outline) that update live as vertices are added.

`getPolygonWkt()` returns a `POLYGON((lon lat, ...))` string when the polygon is closed, or `null` otherwise.

---

## 8. Voxel diff algorithm

The differences run in the backend, connected through the API calls. The browser only loads the resulting 3D Tiles tileset.

The frontend reads actual volumes from `mass-summary.json` (finest `levelCounts` entry) rather than computing them client-side.

---

## 9. External API

Base URL: `http://localhost:8080` (override with `VITE_EXTERNAL_API_URL`).

All calls go through `api.js`. Key endpoints used:

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/projects` | List all sites |
| POST | `/api/projects` | Create a site |
| PUT | `/api/projects/{id}` | Update site (name, camera position) |
| DELETE | `/api/projects/{id}` | Delete a site |
| GET | `/api/projects/{id}` | Get site + dates |
| POST | `/api/observations` | Create a new survey date |
| PUT | `/api/observations/{id}` | Update date (name, observedAt) |
| DELETE | `/api/observations/{id}` | Delete a date |
| POST | `/api/observations/{id}/upload` | Upload a tileset |
| POST | `/api/observations/{id}/voxelize` | Trigger voxelization job |
| GET | `/api/observations/{id}/voxelize/status` | Poll voxelization status |
| POST | `/api/projects/{id}/diffs` | Create a diff job (AB or TIME_SERIES) |
| GET | `/api/projects/{id}/diffs` | List diffs (filterable by type + status) |
| GET | `/api/diffs/{id}` | Get diff detail + items |
| DELETE | `/api/diffs/{id}` | Delete a diff |
| POST | `/api/diffs/{id}/cancel` | Cancel an in-progress diff |
| GET | `/api/diff-items/{id}/report` | Get report (summaryPath for mass-summary) |
| GET | `/files/…` | Serve voxel tilesets + mass-summary.json |

### Diff job flow

```
POST /api/projects/{id}/diffs  →  { id, status: QUEUED }
  poll GET /api/diffs/{id}
  wait for status === SUCCEEDED
  read items[].resultTilesetUrl  →  load tileset in Cesium
```

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
| `TERRAIN.ENABLED` | `true` | Whether to load Cesium World Terrain on startup |
| `TERRAIN.ASSET_ID` | `4807084` | ion asset ID for the Korean terrain dataset |
| `DIFF_COLORS.ADDED` | `#ff4d4d` | Colour for added voxels |
| `DIFF_COLORS.REMOVED` | `#4d9fff` | Colour for removed voxels |

### Frontend env vars

Create `.env.local` in the frontend root:

```
VITE_EXTERNAL_API_URL=http://localhost:8080
```