/**
 * layers.js — ES module
 *
 * VISIBILITY RULES:
 *   view/compare  → mesh or pc  (the "background" single-date layer)
 *   compare only  → meshA, meshB  (hidden in timeline)
 *   all modes     → diffPrim (voxel diff boxes; hidden in timeline, shown in compare)
 *   timeline      → only diffPrim shown (meshA/meshB hidden, mesh/pc hidden)
 *
 * Per-date toggle: each toggled date loads into state.mesh/pc (only one at a time
 * for now — multi-date toggle is a future enhancement; the Set in App tracks UI state
 * but layers.js only holds the last loaded single date layer).
 */

import { CONFIG } from '../config'
import { setStatus, toast, requestRender } from './cesiumInit'

export const state = {
  siteId:     null,
  dateId:     null,
  mesh:       null,   // single-date view layer (mesh)
  pc:         null,   // single-date view layer (point cloud)
  meshA:      null,   // compare A
  meshB:      null,   // compare B
  diffPrim:   null,   // voxel diff primitive
  timeseriesTs: null, // pre-computed timeseries diff tileset
}

let _pointSize = CONFIG.DEFAULTS.POINT_SIZE

// ═══════════════════════════════════════════════════════════════════════════
//  VISIBILITY SYNC
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @param {string}  mode           — 'compare' | 'timeline'
 * @param {object}  checkboxState  — { dataset, dateA, dateB, added, removed }
 */
export function syncVisibility(mode, checkboxState) {
  const {
    dataset  = true,
    dateA    = true,
    dateB    = true,
    added    = true,
    removed  = true,
  } = checkboxState || {}

  const inCompare  = mode === 'compare'
  const inTimeline = mode === 'timeline'

  // Single-date background layer 
  if (state.mesh) state.mesh.show = dataset
  if (state.pc)   state.pc.show   = dataset

  // A/B comparison layers — only in compare mode
  if (state.meshA) state.meshA.show = inCompare && dateA
  if (state.meshB) state.meshB.show = inCompare && dateB

  // Diff primitive — shown in compare (if exists) and timeline
  // In compare: controlled by showAdded/showRemoved 
  if (state.diffPrim) {
    state.diffPrim.show = inCompare || inTimeline
  }

  requestAnimationFrame(() => {
    requestRender()
  })
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
  _rm(state.mesh);  _rm(state.pc)
  _rm(state.meshA); _rm(state.meshB)
  _rm(state.diffPrim)
  _rm(state.timeseriesTs)
  state.mesh = state.pc = state.meshA = state.meshB = state.diffPrim = state.timeseriesTs = null
  if (window.diffState) window.diffState.voxels = []
  requestAnimationFrame(() => requestRender())
}

export function clearCompareLayers() {
  _rm(state.meshA); _rm(state.meshB); _rm(state.diffPrim)
  state.meshA = state.meshB = state.diffPrim = null
  if (window.diffState) window.diffState.voxels = []
  requestAnimationFrame(() => requestRender())
}

// ═══════════════════════════════════════════════════════════════════════════
//  LOADERS
// ═══════════════════════════════════════════════════════════════════════════

export async function loadDate(site, dateObj, currentMode, checkboxState) {
  _rm(state.mesh); _rm(state.pc)
  state.mesh = state.pc = null

  state.siteId = site.id
  state.dateId = dateObj.id
  setStatus(`Loading ${site.labelEn ?? site.label} — ${dateObj.label}…`)

  const zOffset  = site.meshZOffset ?? CONFIG.DEFAULTS.MESH_Z_OFFSET
  const isMesh   = dateObj.datasetType === 'mesh'
  const maxSSE   = isMesh ? 8 : 2
  const useZOff  = isMesh ? zOffset : null

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
  console.log('[INVALIDATE]', base, 'v=', _urlVersion.get(base))
}

// ═══════════════════════════════════════════════════════════════════════════
//  GENERIC TILESET LOADER (internal)
// ═══════════════════════════════════════════════════════════════════════════

async function _loadTileset(url, show, maxSSE, datasetType, zOffset) {
  if (!url) return null
  try {
    const Cesium  = window.Cesium
    const base    = url.split('?')[0]
    const version = _urlVersion.get(base) ?? 0
    const finalUrl = version > 0 ? `${base}?v=${version}` : base

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

    // Fix the render-glitch: force a render after the tileset geometry arrives
    ts.allTilesLoaded.addEventListener(() => {
      requestAnimationFrame(() => requestRender())
    })

    return ts
  } catch (e) {
    console.warn('[tileset] Failed:', url, e)
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
//  TIMESERIES TILESET LOADER
//  Loads a pre-colored 3D Tiles diff tileset (added=red / removed=blue,
//  already baked). tilesetPath is relative to public/ — same convention as
//  datasetPath on SurveyDate — so Cesium resolves it from the page root.
// ═══════════════════════════════════════════════════════════════════════════

export function clearTimeseriesLayer() {
  _rm(state.timeseriesTs)
  state.timeseriesTs = null
  requestAnimationFrame(() => requestRender())
}

export async function loadTimeseriesTileset(tilesetPath) {
  clearTimeseriesLayer()
  if (!tilesetPath) return

  try {
    const Cesium = window.Cesium
    const ts = await Cesium.Cesium3DTileset.fromUrl(tilesetPath, {
      maximumScreenSpaceError: 2,
    })
    window.viewer.scene.primitives.add(ts)
    ts.show = true
    ts.allTilesLoaded.addEventListener(() => {
      requestAnimationFrame(() => requestRender())
    })
    state.timeseriesTs = ts
  } catch (e) {
    console.warn('[layers] Failed to load timeseries tileset:', tilesetPath, e)
  }

  requestAnimationFrame(() => requestRender())
}