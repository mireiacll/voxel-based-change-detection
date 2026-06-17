/**
 * diff.js
 *
 * Offloads voxelization + diff to the FastAPI server (/api/diff).
 * The browser only handles Cesium rendering of the returned voxels.
 *
 * Change: now fetches original tileset URLs from the external API
 * (localhost:8080) and passes them to the Python diff server instead
 * of relying on local datasetPath strings.
 *
 * Mesh observations are NOT supported — only pointcloud.
 */

import { CONFIG } from './config'
import { toast } from './cesium/cesiumInit'
import { renderVoxelDiff } from './cesium/layers'
import { getPolygonGeo } from './cesium/polygonDraw'
import { fetchOriginalTilesetUrl } from './api'

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000'

window.diffState = {
  voxels:         [],
  voxelSize:      CONFIG.DEFAULTS.VOXEL_SIZE,
  addedVisible:   CONFIG.DEFAULTS.SHOW_ADDED,
  removedVisible: CONFIG.DEFAULTS.SHOW_REMOVED,
  gridDef:        null,
}

// ── Cancellation state ────────────────────────────────────────────────────
let _abortController = null
let _jobId           = null
// ─────────────────────────────────────────────────────────────────────────

export async function runVoxelDiff(
  site, dateA, dateB, currentMode,
  voxSize, tintA, tintB, checkboxState,
  onDiffStatus, onStats,
) {
  // Guard: only pointcloud is supported by the Python diff
  if (dateA.datasetType === 'mesh' || dateB.datasetType === 'mesh') {
    const which = dateA.datasetType === 'mesh' ? dateA.label : dateB.label
    toast(`메쉬 데이터는 차이 계산을 지원하지 않습니다: ${which}`, 'warn')
    onDiffStatus('done', '메쉬는 지원하지 않음 — 포인트클라우드를 선택하세요')
    return
  }

  const polygon = getPolygonGeo()

  window.diffState.voxelSize      = voxSize
  window.diffState.addedVisible   = checkboxState?.added   ?? true
  window.diffState.removedVisible = checkboxState?.removed ?? true

  // 1. Fetch original tileset URLs from the external API (:8080)
  //    The Python server will download these to run the diff.
  onDiffStatus('computing', 'Fetching tileset URLs from API…')
  let tilesetUrlA, tilesetUrlB
  try {
    ;[tilesetUrlA, tilesetUrlB] = await Promise.all([
      fetchOriginalTilesetUrl(dateA.id),
      fetchOriginalTilesetUrl(dateB.id),
    ])
  } catch (e) {
    toast(`Tileset URL 조회 실패: ${e.message}`, 'err')
    onDiffStatus('done', `URL 조회 실패: ${e.message}`)
    return
  }

  if (!tilesetUrlA || !tilesetUrlB) {
    toast('선택한 날짜에 원본 tileset이 없습니다', 'warn')
    onDiffStatus('done', 'Tileset URL 없음')
    return
  }

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
        job_id:        _jobId,
        tileset_url_a: tilesetUrlA,
        tileset_url_b: tilesetUrlB,
        vox_size:      voxSize,
        polygon:       polygon ?? undefined,
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
 */
export function cancelVoxelDiff() {
  if (_jobId) {
    fetch(`${API_BASE}/api/diff/cancel/${_jobId}`, { method: 'POST' })
      .catch(e => console.warn('[diff] cancel request failed:', e))
  }
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