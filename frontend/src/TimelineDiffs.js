/**
 * timelineDiffs.js
 *
 * Manages loading and caching of pre-computed diff snapshots for the
 * time-series mode.
 *
 * DATA CONTRACT
 * ─────────────
 * The backend is expected to expose:
 *
 *   GET /api/sites/{site_id}/diffs
 *   Returns a list of pre-computed diff snapshots, each covering a
 *   consecutive pair of survey dates:
 *
 *   [
 *     {
 *       id:        "dunpo_251106_251209",
 *       site_id:   "dunpo",
 *       date_a:    { id: "251106", label: "Nov 6, 2025",  ts: 1730851200000 },
 *       date_b:    { id: "251209", label: "Dec 9, 2025",  ts: 1733702400000 },
 *       vox_size:  0.5,
 *       stats:     { added_count: 1240, removed_count: 870, net: 370 },
 *       grid_def:  { lon_step: 0.0000045, lat_step: 0.0000045, h_step: 0.5 },
 *       added:     [ { iLon, iLat, iH }, … ],   // may be large
 *       removed:   [ { iLon, iLat, iH }, … ],
 *     },
 *     …
 *   ]
 *
 * DUMMY MODE
 * ──────────
 * If the backend returns 404 / network error, or if USE_DUMMY is true,
 * synthetic data is generated from the site's dates so the UI works
 * without a real backend.
 *
 * TO CONNECT TO THE REAL BACKEND
 * ────────────────────────────────
 * 1. Implement GET /api/sites/{site_id}/diffs on the server.
 * 2. Set USE_DUMMY = false below.
 * 3. Optionally serve voxels in a separate lazy-load endpoint per diff
 *    (see LAZY_VOXELS note below) to avoid one huge payload.
 */

const API_BASE   = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000'
const USE_DUMMY  = true   // ← set false when the real endpoint is ready

// ── In-memory cache: siteId → snapshot[] ─────────────────────────────────
const _cache = new Map()

// ── Date string → Unix ms ─────────────────────────────────────────────────
// date.id format: YYMMDD  e.g. "251106" = Nov 6 2025
function dateIdToMs(id) {
  const m = id.match(/^(\d{2})(\d{2})(\d{2})$/)
  if (!m) return 0
  const [, yy, mm, dd] = m
  return Date.UTC(2000 + parseInt(yy), parseInt(mm) - 1, parseInt(dd))
}

// ── Dummy voxel generator ─────────────────────────────────────────────────
function _makeDummyVoxels(seed, n) {
  const rng = (s => () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff })(seed)
  const added = [], removed = []
  const cx = 500, cy = 500, cz = 100
  for (let i = 0; i < n; i++) {
    const dx = Math.round((rng() - 0.5) * 120)
    const dy = Math.round((rng() - 0.5) * 120)
    const dz = Math.round(rng() * 40)
    if (rng() > 0.45) added.push({ iLon: cx + dx, iLat: cy + dy, iH: cz + dz })
    else              removed.push({ iLon: cx + dx, iLat: cy + dy, iH: cz + dz })
  }
  return { added, removed }
}

function _buildDummySnapshots(site) {
  const dates = [...site.dates].sort((a, b) => dateIdToMs(a.id) - dateIdToMs(b.id))
  const snapshots = []
  for (let i = 0; i < dates.length - 1; i++) {
    const dA = dates[i], dB = dates[i + 1]
    const seed  = i * 997 + 42
    const count = 800 + Math.round(Math.abs(Math.sin(seed)) * 1200)
    const { added, removed } = _makeDummyVoxels(seed, count)
    snapshots.push({
      id:       `${site.id}_${dA.id}_${dB.id}`,
      site_id:  site.id,
      date_a:   { id: dA.id, label: dA.label, ts: dateIdToMs(dA.id) },
      date_b:   { id: dB.id, label: dB.label, ts: dateIdToMs(dB.id) },
      vox_size: 0.5,
      stats: {
        added_count:   added.length,
        removed_count: removed.length,
        net:           added.length - removed.length,
      },
      grid_def: { lon_step: 0.0000045, lat_step: 0.0000045, h_step: 0.5 },
      added,
      removed,
    })
  }
  return snapshots
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Load all pre-computed diff snapshots for a site.
 * Returns from cache if already loaded.
 *
 * @param {object} site  — site object from /api/sites
 * @returns {Promise<Snapshot[]>}
 */
export async function loadDiffSnapshots(site) {

  if (_cache.has(site.id)) return _cache.get(site.id)

  if (!USE_DUMMY) {
    try {
      const res = await fetch(`${API_BASE}/api/sites/${site.id}/diffs`)
      if (res.ok) {
        const data = await res.json()
        // Ensure timestamps exist
        const snapshots = data.map(s => ({
          ...s,
          date_a: { ...s.date_a, ts: s.date_a.ts ?? dateIdToMs(s.date_a.id) },
          date_b: { ...s.date_b, ts: s.date_b.ts ?? dateIdToMs(s.date_b.id) },
        }))
        _cache.set(site.id, snapshots)
        return snapshots
      }
    } catch (_) { /* fall through to dummy */ }
  }

  // Dummy mode
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
 * Convert a snapshot's voxels into the format renderVoxelDiff expects.
 */
export function snapshotToRenderVoxels(snapshot, showAdded = true, showRemoved = true) {
  const out = []
  if (showAdded)   snapshot.added.forEach(v   => out.push({ voxel: v, type: 'added' }))
  if (showRemoved) snapshot.removed.forEach(v => out.push({ voxel: v, type: 'removed' }))
  return out
}