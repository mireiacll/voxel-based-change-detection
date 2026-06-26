/**
 * layers.js — tileset loading, visibility, and voxel shader.
 *
 * Visibility rules (strict per-mode isolation):
 *   compare-api  → mesh/pc ✓  diffApiTs ✓  timeseriesTs ✗
 *   timeline     → mesh/pc ✓  timeseriesTs[active] ✓  diffApiTs ✗
 *
 * Timeline tilesets are ALL preloaded once per site (show=false), then we
 * just flip .show on the active one — no reload on scrub.
 *
 * createLayerController({ viewer }) returns an independent set of layer
 * functions scoped to a given Cesium viewer. The primary viewer uses the
 * default module-level exports (bound to window.viewer). Split view's slot B
 * gets its own instance. Every existing import site in App.jsx still works
 * unchanged.
 */

import { CONFIG } from '../config'
import { setStatus, toast, requestRender as requestRenderPrimary } from './cesiumInit'

// ── Voxel shader ──────────────────────────────────────────────────────────
//
// Classifies voxels by their baked diffuse colour (red dominant = added, blue dominant = removed)
// Also adds a small emissive term as ambient fill  to compensate teh lighting for the IBL disabled (WebGL errors) 

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
  // Recolor to exact brand values. Classification ran off the original
  // baked colour above so reassigning diffuse here doesn't affect discards.
  if (isRed) {
    material.diffuse = vec3(1.0, 0.302, 0.302);   // #ff4d4d — added
  } else if (isBlue) {
    material.diffuse = vec3(0.302, 0.624, 1.0);   // #4d9fff — removed
  }
  material.emissive += vec3(0.12);  // flat ambient fill (replaces IBL)
}`,
  })
}

// ── Shared URL version cache (across all controller instances) ────────────
//
// A re-uploaded dataset should bust the cache for both the primary AND split
// view's secondary viewport since they may have both loaded the same URL.

const _sharedUrlVersion = new Map()

function _sharedInvalidateTilesetUrl(url) {
  if (!url) return
  const base = url.split('?')[0]
  _sharedUrlVersion.set(base, (_sharedUrlVersion.get(base) ?? 0) + 1)
  console.log('[invalidateTilesetUrl]', base, 'v=', _sharedUrlVersion.get(base))
}

// ── Layer controller factory ──────────────────────────────────────────────

export function createLayerController({ viewer } = {}) {
  const _getViewer = () => viewer ?? window.viewer
  const _isAlive   = v => !!v && !v.isDestroyed?.()

  function _requestRender() {
    const v = _getViewer()
    if (_isAlive(v)) v.scene.requestRender()
    if (v === window.viewer) requestRenderPrimary()
  }

  const state = {
    siteId:           null,
    dateId:           null,
    mesh:             null,   // single-date mesh tileset
    pc:               null,   // single-date point cloud tileset
    diffApiTs:        null,   // A/B compare result tileset
    timeseriesTsMap:  {},     // snapshot.id → Cesium3DTileset (all pre-loaded, show toggled)
    activeSnapshotId: null,
  }

  let _pointSize = CONFIG.DEFAULTS.POINT_SIZE

  // ── Visibility sync ───────────────────────────────────────────────────────

  function syncVisibility(mode) {
    const inCompareApi = mode === 'compare-api'
    const inTimeline   = mode === 'timeline'

    if (state.mesh) state.mesh.show = true
    if (state.pc)   state.pc.show   = true

    if (state.diffApiTs) state.diffApiTs.show = inCompareApi

    for (const [snapId, ts] of Object.entries(state.timeseriesTsMap)) {
      if (!ts) continue
      ts.show = inTimeline && snapId === state.activeSnapshotId
    }

    requestAnimationFrame(() => _requestRender())
  }

  // ── Remove helpers ────────────────────────────────────────────────────────

  function _rm(t) {
    const v = _getViewer()
    if (t && _isAlive(v)) try { v.scene.primitives.remove(t) } catch (_) {}
  }

  // Remove the single-date background layers only (mesh/pc).
  function clearLayers() {
    _rm(state.mesh); _rm(state.pc)
    state.mesh = state.pc = null
    requestAnimationFrame(() => _requestRender())
  }

  // Full wipe — only call on project open/close, not on date toggles.
  function clearAllLayers() {
    _rm(state.mesh); _rm(state.pc); _rm(state.diffApiTs)
    for (const ts of Object.values(state.timeseriesTsMap)) _rm(ts)
    state.mesh = state.pc = state.diffApiTs = null
    state.timeseriesTsMap  = {}
    state.activeSnapshotId = null
    requestAnimationFrame(() => _requestRender())
  }

  // ── Date loader ───────────────────────────────────────────────────────────

  async function loadDate(site, dateObj, currentMode) {
    _rm(state.mesh); _rm(state.pc)
    state.mesh = state.pc = null
    state.siteId = site.id
    state.dateId = dateObj.id

    setStatus(`Loading ${site.label} — ${dateObj.label}…`)

    const isMesh     = dateObj.datasetType === 'mesh'
    const maxSSE     = isMesh ? 8 : 2
    // originalTilesetUrl is an absolute URL (via _toAbsoluteUrl in api.js)
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

  function invalidateTilesetUrl(url) { _sharedInvalidateTilesetUrl(url) }

  // ── Internal tileset loader ───────────────────────────────────────────────

  async function _loadTileset(url, show, maxSSE, datasetType) {
    const v = _getViewer()
    if (!url || !_isAlive(v)) return null
    try {
      const Cesium   = window.Cesium
      const base     = url.split('?')[0]
      const version  = _sharedUrlVersion.get(base) ?? 0
      const finalUrl = version > 0 ? `${base}?v=${version}` : base

      const ts = await Cesium.Cesium3DTileset.fromUrl(finalUrl, {
        maximumScreenSpaceError: maxSSE,
      })

      // Viewer can be destroyed while the fetch was in flight (e.g. leaving split view)
      if (!_isAlive(v)) {
        try { ts.destroy?.() } catch (_) {}
        return null
      }

      v.scene.primitives.add(ts)
      ts.show = show

      // Disable per-tileset IBL environment maps (was root cause of "object does not belong to this context" errors in split view)
      // DynamicEnvironmentMapManager queues persists:true ComputeCommands that can be executed by the wrong WebGL context when two 
      // requestRenderMode scenes ping each other. 
      // diff tilesets use baked vertex colors recolored by CustomShader, so IBL isn't needed 
      if (ts.environmentMapManager) ts.environmentMapManager.enabled = false

      if (datasetType === 'mesh') {
        const center = ts.boundingSphere.center
        const carto  = Cesium.Cartographic.fromCartesian(center)
        const offset = Cesium.Cartesian3.fromRadians(carto.longitude, carto.latitude, carto.height)
        const translation = Cesium.Cartesian3.subtract(offset, center, new Cesium.Cartesian3())
        ts.modelMatrix = Cesium.Matrix4.fromTranslation(translation)
      }

      ts.allTilesLoaded.addEventListener(() => requestAnimationFrame(() => _requestRender()))
      return ts
    } catch (e) {
      console.warn('[_loadTileset] Failed:', url, e)
      return null
    }
  }

  // ── Point size ────────────────────────────────────────────────────────────

  function setPointSize(ts, size) {
    if (!ts) return
    ts.pointCloudShading.attenuation        = true
    ts.pointCloudShading.maximumAttenuation = parseFloat(size) || 1
  }

  function applyPcStyle(pointSize) {
    _pointSize = pointSize
    if (state.pc) setPointSize(state.pc, pointSize)
    requestAnimationFrame(() => _requestRender())
  }

  // ── A/B diff tileset (compare-api mode) ──────────────────────────────────

  const _diffApiVis = { added: true, removed: true, unchanged: true }

  function _applyDiffApiStyle() {
    const ts = state.diffApiTs
    if (!ts) return
    ts.customShader = _buildCustomShader(_diffApiVis.added, _diffApiVis.removed, _diffApiVis.unchanged) ?? undefined
    requestAnimationFrame(() => _requestRender())
  }

  // Update visibility for the A/B diff tileset
  function setDiffApiTilesetVisibility(showAdded, showRemoved, showUnchanged) {
    _diffApiVis.added     = showAdded
    _diffApiVis.removed   = showRemoved
    _diffApiVis.unchanged = showUnchanged ?? _diffApiVis.unchanged
    _applyDiffApiStyle()
  }

  // Load the result tileset from an A/B full diff and store it in state.diffApiTs
  async function loadDiffApiTileset(tilesetUrl) {
    _rm(state.diffApiTs)
    state.diffApiTs = null
    if (!tilesetUrl) return
    const ts = await _loadTileset(tilesetUrl, true, 4, 'mesh')
    if (ts) {
      state.diffApiTs = ts
      _applyDiffApiStyle()
    } else {
      console.warn('[loadDiffApiTileset] failed to load tileset:', tilesetUrl)
    }
    requestAnimationFrame(() => _requestRender())
  }

  /** Clear the A/B diff tileset (call on clear/reset). */
  function clearDiffApiTileset() {
    _rm(state.diffApiTs)
    state.diffApiTs = null
    requestAnimationFrame(() => _requestRender())
  }

  // ── Timeline tilesets (all preloaded, show toggled) ───────────────────────

  // Load all snapshots with show=false. Skips already-loaded ones.
  async function loadAllSnapshotTilesets(snapshots) {
    if (!snapshots?.length) return
    const toLoad = snapshots.filter(s => s.tilesetUrl && !(s.id in state.timeseriesTsMap))
    if (!toLoad.length) return

    await Promise.allSettled(
      toLoad.map(async s => {
        const ts = await _loadTileset(s.tilesetUrl, false, 2, 'mesh')
        state.timeseriesTsMap[s.id] = ts ?? null  // null = attempted, don't retry
      })
    )
  }

  // Show only the active snapshot's tileset; hide all others.
  function showSnapshotTileset(snapshotId) {
    state.activeSnapshotId = snapshotId
    for (const [id, ts] of Object.entries(state.timeseriesTsMap)) {
      if (!ts) continue
      ts.show = (id === snapshotId)
    }
    _applySnapshotStyle(state.activeSnapshotId)
    requestAnimationFrame(() => _requestRender())
  }

  // Per-channel visibility state for timeline tilesets
  const _tlVis = { added: true, removed: true, unchanged: true }

  function _applySnapshotStyle(snapshotId) {
    const ts = snapshotId ? state.timeseriesTsMap[snapshotId] : null
    if (!ts) return
    ts.customShader = _buildCustomShader(_tlVis.added, _tlVis.removed, _tlVis.unchanged) ?? undefined
    requestAnimationFrame(() => _requestRender())
  }

  //Update added / removed / unchanged visibility for the active timeline tileset
  function setSnapshotTilesetVisibility(showAdded, showRemoved, showUnchanged) {
    _tlVis.added     = showAdded
    _tlVis.removed   = showRemoved
    _tlVis.unchanged = showUnchanged
    _applySnapshotStyle(state.activeSnapshotId)
  }

  // Clear all preloaded timeseries tilesets (call when forcing a recompute)
  function clearAllSnapshotTilesets() {
    for (const ts of Object.values(state.timeseriesTsMap)) _rm(ts)
    state.timeseriesTsMap  = {}
    state.activeSnapshotId = null
    requestAnimationFrame(() => _requestRender())
  }

  return {
    state,
    syncVisibility,
    clearLayers, clearAllLayers,
    loadDate, invalidateTilesetUrl,
    setPointSize, applyPcStyle,
    setDiffApiTilesetVisibility, loadDiffApiTileset, clearDiffApiTileset,
    loadAllSnapshotTilesets, showSnapshotTileset, setSnapshotTilesetVisibility, clearAllSnapshotTilesets,
    get viewer() { return _getViewer() },
  }
}

// ── Default instance (primary viewport) ──────────────────────────────────
//
// Re-exports every function at the top level so existing App.jsx imports
// work unchanged. Split view's slot B gets its own instance via createLayerController({ viewer: viewer2 }).

const _primary = createLayerController({ viewer: undefined })

export const state                        = _primary.state
export const syncVisibility               = _primary.syncVisibility
export const clearLayers                  = _primary.clearLayers
export const clearAllLayers               = _primary.clearAllLayers
export const loadDate                     = _primary.loadDate
export const invalidateTilesetUrl         = _primary.invalidateTilesetUrl
export const setPointSize                 = _primary.setPointSize
export const applyPcStyle                 = _primary.applyPcStyle
export const setDiffApiTilesetVisibility  = _primary.setDiffApiTilesetVisibility
export const loadDiffApiTileset           = _primary.loadDiffApiTileset
export const clearDiffApiTileset          = _primary.clearDiffApiTileset
export const loadAllSnapshotTilesets      = _primary.loadAllSnapshotTilesets
export const showSnapshotTileset          = _primary.showSnapshotTileset
export const setSnapshotTilesetVisibility = _primary.setSnapshotTilesetVisibility
export const clearAllSnapshotTilesets     = _primary.clearAllSnapshotTilesets