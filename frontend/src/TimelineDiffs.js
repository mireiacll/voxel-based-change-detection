/**
 * timelineDiffs.js
 *
 * Manages loading and caching of pre-computed diff snapshots for the
 * time-series mode.
 *
 * Real snapshots load a pre-colored 3D Tiles tileset into Cesium.
 * All snapshots (real and dummy) carry a `stats` object so the bar
 * chart and stats panel always have data to display.
 *
 * Backend shape (GET /api/sites/{site_id}/diffs):
 *   [{ id, site_id, date_a, date_b, label, tileset_path }]
 *
 * Dummy stats are generated from a seeded RNG when the backend has no
 * rows yet — counts are plausible but not real.
 */

import { loadTimeseriesTileset, clearTimeseriesLayer } from './cesium/layers'

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000'

// ── In-memory cache: siteId → snapshot[] ─────────────────────────────────
const _cache = new Map()

// ── Helpers ───────────────────────────────────────────────────────────────

function dateIdToMs(id) {
  const m = id.match(/^(\d{2})(\d{2})(\d{2})$/)
  if (!m) return 0
  const [, yy, mm, dd] = m
  return Date.UTC(2000 + parseInt(yy), parseInt(mm) - 1, parseInt(dd))
}

/** Seeded RNG — same seed always produces the same counts. */
function _rng(seed) {
  let s = seed
  return () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff }
}

/** Generate plausible dummy stats for a snapshot index. */
function _dummyStats(i) {
  const r = _rng(i * 997 + 42)
  const added_count   = 800 + Math.round(r() * 1200)
  const removed_count = 600 + Math.round(r() * 900)
  return { added_count, removed_count, net: added_count - removed_count }
}

/** Build dummy snapshots (real tileset_path preserved when available). */
function _buildDummySnapshots(site) {
  const dates = [...site.dates].sort((a, b) => dateIdToMs(a.id) - dateIdToMs(b.id))
  return dates.slice(0, -1).map((dA, i) => {
    const dB = dates[i + 1]
    return {
      id:           `${site.id}_${dA.id}_${dB.id}`,
      site_id:      site.id,
      date_a:       { id: dA.id, label: dA.label, ts: dateIdToMs(dA.id) },
      date_b:       { id: dB.id, label: dB.label, ts: dateIdToMs(dB.id) },
      label:        `${dA.label} → ${dB.label}`,
      tileset_path: null,
      vox_size:     0.5,
      stats:        _dummyStats(i),
      _dummy:       true,
    }
  })
}

/** Attach dummy stats to real snapshots that have no stats from the backend. */
function _ensureStats(snapshots) {
  return snapshots.map((s, i) => ({
    ...s,
    vox_size: s.vox_size ?? 0.5,
    stats:    s.stats ?? _dummyStats(i),
  }))
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Load all pre-computed diff snapshots for a site.
 * Returns from cache if already loaded.
 */
export async function loadDiffSnapshots(site) {
  if (_cache.has(site.id)) return _cache.get(site.id)

  try {
    const res = await fetch(`${API_BASE}/api/sites/${site.id}/diffs`)
    if (res.ok) {
      const data = await res.json()
      if (data.length > 0) {
        const snapshots = _ensureStats(data.map(s => ({
          ...s,
          date_a: { ...s.date_a, ts: dateIdToMs(s.date_a.id) },
          date_b: { ...s.date_b, ts: dateIdToMs(s.date_b.id) },
        })))
        _cache.set(site.id, snapshots)
        return snapshots
      }
      console.warn('[timelineDiffs] Backend returned empty array — using dummy data')
    } else {
      console.warn('[timelineDiffs] Backend returned', res.status, '— using dummy data')
    }
  } catch (e) {
    console.warn('[timelineDiffs] Backend unreachable —', e.message, '— using dummy data')
  }

  const snapshots = _buildDummySnapshots(site)
  _cache.set(site.id, snapshots)
  return snapshots
}

/**
 * Invalidate cache for a site (call after new diffs are computed).
 */
export function invalidateDiffCache(siteId) {
  _cache.delete(siteId)
}

/**
 * Render a snapshot by loading its pre-colored tileset into Cesium.
 * Dummy snapshots (tileset_path = null) clear the layer and do nothing else.
 */
export async function renderSnapshotTileset(snapshot) {
  clearTimeseriesLayer()
  if (!snapshot?.tileset_path) return
  await loadTimeseriesTileset(snapshot.tileset_path)
}