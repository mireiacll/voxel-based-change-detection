/**
 * config.js — Edit this to match your data folder structure.
 *
 * EXPECTED FOLDER LAYOUT (Vite serves from /public):
 *
 *   public/
 *     data/
 *       dunpo/
 *         251106/
 *           3d_mesh/
 *             tiles/        ← tileset.json + data/*.glb  (from mago3d-tiler)
 *           point_cloud/
 *             tiles/        ← tileset.json + *.pnts      (from py3dtiles)
 *         251209/
 *           3d_mesh/
 *             tiles/
 *           point_cloud/
 *             tiles/
 *         260209/
 *           3d_mesh/
 *             tiles/
 *           point_cloud/
 *             tiles/
 *       ungpo/
 *         ...
 *
 * PATHS are relative to the Vite dev server root (the project root folder).
 * All data is local — no Cesium ion assets are used for 3D content.
 *
 * Cesium ion token is only needed for the background basemap / world terrain.
 * Get a free one at https://ion.cesium.com/tokens
 */

export const CONFIG = {

  // ── Cesium ion token — only for background globe + terrain ───────────────
  ION_TOKEN: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI2MmM2MDMwMy02NmM1LTRmMDgtOGMyMi00MjY0NzIxOTUyZWUiLCJpZCI6NDMxMzE0LCJpc3MiOiJodHRwczovL2lvbi5jZXNpdW0uY29tIiwiYXVkIjoidW5kZWZpbmVkX2RlZmF1bHQiLCJpYXQiOjE3Nzg3MTc3Mjd9.kUERge93MlBTW7ePgNARFI4VRKf8wOXDsg5emt14D4g',

  // ── Sites ─────────────────────────────────────────────────────────────────
  SITES: [
    {
      id:    'dunpo',
      label: '둔포면 — Waste Site',
      labelEn: 'Dunpo-myeon',
      camera: { lon: 127.0071, lat: 36.9102, height: 600 },
      dates: [
        {
          id:    '251106',
          label: 'Nov 6, 2025',
          mesh:        'data/dunpo/251106/3d_mesh/tiles/tileset.json',
          pointCloud:  'data/dunpo/251106/point_cloud/tiles/tileset.json',
        },
        {
          id:    '251209',
          label: 'Dec 9, 2025',
          mesh:        'data/dunpo/251209/3d_mesh/tiles/tileset.json',
          pointCloud:  'data/dunpo/251209/point_cloud/tiles/tileset.json',
        },
        {
          id:    '260209',
          label: 'Feb 9, 2026',
          mesh:        'data/dunpo/260209/3d_mesh/tiles/tileset.json',
          pointCloud:  'data/dunpo/260209/point_cloud/tiles/tileset.json',
        },
      ],
    },
    {
      id:    'ungpo',
      label: '웅포면 — Waste Site',
      labelEn: 'Ungpo-myeon',
      camera: { lon: 126.9300, lat: 36.0500, height: 600 },
      dates: [
        // Add 웅포면 dates here following the same pattern:
        // {
        //   id:    '251106',
        //   label: 'Nov 6, 2025',
        //   mesh:        'data/ungpo/251106/3d_mesh/tiles/tileset.json',
        //   pointCloud:  'data/ungpo/251106/point_cloud/tiles/tileset.json',
        // },
      ],
    },
  ],

  // ── Visual defaults ───────────────────────────────────────────────────────
  DEFAULTS: {
    //USE_TERRAIN:   true,
    SHOW_MESH:     true,
    SHOW_PC:       false,
    POINT_SIZE:    1,
    PC_COLOR:      'rgb',
    SHOW_ADDED:    true,
    SHOW_REMOVED:  true,
    VOXEL_SIZE:    0.5,
    MESH_Z_OFFSET: 119.575,
  },

  TERRAIN: {
    ENABLED: true,
    ASSET_ID: 4807084,
  },

  // ── Voxel diff colour coding ──────────────────────────────────────────────
  DIFF_COLORS: {
    ADDED:   '#ff4d4d',
    REMOVED: '#4d9fff',
  },
};