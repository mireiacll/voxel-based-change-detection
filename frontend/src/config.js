// config.js — edit this to match your environment.
//
// Sites and dates are loaded dynamically from the external API.
// This file only holds visual/display configuration.

export const CONFIG = {

  // Cesium ion token — used for background globe + terrain + Bing basemaps
  ION_TOKEN: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI2MmM2MDMwMy02NmM1LTRmMDgtOGMyMi00MjY0NzIxOTUyZWUiLCJpZCI6NDMxMzE0LCJpc3MiOiJodHRwczovL2lvbi5jZXNpdW0uY29tIiwiYXVkIjoidW5kZWZpbmVkX2RlZmF1bHQiLCJpYXQiOjE3Nzg3MTc3Mjd9.kUERge93MlBTW7ePgNARFI4VRKf8wOXDsg5emt14D4g',

  DEFAULTS: {
    SHOW_DATASET:  true,
    POINT_SIZE:    1,
    PC_COLOR:      'rgb',
    SHOW_ADDED:    true,
    SHOW_REMOVED:  true,
    VOXEL_SIZE:    0.5,
  },

  TERRAIN: {
    ENABLED:  true,
    ASSET_ID: 4807084,  // Korean terrain dataset
  },

  DIFF_COLORS: {
    ADDED:   '#ff4d4d',
    REMOVED: '#4d9fff',
  },
}
