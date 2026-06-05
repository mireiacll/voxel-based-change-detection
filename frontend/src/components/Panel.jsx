/**
 * Panel.jsx — LEFT sidebar
 *
 * Order:
 *   1. 선택된 프로젝트
 *   2. 관측 데이터  (date toggle list — moved here from RightPanel)
 *   3. 카메라
 */

function TypeTag({ type }) {
  if (!type) return null
  return (
    <span className={`date-type-tag ${type === 'mesh' ? 'ltag-amber' : 'ltag-purple'}`}>
      {type === 'mesh' ? '3DT' : 'PC'}
    </span>
  )
}

export default function Panel({
  activeSite,
  // date list props (moved from RightPanel)
  visibleDateIds, onToggleDate,
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

      {/* ── 관측 데이터 ── */}
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