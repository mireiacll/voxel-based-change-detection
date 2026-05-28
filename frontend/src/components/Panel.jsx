/**
 * Panel.jsx — the entire left sidebar
 *
 * Receives all state as props from App.jsx and fires callbacks to update it.
 * No local state — single source of truth lives in App.
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
  const m3 = n * voxSize ** 3
  return m3 < 10000 ? `${m3.toFixed(1)} m³` : `${(m3 / 1000).toFixed(2)}k m³`
}

export default function Panel({
  // mode
  mode, onModeChange,
  // dates (view mode)
  activeSite, activeDate, onDateChange,
  // layer toggles
  showMesh, onShowMesh,
  showPc,   onShowPc,
  pcSize,   onPcSize,
  showTerrain, onShowTerrain,
  // compare selects
  compareIdA, onCompareIdA,
  compareIdB, onCompareIdB,
  // compare layer toggles + tints
  showDateA, onShowDateA,
  showDateB, onShowDateB,
  colorA, onColorA, alphaA, onAlphaA,
  colorB, onColorB, alphaB, onAlphaB,
  // change detection
  showAdded,   onShowAdded,
  showRemoved, onShowRemoved,
  voxelSize,   onVoxelSize,
  drawInfo,    drawBtnLabel, onDrawArea,
  diffRunning, onRunDiff, onClearDiff,
  diffStatus,
  stats,
  // camera
  onCameraSite, onCameraTop, 
}) {
  const inView    = mode === 'view'
  const inCompare = mode === 'compare'

  const netM3 = stats
    ? (stats.added - stats.removed) * stats.voxSize ** 3
    : 0

  return (
    <aside id="panel">

      {/* ── Mode switcher ── */}
      <div id="mode-bar">
        <button
          className={`mode-btn${inView ? ' active' : ''}`}
          onClick={() => onModeChange('view')}
        >View</button>
        <button
          className={`mode-btn${inCompare ? ' active' : ''}`}
          onClick={() => onModeChange('compare')}
        >Compare</button>
      </div>

      {/* ── VIEW: date selector ── */}
      <div className={`p-section${inCompare ? ' hidden' : ''}`} id="section-dates">
        <div className="p-label">Survey Date</div>
        <div id="date-list">
          {activeSite.dates.length === 0
            ? <div className="no-dates">No dates configured</div>
            : activeSite.dates.map(d => (
                <button
                  key={d.id}
                  className={`date-btn${d.id === activeDate?.id ? ' active' : ''}`}
                  onClick={() => onDateChange(d)}
                >
                  <span className="date-label">{d.label}</span>
                  <span className="date-id">{d.id}</span>
                </button>
              ))
          }
        </div>
      </div>

      {/* ── COMPARE: date pair + area filter ── */}
      <div className={`p-section${inView ? ' hidden' : ''}`} id="section-compare">
        <div className="p-label">Select Two Dates</div>
        <div className="compare-pair">
          <div className="compare-row">
            <span className="compare-dot dot-a" />
            <span style={{ fontSize: 11, color: 'var(--muted)', width: 14, flexShrink: 0 }}>A</span>
            <select value={compareIdA} onChange={e => onCompareIdA(e.target.value)}>
              <option value="">— select date —</option>
              {activeSite.dates.map(d => (
                <option key={d.id} value={d.id}>{d.label} ({d.id})</option>
              ))}
            </select>
          </div>
          <div className="compare-row">
            <span className="compare-dot dot-b" />
            <span style={{ fontSize: 11, color: 'var(--muted)', width: 14, flexShrink: 0 }}>B</span>
            <select value={compareIdB} onChange={e => onCompareIdB(e.target.value)}>
              <option value="">— select date —</option>
              {activeSite.dates.map(d => (
                <option key={d.id} value={d.id}>{d.label} ({d.id})</option>
              ))}
            </select>
          </div>
        </div>

        <div className="p-label" style={{ marginTop: 10 }}>Area Filter</div>
        <button id="btn-draw-area" onClick={onDrawArea}>{drawBtnLabel}</button>
        <div id="draw-info">{drawInfo}</div>

        <div className="voxel-size-row" style={{ marginTop: 10 }}>
          <label htmlFor="voxel-size-input">Voxel size</label>
          <input
            type="number" id="voxel-size-input"
            min="0.1" max="10" step="0.1"
            value={voxelSize}
            onChange={e => onVoxelSize(parseFloat(e.target.value) || 0.5)}
          />
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>m</span>
        </div>

        <div className="compare-action-buttons">
          <button id="btn-run-diff" disabled={diffRunning} onClick={onRunDiff}>
            {diffRunning ? '⟳ Computing…' : '⚡ Run diff'}
          </button>
          <button
            id="btn-clear-diff"
            style={diffRunning ? { borderColor: '#d49050', color: '#d49050' } : {}}
            onClick={onClearDiff}
          >
            {diffRunning ? '⏹ Stop computation' : '✖ Clear comparison'}
          </button>
        </div>

        <div id="diff-status" data-state={diffStatus.state}>
          {diffStatus.msg}
        </div>

        <div className="legend" style={{ marginTop: 10 }}>
          <div className="p-label" style={{ marginBottom: 6 }}>Legend</div>
          <div className="legend-row">
            <span className="compare-dot dot-a" style={{ background: colorA }} />
            Date A — amber tint (before)
          </div>
          <div className="legend-row">
            <span className="compare-dot dot-b" style={{ background: colorB }} />
            Date B — blue tint (after)
          </div>
          <div className="legend-row">
            <span className="legend-swatch" style={{ background: 'var(--added)' }} />
            Added volume (B − A)
          </div>
          <div className="legend-row">
            <span className="legend-swatch" style={{ background: 'var(--removed)' }} />
            Removed volume (A − B)
          </div>
        </div>
      </div>

      {/* ── VIEW: layer toggles ── */}
      <div className={`p-section${inCompare ? ' hidden' : ''}`} id="section-layers">
        <div className="p-label">Layers</div>

        <div className="layer-row">
          <Toggle id="chk-mesh" checked={showMesh} onChange={onShowMesh} />
          <div className="layer-body">
            <div className="layer-name">3D Mesh</div>
            <div className="layer-type">3D Tiles · mago3d-tiler</div>
          </div>
          <span className="ltag ltag-amber">3DT</span>
        </div>

        <div className="layer-row">
          <Toggle id="chk-pc" checked={showPc} onChange={onShowPc} />
          <div className="layer-body">
            <div className="layer-name">Point Cloud</div>
            <div className="layer-type">3D Tiles · py3dtiles</div>
          </div>
          <span className="ltag ltag-purple">PC</span>
        </div>
        <div className="sub-row">
          <span className="sub-label">Size</span>
          <input
            type="range" id="sl-pc-size"
            min="1" max="20" step="0.5"
            value={pcSize}
            onChange={e => onPcSize(parseFloat(e.target.value))}
          />
          <span className="sub-val" id="val-pc-size">{pcSize}</span>
        </div>

        <div className="layer-row">
          <Toggle  id="chk-terrain" checked={showTerrain} onChange={onShowTerrain}/>
          <div className="layer-body">
            <div className="layer-name">Terrain</div>
            <div className="layer-type">Cesium World Terrain</div>
          </div>
          <span className="ltag ltag-green">DEM</span>
        </div>
      </div>

      {/* ── COMPARE: datasets + change detection ── */}
      <div className={`p-section${inView ? ' hidden' : ''}`} id="section-changedetection">

        <div className="p-label">Datasets</div>

        {/* Date A */}
        <div className="layer-row">
          <Toggle id="chk-date-a" checked={showDateA} onChange={onShowDateA} />
          <div className="layer-body">
            <div className="layer-name">Date A</div>
            <div className="layer-type">Before — amber tint</div>
          </div>
          <div className="dataset-tools">
            <input
              type="color" id="color-date-a"
              value={colorA}
              className="dataset-color"
              onChange={e => onColorA(e.target.value)}
            />
          </div>
        </div>
        <div className="sub-row dataset-opacity">
          <span className="sub-label">Opacity</span>
          <input
            type="range" id="sl-alpha-a"
            min="0" max="1" step="0.05"
            value={alphaA}
            onChange={e => onAlphaA(parseFloat(e.target.value))}
          />
          <span className="sub-val" id="val-alpha-a">{alphaA.toFixed(2)}</span>
        </div>

        {/* Date B */}
        <div className="layer-row">
          <Toggle id="chk-date-b" checked={showDateB} onChange={onShowDateB} />
          <div className="layer-body">
            <div className="layer-name">Date B</div>
            <div className="layer-type">After — blue tint</div>
          </div>
          <div className="dataset-tools">
            <input
              type="color" id="color-date-b"
              value={colorB}
              className="dataset-color"
              onChange={e => onColorB(e.target.value)}
            />
          </div>
        </div>
        <div className="sub-row dataset-opacity">
          <span className="sub-label">Opacity</span>
          <input
            type="range" id="sl-alpha-b"
            min="0" max="1" step="0.05"
            value={alphaB}
            onChange={e => onAlphaB(parseFloat(e.target.value))}
          />
          <span className="sub-val" id="val-alpha-b">{alphaB.toFixed(2)}</span>
        </div>

        <div className="cd-divider" />
        <div className="p-label">Change Detection</div>

        <div className="layer-row">
          <Toggle id="chk-added" checked={showAdded} onChange={onShowAdded} />
          <div className="layer-body">
            <div className="layer-name">Volume Added</div>
            <div className="layer-type">Voxel diff — B present, A absent</div>
          </div>
          <span className="ltag" style={{ background: '#2a1010', color: 'var(--added)' }}>ADD</span>
        </div>

        <div className="layer-row">
          <Toggle id="chk-removed" checked={showRemoved} onChange={onShowRemoved} />
          <div className="layer-body">
            <div className="layer-name">Volume Removed</div>
            <div className="layer-type">Voxel diff — A present, B absent</div>
          </div>
          <span className="ltag" style={{ background: '#10162a', color: 'var(--removed)' }}>REM</span>
        </div>

        <div id="stats-box">
          <div className="stat-row">
            <span className="stat-k">Added</span>
            <span className="stat-v" id="sv-added" style={{ color: 'var(--added)' }}>
              {stats ? fmt(stats.added, stats.voxSize) : '—'}
            </span>
          </div>
          <div className="stat-row">
            <span className="stat-k">Removed</span>
            <span className="stat-v" id="sv-removed" style={{ color: 'var(--removed)' }}>
              {stats ? fmt(stats.removed, stats.voxSize) : '—'}
            </span>
          </div>
          <div className="stat-row" style={{ borderTop: '1px solid var(--border)', marginTop: 4, paddingTop: 6 }}>
            <span className="stat-k">Net change</span>
            <span
              className="stat-v" id="sv-net"
              style={{ color: stats ? (netM3 >= 0 ? 'var(--added)' : 'var(--removed)') : 'inherit' }}
            >
              {stats
                ? (netM3 >= 0 ? '+' : '') +
                  (Math.abs(netM3) < 10000
                    ? netM3.toFixed(1) + ' m³'
                    : (netM3 / 1000).toFixed(2) + 'k m³')
                : '—'}
            </span>
          </div>
          <div className="stat-row" style={{ marginTop: 2 }}>
            <span className="stat-k">Resolution</span>
            <span className="stat-v" id="sv-voxels" style={{ fontSize: 10, color: 'var(--muted)' }}>
              {stats
                ? `${stats.added + stats.removed} voxels @ ${stats.voxSize}m` +
                  (stats.clipped ? ' (polygon)' : '')
                : '—'}
            </span>
          </div>
          {!stats && (
            <div id="stats-note">Switch to Compare mode and run a diff</div>
          )}
        </div>
      </div>

      {/* ── Camera ── */}
      <div className="p-section">
        <div className="p-label">Camera</div>
        <div className="btn-row">
          <button className="pbtn" onClick={onCameraSite}>↗ Site</button>
          <button className="pbtn" onClick={onCameraTop}>↓ Top</button>
        </div>
      </div>

      {/* ── Keyboard shortcuts ── */}
      <div className="key-hints">
        <div className="p-label">Shortcuts</div>
        <div className="key-hint-row"><kbd>M</kbd> Toggle mesh &nbsp; <kbd>P</kbd> Toggle point cloud</div>
        <div className="key-hint-row"><kbd>A</kbd> Added &nbsp; <kbd>R</kbd> Removed</div>
        <div className="key-hint-row"><kbd>D</kbd> Draw area (compare mode)</div>
        <div className="key-hint-row"><kbd>1</kbd> Site &nbsp; <kbd>2</kbd> Top </div> 
        <div className="key-hint-row"><kbd>V</kbd> View mode &nbsp; <kbd>C</kbd> Compare mode</div>
      </div>

    </aside>
  )
}