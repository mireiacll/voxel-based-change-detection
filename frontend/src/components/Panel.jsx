/**
 * Panel.jsx — left sidebar for the Analysis view
 * Z offset controls removed (handled via DB only).
 * Single dataset per date — no separate mesh/PC toggles in Compare.
 */

import { useState } from 'react'
import TimelinePanel from './TimelinePanel'

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
  const m3 = n * voxSize ** 3
  return m3 < 10000 ? `${m3.toFixed(1)} m³` : `${(m3 / 1000).toFixed(2)}k m³`
}

export default function Panel({
  mode, onModeChange,
  activeSite, activeDate, onDateChange,
  showDataset, onShowDataset,
  pcSize,   onPcSize,
  showTerrain, onShowTerrain,
  compareIdA, onCompareIdA,
  compareIdB, onCompareIdB,
  showDateA, onShowDateA,
  showDateB, onShowDateB,
  colorA, onColorA, alphaA, onAlphaA,
  colorB, onColorB, alphaB, onAlphaB,
  showAdded,   onShowAdded,
  showRemoved, onShowRemoved,
  voxelSize,   onVoxelSize,
  drawInfo, drawBtnLabel, onDrawArea,
  diffRunning, onRunDiff, onClearDiff,
  diffStatus, stats,
  onCameraSite, onCameraTop,
  tlSnapshots, tlActiveIndex, tlOnSelect,
  tlPlaying,   tlOnPlayPause,
  tlLoading,   tlOnRecompute,
}) {
  const inView     = mode === 'view'
  const inCompare  = mode === 'compare'
  const inTimeline = mode === 'timeline'

  const netM3 = stats ? (stats.added - stats.removed) * stats.voxSize ** 3 : 0

  const currentType = activeDate?.datasetType
  const isPointCloud = currentType === 'pointcloud'
  const isMesh = currentType === 'mesh'

  return (
    <aside id="panel">

      {/* ── Mode switcher ── */}
      <div id="mode-bar">
        <button className={`mode-btn${inView     ? ' active' : ''}`} onClick={() => onModeChange('view')}>View</button>
        <button className={`mode-btn${inCompare  ? ' active' : ''}`} onClick={() => onModeChange('compare')}>Compare</button>
        <button className={`mode-btn${inTimeline ? ' active' : ''}`} onClick={() => onModeChange('timeline')}>Timeline</button>
      </div>

      {/* ══════════════════ VIEW MODE ══════════════════ */}
      <div className={`p-section${!inView ? ' hidden' : ''}`} id="section-dates">
        <div className="p-label">Survey Date</div>
        <div id="date-list">
          {activeSite.dates.length === 0
            ? <div className="no-dates">날짜 없음 — 데이터 업로드 탭에서 추가하세요</div>
            : activeSite.dates.map(d => (
                <button
                  key={d.id}
                  className={`date-btn${d.id === activeDate?.id ? ' active' : ''}`}
                  onClick={() => onDateChange(d)}
                >
                  <span className="date-label">{d.label}</span>
                  <span className="date-id">{d.id}</span>
                  {d.datasetType && (
                    <span className={`date-type-tag ${d.datasetType === 'mesh' ? 'ltag-amber' : 'ltag-purple'}`}>
                      {d.datasetType === 'mesh' ? '3DT' : 'PC'}
                    </span>
                  )}
                </button>
              ))
          }
        </div>
      </div>

      <div className={`p-section${!inView ? ' hidden' : ''}`} id="section-layers">
        <div className="p-label">Layers</div>
        <div className="layer-row">
          <Toggle id="chk-dataset" checked={showDataset} onChange={onShowDataset} />
          <div className="layer-body">
            <div className="layer-name">3D Tiles</div>
            <div className="layer-type">3D Tiles</div>
          </div>
          <span className={`ltag ${isMesh ? 'ltag-amber' : 'ltag-purple'}`}>{isMesh ? '3DT' : 'PC'}</span>
        </div>
        {isPointCloud && (
          <div className="sub-row">
            <span className="sub-label">Size</span>
            <input type="range" id="sl-pc-size" min="1" max="20" step="0.5"
              value={pcSize} onChange={e => onPcSize(parseFloat(e.target.value))} />
            <span className="sub-val">{pcSize}</span>
          </div>
        )}
        <div className="layer-row">
          <Toggle id="chk-terrain" checked={showTerrain} onChange={onShowTerrain} />
          <div className="layer-body">
            <div className="layer-name">Terrain</div>
            <div className="layer-type">Cesium World Terrain</div>
          </div>
          <span className="ltag ltag-green">DEM</span>
        </div>
      </div>

      {/* ══════════════════ COMPARE MODE ══════════════════ */}
      <div className={`p-section${!inCompare ? ' hidden' : ''}`} id="section-compare">
        <div className="p-label">날짜 선택</div>
        <div className="compare-pair">
          <div className="compare-row">
            <span className="compare-dot dot-a" />
            <span style={{ fontSize: 11, color: 'var(--muted)', width: 14, flexShrink: 0 }}>A</span>
            <select value={compareIdA} onChange={e => onCompareIdA(e.target.value)}>
              <option value="">— 날짜 선택 —</option>
              {activeSite.dates.map(d => <option key={d.id} value={d.id}>{d.label} ({d.id})</option>)}
            </select>
          </div>
          <div className="compare-row">
            <span className="compare-dot dot-b" />
            <span style={{ fontSize: 11, color: 'var(--muted)', width: 14, flexShrink: 0 }}>B</span>
            <select value={compareIdB} onChange={e => onCompareIdB(e.target.value)}>
              <option value="">— 날짜 선택 —</option>
              {activeSite.dates.map(d => <option key={d.id} value={d.id}>{d.label} ({d.id})</option>)}
            </select>
          </div>
        </div>

        <div className="p-label" style={{ marginTop: 10 }}>영역 필터</div>
        <button id="btn-draw-area" onClick={onDrawArea}>{drawBtnLabel}</button>
        <div id="draw-info">{drawInfo}</div>

        <div className="voxel-size-row" style={{ marginTop: 10 }}>
          <label htmlFor="voxel-size-input">Voxel size</label>
          <input type="number" id="voxel-size-input" min="0.1" max="10" step="0.1"
            value={voxelSize} onChange={e => onVoxelSize(parseFloat(e.target.value) || 0.5)} />
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>m</span>
        </div>

        <div className="compare-action-buttons">
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

      <div className={`p-section${!inCompare ? ' hidden' : ''}`} id="section-changedetection">
        <div className="p-label">Datasets</div>
        <div className="layer-row">
          <Toggle id="chk-date-a" checked={showDateA} onChange={onShowDateA} />
          <div className="layer-body"><div className="layer-name">Date A</div><div className="layer-type">Before</div></div>
          <div className="dataset-tools">
            <input type="color" id="color-date-a" value={colorA} className="dataset-color" onChange={e => onColorA(e.target.value)} />
          </div>
        </div>
        <div className="sub-row dataset-opacity">
          <span className="sub-label">Opacity</span>
          <input type="range" id="sl-alpha-a" min="0" max="1" step="0.05" value={alphaA} onChange={e => onAlphaA(parseFloat(e.target.value))} />
          <span className="sub-val">{alphaA.toFixed(2)}</span>
        </div>
        <div className="layer-row">
          <Toggle id="chk-date-b" checked={showDateB} onChange={onShowDateB} />
          <div className="layer-body"><div className="layer-name">Date B</div><div className="layer-type">After</div></div>
          <div className="dataset-tools">
            <input type="color" id="color-date-b" value={colorB} className="dataset-color" onChange={e => onColorB(e.target.value)} />
          </div>
        </div>
        <div className="sub-row dataset-opacity">
          <span className="sub-label">Opacity</span>
          <input type="range" id="sl-alpha-b" min="0" max="1" step="0.05" value={alphaB} onChange={e => onAlphaB(parseFloat(e.target.value))} />
          <span className="sub-val">{alphaB.toFixed(2)}</span>
        </div>

        <div className="cd-divider" />
        <div className="p-label">변화 감지</div>
        <div className="layer-row">
          <Toggle id="chk-added" checked={showAdded} onChange={onShowAdded} />
          <div className="layer-body"><div className="layer-name">추가된 부피</div><div className="layer-type">Voxel diff — B 존재, A 부재</div></div>
          <span className="ltag" style={{ background: '#2a1010', color: 'var(--added)' }}>ADD</span>
        </div>
        <div className="layer-row">
          <Toggle id="chk-removed" checked={showRemoved} onChange={onShowRemoved} />
          <div className="layer-body"><div className="layer-name">제거된 부피</div><div className="layer-type">Voxel diff — A 존재, B 부재</div></div>
          <span className="ltag" style={{ background: '#10162a', color: 'var(--removed)' }}>REM</span>
        </div>

        <div id="stats-box">
          <div className="stat-row"><span className="stat-k">추가</span><span className="stat-v" style={{ color: 'var(--added)' }}>{stats ? fmt(stats.added, stats.voxSize) : '—'}</span></div>
          <div className="stat-row"><span className="stat-k">제거</span><span className="stat-v" style={{ color: 'var(--removed)' }}>{stats ? fmt(stats.removed, stats.voxSize) : '—'}</span></div>
          <div className="stat-row" style={{ borderTop: '1px solid var(--border)', marginTop: 4, paddingTop: 6 }}>
            <span className="stat-k">순 변화</span>
            <span className="stat-v" style={{ color: stats ? (netM3 >= 0 ? 'var(--added)' : 'var(--removed)') : 'inherit' }}>
              {stats ? (netM3 >= 0 ? '+' : '') + (Math.abs(netM3) < 10000 ? netM3.toFixed(1) + ' m³' : (netM3 / 1000).toFixed(2) + 'k m³') : '—'}
            </span>
          </div>
          <div className="stat-row">
            <span className="stat-k">해상도</span>
            <span className="stat-v" style={{ fontSize: 10, color: 'var(--muted)' }}>
              {stats ? `${stats.added + stats.removed} voxels @ ${stats.voxSize}m` + (stats.clipped ? ' (polygon)' : '') : '—'}
            </span>
          </div>
          {!stats && <div id="stats-note">비교 모드에서 차이를 계산하세요</div>}
        </div>
      </div>

      {/* ══════════════════ TIMELINE MODE ══════════════════ */}
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

      {/* ── Camera ── */}
      <div className="p-section">
        <div className="p-label">Camera</div>
        <div className="btn-row">
          <button className="pbtn" onClick={onCameraSite}>↗ Site</button>
          <button className="pbtn" onClick={onCameraTop}>↓ Top</button>
        </div>
      </div>

      {/* ── Shortcuts ── */}
      <div className="key-hints">
        <div className="p-label">Shortcuts</div>
        <div className="key-hint-row"><kbd>M</kbd> Dataset </div>
        <div className="key-hint-row"><kbd>A</kbd> Added &nbsp; <kbd>R</kbd> Removed</div>
        <div className="key-hint-row"><kbd>D</kbd> Draw area (compare)</div>
        <div className="key-hint-row"><kbd>← →</kbd> Step &nbsp; <kbd>Space</kbd> Play</div>
        <div className="key-hint-row"><kbd>1</kbd> Site &nbsp; <kbd>2</kbd> Top</div>
      </div>

    </aside>
  )
}