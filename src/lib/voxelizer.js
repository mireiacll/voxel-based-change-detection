/**
 * lib/voxelizer.js
 *
 * Pure 3-D voxelization and volumetric diff.
 * No Cesium, no React, no browser APIs — safe to run in a Web Worker or Node.js.
 *
 * The only external dep is polygonUtils.js (pip).
 *
 * ── ALGORITHM OVERVIEW ────────────────────────────────────────────────────
 *
 *  1. makeGridDef(points, voxelSize)
 *     Compute a shared geographic grid definition from all input points.
 *     lonStep / latStep convert metres → degrees, corrected for latitude.
 *
 *  2. buildSurface(points, gridDef, polygon)
 *     Bin each point into its voxel cell (iLon, iLat, iH).
 *     Returns a Map<key, {iLon, iLat, iH}> — the sparse surface shell.
 *
 *  3. solidify(surfaceA, surfaceB, gridDef)
 *     For each (iLon, iLat) column, fill every voxel from the
 *     per-column floor up to its dataset's max height.
 *
 *     WHY PER-COLUMN FLOOR:
 *     A global floor (= min iH across all points) breaks if any tile has
 *     a single noisy outlier below the terrain — it drags the fill floor
 *     down for every column everywhere, producing underground boxes.
 *     Per-column floor = min iH that column has in *either* dataset, so
 *     one column's outlier cannot affect any other column.
 *
 *  4. diffSolid(solidA, solidB)
 *     Keys in B but not A → added.
 *     Keys in A but not B → removed.
 *     Returns { added: Cartesian3[], removed: Cartesian3[] } — voxel centres
 *     in ECEF, ready to be passed to renderVoxelDiff().
 */

import { pip } from './polygonUtils'

// ── Grid definition ────────────────────────────────────────────────────────

/**
 * Compute the shared voxel grid definition from all input points.
 *
 * @param {Array<{lon,lat,h}>} points   — combined raw points from both dates
 * @param {number}             voxSize  — cell size in metres
 * @returns {{ lonStep, latStep, hStep }}
 */
export function makeGridDef(points, voxSize) {
  const valid = points.filter(p => isFinite(p.lon) && isFinite(p.lat) && isFinite(p.h))
  if (!valid.length) return { lonStep: voxSize / 111000, latStep: voxSize / 111000, hStep: voxSize }

  const avgLat = valid.reduce((s, p) => s + p.lat, 0) / valid.length
  const cosLat = Math.cos(avgLat * Math.PI / 180)

  return {
    lonStep: voxSize / (111000 * cosLat),   // degrees lon per voxel
    latStep: voxSize / 111000,              // degrees lat per voxel
    hStep:   voxSize,                       // metres per voxel
  }
}

// ── Step 1: surface shell ──────────────────────────────────────────────────

/**
 * Bin raw geodetic points into a voxel occupancy map (the surface shell).
 * Points outside the polygon are discarded.
 *
 * @param {Array<{lon,lat,h}>}              points
 * @param {{ lonStep, latStep, hStep }}     gridDef
 * @param {Array<{lon,lat}>|null}           polygon  — null = no filter
 * @returns {Map<string, {iLon, iLat, iH}>}
 */
export function buildSurface(points, gridDef, polygon) {
  const { lonStep, latStep, hStep } = gridDef
  const map = new Map()

  for (const { lon, lat, h } of points) {
    if (!isFinite(lon) || !isFinite(lat) || !isFinite(h)) continue
    if (polygon && !pip(lon, lat, polygon)) continue

    const iLon = Math.floor(lon / lonStep)
    const iLat = Math.floor(lat / latStep)
    const iH   = Math.floor(h   / hStep)
    const key  = `${iLon},${iLat},${iH}`
    if (!map.has(key)) map.set(key, { iLon, iLat, iH })
  }

  return map
}

// ── Step 2: solidification ─────────────────────────────────────────────────

/**
 * Convert two sparse surface maps into solid volume maps by filling each
 * (iLon, iLat) column from its per-column floor up to its max height.
 *
 * The returned Maps have Cesium.Cartesian3 values (voxel centres in ECEF).
 * Requires window.Cesium to be set (cesiumInit.js sets it before any diff runs).
 *
 * @param {Map} surfaceA
 * @param {Map} surfaceB
 * @param {{ lonStep, latStep, hStep }} gridDef
 * @returns {{ solidA: Map<string, Cartesian3>, solidB: Map<string, Cartesian3> }}
 */
export function solidify(surfaceA, surfaceB, gridDef) {
  const { lonStep, latStep, hStep } = gridDef

  // ── a) Build per-column min/max for each dataset ──────────────────────
  function buildColStats(surface) {
    const cols = new Map()   // colKey → { iLon, iLat, minH, maxH }
    for (const { iLon, iLat, iH } of surface.values()) {
      const colKey = `${iLon},${iLat}`
      if (!cols.has(colKey)) {
        cols.set(colKey, { iLon, iLat, minH: iH, maxH: iH })
      } else {
        const col = cols.get(colKey)
        if (iH < col.minH) col.minH = iH
        if (iH > col.maxH) col.maxH = iH
      }
    }
    return cols
  }

  const colsA = buildColStats(surfaceA)
  const colsB = buildColStats(surfaceB)

  // ── b) Per-column floor = min(minH_A, minH_B) ────────────────────────
  const colFloor = new Map()   // colKey → lowest iH in either dataset

  for (const [colKey, col] of colsA) colFloor.set(colKey, col.minH)
  for (const [colKey, col] of colsB) {
    const prev = colFloor.get(colKey)
    colFloor.set(colKey, prev !== undefined ? Math.min(prev, col.minH) : col.minH)
  }

  // ── c) Fill each column floor→maxH, compute correct voxel centre ──────
  function fillCols(cols) {
    const solid = new Map()
    for (const [colKey, { iLon, iLat, maxH }] of cols) {
      const floorH = colFloor.get(colKey) ?? 0
      for (let iH = floorH; iH <= maxH; iH++) {
        const key = `${iLon},${iLat},${iH}`
        if (!solid.has(key)) {
            solid.set(key, { iLon, iLat, iH })
        }
      }
    }
    return solid
  }

  const solidA = fillCols(colsA)
  const solidB = fillCols(colsB)

  console.log(`[voxelizer] Solid voxels — A: ${solidA.size}, B: ${solidB.size}`)
  return { solidA, solidB }
}

// ── Step 3: diff ───────────────────────────────────────────────────────────

/**
 * Compute volumetric diff between two solid voxel maps.
 *
 * @param {Map<string, { iLon, iLat, iH }>} solidA
 * @param {Map<string, { iLon, iLat, iH }>} solidB
 * @returns {{ added: Array<{center, type}>, removed: Array<{center, type}> }}
 */
export function diffSolid(solidA, solidB) {
  const added   = []
  const removed = []

  for (const [key, voxel] of solidB) {
    if (!solidA.has(key)) added.push({ voxel, type: 'added' })
  }
  for (const [key, voxel] of solidA) {
    if (!solidB.has(key)) removed.push({ voxel, type: 'removed' })
  }

  return { added, removed }
}