/**
 * RightPanel.jsx — RIGHT sidebar (analysis view only)
 *
 * · Date list — each row is a toggle: clicking shows/hides that date's layer
 *   (multiple can be visible at once, like the old date-btn list)
 * · C. 분석 결과 — switches content based on mode:
 *     'compare'  → diff stats (added / removed / net / resolution)
 *     'timeline' → TimelinePanel mini chart + period stats + playback
 */

import TimelinePanel from './TimelinePanel'

function fmt(n, voxSize) {
  const m3 = n * voxSize ** 3
  return m3 < 10000 ? `${m3.toFixed(1)} m³` : `${(m3 / 1000).toFixed(2)}k m³`
}

function TypeTag({ type }) {
  if (!type) return null
  return (
    <span className={`date-type-tag ${type === 'mesh' ? 'ltag-amber' : 'ltag-purple'}`}>
      {type === 'mesh' ? '3DT' : 'PC'}
    </span>
  )
}

export default function RightPanel({
  mode,
  activeSite,
  // visibleDateIds: Set of date ids currently toggled ON
  visibleDateIds, onToggleDate,
  showAdded, onShowAdded,
  showRemoved, onShowRemoved,
  stats,
  // timeline props
  tlSnapshots, tlActiveIndex, tlOnSelect,
  tlPlaying, tlOnPlayPause,
  tlLoading, tlOnRecompute,
}) {
  const dates = activeSite?.dates ?? []
  const inCompare  = mode === 'compare'
  const inTimeline = mode === 'timeline'

  const netM3 = stats ? (stats.added - stats.removed) * stats.voxSize ** 3 : 0

  return (
    <aside id="right-panel">

      {/* ── A. 관측 데이터 ── */}
      <div className="p-section">
        <div className="p-label">관측 데이터</div>
        <div id="date-list" className="rp-date-list">
          {dates.length === 0 && (
            <div className="no-dates">날짜 없음 — 데이터 업로드 탭에서 추가하세요</div>
          )}
          {dates.map(d => {
            const isOn = visibleDateIds.has(d.id)
            return (
              <button
                key={d.id}
                className={`date-btn${isOn ? ' active' : ''}`}
                onClick={() => onToggleDate(d)}
              >
                <span className="date-label">{d.label}</span>
                <span className="date-id">{d.id}</span>
                <TypeTag type={d.datasetType} />
              </button>
            )
          })}
        </div>
      </div>

      {/* ── C. 분석 결과 ── */}
      <div className="p-section">
        <div className="p-label">분석 결과</div>

        {/* ── Compare results ── */}
        {inCompare && (
          <>
            {/* Added / Removed voxel visibility toggles */}
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
              {!stats && (
                <div id="stats-note">날짜를 선택하고 차이를 계산하세요</div>
              )}
            </div>
          </>
        )}

        {/* ── Timeline results ── */}
        {inTimeline && (
          <TimelinePanel
            snapshots={tlSnapshots}
            activeIndex={tlActiveIndex}
            onSelect={tlOnSelect}
            showAdded={showAdded}
            onShowAdded={onShowAdded}
            showRemoved={showRemoved}
            onShowRemoved={onShowRemoved}
            playing={tlPlaying}
            onPlayPause={tlOnPlayPause}
            loading={tlLoading}
            onRecompute={tlOnRecompute}
          />
        )}
      </div>

    </aside>
  )
}