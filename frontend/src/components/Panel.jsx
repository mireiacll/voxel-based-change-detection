// Panel.jsx — left sidebar (analysis tab)
//
// Two views:
//   'home'      — project info, diff history, "새 변화탐지" button
//   'computing' — name/mode/date selectors, draw area, run button
//
// The dates drawer (floating overlay) is shared between both views.

import { useState, useEffect, useRef } from 'react'
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
  analysisView,         // 'home' | 'computing'
  onNewComputation,
  onBackToHome,
  diffName, onDiffName,
  apiDateIdA, onApiDateIdA,
  apiDateIdB, onApiDateIdB,
  onApiRun, apiError,
  drawInfo, drawBtnLabel, onDrawArea,
  onTlRecompute,
  splitMode, onToggleSplitMode,
  activeDiffIdB,
  onAssignSlot,
  blinkMode, onToggleBlinkMode,
}) {
  const dates          = activeSite?.dates ?? []
  const voxelizedCount = dates.filter(d => d.voxelStatus === 'SUCCEEDED').length
  const firstDate      = dates[0]?.label ?? '—'
  const lastDate       = dates[dates.length - 1]?.label ?? '—'
  const dateRange      = dates.length > 1 ? `${firstDate} ~ ${lastDate}` : firstDate

  const [drawerOpen, setDrawerOpen] = useState(false)

  // Track the most recently submitted job in the computing view.
  // When the user clicks 분석 실행 we flip pendingCapture so the next
  // diffHistory update can grab the new QUEUED entry's id. lastJobId
  // stays set for the session; resets when going back to home.
  const [lastJobId, setLastJobId] = useState(null)
  const pendingCapture = useRef(false)

  useEffect(() => {
    if (!pendingCapture.current) return
    const newest = diffHistory?.[0]
    if (newest && (newest.status === 'QUEUED' || newest.status === 'RUNNING')) {
      setLastJobId(newest.id)
      pendingCapture.current = false
    }
  }, [diffHistory])

  // Reset when switching back to home
  useEffect(() => {
    if (analysisView === 'home') {
      setLastJobId(null)
      pendingCapture.current = false
    }
  }, [analysisView])

  const lastJobEntry = lastJobId != null
    ? (diffHistory?.find(e => String(e.id) === String(lastJobId)) ?? null)
    : null

  // Only show the in-flight block when the current mode matches the running job.
  // If you switch modes while a job runs, you get a clean form for the new mode.
  const lastJobModeMatch = lastJobEntry?.type === 'AB'
    ? mode === 'compare-api'
    : mode === 'timeline'
  const lastJobRunning    = lastJobModeMatch &&
    (lastJobEntry?.status === 'QUEUED' || lastJobEntry?.status === 'RUNNING')
  const lastJobCancelling = cancellingDiffIds?.has(lastJobId)

  // ── HOME VIEW ─────────────────────────────────────────────────────────────

  function renderHome() {
    return (
      <>
        {/* Fixed top — project info + new computation button */}
        <div className="panel-fixed">
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
                      title="Observations 열기"
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
        </div>

        {/* Scrollable diff history */}
        <div className="panel-scroll">
          <div className="p-section" style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="dh-header-row">
              <div className="p-label" style={{ marginBottom: 0 }}>변화탐지 기록</div>
              <div className="dh-header-btns">
                <button
                  className={`split-toggle-btn blink-toggle-btn${blinkMode ? ' active' : ''}`}
                  onClick={onToggleBlinkMode}
                  title={blinkMode ? '점멸 종료' : '추가/제거된 부분을 점멸 표시 (유지 영역 숨김)'}
                >
                  점멸
                </button>
                <button
                  className={`split-toggle-btn${splitMode ? ' active' : ''}`}
                  onClick={onToggleSplitMode}
                  title={splitMode ? '분할 비교 종료' : '두 결과를 나란히 비교'}
                >
                  ◫ 비교
                </button>
              </div>
            </div>
            {splitMode && (
              <div className="split-hint">
                {activeDiffId == null
                  ? '기록에서 항목을 클릭해 A에 지정하세요'
                  : activeDiffIdB == null
                    ? '기록에서 항목을 클릭해 B에 지정하세요'
                    : '두 결과가 비교 중입니다 — 다른 항목을 클릭하면 B가 교체됩니다'}
              </div>
            )}
            <DiffHistory
              entries={diffHistory ?? []}
              activeId={activeDiffId}
              onLoad={splitMode ? onAssignSlot : onLoadDiff}
              onDelete={onDeleteDiff}
              onCancel={onCancelDiff}
              pollingIds={diffPollingIds}
              deletingIds={deletingDiffIds}
              cancellingIds={cancellingDiffIds}
              splitMode={splitMode}
              activeIdB={activeDiffIdB}
            />
          </div>
        </div>
      </>
    )
  }

  // ── COMPUTING VIEW ────────────────────────────────────────────────────────
  // After clicking 분석 실행, the run button is replaced by a status row
  // (spinner + cancel) until the job finishes. The user can start another run
  // without cancelling the current one via "＋ 새 변화탐지". Results only load
  // when you click the entry in 변화탐지 기록.

  function renderComputing() {
    const isAbMode = mode === 'compare-api'

    // Basic validation only — never blocked by "another job is running",
    // since any number of jobs can be in flight at once.
    const canRun = isAbMode
      ? Boolean(apiDateIdA && apiDateIdB && apiDateIdA !== apiDateIdB)
      : dates.length >= 2 && dates.every(d => d.voxelStatus === 'SUCCEEDED')

    function handleRun() {
      if (isAbMode) onApiRun(); else onTlRecompute()
      pendingCapture.current = true
    }

    function handleNewRun() {
      // Start another job without cancelling the current one. The status bar
      // disappears and the form resets, but the old job keeps running in the background.
      setLastJobId(null)
      pendingCapture.current = false
      onDiffName('')
    }

    // Switching analysis method should look the same as starting a fresh
    // computation — no stale "대기 중…" from the mode you're leaving.
    function handleModeSelect(newMode) {
      setLastJobId(null)
      pendingCapture.current = false
      onMode?.(newMode)
    }

    return (
      <>
        {/* Fixed top — project info + back button */}
        <div className="panel-fixed">
          {/* Same project info card as home view */}
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
                      title="Observations 열기"
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

          <div className="p-section" style={{ paddingBottom: 0 }}>
            <button className="back-btn" onClick={onBackToHome}>
              ← 목록으로
            </button>
          </div>
        </div>

        {/* Scrollable form */}
        <div className="panel-scroll">
          <div className="p-section">
            <div className="p-label">분석 이름 <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(선택)</span></div>
            <input
              className="diff-name-input"
              type="text"
              placeholder="예: 2024년 변화탐지"
              value={diffName}
              onChange={e => onDiffName(e.target.value)}
            />
          </div>

          <div className="p-section">
            <div className="p-label">분석 방법</div>
            <select
              className="mode-select"
              value={mode ?? 'compare-api'}
              onChange={e => handleModeSelect(e.target.value)}
            >
              {ANALYSIS_MODES.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          {isAbMode && (
            <div className="p-section">
              <div className="p-label">비교 날짜</div>
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
                <div className="compare-row" style={{ marginTop: 6 }}>
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
                {dates.some(d => d.voxelStatus !== 'SUCCEEDED') && (
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 6 }}>
                    ⚠ voxel 없음 날짜는 관측 데이터 탭에서 먼저 계산하세요
                  </div>
                )}
              </div>
            </div>
          )}

          {isAbMode && (
            <div className="p-section">
              <div className="p-label">분석 영역</div>
              <button id="btn-draw-area" onClick={onDrawArea}>{drawBtnLabel}</button>
              <div id="draw-info" style={{ marginTop: 4 }}>{drawInfo}</div>
            </div>
          )}

          <div className="p-section">
            {lastJobRunning ? (
              <div className="computing-status-block">
                <div className="computing-status-row">
                  <span className="vst-spinner" />
                  <span className="computing-status-label">
                    {lastJobEntry?.status === 'QUEUED' ? '대기 중…' : '분석 중…'}
                  </span>
                  <button
                    className="computing-cancel-btn"
                    onClick={() => onCancelDiff(lastJobId)}
                    disabled={lastJobCancelling}
                  >
                    {lastJobCancelling ? '취소 중' : '취소'}
                  </button>
                </div>
                <button className="new-run-btn" onClick={handleNewRun}>
                  ＋ 새 변화탐지
                </button>
              </div>
            ) : (
              <button
                id="btn-run-diff"
                className="run-diff-btn"
                disabled={!canRun}
                onClick={handleRun}
              >
                ⚡ 분석 실행
              </button>
            )}
            {apiError && (
              <div id="diff-status" data-state="error" style={{ color: 'var(--removed)', marginTop: 6 }}>
                {apiError}
              </div>
            )}
          </div>
        </div>
      </>
    )
  }

  // ── DATES DRAWER ──────────────────────────────────────────────────────────

  function renderDatesDrawer() {
    return (
      <div className="dates-drawer">
        <div className="dates-drawer-header">
          <span className="dates-drawer-title">Observations</span>
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