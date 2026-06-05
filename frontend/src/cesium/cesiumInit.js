/**
 * cesiumInit.js — Cesium viewer initialisation + shared helpers
 *
 * Converted from viewer.js to an ES module.
 * Accepts callback hooks so React (App.jsx) can receive status/toast updates
 * without this file depending on the DOM directly.
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

// Callbacks supplied by React at init time
let _onStatus = () => {}
let _onToast  = () => {}

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
  let terrain
  if (CONFIG.TERRAIN.ENABLED) {
    try {
      terrain = await Cesium.CesiumTerrainProvider.fromIonAssetId(CONFIG.TERRAIN.ASSET_ID)
    } catch (e) {
      console.warn('[viewer] Cesium World Terrain unavailable — using ellipsoid', e)
      terrain = new Cesium.EllipsoidTerrainProvider()
    }
  } else {
    terrain = new Cesium.EllipsoidTerrainProvider()
  }

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
  const scene = viewer.scene
  scene.globe.enableLighting          = true
  scene.globe.depthTestAgainstTerrain = true
  scene.globe.showGroundAtmosphere    = true
  scene.backgroundColor               = Cesium.Color.fromCssColorString('#07070d')
  scene.highDynamicRange              = false

  viewer.clock.currentTime = Cesium.JulianDate.fromIso8601('2025-11-06T03:00:00Z')

  // ── Mouse coordinate tracker ──────────────────────────────────────────────
  new Cesium.ScreenSpaceEventHandler(scene.canvas)
    .setInputAction((e) => {
      const ray = viewer.camera.getPickRay(e.endPosition)
      const pos = scene.globe.pick(ray, scene)
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

// ── Add this function to cesiumInit.js ───────────────────────────────────

export function setBasemap(id) {
  if (!viewer) return

  const layers = viewer.imageryLayers

  // Remove all existing imagery layers
  layers.removeAll()

  switch (id) {
    case 'aerial':
      layers.addImageryProvider(
        new Cesium.IonImageryProvider({ assetId: 2 }) // Bing Aerial
      )
      break

    case 'aerial_roads':
      layers.addImageryProvider(
        new Cesium.IonImageryProvider({ assetId: 3 }) // Bing Aerial with Labels
      )
      break

    case 'osm':
      layers.addImageryProvider(
        new Cesium.OpenStreetMapImageryProvider({
          url: 'https://tile.openstreetmap.org/',
        })
      )
      break

    case 'dark':
      // Cesium Ion asset 3812 = Mapbox Dark (if you have access),
      // fallback to a dark-tinted OSM
      layers.addImageryProvider(
        new Cesium.OpenStreetMapImageryProvider({
          url: 'https://tile.openstreetmap.org/',
        })
      )
      // Darken it with a colour filter
      if (layers.length > 0) {
        layers.get(0).colorToAlpha = new Cesium.Color(1, 1, 1, 0.5)
        layers.get(0).brightness   = 0.3
        layers.get(0).contrast     = 1.8
      }
      break

    case 'none':
      // Leave layers empty — shows the plain globe
      break

    default:
      layers.addImageryProvider(
        new Cesium.IonImageryProvider({ assetId: 2 })
      )
  }

  viewer.scene.requestRender()
}