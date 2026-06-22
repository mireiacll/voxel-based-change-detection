/**
 * RightPanel.jsx — RIGHT sidebar (analysis view only)
 *
 * Modes:
 *   compare-api  → A vs B date selectors + run button + results
 *   timeline     → TimelinePanel
 *
 * (The old 'compare' / Simple mode has been removed. See ARCHIVE_compare_simple_mode.md)
 */

import TimelinePanel from './TimelinePanel'

function fmtVol(m3) {
  if (m3 == null || isNaN(m3)) return '—'
  if (Math.abs(m3) >= 1_000_000) return `${(m3 / 1_000_000).toFixed(3)} km³`
  if (Math.abs(m3) >= 1_000)    return `${(m3 / 1_000).toFixed(2)}k m³`
  return `${m3.toFixed(1)} m³`
}

function fmtVoxSize(avgVoxVol) {
  if (avgVoxVol == null || avgVoxVol <= 0) return '—'
  const edge = Math.cbrt(avgVoxVol)
  return `${edge.toFixed(3)} m`
}

export default function RightPanel({
  mode,
  activeSite,
  // draw area (used by compare-api)
  drawInfo, drawBtnLabel, onDrawArea,
  // 분석 결과 visibility toggles
  showAdded, onShowAdded,
  showRemoved, onShowRemoved,
  showUnchanged, onShowUnchanged,
  // timeline props
  tlSnapshots, tlActiveIndex, tlOnSelect,
  tlPlaying, tlOnPlayPause,
  tlLoading, tlOnRecompute,
  tlRecomputeRunning, tlRecomputeStatus, tlOnCancelRecompute,
  tlStale, tlStaleInfo, tlMissingVoxels,
  // compare-api props
  apiDateIdA, onApiDateIdA,
  apiDateIdB, onApiDateIdB,
  apiRunning, onApiRun, onApiClear, onApiCancel,
  apiStatus, apiError,
  apiSummary,
}) {
  const dates        = activeSite?.dates ?? []
  const inTimeline   = mode === 'timeline'
  const inApiCompare = mode === 'compare-api'

  return (
    <aside id="right-panel">

      {/* ── A vs B (Full) — compare-api mode ── */}
      {inApiCompare && (
        <>
          <div className="p-section">
            <div className="p-label">Dates to Compare</div>
            <div className="compare-pair">
              <div className="compare-row">
                <span className="compare-ab-lbl">A</span>
                <select value={apiDateIdA} onChange={e => onApiDateIdA(e.target.value)}>
                  <option value="">— 날짜 선택 —</option>
                  {dates.map(d => {
                    const hasVoxel = d.voxelStatus === 'SUCCEEDED'
                    return (
                      <option key={d.id} value={d.id} disabled={!hasVoxel}>
                        {d.label}{!hasVoxel ? ' ⚠ voxel 없음' : ''}
                      </option>
                    )
                  })}
                </select>
              </div>
              <div className="compare-row" style={{ marginTop: 8 }}>
                <span className="compare-ab-lbl">B</span>
                <select value={apiDateIdB} onChange={e => onApiDateIdB(e.target.value)}>
                  <option value="">— 날짜 선택 —</option>
                  {dates.map(d => {
                    const hasVoxel = d.voxelStatus === 'SUCCEEDED'
                    return (
                      <option key={d.id} value={d.id} disabled={!hasVoxel}>
                        {d.label}{!hasVoxel ? ' ⚠ voxel 없음' : ''}
                      </option>
                    )
                  })}
                </select>
              </div>
            </div>
            {dates.some(d => d.voxelStatus !== 'SUCCEEDED') && (
              <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 6 }}>
                ⚠ voxel 없음 표시된 날짜는 왼쪽 패널에서 먼저 Voxel을 계산하세요
              </div>
            )}
          </div>

          <div className="p-section">
            <div className="p-label">Analysis Settings</div>
            <button id="btn-draw-area" onClick={onDrawArea}>{drawBtnLabel}</button>
            <div id="draw-info">{drawInfo}</div>
            <div className="compare-action-buttons" style={{ marginTop: 10 }}>
              <button id="btn-run-diff" disabled={apiRunning} onClick={onApiRun}>
                {apiRunning ? '⟳ 분석 중…' : '⚡ 분석 실행'}
              </button>
              {apiRunning ? (
                <button
                  id="btn-clear-diff"
                  style={{ borderColor: '#d49050', color: '#d49050' }}
                  onClick={onApiCancel}
                >
                  ⏹ 취소
                </button>
              ) : (
                <button id="btn-clear-diff" onClick={onApiClear}>✖ 초기화</button>
              )}
            </div>
            {apiStatus && (
              <div id="diff-status" data-state={apiRunning ? 'computing' : 'done'}>{apiStatus}</div>
            )}
            {apiError && (
              <div id="diff-status" data-state="error" style={{ color: 'var(--removed)' }}>{apiError}</div>
            )}
          </div>

          {apiSummary && (() => {
            const added   = apiSummary.addedVolume   ?? 0
            const removed = apiSummary.removedVolume ?? 0
            const changed = apiSummary.changedVolume ?? 0
            const net     = added - removed
            return (
              <div className="p-section">
                <div className="p-label">Analysis Results</div>

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
                  <div className="stat-row">
                    <span className="stat-k">제거 부피</span>
                    <span className="stat-v" style={{ color: 'var(--removed)' }}>-{fmtVol(removed)}</span>
                  </div>
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
        </>
      )}

      {/* ── 분석 결과 — timeline ── */}
      {inTimeline && (
        <div className="p-section">
          <div className="p-label">Analysis Results</div>
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
            onRecompute={tlOnRecompute}
            tlRecomputeRunning={tlRecomputeRunning}
            tlRecomputeStatus={tlRecomputeStatus}
            onCancelRecompute={tlOnCancelRecompute}
            stale={tlStale}
            staleInfo={tlStaleInfo}
            missingVoxels={tlMissingVoxels}
          />
        </div>
      )}

    </aside>
  )
}