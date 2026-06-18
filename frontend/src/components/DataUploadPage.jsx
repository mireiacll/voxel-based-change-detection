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

import { useState, useRef, useEffect } from 'react'
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
      <div className="modal-box modal-box-sm" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">위치로 지정</span>
          <button className="modal-close" onClick={onClose} disabled={phase === 'saving'}>✕</button>
        </div>

        <div className="modal-body">
          {phase === 'loading' && (
            <div className="dup-setpos-loading">좌표 읽는 중…</div>
          )}

          {phase === 'error' && (
            <div className="modal-error">{error}</div>
          )}

          {(phase === 'confirm' || phase === 'saving') && coords && (
            <div className="dup-setpos-confirm">
              <p className="dup-setpos-question">
                이 좌표를 프로젝트 위치로 지정할까요?
              </p>
              <div className="dup-setpos-preview">
                {coords.lon.toFixed(5)}, {coords.lat.toFixed(5)}
              </div>
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

// ── Single-date row ───────────────────────────────────────────────────────

function DateRow({
  site, date, onUploaded, onDeleted, onSiteUpdated, blockReason,
  voxelRunning, onCancelVoxel,
  voxelPollingIds, computingId, onComputeVoxel,
}) {
  const [editing,         setEditing]         = useState(false)
  const [editObservedAt,  setEditObservedAt]  = useState(date.observedAt ?? '')
  const [editName,        setEditName]        = useState(date.name ?? '')
  const [editError,       setEditError]       = useState('')
  const [editSaving,      setEditSaving]      = useState(false)
  const [editProgress,    setEditProgress]    = useState('')

  const [settingPos,  setSettingPos]  = useState(false)

  // Read which date the coordinates came from (stored in localStorage)
  const centerFromDateId = localStorage.getItem(`center-from-date-${site.id}`)

  function cancelEdit() {
    setEditing(false)
    setEditObservedAt(date.observedAt ?? '')
    setEditName(date.name ?? '')
    setEditError('')
    setEditProgress('')
  }

  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting,      setDeleting]      = useState(false)

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
              <DatasetTypeBadge type={date.datasetType} />

              <VoxelStatusBadge
                date={date}
                isBusy={isBusy}
                canTrigger={canTrigger}
                onCompute={onComputeVoxel}
              />

              {/* ── Select as location button — uses this date's tileset ── */}
              <button
                className={`dup-icon-btn dup-setpos-btn${centerFromDateId === date.id ? ' dup-setpos-btn-set' : ' dup-setpos-btn-unset'}`}
                onClick={() => setSettingPos(true)}
                disabled={!date.originalTilesetUrl || centerFromDateId === date.id}
                title={!date.originalTilesetUrl
                  ? '데이터 업로드 후 사용 가능'
                  : centerFromDateId === date.id
                  ? '이 날짜의 위치가 현재 설정되어 있습니다'
                  : '위치로 지정'}
              >
                {centerFromDateId === date.id ? '✓ 위치 설정됨' : '📍 위치로 지정'}
              </button>

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

      {/* ── Set location modal (floating, independent of row layout) ── */}
      {settingPos && (
        <SetLocationModal
          site={site}
          date={date}
          onSaved={() => { setSettingPos(false); onSiteUpdated?.() }}
          onClose={() => setSettingPos(false)}
        />
      )}

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

  return (
    <div className="dup-overlay">
      <div className="dup-inner">

        <div className="dup-header">
          <div>
            <div className="dup-title">데이터 업로드</div>
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
          </div>
        )}

        {/* ── No-dates hint (shown before any date exists) ── */}
        {!hasDates && (
          <div className="dup-nodates-banner">
            <span>➕</span>
            <span>날짜를 추가해 데이터를 업로드하세요.</span>
          </div>
        )}

        {/* ── No-coords banner (shown once at least one date exists) ── */}
        {hasDates && !hasCoords && (
          <div className="dup-nocoords-banner">
            <span>⚠️</span>
            <span>
              위치가 설정되지 않았습니다. 날짜 행의 <strong>위치로 지정</strong> 버튼을 눌러 설정하세요.
            </span>
          </div>
        )}

        <div className="dup-list">
          {site.dates.map(d => (
            <DateRow
              key={d.id}
              site={site}
              date={d}
              onUploaded={onUploaded}
              onDeleted={onCreated}
              onSiteUpdated={onSiteUpdated}
              blockReason={blockedDateInfo?.get(d.id) ?? null}
              voxelRunning={voxelPollingIds?.has(d.id) ?? false}
              onCancelVoxel={onCancelVoxel}
              voxelPollingIds={voxelPollingIds}
              computingId={computingId}
              onComputeVoxel={onComputeVoxel}
            />
          ))}
          <NewDateCard site={site} onCreated={onCreated} />
        </div>

      </div>
    </div>
  )
}