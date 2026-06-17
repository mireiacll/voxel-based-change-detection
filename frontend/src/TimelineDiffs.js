/**
 * TimelineDiffs.js
 *
 * Loads and caches pre-computed TIME_SERIES diff snapshots for time-series mode.
 *
 * Flow:
 *   GET /api/projects/{projectId}/diffs?type=TIME_SERIES&status=SUCCEEDED
 *     → DiffListResponse[]
 *
 * DEDUP: keep only the latest SUCCEEDED TIME_SERIES diff per project
 * (time-series creates one diff with N items — one per consecutive obs pair).
 *
 * For the chosen diff:
 *   GET /api/diffs/{diffId}
 *     → DiffDetailResponse  (has items[] embedded)
 *
 * For each item:
 *   item.resultTilesetUrl         → tileset (inject /visualization/ subfolder)
 *   item.summaryPath (via report) → /files/…/voxel/mass-summary.json
 *     → volume from LAST levelCounts entry
 *     → averageVoxelVolumeCubicMeters from last level → actual vox_size
 */

import { formatDate, toAbsoluteUrl, injectVisualizationFolder } from './api'

const EXT_API = import.meta.env.VITE_EXTERNAL_API_URL ?? 'http://localhost:8080'

// ── In-memory cache: siteId → snapshot[] (latest diff per site) ──────────
const _cache = new Map()

// ── In-memory cache: diffId → snapshot[] (specific historical diff) ──────
const _diffCache = new Map()

// ── Helpers ───────────────────────────────────────────────────────────────

function _dateToMs(dateStr) {
  if (!dateStr) return 0
  return new Date(dateStr).getTime()
}

/**
 * Inject /visualization/ sub-folder into a voxel tileset URL.
 * Backend returns: …/voxel/tileset.json
 * Cesium needs:   …/voxel/visualization/tileset.json
 */
/**
 * Convert summaryPath → mass-summary URL.
 * /data/voxelsets/…/summary.json → /files/voxelsets/…/voxel/mass-summary.json
 */
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

  // Tileset URL comes directly from the item
  const rawTilesetUrl = item.resultTilesetUrl
  const tilesetUrl = injectVisualizationFolder(toAbsoluteUrl(rawTilesetUrl))
  console.log(`[_buildSnapshot] item=${item.id} rawTilesetUrl=${rawTilesetUrl} → tilesetUrl=${tilesetUrl}`)

  // Fetch report for summaryPath
  const reportUrl = `${EXT_API}/api/diff-items/${item.id}/report`
  console.log(`[_buildSnapshot] item=${item.id} fetching report from: ${reportUrl}`)
  let summaryPath = null
  try {
    const res = await fetch(reportUrl)
    if (res.ok) {
      const report = await res.json()
      summaryPath = report.summaryPath ?? null
      console.log(`[_buildSnapshot] item=${item.id} report.summaryPath=${summaryPath}`)
    } else {
      console.warn(`[_buildSnapshot] item=${item.id} report fetch failed: ${res.status}`)
    }
  } catch (e) {
    console.warn(`[_buildSnapshot] item=${item.id} report fetch error:`, e.message)
  }

  // Fetch mass-summary; use LAST levelCounts entry for finest-resolution volumes
  let addedVol     = item.addedVolume   ?? 0
  let removedVol   = item.removedVolume ?? 0
  let addedCount   = 0
  let removedCount = 0
  let avgVoxVol    = null  // actual per-voxel volume (m³) from last level

  const massUrl = _toMassUrl(summaryPath)
  console.log(`[_buildSnapshot] item=${item.id} summaryPath=${summaryPath} → massUrl=${massUrl}`)
  if (massUrl) {
    try {
      const res = await fetch(massUrl)
      if (res.ok) {
        const ms = await res.json()
        const lastLevel = ms.levelCounts?.length
          ? ms.levelCounts[ms.levelCounts.length - 1]
          : null
        console.log(`[_buildSnapshot] item=${item.id} mass-summary OK, levelCounts=${ms.levelCounts?.length}, lastLevel=`, lastLevel)
        if (lastLevel) {
          addedVol   = lastLevel.addApproxVolumeCubicMeters    ?? addedVol
          removedVol = lastLevel.removeApproxVolumeCubicMeters ?? removedVol
          addedCount   = lastLevel.addVoxelCount    ?? 0
          removedCount = lastLevel.removeVoxelCount ?? 0
          // Actual average voxel volume at finest level → derive vox_size
          avgVoxVol = lastLevel.averageVoxelVolumeCubicMeters ?? null
        } else {
          addedVol   = ms.totalAddApproxVolumeCubicMeters    ?? addedVol
          removedVol = ms.totalRemoveApproxVolumeCubicMeters ?? removedVol
          addedCount   = ms.totalAddVoxelCount    ?? 0
          removedCount = ms.totalRemoveVoxelCount ?? 0
        }
      } else {
        console.warn(`[_buildSnapshot] item=${item.id} mass-summary fetch failed: ${res.status} — ${massUrl}`)
      }
    } catch (e) {
      console.warn(`[_buildSnapshot] item=${item.id} mass-summary fetch error:`, e.message)
    }
  }

  // Derive vox_size (edge length m) from average voxel volume if available
  const voxSize = avgVoxVol != null && avgVoxVol > 0
    ? Math.cbrt(avgVoxVol)
    : null  // unknown — don't fall back to 0.5 anymore; UI will use avg_vox_vol directly

  const snapId = `${projectId}_${item.sourceObservationId}_${item.targetObservationId}`
  console.log(`[_buildSnapshot] item=${item.id} done — addedVol=${addedVol} removedVol=${removedVol} addedCount=${addedCount} removedCount=${removedCount} avgVoxVol=${avgVoxVol} voxSize=${voxSize}`)

  return {
    id:           snapId,
    site_id:      String(projectId),
    diffItemId:   item.id,
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
    tilesetUrl,              // renamed from tileset_path — absolute URL ready for Cesium
    vox_size:    voxSize,    // null if unknown
    avg_vox_vol: avgVoxVol,  // m³ per voxel at finest level — use directly in stats display
    stats: {
      added_count:   addedCount,
      removed_count: removedCount,
      added_vol:     addedVol,
      removed_vol:   removedVol,
      net:           addedCount - removedCount,
    },
  }
}

// ── Shared: diffId → snapshot[] ────────────────────────────────────────

/**
 * Fetch a specific diff's detail (items[]) and build snapshots from it.
 * Shared by both "latest for site" and "specific historical diffId" paths
 * so the two never disagree about how a snapshot is shaped.
 */
async function _fetchAndBuildSnapshotsForDiff(diffId, projectId) {
  const detailRes = await fetch(`${EXT_API}/api/diffs/${diffId}`)
  if (!detailRes.ok) {
    console.warn(`[_fetchAndBuildSnapshotsForDiff] could not fetch diff detail: ${detailRes.status}`)
    return []
  }
  const detail = await detailRes.json()
  const items  = detail.items ?? []
  console.log(`[_fetchAndBuildSnapshotsForDiff] diff ${diffId} has ${items.length} items`)

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
 * Load all pre-computed TIME_SERIES diff snapshots for a site/project.
 * Returns from cache if already loaded.
 * Returns [] (not dummy data) when no SUCCEEDED time-series diffs exist yet.
 *
 * Always resolves to the LATEST SUCCEEDED time-series diff for the site.
 * To load a specific historical diff (e.g. restoring a Diff History entry),
 * use loadDiffSnapshotsByDiffId instead.
 */
export async function loadDiffSnapshots(site) {
  console.log(`[loadDiffSnapshots] site=${site.id} cached=${_cache.has(site.id)}`)
  if (_cache.has(site.id)) return _cache.get(site.id)

  try {
    // Only fetch TIME_SERIES diffs that have already SUCCEEDED
    const res = await fetch(
      `${EXT_API}/api/projects/${site.id}/diffs?type=TIME_SERIES&status=SUCCEEDED`
    )
    if (!res.ok) {
      console.warn(`[loadDiffSnapshots] ${res.status} from backend — returning empty`)
      return []
    }

    const allDiffs = await res.json()
    console.log(`[loadDiffSnapshots] backend returned ${allDiffs.length} SUCCEEDED TIME_SERIES diffs`)

    if (allDiffs.length === 0) {
      console.log('[loadDiffSnapshots] no SUCCEEDED TIME_SERIES diffs yet')
      _cache.set(site.id, [])
      return []
    }

    // Pick the latest diff (highest id) — it covers all consecutive obs pairs
    const latestDiff = [...allDiffs].sort((a, b) => b.id - a.id)[0]
    console.log(`[loadDiffSnapshots] using latest diff id=${latestDiff.id}`)

    const snapshots = await _fetchAndBuildSnapshotsForDiff(latestDiff.id, site.id)
    console.log(`[loadDiffSnapshots] built ${snapshots.length} snapshots`)
    _cache.set(site.id, snapshots)
    // Also seed the per-diffId cache so re-selecting this same diff from
    // history doesn't trigger a redundant fetch.
    _diffCache.set(String(latestDiff.id), snapshots)
    return snapshots

  } catch (e) {
    console.warn('[loadDiffSnapshots] error —', e.message)
    return []
  }
}

/**
 * Load snapshots for ONE SPECIFIC historical TIME_SERIES diff by its diffId,
 * regardless of whether it's the latest one for the site.
 *
 * Used to restore a Diff History entry exactly as it was when computed,
 * instead of silently falling back to "whatever is current for the site"
 * (which is what loadDiffSnapshots does).
 *
 * Returns [] if the diff can't be found/fetched.
 */
export async function loadDiffSnapshotsByDiffId(diffId, projectId) {
  const key = String(diffId)
  console.log(`[loadDiffSnapshotsByDiffId] diffId=${key} cached=${_diffCache.has(key)}`)
  if (_diffCache.has(key)) return _diffCache.get(key)

  try {
    const snapshots = await _fetchAndBuildSnapshotsForDiff(diffId, projectId)
    console.log(`[loadDiffSnapshotsByDiffId] built ${snapshots.length} snapshots for diffId=${key}`)
    _diffCache.set(key, snapshots)
    return snapshots
  } catch (e) {
    console.warn('[loadDiffSnapshotsByDiffId] error —', e.message)
    return []
  }
}

/**
 * Invalidate cache for a site (call after new diffs are computed).
 * Only clears the "latest for site" cache — historical per-diffId entries
 * in _diffCache remain valid forever since a past diff's data never changes.
 */
export function invalidateDiffCache(siteId) {
  console.log(`[invalidateDiffCache] clearing cache for site=${siteId}`)
  _cache.delete(String(siteId))
}