/**
 * lib/polygonUtils.js
 *
 * Pure 2-D geometry utilities.
 * No Cesium, no React, no browser APIs — safe to run in a Web Worker or Node.
 */

/**
 * Point-in-polygon test using ray casting (lon/lat space).
 *
 * @param {number} lon
 * @param {number} lat
 * @param {Array<{lon: number, lat: number}>} poly  — closed polygon vertices
 * @returns {boolean}  true if inside, or if poly is null/empty (no filter)
 */
export function pip(lon, lat, poly) {
  if (!poly || poly.length < 3) return true
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].lon, yi = poly[i].lat
    const xj = poly[j].lon, yj = poly[j].lat
    if (((yi > lat) !== (yj > lat)) &&
        lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}