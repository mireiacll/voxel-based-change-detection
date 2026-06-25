/**
 * layers.js — ES module
 *
 * VISIBILITY RULES (strict per-mode isolation):
 *   compare-api  → mesh/pc ✓  diffApiTs ✓  timeseriesTs[any] ✗
 *   timeline     → mesh/pc ✓  timeseriesTs[active] ✓
 *
 * Timeseries tilesets are ALL preloaded once per site (show=false), then we
 * just flip .show on the active one in timeline mode. No reload on scrub.
 *
 * ───────────────────────────────────────────────────────────────────────
 * INSTANCE FACTORY (split view)
 * ───────────────────────────────────────────────────────────────────────
 * Everything below used to be module-level globals tied implicitly to
 * window.viewer. To support a second, independent Cesium viewport in
 * split view, all of that logic now lives inside createLayerController(),
 * which takes the target viewer and returns its own private state + the
 * exact same function set, scoped to that viewer instead of window.viewer.
 *
 * The PRIMARY viewport's behavior is completely unchanged: this file still
 * exports every original top-level function (loadDate, syncVisibility,
 * clearLayers, clearAllLayers, applyPcStyle, invalidateTilesetUrl,
 * loadAllSnapshotTilesets, showSnapshotTileset, clearAllSnapshotTilesets,
 * setSnapshotTilesetVisibility, loadDiffApiTileset, clearDiffApiTileset,
 * setDiffApiTilesetVisibility, state) — these are just a default instance
 * bound to window.viewer, created once at module load. Every existing
 * call site in App.jsx that imports these directly keeps working
 * byte-for-byte as before.
 *
 * The secondary viewport (split view's slot B) gets its own instance via
 * createLayerController({ viewer: viewer2 }), called fresh each time split
 * mode turns on.
 */

import { CONFIG } from '../config'
import { setStatus, toast, requestRender as requestRenderPrimary } from './cesiumInit'

// ═══════════════════════════════════════════════════════════════════════════
//  CUSTOM SHADER (voxel color classification) — pure function, no instance
//  state, shared by every layer-controller instance.
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
//  INSTANCE FACTORY
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @param {object} opts
 * @param {object} opts.viewer — the Cesium.Viewer this controller owns.
 *   Defaults to window.viewer (the primary viewport) when omitted, so the
 *   default instance below needs no special-casing.
 */
export function createLayerController({ viewer } = {}) {
  const _getViewer = () => viewer ?? window.viewer

  function _isAlive(v) {
    return !!v && !v.isDestroyed?.()
  }

  function _requestRender() {
    const v = _getViewer()
    if (_isAlive(v)) v.scene.requestRender()
    // Also nudge the primary's own render helper so toasts/status driven
    // off requestRender() in cesiumInit.js keep working when this instance
    // IS the primary (default instance case).
    if (v === window.viewer) requestRenderPrimary()
  }

  const state = {
    siteId:           null,
    dateId:           null,
    mesh:             null,   // single-date view layer (mesh)
    pc:               null,   // single-date view layer (point cloud)
    diffApiTs:        null,   // A/B full diff result tileset (compare-api mode)
    timeseriesTsMap:  {},     // snapshot.id → Cesium3DTileset (all preloaded, show toggled)
    activeSnapshotId: null,
  }

  let _pointSize = CONFIG.DEFAULTS.POINT_SIZE

  // ── VISIBILITY SYNC ───────────────────────────────────────────────────

  /**
   * @param {string} mode — 'compare-api' | 'timeline'
   */
  function syncVisibility(mode) {
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

    requestAnimationFrame(() => _requestRender())
  }

  // ── CLEAR HELPERS ──────────────────────────────────────────────────────

  function _rm(t) {
    const v = _getViewer()
    if (t && _isAlive(v)) try { v.scene.primitives.remove(t) } catch (_) {}
  }

  /** Remove the single-date background layers (mesh/pc). Does not touch timeseries. */
  function clearLayers() {
    console.log('[clearLayers] removing background date layers (mesh/pc)')
    _rm(state.mesh); _rm(state.pc)
    state.mesh = state.pc = null
    requestAnimationFrame(() => _requestRender())
  }

  /** Full wipe — use only on project open/close, not on date toggles. */
  function clearAllLayers() {
    console.log('[clearAllLayers] full wipe of all layers')
    _rm(state.mesh); _rm(state.pc)
    _rm(state.diffApiTs)
    for (const ts of Object.values(state.timeseriesTsMap)) _rm(ts)
    state.mesh = state.pc = state.diffApiTs = null
    state.timeseriesTsMap  = {}
    state.activeSnapshotId = null
    requestAnimationFrame(() => _requestRender())
  }

  // ── LOADERS ─────────────────────────────────────────────────────────────

  async function loadDate(site, dateObj, currentMode) {
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

  // ── URL CACHE INVALIDATION ──────────────────────────────────────────────
  // Shared across instances — a re-uploaded dataset should bust the cache
  // for BOTH viewports, not just whichever one happened to trigger it.

  function invalidateTilesetUrl(url) {
    _sharedInvalidateTilesetUrl(url)
  }

  // ── GENERIC TILESET LOADER (internal) ───────────────────────────────────

  async function _loadTileset(url, show, maxSSE, datasetType) {
    const v = _getViewer()
    if (!url || !_isAlive(v)) return null
    try {
      const Cesium   = window.Cesium
      const base     = url.split('?')[0]
      const version  = _sharedUrlVersion.get(base) ?? 0
      const finalUrl = version > 0 ? `${base}?v=${version}` : base

      const _vGlTag = v.scene?.context?._gl?.__DIAG_TAG ?? '(untagged)'
      console.log(`[_loadTileset] loading url=${finalUrl} show=${show} | target viewer ctx=${_vGlTag}`)
      const ts = await Cesium.Cesium3DTileset.fromUrl(finalUrl, {
        maximumScreenSpaceError: maxSSE,
      })

      // The viewer can be destroyed WHILE the fetch above was in flight
      // (e.g. leaving split view mid-load) — re-check liveness before
      // touching its scene, rather than relying on the check from before
      // the await, which only guaranteed it was alive back then.
      if (!_isAlive(v)) {
        try { ts.destroy?.() } catch (_) {}
        console.log(`[_loadTileset] viewer destroyed mid-load, discarding tileset url=${finalUrl}`)
        return null
      }

      // Re-check the context tag AFTER the await — if it changed (e.g. the
      // viewer was torn down and a NEW one with the same DOM id was built
      // while this fetch was in flight), that's a smoking gun: ts was
      // built async against whatever was "current" at await-time, but the
      // primitives.add() below targets a DIFFERENT, newer context.
      const _vGlTagAfter = v.scene?.context?._gl?.__DIAG_TAG ?? '(untagged)'
      if (_vGlTagAfter !== _vGlTag) {
        console.warn(`[_loadTileset] *** CONTEXT TAG CHANGED DURING LOAD *** before=${_vGlTag} after=${_vGlTagAfter} url=${finalUrl} — viewer was likely recreated mid-fetch`)
      }

      v.scene.primitives.add(ts)
      ts.show = show
      console.log(`[_loadTileset] added to primitives | ctx=${_vGlTagAfter} | url=${finalUrl}`)

      // Disable per-tileset dynamic image-based lighting (IBL) environment
      // maps. ROOT CAUSE of the cross-context WebGL errors in split view:
      // this system queues `persists: true` ComputeCommands during every
      // tileset's per-frame update — see DynamicEnvironmentMapManager in
      // Cesium's source. With two requestRenderMode scenes pinging each
      // other's requestRender() (viewerSync.js), those scenes' render
      // passes could interleave on the same call stack, letting a command
      // queued while updating viewer2's tileset get drained during
      // viewer1's render tick (or vice versa) — i.e. executed against the
      // WRONG WebGL context. Confirmed via window.diagArmComputeLog: owner=
      // DynamicEnvironmentMapManager, outputTextureBelongsTo one CTX,
      // executingIn the other. None of our tilesets need PBR/IBL lighting
      // anyway — diff/voxel visualization is baked vertex colors recolored
      // by our own CustomShader — so this is a pure win, not a tradeoff.
      if (ts.environmentMapManager) ts.environmentMapManager.enabled = false

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
        requestAnimationFrame(() => _requestRender())
      })

      console.log(`[_loadTileset] loaded OK url=${finalUrl}`)
      return ts
    } catch (e) {
      console.warn('[_loadTileset] Failed:', url, e)
      return null
    }
  }

  // ── POINT SIZE ───────────────────────────────────────────────────────────

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

  // ── A/B FULL DIFF TILESET (compare-api mode) ────────────────────────────

  const _diffApiVis = { added: true, removed: true, unchanged: true }

  function _applyDiffApiStyle() {
    const ts = state.diffApiTs
    if (!ts) return
    ts.customShader = _buildCustomShader(_diffApiVis.added, _diffApiVis.removed, _diffApiVis.unchanged) ?? undefined
    console.log(`[_applyDiffApiStyle] added=${_diffApiVis.added} removed=${_diffApiVis.removed}`)
    requestAnimationFrame(() => _requestRender())
  }

  /**
   * Update added / removed visibility for the compare-api diff tileset.
   * Call from App.jsx whenever compareApiVis toggles change.
   */
  function setDiffApiTilesetVisibility(showAdded, showRemoved, showUnchanged) {
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
  async function loadDiffApiTileset(tilesetUrl) {
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

    requestAnimationFrame(() => _requestRender())
  }

  /** Clear the A/B diff tileset (call on clear/reset). */
  function clearDiffApiTileset() {
    _rm(state.diffApiTs)
    state.diffApiTs = null
    requestAnimationFrame(() => _requestRender())
  }

  // ── TIMESERIES — PRELOAD ALL + SHOW/HIDE BY ID ──────────────────────────
  //
  //  loadAllSnapshotTilesets(snapshots)
  //    → loads every snapshot with a tilesetUrl into state.timeseriesTsMap,
  //      all with show=false. Safe to call multiple times (skips already loaded).
  //
  //  showSnapshotTileset(snapshotId)
  //    → hides all timeseries tilesets, shows only the one for snapshotId.
  //      Call this ONLY when mode === 'timeline'.

  /**
   * Preload all snapshot tilesets for a site (all hidden).
   * No-ops for snapshots already in the map or without a tilesetUrl.
   */
  async function loadAllSnapshotTilesets(snapshots) {
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
  function showSnapshotTileset(snapshotId) {
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
    requestAnimationFrame(() => _requestRender())
  }

  // Per-channel visibility state for timeline tilesets
  const _tlVis = { added: true, removed: true, unchanged: true }

  function _applySnapshotStyle(snapshotId) {
    const ts = snapshotId ? state.timeseriesTsMap[snapshotId] : null
    if (!ts) return
    ts.customShader = _buildCustomShader(_tlVis.added, _tlVis.removed, _tlVis.unchanged) ?? undefined
    console.log(`[_applySnapshotStyle] snapshot=${snapshotId}`)
    requestAnimationFrame(() => _requestRender())
  }

  /**
   * Update added / removed / unchanged visibility for the active timeline tileset.
   * Call from App.jsx whenever the timeline visibility toggles change.
   */
  function setSnapshotTilesetVisibility(showAdded, showRemoved, showUnchanged) {
    _tlVis.added     = showAdded
    _tlVis.removed   = showRemoved
    _tlVis.unchanged = showUnchanged
    console.log(`[setSnapshotTilesetVisibility] added=${showAdded} removed=${showRemoved} unchanged=${showUnchanged}`)
    _applySnapshotStyle(state.activeSnapshotId)
  }

  /** Clear all preloaded timeseries tilesets (call when forcing a recompute). */
  function clearAllSnapshotTilesets() {
    console.log(`[clearAllSnapshotTilesets] removing ${Object.keys(state.timeseriesTsMap).length} tilesets`)
    for (const ts of Object.values(state.timeseriesTsMap)) _rm(ts)
    state.timeseriesTsMap  = {}
    state.activeSnapshotId = null
    requestAnimationFrame(() => _requestRender())
  }

  return {
    state,
    syncVisibility,
    clearLayers,
    clearAllLayers,
    loadDate,
    invalidateTilesetUrl,
    setPointSize,
    applyPcStyle,
    setDiffApiTilesetVisibility,
    loadDiffApiTileset,
    clearDiffApiTileset,
    loadAllSnapshotTilesets,
    showSnapshotTileset,
    setSnapshotTilesetVisibility,
    clearAllSnapshotTilesets,
    // Diagnostic-only: lets callers (e.g. App.jsx's [DIAG] logs) inspect
    // the underlying Cesium.Viewer this controller is bound to. Does not
    // change any rendering behavior.
    get viewer() { return _getViewer() },
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  SHARED URL-VERSION CACHE
//  Lives outside any single instance — a re-uploaded dataset should bust
//  the cache for both the primary AND any secondary (split-view) viewport,
//  since they may both have loaded the same URL.
// ═══════════════════════════════════════════════════════════════════════════

const _sharedUrlVersion = new Map()

function _sharedInvalidateTilesetUrl(url) {
  if (!url) return
  const base = url.split('?')[0]
  _sharedUrlVersion.set(base, (_sharedUrlVersion.get(base) ?? 0) + 1)
  console.log('[invalidateTilesetUrl]', base, 'v=', _sharedUrlVersion.get(base))
}

// ═══════════════════════════════════════════════════════════════════════════
//  DEFAULT INSTANCE — bound to window.viewer (the primary viewport).
//  Every name below is re-exported at the top level, unchanged from the
//  original module, so every existing call site in App.jsx (and anywhere
//  else that does `import { loadDate, ... } from './cesium/layers'`)
//  keeps working exactly as before split view existed.
// ═══════════════════════════════════════════════════════════════════════════

const _primary = createLayerController({ viewer: undefined }) // undefined → falls back to window.viewer at call time

export const state = _primary.state
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