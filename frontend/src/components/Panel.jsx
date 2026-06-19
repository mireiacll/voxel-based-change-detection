/**
 * Panel.jsx — LEFT sidebar
 *
 * Order:
 *   1. Selected project
 *   2. Analysis mode
 *   3. Survey dates  (date toggle list with PC | VOX layer pill)
 *   4. Point size    (point cloud only)
 *
 * Voxel status & compute are now in DataUploadPage, not here.
 * Camera controls now live in MapOverlayControls (top-right floating
 * cluster), not here.
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
import { formatDate } from '../api'
import DiffHistory from './DiffHistory'

/** Truncate a string to max chars, adding ellipsis if needed */
function trunc(str, max = 16) {
  if (!str) return ''
  return str.length > max ? str.slice(0, max) + '…' : str
}

function TypeTag({ type }) {
  if (!type) return null
  return (
    <span className={`ltag ${type === 'mesh' ? 'ltag-amber' : 'ltag-purple'}`}>
      {type === 'mesh' ? 'MESH' : 'PC'}
    </span>
  )
}

/**
 * PC | VOX pill toggle shown below an active date row.
 *
 * hasVoxel     — pre-computed voxelPath exists → VOX loads instantly
 * computing    — a compute is in progress for this date
 */
function LayerModePill({ dateId, datasetType, hasVoxel, computing, value, onChange }) {
  // VOX is only clickable when the voxel is fully ready (SUCCEEDED)
  const voxClickable = hasVoxel && !computing
  const voxLabel     = computing ? '⏳' : 'VOX'
  const pcLabel      = datasetType === 'mesh' ? 'MESH' : 'PC'
  const voxTitle     = computing
    ? 'Voxel 계산 중…'
    : hasVoxel
      ? 'Pre-computed voxel 표시'
      : 'Voxel 없음 — 데이터 업로드 탭에서 먼저 계산하세요'

  return (
    <div className="date-layer-pill">
      <button
        className={`dlp-btn${value === 'pc' ? ' dlp-active' : ''}`}
        onClick={e => { e.stopPropagation(); onChange(dateId, 'pc') }}
      >
        {pcLabel}
      </button>
      <button
        className={`dlp-btn${value === 'vox' ? ' dlp-active' : ''}${!voxClickable ? ' dlp-locked' : ''}${computing ? ' dlp-computing' : ''}`}
        disabled={!voxClickable}
        title={voxTitle}
        onClick={e => { e.stopPropagation(); onChange(dateId, 'vox') }}
      >
        {voxLabel}
      </button>
    </div>
  )
}

const ANALYSIS_MODES = [
  { value: 'compare-api', label: 'A vs B 비교' },
  { value: 'timeline',    label: '시계열 변화탐지' },
]

export default function Panel({
  activeSite,
  visibleDateIds, onToggleDate,
  pcSize, onPcSize, showPcSlider,
  voxelPollingIds,  // Set<dateId> — dates currently being voxelized
  onLayerMode,      // (dateId, 'pc' | 'vox') → void
  mode,             // 'compare-api' | 'timeline'
  onMode,           // (mode) => void
  diffHistory,      // entry[] from localStorage for this project
  activeDiffId,     // id of the diff history entry currently loaded/displayed
  onLoadDiff,       // (entry) → void — restore a past result
  onDeleteDiff,     // (diffId) → void — remove a history entry
}) {
  const dates          = activeSite?.dates ?? []
  const voxelizedCount = dates.filter(d => d.voxelStatus === 'SUCCEEDED').length
  const firstDate      = dates[0]?.label ?? '—'
  const lastDate  = dates[dates.length - 1]?.label ?? '—'
  const dateRange = dates.length > 1 ? `${firstDate} ~ ${lastDate}` : firstDate

  const [layerModes, setLayerModes] = useState({})
  const [drawerOpen, setDrawerOpen] = useState(false)

  // ── Handlers ─────────────────────────────────────────────────────────────

  async function handleLayerMode(dateId, mode) {
    const d = dates.find(x => x.id === dateId)
    if (!d) return
    setLayerModes(prev => ({ ...prev, [dateId]: mode }))
    onLayerMode?.(dateId, mode)
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
            <span className="site-info-v" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {dates.length}건
              {dates.length > 0 && (
                <button
                  className="dates-drawer-trigger"
                  onClick={() => setDrawerOpen(o => !o)}
                  title="Survey Dates 열기"
                >
                  목록
                </button>
              )}
            </span>
          </div>
          {dates.length > 0 && (
            <div className="site-info-row">
              <span className="site-info-k">기간</span>
              <span className="site-info-v site-info-mono">{dateRange}</span>
            </div>
          )}
          <div className="site-info-row">
            <span className="site-info-k">상태</span>
            <span className={`site-status-badge ${voxelizedCount >= 2 ? 'status-ok' : 'status-warn'}`}>
              {voxelizedCount >= 2 ? '분석 가능' : '데이터 필요'}
            </span>
          </div>
        </div>
      </div>

      {/* ── Analysis Mode ── */}
      <div className="p-section">
        <div className="p-label">Analysis Mode</div>
        <select
          className="mode-select"
          value={mode ?? 'compare-api'}
          onChange={e => onMode?.(e.target.value)}
        >
          {ANALYSIS_MODES.map(m => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      </div>

      {/* ── Survey Dates floating drawer ── */}
      {drawerOpen && (
        <div className="dates-drawer">
          <div className="dates-drawer-header">
            <span className="dates-drawer-title">Survey Dates</span>
            <button className="dates-drawer-close" onClick={() => setDrawerOpen(false)}>✕</button>
          </div>
          <div className="dates-drawer-body">
            {dates.length === 0 && (
              <div className="no-dates">날짜 없음 — 데이터 업로드 탭에서 추가하세요</div>
            )}
            {dates.map(d => {
              const isOn        = visibleDateIds.has(d.id)
              const layerMode   = layerModes[d.id] ?? 'pc'
              const isPolling   = voxelPollingIds?.has(d.id) ?? false
              const isComputing = isPolling
              const hasVoxel    = !!d.voxelPath && d.voxelStatus === 'SUCCEEDED'
              return (
                <div key={d.id} className="date-row-wrap">
                  <button
                    className={`date-btn${isOn ? ' active' : ''}`}
                    onClick={() => onToggleDate(d)}
                  >
                    <span className="date-label">{formatDate(d.observedAt) || d.label}</span>
                    <span className="date-meta">
                      <span className="date-name" title={d.name}>{trunc(d.name)}</span>
                      {isOn && layerMode === 'vox'
                        ? <span className="ltag ltag-teal">VOX</span>
                        : <TypeTag type={d.datasetType} />
                      }
                    </span>
                  </button>
                  {isOn && (
                    <LayerModePill
                      dateId={d.id}
                      datasetType={d.datasetType}
                      hasVoxel={hasVoxel}
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
      )}

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

      {/* ── Diff History ── */}
      <div className="p-section">
        <div className="p-label">Diff History</div>
        <DiffHistory
          entries={diffHistory ?? []}
          activeId={activeDiffId}
          onLoad={onLoadDiff}
          onDelete={onDeleteDiff}
        />
      </div>

    </aside>
  )
}