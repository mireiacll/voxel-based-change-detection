/**
 * backendDiff.js
 *
 * "Compare (Full)" mode — sends project + dates + optional polygon to a
 * REST API (your coworker's backend) and returns a mass-summary result.
 *
 * While the external backend isn't ready we fall back to our own
 * GET /api/diff/full/sample which returns the hardcoded sample data
 * stored in the server.
 *
 * Expected request body:
 *   { project_id, date_a, date_b, polygon? }
 *
 * Expected response (mass-summary):
 *   {
 *     type: "diff-mass-summary",
 *     totalVoxelCount, totalAddVoxelCount, totalRemoveVoxelCount,
 *     totalApproxVolumeCubicMeters,
 *     totalAddApproxVolumeCubicMeters,
 *     totalRemoveApproxVolumeCubicMeters,
 *     operation, interiorOnly, minInteriorThickness, volumeMethod,
 *     levelCounts: [ { level, voxelCount, addVoxelCount, removeVoxelCount,
 *                      approxVolumeCubicMeters, addApproxVolumeCubicMeters,
 *                      removeApproxVolumeCubicMeters,
 *                      averageVoxelVolumeCubicMeters } ]
 *   }
 */

const API_BASE          = import.meta.env.VITE_API_URL          ?? 'http://127.0.0.1:8000'
const EXTERNAL_API_BASE = import.meta.env.VITE_EXTERNAL_API_URL ?? null   // set when coworker's API is ready

/**
 * Run a full diff via REST API.
 *
 * @param {object} params
 * @param {string}  params.projectId   — site id
 * @param {string}  params.dateA       — date code A
 * @param {string}  params.dateB       — date code B
 * @param {Array|null} params.polygon  — array of {lon, lat} or null
 * @param {function} params.onStatus   — (msg: string) => void
 * @returns {Promise<object>}  mass-summary JSON or null on error
 */
export async function runFullDiff({ projectId, dateA, dateB, polygon, onStatus }) {
  onStatus?.('Requesting analysis…')

  const body = {
    project_id: projectId,
    date_a:     dateA,
    date_b:     dateB,
    polygon:    polygon ?? undefined,
  }

  // 1. Try coworker's external API if configured
  if (EXTERNAL_API_BASE) {
    try {
      const res = await fetch(`${EXTERNAL_API_BASE}/diff/full`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      })
      if (res.ok) {
        const data = await res.json()
        onStatus?.('Done')
        return data
      }
      console.warn('[backendDiff] External API returned', res.status, '— falling back to local')
    } catch (e) {
      console.warn('[backendDiff] External API unreachable —', e.message, '— falling back to local')
    }
  }

  // 2. Fallback: our own backend serves the sample data
  try {
    const res = await fetch(`${API_BASE}/api/diff/full`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }))
      throw new Error(err.detail ?? `HTTP ${res.status}`)
    }
    const data = await res.json()
    onStatus?.('Done')
    return data
  } catch (e) {
    onStatus?.(`Error: ${e.message}`)
    throw e
  }
}