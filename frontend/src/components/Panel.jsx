/**
 * Panel.jsx — LEFT sidebar (analysis tab)
 *
 * Two views:
 *   'home'      — project info + "새 변화탐지" button + diff history
 *   'computing' — name input + mode selector + date/area/run controls
 *
 * Point size slider lives in the floating dates drawer.
 */

import { useState } from 'react'
import { formatDate } from '../api'
import DiffHistory from './DiffHistory'

function trunc(str, max = 16) {
  if (!str) return ''
  return str.length > max ? str.slice(0, max) + '…' : str
}

function TypeTag({ type }) {
  if (!type) return null
  return (
    <span className={`ltag ${type === 'mesh' ? 'ltag-amber' : 'ltag-purple'}`}>
      {type === 'mesh' ? 'MESH' : 'PC'}
    </span>
  )
}


const ANALYSIS_MODES = [
  { value: 'compare-api', label: 'A vs B 비교' },
  { value: 'timeline',    label: '시계열 변화탐지' },
]

export default function Panel({
  activeSite,
  visibleDateIds, onToggleDate,
  pcSize, onPcSize, showPcSlider,
  mode, onMode,
  diffHistory,
  diffPollingIds,
  activeDiffId,
  onLoadDiff,
  onDeleteDiff,
  onCancelDiff,
  deletingDiffIds,
  cancellingDiffIds,
  // new computation view props
  analysisView,         // 'home' | 'computing'
  onNewComputation,     // () => void — go to computing view
  onBackToHome,         // () => void — go back to home view
  diffName, onDiffName, // name input
  // compare-api props (now in left panel)
  apiDateIdA, onApiDateIdA,
  apiDateIdB, onApiDateIdB,
  apiRunning, onApiRun, onApiClear, onApiCancel,
  apiStatus, apiError,
  // draw area
  drawInfo, drawBtnLabel, onDrawArea,
  // timeline recompute
  tlRecomputeRunning, onTlRecompute, onTlCancelRecompute, tlRecomputeStatus,
}) {
  const dates          = activeSite?.dates ?? []
  const voxelizedCount = dates.filter(d => d.voxelStatus === 'SUCCEEDED').length
  const firstDate      = dates[0]?.label ?? '—'
  const lastDate       = dates[dates.length - 1]?.label ?? '—'
  const dateRange      = dates.length > 1 ? `${firstDate} ~ ${lastDate}` : firstDate

  const [drawerOpen, setDrawerOpen] = useState(false)

  // Each mode's Run button is only disabled by its own in-flight job.
  // An A·B job running does NOT block starting a timeline job and vice versa.
  const isComputing  = apiRunning || tlRecomputeRunning
  const runDisabled  = mode === 'compare-api' ? apiRunning : tlRecomputeRunning

  // ── HOME VIEW ─────────────────────────────────────────────────────────────

  function renderHome() {
    return (
      <>
        {/* Project info */}
        <div className="p-section">
          <div className="p-label">선택된 프로젝트</div>
          <div className="site-info-card">
            <div className="site-info-row">
              <span className="site-info-k">프로젝트명</span>
              <span className="site-info-v">{activeSite.name}</span>
            </div>
            <div className="site-info-row">
              <span className="site-info-k">관측 데이터</span>
              <span className="site-info-v" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {dates.length}건
                {dates.length > 0 && (
                  <button
                    className="dates-drawer-trigger"
                    onClick={() => setDrawerOpen(o => !o)}
                    title="Survey Dates 열기"
                  >
                    목록
                  </button>
                )}
              </span>
            </div>
            {dates.length > 0 && (
              <div className="site-info-row">
                <span className="site-info-k">기간</span>
                <span className="site-info-v site-info-mono">{dateRange}</span>
              </div>
            )}
            <div className="site-info-row">
              <span className="site-info-k">상태</span>
              <span className={`site-status-badge ${voxelizedCount >= 2 ? 'status-ok' : 'status-warn'}`}>
                {voxelizedCount >= 2 ? '분석 가능' : '데이터 필요'}
              </span>
            </div>
          </div>
        </div>

        {/* New computation button */}
        <div className="p-section">
          <button
            className="new-diff-btn"
            onClick={onNewComputation}
            disabled={voxelizedCount < 2}
            title={voxelizedCount < 2 ? 'Voxel이 완료된 날짜가 2개 이상 필요합니다' : undefined}
          >
            ＋ 새 변화탐지
          </button>
        </div>

        {/* Diff history */}
        <div className="p-section" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div className="p-label">변화탐지 기록</div>
          <DiffHistory
            entries={diffHistory ?? []}
            activeId={activeDiffId}
            onLoad={onLoadDiff}
            onDelete={onDeleteDiff}
            onCancel={onCancelDiff}
            pollingIds={diffPollingIds}
            deletingIds={deletingDiffIds}
            cancellingIds={cancellingDiffIds}
          />
        </div>
      </>
    )
  }

  // ── COMPUTING VIEW ────────────────────────────────────────────────────────

  function renderComputing() {
    const isAbMode = mode === 'compare-api'
    const running  = isAbMode ? apiRunning : tlRecomputeRunning

    return (
      <>
        {/* Project info card — same as home view */}
        <div className="p-section">
          <div className="p-label">선택된 프로젝트</div>
          <div className="site-info-card">
            <div className="site-info-row">
              <span className="site-info-k">프로젝트명</span>
              <span className="site-info-v">{activeSite.name}</span>
            </div>
            <div className="site-info-row">
              <span className="site-info-k">관측 데이터</span>
              <span className="site-info-v" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {dates.length}건
                {dates.length > 0 && (
                  <button
                    className="dates-drawer-trigger"
                    onClick={() => setDrawerOpen(o => !o)}
                    title="Survey Dates 열기"
                  >
                    목록
                  </button>
                )}
              </span>
            </div>
            {dates.length > 0 && (
              <div className="site-info-row">
                <span className="site-info-k">기간</span>
                <span className="site-info-v site-info-mono">{dateRange}</span>
              </div>
            )}
            <div className="site-info-row">
              <span className="site-info-k">상태</span>
              <span className={`site-status-badge ${voxelizedCount >= 2 ? 'status-ok' : 'status-warn'}`}>
                {voxelizedCount >= 2 ? '분석 가능' : '데이터 필요'}
              </span>
            </div>
          </div>
        </div>

        {/* Back + title */}
        <div className="p-section" style={{ paddingBottom: 0 }}>
          <button className="back-btn" onClick={onBackToHome}>
            ← 목록으로
          </button>
        </div>

        {/* Computation name */}
        <div className="p-section">
          <div className="p-label">분석 이름 <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(선택)</span></div>
          <input
            className="diff-name-input"
            type="text"
            placeholder="예: 2024년 변화탐지"
            value={diffName}
            onChange={e => onDiffName(e.target.value)}
            disabled={running}
          />
        </div>

        {/* Analysis mode — switchable even while a computation is running;
            the running job keeps going in the background regardless of
            which mode is shown */}
        <div className="p-section">
          <div className="p-label">분석 방법</div>
          <select
            className="mode-select"
            value={mode ?? 'compare-api'}
            onChange={e => onMode?.(e.target.value)}
          >
            {ANALYSIS_MODES.map(m => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>

        {/* A vs B date selectors */}
        {isAbMode && (
          <div className="p-section">
            <div className="p-label">비교 날짜</div>
            <div className="compare-pair">
              <div className="compare-row">
                <span className="compare-ab-lbl">A</span>
                <select value={apiDateIdA} onChange={e => onApiDateIdA(e.target.value)} disabled={running}>
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
              <div className="compare-row" style={{ marginTop: 6 }}>
                <span className="compare-ab-lbl">B</span>
                <select value={apiDateIdB} onChange={e => onApiDateIdB(e.target.value)} disabled={running}>
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
              {dates.some(d => d.voxelStatus !== 'SUCCEEDED') && (
                <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 6 }}>
                  ⚠ voxel 없음 날짜는 관측 데이터 탭에서 먼저 계산하세요
                </div>
              )}
            </div>
          </div>
        )}

        {/* Draw area — A vs B only */}
        {isAbMode && (
          <div className="p-section">
            <div className="p-label">분석 영역</div>
            <button id="btn-draw-area" onClick={onDrawArea} disabled={running}>{drawBtnLabel}</button>
            <div id="draw-info" style={{ marginTop: 4 }}>{drawInfo}</div>
          </div>
        )}

        {/* Run / Cancel / Clear */}
        <div className="p-section">
        <div className="compare-action-buttons">
            <button
              id="btn-run-diff"
              disabled={runDisabled}
              onClick={isAbMode ? onApiRun : onTlRecompute}
            >
              {running ? '⟳ 분석 중…' : '⚡ 분석 실행'}
            </button>
            {running ? (
              <button
                id="btn-clear-diff"
                style={{ borderColor: '#d49050', color: '#d49050' }}
                onClick={isAbMode ? onApiCancel : onTlCancelRecompute}
              >
                ⏹ 중단
              </button>
            ) : (isAbMode ? apiStatus : tlRecomputeStatus) ? (
              <button id="btn-clear-diff" onClick={onApiClear}>✖ 결과 지우기</button>
            ) : null}
          </div>
          {(apiStatus || tlRecomputeStatus) && (
            <div id="diff-status" data-state={running ? 'computing' : 'done'} style={{ marginTop: 6 }}>
              {isAbMode ? apiStatus : tlRecomputeStatus}
            </div>
          )}
          {apiError && (
            <div id="diff-status" data-state="error" style={{ color: 'var(--removed)', marginTop: 6 }}>
              {apiError}
            </div>
          )}
        </div>
      </>
    )
  }

  // ── DATES DRAWER (shared between both views) ───────────────────────────────

  function renderDatesDrawer() {
    return (
      <div className="dates-drawer">
        <div className="dates-drawer-header">
          <span className="dates-drawer-title">Survey Dates</span>
          <button className="dates-drawer-close" onClick={() => setDrawerOpen(false)}>✕</button>
        </div>
        <div className="dates-drawer-body">
          {dates.length === 0 && (
            <div className="no-dates">날짜 없음 — 데이터 업로드 탭에서 추가하세요</div>
          )}
          {dates.map(d => {
            const isOn = visibleDateIds.has(d.id)
            return (
              <div key={d.id} className="date-row-wrap">
                <button
                  className={`date-btn${isOn ? ' active' : ''}`}
                  onClick={() => onToggleDate(d)}
                >
                  <span className="date-label">{formatDate(d.observedAt) || d.label}</span>
                  <span className="date-meta">
                    <span className="date-name" title={d.name}>{trunc(d.name)}</span>
                    <TypeTag type={d.datasetType} />
                  </span>
                </button>
              </div>
            )
          })}

          {/* Point size slider — lives here now */}
          {showPcSlider && (
            <div className="drawer-pc-size">
              <span className="drawer-pc-label">포인트 크기</span>
              <input
                type="range" min="1" max="20" step="0.5"
                value={pcSize}
                onChange={e => onPcSize(parseFloat(e.target.value))}
              />
              <span className="drawer-pc-val">{pcSize}</span>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <aside id="panel">
      {analysisView === 'home' ? renderHome() : renderComputing()}
      {drawerOpen && renderDatesDrawer()}
    </aside>
  )
}