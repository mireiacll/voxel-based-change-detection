/**
 * DiffHistory.jsx
 *
 * Compact clickable list of past diff computations for the active project.
 * Persisted in localStorage under key `diffHistory:${projectId}`.
 *
 * Entry shape:
 *   id              — diff API id (number/string)
 *   type            — 'AB' | 'TIME_SERIES'
 *   createdAt       — ISO timestamp string
 *   labelA          — source date label
 *   labelB          — target date label
 *   areaWkt         — polygon WKT or null
 *   observationCount — number (TS only)
 *   // AB only:
 *   addedVolume     — number (m³)
 *   removedVolume   — number (m³)
 *   diffItemId      — number
 *   tilesetUrl      — string | null
 */

// ── Storage helpers ───────────────────────────────────────────────────────

const LS_KEY = id => `diffHistory:${id}`

export function loadDiffHistory(projectId) {
  try {
    const raw = localStorage.getItem(LS_KEY(projectId))
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

export function saveDiffHistory(projectId, entries) {
  try {
    localStorage.setItem(LS_KEY(projectId), JSON.stringify(entries.slice(0, 50)))
  } catch {}
}

export function addDiffHistoryEntry(projectId, entry) {
  const existing = loadDiffHistory(projectId)
  const next = [entry, ...existing.filter(e => String(e.id) !== String(entry.id))]
  saveDiffHistory(projectId, next)
  return next
}

export function removeDiffHistoryEntry(projectId, diffId) {
  const existing = loadDiffHistory(projectId)
  const next = existing.filter(e => String(e.id) !== String(diffId))
  saveDiffHistory(projectId, next)
  return next
}

// ── Formatting ────────────────────────────────────────────────────────────

function fmtShortDate(label) {
  if (!label) return '?'
  // Raw ISO date → "Jun 1"
  if (/^\d{4}-\d{2}-\d{2}/.test(label)) {
    const [, m, d] = label.slice(0, 10).split('-')
    const M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    return `${M[parseInt(m,10)-1] ?? m} ${parseInt(d,10)}`
  }
  // Already formatted like "Jun 1, 2026" → "Jun 1"
  return label.split(',')[0].trim()
}

function fmtTime(iso) {
  if (!iso) return ''
  // "2026-06-17T14:32:00.000Z" → "Jun 17 14:32"
  try {
    const d = new Date(iso)
    const month = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]
    const day   = d.getDate()
    const hh    = String(d.getHours()).padStart(2, '0')
    const mm    = String(d.getMinutes()).padStart(2, '0')
    return `${month} ${day} ${hh}:${mm}`
  } catch { return iso.slice(0, 16).replace('T', ' ') }
}

// ── Component ─────────────────────────────────────────────────────────────

export default function DiffHistory({ entries = [], activeId, onLoad, onDelete }) {
  if (entries.length === 0) {
    return <div className="no-dates" style={{ fontSize: 11 }}>아직 계산 결과 없음</div>
  }

  return (
    <div className="dh-list">
      {entries.map(e => {
        const isAB     = e.type === 'AB'
        const isActive = activeId != null && String(e.id) === String(activeId)

        return (
          <div
            key={e.id}
            className={`dh-entry${isActive ? ' dh-active' : ''}`}
            onClick={() => onLoad?.(e)}
            title="클릭하여 결과 불러오기"
          >
            {/* Type badge */}
            <span className={`dh-type-badge ${isAB ? 'dh-ab' : 'dh-ts'}`}>
              {isAB ? 'A/B' : 'TS'}
            </span>

            {/* Date range */}
            <span className="dh-dates">
              {fmtShortDate(e.labelA)}
              <span className="dh-arrow">→</span>
              {fmtShortDate(e.labelB)}
            </span>

            {/* TS: date count */}
            {!isAB && e.observationCount != null && (
              <span className="dh-count">{e.observationCount}개</span>
            )}

            {/* Area indicator */}
            {e.areaWkt && (
              <span className="dh-area-dot" title="분석 영역 있음">◈</span>
            )}

            {/* Time generated */}
            <span className="dh-time">{fmtTime(e.createdAt)}</span>

            {/* Delete */}
            <button
              className="dh-icon-btn dh-del"
              title="기록 삭제"
              onClick={ev => { ev.stopPropagation(); onDelete?.(e.id) }}
            >✕</button>
          </div>
        )
      })}
    </div>
  )
}