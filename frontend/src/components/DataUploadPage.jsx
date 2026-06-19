/**
 * DataUploadPage.jsx
 *
 * Full-screen overlay shown when the "데이터 업로드" tab is active.
 * Lists all survey dates for the active site.
 * Each date row has edit/delete/voxel actions.
 *
 * Each row also has a "📍 위치로 지정" button. Clicking it reads the
 * coordinates directly from that date's tileset.json (root bounding region)
 * and asks the user to confirm before saving them as the project's
 * centerLon/centerLat. There is no manual lat/lon entry — the coordinates
 * always come from the uploaded data itself.
 *
 * Props
 * ─────
 *   site            — site object (required)
 *   onUploaded      — () => void   called after any successful upload
 *   onCreated       — () => void   called after date creation / deletion
 *   onSiteUpdated   — () => void   called after project coords are saved
 *   blockedDateInfo — Map<dateId, reason> dates locked by a running diff
 *   voxelPollingIds — Set<dateId>  dates whose voxel job is being polled
 *   onCancelVoxel   — (dateId) => Promise<void>
 *   onComputeVoxel  — (dateId) => Promise<void>
 *   computingId     — dateId | null
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import {
  uploadObservation,
  updateObservation,
  deleteObservation,
  updateProject,
  fetchTilesetCenter,
} from '../api'

/** Format a YYYY-MM-DD string into a pretty label like "Jun 1, 2026". */
function isoToLabel(iso) {
  if (!iso) return iso
  const [year, month, day] = iso.split('-')
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const m = MONTHS[parseInt(month, 10) - 1] ?? month
  return `${m} ${parseInt(day, 10)}, ${year}`
}

function progressLabel({ phase, pct }) {
  if (phase === 'checking')  return '형식 확인 중…'
  if (phase === 'zipping')   return `압축 중…  ${pct}%`
  if (phase === 'uploading') return '업로드 중…'
  return ''
}

function DatasetTypeBadge({ type }) {
  if (!type) return <span className="dup-badge dup-badge-none">미업로드</span>
  if (type === 'mesh')
    return <span className="dup-badge dup-badge-mesh">3D Mesh</span>
  return <span className="dup-badge dup-badge-pc">Point Cloud</span>
}

/**
 * Clickable PC/VOX preview trigger pills shown in each date row.
 * PC/Mesh is always clickable if data exists.
 * VOX is clickable only when voxelStatus === 'SUCCEEDED'.
 * While voxel is computing → disabled with spinner label.
 * On other non-ready statuses → disabled, greyed out.
 */
function PreviewTrigger({ date, activePreview, onPreview }) {
  const hasData  = !!date.datasetPath
  const hasVoxel = !!date.voxelTilesetUrl && date.voxelStatus === 'SUCCEEDED'
  const voxBusy  = date.voxelStatus === 'QUEUED' || date.voxelStatus === 'RUNNING'

  const pcActive  = activePreview?.dateId === date.id && activePreview?.layer === 'pc'
  const voxActive = activePreview?.dateId === date.id && activePreview?.layer === 'vox'

  return (
    <div className="dup-preview-trigger">
      {hasData ? (
        <button
          className={`dup-ptrig-btn dup-ptrig-pc${pcActive ? ' dup-ptrig-active' : ''}`}
          onClick={e => { e.stopPropagation(); onPreview(date, 'pc') }}
          title={`${date.datasetType === 'mesh' ? '3D Mesh' : 'Point Cloud'} 미리보기`}
        >
          {date.datasetType === 'mesh' ? '◈ Mesh' : '☁ PC'}
        </button>
      ) : (
        <span className="dup-badge dup-badge-none">미업로드</span>
      )}

      {voxBusy ? (
        <button className="dup-ptrig-btn dup-ptrig-vox dup-ptrig-vox-busy" disabled title="Voxel 생성 중…">
          ⏳ VOX
        </button>
      ) : hasVoxel ? (
        <button
          className={`dup-ptrig-btn dup-ptrig-vox${voxActive ? ' dup-ptrig-active' : ''}`}
          onClick={e => { e.stopPropagation(); onPreview(date, 'vox') }}
          title="Voxel 미리보기"
        >
          ⬡ VOX
        </button>
      ) : date.datasetPath && date.voxelStatus && date.voxelStatus !== 'NONE' ? (
        <button
          className="dup-ptrig-btn dup-ptrig-vox dup-ptrig-vox-na"
          disabled
          title={`Voxel 상태: ${date.voxelStatus} — 아직 사용 불가`}
        >
          ⬡ VOX
        </button>
      ) : null}
    </div>
  )
}

function VoxelStatusBadge({ date, isBusy, canTrigger, onCompute }) {
  const status = date.voxelStatus ?? 'NONE'

  let badge
  if (isBusy) {
    const label = status === 'QUEUED' ? 'Voxel 대기 중' : 'Voxel 생성 중'
    badge = <span className="vst-badge vst-running">⏳ {label}</span>
  } else if (status === 'SUCCEEDED') {
    badge = <span className="vst-badge vst-done">✓ Voxel 완료</span>
  } else if (status === 'RUNNING') {
    badge = <span className="vst-badge vst-running">⏳ Voxel 생성 중</span>
  } else if (status === 'QUEUED') {
    badge = <span className="vst-badge vst-running">⏳ Voxel 대기 중</span>
  } else if (status === 'FAILED') {
    badge = <span className="vst-badge vst-failed">✗ Voxel 실패</span>
  } else if (status === 'CANCELLED') {
    badge = <span className="vst-badge vst-failed">Voxel 취소됨</span>
  } else {
    if (!date.datasetPath) {
      badge = <span className="vst-badge vst-none">Voxel 미생성</span>
    } else {
      badge = null
    }
  }

  return (
    <>
      {badge}
      {isBusy && <span className="vst-spinner" />}
      {canTrigger && (
        <button
          className="vst-btn"
          onClick={e => { e.stopPropagation(); onCompute(date.id) }}
          title="Voxel 계산 시작"
        >
          ⬡ Voxel 계산
        </button>
      )}
    </>
  )
}

function DateTextInput({ value, onChange, disabled, autoFocus }) {
  const [text, setText] = useState(value || '')

  function handleChange(e) {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 8)
    let formatted = digits
    if (digits.length > 4) formatted = `${digits.slice(0, 4)}-${digits.slice(4)}`
    if (digits.length > 6) formatted = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6)}`
    setText(formatted)
    onChange(digits.length === 8 ? formatted : '')
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder="YYYY-MM-DD"
      maxLength={10}
      value={text}
      onChange={handleChange}
      disabled={disabled}
      autoFocus={autoFocus}
    />
  )
}

// ── Set location modal — derives coords from the tileset itself ──────────
// Instead of manual lat/lon entry, this fetches the date's tileset.json,
// computes the center of its root bounding region, and asks the user to
// confirm before saving it as the project's centerLon/centerLat.

function SetLocationModal({ site, date, onSaved, onClose }) {
  const [phase,  setPhase]  = useState('loading')   // 'loading' | 'confirm' | 'saving' | 'error'
  const [coords, setCoords] = useState(null)         // { lon, lat }
  const [error,  setError]  = useState('')

  useEffect(() => {
    let cancelled = false
    setPhase('loading')
    setError('')
    fetchTilesetCenter(date.originalTilesetUrl)
      .then(c => { if (!cancelled) { setCoords(c); setPhase('confirm') } })
      .catch(e => { if (!cancelled) { setError(e.message); setPhase('error') } })
    return () => { cancelled = true }
  }, [date.originalTilesetUrl])

  async function handleConfirm() {
    if (!coords) return
    setPhase('saving')
    setError('')
    try {
      await updateProject(site.id, {
        name:         site.name,
        description:  site.description ?? '',
        centerLon:    coords.lon,
        centerLat:    coords.lat,
        cameraHeight: site.cameraHeight ?? 600,
        status:       site.status ?? 'ACTIVE',
      })
      // Store which date provided these coordinates (frontend-only, persists in localStorage)
      localStorage.setItem(`center-from-date-${site.id}`, date.id)
      onSaved()
    } catch (e) {
      setError(e.message)
      setPhase('confirm')
    }
  }

  function handleBackdrop(e) {
    if (e.target === e.currentTarget && phase !== 'saving') onClose()
  }

  return (
    <div className="modal-backdrop" onClick={handleBackdrop}>
      <div className="modal-box modal-box-sm dup-setpos-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">📍 위치로 지정</span>
          <button className="modal-close" onClick={onClose} disabled={phase === 'saving'}>✕</button>
        </div>

        <div className="modal-body">
          {phase === 'loading' && (
            <div className="dup-setpos-loading">
              <span className="dup-setpos-spinner" />
              좌표 읽는 중…
            </div>
          )}

          {phase === 'error' && (
            <div className="modal-error">{error}</div>
          )}

          {(phase === 'confirm' || phase === 'saving') && coords && (
            <div className="dup-setpos-confirm">
              <p className="dup-setpos-question">
                이 좌표를 프로젝트 위치로 지정할까요?
              </p>
              <div className="dup-setpos-coordgrid">
                <div className="dup-setpos-coordrow">
                  <span className="dup-setpos-coordlabel">경도 (Lon)</span>
                  <span className="dup-setpos-coordval">{coords.lon.toFixed(5)}</span>
                </div>
                <div className="dup-setpos-coordrow">
                  <span className="dup-setpos-coordlabel">위도 (Lat)</span>
                  <span className="dup-setpos-coordval">{coords.lat.toFixed(5)}</span>
                </div>
              </div>
              {error && <div className="modal-error">{error}</div>}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="modal-btn-secondary" onClick={onClose} disabled={phase === 'saving'}>
            취소
          </button>
          <button
            className="modal-btn-primary"
            onClick={handleConfirm}
            disabled={phase !== 'confirm' && phase !== 'saving'}
          >
            {phase === 'saving' ? '저장 중…' : '지정'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Manual location modal — type in lon/lat directly ─────────────────────
// Alternative to SetLocationModal for when the desired coordinates don't
// come from any uploaded tileset. Saving here clears the
// `center-from-date-${site.id}` flag, since the coordinates no longer
// originate from a specific date's data — this re-enables the "위치로 지정"
// button on every date row/preview (none of them is "already set" anymore).

function ManualLocationModal({ site, onSaved, onClose }) {
  const [lon,     setLon]     = useState(site.centerLon != null ? String(parseFloat(site.centerLon.toFixed(5))) : '')
  const [lat,     setLat]     = useState(site.centerLat != null ? String(parseFloat(site.centerLat.toFixed(5))) : '')
  const [error,   setError]   = useState('')
  const [saving,  setSaving]  = useState(false)

  function parseCoord(value, min, max) {
    const n = parseFloat(value)
    if (Number.isNaN(n)) return null
    if (n < min || n > max) return null
    return n
  }

  async function handleSave() {
    const lonNum = parseCoord(lon, -180, 180)
    const latNum = parseCoord(lat, -90, 90)
    if (lonNum === null) return setError('경도는 -180 ~ 180 사이의 숫자여야 합니다.')
    if (latNum === null) return setError('위도는 -90 ~ 90 사이의 숫자여야 합니다.')

    setSaving(true)
    setError('')
    try {
      await updateProject(site.id, {
        name:         site.name,
        description:  site.description ?? '',
        centerLon:    lonNum,
        centerLat:    latNum,
        cameraHeight: site.cameraHeight ?? 600,
        status:       site.status ?? 'ACTIVE',
      })
      // These coordinates didn't come from any date's tileset — clear the
      // flag so every date's "위치로 지정" button becomes available again.
      localStorage.removeItem(`center-from-date-${site.id}`)
      onSaved()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  function handleBackdrop(e) {
    if (e.target === e.currentTarget && !saving) onClose()
  }

  return (
    <div className="modal-backdrop" onClick={handleBackdrop}>
      <div className="modal-box modal-box-sm" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">✎ 좌표 직접 입력</span>
          <button className="modal-close" onClick={onClose} disabled={saving}>✕</button>
        </div>

        <div className="modal-body">
          <div className="dup-manual-coords-row">
            <div className="modal-field">
              <label>경도 (Lon)</label>
              <input
                type="number"
                step="any"
                value={lon}
                onChange={e => { setLon(e.target.value); setError('') }}
                placeholder="예) 127.12345"
                disabled={saving}
                autoFocus
              />
            </div>
            <div className="modal-field">
              <label>위도 (Lat)</label>
              <input
                type="number"
                step="any"
                value={lat}
                onChange={e => { setLat(e.target.value); setError('') }}
                placeholder="예) 36.78901"
                disabled={saving}
              />
            </div>
          </div>
          <div className="modal-hint">
            데이터셋의 위치와 무관하게 프로젝트 위치를 직접 지정합니다.
          </div>
          {error && <div className="modal-error">{error}</div>}
        </div>

        <div className="modal-footer">
          <button className="modal-btn-secondary" onClick={onClose} disabled={saving}>
            취소
          </button>
          <button className="modal-btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? '저장 중…' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Single-date row ───────────────────────────────────────────────────────

function DateRow({
  site, date, onUploaded, onDeleted, blockReason,
  voxelRunning, onCancelVoxel,
  voxelPollingIds, computingId, onComputeVoxel,
  activePreview, onPreview,
}) {
  const [editing,         setEditing]         = useState(false)
  const [editObservedAt,  setEditObservedAt]  = useState(date.observedAt ?? '')
  const [editName,        setEditName]        = useState(date.name ?? '')
  const [editError,       setEditError]       = useState('')
  const [editSaving,      setEditSaving]      = useState(false)
  const [editProgress,    setEditProgress]    = useState('')

  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting,      setDeleting]      = useState(false)

  function cancelEdit() {
    setEditing(false)
    setEditObservedAt(date.observedAt ?? '')
    setEditName(date.name ?? '')
    setEditError('')
    setEditProgress('')
  }

  const hasData = !!date.datasetPath

  const isActivelyPolling = voxelPollingIds?.has(date.id) ?? false
  const isLocalComputing  = computingId === date.id
  const isBusy            = isActivelyPolling || isLocalComputing || voxelRunning
  const voxStatus         = date.voxelStatus ?? 'NONE'
  const canTrigger        = hasData
    && (voxStatus === 'NONE' || voxStatus === 'FAILED' || voxStatus === 'CANCELLED')
    && !isBusy
    && !blockReason

  async function handleSave() {
    if (blockReason) return setEditError(blockReason)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(editObservedAt)) return setEditError('날짜 형식은 YYYY-MM-DD여야 합니다.')
    if (!editName.trim())                              return setEditError('이름(설명)은 필수입니다.')
    setEditSaving(true)
    setEditError('')
    try {
      setEditProgress('저장 중…')
      await updateObservation(date.id, {
        name:       editName.trim(),
        observedAt: editObservedAt,
      })
      setEditProgress('완료!')
      setTimeout(() => { cancelEdit(); onUploaded() }, 800)
    } catch (e) {
      setEditError(e.message)
      setEditProgress('')
    } finally {
      setEditSaving(false)
    }
  }

  async function handleDelete() {
    if (blockReason) { alert(blockReason); setConfirmDelete(false); return }
    setDeleting(true)
    try {
      if (voxelRunning) {
        try { await onCancelVoxel(date.id) } catch (e) {
          console.warn('[DateRow.handleDelete] voxel cancel failed (continuing):', e.message)
        }
      }
      await deleteObservation(date.id)
      onDeleted()
    } catch (e) {
      alert(e.message)
    } finally {
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  const hasCoords = site.centerLat != null && site.centerLon != null

  return (
    <div className={`dup-date-card${editing ? ' dup-date-card-open' : ''}`}>
      {/* ── Header row ── */}
      <div className="dup-date-header">
        <div className="dup-date-info">
          <span className="dup-date-label">{isoToLabel(date.observedAt) || date.label}</span>
          <span className="dup-date-name" title={date.name}>{date.name}</span>
        </div>

        <div className="dup-date-actions" onClick={e => e.stopPropagation()}>
          {!editing && !confirmDelete && (
            <>
              <PreviewTrigger
                date={date}
                activePreview={activePreview}
                onPreview={onPreview}
              />

              <VoxelStatusBadge
                date={date}
                isBusy={isBusy}
                canTrigger={canTrigger}
                onCompute={onComputeVoxel}
              />

              {blockReason ? (
                <>
                  <button className="dup-icon-btn dup-icon-edit" disabled title={blockReason}>✎</button>
                  <button className="dup-icon-btn dup-icon-danger" disabled title={blockReason}>🗑</button>
                </>
              ) : (
                <>
                  <button
                    className="dup-icon-btn dup-icon-edit"
                    onClick={() => setEditing(true)}
                    disabled={voxelRunning}
                    title={voxelRunning ? 'Voxel 생성이 끝난 후 수정할 수 있습니다.' : '수정'}
                  >
                    ✎
                  </button>
                  <button
                    className="dup-icon-btn dup-icon-danger"
                    onClick={() => setConfirmDelete(true)}
                    title={voxelRunning ? 'Voxel 작업 중지 + 날짜 삭제' : '날짜 삭제'}
                  >
                    {voxelRunning ? '⛔🗑' : '🗑'}
                  </button>
                </>
              )}
            </>
          )}
          {confirmDelete && (
            <div className="dup-confirm-delete">
              <span>{voxelRunning ? 'Voxel 작업을 중지하고 삭제하시겠습니까?' : '삭제하시겠습니까?'}</span>
              <button className="dup-icon-btn dup-icon-danger" onClick={handleDelete} disabled={deleting}>
                {deleting ? '…' : (voxelRunning ? '중지 후 삭제' : '삭제')}
              </button>
              <button className="dup-icon-btn" onClick={() => setConfirmDelete(false)} disabled={deleting}>취소</button>
            </div>
          )}
        </div>
      </div>

      {/* ── Edit panel (expands below header) ── */}
      {editing && (
        <div className="dup-upload-body">
          <div className="modal-row">
            <div className="modal-field">
              <label>날짜 <span className="modal-hint">(YYYY-MM-DD)</span></label>
              <DateTextInput
                value={editObservedAt}
                onChange={v => { setEditObservedAt(v); setEditError('') }}
                autoFocus
                disabled={editSaving}
              />
            </div>
            <div className="modal-field">
              <label>이름 / 설명</label>
              <input
                type="text"
                value={editName}
                onChange={e => { setEditName(e.target.value); setEditError('') }}
                placeholder="예) 251106_둔포면"
                disabled={editSaving}
              />
            </div>
          </div>

          {editError    && <div className="modal-error">{editError}</div>}
          {editProgress && <div className="modal-progress">{editProgress}</div>}

          <div className="dup-actions">
            <button className="modal-btn-secondary" onClick={cancelEdit} disabled={editSaving}>
              취소
            </button>
            <button className="modal-btn-primary" onClick={handleSave} disabled={editSaving}>
              {editSaving ? '저장 중…' : '저장'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── New date card ─────────────────────────────────────────────────────────

function NewDateCard({ site, onCreated }) {
  const [open,        setOpen]        = useState(false)
  const [observedAt,  setObservedAt]  = useState('')
  const [name,        setName]        = useState('')
  const [datasetType, setDatasetType] = useState('pointcloud')
  const [files,       setFiles]       = useState([])
  const [dragOver,    setDragOver]    = useState(false)
  const [loading,     setLoading]     = useState(false)
  const [progress,    setProgress]    = useState('')
  const [error,       setError]       = useState('')
  const inputRef = useRef(null)

  function handleFileChange(e) { setFiles([...e.target.files]); setError('') }

  async function handleSubmit() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(observedAt)) return setError('날짜 형식은 YYYY-MM-DD여야 합니다.')
    if (!name.trim())                              return setError('이름(설명)은 필수입니다.')
    if (!files.length)                             return setError('파일을 선택하세요 — 데이터 파일이 필요합니다.')

    setLoading(true)
    setError('')
    try {
      await uploadObservation(site.id, {
        name:        name.trim(),
        observedAt:  observedAt,
        datasetType: datasetType,
        files,
        onProgress:  p => setProgress(progressLabel(p)),
      })
      setProgress('완료!')
      setObservedAt(''); setName(''); setFiles([])
      if (inputRef.current) inputRef.current.value = ''
      setTimeout(() => { setProgress(''); setOpen(false); onCreated() }, 800)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleDrop(e) {
    e.preventDefault(); setDragOver(false)
    const droppedFiles = await getDroppedFiles([...e.dataTransfer.items])
    if (!droppedFiles.length) return
    setFiles(droppedFiles); setError('')
  }

  function readAllEntries(reader) {
    return new Promise((resolve, reject) => {
      const all = []
      function readBatch() {
        reader.readEntries(entries => {
          if (!entries.length) { resolve(all); return }
          all.push(...entries)
          readBatch()
        }, reject)
      }
      readBatch()
    })
  }

  async function readEntry(entry, path = '') {
    if (entry.isFile) return new Promise((resolve, reject) => {
      entry.file(file => { file.relativePath = path + file.name; resolve([file]) }, reject)
    })
    if (entry.isDirectory) {
      const entries = await readAllEntries(entry.createReader())
      const results = []
      for (const child of entries)
        results.push(...await readEntry(child, path + entry.name + '/'))
      return results
    }
    return []
  }

  async function getDroppedFiles(items) {
    const fs = []
    for (const item of items) {
      const entry = item.webkitGetAsEntry?.()
      if (entry) fs.push(...await readEntry(entry))
    }
    return fs
  }

  const folderName =
    files[0]?.webkitRelativePath?.split('/')[0] ||
    files[0]?.relativePath?.split('/')[0] ||
    files[0]?.name

  return (
    <div className={`dup-date-card dup-new-card${open ? ' dup-date-card-open' : ''}`}>
      {!open ? (
        <button className="dup-new-trigger" onClick={() => setOpen(true)}>
          <span className="dup-new-plus">+</span>
          새 날짜 추가
        </button>
      ) : (
        <div className="dup-new-form">
          <div className="dup-new-title">새 날짜 추가</div>

          <div className="modal-row">
            <div className="modal-field">
              <label>날짜 <span className="modal-hint">(YYYY-MM-DD)</span></label>
              <DateTextInput
                value={observedAt}
                onChange={v => { setObservedAt(v); setError('') }}
                disabled={loading}
              />
            </div>
            <div className="modal-field">
              <label>이름 / 설명</label>
              <input
                type="text"
                value={name}
                onChange={e => { setName(e.target.value); setError('') }}
                placeholder="예) 251106_둔포면"
                disabled={loading}
              />
            </div>
          </div>

          <div className="modal-field">
            <label>데이터 유형</label>
            <div className="dup-type-toggle">
              <button
                className={`dup-type-btn${datasetType === 'pointcloud' ? ' active' : ''}`}
                onClick={() => setDatasetType('pointcloud')}
                disabled={loading}
              >
                ☁ Point Cloud
              </button>
              <button
                className={`dup-type-btn${datasetType === 'mesh' ? ' active' : ''}`}
                onClick={() => setDatasetType('mesh')}
                disabled={loading}
              >
                ◈ 3D Mesh
              </button>
            </div>
          </div>

          <div className="modal-field">
            <label>
              데이터 파일 <span className="modal-hint">(필수 — tileset.json 포함 폴더 또는 ZIP)</span>
            </label>
            <div
              className={`upload-dropzone${dragOver ? ' dragging' : ''}${files.length ? ' has-files' : ''}`}
              onClick={() => inputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
            >
              <input
                ref={inputRef}
                type="file"
                multiple
                webkitdirectory=""
                onChange={handleFileChange}
                disabled={loading}
              />
              {files.length === 0 ? (
                <div>폴더 또는 ZIP을 여기에 드래그<br/>또는 클릭하여 탐색</div>
              ) : (
                <div className="upload-selected upload-selected-vertical">
                  <div className="upload-icon">📁</div>
                  <strong className="upload-folder-name">{folderName}</strong>
                  <span className="upload-count">{files.length}개 파일</span>
                </div>
              )}
            </div>
          </div>

          {error    && <div className="modal-error">{error}</div>}
          {progress && <div className="modal-progress">{progress}</div>}

          <div className="dup-actions">
            <button
              className="modal-btn-secondary"
              onClick={() => {
                setOpen(false); setObservedAt(''); setName('')
                setDatasetType('pointcloud'); setFiles([])
                setError(''); setProgress('')
              }}
              disabled={loading}
            >
              취소
            </button>
            <button className="modal-btn-primary" onClick={handleSubmit} disabled={loading}>
              {loading ? '처리 중…' : '날짜 추가'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Mini Cesium preview pane ──────────────────────────────────────────────
//
// Creates its own Cesium.Viewer in a div inside the preview pane.
// Uses window.Cesium (set by cesiumInit.js) and window.customTerrain.
// Completely independent from the main window.viewer.
//
// IMPORTANT: The container div is ALWAYS in the DOM (even in empty state).
// Cesium.Viewer needs a real sized element — we init lazily on first preview
// click so the div has had at least one paint cycle to get its dimensions.

function MiniCesiumPreview({ preview, date, site, onSiteUpdated }) {
  const containerRef  = useRef(null)
  const miniViewerRef = useRef(null)
  const tilesetRef    = useRef(null)
  const initDoneRef   = useRef(false)
  const [coords, setCoords] = useState(null) // { lon, lat } of the currently previewed tileset's center
  const [settingPos, setSettingPos] = useState(false)

  // Read which date the project's current coordinates came from (stored in localStorage)
  const centerFromDateId = site ? localStorage.getItem(`center-from-date-${site.id}`) : null
  const posAlreadySet    = !!date && centerFromDateId === date.id

  // Destroy on unmount
  useEffect(() => {
    return () => {
      if (tilesetRef.current) {
        try { miniViewerRef.current?.scene.primitives.remove(tilesetRef.current) } catch (_) {}
        tilesetRef.current = null
      }
      if (miniViewerRef.current && !miniViewerRef.current.isDestroyed()) {
        try { miniViewerRef.current.destroy() } catch (_) {}
        miniViewerRef.current = null
      }
    }
  }, [])

  function ensureViewer() {
    if (initDoneRef.current) return miniViewerRef.current
    const Cesium = window.Cesium
    const el     = containerRef.current
    if (!Cesium || !el) return null

    initDoneRef.current = true
    try {
      const v = new Cesium.Viewer(el, {
        terrainProvider:         window.customTerrain ?? new Cesium.EllipsoidTerrainProvider(),
        animation:               false,
        baseLayerPicker:         false,
        fullscreenButton:        false,
        geocoder:                false,
        homeButton:              false,
        infoBox:                 false,
        navigationHelpButton:    false,
        sceneModePicker:         false,
        selectionIndicator:      false,
        timeline:                false,
        requestRenderMode:       true,
        maximumRenderTimeChange: Infinity,
        msaaSamples:             4,
      })
      v.scene.globe.enableLighting          = true
      v.scene.globe.depthTestAgainstTerrain = true
      v.scene.globe.showGroundAtmosphere    = true
      v.scene.backgroundColor = Cesium.Color.fromCssColorString('#07070d')
      v.scene.highDynamicRange = false
      miniViewerRef.current = v
      return v
    } catch (e) {
      console.warn('[MiniCesiumPreview] init failed:', e)
      return null
    }
  }

  // Load tileset whenever preview changes
  useEffect(() => {
    if (!preview || !date) { setCoords(null); return }

    const Cesium = window.Cesium
    if (!Cesium) return

    // Clear the previous tileset's coords immediately so stale numbers
    // don't linger on screen while the new one loads.
    setCoords(null)

    // Use rAF so the container's display:block has taken effect and has real dimensions
    const raf = requestAnimationFrame(() => {
      // Init viewer lazily — container is guaranteed visible now
      const v = ensureViewer()
      if (!v || v.isDestroyed()) return

      // Force Cesium to re-measure the canvas after display change
      try { v.resize() } catch (_) {}

      // Clear previous tileset
      if (tilesetRef.current) {
        try { v.scene.primitives.remove(tilesetRef.current) } catch (_) {}
        tilesetRef.current = null
      }

      const isVox  = preview.layer === 'vox'
      const url    = isVox ? date.voxelTilesetUrl : date.originalTilesetUrl
      // Voxel tilesets are mesh-format 3D Tiles and need the same modelMatrix
      // ground-plane correction as regular mesh datasets (mirrors _loadTileset in layers.js).
      const needsModelMatrix = isVox || date.datasetType === 'mesh'
      if (!url) return

      let cancelled = false
      ;(async () => {
        try {
          const ts = await Cesium.Cesium3DTileset.fromUrl(url, {
            maximumScreenSpaceError: needsModelMatrix ? 8 : 2,
          })
          if (cancelled || v.isDestroyed()) { try { ts.destroy() } catch (_) {}; return }

          v.scene.primitives.add(ts)
          ts.show = true

          // Point cloud shading for PC datasets
          if (!needsModelMatrix) {
            ts.pointCloudShading.attenuation        = true
            ts.pointCloudShading.maximumAttenuation = 1.0
          }

          // Mirror the same modelMatrix correction used in _loadTileset (layers.js):
          // translates the tileset so its bounding-sphere center sits at the correct
          // geodetic position on the ellipsoid.
          if (needsModelMatrix) {
            const c  = ts.boundingSphere.center
            const ca = Cesium.Cartographic.fromCartesian(c)
            const o  = Cesium.Cartesian3.fromRadians(ca.longitude, ca.latitude, ca.height)
            ts.modelMatrix = Cesium.Matrix4.fromTranslation(
              Cesium.Cartesian3.subtract(o, c, new Cesium.Cartesian3())
            )

            // PBR lighting pass for mesh/voxel tiles in the preview window.
            // Adds a simple Lambertian-ish term on top of Cesium's PBR pipeline
            // so meshes/voxels don't look flat under the preview's lighting.
            ts.customShader = new Cesium.CustomShader({
              lightingModel: Cesium.LightingModel.PBR,
              fragmentShaderText: `
                void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
                  vec3 normalWC = fsInput.attributes.normalWC;
                  vec3 lightDirWC = normalize(vec3(0.35, 0.55, 0.75));
                  float ndotl = clamp(dot(normalWC, lightDirWC), 0.0, 1.0);
                  float wrapped = ndotl * 0.5 + 0.5; // soft wraparound so shadow side isn't pitch black
                  material.diffuse *= mix(0.55, 1.15, wrapped);
                  material.specular = vec3(0.04);
                  material.roughness = clamp(material.roughness, 0.35, 1.0);
                }
              `,
            })
          }

          tilesetRef.current = ts

          // Read camera position from the tileset that has a TRUSTWORTHY region.
          // Originally this always read date.originalTilesetUrl (the PC tileset), even
          // when previewing a mesh — that part of the original bug is fixed by reading
          // from `url` (whatever was actually loaded into `ts`) for PC and mesh previews.
          //
          // Voxel tileset.json files are the exception: their root region has been
          // observed to be a placeholder/degenerate value (e.g. lon 126 / lat 36 —
          // suspiciously round numbers nowhere near the actual site, producing a
          // bounding-sphere height in the hundreds-of-km range). That's a backend
          // generation issue, not something to fix from camera code. So for voxel
          // previews specifically, borrow the camera center from the same
          // observation's original PC/mesh tileset instead of trusting the voxel's
          // own (unreliable) region — this matches the voxel's own modelMatrix
          // correction above, which already aligns the voxel geometry with the
          // PC/mesh footprint on the ground.
          const cameraSourceUrl = (isVox && date.originalTilesetUrl) ? date.originalTilesetUrl : url
          const { lon, lat } = await fetchTilesetCenter(cameraSourceUrl)
          if (!cancelled) setCoords({ lon, lat })

          // Debug: print where the camera is actually flying, alongside the
          // tileset's own bounding-sphere geodetic position for comparison.
          const bsCarto = Cesium.Cartographic.fromCartesian(ts.boundingSphere.center)
          console.log('[MiniCesiumPreview] camera flyTo destination —', {
            url,
            cameraSourceUrl,
            datasetType: date.datasetType,
            layer: preview.layer,
            tilesetCenter_lon: lon,
            tilesetCenter_lat: lat,
            cameraDestination_lon: lon,
            cameraDestination_lat: lat - 0.006,
            cameraDestination_height: 600,
            boundingSphere_lon: Cesium.Math.toDegrees(bsCarto.longitude),
            boundingSphere_lat: Cesium.Math.toDegrees(bsCarto.latitude),
            boundingSphere_height: bsCarto.height,
          })

          v.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(lon, lat - 0.006, 600),
            orientation: { heading: 0, pitch: Cesium.Math.toRadians(-40), roll: 0 },
            duration: 1.2,
          })

          ts.allTilesLoaded.addEventListener(() => {
            if (!v.isDestroyed()) v.scene.requestRender()
          })
          v.scene.requestRender()
        } catch (e) {
          if (!cancelled) console.warn('[MiniCesiumPreview] load failed:', url, e)
        }
      })()

      // Store cancel fn on ref so the cleanup below can reach it
      tilesetRef._cancelLoad = () => { cancelled = true }
    })

    return () => {
      cancelAnimationFrame(raf)
      if (tilesetRef._cancelLoad) { tilesetRef._cancelLoad(); tilesetRef._cancelLoad = null }
    }
  }, [preview?.dateId, preview?.layer])

  // Always render the container div so Cesium has a real DOM node to attach to.
  // Show/hide via CSS only — never unmount.
  return (
    <>
      {/* Empty state — shown when no preview is active */}
      {!preview && (
        <div className="dup-preview-empty">
          <div className="dup-preview-empty-icon">◈</div>
          <div className="dup-preview-empty-text">
            날짜의 <strong>PC</strong> 또는 <strong>VOX</strong> 버튼을<br/>
            눌러 여기서 미리보기
          </div>
        </div>
      )}

      {/* Meta row — shown only when a preview is selected */}
      {preview && (
        <div className="dup-preview-viewer-meta">
          <span className="dup-preview-date">
            {date ? (isoToLabel(date.observedAt) || date.label) : '—'}
          </span>
          <span className={`dup-preview-type-badge ${
            preview.layer === 'vox' ? 'ptb-vox'
            : date?.datasetType === 'mesh' ? 'ptb-mesh'
            : 'ptb-pc'
          }`}>
            {preview.layer === 'vox' ? 'Voxel'
              : date?.datasetType === 'mesh' ? '3D Mesh'
              : 'Point Cloud'}
          </span>
          {coords && (
            <span className="dup-preview-coords" title="타일셋 중심 좌표 (경도, 위도)">
              📍 {coords.lon.toFixed(5)}, {coords.lat.toFixed(5)}
            </span>
          )}
          {date && (
            <button
              className={`dup-preview-setpos-btn${posAlreadySet ? ' dup-preview-setpos-btn-set' : ''}`}
              onClick={() => setSettingPos(true)}
              disabled={!date.originalTilesetUrl || posAlreadySet}
              title={!date.originalTilesetUrl
                ? '데이터 업로드 후 사용 가능'
                : posAlreadySet
                ? '이 날짜의 위치가 현재 설정되어 있습니다'
                : '이 좌표를 프로젝트 위치로 지정'}
            >
              {posAlreadySet ? '✓ 위치 설정됨' : '위치로 지정'}
            </button>
          )}
        </div>
      )}

      {/* Set location modal — confirms saving this date's tileset center as the project's coords */}
      {settingPos && site && date && (
        <SetLocationModal
          site={site}
          date={date}
          onSaved={() => { setSettingPos(false); onSiteUpdated?.() }}
          onClose={() => setSettingPos(false)}
        />
      )}

      {/* Cesium container — always in DOM, sized only when preview is active */}
      <div
        ref={containerRef}
        className="dup-mini-cesium"
        style={{ display: preview ? 'block' : 'none' }}
      />
    </>
  )
}

// ── Page root ─────────────────────────────────────────────────────────────

export default function DataUploadPage({
  site,
  onUploaded,
  onCreated,
  onSiteUpdated,
  blockedDateInfo,
  voxelPollingIds,
  onCancelVoxel,
  onComputeVoxel,
  computingId,
}) {
  if (!site) return null

  const hasCoords = site.centerLat != null && site.centerLon != null
  const hasDates  = (site.dates?.length ?? 0) > 0

  const [activePreview, setActivePreview] = useState(null)  // { dateId, layer } | null
  const [manualPos, setManualPos] = useState(false)

  function handlePreview(date, layer) {
    // Clicking the already-active button toggles it off
    if (activePreview?.dateId === date.id && activePreview?.layer === layer) {
      setActivePreview(null)
      return
    }
    setActivePreview({ dateId: date.id, layer })
  }

  const previewDate = activePreview
    ? site.dates.find(d => d.id === activePreview.dateId)
    : null

  return (
    <div className="dup-overlay">
      <div className="dup-inner dup-inner-wide">

        <div className="dup-header">
          <div>
            <div className="dup-title">관측 데이터</div>
            <div className="dup-subtitle">{site.name ?? site.id}</div>
          </div>
          <div className="dup-hint">
            각 날짜에는 단일 데이터셋(포인트 클라우드 또는 3D 메쉬)이 있습니다.
          </div>
        </div>

        {/* ── Coordinates display ── */}
        {hasCoords && (
          <div className="dup-coords-info">
            <span className="dup-coords-label">프로젝트 위치:</span>
            <span className="dup-coords-value">{site.centerLon.toFixed(5)}, {site.centerLat.toFixed(5)}</span>
            <button className="dup-manual-coords-btn" onClick={() => setManualPos(true)}>
              ✎ 좌표 직접 입력
            </button>
          </div>
        )}

        {!hasDates && (
          <div className="dup-nodates-banner">
            <span>➕</span>
            <span>날짜를 추가해 데이터를 업로드하세요.</span>
          </div>
        )}

        {hasDates && !hasCoords && (
          <div className="dup-nocoords-banner">
            <span>⚠️</span>
            <span>
              위치가 설정되지 않았습니다. PC 또는 VOX로 미리보기를 연 다음 <strong>위치로 지정</strong> 버튼을 눌러 설정하거나,{' '}
              <button className="dup-manual-coords-btn dup-manual-coords-btn-inline" onClick={() => setManualPos(true)}>
                ✎ 좌표 직접 입력
              </button>
              {' '}으로 설정하세요.
            </span>
          </div>
        )}

        {/* ── Two-column body: list left, mini-viewer right ── */}
        <div className="dup-body-cols">

          <div className="dup-list-col">
            <div className="dup-list">
              {site.dates.map(d => (
                <DateRow
                  key={d.id}
                  site={site}
                  date={d}
                  onUploaded={onUploaded}
                  onDeleted={onCreated}
                  blockReason={blockedDateInfo?.get(d.id) ?? null}
                  voxelRunning={voxelPollingIds?.has(d.id) ?? false}
                  onCancelVoxel={onCancelVoxel}
                  voxelPollingIds={voxelPollingIds}
                  computingId={computingId}
                  onComputeVoxel={onComputeVoxel}
                  activePreview={activePreview}
                  onPreview={handlePreview}
                />
              ))}
              <NewDateCard site={site} onCreated={onCreated} />
            </div>
          </div>

          <div className="dup-preview-col">
            <div className="dup-preview-pane">
              <div className="dup-preview-pane-label">미리보기</div>
              <MiniCesiumPreview preview={activePreview} date={previewDate} site={site} onSiteUpdated={onSiteUpdated} />
            </div>
          </div>

        </div>

        {manualPos && (
          <ManualLocationModal
            site={site}
            onSaved={() => { setManualPos(false); onSiteUpdated?.() }}
            onClose={() => setManualPos(false)}
          />
        )}
      </div>
    </div>
  )
}