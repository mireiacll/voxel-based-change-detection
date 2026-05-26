/**
 * diff.js — ES module version
 *
 * Client-side 3-D change detection with polygon area filter.
 * All DOM interaction removed — results are returned via callbacks passed
 * from React (App.jsx) so the component can update its own state.
 *
 * See original diff.js for full algorithm documentation.
 */

import { CONFIG } from './config'
import { toast, requestRender } from './cesiumInit'
import { loadCompare, renderVoxelDiff } from './layers'

// ── Global diff state (read by layers.js) ─────────────────────────────────
window.diffState = {
  voxels:         [],
  voxelSize:      CONFIG.DEFAULTS.VOXEL_SIZE,
  addedVisible:   CONFIG.DEFAULTS.SHOW_ADDED,
  removedVisible: CONFIG.DEFAULTS.SHOW_REMOVED,
}

// ── Polygon drawing state ─────────────────────────────────────────────────
const _poly = {
  drawing:  false,
  closed:   false,
  pts:      [],
  geo:      [],
  handler:  null,
  entities: [],
}

// Callback supplied by React to show/hide the draw banner
let _onDrawBanner = () => {}
let _onDrawInfo   = () => {}

export function setDrawCallbacks(onBanner, onInfo) {
  _onDrawBanner = onBanner
  _onDrawInfo   = onInfo
}

export function togglePolygonDraw() {
  if (_poly.drawing || _poly.closed) {
    _clearPoly()
    _onDrawInfo('No area selected — diff runs on full extent')
  } else {
    _startDraw()
  }
}

function _startDraw() {
  _clearPoly()
  _poly.drawing = true

  const site = window.currentSite
  if (site) {
    // import lazily to avoid circular dep
    import('./cesiumInit').then(({ flyTo }) =>
      flyTo(site.camera.lon, site.camera.lat, site.camera.height * 1.2, -90, 0)
    )
  }

  window.viewer.scene.canvas.style.cursor = 'crosshair'
  _onDrawBanner(true)
  _onDrawInfo('Click on the map to add vertices…')

  const Cesium = window.Cesium

  _poly.entities.push(window.viewer.entities.add({
    polygon: {
      hierarchy: new Cesium.CallbackProperty(
        () => _poly.pts.length >= 3
          ? new Cesium.PolygonHierarchy(_poly.pts)
          : new Cesium.PolygonHierarchy([]),
        false
      ),
      material: Cesium.Color.YELLOW.withAlpha(0.12),
    },
  }))
  _poly.entities.push(window.viewer.entities.add({
    polyline: {
      positions: new Cesium.CallbackProperty(
        () => _poly.pts.length >= 2 ? [..._poly.pts, _poly.pts[0]] : [..._poly.pts],
        false
      ),
      width: 2,
      material: new Cesium.PolylineDashMaterialProperty({
        color: Cesium.Color.YELLOW, dashLength: 16,
      }),
      clampToGround: true,
    },
  }))

  _poly.handler = new Cesium.ScreenSpaceEventHandler(window.viewer.scene.canvas)
  _poly.handler.setInputAction(e => {
    if (!_poly.drawing) return
    const ray = window.viewer.camera.getPickRay(e.position)
    const pos = window.viewer.scene.globe.pick(ray, window.viewer.scene)
    if (!pos) return
    _addVertex(pos)
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK)

  _poly.handler.setInputAction(() => {
    if (_poly.pts.length >= 3) _closePoly()
    else toast('Need at least 3 vertices to close the polygon', 'warn')
  }, Cesium.ScreenSpaceEventType.RIGHT_CLICK)

  _poly.handler.setInputAction(() => {
    if (_poly.pts.length > 3) {
      _poly.pts.pop(); _poly.geo.pop()
      const dot = _poly.entities.pop()
      if (dot) window.viewer.entities.remove(dot)
    }
    if (_poly.pts.length >= 3) _closePoly()
  }, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK)
}

function _addVertex(cartesian) {
  const Cesium = window.Cesium
  _poly.pts.push(cartesian)
  const c = Cesium.Cartographic.fromCartesian(cartesian)
  _poly.geo.push({
    lon: Cesium.Math.toDegrees(c.longitude),
    lat: Cesium.Math.toDegrees(c.latitude),
  })
  _poly.entities.push(window.viewer.entities.add({
    position: cartesian,
    point: {
      pixelSize: 8, color: Cesium.Color.YELLOW,
      outlineColor: Cesium.Color.fromCssColorString('#111'), outlineWidth: 1.5,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  }))
  const n = _poly.pts.length
  _onDrawInfo(`${n} ${n === 1 ? 'vertex' : 'vertices'}` +
    (n >= 3 ? ' — right-click or double-click to close' : ''))
  requestRender()
}

function _closePoly() {
  _poly.drawing = false; _poly.closed = true
  if (_poly.handler) { _poly.handler.destroy(); _poly.handler = null }
  window.viewer.scene.canvas.style.cursor = ''
  _onDrawBanner(false)
  _onDrawInfo(`✓ ${_poly.pts.length}-vertex polygon — run diff to apply`)
  toast(`Area selected (${_poly.pts.length} vertices). Now run the diff.`, 'ok')
  requestRender()
}

function _clearPoly() {
  _poly.drawing = false; _poly.closed = false
  _poly.pts = []; _poly.geo = []
  if (_poly.handler) { _poly.handler.destroy(); _poly.handler = null }
  _poly.entities.forEach(e => { try { window.viewer.entities.remove(e) } catch (_) {} })
  _poly.entities = []
  if (window.viewer) window.viewer.scene.canvas.style.cursor = ''
  _onDrawBanner(false)
  requestRender()
}

function _pip(lon, lat, poly) {
  if (!poly || poly.length < 3) return true
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].lon, yi = poly[i].lat
    const xj = poly[j].lon, yj = poly[j].lat
    if (((yi > lat) !== (yj > lat)) &&
        lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

// ═════════════════════════════════════════════════════════════════════════
//  GLB PARSER — mago3d-tiler point cloud format
// ═════════════════════════════════════════════════════════════════════════

function _parseGlb(arrayBuffer) {
  const dv = new DataView(arrayBuffer)
  if (dv.getUint8(0) !== 0x67 || dv.getUint8(1) !== 0x6C ||
      dv.getUint8(2) !== 0x54 || dv.getUint8(3) !== 0x46) {
    console.warn('[diff] Not a valid GLB'); return []
  }

  const jsonLen = dv.getUint32(12, true)
  const gltf    = JSON.parse(new TextDecoder().decode(
                    new Uint8Array(arrayBuffer, 20, jsonLen)))

  const binBase = 20 + jsonLen + 8

  let posAccIdx = -1
  for (const mesh of (gltf.meshes || [])) {
    for (const prim of (mesh.primitives || [])) {
      if (prim.attributes?.POSITION !== undefined) {
        posAccIdx = prim.attributes.POSITION; break
      }
    }
    if (posAccIdx >= 0) break
  }
  if (posAccIdx < 0) { console.warn('[diff] GLB: no POSITION'); return [] }

  const acc    = gltf.accessors[posAccIdx]
  const bv     = gltf.bufferViews[acc.bufferView]
  const count  = acc.count
  const stride = bv.byteStride || 6
  const binOff = binBase + (bv.byteOffset || 0) + (acc.byteOffset || 0)
  const raw    = new DataView(arrayBuffer, binOff)

  let rtx = 0, rty = 0, rtz = 0
  let pcm = null
  for (const nd of (gltf.nodes || [])) {
    if (nd.matrix && nd.mesh !== undefined) {
      pcm = nd.matrix
    } else if (nd.translation && nd.children && !nd.matrix) {
      [rtx, rty, rtz] = nd.translation
    }
  }
  if (!pcm) { console.warn('[diff] GLB: no PCN matrix'); return [] }

  const M = pcm
  const A  = 6378137.0, E2 = 0.00669437999014

  function toGeodetic(ex, ey, ez) {
    const p = Math.sqrt(ex*ex + ey*ey)
    let lat = Math.atan2(ez, p * (1 - E2))
    for (let i = 0; i < 10; i++) {
      const s = Math.sin(lat)
      const N = A / Math.sqrt(1 - E2*s*s)
      lat = Math.atan2(ez + E2*N*s, p)
    }
    const s = Math.sin(lat), c = Math.cos(lat)
    const N = A / Math.sqrt(1 - E2*s*s)
    return {
      lon: Math.atan2(ey, ex) * 180 / Math.PI,
      lat: lat * 180 / Math.PI,
      h:   (Math.abs(c) > 1e-9 ? p/c - N : Math.abs(ez)/s - N*(1-E2)),
    }
  }

  const out = []
  for (let i = 0; i < count; i++) {
    const base = i * stride
    const lx = raw.getUint16(base,     true) / 65535
    const ly = raw.getUint16(base + 2, true) / 65535
    const lz = raw.getUint16(base + 4, true) / 65535
    const wx = M[0]*lx + M[4]*ly + M[8]*lz  + M[12]
    const wy = M[1]*lx + M[5]*ly + M[9]*lz  + M[13]
    const wz = M[2]*lx + M[6]*ly + M[10]*lz + M[14]
    const gx = wx + rtx, gy = wy + rty, gz = wz + rtz
    out.push(toGeodetic(gx, -gz, gy))
  }
  return out
}

function _collectGlbUris(tile, out) {
  if (!tile) return
  const uri = tile.content?.uri || tile.content?.url || ''
  if (uri.toLowerCase().endsWith('.glb')) out.push(uri)
  if (tile.children) tile.children.forEach(c => _collectGlbUris(c, out))
}

async function _loadAllPoints(tilesetUrl) {
  if (!tilesetUrl) return []
  const baseUrl = new URL(tilesetUrl, window.location.href)
  let tsJson
  try {
    const r = await fetch(tilesetUrl)
    if (!r.ok) { console.error('[diff] tileset failed:', tilesetUrl, r.status); return [] }
    tsJson = await r.json()
  } catch (e) { console.error('[diff] tileset parse error:', e); return [] }

  const uris = []
  _collectGlbUris(tsJson.root, uris)
  console.log(`[diff] ${uris.length} tiles in ${tilesetUrl}`)

  const groups = await Promise.all(uris.map(async uri => {
    const url = new URL(uri, baseUrl).href
    try {
      const r = await fetch(url)
      if (!r.ok) { console.warn('[diff] tile failed:', url, r.status); return [] }
      return _parseGlb(await r.arrayBuffer())
    } catch (e) { console.warn('[diff] tile error:', url, e); return [] }
  }))

  const all = groups.flat()
  console.log(`[diff] ${all.length} points from ${tilesetUrl}`)
  return all
}

// ═════════════════════════════════════════════════════════════════════════
//  STEP 1 — Build sparse surface occupancy from raw points
// ═════════════════════════════════════════════════════════════════════════

function _buildSurface(points, gridDef, polygon) {
  const map = new Map()
  const { lonStep, latStep, hStep } = gridDef

  for (const { lon, lat, h } of points) {
    if (!isFinite(lon) || !isFinite(lat) || !isFinite(h)) continue
    if (polygon && !_pip(lon, lat, polygon)) continue

    const iLon = Math.floor(lon / lonStep)
    const iLat = Math.floor(lat / latStep)
    const iH   = Math.floor(h   / hStep)
    const key  = `${iLon},${iLat},${iH}`
    if (!map.has(key)) map.set(key, { iLon, iLat, iH })
  }
  return map
}

// ═════════════════════════════════════════════════════════════════════════
//  STEP 2 — Solidify: fill each column from global floor to its max
// ═════════════════════════════════════════════════════════════════════════

function _solidify(surfaceA, surfaceB, gridDef) {
  const { lonStep, latStep, hStep } = gridDef

  let globalFloorH = Infinity
  for (const { iH } of surfaceA.values()) globalFloorH = Math.min(globalFloorH, iH)
  for (const { iH } of surfaceB.values()) globalFloorH = Math.min(globalFloorH, iH)
  if (!isFinite(globalFloorH)) globalFloorH = 0

  console.log(`[diff] Global floor voxel: iH = ${globalFloorH}  (h ≈ ${(globalFloorH * hStep).toFixed(1)} m)`)

  function buildColumnMap(surface) {
    const cols = new Map()
    for (const { iLon, iLat, iH } of surface.values()) {
      const colKey = `${iLon},${iLat}`
      if (!cols.has(colKey)) {
        cols.set(colKey, { iLon, iLat, maxH: iH })
      } else {
        const col = cols.get(colKey)
        if (iH > col.maxH) col.maxH = iH
      }
    }
    return cols
  }

  function fillColumns(cols) {
    const Cesium = window.Cesium
    const solid = new Map()
    for (const { iLon, iLat, maxH } of cols.values()) {
      for (let iH = globalFloorH; iH <= maxH; iH++) {
        const key = `${iLon},${iLat},${iH}`
        if (!solid.has(key)) {
          solid.set(key, Cesium.Cartesian3.fromDegrees(
            (iLon + 0.5) * lonStep,
            (iLat + 0.5) * latStep,
            (iH   + 0.5) * hStep
          ))
        }
      }
    }
    return solid
  }

  const solidA = fillColumns(buildColumnMap(surfaceA))
  const solidB = fillColumns(buildColumnMap(surfaceB))

  console.log(`[diff] Solid voxels — A: ${solidA.size}, B: ${solidB.size}`)
  return { solidA, solidB }
}

// ═════════════════════════════════════════════════════════════════════════
//  ENTRY POINT
// ═════════════════════════════════════════════════════════════════════════

/**
 * @param {object}   site
 * @param {object}   dateA
 * @param {object}   dateB
 * @param {string}   currentMode
 * @param {number}   voxSize         — from React state (voxel size input)
 * @param {object}   tintA           — { hex, alpha } from React state
 * @param {object}   tintB           — { hex, alpha } from React state
 * @param {object}   checkboxState   — { mesh, pc, dateA, dateB, added, removed }
 * @param {function} onDiffStatus    — (state, msg) => void   → React state
 * @param {function} onStats         — ({ added, removed, net, voxels, clipped }) => void
 */
export async function runVoxelDiff(
  site, dateA, dateB, currentMode,
  voxSize, tintA, tintB, checkboxState,
  onDiffStatus, onStats
) {
  const polygon = _poly.closed ? _poly.geo : null

  window.diffState.voxelSize      = voxSize
  window.diffState.addedVisible   = checkboxState?.added   ?? true
  window.diffState.removedVisible = checkboxState?.removed ?? true

  // 1. Load meshes for visual display
  onDiffStatus('computing', `Loading meshes: ${dateA.label} vs ${dateB.label}…`)
  await loadCompare(site, dateA, dateB, currentMode, tintA, tintB, checkboxState)

  // 2. Fetch all point cloud GLBs in parallel
  onDiffStatus('computing', `Fetching point clouds${polygon ? ' (polygon filter)' : ''}…`)

  const [rawA, rawB] = await Promise.all([
    _loadAllPoints(dateA.pointCloud),
    _loadAllPoints(dateB.pointCloud),
  ])

  console.log(`[diff] Raw points — A: ${rawA.length}, B: ${rawB.length}`)

  if (!rawA.length && !rawB.length) {
    toast('No point cloud data — check pointCloud paths in config.js', 'warn')
    onDiffStatus('done', 'No data loaded')
    return
  }

  // 3. Build grid definition
  const allValid = [...rawA, ...rawB]
    .filter(p => isFinite(p.lon) && isFinite(p.lat) && isFinite(p.h))
  const avgLat = allValid.reduce((s, p) => s + p.lat, 0) / allValid.length
  const cosLat = Math.cos(avgLat * Math.PI / 180)
  const gridDef = {
    lonStep: voxSize / (111000 * cosLat),
    latStep: voxSize / 111000,
    hStep:   voxSize,
  }

  // 4. Build sparse surface maps
  onDiffStatus('computing', `Voxelizing ${rawA.length + rawB.length} points @ ${voxSize}m…`)

  const surfaceA = _buildSurface(rawA, gridDef, polygon)
  const surfaceB = _buildSurface(rawB, gridDef, polygon)
  console.log(`[diff] Surface voxels — A: ${surfaceA.size}, B: ${surfaceB.size}`)

  // 5. Solidify
  onDiffStatus('computing', 'Solidifying columns…')
  const { solidA, solidB } = _solidify(surfaceA, surfaceB, gridDef)

  // 6. Compute diff
  const added = [], removed = []
  for (const [key, center] of solidB) {
    if (!solidA.has(key)) added.push({ center, type: 'added' })
  }
  for (const [key, center] of solidA) {
    if (!solidB.has(key)) removed.push({ center, type: 'removed' })
  }

  console.log(`[diff] Diff — added: ${added.length}, removed: ${removed.length}`)

  window.diffState.voxels = [...added, ...removed]

  // Report stats to React
  onStats({
    added:   added.length,
    removed: removed.length,
    voxSize,
    clipped: polygon !== null,
  })

  renderVoxelDiff(getFilteredVoxels(), voxSize)
  onDiffStatus('done',
    `Done — ${added.length} added, ${removed.length} removed` +
    (polygon ? ' (polygon)' : ''))
}

// ── Visibility filter ─────────────────────────────────────────────────────

export function getFilteredVoxels() {
  return window.diffState.voxels.filter(v => {
    if (v.type === 'added'   && !window.diffState.addedVisible)   return false
    if (v.type === 'removed' && !window.diffState.removedVisible) return false
    return true
  })
}

export function reapplyDiffFilter(addedVisible, removedVisible) {
  window.diffState.addedVisible   = addedVisible
  window.diffState.removedVisible = removedVisible
  renderVoxelDiff(getFilteredVoxels(), window.diffState.voxelSize)
}