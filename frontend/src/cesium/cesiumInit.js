/**
 * cesiumInit.js — Cesium viewer init + shared helpers.
 *
 * Split view: initSecondaryViewer / destroySecondaryViewer / setBasemap2
 * create and tear down a second independent Cesium viewer. Both viewports
 * have their own camera controller (both are interactive), and viewerSync.js
 * keeps the cameras locked together bidirectionally. The primary viewer is
 * never touched by any of this.
 *
 * Each viewer gets its own terrain provider instance (createFreshTerrainProvider).
 * Sharing one provider across multiple WebGL contexts causes GPU resource
 * conflicts ("object does not belong to this context") because the provider
 * lazily compiles textures into whichever context renders first.
 */

import * as Cesium from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import { CONFIG } from '../config'

// Tell CesiumJS where its static files live (set by vite.config.js define)
window.CESIUM_BASE_URL = '/cesium'

// Make Cesium globally available for layers.js and diff.js which use Cesium.*
window.Cesium = Cesium

export let viewer = null
let customTerrain = null
let viewer2 = null // The secondary (split-view) viewer — null whenever split mode is off.

// Callbacks supplied by React at init time
let _onStatus = () => {}
let _onToast  = () => {}

// ── Diagnostics ───────────────────────────────────────────────────────────
//
// Tracks WebGL context sharing across viewer instances. Call
// window.diagArmComputeLog("label") in devtools before reproducing a crash
// to get a log of ComputeCommand executions with context mismatch details.
// Remove once the WebGL cross-context issue is fully resolved.

const _diagKnownTerrainProviders = new Map()
let _diagViewerCount = 0

export function installCesiumGLDiagnostics(viewerInstance, label) {
  if (!viewerInstance || viewerInstance.isDestroyed?.()) return
  _diagViewerCount++
  const tag = `CTX-${_diagViewerCount}(${label})`

  try {
    const gl = viewerInstance.scene?.context?._gl
    if (gl && !gl.__DIAG_TAG) gl.__DIAG_TAG = tag
    console.log(`[DIAG] registered viewer as ${gl?.__DIAG_TAG ?? tag}`)
  } catch (e) {
    console.warn('[DIAG] ctx-tag failed:', e)
  }

  try {
    const tp = viewerInstance.terrainProvider
    if (tp) {
      const prevTag = _diagKnownTerrainProviders.get(tp)
      if (prevTag) {
        console.warn(
          `[DIAG][terrain-share] *** ${tag} is REUSING the same terrainProvider as ${prevTag} ***`,
          '— prime suspect for cross-context WebGL errors.', tp
        )
      } else {
        _diagKnownTerrainProviders.set(tp, tag)
        console.log(`[DIAG][terrain-share] ${tag} is first to use this terrainProvider (${tp.constructor?.name}).`)
      }
    }
  } catch (e) {
    console.warn('[DIAG][terrain-share] check failed:', e)
  }

  // Wrap ComputeCommand.execute to log context mismatches on demand.
  // Call window.diagArmComputeLog("label") in devtools right before reproducing the bug.
  try {
    if (!Cesium.ComputeCommand.prototype.__DIAG_WRAPPED) {
      let n = 0, max = 0, diagLabel = ''
      window.diagArmComputeLog = (lbl = '', budget = 30) => {
        n = 0; max = budget; diagLabel = lbl
        console.log(`[DIAG] ComputeCommand log armed: label="${diagLabel}" budget=${max}`)
      }
      const orig = Cesium.ComputeCommand.prototype.execute
      Cesium.ComputeCommand.prototype.execute = function (computeEngine) {
        if (n < max) {
          n++
          const execCtx   = computeEngine?._context?._gl?.__DIAG_TAG ?? '(untagged exec ctx)'
          const outTex    = this.outputTexture
          const outTexGl  = outTex?._context?._gl ?? outTex?._gl
          const outTexCtx = outTexGl?.__DIAG_TAG ?? '(no outputTexture / untagged)'
          const ownerCtor = this.owner?.constructor?.name
          const ownerName = ownerCtor ?? (typeof this.owner === 'function' ? this.owner.name : null) ?? '(no owner ref)'
          let ownerHint = ''
          try {
            const ownerTileset = ownerCtor === 'Cesium3DTileset' ? this.owner : this.owner?._tileset
            if (ownerTileset?._url) ownerHint = ` url=${ownerTileset._url}`
          } catch (_) {}
          console.log(
            `[DIAG][ComputeCommand.execute ${diagLabel} #${n}/${max}] owner=${ownerName}${ownerHint} | executingIn=${execCtx} | outputTextureBelongsTo=${outTexCtx} | MISMATCH=${!!outTexGl && execCtx !== outTexCtx} | persists=${this.persists}`,
            this
          )
          if (n === max) console.log(`[DIAG] budget reached — call window.diagArmComputeLog() again to keep watching.`)
        }
        return orig.call(this, computeEngine)
      }
      Cesium.ComputeCommand.prototype.__DIAG_WRAPPED = true
      console.log('[DIAG] ComputeCommand.prototype.execute wrapped. Run window.diagArmComputeLog("test") then reproduce the bug.')
    }
  } catch (e) {
    console.warn('[DIAG] failed to wrap ComputeCommand.execute:', e)
  }
}

// ── Public helpers ────────────────────────────────────────────────────────

export function flyTo(lon, lat, height, pitch = -40, heading = 0) {
  if (!viewer) return
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(lon, lat, height),
    orientation: {
      heading: Cesium.Math.toRadians(heading),
      pitch:   Cesium.Math.toRadians(pitch),
      roll:    0,
    },
    duration: 2.0,
  })
  requestRender()
}

export function setStatus(msg, done = false) { _onStatus(msg, done) }
export function toast(msg, type = 'ok')      { _onToast(msg, type) }
export function requestRender()              { if (viewer) viewer.scene.requestRender() }

// ── Terrain ───────────────────────────────────────────────────────────────

// Always returns a fresh terrain provider instance — never a shared/cached one.
// Each Viewer must call this itself so they don't share GPU resources across WebGL contexts.
export async function createFreshTerrainProvider() {
  if (CONFIG.TERRAIN.ENABLED) {
    try {
      return await Cesium.CesiumTerrainProvider.fromIonAssetId(CONFIG.TERRAIN.ASSET_ID)
    } catch (e) {
      console.warn('[viewer] Cesium World Terrain unavailable — using ellipsoid', e)
      return new Cesium.EllipsoidTerrainProvider()
    }
  }
  return new Cesium.EllipsoidTerrainProvider()
}

// ── Viewer init ───────────────────────────────────────────────────────────

export async function initViewer({ onReady, onStatus, onToast, onCoords }) {
  _onStatus = onStatus || _onStatus
  _onToast  = onToast  || _onToast

  _onStatus('뷰어 초기화 중…', false)

  Cesium.Ion.defaultAccessToken = CONFIG.ION_TOKEN

  // ── Terrain ──────────────────────────────────────────────────────────────
  const terrain = await createFreshTerrainProvider()
  customTerrain = terrain
  window.customTerrain = terrain  // kept for backward compat; other viewers should NOT reuse this

  // ── Create viewer ─────────────────────────────────────────────────────────
  viewer = new Cesium.Viewer('cesiumContainer', {
    terrainProvider: terrain,
    animation: false, baseLayerPicker: false, fullscreenButton: false,
    geocoder: false, homeButton: false, infoBox: false,
    navigationHelpButton: false, sceneModePicker: false,
    selectionIndicator: false, timeline: false,
    requestRenderMode: true, maximumRenderTimeChange: Infinity, msaaSamples: 4,
  })

  // Make viewer globally accessible (layers.js + diff.js reference window.viewer)
  window.viewer = viewer

  // ── Scene settings ────────────────────────────────────────────────────────
  _applySceneDefaults(viewer.scene)
  viewer.clock.currentTime = Cesium.JulianDate.fromIso8601('2025-11-06T03:00:00Z')
  installCesiumGLDiagnostics(viewer, 'primary')

  // ── Mouse coordinate tracker ──────────────────────────────────────────────
  new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas)
    .setInputAction((e) => {
      const ray = viewer.camera.getPickRay(e.endPosition)
      const pos = viewer.scene.globe.pick(ray, viewer.scene)
      if (!pos) return
      const c = Cesium.Cartographic.fromCartesian(pos)
      onCoords?.({
        lat:    Cesium.Math.toDegrees(c.latitude).toFixed(5),
        lon:    Cesium.Math.toDegrees(c.longitude).toFixed(5),
        height: c.height.toFixed(1),
      })
      requestRender()
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE)

  _onStatus('준비 완료', true)
  onReady?.()
}

function _applySceneDefaults(scene) {
  scene.globe.enableLighting          = true
  scene.globe.depthTestAgainstTerrain = true
  scene.globe.showGroundAtmosphere    = true
  scene.backgroundColor               = Cesium.Color.fromCssColorString('#07070d')
  scene.highDynamicRange              = false
}

// Secondary viewer disables compute-heavy atmosphere features. The actual
// cross-context crash was root-caused to per-tileset DynamicEnvironmentMapManager
// (disabled in layers.js on every tileset load), but we keep atmosphere/IBL
// off here as an extra precaution since the secondary is just a comparison view.
function _applySceneDefaultsSecondary(scene) {
  scene.globe.enableLighting                     = false
  scene.globe.depthTestAgainstTerrain            = true
  scene.globe.showGroundAtmosphere               = false
  scene.globe.dynamicAtmosphereLighting          = false
  scene.globe.dynamicAtmosphereLightingFromSun   = false
  scene.sphericalHarmonicCoefficients            = undefined
  scene.specularEnvironmentMaps                  = undefined
  if (scene.atmosphere) scene.atmosphere.show    = false
  scene.backgroundColor                          = Cesium.Color.fromCssColorString('#07070d')
  scene.highDynamicRange                         = false
}

// ── Terrain toggle ────────────────────────────────────────────────────────

export function setTerrainVisible(show) {
  if (!window.viewer) return
  window.viewer.terrainProvider = show
    ? window.customTerrain
    : new window.Cesium.EllipsoidTerrainProvider()
  window.viewer.scene.requestRender()
}

// ── Basemap ───────────────────────────────────────────────────────────────

const ION_ASSETS = {
  aerial:           2,
  aerial_labels:    3,
  roads:            4,
  gmaps_sat:        3830182,
  gmaps_sat_labels: 3830183,
  gmaps_road:       3830184,
  gmaps_contour:    3830186,
}

async function _applyBasemap(imageryLayers, id) {
  imageryLayers.removeAll()
  try {
    if (id in ION_ASSETS) {
      imageryLayers.add(new Cesium.ImageryLayer(
        await Cesium.IonImageryProvider.fromAssetId(ION_ASSETS[id])
      ))
    } else if (id === 'osm' || id === 'dark') {
      let provider
      try {
        provider = await Cesium.OpenStreetMapImageryProvider.fromUrl('https://tile.openstreetmap.org/')
      } catch (_) {
        provider = new Cesium.OpenStreetMapImageryProvider({ url: 'https://tile.openstreetmap.org/' })
      }
      const layer = new Cesium.ImageryLayer(provider)
      if (id === 'dark') { layer.brightness = 0.3; layer.contrast = 1.8 }
      imageryLayers.add(layer)
    } else if (id === 'none') {
      // intentionally empty
    } else {
      imageryLayers.add(new Cesium.ImageryLayer(
        await Cesium.IonImageryProvider.fromAssetId(2)  // fallback: Bing Aerial
      ))
    }
  } catch (e) {
    console.warn('[basemap] imagery provider failed:', id, e)
  }
}

// ── Basemap ───────────────────────────────────────────────────────────────
export async function setBasemap(id)  {
  if (!viewer)  return
  await _applyBasemap(viewer.imageryLayers, id)
  viewer.scene.requestRender()
}

// Same as setBasemap, but targets the secondary (split-view) viewer
export async function setBasemap2(id) {
  if (!viewer2) return
  await _applyBasemap(viewer2.imageryLayers, id)
  viewer2.scene.requestRender()
}

// ── Secondary viewer (split view) ────────────────────────────────────────

// Waits for the container to have real layout dimensions before constructing
// the viewer. Building against a zero-size container causes
// "GL_INVALID_FRAMEBUFFER_OPERATION ... default size is zero" errors.
export async function initSecondaryViewer(containerId) {
  if (viewer2) destroySecondaryViewer()

  const container = document.getElementById(containerId)
  if (!container) {
    console.warn('[initSecondaryViewer] container not found:', containerId)
    return null
  }

  let attempts = 0
  while ((container.clientWidth === 0 || container.clientHeight === 0) && attempts < 200) {
    await new Promise(resolve => requestAnimationFrame(resolve))
    attempts++
  }

  const terrain2 = await createFreshTerrainProvider()

  viewer2 = new Cesium.Viewer(containerId, {
    terrainProvider: terrain2,
    animation: false, baseLayerPicker: false, fullscreenButton: false,
    geocoder: false, homeButton: false, infoBox: false,
    navigationHelpButton: false, sceneModePicker: false,
    selectionIndicator: false, timeline: false,
    requestRenderMode: true, maximumRenderTimeChange: Infinity,
    msaaSamples: 1,  // Must be 1 — MSAA uses a ComputeEngine resolve texture that gets bound
                     // to the primary's WebGL context, causing cross-context errors on viewer2.
  })

  _applySceneDefaultsSecondary(viewer2.scene)  // atmosphere disabled — avoids WebGL cross-context errors
  viewer2.clock.currentTime = Cesium.JulianDate.fromIso8601('2025-11-06T03:00:00Z')
  installCesiumGLDiagnostics(viewer2, 'secondary/split-view')

  viewer2.resize()
  viewer2.scene.requestRender()

  return viewer2
}

// Safe to call even if viewer2 is null.
export function destroySecondaryViewer() {
  if (!viewer2) return
  try {
    if (!viewer2.isDestroyed()) {
      // Explicitly release the WebGL context to avoid GPU resource leaks
      // that would contaminate the next split-view session.
      const gl = viewer2.scene?.context?._gl
      if (gl) {
        const ext = gl.getExtension('WEBGL_lose_context')
        if (ext) ext.loseContext()
      }
      viewer2.destroy()
    }
  } catch (e) {
    console.warn('[destroySecondaryViewer] failed to destroy cleanly:', e)
  }
  viewer2 = null
}