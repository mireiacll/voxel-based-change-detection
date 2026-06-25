/**
 * cesiumInit.js — Cesium viewer initialisation + shared helpers
 *
 * Converted from viewer.js to an ES module.
 * Accepts callback hooks so React (App.jsx) can receive status/toast updates
 * without this file depending on the DOM directly.
 *
 * ───────────────────────────────────────────────────────────────────────
 * SECONDARY VIEWER (split view)
 * ───────────────────────────────────────────────────────────────────────
 * initSecondaryViewer/destroySecondaryViewer/setBasemap2 add a second,
 * independent Cesium.Viewer used only while split view is active. It gets
 * the same terrain + scene settings as the primary, and its own camera
 * controller stays fully enabled — both viewports are independently
 * interactive. viewerSync.js keeps the two cameras locked together
 * bidirectionally (move either one, the other follows), rather than one
 * being a passive "follower" with no controller of its own. The primary
 * viewer/window.viewer is never touched by any of this.
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

// The secondary (split-view) viewer — null whenever split mode is off.
let viewer2 = null

// Callbacks supplied by React at init time
let _onStatus = () => {}
let _onToast  = () => {}

// ═══════════════════════════════════════════════════════════════════════════
//  TEMP DIAGNOSTICS — call right after constructing ANY Cesium.Viewer
// ═══════════════════════════════════════════════════════════════════════════
//
// Investigating: WebGL "framebufferTexture2D: object does not belong to
// this context" / "drawElements: no valid shader program in use" /
// "glClear: ... default size is zero" — seen in BOTH split-view (viewer2)
// AND the single-viewer DataUploadPage mini preview. Since the mini
// preview never has two simultaneous viewers, this rules out "two
// contexts fighting live" as the sole cause — the leading remaining
// theory is that every viewer in the app is constructed with the SAME
// shared `terrainProvider` instance (window.customTerrain), and that
// provider lazily compiles/caches GPU resources (e.g. quantized-mesh
// skirt buffers, default water-mask/normal textures) against whichever
// WebGL context renders it FIRST, then a second/third viewer's context
// tries to reuse those same resources and fails to attach them.
//
// This function is intentionally small and call-it-everywhere — it does
// NOT change any behavior, it only logs. Remove once the cause is
// confirmed and the real fix is in place.
const _diagKnownTerrainProviders = new Map() // terrainProvider instance -> first viewer tag that used it
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
          `[DIAG][terrain-share] *** ${tag} is REUSING the same terrainProvider instance first used by ${prevTag} ***`,
          '— this is the prime suspect for the cross-context WebGL errors.',
          tp
        )
      } else {
        _diagKnownTerrainProviders.set(tp, tag)
        console.log(`[DIAG][terrain-share] ${tag} is the FIRST viewer to use this terrainProvider instance (${tp.constructor?.name}).`)
      }
    } else {
      console.log(`[DIAG][terrain-share] ${tag} has no terrainProvider set at registration time.`)
    }
  } catch (e) {
    console.warn('[DIAG][terrain-share] check failed:', e)
  }

  // Capture ComputeCommand executions globally — tells us which Cesium
  // feature (owner) is creating the offending command and whether its
  // output texture's context matches the context about to execute it.
  //
  // The old version of this capped at 8 calls TOTAL for the whole app
  // session, which meant it was almost certainly exhausted by harmless
  // commands (e.g. the Sun glow texture rebuilding on each viewer's first
  // render) long before you ever got to reproducing the split-view bug —
  // explaining why no [DIAG][ComputeCommand.execute] line ever showed up
  // right before the WebGL errors in the console paste.
  //
  // Call window.diagArmComputeLog("label") in devtools right before the
  // action you're investigating (e.g. right before clicking to load diff
  // B into the split view) to get a fresh budget of logs starting *then*.
  try {
    if (!Cesium.ComputeCommand.prototype.__DIAG_WRAPPED) {
      let n = 0
      let max = 0       // 0 = disabled until armed
      let label = ''
      window.diagArmComputeLog = (lbl = '', budget = 30) => {
        n = 0; max = budget; label = lbl
        console.log(`[DIAG] ComputeCommand log armed: label="${label}" budget=${max}`)
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
          // Owner is often the primitive/feature instance itself — try to
          // surface an identifying field (e.g. tileset url) since
          // "ownerName" alone is sometimes just "Object".
          let ownerHint = ''
          try {
            const ownerTileset = ownerCtor === 'Cesium3DTileset' ? this.owner : this.owner?._tileset
            if (ownerTileset?._url) ownerHint = ` url=${ownerTileset._url}`
          } catch (_) {}
          console.log(
            `[DIAG][ComputeCommand.execute ${label} #${n}/${max}] owner=${ownerName}${ownerHint} | executingIn=${execCtx} | outputTextureBelongsTo=${outTexCtx} | MISMATCH=${!!outTexGl && execCtx !== outTexCtx} | persists=${this.persists}`,
            this
          )
          if (n === max) console.log(`[DIAG] ComputeCommand log budget (${max}) reached for label="${label}" — call window.diagArmComputeLog() again to keep watching.`)
        }
        return orig.call(this, computeEngine)
      }
      Cesium.ComputeCommand.prototype.__DIAG_WRAPPED = true
      console.log('[DIAG] ComputeCommand.prototype.execute wrapped (once, globally). Run window.diagArmComputeLog("test") in devtools, THEN reproduce the bug.')
    }
  } catch (e) {
    console.warn('[DIAG] failed to wrap ComputeCommand.execute:', e)
  }
}

// ── Public helpers (mirrors the originals, now exported) ──────────────────

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

export function setStatus(msg, done = false) {
  _onStatus(msg, done)
}

export function toast(msg, type = 'ok') {
  _onToast(msg, type)
}

export function requestRender() {
  if (viewer) viewer.scene.requestRender()
}

// ── Initialiser ───────────────────────────────────────────────────────────

/**
 * Builds a NEW terrain provider instance matching the app's configured
 * terrain source (Cesium World Terrain via Ion, or a plain ellipsoid as
 * fallback). Always returns a fresh object — never a shared/cached one.
 *
 * Why this exists: every Cesium.Viewer in this app used to be constructed
 * with the SAME shared `window.customTerrain` instance as its
 * terrainProvider. A TerrainProvider lazily compiles and caches GPU
 * resources (e.g. quantized-mesh skirt buffers, default water-mask /
 * vertex-normal placeholder textures) the first time ANY scene actually
 * renders terrain from it — and those resources get compiled into
 * whichever WebGL context renders first. A second or third
 * independently-created Viewer (its own separate WebGL context — e.g.
 * the split-view secondary viewer, or DataUploadPage's mini preview)
 * reusing that same provider instance would then be handed
 * already-context-bound GPU resources, which is consistent with the
 * "framebufferTexture2D: object does not belong to this context" /
 * "drawElements: no valid shader program in use" errors seen in BOTH the
 * split-view viewer AND the single-viewer mini preview (which rules out
 * "two live contexts fighting" as the sole explanation, since the mini
 * preview never has two viewers at once — but DOES always share
 * window.customTerrain with whichever viewer created it first).
 *
 * Each Viewer should call this itself and get its own instance instead of
 * reading window.customTerrain directly.
 */
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

/**
 * @param {object} callbacks
 * @param {function} callbacks.onReady   — called once Cesium is ready
 * @param {function} callbacks.onStatus  — (msg: string, done: bool) => void
 * @param {function} callbacks.onToast   — (msg: string, type: string) => void
 * @param {function} callbacks.onCoords  — ({ lat, lon, height }) => void
 */
export async function initViewer({ onReady, onStatus, onToast, onCoords }) {
  _onStatus = onStatus || _onStatus
  _onToast  = onToast  || _onToast

  Cesium.Ion.defaultAccessToken = CONFIG.ION_TOKEN

  // ── Terrain ──────────────────────────────────────────────────────────────
  const terrain = await createFreshTerrainProvider()

  // customTerrain / window.customTerrain are kept for backward compatibility
  // (other code may still read window.customTerrain as a fallback default),
  // but no other viewer should pass this SAME instance into its own
  // Cesium.Viewer constructor anymore — see createFreshTerrainProvider's
  // docstring. Each viewer now builds its own.
  customTerrain = terrain
  window.customTerrain = terrain

  // ── Create viewer ─────────────────────────────────────────────────────────
  viewer = new Cesium.Viewer('cesiumContainer', {
    terrainProvider: terrain,

    animation:            false,
    baseLayerPicker:      false,
    fullscreenButton:     false,
    geocoder:             false,
    homeButton:           false,
    infoBox:              false,
    navigationHelpButton: false,
    sceneModePicker:      false,
    selectionIndicator:   false,
    timeline:             false,

    requestRenderMode:       true,
    maximumRenderTimeChange: Infinity,
    msaaSamples:             4,
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
      const lat = Cesium.Math.toDegrees(c.latitude).toFixed(5)
      const lon = Cesium.Math.toDegrees(c.longitude).toFixed(5)
      const height = c.height.toFixed(1)
      onCoords?.({ lat, lon, height })
      requestRender()
    }, Cesium.ScreenSpaceEventType.MOUSE_MOVE)

  onReady?.()
}

function _applySceneDefaults(scene) {
  scene.globe.enableLighting          = true
  scene.globe.depthTestAgainstTerrain = true
  scene.globe.showGroundAtmosphere    = true
  scene.backgroundColor               = Cesium.Color.fromCssColorString('#07070d')
  scene.highDynamicRange              = false
}

/**
 * Like _applySceneDefaults but with ALL atmosphere/lighting/IBL features
 * disabled on the secondary viewer.
 *
 * In Cesium 1.100+, ComputeEngine passes are triggered by multiple systems,
 * not just ground atmosphere. Even with showGroundAtmosphere=false, the
 * following still schedule compute passes that compile GPU textures into the
 * first WebGL context they run in, then fail when viewer2's separate context
 * tries to attach those same texture objects to its own framebuffer:
 *
 *   - scene.atmosphere (DynamicAtmosphereLighting for 3D Tiles/models)
 *   - scene.skyAtmosphere
 *   - scene.globe.enableLighting (vertex normals + dynamic atmosphere LUT)
 *   - scene.specularEnvironmentMaps / sphericalHarmonicCoefficients (IBL)
 *   - scene.globe.dynamicAtmosphereLighting
 *
 * Disabling all of them eliminates every ComputeEngine pass on viewer2,
 * which is fine for a comparison viewport — it renders the same geometry
 * at the same camera angle as the primary, just without HDR/PBR atmosphere.
 */
function _applySceneDefaultsSecondary(scene) {
  // Globe render settings — keep depth test but turn off ALL lighting/atmosphere
  scene.globe.enableLighting          = false  // ← no vertex-normal LUT compute
  scene.globe.depthTestAgainstTerrain = true
  scene.globe.showGroundAtmosphere    = false  // ← no ground atmosphere compute
  scene.globe.dynamicAtmosphereLighting          = false  // ← no dynamic atmosphere LUT
  scene.globe.dynamicAtmosphereLightingFromSun   = false

  // Remove sky/atmosphere objects entirely so their update() never runs
  try { scene.skyAtmosphere = undefined } catch (_) {}
  try { scene.skyBox         = undefined } catch (_) {}

  // Disable IBL (image-based lighting) — these trigger specular LUT computes
  scene.sphericalHarmonicCoefficients = undefined
  scene.specularEnvironmentMaps       = undefined

  // scene.atmosphere controls dynamic atmosphere lighting on 3D Tiles/models
  // Setting show=false prevents its compute passes from firing
  if (scene.atmosphere) {
    scene.atmosphere.show = false
  }

  scene.backgroundColor  = Cesium.Color.fromCssColorString('#07070d')
  scene.highDynamicRange = false
}

export function setTerrainVisible(show) {
  if (!window.viewer) return

  if (show) {
    window.viewer.terrainProvider = window.customTerrain
  } else {
    window.viewer.terrainProvider =
      new window.Cesium.EllipsoidTerrainProvider()
  }

  window.viewer.scene.requestRender()
}

// ═══════════════════════════════════════════════════════════════════════════
//  BASEMAP — shared imagery logic, usable against any imageryLayers
// ═══════════════════════════════════════════════════════════════════════════

// Ion asset IDs confirmed in this account:
//   2        Bing Maps Aerial
//   3        Bing Maps Aerial with Labels
//   4        Bing Maps Road
//   3830182  Google Maps 2D Satellite
//   3830183  Google Maps 2D Satellite with Labels
//   3830184  Google Maps 2D Roadmap
//   3830186  Google Maps 2D Contour
const ION_ASSETS = {
  aerial:            2,
  aerial_labels:     3,
  roads:             4,
  gmaps_sat:         3830182,
  gmaps_sat_labels:  3830183,
  gmaps_road:        3830184,
  gmaps_contour:     3830186,
}

async function _applyBasemap(imageryLayers, id) {
  imageryLayers.removeAll()

  try {
    if (id in ION_ASSETS) {
      imageryLayers.add(new Cesium.ImageryLayer(
        await Cesium.IonImageryProvider.fromAssetId(ION_ASSETS[id])
      ))
    } else if (id === 'osm') {
      let provider
      try {
        provider = await Cesium.OpenStreetMapImageryProvider.fromUrl('https://tile.openstreetmap.org/')
      } catch (_) {
        provider = new Cesium.OpenStreetMapImageryProvider({ url: 'https://tile.openstreetmap.org/' })
      }
      imageryLayers.add(new Cesium.ImageryLayer(provider))
    } else if (id === 'dark') {
      let provider
      try {
        provider = await Cesium.OpenStreetMapImageryProvider.fromUrl('https://tile.openstreetmap.org/')
      } catch (_) {
        provider = new Cesium.OpenStreetMapImageryProvider({ url: 'https://tile.openstreetmap.org/' })
      }
      const layer = new Cesium.ImageryLayer(provider)
      layer.brightness = 0.3
      layer.contrast   = 1.8
      imageryLayers.add(layer)
    } else if (id === 'none') {
      // intentionally empty
    } else {
      // fallback to Bing Aerial
      imageryLayers.add(new Cesium.ImageryLayer(
        await Cesium.IonImageryProvider.fromAssetId(2)
      ))
    }
  } catch (e) {
    console.warn('[basemap] imagery provider failed:', id, e)
  }
}

export async function setBasemap(id) {
  if (!viewer) return
  await _applyBasemap(viewer.imageryLayers, id)
  viewer.scene.requestRender()
}

/** Same as setBasemap, but targets the secondary (split-view) viewer. */
export async function setBasemap2(id) {
  if (!viewer2) return
  await _applyBasemap(viewer2.imageryLayers, id)
  viewer2.scene.requestRender()
}

// ═══════════════════════════════════════════════════════════════════════════
//  SECONDARY VIEWER (split view)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Creates the secondary Cesium viewer used only while split view is on.
 * Mirrors the primary's terrain + scene settings. Its own camera
 * controller stays fully enabled — viewerSync.js keeps it locked to the
 * primary's camera bidirectionally (move either viewport, the other
 * follows), so both remain independently interactive at all times.
 *
 * IMPORTANT: this is async and resolves only once the container has real
 * (non-zero) layout dimensions. Constructing Cesium.Viewer against a
 * container that hasn't been laid out yet (width/height still 0 from the
 * browser's perspective) is what produced the
 * "GL_INVALID_FRAMEBUFFER_OPERATION ... default size is zero" console
 * spam — Cesium builds its WebGL drawing buffer at construction time
 * against whatever size the container reports right then, and a single
 * requestAnimationFrame isn't always enough to guarantee a layout pass
 * has actually run first. Polling rAF until the size is real removes
 * that race entirely.
 *
 * @param {string} containerId — DOM id of the (already-mounted) container div
 */
export async function initSecondaryViewer(containerId) {
  console.log('[DIAG][initSecondaryViewer] called, containerId:', containerId, '| existing viewer2:', !!viewer2)
  if (viewer2) destroySecondaryViewer()

  const container = document.getElementById(containerId)
  if (!container) {
    console.warn('[initSecondaryViewer] container not found:', containerId)
    return null
  }

  console.log('[DIAG][initSecondaryViewer] container found, initial size:', container.clientWidth, 'x', container.clientHeight)

  // Wait for real layout. Most of the time this resolves on the very
  // first or second frame; the 200-frame cap (~a few seconds at worst)
  // is just a safety net against an infinite wait if something else is
  // wrong with the layout.
  let attempts = 0
  while (
    (container.clientWidth === 0 || container.clientHeight === 0) &&
    attempts < 200
  ) {
    await new Promise(resolve => requestAnimationFrame(resolve))
    attempts++
  }

  console.log('[DIAG][initSecondaryViewer] size after waiting (' + attempts + ' frames):', container.clientWidth, 'x', container.clientHeight)

  if (container.clientWidth === 0 || container.clientHeight === 0) {
    console.warn('[initSecondaryViewer] container still has zero size after waiting — proceeding anyway:', containerId)
  }

  console.log('[DIAG][initSecondaryViewer] constructing fresh terrain provider for viewer2 (NOT sharing window.customTerrain — see createFreshTerrainProvider docstring)')
  const terrain2 = await createFreshTerrainProvider()

  console.log('[DIAG][initSecondaryViewer] constructing Cesium.Viewer now')
  viewer2 = new Cesium.Viewer(containerId, {
    terrainProvider: terrain2,

    animation:            false,
    baseLayerPicker:      false,
    fullscreenButton:     false,
    geocoder:             false,
    homeButton:           false,
    infoBox:              false,
    navigationHelpButton: false,
    sceneModePicker:      false,
    selectionIndicator:   false,
    timeline:             false,

    requestRenderMode:       true,
    maximumRenderTimeChange: Infinity,
    msaaSamples:             1,   // MUST be 1 for the secondary viewer.
    // msaaSamples > 1 uses a multisampled renderbuffer that Cesium resolves
    // into a texture via ComputeEngine. That resolve texture gets compiled
    // into viewer1's WebGL context (the first context to trigger it), then
    // when viewer2's ComputeEngine tries to attach it to its own framebuffer
    // you get "framebufferTexture2D: object does not belong to this context".
    // The secondary viewport is a comparison view — no MSAA is acceptable.
  })

  _applySceneDefaultsSecondary(viewer2.scene)  // atmosphere disabled — avoids WebGL cross-context errors
  viewer2.clock.currentTime = Cesium.JulianDate.fromIso8601('2025-11-06T03:00:00Z')

  installCesiumGLDiagnostics(viewer2, 'secondary/split-view')

  // viewer2's camera controller is left fully enabled — both viewports
  // are independently interactive. viewerSync.js keeps the two cameras
  // locked together bidirectionally: moving either one pushes its
  // camera to the other, rather than one being a fixed, uninteractive
  // "follower" of the other.

  // One more resize+render right after construction, belt-and-suspenders
  // against any layout shift that happened during the await above (e.g.
  // a scrollbar appearing/disappearing).
  viewer2.resize()
  const canvas2 = viewer2.scene.canvas
  console.log('[DIAG][initSecondaryViewer] viewer2 constructed. Canvas size:', canvas2.width, 'x', canvas2.height, '| clientWidth:', canvas2.clientWidth, 'x', canvas2.clientHeight)
  viewer2.scene.requestRender()

  console.log('[DIAG][initSecondaryViewer] DONE — returning viewer2')
  return viewer2
}

/** Tears down the secondary viewer cleanly. Safe to call even if it's already null. */
export function destroySecondaryViewer() {
  console.log('[DIAG][destroySecondaryViewer] called, viewer2 exists:', !!viewer2)
  if (!viewer2) return
  try {
    if (!viewer2.isDestroyed()) {
      // Explicitly release the WebGL context before destroying the viewer.
      // Without this, Chrome holds the context slot alive via DOM references
      // on the canvas even after destroy(), causing GPU resource leaks that
      // contaminate the next viewer2 created in the same session.
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
  console.log('[DIAG][destroySecondaryViewer] viewer2 destroyed and set to null')
}