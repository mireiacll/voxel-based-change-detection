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
          <div className="p-label">Time Series</div>
          <div className="tl-loading">
            <div className="tl-loading-dots"><span /><span /><span /></div>
            Loading diff snapshots…
          </div>
        </div>
      )}

      {/* ── No data ── */}
      {!loading && snapshots?.length === 0 && (
        <div className="p-section">
          <div className="p-label">Time Series</div>
          <div className="tl-empty">
            No pre-computed diffs found for this site.<br />
            Compute diffs in Compare mode and save them, or run:
          </div>
          <button className="pbtn" style={{ marginTop: 8 }} onClick={onRecompute}>
            ⚡ Compute all diffs
          </button>
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
              <span className="tl-legend-dot tl-dot-add" />Added
              <span className="tl-legend-dot tl-dot-rem" style={{ marginLeft: 10 }} />Removed
            </div>
          </div>

          {/* ── Active snapshot stats ── */}
          {active && (
            <div className="p-section">
              <div className="p-label">Selected Period</div>
              <div className="tl-period-header">
                <span className="tl-period-a">{active.date_a.label}</span>
                <span className="tl-period-arrow">→</span>
                <span className="tl-period-b">{active.date_b.label}</span>
              </div>

              <div id="stats-box" style={{ marginTop: 8 }}>
                <div className="stat-row">
                  <span className="stat-k">Added</span>
                  <span className="stat-v" style={{ color: 'var(--added)' }}>
                    {fmt(active.stats.added_count, active.vox_size)}
                  </span>
                </div>
                <div className="stat-row">
                  <span className="stat-k">Removed</span>
                  <span className="stat-v" style={{ color: 'var(--removed)' }}>
                    {fmt(active.stats.removed_count, active.vox_size)}
                  </span>
                </div>
                <div className="stat-row" style={{ borderTop: '1px solid var(--border)', marginTop: 4, paddingTop: 6 }}>
                  <span className="stat-k">Net</span>
                  <span className="stat-v" style={{ color: active.stats.net >= 0 ? 'var(--added)' : 'var(--removed)' }}>
                    {active.stats.net >= 0 ? '+' : ''}
                    {fmt(Math.abs(active.stats.net), active.vox_size)}
                  </span>
                </div>
                <div className="stat-row">
                  <span className="stat-k">Voxel size</span>
                  <span className="stat-v" style={{ fontSize: 10, color: 'var(--muted)' }}>
                    {active.vox_size} m
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* ── Visibility toggles ── */}
          <div className="p-section">
            <div className="p-label">Visibility</div>
            <div className="layer-row">
              <Toggle id="tl-chk-added" checked={showAdded} onChange={onShowAdded} />
              <div className="layer-body">
                <div className="layer-name">Volume Added</div>
                <div className="layer-type">Voxels gained in this period</div>
              </div>
              <span className="ltag" style={{ background: '#2a1010', color: 'var(--added)' }}>ADD</span>
            </div>
            <div className="layer-row">
              <Toggle id="tl-chk-removed" checked={showRemoved} onChange={onShowRemoved} />
              <div className="layer-body">
                <div className="layer-name">Volume Removed</div>
                <div className="layer-type">Voxels lost in this period</div>
              </div>
              <span className="ltag" style={{ background: '#10162a', color: 'var(--removed)' }}>REM</span>
            </div>
          </div>

          {/* ── Playback controls (mirrored from bar for discoverability) ── */}
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
              Keyboard: ← → to step · Space to play/pause
            </div>
          </div>

          {/* ── Recompute stub ── */}
          <div className="p-section">
            <div className="p-label">Data</div>
            <div className="tl-data-note">
              {snapshots.length} pre-computed diff{snapshots.length !== 1 ? 's' : ''} loaded
              {snapshots[0]?._dummy ? ' (dummy data)' : ''}
            </div>
            <button className="pbtn" style={{ marginTop: 6, width: '100%' }} onClick={onRecompute}>
              ⚡ Recompute all diffs
            </button>
          </div>
        </>
      )}
    </>
  )
}