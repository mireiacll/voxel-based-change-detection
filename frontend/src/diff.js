/**
 * diff.js
 *
 * Offloads voxelization + diff to the FastAPI server (/api/diff).
 * The browser only handles Cesium rendering of the returned voxels.
 */

import { CONFIG } from './config'
import { toast } from './cesium/cesiumInit'
import { loadCompare, renderVoxelDiff } from './cesium/layers'
import { getPolygonGeo } from './cesium/polygonDraw'

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000'

window.diffState = {
  voxels:         [],
  voxelSize:      CONFIG.DEFAULTS.VOXEL_SIZE,
  addedVisible:   CONFIG.DEFAULTS.SHOW_ADDED,
  removedVisible: CONFIG.DEFAULTS.SHOW_REMOVED,
  gridDef:        null,
}

// ── Cancellation state ────────────────────────────────────────────────────
// job_id is generated CLIENT-SIDE and sent with the request so we know it
// before the response arrives — allowing cancel mid-computation.
let _abortController = null
let _jobId           = null

// ─────────────────────────────────────────────────────────────────────────

export async function runVoxelDiff(
  site, dateA, dateB, currentMode,
  voxSize, tintA, tintB, checkboxState,
  onDiffStatus, onStats,
) {
  const polygon = getPolygonGeo()

  window.diffState.voxelSize      = voxSize
  window.diffState.addedVisible   = checkboxState?.added   ?? true
  window.diffState.removedVisible = checkboxState?.removed ?? true

  // 1. Load meshes for visual overlay
  onDiffStatus('computing', `Loading meshes: ${dateA.label} vs ${dateB.label}…`)
  await loadCompare(site, dateA, dateB, currentMode, tintA, tintB, checkboxState)

  // 2. Generate job ID client-side so we can cancel before the response arrives
  _jobId           = crypto.randomUUID()
  _abortController = new AbortController()

  onDiffStatus('computing',
    `Server: voxelizing${polygon ? ' (polygon filter)' : ''}…`)

  let data
  try {
    const res = await fetch(`${API_BASE}/api/diff`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        job_id:  _jobId,
        path_a:  dateA.datasetPath,
        path_b:  dateB.datasetPath,
        vox_size: voxSize,
        polygon: polygon ?? undefined,
      }),
      signal: _abortController.signal,
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }))
      throw new Error(err.detail ?? `HTTP ${res.status}`)
    }

    data = await res.json()

    if (data.cancelled) {
      onDiffStatus('done', 'Cancelled')
      return
    }

  } catch (e) {
    if (e.name === 'AbortError') {
      onDiffStatus('done', 'Computation cancelled')
      return
    }
    toast(`Server error: ${e.message}`, 'err')
    onDiffStatus('done', `Error: ${e.message}`)
    return
  } finally {
    // Always clean up regardless of success / error / cancel
    _abortController = null
    _jobId           = null
  }

  // 3. Store results
  window.diffState.gridDef = {
    lonStep: data.grid_def.lon_step,
    latStep: data.grid_def.lat_step,
    hStep:   data.grid_def.h_step,
  }
  window.diffState.voxels = [...data.added, ...data.removed].map(v => ({
    voxel: { iLon: v.iLon, iLat: v.iLat, iH: v.iH },
    type:  v.type,
  }))

  // 4. Report stats to React
  onStats({
    added:   data.stats.added_count,
    removed: data.stats.removed_count,
    voxSize: data.vox_size,
    clipped: data.clipped,
  })

  // 5. Render
  renderVoxelDiff(getFilteredVoxels(), data.vox_size)

  onDiffStatus('done',
    `Done — ${data.stats.added_count} added, ${data.stats.removed_count} removed` +
    (data.clipped ? ' (polygon)' : ''))
}

/**
 * Cancel an in-progress diff.
 * 1. Tells the backend to stop the worker process (fire-and-forget).
 * 2. Aborts the fetch immediately so the UI unblocks right away.
 */
export function cancelVoxelDiff() {
  // Fire-and-forget cancel request to backend — don't await so the UI
  // unblocks instantly even if the network request takes a moment.
  if (_jobId) {
    fetch(`${API_BASE}/api/diff/cancel/${_jobId}`, { method: 'POST' })
      .catch(e => console.warn('[diff] cancel request failed:', e))
  }

  // Abort the fetch — this throws AbortError in runVoxelDiff which
  // is caught and sets status to "Computation cancelled".
  if (_abortController) {
    _abortController.abort()
  }
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