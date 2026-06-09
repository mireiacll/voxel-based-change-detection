/**
 * Panel.jsx — LEFT sidebar
 *
 * Order:
 *   1. 선택된 프로젝트
 *   2. 관측 데이터  (date toggle list with PC | VOX layer pill)
 *   3. 포인트 크기  (point cloud only)
 *   4. Voxel 계산  (dummy — no-op until voxel pipeline is ready)
 *   5. 카메라
 */

import { useState } from 'react'

function TypeTag({ type }) {
  if (!type) return null
  return (
    <span className={`date-type-tag ${type === 'mesh' ? 'ltag-amber' : 'ltag-purple'}`}>
      {type === 'mesh' ? 'MESH' : 'PC'}
    </span>
  )
}

/**
 * PC | VOX pill toggle shown below an active date row.
 * VOX is disabled (with tooltip) when hasVoxel is false.
 */
function LayerModePill({ dateId, hasVoxel, value, onChange }) {
  return (
    <div className="date-layer-pill">
      <button
        className={`dlp-btn${value === 'pc' ? ' dlp-active' : ''}`}
        onClick={e => { e.stopPropagation(); onChange(dateId, 'pc') }}
      >
        PC
      </button>
      <button
        className={`dlp-btn${value === 'vox' ? ' dlp-active dlp-vox' : ''}`}
        disabled={!hasVoxel}
        title={!hasVoxel ? 'Voxel not ready — compute below' : 'Show voxels'}
        onClick={e => { e.stopPropagation(); onChange(dateId, 'vox') }}
      >
        VOX
      </button>
    </div>
  )
}

export default function Panel({
  activeSite,
  visibleDateIds, onToggleDate,
  onCameraSite, onCameraTop,
  pcSize, onPcSize, showPcSlider,
}) {
  const dates     = activeSite?.dates ?? []
  const firstDate = dates[0]?.label ?? '—'
  const lastDate  = dates[dates.length - 1]?.label ?? '—'
  const dateRange = dates.length > 1 ? `${firstDate} ~ ${lastDate}` : firstDate

  // Per-date layer mode: 'pc' | 'vox'. Defaults to 'pc'.
  const [layerModes, setLayerModes] = useState({})

  // Which date is targeted for voxel compute (defaults to first date)
  const [computeTarget, setComputeTarget] = useState('')
  const [computing, setComputing]         = useState(false)
  const [computeMsg, setComputeMsg]       = useState('')

  function handleLayerMode(dateId, mode) {
    setLayerModes(prev => ({ ...prev, [dateId]: mode }))
    // TODO: when voxels are real, call onLayerMode(dateId, mode) prop here
  }

  function handleComputeVoxel() {
    const target = computeTarget || dates[0]?.id
    if (!target || computing) return
    setComputing(true)
    setComputeMsg('')
    // Dummy — replace with real API call when voxel pipeline is ready
    setTimeout(() => {
      setComputing(false)
      setComputeMsg('준비 중 — 아직 구현되지 않았습니다')
      // TODO: mark date as hasVoxel=true + addToast('Voxel computed')
    }, 1200)
  }

  const effectiveTarget = computeTarget || dates[0]?.id || ''

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
            const isOn     = visibleDateIds.has(d.id)
            const layerMode = layerModes[d.id] ?? 'pc'
            const hasVoxel  = d.hasVoxel ?? false  // TODO: real field from API
            return (
              <div key={d.id} className="date-row-wrap">
                <button
                  className={`date-btn${isOn ? ' active' : ''}`}
                  onClick={() => onToggleDate(d)}
                >
                  <span className="date-label">{d.label}</span>
                  <span className="date-id">{d.id}</span>
                  <TypeTag type={d.datasetType} />
                </button>
                {isOn && (
                  <LayerModePill
                    dateId={d.id}
                    hasVoxel={hasVoxel}
                    value={layerMode}
                    onChange={handleLayerMode}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── 포인트 크기 (point cloud only) ── */}
      {showPcSlider && (
        <div className="p-section">
          <div className="p-label">포인트 크기</div>
          <div className="pc-size-row">
            <input
              type="range" min="1" max="20" step="0.5"
              value={pcSize}
              onChange={e => onPcSize(parseFloat(e.target.value))}
            />
            <span className="pc-size-val">{pcSize}</span>
          </div>
        </div>
      )}

      {/* ── Voxel 계산 ── */}
      <div className="p-section">
        <div className="p-label">Voxel 계산</div>
        {dates.length === 0 ? (
          <div className="no-dates">날짜 데이터 없음</div>
        ) : (
          <>
            <select
              className="vox-date-select"
              value={effectiveTarget}
              onChange={e => setComputeTarget(e.target.value)}
            >
              {dates.map(d => (
                <option key={d.id} value={d.id}>
                  {d.label}  ({d.id})
                </option>
              ))}
            </select>
            <button
              className={`vox-compute-btn${computing ? ' vox-computing' : ''}`}
              disabled={computing || dates.length === 0}
              onClick={handleComputeVoxel}
            >
              {computing ? '⏳ 계산 중…' : '⬡ Voxel 계산'}
            </button>
            {computeMsg && (
              <div className="vox-compute-msg">{computeMsg}</div>
            )}
            <div className="vox-compute-hint">
              선택한 날짜의 포인트 클라우드로 Voxel을 생성합니다
            </div>
          </>
        )}
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