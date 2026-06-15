/**
 * TimelinePanel.jsx
 *
 * Left-panel section shown when mode === 'timeline'.
 * Shows:
 *  · Loading state while snapshots fetch
 *  · "No diffs yet" state with compute button (or cancel during computation)
 *  · Mini bar chart of added/removed per snapshot
 *  · Visibility toggles (added / removed / unchanged)
 *  · Stats for the active snapshot (volumes from mass-summary last level)
 *  · "Recompute all diffs" button
 *
 * Props
 * ─────
 *   snapshots          — Snapshot[] | null
 *   activeIndex        — number
 *   onSelect           — (i) => void
 *   showAdded          — bool
 *   onShowAdded        — (bool) => void
 *   showRemoved        — bool
 *   onShowRemoved      — (bool) => void
 *   showUnchanged      — bool
 *   onShowUnchanged    — (bool) => void
 *   playing            — bool
 *   onPlayPause        — () => void
 *   onRecompute        — () => void
 *   loading            — bool
 *   tlRecomputeRunning — bool    (true while createTimeSeriesDiffAndPoll is in flight)
 *   tlRecomputeStatus  — string  (status message during recompute)
 *   onCancelRecompute  — () => void
 *   stale              — bool    (loaded snapshots don't match current voxelized date count)
 *   missingVoxels      — string[] (labels of dates that still lack a SUCCEEDED voxel)
 */

function Toggle({ id, checked, onChange }) {
  return (
    <label className="sw">
      <input type="checkbox" id={id} checked={checked}
             onChange={e => onChange(e.target.checked)} />
      <span />
    </label>
  )
}

function fmtVol(m3) {
  if (m3 == null || isNaN(m3)) return '—'
  const abs = Math.abs(m3)
  if (abs >= 1_000_000) return `${(m3 / 1_000_000).toFixed(3)} Mm³`
  if (abs >= 1_000)    return `${(m3 / 1_000).toFixed(2)}k m³`
  return `${m3.toFixed(1)} m³`
}

function fmtVoxSize(voxSize, avgVoxVol) {
  // Prefer a derived edge-length from the actual average voxel volume
  if (avgVoxVol != null && avgVoxVol > 0) {
    const edge = Math.cbrt(avgVoxVol)
    return `${edge.toFixed(3)} m`
  }
  if (voxSize != null) return `${voxSize} m`
  return '—'
}

// Mini bar chart — one bar pair per snapshot
function MiniChart({ snapshots, activeIndex, onSelect }) {
  if (!snapshots?.length) return null

  const maxVal = Math.max(...snapshots.flatMap(s => [
    s.stats?.added_count ?? 0,
    s.stats?.removed_count ?? 0,
  ]), 1)

  return (
    <div className="tl-chart">
      {snapshots.map((s, i) => {
        const addH    = ((s.stats?.added_count   ?? 0) / maxVal) * 100
        const remH    = ((s.stats?.removed_count ?? 0) / maxVal) * 100
        const isActive = i === activeIndex
        return (
          <button
            key={s.id}
            className={`tl-bar-group${isActive ? ' tl-bar-active' : ''}`}
            onClick={() => onSelect(i)}
            title={s.stats
              ? `${s.date_a.label} → ${s.date_b.label}\n+${s.stats.added_count} / −${s.stats.removed_count}`
              : `${s.date_a.label} → ${s.date_b.label}`}
          >
            <div className="tl-bar-pair">
              <div className="tl-bar tl-bar-rem" style={{ height: `${remH}%` }} />
              <div className="tl-bar tl-bar-add" style={{ height: `${addH}%` }} />
            </div>
            <div className="tl-bar-lbl">
              {s.date_b.label.replace(/, \d{4}/, '')}
            </div>
          </button>
        )
      })}
    </div>
  )
}

export default function TimelinePanel({
  snapshots, activeIndex, onSelect,
  showAdded, onShowAdded,
  showRemoved, onShowRemoved,
  showUnchanged, onShowUnchanged,
  playing, onPlayPause,
  onRecompute, loading,
  tlRecomputeRunning, tlRecomputeStatus, onCancelRecompute,
  stale, staleInfo, missingVoxels,
}) {
  const active = snapshots?.[activeIndex] ?? null

  return (
    <>
      {/* ── Missing voxels warning ── */}
      {missingVoxels?.length > 0 && !loading && (
        <div className="p-section">
          <div className="tl-warn-banner tl-warn-voxel">
            <div className="tl-warn-icon">⚠</div>
            <div className="tl-warn-body">
              <div className="tl-warn-title">Voxel 미완료 날짜 있음</div>
              <div className="tl-warn-detail">
                시계열 분석 전에 아래 날짜의 Voxel을 먼저 계산하세요
                (왼쪽 패널 → Voxel Calculation):
              </div>
              <ul className="tl-warn-list">
                {missingVoxels.map(lbl => (
                  <li key={lbl}>{lbl}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* ── Stale snapshots warning ── */}
      {stale && !loading && (
        <div className="p-section">
          <div className="tl-warn-banner tl-warn-stale">
            <div className="tl-warn-icon">🔄</div>
            <div className="tl-warn-body">
              <div className="tl-warn-title">관측 데이터 변경됨 — 재계산 필요</div>

              {/* Added dates */}
              {staleInfo?.addedLabels?.length > 0 && (
                <div className="tl-warn-detail" style={{ marginTop: 4 }}>
                  <span style={{ color: 'var(--added)' }}>＋ 새로 추가된 날짜</span> ({staleInfo.addedLabels.length}개):
                  <ul className="tl-warn-list">
                    {staleInfo.addedLabels.map(lbl => <li key={lbl}>{lbl}</li>)}
                  </ul>
                </div>
              )}

              {/* Removed dates */}
              {staleInfo?.removedLabels?.length > 0 && (
                <div className="tl-warn-detail" style={{ marginTop: 4 }}>
                  <span style={{ color: 'var(--removed)' }}>－ 삭제된 날짜</span> ({staleInfo.removedLabels.length}개):
                  <ul className="tl-warn-list">
                    {staleInfo.removedLabels.map(lbl => <li key={lbl}>{lbl}</li>)}
                  </ul>
                </div>
              )}

              {/* Fallback if staleInfo wasn't passed (shouldn't happen) */}
              {(!staleInfo?.addedLabels?.length && !staleInfo?.removedLabels?.length) && (
                <div className="tl-warn-detail">
                  Voxel이 완료된 날짜 수와 현재 스냅샷 수가 맞지 않습니다.
                  정확한 분석을 위해 전체 재계산을 권장합니다.
                </div>
              )}

              <button
                className="pbtn"
                style={{ marginTop: 6, width: '100%', fontSize: 11 }}
                onClick={onRecompute}
                disabled={tlRecomputeRunning || (missingVoxels?.length > 0)}
              >
                ⚡ 전체 재계산
              </button>
              {missingVoxels?.length > 0 && (
                <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>
                  Voxel 미완료 날짜를 먼저 계산하세요
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Initial loading ── */}
      {loading && (
        <div className="p-section">
          <div className="p-label">시계열 변화탐지</div>
          <div className="tl-loading">
            <div className="tl-loading-dots"><span /><span /><span /></div>
            변화 스냅샷 불러오는 중…
          </div>
        </div>
      )}

      {/* ── No data: compute or show running state ── */}
      {!loading && snapshots?.length === 0 && (
        <div className="p-section">
          <div className="p-label">시계열 변화탐지</div>

          {tlRecomputeRunning ? (
            <>
              <div className="tl-loading">
                <div className="tl-loading-dots"><span /><span /><span /></div>
                {tlRecomputeStatus || '분석 중…'}
              </div>
              <button
                className="pbtn"
                style={{ marginTop: 8, width: '100%', color: 'var(--removed)' }}
                onClick={onCancelRecompute}
              >
                ✕ 취소
              </button>
            </>
          ) : (
            <>
              <div className="tl-empty">
                사전 계산된 변화 데이터가 없습니다.<br />
                아래 버튼을 눌러 시계열 diff를 계산하세요.
              </div>
              <button className="pbtn" style={{ marginTop: 8, width: '100%' }} onClick={onRecompute}>
                ⚡ 전체 계산
              </button>
            </>
          )}
        </div>
      )}

      {/* ── Has data ── */}
      {!loading && snapshots?.length > 0 && (
        <>
          {/* ── Mini chart ── */}
          <div className="p-section">
            <div className="p-label">Change Over Time</div>
            <MiniChart snapshots={snapshots} activeIndex={activeIndex} onSelect={onSelect} />
            <div className="tl-chart-legend">
              <span className="tl-legend-dot tl-dot-add" />추가
              <span className="tl-legend-dot tl-dot-rem" style={{ marginLeft: 10 }} />제거
            </div>
          </div>

          {/* ── Active snapshot stats ── */}
          {active && active.stats && (
            <div className="p-section">
              <div className="p-label">Selected Period</div>
              <div className="tl-period-header">
                <span style={{ color: 'var(--text)' }}>{active.date_a.label}</span>
                <span className="tl-period-arrow">→</span>
                <span style={{ color: 'var(--text)' }}>{active.date_b.label}</span>
              </div>

              <div id="stats-box" style={{ marginTop: 8 }}>
                <div className="stat-row">
                  <span className="stat-k">추가</span>
                  <span className="stat-v" style={{ color: 'var(--added)' }}>
                    {active.stats.added_vol != null
                      ? fmtVol(active.stats.added_vol)
                      : fmtVol(active.stats.added_count * (active.avg_vox_vol ?? 0))}
                  </span>
                </div>
                <div className="stat-row">
                  <span className="stat-k">제거</span>
                  <span className="stat-v" style={{ color: 'var(--removed)' }}>
                    {active.stats.removed_vol != null
                      ? fmtVol(active.stats.removed_vol)
                      : fmtVol(active.stats.removed_count * (active.avg_vox_vol ?? 0))}
                  </span>
                </div>
                <div className="stat-row" style={{ borderTop: '1px solid var(--border)', marginTop: 4, paddingTop: 6 }}>
                  <span className="stat-k">순 변화</span>
                  {(() => {
                    const net = active.stats.added_vol != null
                      ? (active.stats.added_vol - (active.stats.removed_vol ?? 0))
                      : active.stats.net * (active.avg_vox_vol ?? 0)
                    return (
                      <span className="stat-v" style={{ color: net >= 0 ? 'var(--added)' : 'var(--removed)' }}>
                        {net >= 0 ? '+' : ''}{fmtVol(Math.abs(net))}
                      </span>
                    )
                  })()}
                </div>
                <div className="stat-row">
                  <span className="stat-k">복셀 크기</span>
                  <span className="stat-v" style={{ fontSize: 10, color: 'var(--muted)' }}>
                    {fmtVoxSize(active.vox_size, active.avg_vox_vol)}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Active snapshot period header (shown even without stats) */}
          {active && !active.stats && (
            <div className="p-section">
              <div className="p-label">Selected Period</div>
              <div className="tl-period-header">
                <span style={{ color: 'var(--text)' }}>{active.date_a.label}</span>
                <span className="tl-period-arrow">→</span>
                <span style={{ color: 'var(--text)' }}>{active.date_b.label}</span>
              </div>
              <div className="tl-data-note" style={{ marginTop: 6 }}>
                통계 없음 — 사전 계산된 타일셋
              </div>
            </div>
          )}

          {/* ── Visibility toggles ── */}
          <div className="p-section">
            <div className="p-label">Visibility</div>
            <div className="layer-row">
              <Toggle id="tl-chk-added" checked={showAdded} onChange={onShowAdded} />
              <div className="layer-body">
                <div className="layer-name">추가된 부피</div>
                <div className="layer-type">B 존재, A 부재</div>
              </div>
              <span className="ltag" style={{ background: '#2a1010', color: 'var(--added)' }}>ADD</span>
            </div>
            <div className="layer-row">
              <Toggle id="tl-chk-removed" checked={showRemoved} onChange={onShowRemoved} />
              <div className="layer-body">
                <div className="layer-name">제거된 부피</div>
                <div className="layer-type">A 존재, B 부재</div>
              </div>
              <span className="ltag" style={{ background: '#10162a', color: 'var(--removed)' }}>REM</span>
            </div>
            <div className="layer-row">
              <Toggle id="tl-chk-unchanged" checked={showUnchanged} onChange={onShowUnchanged} />
              <div className="layer-body">
                <div className="layer-name">유지된 부피</div>
                <div className="layer-type">A·B 모두 존재</div>
              </div>
              <span className="ltag" style={{ background: '#1a1a1a', color: '#a0a0a0' }}>VOX</span>
            </div>
          </div>

          {/* ── Playback controls ── */}
          <div className="p-section">
            <div className="p-label">Playback</div>
            <div className="btn-row">
              <button className="pbtn" onClick={() => onSelect(Math.max(0, activeIndex - 1))} disabled={activeIndex === 0}>
                ‹ Prev
              </button>
              <button className={`pbtn${playing ? ' active' : ''}`} onClick={onPlayPause}>
                {playing ? '⏸ Pause' : '▶ Play'}
              </button>
              <button className="pbtn" onClick={() => onSelect(Math.min(snapshots.length - 1, activeIndex + 1))} disabled={activeIndex === snapshots.length - 1}>
                Next ›
              </button>
            </div>
            <div className="tl-play-hint">
              단축키: ← → 이동 · Space 재생/정지
            </div>
          </div>

          {/* ── Recompute ── */}
          <div className="p-section">
            <div className="p-label">Data</div>
            <div className="tl-data-note">
              {snapshots.length}개 스냅샷 로드됨
            </div>
            {tlRecomputeRunning ? (
              <>
                <div className="tl-loading" style={{ marginTop: 6 }}>
                  <div className="tl-loading-dots"><span /><span /><span /></div>
                  {tlRecomputeStatus || '분석 중…'}
                </div>
                <button
                  className="pbtn"
                  style={{ marginTop: 6, width: '100%', color: 'var(--removed)' }}
                  onClick={onCancelRecompute}
                >
                  ✕ 취소
                </button>
              </>
            ) : !stale && (
              <button className="pbtn" style={{ marginTop: 6, width: '100%' }} onClick={onRecompute}>
                ⚡ 전체 재계산
              </button>
            )}
          </div>
        </>
      )}
    </>
  )
}