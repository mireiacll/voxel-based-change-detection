/**
 * layers.js — ES module
 *
 * VISIBILITY RULES (strict per-mode isolation):
 *   compare      → mesh/pc ✓  meshA/meshB ✓  diffPrim ✓  timeseriesTs[any] ✗
 *   compare-api  → mesh/pc ✓  meshA/meshB ✗  diffPrim ✗  timeseriesTs[any] ✗
 *   timeline     → mesh/pc ✓  meshA/meshB ✗  diffPrim ✗  timeseriesTs[active] ✓
 *
 * Timeseries tilesets are ALL preloaded once per site (show=false), then we
 * just flip .show on the active one in timeline mode. No reload on scrub.
 */

import { CONFIG } from '../config'
import { setStatus, toast, requestRender } from './cesiumInit'

export const state = {
  siteId:          null,
  dateId:          null,
  mesh:            null,   // single-date view layer (mesh)
  pc:              null,   // single-date view layer (point cloud)
  meshA:           null,   // compare A
  meshB:           null,   // compare B
  diffPrim:        null,   // voxel diff primitive
  // Timeline: map of snapshot.id → Cesium3DTileset (all preloaded, show toggled)
  timeseriesTsMap: {},
  // Which snapshot id is currently "active" (show=true) in timeline
  activeSnapshotId: null,
}

let _pointSize = CONFIG.DEFAULTS.POINT_SIZE

// ═══════════════════════════════════════════════════════════════════════════
//  VISIBILITY SYNC
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @param {string}  mode           — 'compare' | 'compare-api' | 'timeline'
 * @param {object}  checkboxState  — { dataset, dateA, dateB }
 */
export function syncVisibility(mode, checkboxState) {
  const {
    dataset = true,
    dateA   = true,
    dateB   = true,
  } = checkboxState || {}

  const inCompare    = mode === 'compare'
  const inCompareApi = mode === 'compare-api'
  const inTimeline   = mode === 'timeline'

  console.log(`[syncVisibility] mode=${mode}`, {
    hasMesh: !!state.mesh, hasPc: !!state.pc,
    hasMeshA: !!state.meshA, hasMeshB: !!state.meshB,
    hasDiffPrim: !!state.diffPrim,
    timeseriesTsCount: Object.keys(state.timeseriesTsMap).length,
    activeSnapshotId: state.activeSnapshotId,
  })

  // Single-date background layer
  if (state.mesh) { state.mesh.show =  dataset; console.log(`[syncVisibility]   mesh.show = ${state.mesh.show}`) }
  if (state.pc)   { state.pc.show   = dataset; console.log(`[syncVisibility]   pc.show   = ${state.pc.show}`) }

  // A/B comparison layers — only in compare mode
  if (state.meshA) { state.meshA.show = inCompare && dateA; console.log(`[syncVisibility]   meshA.show = ${state.meshA.show}`) }
  if (state.meshB) { state.meshB.show = inCompare && dateB; console.log(`[syncVisibility]   meshB.show = ${state.meshB.show}`) }

  // Diff primitive — only in compare mode, never in timeline/compare-api
  if (state.diffPrim) {
    state.diffPrim.show = inCompare
    console.log(`[syncVisibility]   diffPrim.show = ${state.diffPrim.show}`)
  }

  // Timeseries tilesets — ALL hidden unless in timeline, then only active one shown
  for (const [snapId, ts] of Object.entries(state.timeseriesTsMap)) {
    if (!ts) continue
    const shouldShow = inTimeline && snapId === state.activeSnapshotId
    ts.show = shouldShow
    console.log(`[syncVisibility]   timeseriesTs[${snapId}].show = ${shouldShow}`)
  }

  requestAnimationFrame(() => requestRender())
}

// ═══════════════════════════════════════════════════════════════════════════
//  TINT HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function _hexToRgb(hex) {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  }
}

function _makeTintStyle(hex, alpha) {
  const { r, g, b } = _hexToRgb(hex)
  return new window.Cesium.Cesium3DTileStyle({
    color: `rgba(${r}, ${g}, ${b}, ${alpha})`
  })
}

export function setDateATint(hex, alpha) {
  if (state.meshA) state.meshA.style = _makeTintStyle(hex, alpha)
  requestAnimationFrame(() => requestRender())
}

export function setDateBTint(hex, alpha) {
  if (state.meshB) state.meshB.style = _makeTintStyle(hex, alpha)
  requestAnimationFrame(() => requestRender())
}

// ═══════════════════════════════════════════════════════════════════════════
//  CLEAR HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function _rm(t) {
  if (t) try { window.viewer.scene.primitives.remove(t) } catch (_) {}
}

export function clearLayers() {
  console.log('[clearLayers] removing background date layers (mesh/pc) — preserving diffPrim and compare layers')
  _rm(state.mesh);  _rm(state.pc)
  state.mesh = state.pc = null
  // NOTE: does NOT touch meshA, meshB, diffPrim — those are owned by compare flow
  // NOTE: does NOT touch timeseriesTsMap — those are owned by timeline flow
  requestAnimationFrame(() => requestRender())
}

/** Full wipe — use only on project open/close, not on date toggles. */
export function clearAllLayers() {
  console.log('[clearAllLayers] full wipe of all layers')
  _rm(state.mesh);  _rm(state.pc)
  _rm(state.meshA); _rm(state.meshB)
  _rm(state.diffPrim)
  for (const ts of Object.values(state.timeseriesTsMap)) _rm(ts)
  state.mesh = state.pc = state.meshA = state.meshB = state.diffPrim = null
  state.timeseriesTsMap  = {}
  state.activeSnapshotId = null
  if (window.diffState) { window.diffState.voxels = []; window.diffState.gridDef = null }
  requestAnimationFrame(() => requestRender())
}

export function clearCompareLayers() {
  console.log('[clearCompareLayers] removing compare layers')
  _rm(state.meshA); _rm(state.meshB); _rm(state.diffPrim)
  state.meshA = state.meshB = state.diffPrim = null
  if (window.diffState) window.diffState.voxels = []
  requestAnimationFrame(() => requestRender())
}

// ═══════════════════════════════════════════════════════════════════════════
//  LOADERS
// ═══════════════════════════════════════════════════════════════════════════

export async function loadDate(site, dateObj, currentMode, checkboxState) {
  console.log(`[loadDate] site=${site.id} date=${dateObj.id} mode=${currentMode}`)
  _rm(state.mesh); _rm(state.pc)
  state.mesh = state.pc = null

  state.siteId = site.id
  state.dateId = dateObj.id
  setStatus(`Loading ${site.labelEn ?? site.label} — ${dateObj.label}…`)

  const zOffset = site.meshZOffset ?? CONFIG.DEFAULTS.MESH_Z_OFFSET
  const isMesh  = dateObj.datasetType === 'mesh'
  const maxSSE  = isMesh ? 8 : 2
  const useZOff = isMesh ? zOffset : null

  const [result] = await Promise.allSettled([
    _loadTileset(dateObj.datasetPath, true, maxSSE, dateObj.datasetType, useZOff),
  ])

  if (result.value) {
    if (isMesh) {
      state.mesh = result.value
      toast('✓ 3D Mesh 로드됨', 'ok')
    } else {
      state.pc = result.value
      setPointSize(state.pc, _pointSize)
      toast('✓ 포인트 클라우드 로드됨', 'ok')
    }
  } else if (dateObj.datasetPath) {
    toast('데이터셋을 찾을 수 없습니다 — 경로를 확인하세요', 'warn')
  }

  syncVisibility(currentMode || 'compare', checkboxState)
  setStatus(`${site.labelEn ?? site.label} — ${dateObj.label} 준비됨`, true)
}

export async function loadCompare(site, dateA, dateB, currentMode, tintA, tintB, checkboxState) {
  console.log(`[loadCompare] site=${site.id} A=${dateA.id} B=${dateB.id} mode=${currentMode}`)
  _rm(state.meshA); _rm(state.meshB)
  state.meshA = state.meshB = null

  setStatus(`비교 로드 중: ${dateA.label} vs ${dateB.label}…`)

  const zOffset = site.meshZOffset ?? CONFIG.DEFAULTS.MESH_Z_OFFSET

  const [r0, r1] = await Promise.allSettled([
    _loadTileset(dateA.datasetPath, true, 8, dateA.datasetType, zOffset),
    _loadTileset(dateB.datasetPath, true, 8, dateB.datasetType, zOffset),
  ])

  state.meshA = r0.value || null
  state.meshB = r1.value || null

  const ta = tintA || { hex: '#d49050', alpha: 0.9 }
  const tb = tintB || { hex: '#4d9fff', alpha: 0.9 }
  if (state.meshA) state.meshA.style = _makeTintStyle(ta.hex, ta.alpha)
  if (state.meshB) state.meshB.style = _makeTintStyle(tb.hex, tb.alpha)

  syncVisibility(currentMode || 'compare', checkboxState)
  setStatus(`비교: ${dateA.label} vs ${dateB.label}`, true)
  requestAnimationFrame(() => requestRender())
}

// ═══════════════════════════════════════════════════════════════════════════
//  URL CACHE INVALIDATION
// ═══════════════════════════════════════════════════════════════════════════

const _urlVersion = new Map()

export function invalidateTilesetUrl(url) {
  if (!url) return
  const base = url.split('?')[0]
  _urlVersion.set(base, (_urlVersion.get(base) ?? 0) + 1)
  console.log('[invalidateTilesetUrl]', base, 'v=', _urlVersion.get(base))
}

// ═══════════════════════════════════════════════════════════════════════════
//  GENERIC TILESET LOADER (internal)
// ═══════════════════════════════════════════════════════════════════════════

async function _loadTileset(url, show, maxSSE, datasetType, zOffset) {
  if (!url) return null
  try {
    const Cesium   = window.Cesium
    const base     = url.split('?')[0]
    const version  = _urlVersion.get(base) ?? 0
    const finalUrl = version > 0 ? `${base}?v=${version}` : base

    console.log(`[_loadTileset] loading url=${finalUrl} show=${show}`)
    const ts = await Cesium.Cesium3DTileset.fromUrl(finalUrl, {
      maximumScreenSpaceError: maxSSE,
    })
    window.viewer.scene.primitives.add(ts)
    ts.show = show

    if (datasetType === 'mesh' && zOffset != null) {
      const center = ts.boundingSphere.center
      const carto  = Cesium.Cartographic.fromCartesian(center)
      const offset = Cesium.Cartesian3.fromRadians(
        carto.longitude, carto.latitude,
        carto.height + zOffset
      )
      const translation = Cesium.Cartesian3.subtract(
        offset, center, new Cesium.Cartesian3()
      )
      ts.modelMatrix = Cesium.Matrix4.fromTranslation(translation)
    }

    ts.allTilesLoaded.addEventListener(() => {
      requestAnimationFrame(() => requestRender())
    })

    console.log(`[_loadTileset] loaded OK url=${finalUrl}`)
    return ts
  } catch (e) {
    console.warn('[_loadTileset] Failed:', url, e)
    return null
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  POINT SIZE
// ═══════════════════════════════════════════════════════════════════════════

export function setPointSize(ts, size) {
  if (!ts) return
  ts.pointCloudShading.attenuation        = true
  ts.pointCloudShading.maximumAttenuation = parseFloat(size) || 1
}

export function applyPcStyle(pointSize) {
  _pointSize = pointSize
  if (state.pc) setPointSize(state.pc, pointSize)
  requestAnimationFrame(() => requestRender())
}

// ═══════════════════════════════════════════════════════════════════════════
//  VOXEL DIFF RENDERER
// ═══════════════════════════════════════════════════════════════════════════

export function renderVoxelDiff(voxels, voxelSize) {
  console.log(`[renderVoxelDiff] voxels=${voxels?.length ?? 0} voxelSize=${voxelSize}`)
  _rm(state.diffPrim)
  state.diffPrim = null

  if (!voxels?.length) {
    requestAnimationFrame(() => requestRender())
    return
  }

  const Cesium   = window.Cesium
  const addedC   = Cesium.Color.fromCssColorString(CONFIG.DIFF_COLORS.ADDED)
  const removedC = Cesium.Color.fromCssColorString(CONFIG.DIFF_COLORS.REMOVED)

  const { lonStep, latStep, hStep } = window.diffState.gridDef

  const instances = voxels.map(v => {
    const { iLon, iLat, iH } = v.voxel
    const lon    = (iLon + 0.5) * lonStep
    const lat    = (iLat + 0.5) * latStep
    const h      = (iH   + 0.5) * hStep
    const center = Cesium.Cartesian3.fromDegrees(lon, lat, h)
    const col    = (v.type === 'added' ? addedC : removedC).withAlpha(0.85)

    return new Cesium.GeometryInstance({
      geometry: Cesium.BoxGeometry.fromDimensions({
        dimensions:   new Cesium.Cartesian3(voxelSize, voxelSize, voxelSize),
        vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
      }),
      modelMatrix: Cesium.Transforms.eastNorthUpToFixedFrame(center),
      attributes:  { color: Cesium.ColorGeometryInstanceAttribute.fromColor(col) },
    })
  })

  state.diffPrim = window.viewer.scene.primitives.add(
    new Cesium.Primitive({
      geometryInstances:        instances,
      appearance:               new Cesium.PerInstanceColorAppearance({ translucent: true, closed: true }),
      releaseGeometryInstances: true,
      compressVertices:         false,
    })
  )

  requestAnimationFrame(() => requestRender())
}

// ═══════════════════════════════════════════════════════════════════════════
//  TIMESERIES — PRELOAD ALL + SHOW/HIDE BY ID
//
//  loadAllSnapshotTilesets(snapshots)
//    → loads every snapshot with a tileset_path into state.timeseriesTsMap,
//      all with show=false. Safe to call multiple times (skips already loaded).
//
//  showSnapshotTileset(snapshotId)
//    → hides all timeseries tilesets, shows only the one for snapshotId.
//      Call this ONLY when mode === 'timeline'.
//
//  These replace the old renderSnapshotTileset / clearTimeseriesLayer / 
//  loadTimeseriesTileset pattern which destroyed and reloaded on every scrub.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Preload all snapshot tilesets for a site (all hidden).
 * No-ops for snapshots already in the map or without a tileset_path.
 * Returns a promise that resolves when all loads settle.
 */
export async function loadAllSnapshotTilesets(snapshots) {
  if (!snapshots?.length) return

  const toLoad = snapshots.filter(s => s.tileset_path && !(s.id in state.timeseriesTsMap))
  console.log(`[loadAllSnapshotTilesets] ${toLoad.length} to load, ${snapshots.length - toLoad.length} already cached`)

  if (!toLoad.length) return

  const results = await Promise.allSettled(
    toLoad.map(async s => {
      console.log(`[loadAllSnapshotTilesets] loading snapshot ${s.id} path=${s.tileset_path}`)
      const ts = await _loadTileset(s.tileset_path, false, 2, 'mesh', null)
      if (ts) {
        state.timeseriesTsMap[s.id] = ts
        console.log(`[loadAllSnapshotTilesets] loaded OK snapshot ${s.id}`)
      } else {
        console.warn(`[loadAllSnapshotTilesets] failed to load snapshot ${s.id}`)
        state.timeseriesTsMap[s.id] = null   // mark as attempted so we don't retry
      }
    })
  )

  console.log(`[loadAllSnapshotTilesets] done — map keys: [${Object.keys(state.timeseriesTsMap).join(', ')}]`)
}

/**
 * Show only the tileset for snapshotId; hide all others.
 * Must only be called when mode === 'timeline'.
 */
export function showSnapshotTileset(snapshotId) {
  console.log(`[showSnapshotTileset] activating snapshot=${snapshotId}`)
  state.activeSnapshotId = snapshotId

  let shown = 0, hidden = 0
  for (const [id, ts] of Object.entries(state.timeseriesTsMap)) {
    if (!ts) continue
    ts.show = (id === snapshotId)
    if (ts.show) shown++; else hidden++
  }
  console.log(`[showSnapshotTileset] shown=${shown} hidden=${hidden}`)
  requestAnimationFrame(() => requestRender())
}

/**
 * Clear all preloaded timeseries tilesets (call when forcing a recompute).
 */
export function clearAllSnapshotTilesets() {
  console.log(`[clearAllSnapshotTilesets] removing ${Object.keys(state.timeseriesTsMap).length} tilesets`)
  for (const ts of Object.values(state.timeseriesTsMap)) _rm(ts)
  state.timeseriesTsMap  = {}
  state.activeSnapshotId = null
  requestAnimationFrame(() => requestRender())
}