/**
 * layers.js — ES module version
 *
 * All Cesium calls use the globally available window.Cesium (set by cesiumInit.js).
 * All viewer calls use window.viewer (set by cesiumInit.js).
 *
 * VISIBILITY RULES (enforced by syncVisibility):
 *   mesh      — view mode; gated by chk-mesh
 *   pc        — view mode; gated by chk-pc
 *   meshA     — compare mode; gated by chk-date-a
 *   meshB     — compare mode; gated by chk-date-b
 *   diffPrim  — both modes; always shown, filtered by reapplyDiffFilter()
 */

import { CONFIG } from '../config'
import { setStatus, toast, requestRender } from './cesiumInit'

export const state = {
  siteId:   null,
  dateId:   null,
  mesh:     null,
  pc:       null,
  meshA:    null,
  meshB:    null,
  diffPrim: null,
}

let _pointSize = CONFIG.DEFAULTS.POINT_SIZE

// ═══════════════════════════════════════════════════════════════════════════
//  VISIBILITY SYNC
// ═══════════════════════════════════════════════════════════════════════════

export function syncVisibility(mode, checkboxState) {
  // checkboxState is passed from React so we don't read the DOM directly
  const {
    mesh    = true,
    pc      = false,
    dateA   = true,
    dateB   = true,
  } = checkboxState || {}

  const inCompare = mode === 'compare'

  if (state.mesh)  state.mesh.show  = mesh
  if (state.pc)    state.pc.show    = pc
  if (state.meshA) state.meshA.show = inCompare && dateA
  if (state.meshB) state.meshB.show = inCompare && dateB
  if (state.diffPrim) state.diffPrim.show = true

  requestRender()
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
    //color: `color("rgba(${r},${g},${b},${alpha})")`,
    color: `rgba(${r}, ${g}, ${b}, ${alpha})`
  })
}

export function setDateATint(hex, alpha) {
  if (state.meshA) state.meshA.style = _makeTintStyle(hex, alpha)
  requestRender()
}

export function setDateBTint(hex, alpha) {
  if (state.meshB) state.meshB.style = _makeTintStyle(hex, alpha)
  requestRender()
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
  state.mesh = state.pc = state.meshA = state.meshB = state.diffPrim = null
  if (window.diffState) window.diffState.voxels = []
  requestRender()
}

export function clearCompareLayers() {
  _rm(state.meshA); _rm(state.meshB); _rm(state.diffPrim)
  state.meshA = state.meshB = state.diffPrim = null
  if (window.diffState) window.diffState.voxels = []
  requestRender()
}

// ═══════════════════════════════════════════════════════════════════════════
//  LOADERS
// ═══════════════════════════════════════════════════════════════════════════

export async function loadDate(site, dateObj, currentMode, checkboxState) {
  _rm(state.mesh); _rm(state.pc)
  state.mesh = state.pc = null

  state.siteId = site.id
  state.dateId = dateObj.id
  setStatus(`Loading ${site.labelEn} — ${dateObj.label}…`)

  // meshZOffset: per-date DB value → site default → global config default
  const zOffset = site.meshZOffset ?? CONFIG.DEFAULTS.MESH_Z_OFFSET

  const [meshRes, pcRes] = await Promise.allSettled([
    _loadTileset(dateObj.mesh,       true, 8, zOffset),
    _loadTileset(dateObj.pointCloud, true, 2, null),
  ])

  if (meshRes.value) {
    state.mesh = meshRes.value
    toast('✓ 3D Mesh loaded', 'ok')
  } else if (dateObj.mesh) {
    toast('Mesh not found — check path in config.js', 'warn')
  }

  if (pcRes.value) {
    state.pc = pcRes.value
    setPointSize(state.pc, _pointSize)
    toast('✓ Point Cloud loaded', 'ok')
  } else if (dateObj.pointCloud) {
    toast('Point cloud not found — check path in config.js', 'warn')
  }

  syncVisibility(currentMode || 'view', checkboxState)
  setStatus(`${site.labelEn} — ${dateObj.label} ready`, true)
}

export async function loadCompare(site, dateA, dateB, currentMode, tintA, tintB, checkboxState) {
  _rm(state.meshA); _rm(state.meshB)
  state.meshA = state.meshB = null

  setStatus(`Loading comparison: ${dateA.label} vs ${dateB.label}…`)

  const zOffset = site.meshZOffset ?? CONFIG.DEFAULTS.MESH_Z_OFFSET

  const [r0, r1] = await Promise.allSettled([
    _loadTileset(dateA.mesh, true, 8, zOffset),
    _loadTileset(dateB.mesh, true, 8, zOffset),
  ])

  state.meshA = r0.value || null
  state.meshB = r1.value || null

  // Apply tint colours supplied by React state
  const ta = tintA || { hex: '#d49050', alpha: 0.9 }
  const tb = tintB || { hex: '#4d9fff', alpha: 0.9 }
  if (state.meshA) state.meshA.style = _makeTintStyle(ta.hex, ta.alpha)
  if (state.meshB) state.meshB.style = _makeTintStyle(tb.hex, tb.alpha)

  syncVisibility(currentMode || 'compare', checkboxState)
  setStatus(`Compare: ${dateA.label} vs ${dateB.label}`, true)
  requestRender()
}

// ═══════════════════════════════════════════════════════════════════════════
//  GENERIC TILESET LOADER  (internal)
// ═══════════════════════════════════════════════════════════════════════════

async function _loadTileset(url, show, maxSSE, zOffset) {
  if (!url) return null
  try {
    const Cesium = window.Cesium
    const ts = await Cesium.Cesium3DTileset.fromUrl(url, {
      maximumScreenSpaceError: maxSSE,
    })
    window.viewer.scene.primitives.add(ts)
    ts.show = show

    if (url.includes('mesh') && zOffset != null) {
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
  requestRender()
}

/**
 * Re-apply mesh Z-offset to the currently loaded mesh without reloading.
 * Called when the user edits the offset in the panel.
 */
export function applyMeshZOffset(zOffset) {
  if (!state.mesh) return
  const Cesium = window.Cesium
  const center = state.mesh.boundingSphere.center
  const carto  = Cesium.Cartographic.fromCartesian(center)

  // Re-compute translation from the tileset's natural centre
  // We need the ORIGINAL centre (before any modelMatrix), so reset first
  state.mesh.modelMatrix = Cesium.Matrix4.IDENTITY.clone()
  const origCenter = state.mesh.boundingSphere.center
  const origCarto  = Cesium.Cartographic.fromCartesian(origCenter)

  const offset = Cesium.Cartesian3.fromRadians(
    origCarto.longitude, origCarto.latitude,
    origCarto.height + zOffset
  )
  const translation = Cesium.Cartesian3.subtract(
    offset, origCenter, new Cesium.Cartesian3()
  )
  state.mesh.modelMatrix = Cesium.Matrix4.fromTranslation(translation)
  requestRender()
}

// ═══════════════════════════════════════════════════════════════════════════
//  VOXEL DIFF RENDERER
// ═══════════════════════════════════════════════════════════════════════════

export function renderVoxelDiff(voxels, voxelSize) {
  _rm(state.diffPrim)
  state.diffPrim = null

  if (!voxels?.length) {
    requestRender()
    return
  }

  const Cesium = window.Cesium

  const addedC   = Cesium.Color.fromCssColorString(CONFIG.DIFF_COLORS.ADDED)
  const removedC = Cesium.Color.fromCssColorString(CONFIG.DIFF_COLORS.REMOVED)

  const {
    lonStep,
    latStep,
    hStep,
  } = window.diffState.gridDef

  const instances = voxels.map(v => {
    const { iLon, iLat, iH } = v.voxel

    const lon = (iLon + 0.5) * lonStep
    const lat = (iLat + 0.5) * latStep
    const h   = (iH   + 0.5) * hStep

    const center = Cesium.Cartesian3.fromDegrees(lon, lat, h)

    const col = (
      v.type === 'added'
        ? addedC
        : removedC
    ).withAlpha(0.85)

    return new Cesium.GeometryInstance({
      geometry: Cesium.BoxGeometry.fromDimensions({
        dimensions: new Cesium.Cartesian3(
          voxelSize,
          voxelSize,
          voxelSize
        ),
        vertexFormat:
          Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
      }),

      modelMatrix:
        Cesium.Transforms.eastNorthUpToFixedFrame(center),

      attributes: {
        color:
          Cesium.ColorGeometryInstanceAttribute.fromColor(col),
      },
    })
  })

  state.diffPrim =
    window.viewer.scene.primitives.add(
      new Cesium.Primitive({
        geometryInstances: instances,

        appearance:
          new Cesium.PerInstanceColorAppearance({
            translucent: true,
            closed: true,
          }),

        releaseGeometryInstances: true,
        compressVertices: false,
      })
    )

  requestRender()
}