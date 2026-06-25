/**
 * DiffHistory.jsx
 *
 * Renders the list of past (and in-progress) diff computations.
 * Uses .dh-* CSS classes from viewer.css.
 */

/**
 * Parses a backend timestamp, treating it as UTC if it has no explicit
 * timezone marker. The backend sends naive strings like
 * "2026-06-23T01:47:17.770" with no "Z" or "+09:00" suffix — JS's Date
 * parser treats those as LOCAL time, which is wrong here since the
 * backend's clock is UTC. In KST (UTC+9) that shows times ~9h off
 * (e.g. a 23-min-old entry displaying as "9시간 전"). Appending "Z" when
 * no offset is present makes the parse correct everywhere.
 */
function parseServerDate(iso) {
  if (!iso) return null
  const hasOffset = /Z$|[+-]\d{2}:?\d{2}$/.test(iso)
  return new Date(hasOffset ? iso : iso + 'Z')
}

const _MONTHS_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// Recent (< 1h): relative ("5분 전"). Today: clock time ("14:32").
// Older: "Jun 12" (year prefixed only if not this year, "'25 Jun 12").
// 3-letter month instead of zero-padded "06.12" — the numeric form takes
// about the same width as "처리 중" anyway, so a readable month name costs
// nothing extra. Absolute time/date is used past the 1h mark so any
// remaining clock skew can't show a confusing "X시간 전" for something
// that just finished — a wall-clock time or date is unambiguous.
function timeAgo(iso) {
  const date = parseServerDate(iso)
  if (!date) return ''
  const now  = new Date()
  const diff = now.getTime() - date.getTime()
  const m    = Math.floor(diff / 60000)

  if (m < 1)  return '방금'
  if (m < 60) return `${m}분 전`

  const sameDay = date.toDateString() === now.toDateString()
  if (sameDay) {
    return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })
  }

  const sameYear = date.getFullYear() === now.getFullYear()
  const mo = _MONTHS_ABBR[date.getMonth()]
  const d  = date.getDate()
  return sameYear ? `${mo} ${d}` : `'${String(date.getFullYear()).slice(2)} ${mo} ${d}`
}

const _MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec']

// Pulls {y, m, d} out of common label formats:
// "2024-06-12", "2024.06.12", "2024/06/12", "2024년 6월 12일", "Oct 9, 2025"
function parseLabelDate(label) {
  if (!label) return null
  const str = String(label)

  // "Oct 9, 2025" / "October 9, 2025"
  const named = str.match(/([A-Za-z]{3,})\.?\s+(\d{1,2}),?\s+(\d{4})/)
  if (named) {
    const mi = _MONTHS.indexOf(named[1].slice(0, 3).toLowerCase())
    if (mi !== -1) {
      return { y: named[3], m: String(mi + 1).padStart(2, '0'), d: named[2].padStart(2, '0') }
    }
  }

  // "2024-06-12" / "2024.06.12" / "2024/06/12" / "2024년 6월 12일"
  const numeric = str.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/)
  if (numeric) {
    return { y: numeric[1], m: numeric[2].padStart(2, '0'), d: numeric[3].padStart(2, '0') }
  }

  return null
}

// Compact range, always "YY.MM.DD → YY.MM.DD". Falls back to the
// raw label untouched if it doesn't match a known date pattern.
function shortRange(labelA, labelB) {
  const a = parseLabelDate(labelA)
  const aShort = a ? `${a.y.slice(2)}.${a.m}.${a.d}` : labelA
  if (!labelB || labelB === labelA) return { a: aShort, b: null }
  const b = parseLabelDate(labelB)
  const bShort = b ? `${b.y.slice(2)}.${b.m}.${b.d}` : labelB
  return { a: aShort, b: bShort }
}

export default function DiffHistory({ entries, activeId, onLoad, onDelete, onCancel, pollingIds, deletingIds, cancellingIds, splitMode, activeIdB }) {
  // deletingIds and cancellingIds are lifted to App.jsx so they survive
  // unmount/remount when the user navigates between home and computing views.

  async function handleDeleteClick(e, id) {
    e.stopPropagation()
    if (deletingIds?.has(id)) return
    await onDelete(id)
  }

  async function handleCancelClick(e, id) {
    e.stopPropagation()
    if (cancellingIds?.has(id)) return
    await onCancel(id)
  }

  const visible = entries.filter(e =>
    e.status === 'SUCCEEDED' || e.status === 'QUEUED' || e.status === 'RUNNING'
  )

  if (!visible.length) {
    return (
      <div className="no-dates">변화탐지 기록이 없습니다</div>
    )
  }

  return (
    <div className="dh-list">
      {visible.map(entry => {
        const isActive     = activeId != null && String(activeId) === String(entry.id)
        const isActiveB     = splitMode && activeIdB != null && String(activeIdB) === String(entry.id)
        const isRunning    = entry.status === 'RUNNING'
        const isQueued     = entry.status === 'QUEUED'
        const isSucceeded  = entry.status === 'SUCCEEDED'
        const isDeleting   = deletingIds.has(entry.id)
        const isCancelling = cancellingIds.has(entry.id)
        const isBusy       = isDeleting || isCancelling

        return (
          <div
            key={entry.id}
            className={`dh-entry${isActive ? ' dh-active' : ''}${isActiveB ? ' dh-active-b' : ''}${isBusy ? ' dh-deleting' : ''}`}
            onClick={() => isSucceeded && !isBusy && onLoad(entry)}
            style={{ cursor: isSucceeded && !isBusy ? 'pointer' : 'default' }}
          >
            {/* Split-view A/B assignment pill — only shown in split mode,
                only on rows eligible to be assigned (succeeded results).
                Shows which slot (if any) this entry currently occupies;
                an unassigned succeeded row shows a faint empty ring so
                it's clear clicking the row assigns it to the next slot. */}
            {splitMode && isSucceeded && (
              <span className={`dh-slot-pill${isActive ? ' dh-slot-a' : isActiveB ? ' dh-slot-b' : ' dh-slot-empty'}`}>
                {isActive ? 'A' : isActiveB ? 'B' : ''}
              </span>
            )}

            {/* Type badge */}
            <span className={`dh-type-badge ${entry.type === 'AB' ? 'dh-ab' : 'dh-ts'}`}>
              {entry.type === 'AB' ? 'A·B' : 'TS'}
            </span>

            {/* Name + date range */}
            <div className="dh-dates">
              <div style={{ fontSize: 11, color: 'var(--text)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {entry.name ?? `diff-${entry.id}`}
              </div>
              {isSucceeded && entry.labelA && (() => {
                const { a, b } = shortRange(entry.labelA, entry.labelB)
                return (
                  <div className="dh-range" title={`${entry.labelA}${entry.labelB && entry.labelB !== entry.labelA ? ' → ' + entry.labelB : ''}`}>
                    {a}
                    {b && <><span className="dh-arrow">→</span>{b}</>}
                  </div>
                )
              })()}
            </div>

            {/* Status badge + spinner — own fixed-width column, sits
                immediately left of the time so it stays aligned across
                rows whether the time text is "10:21" or "Jun 22".
                While deleting/cancelling, this overrides the normal
                status to show "삭제 중"/"취소 중" so it's obvious the
                row is mid-action. */}
            <div className="dh-status-col">
              {isDeleting ? (
                <span className="vst-badge vst-deleting">삭제 중</span>
              ) : isCancelling ? (
                <span className="vst-badge vst-deleting">취소 중</span>
              ) : (
                <>
                  {isSucceeded && (
                    <span className="vst-badge vst-done">완료</span>
                  )}
                  {isQueued && (
                    <span className="vst-badge vst-running">대기 중</span>
                  )}
                  {isRunning && (
                    <span className="vst-badge vst-running">생성 중</span>
                  )}
                </>
              )}
              {(isQueued || isRunning || isBusy) && (
                <span className={`vst-spinner${isBusy ? ' vst-spinner-del' : ''}`} />
              )}
            </div>

            {/* Time */}
            {entry.createdAt && (
              <span className="dh-time">{timeAgo(entry.createdAt)}</span>
            )}

            {/* ✕ — delete for a finished row, cancel for one still in
                flight. Once clicked, swaps to a disabled blank state so
                a second click can't fire a second request while the
                first is still in flight. */}
            {isSucceeded && (
              <button
                className="dh-icon-btn dh-del"
                onClick={e => handleDeleteClick(e, entry.id)}
                disabled={isDeleting}
                title={isDeleting ? '삭제 중...' : '삭제'}
              >
                {isDeleting ? '' : '✕'}
              </button>
            )}
            {(isQueued || isRunning) && (
              <button
                className="dh-icon-btn dh-del"
                onClick={e => handleCancelClick(e, entry.id)}
                disabled={isCancelling}
                title={isCancelling ? '취소 중...' : '취소'}
              >
                {isCancelling ? '' : '✕'}
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}