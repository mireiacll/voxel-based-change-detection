// /**
//  * diff.js — ES module version
//  *
//  * Client-side 3-D change detection with polygon area filter.
//  * All DOM interaction removed — results are returned via callbacks passed
//  * from React (App.jsx) so the component can update its own state.
//  *
//  * See original diff.js for full algorithm documentation.
//  */

// import { CONFIG } from './config'
// import { toast } from './cesium/cesiumInit'
// import { loadCompare, renderVoxelDiff } from './cesium/layers'
// import { loadAllPoints } from './lib/glbParser'
// import { makeGridDef, buildSurface, solidify, diffSolid} from './lib/voxelizer'
// import { getPolygonGeo } from './cesium/polygonDraw'

// // ── Global diff state (read by layers.js) ─────────────────────────────────
// window.diffState = {
//   voxels:         [],
//   voxelSize:      CONFIG.DEFAULTS.VOXEL_SIZE,
//   addedVisible:   CONFIG.DEFAULTS.SHOW_ADDED,
//   removedVisible: CONFIG.DEFAULTS.SHOW_REMOVED,
//   gridDef: null,
// }

// // ═════════════════════════════════════════════════════════════════════════
// //  ENTRY POINT
// // ═════════════════════════════════════════════════════════════════════════

// /**
//  * @param {object}   site
//  * @param {object}   dateA
//  * @param {object}   dateB
//  * @param {string}   currentMode
//  * @param {number}   voxSize         — from React state (voxel size input)
//  * @param {object}   tintA           — { hex, alpha } from React state
//  * @param {object}   tintB           — { hex, alpha } from React state
//  * @param {object}   checkboxState   — { mesh, pc, dateA, dateB, added, removed }
//  * @param {function} onDiffStatus    — (state, msg) => void   → React state
//  * @param {function} onStats         — ({ added, removed, net, voxels, clipped }) => void
//  */
// export async function runVoxelDiff(
//   site, dateA, dateB, currentMode,
//   voxSize, tintA, tintB, checkboxState,
//   onDiffStatus, onStats
// ) {
//   //const polygon = _poly.closed ? _poly.geo : null
//   const polygon = getPolygonGeo()

//   window.diffState.voxelSize      = voxSize
//   window.diffState.addedVisible   = checkboxState?.added   ?? true
//   window.diffState.removedVisible = checkboxState?.removed ?? true

//   // 1. Load meshes for visual display
//   onDiffStatus('computing', `Loading meshes: ${dateA.label} vs ${dateB.label}…`)
//   await loadCompare(site, dateA, dateB, currentMode, tintA, tintB, checkboxState)

//   // 2. Fetch all point cloud GLBs in parallel
//   onDiffStatus('computing', `Fetching point clouds${polygon ? ' (polygon filter)' : ''}…`)

//   const [rawA, rawB] = await Promise.all([
//     // _loadAllPoints(dateA.pointCloud),
//     // _loadAllPoints(dateB.pointCloud),
//     loadAllPoints(dateA.pointCloud),
//     loadAllPoints(dateB.pointCloud),
//   ])

//   console.log(`[diff] Raw points — A: ${rawA.length}, B: ${rawB.length}`)

//   if (!rawA.length && !rawB.length) {
//     toast('No point cloud data — check pointCloud paths in config.js', 'warn')
//     onDiffStatus('done', 'No data loaded')
//     return
//   }

//   // 3. Build grid definition
//   const gridDef = makeGridDef([...rawA, ...rawB], voxSize)
//   window.diffState.gridDef = gridDef

//   // 4. Build sparse surface maps
//   onDiffStatus('computing', `Voxelizing ${rawA.length + rawB.length} points @ ${voxSize}m…`)

//   const surfaceA = buildSurface(rawA, gridDef, polygon)
//   const surfaceB = buildSurface(rawB, gridDef, polygon)
//   console.log(`[diff] Surface voxels — A: ${surfaceA.size}, B: ${surfaceB.size}`)

//   // 5. Solidify
//   const { solidA, solidB } = solidify(surfaceA, surfaceB, gridDef)

//   // 6. Compute diff
//   const { added, removed } = diffSolid(solidA, solidB)
//   console.log(`[diff] Diff — added: ${added.length}, removed: ${removed.length}`)
//   window.diffState.voxels = [...added, ...removed]

//   // Report stats to React
//   onStats({
//     added:   added.length,
//     removed: removed.length,
//     voxSize,
//     clipped: polygon !== null,
//   })

//   renderVoxelDiff(getFilteredVoxels(), voxSize)
//   onDiffStatus('done',
//     `Done — ${added.length} added, ${removed.length} removed` +
//     (polygon ? ' (polygon)' : ''))
// }

// // ── Visibility filter ─────────────────────────────────────────────────────

// export function getFilteredVoxels() {
//   return window.diffState.voxels.filter(v => {
//     if (v.type === 'added'   && !window.diffState.addedVisible)   return false
//     if (v.type === 'removed' && !window.diffState.removedVisible) return false
//     return true
//   })
// }

// export function reapplyDiffFilter(addedVisible, removedVisible) {
//   window.diffState.addedVisible   = addedVisible
//   window.diffState.removedVisible = removedVisible
//   renderVoxelDiff(getFilteredVoxels(), window.diffState.voxelSize)
// }


/**
 * diff.js
 *
 * Offloads voxelization + diff to the FastAPI server (/api/diff).
 * The browser only handles Cesium rendering of the returned voxels.
 *
 * Imports match the actual folder structure:
 *   src/cesium/cesiumInit.js
 *   src/cesium/layers.js
 *   src/cesium/polygonDraw.js
 */

import { CONFIG } from './config'
import { toast } from './cesium/cesiumInit'
import { loadCompare, renderVoxelDiff } from './cesium/layers'
import { getPolygonGeo } from './cesium/polygonDraw'

// ── Server base URL (set VITE_API_URL in .env to override) ───────────────
const API_BASE = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000'

// ── Global diff state (read by layers.js renderVoxelDiff) ─────────────────
window.diffState = {
  voxels:         [],
  voxelSize:      CONFIG.DEFAULTS.VOXEL_SIZE,
  addedVisible:   CONFIG.DEFAULTS.SHOW_ADDED,
  removedVisible: CONFIG.DEFAULTS.SHOW_REMOVED,
  gridDef:        null,   // { lonStep, latStep, hStep } — set after server response
}

// ═════════════════════════════════════════════════════════════════════════
//  ENTRY POINT
// ═════════════════════════════════════════════════════════════════════════

export async function runVoxelDiff(
  site, dateA, dateB, currentMode,
  voxSize, tintA, tintB, checkboxState,
  onDiffStatus, onStats,
) {
  const polygon = getPolygonGeo()   // [{lon, lat}] or null

  window.diffState.voxelSize      = voxSize
  window.diffState.addedVisible   = checkboxState?.added   ?? true
  window.diffState.removedVisible = checkboxState?.removed ?? true

  // 1. Load meshes for visual overlay in Cesium
  onDiffStatus('computing', `Loading meshes: ${dateA.label} vs ${dateB.label}…`)
  await loadCompare(site, dateA, dateB, currentMode, tintA, tintB, checkboxState)

  // 2. Call FastAPI server for the heavy computation
  onDiffStatus('computing',
    `Server: voxelizing${polygon ? ' (polygon filter)' : ''}…`)

  let data
  try {
    const res = await fetch(`${API_BASE}/api/diff`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path_a:   dateA.pointCloud,
        path_b:   dateB.pointCloud,
        vox_size: voxSize,
        polygon:  polygon ?? undefined,
      }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }))
      throw new Error(err.detail ?? `HTTP ${res.status}`)
    }

    data = await res.json()
  } catch (e) {
    toast(`Server error: ${e.message}`, 'err')
    onDiffStatus('done', `Error: ${e.message}`)
    return
  }

  // 3. Store voxels + gridDef in global state
  // Server returns snake_case; layers.js renderVoxelDiff reads camelCase
  // from window.diffState.gridDef — normalise here.
  window.diffState.voxels  = [...data.added, ...data.removed]
  window.diffState.gridDef = {
    lonStep: data.grid_def.lon_step,
    latStep: data.grid_def.lat_step,
    hStep:   data.grid_def.h_step,
  }

  // Server returns { iLon, iLat, iH, type } — layers.js reads v.voxel.iLon etc.
  // Wrap each item to match the shape layers.js expects.
  window.diffState.voxels = [...data.added, ...data.removed].map(v => ({
    voxel: { iLon: v.iLon, iLat: v.iLat, iH: v.iH },
    type:  v.type,
  }))

  // 4. Report stats to React
  onStats({
    added:   data.stats.added_count,
    removed: data.stats.removed_count,
    voxSize: data.vox_size,
    clipped: data.clipped,
  })

  // 5. Render voxels in Cesium
  renderVoxelDiff(getFilteredVoxels(), data.vox_size)

  onDiffStatus('done',
    `Done — ${data.stats.added_count} added, ${data.stats.removed_count} removed` +
    (data.clipped ? ' (polygon)' : ''))
}

// ── Visibility filter ─────────────────────────────────────────────────────

export function getFilteredVoxels() {
  return window.diffState.voxels.filter(v => {
    if (v.type === 'added'   && !window.diffState.addedVisible)   return false
    if (v.type === 'removed' && !window.diffState.removedVisible) return false
    return true
  })
}

export function reapplyDiffFilter(addedVisible, removedVisible) {
  window.diffState.addedVisible   = addedVisible
  window.diffState.removedVisible = removedVisible
  renderVoxelDiff(getFilteredVoxels(), window.diffState.voxelSize)
}