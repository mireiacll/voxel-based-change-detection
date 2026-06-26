/**
 * TimelineDiffs.js
 *
 * Loads and caches pre-computed TIME_SERIES diff snapshots for timeline mode.
 *
 * Flow per site:
 *   GET /api/projects/{id}/diffs?type=TIME_SERIES&status=SUCCEEDED
 *   → pick the latest diff (highest id)
 *   → GET /api/diffs/{diffId}  (has items[] — one per consecutive obs pair)
 *   → for each item: fetch report for summaryPath, fetch mass-summary.json
 *     for volumes + voxel size at finest resolution
 *
 * Two caches:
 *   _cache     — siteId → snapshot[]  (latest diff for that site)
 *   _diffCache — diffId → snapshot[]  (specific historical diff)
 *
 * The diffId cache is used by loadDiffSnapshotsByDiffId so restoring a Diff
 * History entry always loads exactly that run's data.
 */

import { formatDate, toAbsoluteUrl, injectVisualizationFolder } from './api'

const EXT_API = import.meta.env.VITE_EXTERNAL_API_URL ?? 'http://localhost:8080'

const _cache     = new Map()  // siteId → snapshot[]
const _diffCache = new Map()  // diffId → snapshot[]

// ── Helpers ───────────────────────────────────────────────────────────────

function _dateToMs(dateStr) {
  if (!dateStr) return 0
  return new Date(dateStr).getTime()
}

// summaryPath comes from the report as /data/voxelsets/…/summary.json.
// We need /files/voxelsets/…/voxel/mass-summary.json.
function _toMassUrl(summaryPath) {
  if (!summaryPath) return null
  return toAbsoluteUrl(
    summaryPath
      .replace(/^\/data\//, '/files/')
      .replace(/\/summary\.json$/, '/voxel/mass-summary.json')
  )
}

// ── Build one snapshot from a single diff item ────────────────────────────

async function _buildSnapshot(item, projectId) {
  const sourceDate = item.sourceObservedAt ?? null
  const targetDate = item.targetObservedAt ?? null

  const tilesetUrl = injectVisualizationFolder(toAbsoluteUrl(item.resultTilesetUrl))
  console.log(`[_buildSnapshot] item=${item.id} tilesetUrl=${tilesetUrl}`)

  // Fetch the report to get summaryPath
  let summaryPath = null
  try {
    const res = await fetch(`${EXT_API}/api/diff-items/${item.id}/report`)
    if (res.ok) {
      const report = await res.json()
      summaryPath = report.summaryPath ?? null
    } else {
      console.warn(`[_buildSnapshot] item=${item.id} report fetch failed: ${res.status}`)
    }
  } catch (e) {
    console.warn(`[_buildSnapshot] item=${item.id} report fetch error:`, e.message)
  }

  // Fetch mass-summary for volumes at finest resolution (last levelCounts entry)
  let addedVol   = item.addedVolume   ?? 0
  let removedVol = item.removedVolume ?? 0
  let addedCount   = 0
  let removedCount = 0
  let avgVoxVol    = null

  const massUrl = _toMassUrl(summaryPath)
  if (massUrl) {
    try {
      const res = await fetch(massUrl)
      if (res.ok) {
        const ms = await res.json()
        const lastLevel = ms.levelCounts?.length
          ? ms.levelCounts[ms.levelCounts.length - 1]
          : null
        if (lastLevel) {
          addedVol     = lastLevel.addApproxVolumeCubicMeters    ?? addedVol
          removedVol   = lastLevel.removeApproxVolumeCubicMeters ?? removedVol
          addedCount   = lastLevel.addVoxelCount    ?? 0
          removedCount = lastLevel.removeVoxelCount ?? 0
          avgVoxVol    = lastLevel.averageVoxelVolumeCubicMeters ?? null
        } else {
          addedVol     = ms.totalAddApproxVolumeCubicMeters    ?? addedVol
          removedVol   = ms.totalRemoveApproxVolumeCubicMeters ?? removedVol
          addedCount   = ms.totalAddVoxelCount    ?? 0
          removedCount = ms.totalRemoveVoxelCount ?? 0
        }
      } else {
        console.warn(`[_buildSnapshot] item=${item.id} mass-summary failed: ${res.status}`)
      }
    } catch (e) {
      console.warn(`[_buildSnapshot] item=${item.id} mass-summary error:`, e.message)
    }
  }

  // Derive voxel edge length from average voxel volume if available
  const voxSize = avgVoxVol != null && avgVoxVol > 0 ? Math.cbrt(avgVoxVol) : null

  return {
    id:         `${projectId}_${item.sourceObservationId}_${item.targetObservationId}`,
    site_id:    String(projectId),
    diffItemId: item.id,
    date_a: {
      id:    String(item.sourceObservationId),
      label: formatDate(sourceDate) ?? `Obs ${item.sourceObservationId}`,
      ts:    _dateToMs(sourceDate),
    },
    date_b: {
      id:    String(item.targetObservationId),
      label: formatDate(targetDate) ?? `Obs ${item.targetObservationId}`,
      ts:    _dateToMs(targetDate),
    },
    label:       `${formatDate(sourceDate)} → ${formatDate(targetDate)}`,
    tilesetUrl,
    vox_size:    voxSize,
    avg_vox_vol: avgVoxVol,
    stats: {
      added_count:   addedCount,
      removed_count: removedCount,
      added_vol:     addedVol,
      removed_vol:   removedVol,
      net:           addedCount - removedCount,
    },
  }
}

// ── Shared fetch + build ──────────────────────────────────────────────────

async function _fetchAndBuildSnapshotsForDiff(diffId, projectId) {
  const detailRes = await fetch(`${EXT_API}/api/diffs/${diffId}`)
  if (!detailRes.ok) {
    console.warn(`[TimelineDiffs] could not fetch diff detail: ${detailRes.status}`)
    return []
  }
  const detail = await detailRes.json()
  const items  = detail.items ?? []

  if (items.length === 0) return []

  const settled = await Promise.allSettled(
    items.map(item => _buildSnapshot(item, projectId))
  )
  return settled
    .filter(r => r.status === 'fulfilled' && r.value)
    .map(r => r.value)
    .sort((a, b) => a.date_a.ts - b.date_a.ts)
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Load TIME_SERIES snapshots for a site. Returns from cache if already loaded.
 * Always resolves to the latest SUCCEEDED diff for the site.
 * Returns [] if no succeeded diffs exist yet.
 */
export async function loadDiffSnapshots(site) {
  if (_cache.has(site.id)) return _cache.get(site.id)

  try {
    const res = await fetch(
      `${EXT_API}/api/projects/${site.id}/diffs?type=TIME_SERIES&status=SUCCEEDED`
    )
    if (!res.ok) {
      console.warn(`[loadDiffSnapshots] ${res.status} — returning empty`)
      return []
    }

    const allDiffs = await res.json()
    if (allDiffs.length === 0) {
      _cache.set(site.id, [])
      return []
    }

    // Pick the latest diff — it covers all consecutive obs pairs
    const latestDiff = [...allDiffs].sort((a, b) => b.id - a.id)[0]
    const snapshots = await _fetchAndBuildSnapshotsForDiff(latestDiff.id, site.id)

    _cache.set(site.id, snapshots)
    _diffCache.set(String(latestDiff.id), snapshots)
    return snapshots

  } catch (e) {
    console.warn('[loadDiffSnapshots] error —', e.message)
    return []
  }
}

/**
 * Load snapshots for a specific historical diff by diffId.
 * Used when restoring a Diff History entry — loads that exact run's data
 * rather than silently falling back to the latest.
 */
export async function loadDiffSnapshotsByDiffId(diffId, projectId) {
  const key = String(diffId)
  if (_diffCache.has(key)) return _diffCache.get(key)

  try {
    const snapshots = await _fetchAndBuildSnapshotsForDiff(diffId, projectId)
    _diffCache.set(key, snapshots)
    return snapshots
  } catch (e) {
    console.warn('[loadDiffSnapshotsByDiffId] error —', e.message)
    return []
  }
}

// Invalidate the "latest for site" cache after new diffs are computed.
// Historical per-diffId entries are never invalidated — past diffs don't change.
export function invalidateDiffCache(siteId) {
  _cache.delete(String(siteId))
}
