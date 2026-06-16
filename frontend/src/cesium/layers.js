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

const EXT_API = import.meta.env.VITE_EXTERNAL_API_URL ?? 'http://localhost:8080'
import { setStatus, toast, requestRender } from './cesiumInit'

export const state = {
  siteId:          null,
  dateId:          null,
  mesh:            null,   // single-date view layer (mesh)
  pc:              null,   // single-date view layer (point cloud)
  meshA:           null,   // compare A
  meshB:           null,   // compare B
  diffPrim:        null,   // voxel diff primitive (local compare mode)
  diffApiTs:       null,   // A/B full diff result tileset (compare-api mode)
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
  _rm(state.diffPrim); _rm(state.diffApiTs)
  for (const ts of Object.values(state.timeseriesTsMap)) _rm(ts)
  state.mesh = state.pc = state.meshA = state.meshB = state.diffPrim = state.diffApiTs = null
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
  setStatus(`Loading ${site.label} — ${dateObj.label}…`)

  const isMesh  = dateObj.datasetType === 'mesh'
  const maxSSE  = isMesh ? 8 : 2

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
      toast('✓ 포인트 클라우드 로드됨', 'ok')
    }
  } else if (tilesetUrl) {
    toast('데이터셋을 찾을 수 없습니다 — 경로를 확인하세요', 'warn')
  }

  syncVisibility(currentMode || 'compare', checkboxState)
  setStatus(`${site.label} — ${dateObj.label} 준비됨`, true)
}

export async function loadCompare(site, dateA, dateB, currentMode, tintA, tintB, checkboxState) {
  console.log(`[loadCompare] site=${site.id} A=${dateA.id} B=${dateB.id} mode=${currentMode}`)
  _rm(state.meshA); _rm(state.meshB)
  state.meshA = state.meshB = null

  setStatus(`비교 로드 중: ${dateA.label} vs ${dateB.label}…`)

  const [r0, r1] = await Promise.allSettled([
    _loadTileset(dateA.originalTilesetUrl, true, 8, dateA.datasetType),
    _loadTileset(dateB.originalTilesetUrl, true, 8, dateB.datasetType),
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
//  A/B FULL DIFF TILESET (compare-api mode)
// ═══════════════════════════════════════════════════════════════════════════

// ── Per-channel visibility state for compare-api diff tileset ─────────────
const _diffApiVis = { added: true, removed: true }

function _applyDiffApiStyle() {
  const ts = state.diffApiTs
  if (!ts) return
  // unchanged is always false for compare-api (tileset has no gray voxels)
  const shader = _buildCustomShader(_diffApiVis.added, _diffApiVis.removed, false)
  ts.customShader = shader ?? undefined
  console.log(`[_applyDiffApiStyle] added=${_diffApiVis.added} removed=${_diffApiVis.removed} shader=${shader ? 'custom' : 'none'}`)
  requestAnimationFrame(() => requestRender())
}

/**
 * Update added / removed visibility for the compare-api diff tileset.
 * Call from App.jsx whenever compareApiVis toggles change.
 */
export function setDiffApiTilesetVisibility(showAdded, showRemoved) {
  _diffApiVis.added   = showAdded
  _diffApiVis.removed = showRemoved
  console.log(`[setDiffApiTilesetVisibility] added=${showAdded} removed=${showRemoved}`)
  _applyDiffApiStyle()
}

/**
 * Load the result tileset from an A/B full diff and store it in state.diffApiTs.
 * Replaces any previously loaded diff tileset.
 * The tileset is shown immediately (mode must be compare-api at this point).
 *
 * @param {string} tilesetUrl  — absolute URL to visualization/tileset.json
 */
export async function loadDiffApiTileset(tilesetUrl) {
  console.log('[loadDiffApiTileset] url:', tilesetUrl)
  _rm(state.diffApiTs)
  state.diffApiTs = null

  if (!tilesetUrl) return

  const ts = await _loadTileset(tilesetUrl, true, 4, 'mesh', null)
  if (ts) {
    state.diffApiTs = ts
    // Apply current visibility state (honours toggles set before/after load)
    _applyDiffApiStyle()
    console.log('[loadDiffApiTileset] loaded OK')
  } else {
    console.warn('[loadDiffApiTileset] failed to load tileset:', tilesetUrl)
  }

  requestAnimationFrame(() => requestRender())
}

/**
 * Clear the A/B diff tileset (call on clear/reset).
 */
export function clearDiffApiTileset() {
  _rm(state.diffApiTs)
  state.diffApiTs = null
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

  const toLoad = snapshots.filter(s => s.tilesetUrl && !(s.id in state.timeseriesTsMap))
  console.log(`[loadAllSnapshotTilesets] ${toLoad.length} to load, ${snapshots.length - toLoad.length} already cached`)

  if (!toLoad.length) return

  const results = await Promise.allSettled(
    toLoad.map(async s => {
      console.log(`[loadAllSnapshotTilesets] loading snapshot ${s.id} url=${s.tilesetUrl}`)
      const ts = await _loadTileset(s.tilesetUrl, false, 2, 'mesh', null)
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

  // Re-apply current visibility filter to the newly active tileset
  _applySnapshotStyle(state.activeSnapshotId)

  requestAnimationFrame(() => requestRender())
}

// ── Per-channel visibility state for timeline tilesets ─────────────────────
// Defaults mirror CONFIG.DEFAULTS so the initial view shows everything.
const _tlVis = { added: true, removed: true, unchanged: true }

/**
 * Build a CustomShader that classifies voxels by their baked diffuse color
 * and discards fragments belonging to hidden categories.
 *
 * Classification (0-1 normalised):
 *   red / pink  → added     R > 0.5 AND R > G*1.4 AND R > B*1.4
 *   blue        → removed   B > 0.5 AND B > R*1.3 AND B > G*1.3
 *   gray        → unchanged everything else (balanced channels)
 *
 * When all three categories are visible the shader is null and Cesium renders
 * at full speed with no custom code in the pipeline.
 */
function _buildCustomShader(showAdded, showRemoved, showUnchanged) {
  // All visible — no shader needed
  if (showAdded && showRemoved && showUnchanged) return null

  // Nothing visible — discard everything
  if (!showAdded && !showRemoved && !showUnchanged) {
    return new window.Cesium.CustomShader({
      fragmentShaderText: `
void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
  discard;
}`,
    })
  }

  // Classify helpers (mirror the thresholds in comments above)
  const IS_RED  = 'material.diffuse.r > 0.5 && material.diffuse.r > material.diffuse.g * 1.4 && material.diffuse.r > material.diffuse.b * 1.4'
  const IS_BLUE = 'material.diffuse.b > 0.5 && material.diffuse.b > material.diffuse.r * 1.3 && material.diffuse.b > material.diffuse.g * 1.3'

  const lines = []
  if (!showAdded)     lines.push(`  if (${IS_RED})  { discard; }`)
  if (!showRemoved)   lines.push(`  if (${IS_BLUE}) { discard; }`)
  if (!showUnchanged) lines.push(`  if (!(${IS_RED}) && !(${IS_BLUE})) { discard; }`)

  return new window.Cesium.CustomShader({
    fragmentShaderText: `
void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
${lines.join('\n')}
}`,
  })
}

/**
 * Apply (or remove) a CustomShader to the active snapshot tileset.
 * Called internally after every show/hide and whenever toggles change.
 */
function _applySnapshotStyle(snapshotId) {
  const ts = snapshotId ? state.timeseriesTsMap[snapshotId] : null
  if (!ts) return

  const shader = _buildCustomShader(_tlVis.added, _tlVis.removed, _tlVis.unchanged)
  ts.customShader = shader ?? undefined   // undefined removes any previously set shader

  console.log(`[_applySnapshotStyle] snapshot=${snapshotId} shader=${shader ? 'custom' : 'none (all visible)'}`)
  requestAnimationFrame(() => requestRender())
}

/**
 * Update added / removed / unchanged visibility for the active timeline tileset.
 * Call this from App.jsx whenever the timeline visibility toggles change.
 *
 * @param {boolean} showAdded
 * @param {boolean} showRemoved
 * @param {boolean} showUnchanged
 */
export function setSnapshotTilesetVisibility(showAdded, showRemoved, showUnchanged) {
  _tlVis.added     = showAdded
  _tlVis.removed   = showRemoved
  _tlVis.unchanged = showUnchanged
  console.log(`[setSnapshotTilesetVisibility] added=${showAdded} removed=${showRemoved} unchanged=${showUnchanged}`)
  _applySnapshotStyle(state.activeSnapshotId)
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