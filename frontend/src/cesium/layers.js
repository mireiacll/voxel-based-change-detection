/**
 * layers.js — ES module
 *
 * VISIBILITY RULES (strict per-mode isolation):
 *   compare-api  → mesh/pc ✓  diffApiTs ✓  timeseriesTs[any] ✗
 *   timeline     → mesh/pc ✓  timeseriesTs[active] ✓
 *
 * Timeseries tilesets are ALL preloaded once per site (show=false), then we
 * just flip .show on the active one in timeline mode. No reload on scrub.
 */

import { CONFIG } from '../config'
import { setStatus, toast, requestRender } from './cesiumInit'

export const state = {
  siteId:           null,
  dateId:           null,
  mesh:             null,   // single-date view layer (mesh)
  pc:               null,   // single-date view layer (point cloud)
  diffApiTs:        null,   // A/B full diff result tileset (compare-api mode)
  timeseriesTsMap:  {},     // snapshot.id → Cesium3DTileset (all preloaded, show toggled)
  activeSnapshotId: null,
}

let _pointSize = CONFIG.DEFAULTS.POINT_SIZE

// ═══════════════════════════════════════════════════════════════════════════
//  VISIBILITY SYNC
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @param {string} mode — 'compare-api' | 'timeline'
 */
export function syncVisibility(mode) {
  const inCompareApi = mode === 'compare-api'
  const inTimeline   = mode === 'timeline'

  console.log(`[syncVisibility] mode=${mode}`, {
    hasMesh: !!state.mesh, hasPc: !!state.pc,
    timeseriesTsCount: Object.keys(state.timeseriesTsMap).length,
    activeSnapshotId: state.activeSnapshotId,
  })

  // Single-date background layer — always visible
  if (state.mesh) { state.mesh.show = true; console.log(`[syncVisibility]   mesh.show = true`) }
  if (state.pc)   { state.pc.show   = true; console.log(`[syncVisibility]   pc.show   = true`) }

  // A/B full diff tileset — only in compare-api mode
  if (state.diffApiTs) {
    state.diffApiTs.show = inCompareApi
    console.log(`[syncVisibility]   diffApiTs.show = ${state.diffApiTs.show}`)
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
//  CLEAR HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function _rm(t) {
  if (t) try { window.viewer.scene.primitives.remove(t) } catch (_) {}
}

/** Remove the single-date background layers (mesh/pc). Does not touch timeseries. */
export function clearLayers() {
  console.log('[clearLayers] removing background date layers (mesh/pc)')
  _rm(state.mesh); _rm(state.pc)
  state.mesh = state.pc = null
  requestAnimationFrame(() => requestRender())
}

/** Full wipe — use only on project open/close, not on date toggles. */
export function clearAllLayers() {
  console.log('[clearAllLayers] full wipe of all layers')
  _rm(state.mesh); _rm(state.pc)
  _rm(state.diffApiTs)
  for (const ts of Object.values(state.timeseriesTsMap)) _rm(ts)
  state.mesh = state.pc = state.diffApiTs = null
  state.timeseriesTsMap  = {}
  state.activeSnapshotId = null
  requestAnimationFrame(() => requestRender())
}

// ═══════════════════════════════════════════════════════════════════════════
//  LOADERS
// ═══════════════════════════════════════════════════════════════════════════

export async function loadDate(site, dateObj, currentMode) {
  console.log(`[loadDate] site=${site.id} date=${dateObj.id} mode=${currentMode}`)
  _rm(state.mesh); _rm(state.pc)
  state.mesh = state.pc = null

  state.siteId = site.id
  state.dateId = dateObj.id
  setStatus(`Loading ${site.label} — ${dateObj.label}…`)

  const isMesh     = dateObj.datasetType === 'mesh'
  const maxSSE     = isMesh ? 8 : 2
  // originalTilesetUrl is absolute (http://localhost:8080/…) thanks to
  // _toAbsoluteUrl() in api.js — never pass the raw datasetPath to Cesium.
  const tilesetUrl = dateObj.originalTilesetUrl

  const [result] = await Promise.allSettled([
    _loadTileset(tilesetUrl, true, maxSSE, dateObj.datasetType),
  ])

  if (result.value) {
    if (isMesh) {
      state.mesh = result.value
      toast('✓ 3D Mesh 로드됨', 'ok')
    } else {
      state.pc = result.value
      setPointSize(state.pc, _pointSize)
      if (dateObj.datasetType === 'voxel') {
        state.pc.customShader = _buildCustomShader(true, true, true)
      }
      toast('✓ 포인트 클라우드 로드됨', 'ok')
    }
  } else if (tilesetUrl) {
    toast('데이터셋을 찾을 수 없습니다 — 경로를 확인하세요', 'warn')
  }

  syncVisibility(currentMode || 'compare-api')
  setStatus(`${site.label} — ${dateObj.label} 준비됨`, true)
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

async function _loadTileset(url, show, maxSSE, datasetType) {
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

    if (datasetType === 'mesh') {
      const center = ts.boundingSphere.center
      const carto  = Cesium.Cartographic.fromCartesian(center)
      const offset = Cesium.Cartesian3.fromRadians(
        carto.longitude, carto.latitude,
        carto.height
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
//  CUSTOM SHADER (voxel color classification)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Build a CustomShader that classifies voxels by their baked diffuse color,
 * discards hidden categories, and recolors visible ones to exact brand colors.
 *
 * Classification — check which RGB channel dominates (loose thresholds
 * so it works regardless of the exact baked value):
 *   red dominant  → added     (#ff4d4d  vec3(1.0,   0.302, 0.302))
 *   blue dominant → removed   (#4d9fff  vec3(0.302, 0.624, 1.0))
 *   neither       → unchanged
 */
function _buildCustomShader(showAdded, showRemoved, showUnchanged) {
  const IS_RED  = '(material.diffuse.r > material.diffuse.b * 1.2 && material.diffuse.r > material.diffuse.g * 1.2)'
  const IS_BLUE = '(material.diffuse.b > material.diffuse.r * 1.2 && material.diffuse.b > material.diffuse.g * 1.2)'

  const discardAdded     = !showAdded     ? 'if (isRed)             { discard; }' : ''
  const discardRemoved   = !showRemoved   ? 'if (isBlue)            { discard; }' : ''
  const discardUnchanged = !showUnchanged ? 'if (!isRed && !isBlue) { discard; }' : ''

  return new window.Cesium.CustomShader({
    lightingModel: window.Cesium.LightingModel.PBR,
    fragmentShaderText: `
void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
  bool isRed  = ${IS_RED};
  bool isBlue = ${IS_BLUE};
  ${discardAdded}
  ${discardRemoved}
  ${discardUnchanged}
}`,
  })
}

// ═══════════════════════════════════════════════════════════════════════════
//  A/B FULL DIFF TILESET (compare-api mode)
// ═══════════════════════════════════════════════════════════════════════════

const _diffApiVis = { added: true, removed: true, unchanged: true }

function _applyDiffApiStyle() {
  const ts = state.diffApiTs
  if (!ts) return
  ts.customShader = _buildCustomShader(_diffApiVis.added, _diffApiVis.removed, _diffApiVis.unchanged) ?? undefined
  console.log(`[_applyDiffApiStyle] added=${_diffApiVis.added} removed=${_diffApiVis.removed}`)
  requestAnimationFrame(() => requestRender())
}

/**
 * Update added / removed visibility for the compare-api diff tileset.
 * Call from App.jsx whenever compareApiVis toggles change.
 */
export function setDiffApiTilesetVisibility(showAdded, showRemoved, showUnchanged) {
  _diffApiVis.added     = showAdded
  _diffApiVis.removed   = showRemoved
  _diffApiVis.unchanged = showUnchanged ?? _diffApiVis.unchanged
  console.log(`[setDiffApiTilesetVisibility] added=${showAdded} removed=${showRemoved} unchanged=${_diffApiVis.unchanged}`)
  _applyDiffApiStyle()
}

/**
 * Load the result tileset from an A/B full diff and store it in state.diffApiTs.
 * Replaces any previously loaded diff tileset.
 *
 * @param {string} tilesetUrl — absolute URL to visualization/tileset.json
 */
export async function loadDiffApiTileset(tilesetUrl) {
  console.log('[loadDiffApiTileset] url:', tilesetUrl)
  _rm(state.diffApiTs)
  state.diffApiTs = null

  if (!tilesetUrl) return

  const ts = await _loadTileset(tilesetUrl, true, 4, 'mesh')
  if (ts) {
    state.diffApiTs = ts
    _applyDiffApiStyle()
    console.log('[loadDiffApiTileset] loaded OK — url was:', tilesetUrl)
  } else {
    console.warn('[loadDiffApiTileset] failed to load tileset:', tilesetUrl)
  }

  requestAnimationFrame(() => requestRender())
}

/** Clear the A/B diff tileset (call on clear/reset). */
export function clearDiffApiTileset() {
  _rm(state.diffApiTs)
  state.diffApiTs = null
  requestAnimationFrame(() => requestRender())
}

// ═══════════════════════════════════════════════════════════════════════════
//  TIMESERIES — PRELOAD ALL + SHOW/HIDE BY ID
//
//  loadAllSnapshotTilesets(snapshots)
//    → loads every snapshot with a tilesetUrl into state.timeseriesTsMap,
//      all with show=false. Safe to call multiple times (skips already loaded).
//
//  showSnapshotTileset(snapshotId)
//    → hides all timeseries tilesets, shows only the one for snapshotId.
//      Call this ONLY when mode === 'timeline'.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Preload all snapshot tilesets for a site (all hidden).
 * No-ops for snapshots already in the map or without a tilesetUrl.
 */
export async function loadAllSnapshotTilesets(snapshots) {
  if (!snapshots?.length) return

  const toLoad = snapshots.filter(s => s.tilesetUrl && !(s.id in state.timeseriesTsMap))
  console.log(`[loadAllSnapshotTilesets] ${toLoad.length} to load, ${snapshots.length - toLoad.length} already cached`)

  if (!toLoad.length) return

  await Promise.allSettled(
    toLoad.map(async s => {
      console.log(`[loadAllSnapshotTilesets] loading snapshot ${s.id} url=${s.tilesetUrl}`)
      const ts = await _loadTileset(s.tilesetUrl, false, 2, 'mesh')
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

  _applySnapshotStyle(state.activeSnapshotId)
  requestAnimationFrame(() => requestRender())
}

// Per-channel visibility state for timeline tilesets
const _tlVis = { added: true, removed: true, unchanged: true }

function _applySnapshotStyle(snapshotId) {
  const ts = snapshotId ? state.timeseriesTsMap[snapshotId] : null
  if (!ts) return
  ts.customShader = _buildCustomShader(_tlVis.added, _tlVis.removed, _tlVis.unchanged) ?? undefined
  console.log(`[_applySnapshotStyle] snapshot=${snapshotId}`)
  requestAnimationFrame(() => requestRender())
}

/**
 * Update added / removed / unchanged visibility for the active timeline tileset.
 * Call from App.jsx whenever the timeline visibility toggles change.
 */
export function setSnapshotTilesetVisibility(showAdded, showRemoved, showUnchanged) {
  _tlVis.added     = showAdded
  _tlVis.removed   = showRemoved
  _tlVis.unchanged = showUnchanged
  console.log(`[setSnapshotTilesetVisibility] added=${showAdded} removed=${showRemoved} unchanged=${showUnchanged}`)
  _applySnapshotStyle(state.activeSnapshotId)
}

/** Clear all preloaded timeseries tilesets (call when forcing a recompute). */
export function clearAllSnapshotTilesets() {
  console.log(`[clearAllSnapshotTilesets] removing ${Object.keys(state.timeseriesTsMap).length} tilesets`)
  for (const ts of Object.values(state.timeseriesTsMap)) _rm(ts)
  state.timeseriesTsMap  = {}
  state.activeSnapshotId = null
  requestAnimationFrame(() => requestRender())
}