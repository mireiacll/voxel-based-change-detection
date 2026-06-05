/**
 * Panel.jsx — LEFT sidebar
 */

export default function Panel({
  activeSite,
  compareIdA, onCompareIdA,
  compareIdB, onCompareIdB,
  colorA, onColorA, alphaA, onAlphaA,
  colorB, onColorB, alphaB, onAlphaB,
  drawInfo, drawBtnLabel, onDrawArea,
  voxelSize, onVoxelSize,
  diffRunning, onRunDiff, onClearDiff,
  diffStatus,
  onCameraSite, onCameraTop,
}) {
  const dates     = activeSite?.dates ?? []
  const firstDate = dates[0]?.label ?? '—'
  const lastDate  = dates[dates.length - 1]?.label ?? '—'
  const dateRange = dates.length > 1 ? `${firstDate} ~ ${lastDate}` : firstDate

  return (
    <aside id="panel">

      {/* ── 선택된 프로젝트 ── */}
      <div className="p-section">
        <div className="p-label">선택된 프로젝트</div>
        <div className="site-info-card">
          <div className="site-info-row">
            <span className="site-info-k">프로젝트명</span>
            <span className="site-info-v">{activeSite.label ?? activeSite.id}</span>
          </div>
          <div className="site-info-row">
            <span className="site-info-k">관측 데이터</span>
            <span className="site-info-v">{dates.length}건</span>
          </div>
          {dates.length > 0 && (
            <div className="site-info-row">
              <span className="site-info-k">기간</span>
              <span className="site-info-v site-info-mono">{dateRange}</span>
            </div>
          )}
          <div className="site-info-row">
            <span className="site-info-k">상태</span>
            <span className={`site-status-badge ${dates.length > 1 ? 'status-ok' : 'status-warn'}`}>
              {dates.length > 1 ? '분석 가능' : '데이터 필요'}
            </span>
          </div>
        </div>
      </div>

      {/* ── A/B 날짜 선택 ── */}
      <div className="p-section">
        <div className="p-label">날짜 비교</div>
        <div className="compare-pair">

          {/* A — dot color synced to colorA */}
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

          {/* B — dot color synced to colorB */}
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

      {/* ── 분석 설정 ── */}
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

      {/* ── 카메라 ── */}
      <div className="p-section">
        <div className="p-label">카메라</div>
        <div className="btn-row">
          <button className="pbtn" onClick={onCameraSite}>↗ 현장</button>
          <button className="pbtn" onClick={onCameraTop}>↓ 수직</button>
        </div>
      </div>

    </aside>
  )
}
