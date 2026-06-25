/**
 * RightPanel.jsx — RIGHT sidebar (analysis view only)
 *
 * Shows results only. Controls (date selectors, run button, draw area)
 * have moved to Panel.jsx (left sidebar).
 *
 * Visible only when there is an actual result to display:
 *   compare-api  → apiSummary is set
 *   timeline     → tlSnapshots is set (even while loading)
 *
 * ───────────────────────────────────────────────────────────────────────
 * SPLIT VIEW (compare two diff-history entries side by side)
 * ───────────────────────────────────────────────────────────────────────
 * When splitMode is on, this renders TWO self-contained result halves
 * stacked top/bottom instead of one. Each half can independently be an
 * A·B result or a timeline result — they don't have to match. The single-
 * view rendering path below (when splitMode is false) is completely
 * unchanged from before this feature existed.
 */

import { useRef } from 'react'
import TimelinePanel from './TimelinePanel'

// ── Mini inline timeline scrubber (split-view only) ───────────────────────
//
// Compact track+scrubber that lives inside each split-view half when that
// slot holds a TIME_SERIES result. Mirrors the full TimelineBar at the
// bottom but sized to fit inside the narrow panel column.
function MiniTimelineBar({ snapshots, activeIndex, onSelect, playing, onPlayPause }) {
  const trackRef = useRef(null)
  if (!snapshots || snapshots.length === 0) return null

  const n = snapshots.length
  const markerFracs = snapshots.map((_, i) => (i + 1) / (n + 1))
  const scrubFrac   = markerFracs[activeIndex] ?? 0
  const active      = snapshots[activeIndex]

  function fracToNearest(frac) {
    let best = 0, bestDist = Infinity
    markerFracs.forEach((f, i) => {
      const d = Math.abs(f - frac)
      if (d < bestDist) { bestDist = d; best = i }
    })
    return best
  }

  function handleTrackClick(e) {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect) return
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    onSelect(fracToNearest(frac))
  }

  function handleScrubMouseDown(e) {
    e.preventDefault()
    e.stopPropagation()
    function onMove(ev) {
      const rect = trackRef.current?.getBoundingClientRect()
      if (!rect) return
      const frac = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width))
      onSelect(fracToNearest(frac))
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup',   onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
  }

  return (
    <div className="mini-tl">
      {/* Active period label */}
      {active && (
        <div className="mini-tl-label">
          <span className="mini-tl-a">{active.date_a.label}</span>
          <span className="mini-tl-arrow">→</span>
          <span className="mini-tl-b">{active.date_b.label}</span>
        </div>
      )}

      {/* Controls row: play · prev · track · next · counter */}
      <div className="mini-tl-row">
        <button
          className={`mini-tl-btn${playing ? ' mini-tl-playing' : ''}`}
          onClick={onPlayPause}
          title={playing ? 'Pause' : 'Play'}
        >
          {playing
            ? <svg width="8" height="8" viewBox="0 0 10 10"><rect x="1" y="1" width="3" height="8" rx="1"/><rect x="6" y="1" width="3" height="8" rx="1"/></svg>
            : <svg width="8" height="8" viewBox="0 0 10 10"><polygon points="1,1 9,5 1,9"/></svg>
          }
        </button>
        <button
          className="mini-tl-btn"
          onClick={() => onSelect(Math.max(0, activeIndex - 1))}
          disabled={activeIndex === 0}
          title="Previous"
        >‹</button>

        <div className="mini-tl-track" ref={trackRef} onClick={handleTrackClick}>
          <div className="mini-tl-fill" style={{ width: `${scrubFrac * 100}%` }} />
          {snapshots.map((s, i) => (
            <button
              key={s.id}
              className={`mini-tl-marker${i === activeIndex ? ' mini-tl-marker-active' : ''}`}
              style={{ left: `${markerFracs[i] * 100}%` }}
              onClick={ev => { ev.stopPropagation(); onSelect(i) }}
              title={`${s.date_a.label} → ${s.date_b.label}`}
            />
          ))}
          <div
            className="mini-tl-scrubber"
            style={{ left: `${scrubFrac * 100}%` }}
            onMouseDown={handleScrubMouseDown}
          />
        </div>

        <button
          className="mini-tl-btn"
          onClick={() => onSelect(Math.min(n - 1, activeIndex + 1))}
          disabled={activeIndex === n - 1}
          title="Next"
        >›</button>

        <span className="mini-tl-counter">{activeIndex + 1}<span className="mini-tl-of">/{n}</span></span>
      </div>
    </div>
  )
}

function fmtVol(m3) {
  if (m3 == null || isNaN(m3)) return '—'
  if (Math.abs(m3) >= 1_000_000) return `${(m3 / 1_000_000).toFixed(3)} km³`
  if (Math.abs(m3) >= 1_000)    return `${(m3 / 1_000).toFixed(2)}k m³`
  return `${m3.toFixed(1)} m³`
}

function fmtCount(n) {
  if (n == null || isNaN(n)) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

function fmtVoxSize(avgVoxVol) {
  if (avgVoxVol == null || avgVoxVol <= 0) return '—'
  const edge = Math.cbrt(avgVoxVol)
  return `${edge.toFixed(3)} m`
}

/**
 * A·B result block — stats + visibility toggles for one A·B diff result.
 * Used for both slot A (single-view, unchanged markup) and slot B (split
 * view). Identical to the original inline block, just extracted so it
 * can be rendered twice.
 */
function AbResultBlock({ apiSummary, showAdded, onShowAdded, showRemoved, onShowRemoved, showUnchanged, onShowUnchanged }) {
  const added   = apiSummary.addedVolume   ?? 0
  const removed = apiSummary.removedVolume ?? 0
  const changed = apiSummary.changedVolume ?? 0
  const net     = added - removed
  return (
    <>
      {apiSummary.sourceObservedAt && apiSummary.targetObservedAt && (
        <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 8 }}>
          {apiSummary.sourceObservedAt} → {apiSummary.targetObservedAt}
        </div>
      )}

      <div className="layer-row">
        <label className="sw">
          <input type="checkbox" checked={showAdded} onChange={e => onShowAdded(e.target.checked)} />
          <span />
        </label>
        <div className="layer-body">
          <div className="layer-name">추가된 부피</div>
          <div className="layer-type">B 존재, A 부재</div>
        </div>
        <span className="ltag" style={{ background: '#2a1010', color: 'var(--added)' }}>ADD</span>
      </div>

      <div className="layer-row">
        <label className="sw">
          <input type="checkbox" checked={showRemoved} onChange={e => onShowRemoved(e.target.checked)} />
          <span />
        </label>
        <div className="layer-body">
          <div className="layer-name">제거된 부피</div>
          <div className="layer-type">A 존재, B 부재</div>
        </div>
        <span className="ltag" style={{ background: '#10162a', color: 'var(--removed)' }}>REM</span>
      </div>

      <div className="layer-row">
        <label className="sw">
          <input type="checkbox" checked={showUnchanged} onChange={e => onShowUnchanged(e.target.checked)} />
          <span />
        </label>
        <div className="layer-body">
          <div className="layer-name">유지된 부피</div>
          <div className="layer-type">A·B 모두 존재</div>
        </div>
        <span className="ltag" style={{ background: '#1a1a2e', color: 'var(--muted)' }}>VOX</span>
      </div>

      <div id="stats-box" style={{ marginTop: 8 }}>
        <div className="stat-row">
          <span className="stat-k">추가 부피</span>
          <span className="stat-v" style={{ color: 'var(--added)' }}>+{fmtVol(added)}</span>
        </div>
        {apiSummary.addedCount != null && (
          <div className="stat-row" style={{ marginTop: -2 }}>
            <span className="stat-k" style={{ fontSize: 10, color: 'var(--muted)' }}>추가 복셀 수</span>
            <span className="stat-v" style={{ fontSize: 10, color: 'var(--added)' }}>{fmtCount(apiSummary.addedCount)}</span>
          </div>
        )}
        <div className="stat-row">
          <span className="stat-k">제거 부피</span>
          <span className="stat-v" style={{ color: 'var(--removed)' }}>-{fmtVol(removed)}</span>
        </div>
        {apiSummary.removedCount != null && (
          <div className="stat-row" style={{ marginTop: -2 }}>
            <span className="stat-k" style={{ fontSize: 10, color: 'var(--muted)' }}>제거 복셀 수</span>
            <span className="stat-v" style={{ fontSize: 10, color: 'var(--removed)' }}>{fmtCount(apiSummary.removedCount)}</span>
          </div>
        )}
        {changed > 0 && (
          <div className="stat-row">
            <span className="stat-k">변경 부피</span>
            <span className="stat-v" style={{ color: 'var(--muted)' }}>{fmtVol(changed)}</span>
          </div>
        )}
        <div className="stat-row" style={{ borderTop: '1px solid var(--border)', marginTop: 4, paddingTop: 6 }}>
          <span className="stat-k">순 변화</span>
          <span className="stat-v" style={{ color: net >= 0 ? 'var(--added)' : 'var(--removed)' }}>
            {net >= 0 ? '+' : ''}{fmtVol(net)}
          </span>
        </div>
        <div className="stat-row">
          <span className="stat-k">복셀 크기</span>
          <span className="stat-v" style={{ fontSize: 10, color: 'var(--muted)' }}>
            {fmtVoxSize(apiSummary.avg_vox_vol)}
          </span>
        </div>
      </div>
    </>
  )
}

export default function RightPanel({
  mode,
  // visibility toggles (slot A)
  showAdded, onShowAdded,
  showRemoved, onShowRemoved,
  showUnchanged, onShowUnchanged,
  // timeline props (slot A)
  tlSnapshots, tlActiveIndex, tlOnSelect,
  tlPlaying, tlOnPlayPause,
  tlLoading,
  // compare-api results (slot A)
  apiSummary,
  visible,
  // ── split view (slot B) ──────────────────────────────────────────────
  splitMode,
  slotBType,             // 'AB' | 'TIME_SERIES' | null
  apiSummaryB,
  showAddedB, onShowAddedB,
  showRemovedB, onShowRemovedB,
  showUnchangedB, onShowUnchangedB,
  tlSnapshotsB, tlActiveIndexB, tlOnSelectB,
  tlPlayingB, tlOnPlayPauseB,
  tlLoadingB,
  tlVisAddedB, onTlShowAddedB,
  tlVisRemovedB, onTlShowRemovedB,
  tlVisUnchangedB, onTlShowUnchangedB,
  onClearSlotB,
}) {
  const inTimeline   = mode === 'timeline'
  const inApiCompare = mode === 'compare-api'

  // Determine whether there is anything to show
  const hasAbResult       = inApiCompare && apiSummary != null
  const hasTimelineResult = inTimeline && tlSnapshots != null
  const hasSlotBResult    = slotBType === 'AB' ? apiSummaryB != null : slotBType === 'TIME_SERIES' ? tlSnapshotsB != null : false

  // ═══════════════════════════════════════════════════════════════════
  //  SPLIT VIEW — two stacked, self-contained halves
  // ═══════════════════════════════════════════════════════════════════
  if (splitMode) {
    if (!hasAbResult && !hasTimelineResult && !hasSlotBResult) return null

    return (
      <aside id="right-panel" className="rp-split">

        {/* ── Slot A half ── */}
        <div className="rp-split-half">
          <div className="p-section">
            <div className="rp-split-head">
              <span className="dh-slot-pill dh-slot-a">A</span>
              <div className="p-label" style={{ margin: 0 }}>분석 결과</div>
            </div>

            {hasAbResult && (
              <AbResultBlock
                apiSummary={apiSummary}
                showAdded={showAdded} onShowAdded={onShowAdded}
                showRemoved={showRemoved} onShowRemoved={onShowRemoved}
                showUnchanged={showUnchanged} onShowUnchanged={onShowUnchanged}
              />
            )}
            {hasTimelineResult && (
              <>
                <MiniTimelineBar
                  snapshots={tlSnapshots}
                  activeIndex={tlActiveIndex}
                  onSelect={tlOnSelect}
                  playing={tlPlaying}
                  onPlayPause={tlOnPlayPause}
                />
                <TimelinePanel
                  snapshots={tlSnapshots}
                  activeIndex={tlActiveIndex}
                  onSelect={tlOnSelect}
                  showAdded={showAdded}
                  onShowAdded={onShowAdded}
                  showRemoved={showRemoved}
                  onShowRemoved={onShowRemoved}
                  showUnchanged={showUnchanged}
                  onShowUnchanged={onShowUnchanged}
                  playing={tlPlaying}
                  onPlayPause={tlOnPlayPause}
                  loading={tlLoading}
                />
              </>
            )}
            {!hasAbResult && !hasTimelineResult && (
              <div className="rp-split-empty">기록에서 A로 지정할 항목을 선택하세요</div>
            )}
          </div>
        </div>

        <div className="rp-split-divider" />

        {/* ── Slot B half ── */}
        <div className="rp-split-half">
          <div className="p-section">
            <div className="rp-split-head">
              <span className="dh-slot-pill dh-slot-b">B</span>
              <div className="p-label" style={{ margin: 0 }}>분석 결과</div>
              {hasSlotBResult && (
                <button className="rp-split-clear-btn" onClick={onClearSlotB} title="B 비우기">✕</button>
              )}
            </div>

            {slotBType === 'AB' && apiSummaryB && (
              <AbResultBlock
                apiSummary={apiSummaryB}
                showAdded={showAddedB} onShowAdded={onShowAddedB}
                showRemoved={showRemovedB} onShowRemoved={onShowRemovedB}
                showUnchanged={showUnchangedB} onShowUnchanged={onShowUnchangedB}
              />
            )}
            {slotBType === 'TIME_SERIES' && tlSnapshotsB && (
              <>
                <MiniTimelineBar
                  snapshots={tlSnapshotsB}
                  activeIndex={tlActiveIndexB}
                  onSelect={tlOnSelectB}
                  playing={tlPlayingB}
                  onPlayPause={tlOnPlayPauseB}
                />
                <TimelinePanel
                  snapshots={tlSnapshotsB}
                  activeIndex={tlActiveIndexB}
                  onSelect={tlOnSelectB}
                  showAdded={tlVisAddedB}
                  onShowAdded={onTlShowAddedB}
                  showRemoved={tlVisRemovedB}
                  onShowRemoved={onTlShowRemovedB}
                  showUnchanged={tlVisUnchangedB}
                  onShowUnchanged={onTlShowUnchangedB}
                  playing={tlPlayingB}
                  onPlayPause={tlOnPlayPauseB}
                  loading={tlLoadingB}
                />
              </>
            )}
            {!hasSlotBResult && (
              <div className="rp-split-empty">기록에서 B로 지정할 항목을 선택하세요</div>
            )}
          </div>
        </div>

      </aside>
    )
  }

  // ═══════════════════════════════════════════════════════════════════
  //  SINGLE VIEW — unchanged from before split view existed
  // ═══════════════════════════════════════════════════════════════════
  if (!hasAbResult && !hasTimelineResult) return null

  return (
    <aside id="right-panel">

      {/* ── A vs B results ── */}
      {inApiCompare && apiSummary && (
        <div className="p-section">
          <div className="p-label">분석 결과</div>
          <AbResultBlock
            apiSummary={apiSummary}
            showAdded={showAdded} onShowAdded={onShowAdded}
            showRemoved={showRemoved} onShowRemoved={onShowRemoved}
            showUnchanged={showUnchanged} onShowUnchanged={onShowUnchanged}
          />
        </div>
      )}

      {/* ── Timeline results ── */}
      {inTimeline && (
        <div className="p-section">
          <div className="p-label">분석 결과</div>
          <TimelinePanel
            snapshots={tlSnapshots}
            activeIndex={tlActiveIndex}
            onSelect={tlOnSelect}
            showAdded={showAdded}
            onShowAdded={onShowAdded}
            showRemoved={showRemoved}
            onShowRemoved={onShowRemoved}
            showUnchanged={showUnchanged}
            onShowUnchanged={onShowUnchanged}
            playing={tlPlaying}
            onPlayPause={tlOnPlayPause}
            loading={tlLoading}
          />
        </div>
      )}

    </aside>
  )
}