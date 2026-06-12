/**
 * Panel.jsx — LEFT sidebar
 *
 * Order:
 *   1. Selected project
 *   2. Survey dates  (date toggle list with PC | VOX layer pill)
 *   3. Point size    (point cloud only)
 *   4. Voxel calculation  (compute on-demand for dates without a voxel)
 *   5. Camera
 *
 * Site shape (coworker API, normalised in api.js):
 *   site.name          — display name
 *   site.centerLat/Lon — camera position
 *   site.cameraHeight
 *   site.dates[]       — array of date objects from _observationToDate()
 *
 * Date shape (from _observationToDate in api.js):
 *   date.id            — stringified observation id
 *   date.label         — formatted observedAt date
 *   date.datasetPath   — originalTilesPath (null if none)
 *   date.datasetType   — 'pointcloud' | null
 *   date.voxelPath     — pre-computed voxel tileset path or null
 *   date.voxelStatus   — 'NONE' | 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED'
 */

import { useState } from 'react'

/** Format a YYYY-MM-DD string → "Jun 1, 2026" */
function isoToLabel(iso) {
  if (!iso) return iso
  const [year, month, day] = iso.split('-')
  const M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${M[parseInt(month,10)-1] ?? month} ${parseInt(day,10)}, ${year}`
}

/** Truncate a string to max chars, adding ellipsis if needed */
function trunc(str, max = 16) {
  if (!str) return ''
  return str.length > max ? str.slice(0, max) + '…' : str
}

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
 *
 * hasVoxel     — pre-computed voxelPath exists → VOX loads instantly
 * canCompute   — no voxelPath but datasetPath exists → VOX triggers compute
 * computing    — a compute is in progress for this date
 */
function LayerModePill({ dateId, hasVoxel, canCompute, computing, value, onChange }) {
  const voxClickable = hasVoxel || canCompute
  const voxLabel     = computing ? '⏳' : 'VOX'
  const voxTitle     = computing
    ? 'Voxel 계산 중…'
    : hasVoxel
      ? 'Pre-computed voxel 표시'
      : canCompute
        ? 'Voxel 계산 후 표시'
        : 'Point cloud 없음 — Voxel 계산 불가'

  return (
    <div className="date-layer-pill">
      <button
        className={`dlp-btn${value === 'pc' ? ' dlp-active' : ''}`}
        onClick={e => { e.stopPropagation(); onChange(dateId, 'pc') }}
      >
        PC
      </button>
      <button
        className={`dlp-btn${value === 'vox' ? ' dlp-active dlp-vox' : ''}${computing ? ' dlp-computing' : ''}`}
        disabled={!voxClickable || computing}
        title={voxTitle}
        onClick={e => { e.stopPropagation(); onChange(dateId, 'vox') }}
      >
        {voxLabel}
      </button>
    </div>
  )
}

export default function Panel({
  activeSite,
  visibleDateIds, onToggleDate,
  onCameraSite, onCameraTop,
  pcSize, onPcSize, showPcSlider,
  onLayerMode,     // (dateId, 'pc' | 'vox') → void
  onComputeVoxel,  // (dateId) → Promise<void>
}) {
  const dates     = activeSite?.dates ?? []
  const firstDate = dates[0]?.label ?? '—'
  const lastDate  = dates[dates.length - 1]?.label ?? '—'
  const dateRange = dates.length > 1 ? `${firstDate} ~ ${lastDate}` : firstDate

  const [layerModes,  setLayerModes]  = useState({})
  const [computingId, setComputingId] = useState(null)
  const [computeMsg,  setComputeMsg]  = useState('')

  const [computeTarget, setComputeTarget] = useState('')
  const effectiveTarget = computeTarget || dates[0]?.id || ''

  // Dates that can have voxels computed: have a datasetPath and no existing voxelPath
  const computableDates = dates.filter(d => d.datasetPath && !d.voxelPath)

  // ── Handlers ─────────────────────────────────────────────────────────────

  async function handleLayerMode(dateId, mode) {
    const d = dates.find(x => x.id === dateId)
    if (!d) return

    if (mode === 'vox' && !d.voxelPath) {
      if (!d.datasetPath) return
      await handleComputeVoxel(dateId, /* autoSwitch */ true)
      return
    }

    setLayerModes(prev => ({ ...prev, [dateId]: mode }))
    onLayerMode?.(dateId, mode)
  }

  async function handleComputeVoxel(dateId, autoSwitch = false) {
    if (!dateId || computingId) return
    setComputingId(dateId)
    setComputeMsg('')
    try {
      await onComputeVoxel?.(dateId)
      setComputeMsg('✓ Voxel 생성 완료')
      if (autoSwitch) {
        setLayerModes(prev => ({ ...prev, [dateId]: 'vox' }))
        onLayerMode?.(dateId, 'vox')
      }
    } catch (e) {
      setComputeMsg(`오류: ${e.message}`)
    } finally {
      setComputingId(null)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <aside id="panel">

      {/* ── Selected Project ── */}
      <div className="p-section">
        <div className="p-label">Selected Project</div>
        <div className="site-info-card">
          <div className="site-info-row">
            <span className="site-info-k">프로젝트명</span>
            <span className="site-info-v">{activeSite.name}</span>
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

      {/* ── Survey Dates ── */}
      <div className="p-section">
        <div className="p-label">Survey Dates</div>
        <div id="date-list" className="rp-date-list">
          {dates.length === 0 && (
            <div className="no-dates">날짜 없음 — 데이터 업로드 탭에서 추가하세요</div>
          )}
          {dates.map(d => {
            const isOn       = visibleDateIds.has(d.id)
            const layerMode  = layerModes[d.id] ?? 'pc'
            const hasVoxel   = !!d.voxelPath
            const canCompute = !hasVoxel && !!d.datasetPath
            const isComputing = computingId === d.id
            return (
              <div key={d.id} className="date-row-wrap">
                <button
                  className={`date-btn${isOn ? ' active' : ''}`}
                  onClick={() => onToggleDate(d)}
                >
                  <span className="date-label">{isoToLabel(d.observedAt) || d.label}</span>
                  <span className="date-meta">
                    <span className="date-name" title={d.name}>{trunc(d.name)}</span>
                    <TypeTag type={d.datasetType} />
                    {hasVoxel && (
                      <span className="ltag ltag-vox" title="Pre-computed voxel available">VOX</span>
                    )}
                  </span>
                </button>
                {isOn && (
                  <LayerModePill
                    dateId={d.id}
                    hasVoxel={hasVoxel}
                    canCompute={canCompute}
                    computing={isComputing}
                    value={layerMode}
                    onChange={handleLayerMode}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Point size (point cloud only) ── */}
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

      {/* ── Voxel Calculation ── */}
      <div className="p-section">
        <div className="p-label">Voxel Calculation</div>
        {computableDates.length === 0 ? (
          <div className="no-dates">
            {dates.length === 0
              ? '날짜 데이터 없음'
              : '모든 날짜에 Voxel이 이미 준비됨'}
          </div>
        ) : (
          <>
            <select
              className="vox-date-select"
              value={effectiveTarget}
              onChange={e => { setComputeTarget(e.target.value); setComputeMsg('') }}
            >
              {computableDates.map(d => (
                <option key={d.id} value={d.id}>
                  {d.label} ({d.name})
                </option>
              ))}
            </select>
            <button
              className={`vox-compute-btn${computingId ? ' vox-computing' : ''}`}
              disabled={!!computingId || computableDates.length === 0}
              onClick={() => handleComputeVoxel(effectiveTarget)}
            >
              {computingId === effectiveTarget ? '⏳ 계산 중…' : '⬡ Voxel 계산'}
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

      {/* ── Camera ── */}
      <div className="p-section">
        <div className="p-label">Camera</div>
        <div className="btn-row">
          <button className="pbtn" onClick={onCameraSite}>↗ 현장</button>
          <button className="pbtn" onClick={onCameraTop}>↓ 수직</button>
        </div>
      </div>

    </aside>
  )
}