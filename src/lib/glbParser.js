/**
 * lib/glbParser.js
 *
 * Parses a single mago3d-tiler .glb point-cloud file and returns
 * an array of geodetic points: Array<{ lon: number, lat: number, h: number }>
 *
 * No Cesium, no React, no browser APIs beyond ArrayBuffer / DataView / TextDecoder.
 * Safe to run in a Web Worker or Node.js.
 *
 * ── mago3d-tiler GLB format (verified against real files) ───────────────────
 *
 *  Node 0  "RootNode"
 *    translation: [tx, ty, tz]   ← ECEF position in glTF Y-up space
 *    children: [1]
 *
 *  Node 1  "PointCloudNode"
 *    matrix: [16 floats, column-major]  ← uniform scale + local offset
 *    mesh: 0
 *
 *  POSITION accessor:
 *    componentType: 5123 (uint16), normalized: true  → raw / 65535 = 0..1
 *    bufferView.byteStride: 8  (3 × uint16 = 6 bytes + 2 bytes padding)
 *
 *  Transform pipeline:
 *    1. lx,ly,lz = uint16 / 65535
 *    2. Apply PointCloudNode matrix M (column-major 4×4):
 *         wx = M[0]*lx + M[4]*ly + M[ 8]*lz + M[12]
 *         wy = M[1]*lx + M[5]*ly + M[ 9]*lz + M[13]
 *         wz = M[2]*lx + M[6]*ly + M[10]*lz + M[14]
 *    3. Add RootNode translation:
 *         gx = wx + rt[0],  gy = wy + rt[1],  gz = wz + rt[2]
 *    4. glTF Y-up → ECEF Z-up:
 *         ecef_x = gx,  ecef_y = -gz,  ecef_z = gy
 *    5. ECEF → (lon°, lat°, h m)  via Bowring iterative method
 *
 *  Verified: lon ≈ 127.006°, lat ≈ 36.908°, h ≈ 23 m  ✓ (Korea site)
 */

// ── WGS-84 constants ───────────────────────────────────────────────────────
const WGS84_A  = 6378137.0
const WGS84_E2 = 0.00669437999014

/**
 * Convert ECEF Cartesian (x, y, z) metres to geodetic (lon°, lat°, h m).
 * Uses Bowring's iterative method (10 iterations — converges to mm accuracy).
 */
function ecefToGeodetic(ex, ey, ez) {
  const p   = Math.sqrt(ex * ex + ey * ey)
  let lat   = Math.atan2(ez, p * (1 - WGS84_E2))
  for (let i = 0; i < 10; i++) {
    const s = Math.sin(lat)
    const N = WGS84_A / Math.sqrt(1 - WGS84_E2 * s * s)
    lat = Math.atan2(ez + WGS84_E2 * N * s, p)
  }
  const s = Math.sin(lat)
  const c = Math.cos(lat)
  const N = WGS84_A / Math.sqrt(1 - WGS84_E2 * s * s)
  return {
    lon: Math.atan2(ey, ex) * (180 / Math.PI),
    lat: lat * (180 / Math.PI),
    h:   Math.abs(c) > 1e-9 ? p / c - N : Math.abs(ez) / s - N * (1 - WGS84_E2),
  }
}

/**
 * Parse one mago3d-tiler .glb ArrayBuffer.
 *
 * @param {ArrayBuffer} arrayBuffer
 * @returns {Array<{ lon: number, lat: number, h: number }>}
 */
export function parseGlb(arrayBuffer) {
  const dv = new DataView(arrayBuffer)

  // Validate GLB magic  'g','l','T','F'
  if (dv.getUint8(0) !== 0x67 || dv.getUint8(1) !== 0x6C ||
      dv.getUint8(2) !== 0x54 || dv.getUint8(3) !== 0x46) {
    console.warn('[glbParser] Not a valid GLB file')
    return []
  }

  // ── Parse JSON chunk ───────────────────────────────────────────────────
  const jsonLen = dv.getUint32(12, true)
  const gltf    = JSON.parse(
    new TextDecoder().decode(new Uint8Array(arrayBuffer, 20, jsonLen))
  )

  // Binary chunk starts after: 12-byte GLB header + 8-byte chunk-0 header + jsonLen
  const binBase = 20 + jsonLen + 8

  // ── Locate POSITION accessor ───────────────────────────────────────────
  let posAccIdx = -1
  for (const mesh of (gltf.meshes || [])) {
    for (const prim of (mesh.primitives || [])) {
      if (prim.attributes?.POSITION !== undefined) {
        posAccIdx = prim.attributes.POSITION
        break
      }
    }
    if (posAccIdx >= 0) break
  }
  if (posAccIdx < 0) {
    console.warn('[glbParser] No POSITION attribute found')
    return []
  }

  const acc    = gltf.accessors[posAccIdx]
  const bv     = gltf.bufferViews[acc.bufferView]
  const count  = acc.count
  // byteStride from bufferView — mago3d uses 8 (3 × uint16 + 2 bytes padding)
  const stride = bv.byteStride || 6
  const binOff = binBase + (bv.byteOffset || 0) + (acc.byteOffset || 0)
  const raw    = new DataView(arrayBuffer, binOff)

  // ── Extract node transforms ────────────────────────────────────────────
  let rtx = 0, rty = 0, rtz = 0   // RootNode translation (glTF Y-up ECEF)
  let pcm = null                    // PointCloudNode matrix (col-major 16 floats)

  for (const nd of (gltf.nodes || [])) {
    if (nd.matrix && nd.mesh !== undefined) {
      // Node with a matrix + mesh reference → PointCloudNode
      pcm = nd.matrix
    } else if (nd.translation && nd.children && !nd.matrix) {
      // Node with translation only + children → RootNode
      ;[rtx, rty, rtz] = nd.translation
    }
  }

  if (!pcm) {
    console.warn('[glbParser] PointCloudNode matrix not found')
    return []
  }

  const M = pcm   // alias for readability

  // ── Parse every point ──────────────────────────────────────────────────
  const out = []
  for (let i = 0; i < count; i++) {
    const base = i * stride

    // Step 1: read uint16, divide by 65535 (normalized accessor)
    const lx = raw.getUint16(base,     true) / 65535
    const ly = raw.getUint16(base + 2, true) / 65535
    const lz = raw.getUint16(base + 4, true) / 65535

    // Step 2: apply PointCloudNode matrix (column-major 4×4)
    const wx = M[0]*lx + M[4]*ly + M[8]*lz  + M[12]
    const wy = M[1]*lx + M[5]*ly + M[9]*lz  + M[13]
    const wz = M[2]*lx + M[6]*ly + M[10]*lz + M[14]

    // Step 3: add RootNode translation
    const gx = wx + rtx
    const gy = wy + rty
    const gz = wz + rtz

    // Step 4: glTF Y-up → ECEF Z-up:  ecef = (gx, -gz, gy)
    out.push(ecefToGeodetic(gx, -gz, gy))
  }

  return out
}

/**
 * Walk a 3D Tiles tile tree and collect all .glb leaf URIs.
 *
 * @param {object} tile   — root tile from tileset.json
 * @param {string[]} out  — accumulator
 */
export function collectGlbUris(tile, out) {
  if (!tile) return
  const uri = tile.content?.uri || tile.content?.url || ''
  if (uri.toLowerCase().endsWith('.glb')) out.push(uri)
  if (tile.children) tile.children.forEach(c => collectGlbUris(c, out))
}

/**
 * Fetch a tileset.json, walk its tree, fetch + parse every .glb tile,
 * and return the combined array of geodetic points.
 *
 * @param {string} tilesetUrl  — absolute or relative URL to tileset.json
 * @returns {Promise<Array<{ lon, lat, h }>>}
 */
export async function loadAllPoints(tilesetUrl) {
  if (!tilesetUrl) return []

  const baseUrl = new URL(tilesetUrl, window.location.href)

  let tsJson
  try {
    const r = await fetch(tilesetUrl)
    if (!r.ok) {
      console.error('[glbParser] tileset fetch failed:', tilesetUrl, r.status)
      return []
    }
    tsJson = await r.json()
  } catch (e) {
    console.error('[glbParser] tileset parse error:', e)
    return []
  }

  const uris = []
  collectGlbUris(tsJson.root, uris)
  console.log(`[glbParser] ${uris.length} GLB tiles in ${tilesetUrl}`)

  const groups = await Promise.all(uris.map(async uri => {
    const url = new URL(uri, baseUrl).href
    try {
      const r = await fetch(url)
      if (!r.ok) {
        console.warn('[glbParser] tile fetch failed:', url, r.status)
        return []
      }
      return parseGlb(await r.arrayBuffer())
    } catch (e) {
      console.warn('[glbParser] tile parse error:', url, e)
      return []
    }
  }))

  const all = groups.flat()
  console.log(`[glbParser] ${all.length} total points from ${tilesetUrl}`)
  return all
}