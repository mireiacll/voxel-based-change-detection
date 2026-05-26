/**
 * diff.js — ES module version
 *
 * Client-side 3-D change detection with polygon area filter.
 * All DOM interaction removed — results are returned via callbacks passed
 * from React (App.jsx) so the component can update its own state.
 *
 * See original diff.js for full algorithm documentation.
 */

import { CONFIG } from './config'
import { toast } from './cesium/cesiumInit'
import { loadCompare, renderVoxelDiff } from './cesium/layers'
import { loadAllPoints } from './lib/glbParser'
import { makeGridDef, buildSurface, solidify, diffSolid} from './lib/voxelizer'
import { getPolygonGeo } from './cesium/polygonDraw'

// ── Global diff state (read by layers.js) ─────────────────────────────────
window.diffState = {
  voxels:         [],
  voxelSize:      CONFIG.DEFAULTS.VOXEL_SIZE,
  addedVisible:   CONFIG.DEFAULTS.SHOW_ADDED,
  removedVisible: CONFIG.DEFAULTS.SHOW_REMOVED,
  gridDef: null,
}

// ═════════════════════════════════════════════════════════════════════════
//  ENTRY POINT
// ═════════════════════════════════════════════════════════════════════════

/**
 * @param {object}   site
 * @param {object}   dateA
 * @param {object}   dateB
 * @param {string}   currentMode
 * @param {number}   voxSize         — from React state (voxel size input)
 * @param {object}   tintA           — { hex, alpha } from React state
 * @param {object}   tintB           — { hex, alpha } from React state
 * @param {object}   checkboxState   — { mesh, pc, dateA, dateB, added, removed }
 * @param {function} onDiffStatus    — (state, msg) => void   → React state
 * @param {function} onStats         — ({ added, removed, net, voxels, clipped }) => void
 */
export async function runVoxelDiff(
  site, dateA, dateB, currentMode,
  voxSize, tintA, tintB, checkboxState,
  onDiffStatus, onStats
) {
  //const polygon = _poly.closed ? _poly.geo : null
  const polygon = getPolygonGeo()

  window.diffState.voxelSize      = voxSize
  window.diffState.addedVisible   = checkboxState?.added   ?? true
  window.diffState.removedVisible = checkboxState?.removed ?? true

  // 1. Load meshes for visual display
  onDiffStatus('computing', `Loading meshes: ${dateA.label} vs ${dateB.label}…`)
  await loadCompare(site, dateA, dateB, currentMode, tintA, tintB, checkboxState)

  // 2. Fetch all point cloud GLBs in parallel
  onDiffStatus('computing', `Fetching point clouds${polygon ? ' (polygon filter)' : ''}…`)

  const [rawA, rawB] = await Promise.all([
    // _loadAllPoints(dateA.pointCloud),
    // _loadAllPoints(dateB.pointCloud),
    loadAllPoints(dateA.pointCloud),
    loadAllPoints(dateB.pointCloud),
  ])

  console.log(`[diff] Raw points — A: ${rawA.length}, B: ${rawB.length}`)

  if (!rawA.length && !rawB.length) {
    toast('No point cloud data — check pointCloud paths in config.js', 'warn')
    onDiffStatus('done', 'No data loaded')
    return
  }

  // 3. Build grid definition
  const gridDef = makeGridDef([...rawA, ...rawB], voxSize)
  window.diffState.gridDef = gridDef

  // 4. Build sparse surface maps
  onDiffStatus('computing', `Voxelizing ${rawA.length + rawB.length} points @ ${voxSize}m…`)

  const surfaceA = buildSurface(rawA, gridDef, polygon)
  const surfaceB = buildSurface(rawB, gridDef, polygon)
  console.log(`[diff] Surface voxels — A: ${surfaceA.size}, B: ${surfaceB.size}`)

  // 5. Solidify
  const { solidA, solidB } = solidify(surfaceA, surfaceB, gridDef)

  // 6. Compute diff
  const { added, removed } = diffSolid(solidA, solidB)
  console.log(`[diff] Diff — added: ${added.length}, removed: ${removed.length}`)
  window.diffState.voxels = [...added, ...removed]

  // Report stats to React
  onStats({
    added:   added.length,
    removed: removed.length,
    voxSize,
    clipped: polygon !== null,
  })

  renderVoxelDiff(getFilteredVoxels(), voxSize)
  onDiffStatus('done',
    `Done — ${added.length} added, ${removed.length} removed` +
    (polygon ? ' (polygon)' : ''))
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