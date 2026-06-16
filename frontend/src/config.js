/**
 * config.js — Edit this to match your environment.
 *
 * NOTE: The SITES list has been removed.
 * Sites, dates, and dataset paths are now served dynamically by the FastAPI
 * backend at GET /api/sites.  If you need to seed initial data, run seed.py.
 *
 * This file now only holds:
 *   - ION_TOKEN     (Cesium background globe / terrain)
 *   - DEFAULTS      (visual defaults)
 *   - TERRAIN       (terrain asset config)
 *   - DIFF_COLORS   (voxel diff colour coding)
 */

export const CONFIG = {

  // ── Cesium ion token — only for background globe + terrain ───────────────
  ION_TOKEN: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI2MmM2MDMwMy02NmM1LTRmMDgtOGMyMi00MjY0NzIxOTUyZWUiLCJpZCI6NDMxMzE0LCJpc3MiOiJodHRwczovL2lvbi5jZXNpdW0uY29tIiwiYXVkIjoidW5kZWZpbmVkX2RlZmF1bHQiLCJpYXQiOjE3Nzg3MTc3Mjd9.kUERge93MlBTW7ePgNARFI4VRKf8wOXDsg5emt14D4g',

  // ── Visual defaults ───────────────────────────────────────────────────────
  DEFAULTS: {
    SHOW_DATASET:  true,
    POINT_SIZE:    1,
    PC_COLOR:      'rgb',
    SHOW_ADDED:    true,
    SHOW_REMOVED:  true,
    VOXEL_SIZE:    0.5,
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