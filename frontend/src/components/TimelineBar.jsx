/**
 * TimelinePanel.jsx
 *
 * Left-panel section shown when mode === 'timeline'.
 * Shows:
 *  · Loading state while snapshots fetch
 *  · Mini bar chart of added/removed per snapshot
 *  · Visibility toggles (added / removed)
 *  · Voxel size indicator (read-only — pre-computed)
 *  · "Recompute all diffs" button (stub — calls onRecompute)
 *
 * Props
 * ─────
 *   snapshots      — Snapshot[] | null
 *   activeIndex    — number
 *   onSelect       — (i) => void
 *   showAdded      — bool
 *   onShowAdded    — (bool) => void
 *   showRemoved    — bool
 *   onShowRemoved  — (bool) => void
 *   playing        — bool
 *   onPlayPause    — () => void
 *   onRecompute    — () => void    (stub for now)
 *   loading        — bool
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

function fmt(n, voxSize) {
  const m3 = n * (voxSize ?? 0.5) ** 3
  return m3 < 10000 ? `${m3.toFixed(0)} m³` : `${(m3 / 1000).toFixed(1)}k m³`
}

// Mini bar chart — one bar pair per snapshot
function MiniChart({ snapshots, activeIndex, onSelect }) {
  if (!snapshots?.length) return null

  const maxVal = Math.max(...snapshots.flatMap(s => [s.stats.added_count, s.stats.removed_count]), 1)

  return (
    <div className="tl-chart">
      {snapshots.map((s, i) => {
        const addH   = (s.stats.added_count   / maxVal) * 100
        const remH   = (s.stats.removed_count / maxVal) * 100
        const isActive = i === activeIndex
        return (
          <button
            key={s.id}
            className={`tl-bar-group${isActive ? ' tl-bar-active' : ''}`}
            onClick={() => onSelect(i)}
            title={`${s.date_a.label} → ${s.date_b.label}\n+${s.stats.added_count} / −${s.stats.removed_count}`}
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
  playing, onPlayPause,
  onRecompute, loading,
}) {
  const active = snapshots?.[activeIndex] ?? null

  return (
    <>
      {/* ── Loading ── */}
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
          <div className="tl-empty">
            사전 계산된 변화 데이터가 없습니다.<br />
            비교 모드에서 차이를 계산하거나 아래 버튼을 실행하세요.
          </div>
          <button className="pbtn" style={{ marginTop: 8 }} onClick={onRecompute}>
            ⚡ 전체 계산
          </button>
        </div>
      )}

      {/* ── Has data ── */}
      {!loading && snapshots?.length > 0 && (
        <>
          {/* ── Mini chart ── */}
          <div className="p-section">
            <div className="p-label">시간별 변화</div>
            <MiniChart snapshots={snapshots} activeIndex={activeIndex} onSelect={onSelect} />
            <div className="tl-chart-legend">
              <span className="tl-legend-dot tl-dot-add" />추가
              <span className="tl-legend-dot tl-dot-rem" style={{ marginLeft: 10 }} />제거
            </div>
          </div>

          {/* ── Active snapshot stats ── */}
          {active && (
            <div className="p-section">
              <div className="p-label">선택 구간</div>
              <div className="tl-period-header">
                <span style={{ color: 'var(--text)' }}>{active.date_a.label}</span>
                <span className="tl-period-arrow">→</span>
                <span style={{ color: 'var(--text)' }}>{active.date_b.label}</span>
              </div>

              <div id="stats-box" style={{ marginTop: 8 }}>
                <div className="stat-row">
                  <span className="stat-k">추가</span>
                  <span className="stat-v" style={{ color: 'var(--added)' }}>
                    {fmt(active.stats.added_count, active.vox_size)}
                  </span>
                </div>
                <div className="stat-row">
                  <span className="stat-k">제거</span>
                  <span className="stat-v" style={{ color: 'var(--removed)' }}>
                    {fmt(active.stats.removed_count, active.vox_size)}
                  </span>
                </div>
                <div className="stat-row" style={{ borderTop: '1px solid var(--border)', marginTop: 4, paddingTop: 6 }}>
                  <span className="stat-k">순 변화</span>
                  <span className="stat-v" style={{ color: active.stats.net >= 0 ? 'var(--added)' : 'var(--removed)' }}>
                    {active.stats.net >= 0 ? '+' : ''}
                    {fmt(Math.abs(active.stats.net), active.vox_size)}
                  </span>
                </div>
                <div className="stat-row">
                  <span className="stat-k">복셀 크기</span>
                  <span className="stat-v" style={{ fontSize: 10, color: 'var(--muted)' }}>
                    {active.vox_size} m
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* ── Visibility toggles ── */}
          <div className="p-section">
            <div className="p-label">가시성</div>
            <div className="layer-row">
              <Toggle id="tl-chk-added" checked={showAdded} onChange={onShowAdded} />
              <div className="layer-body">
                <div className="layer-name">추가된 부피</div>
                <div className="layer-type">해당 기간 증가한 복셀</div>
              </div>
              <span className="ltag" style={{ background: '#2a1010', color: 'var(--added)' }}>ADD</span>
            </div>
            <div className="layer-row">
              <Toggle id="tl-chk-removed" checked={showRemoved} onChange={onShowRemoved} />
              <div className="layer-body">
                <div className="layer-name">제거된 부피</div>
                <div className="layer-type">해당 기간 감소한 복셀</div>
              </div>
              <span className="ltag" style={{ background: '#10162a', color: 'var(--removed)' }}>REM</span>
            </div>
          </div>

          {/* ── Playback controls ── */}
          <div className="p-section">
            <div className="p-label">재생</div>
            <div className="btn-row">
              <button className="pbtn" onClick={() => onSelect(Math.max(0, activeIndex - 1))} disabled={activeIndex === 0}>
                ‹ Prev
              </button>
              <button className={`pbtn${playing ? ' active' : ''}`} onClick={onPlayPause}>
                {playing ? '⏸ 정지' : '▶ 재생'}
              </button>
              <button className="pbtn" onClick={() => onSelect(Math.min(snapshots.length - 1, activeIndex + 1))} disabled={activeIndex === snapshots.length - 1}>
                Next ›
              </button>
            </div>
            <div className="tl-play-hint">
              단축키: ← → 이동 · Space 재생/정지
            </div>
          </div>

          {/* ── Recompute stub ── */}
          <div className="p-section">
            <div className="p-label">데이터</div>
            <div className="tl-data-note">
              {snapshots.length}개 사전 계산된 변화 로드됨
              {snapshots[0]?._dummy ? ' (더미 데이터)' : ''}
            </div>
            <button className="pbtn" style={{ marginTop: 6, width: '100%' }} onClick={onRecompute}>
              ⚡ 전체 재계산
            </button>
          </div>
        </>
      )}
    </>
  )
}