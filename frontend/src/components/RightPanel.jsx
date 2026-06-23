/**
 * RightPanel.jsx — RIGHT sidebar (analysis view only)
 *
 * Shows results only. Controls (date selectors, run button, draw area)
 * have moved to Panel.jsx (left sidebar).
 *
 * Visible only when there is an actual result to display:
 *   compare-api  → apiSummary is set
 *   timeline     → tlSnapshots is set (even while loading)
 */

import TimelinePanel from './TimelinePanel'

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

export default function RightPanel({
  mode,
  // visibility toggles
  showAdded, onShowAdded,
  showRemoved, onShowRemoved,
  showUnchanged, onShowUnchanged,
  // timeline props
  tlSnapshots, tlActiveIndex, tlOnSelect,
  tlPlaying, tlOnPlayPause,
  tlLoading,
  // compare-api results
  apiRunning, apiSummary,
}) {
  const inTimeline   = mode === 'timeline'
  const inApiCompare = mode === 'compare-api'

  // Determine whether there is anything to show
  const hasAbResult      = inApiCompare && (apiSummary != null || apiRunning)
  const hasTimelineResult = inTimeline && tlSnapshots != null

  if (!hasAbResult && !hasTimelineResult) return null

  return (
    <aside id="right-panel">

      {/* ── A vs B results ── */}
      {inApiCompare && apiSummary && (() => {
        const added   = apiSummary.addedVolume   ?? 0
        const removed = apiSummary.removedVolume ?? 0
        const changed = apiSummary.changedVolume ?? 0
        const net     = added - removed
        return (
          <div className="p-section">
            <div className="p-label">분석 결과</div>

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
          </div>
        )
      })()}

      {/* Spinner while AB is running but no result yet */}
      {inApiCompare && apiRunning && !apiSummary && (
        <div className="p-section">
          <div style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', padding: '20px 0' }}>
            분석 중…
          </div>
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