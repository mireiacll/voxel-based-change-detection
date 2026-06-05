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

export default function RightPanel({
  mode,
  activeSite,
  // compare-only props (날짜 비교 + 분석 설정)
  compareIdA, onCompareIdA,
  compareIdB, onCompareIdB,
  colorA, onColorA, alphaA, onAlphaA,
  colorB, onColorB, alphaB, onAlphaB,
  drawInfo, drawBtnLabel, onDrawArea,
  voxelSize, onVoxelSize,
  diffRunning, onRunDiff, onClearDiff,
  diffStatus,
  // 분석 결과 props
  showAdded, onShowAdded,
  showRemoved, onShowRemoved,
  stats,
  // timeline props
  tlSnapshots, tlActiveIndex, tlOnSelect,
  tlPlaying, tlOnPlayPause,
  tlLoading, tlOnRecompute,
}) {
  const dates      = activeSite?.dates ?? []
  const inCompare  = mode === 'compare'
  const inTimeline = mode === 'timeline'

  const netM3 = stats ? (stats.added - stats.removed) * stats.voxSize ** 3 : 0

  return (
    <aside id="right-panel">

      {/* ── 날짜 비교 + 분석 설정 — compare mode only ── */}
      {inCompare && (
        <>
          {/* 날짜 비교 */}
          <div className="p-section">
            <div className="p-label">날짜 비교</div>
            <div className="compare-pair">

              <div className="compare-row">
                <span className="compare-dot" style={{ background: colorA }} />
                <span className="compare-ab-lbl">A</span>
                <select value={compareIdA} onChange={e => onCompareIdA(e.target.value)}>
                  <option value="">— 날짜 선택 —</option>
                  {dates.map(d => (
                    <option key={d.id} value={d.id}>{d.label} ({d.id})</option>
                  ))}
                </select>
                <input type="color" value={colorA} onChange={e => onColorA(e.target.value)}
                  className="dataset-color" title="색상 A" />
              </div>
              <div className="sub-row dataset-opacity">
                <span className="sub-label">투명도</span>
                <input type="range" min="0" max="1" step="0.05"
                  value={alphaA} onChange={e => onAlphaA(parseFloat(e.target.value))} />
                <span className="sub-val">{alphaA.toFixed(2)}</span>
              </div>

              <div className="compare-row" style={{ marginTop: 8 }}>
                <span className="compare-dot" style={{ background: colorB }} />
                <span className="compare-ab-lbl">B</span>
                <select value={compareIdB} onChange={e => onCompareIdB(e.target.value)}>
                  <option value="">— 날짜 선택 —</option>
                  {dates.map(d => (
                    <option key={d.id} value={d.id}>{d.label} ({d.id})</option>
                  ))}
                </select>
                <input type="color" value={colorB} onChange={e => onColorB(e.target.value)}
                  className="dataset-color" title="색상 B" />
              </div>
              <div className="sub-row dataset-opacity">
                <span className="sub-label">투명도</span>
                <input type="range" min="0" max="1" step="0.05"
                  value={alphaB} onChange={e => onAlphaB(parseFloat(e.target.value))} />
                <span className="sub-val">{alphaB.toFixed(2)}</span>
              </div>

            </div>
          </div>

          {/* 분석 설정 */}
          <div className="p-section">
            <div className="p-label">분석 설정</div>

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
              <button id="btn-clear-diff"
                style={diffRunning ? { borderColor: '#d49050', color: '#d49050' } : {}}
                onClick={onClearDiff}>
                {diffRunning ? '⏹ 중지' : '✖ 초기화'}
              </button>
            </div>

            <div id="diff-status" data-state={diffStatus.state}>{diffStatus.msg}</div>
          </div>
        </>
      )}

      {/* ── 분석 결과 ── */}
      <div className="p-section">
        <div className="p-label">분석 결과</div>

        {inCompare && (
          <>
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