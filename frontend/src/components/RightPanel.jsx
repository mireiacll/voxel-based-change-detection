/**
 * RightPanel.jsx — RIGHT sidebar (analysis view only)
 *
 * Order:
 *   [compare mode only]
 *     1. 날짜 비교   (A/B date selectors + tint + opacity)
 *     2. 분석 설정   (draw area, voxel size, run/clear diff)
 *   [always]
 *     3. 분석 결과   — compare → stats/toggles | timeline → TimelinePanel
 */

import TimelinePanel from './TimelinePanel'

function fmt(n, voxSize) {
  const m3 = n * voxSize ** 3
  return m3 < 10000 ? `${m3.toFixed(1)} m³` : `${(m3 / 1000).toFixed(2)}k m³`
}

function fmtVol(m3) {
  if (m3 == null || isNaN(m3)) return '—'
  if (Math.abs(m3) >= 1_000_000) return `${(m3 / 1_000_000).toFixed(3)} km³`
  if (Math.abs(m3) >= 1_000)    return `${(m3 / 1_000).toFixed(2)}k m³`
  return `${m3.toFixed(1)} m³`
}

function fmtCount(n) {
  if (n == null) return '—'
  return n.toLocaleString()
}

export default function RightPanel({
  mode,
  activeSite,
  // compare-only props
  compareIdA, onCompareIdA,
  compareIdB, onCompareIdB,
  drawInfo, drawBtnLabel, onDrawArea,
  voxelSize, onVoxelSize,
  diffRunning, onRunDiff, onClearDiff, onCancelDiff,
  diffStatus,
  // 분석 결과 props
  showAdded, onShowAdded,
  showRemoved, onShowRemoved,
  showUnchanged, onShowUnchanged,
  stats,
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
  const dates       = activeSite?.dates ?? []
  const inCompare   = mode === 'compare'
  const inTimeline  = mode === 'timeline'
  const inApiCompare = mode === 'compare-api'

  const netM3 = stats ? (stats.added - stats.removed) * stats.voxSize ** 3 : 0

  return (
    <aside id="right-panel">

      {/* ── 날짜 비교 + 분석 설정 — compare mode only ── */}
      {inCompare && (
        <>
          {/* 날짜 비교 */}
          <div className="p-section">
            <div className="p-label">Dates to Compare</div>
            <div className="compare-pair">
              <div className="compare-row">
                <span className="compare-ab-lbl">A</span>
                <select value={compareIdA} onChange={e => onCompareIdA(e.target.value)}>
                  <option value="">— 날짜 선택 —</option>
                  {dates.map(d => {
                    const isMesh = d.datasetType === 'mesh'
                    return (
                      <option key={d.id} value={d.id} disabled={isMesh}>
                        {d.label}{isMesh ? ' ⚠ 메쉬 불가' : ''}
                      </option>
                    )
                  })}
                </select>
              </div>
              <div className="compare-row" style={{ marginTop: 8 }}>
                <span className="compare-ab-lbl">B</span>
                <select value={compareIdB} onChange={e => onCompareIdB(e.target.value)}>
                  <option value="">— 날짜 선택 —</option>
                  {dates.map(d => {
                    const isMesh = d.datasetType === 'mesh'
                    return (
                      <option key={d.id} value={d.id} disabled={isMesh}>
                        {d.label}{isMesh ? ' ⚠ 메쉬 불가' : ''}
                      </option>
                    )
                  })}
                </select>
              </div>
              {dates.some(d => d.datasetType === 'mesh') && (
                <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 6 }}>
                  ⚠ 메쉬 데이터는 차이 계산을 지원하지 않습니다 — 포인트클라우드만 선택 가능
                </div>
              )}
            </div>
          </div>

          {/* 분석 설정 */}
          <div className="p-section">
            <div className="p-label">Analysis Settings</div>

            <button id="btn-draw-area" onClick={onDrawArea}>{drawBtnLabel}</button>
            <div id="draw-info">{drawInfo}</div>

            <div className="voxel-size-row" style={{ marginTop: 10 }}>
              <label htmlFor="voxel-size-input">Voxel 크기</label>
              <input
                type="number" id="voxel-size-input"
                min="0.1" max="10" step="0.1"
                value={voxelSize}
                onChange={e => onVoxelSize(parseFloat(e.target.value) || 0.5)}
              />
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>m</span>
            </div>

            <div className="compare-action-buttons" style={{ marginTop: 10 }}>
              <button id="btn-run-diff" disabled={diffRunning} onClick={onRunDiff}>
                {diffRunning ? '⟳ 계산 중…' : '⚡ 차이 계산'}
              </button>
              {diffRunning ? (
                <button
                  id="btn-clear-diff"
                  style={{ borderColor: '#d49050', color: '#d49050' }}
                  onClick={onCancelDiff}
                >
                  ⏹ 중지
                </button>
              ) : (
                <button id="btn-clear-diff" onClick={onClearDiff}>✖ 초기화</button>
              )}
            </div>

            <div id="diff-status" data-state={diffStatus.state}>{diffStatus.msg}</div>
          </div>
        </>
      )}

      {/* ── 분석 결과 — only shown once there's something to show ── */}
      {(inCompare && stats) && (
        <div className="p-section">
          <div className="p-label">Analysis Results</div>
          <div className="layer-row">
              <label className="sw">
                <input type="checkbox" checked={showAdded}
                  onChange={e => onShowAdded(e.target.checked)} />
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
                <input type="checkbox" checked={showRemoved}
                  onChange={e => onShowRemoved(e.target.checked)} />
                <span />
              </label>
              <div className="layer-body">
                <div className="layer-name">제거된 부피</div>
                <div className="layer-type">A 존재, B 부재</div>
              </div>
              <span className="ltag" style={{ background: '#10162a', color: 'var(--removed)' }}>REM</span>
            </div>

            <div id="stats-box" style={{ marginTop: 8 }}>
              <div className="stat-row">
                <span className="stat-k">추가</span>
                <span className="stat-v" style={{ color: 'var(--added)' }}>
                  {stats ? fmt(stats.added, stats.voxSize) : '—'}
                </span>
              </div>
              <div className="stat-row">
                <span className="stat-k">제거</span>
                <span className="stat-v" style={{ color: 'var(--removed)' }}>
                  {stats ? fmt(stats.removed, stats.voxSize) : '—'}
                </span>
              </div>
              <div className="stat-row" style={{ borderTop: '1px solid var(--border)', marginTop: 4, paddingTop: 6 }}>
                <span className="stat-k">순 변화</span>
                <span className="stat-v" style={{ color: stats ? (netM3 >= 0 ? 'var(--added)' : 'var(--removed)') : 'inherit' }}>
                  {stats
                    ? (netM3 >= 0 ? '+' : '') + (Math.abs(netM3) < 10000
                        ? netM3.toFixed(1) + ' m³'
                        : (netM3 / 1000).toFixed(2) + 'k m³')
                    : '—'}
                </span>
              </div>
              <div className="stat-row">
                <span className="stat-k">해상도</span>
                <span className="stat-v" style={{ fontSize: 10, color: 'var(--muted)' }}>
                  {stats
                    ? `${stats.added + stats.removed} voxels @ ${stats.voxSize}m` + (stats.clipped ? ' (polygon)' : '')
                    : '—'}
                </span>
              </div>
            </div>
        </div>
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
                  {showAdded && (
                    <div className="stat-row">
                      <span className="stat-k">추가 부피</span>
                      <span className="stat-v" style={{ color: 'var(--added)' }}>+{fmtVol(added)}</span>
                    </div>
                  )}
                  {showRemoved && (
                    <div className="stat-row">
                      <span className="stat-k">제거 부피</span>
                      <span className="stat-v" style={{ color: 'var(--removed)' }}>-{fmtVol(removed)}</span>
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
                </div>
              </div>
            )
          })()}
        </>
      )}

    </aside>
  )
}