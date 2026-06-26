/**
 * TimelinePanel.jsx
 *
 * Right-panel content for timeline mode. Shows a mini bar chart,
 * stats for the active snapshot, visibility toggles, and playback controls.
 *
 * Props:
 *   snapshots       — Snapshot[] | null
 *   activeIndex     — number
 *   onSelect        — (i) => void
 *   showAdded       — bool
 *   onShowAdded     — (bool) => void
 *   showRemoved     — bool
 *   onShowRemoved   — (bool) => void
 *   showUnchanged   — bool
 *   onShowUnchanged — (bool) => void
 *   playing         — bool
 *   onPlayPause     — () => void
 *   loading         — bool
 */

function Toggle({ id, checked, onChange }) {
  return (
    <label className="sw">
      <input type="checkbox" id={id} checked={checked} onChange={e => onChange(e.target.checked)} />
      <span />
    </label>
  )
}

function fmtVol(m3) {
  if (m3 == null || isNaN(m3)) return '—'
  const abs = Math.abs(m3)
  if (abs >= 1_000_000) return `${(m3 / 1_000_000).toFixed(3)} Mm³`
  if (abs >= 1_000)     return `${(m3 / 1_000).toFixed(2)}k m³`
  return `${m3.toFixed(1)} m³`
}

function fmtCount(n) {
  if (n == null || isNaN(n)) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

function fmtVoxSize(voxSize, avgVoxVol) {
  if (avgVoxVol != null && avgVoxVol > 0) return `${Math.cbrt(avgVoxVol).toFixed(3)} m`
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
            <div className="tl-bar-lbl">{s.date_b.label.replace(/, \d{4}/, '')}</div>
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
  loading,
}) {
  const active = snapshots?.[activeIndex] ?? null

  return (
    <>
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

      {/* ── No data ── */}
      {!loading && snapshots?.length === 0 && (
        <div className="p-section">
          <div className="p-label">시계열 변화탐지</div>
          <div className="tl-empty">사전 계산된 변화 데이터가 없습니다.</div>
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
                {active.stats.added_count != null && (
                  <div className="stat-row" style={{ marginTop: -2 }}>
                    <span className="stat-k" style={{ fontSize: 10, color: 'var(--muted)' }}>추가 복셀 수</span>
                    <span className="stat-v" style={{ fontSize: 10, color: 'var(--added)' }}>{fmtCount(active.stats.added_count)}</span>
                  </div>
                )}
                <div className="stat-row">
                  <span className="stat-k">제거</span>
                  <span className="stat-v" style={{ color: 'var(--removed)' }}>
                    {active.stats.removed_vol != null
                      ? fmtVol(active.stats.removed_vol)
                      : fmtVol(active.stats.removed_count * (active.avg_vox_vol ?? 0))}
                  </span>
                </div>
                {active.stats.removed_count != null && (
                  <div className="stat-row" style={{ marginTop: -2 }}>
                    <span className="stat-k" style={{ fontSize: 10, color: 'var(--muted)' }}>제거 복셀 수</span>
                    <span className="stat-v" style={{ fontSize: 10, color: 'var(--removed)' }}>{fmtCount(active.stats.removed_count)}</span>
                  </div>
                )}
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
              <div className="tl-data-note" style={{ marginTop: 6 }}>통계 없음 — 사전 계산된 타일셋</div>
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
              <button className="pbtn" onClick={() => onSelect(Math.max(0, activeIndex - 1))} disabled={activeIndex === 0}>‹ Prev</button>
              <button className={`pbtn${playing ? ' active' : ''}`} onClick={onPlayPause}>{playing ? '⏸ Pause' : '▶ Play'}</button>
              <button className="pbtn" onClick={() => onSelect(Math.min(snapshots.length - 1, activeIndex + 1))} disabled={activeIndex === snapshots.length - 1}>Next ›</button>
            </div>
            <div className="tl-play-hint">단축키: ← → 이동 · Space 재생/정지</div>
          </div>
        </>
      )}
    </>
  )
}