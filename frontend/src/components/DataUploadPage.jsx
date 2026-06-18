/**
 * DataUploadPage.jsx
 *
 * Full-screen overlay shown when the "데이터 업로드" tab is active.
 * Lists all survey dates for the active site.
 * Each date has edit-label and delete actions, AND now shows voxel status
 * with a compute trigger (moved here from Panel's "Voxel Calculation" section).
 *
 * Props
 * ─────
 *   site            — site object (required)
 *   onUploaded      — () => void   called after any successful upload (triggers site refresh)
 *   onCreated       — () => void   called after date creation / deletion
 *   blockedDateInfo — Map<dateId, reason> dates locked by a running diff
 *   voxelPollingIds — Set<dateId>  dates whose voxel job is being polled
 *   onCancelVoxel   — (dateId) => Promise<void>
 *   onComputeVoxel  — (dateId) => Promise<void>   NEW — triggers voxel computation
 *   computingId     — dateId | null               NEW — which date is being computed locally
 *
 * API migration notes
 * ───────────────────
 * All calls now go through api.js → coworker API (localhost:8080).
 *   create date       → uploadObservation(projectId, { name, observedAt, files })
 *   edit              → updateObservation(date.id, { name, observedAt })   — metadata only
 *   delete date       → deleteObservation(date.id)
 */

import { useState, useRef } from 'react'
import {
  uploadObservation,
  updateObservation,
  deleteObservation,
} from '../api'

/** Format a YYYY-MM-DD string into a pretty label like "Jun 1, 2026". */
function isoToLabel(iso) {
  if (!iso) return iso
  const [year, month, day] = iso.split('-')
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const m = MONTHS[parseInt(month, 10) - 1] ?? month
  return `${m} ${parseInt(day, 10)}, ${year}`
}

/**
 * Map an api.js uploadObservation onProgress({ phase, pct }) event to a
 * user-facing Korean status message.
 *   checking  — a single .zip is being validated/normalised (no "zipping")
 *   zipping   — a dropped folder is being bundled into a zip (0–100%)
 *   uploading — the request is being sent to the server
 */
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
 * Voxel status badge with full descriptive labels for the DataUpload context,
 * where there is more horizontal space than the Panel sidebar.
 *
 * Shows status text and, when computation can be triggered, a compute button.
 */
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
    // NONE — only show badge if there's no dataset (nothing to compute)
    if (!date.datasetPath) {
      badge = <span className="vst-badge vst-none">Voxel 미생성</span>
    } else {
      badge = null // canTrigger button speaks for itself
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

/**
 * Single text input that auto-formats digits into YYYY-MM-DD as you type.
 * Replaces the native <input type="date">, whose segment order/behavior
 * is locale-dependent and fiddly to edit.
 *
 *   value    — "YYYY-MM-DD" or "" (used only to seed the field on mount)
 *   onChange — (value) => void, called with "YYYY-MM-DD" once 8 digits
 *              have been typed, or "" while incomplete (so the existing
 *              /^\d{4}-\d{2}-\d{2}$/ validation still works)
 */
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

// ── Single-date row ───────────────────────────────────────────────────────

function DateRow({
  site, date, onUploaded, onDeleted, blockReason,
  voxelRunning, onCancelVoxel,
  // voxel computation — new
  voxelPollingIds, computingId, onComputeVoxel,
}) {
  // date.id   = stringified numeric observation id  (e.g. "3")
  // date.name = raw observation name from API       (e.g. "260601")
  const [editing,         setEditing]         = useState(false)
  const [editObservedAt,  setEditObservedAt]  = useState(date.observedAt ?? '')
  const [editName,        setEditName]        = useState(date.name ?? '')
  const [editError,       setEditError]       = useState('')
  const [editSaving,      setEditSaving]      = useState(false)
  const [editProgress,    setEditProgress]    = useState('')

  function cancelEdit() {
    setEditing(false)
    setEditObservedAt(date.observedAt ?? '')
    setEditName(date.name ?? '')
    setEditError('')
    setEditProgress('')
  }

  // Delete confirm state
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting,      setDeleting]      = useState(false)

  const hasData = !!date.datasetPath

  // Voxel status helpers
  const isActivelyPolling = voxelPollingIds?.has(date.id) ?? false
  const isLocalComputing  = computingId === date.id
  const isBusy            = isActivelyPolling || isLocalComputing || voxelRunning
  const voxStatus         = date.voxelStatus ?? 'NONE'
  const canTrigger        = hasData
    && (voxStatus === 'NONE' || voxStatus === 'FAILED' || voxStatus === 'CANCELLED')
    && !isBusy
    && !blockReason

  // ── Edit: no file → PUT metadata only; file picked → delete + recreate ──

  async function handleSave() {
    if (blockReason) return setEditError(blockReason)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(editObservedAt)) return setEditError('날짜 형식은 YYYY-MM-DD여야 합니다.')
    if (!editName.trim())                              return setEditError('이름(설명)은 필수입니다.')
    console.log('[DateRow.handleSave] date.id:', date.id, 'editObservedAt:', editObservedAt, 'editName:', editName)
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
      console.error('[DateRow.handleSave] FAILED:', e.message, e)
      setEditError(e.message)
      setEditProgress('')
    } finally {
      setEditSaving(false)
    }
  }

  async function handleDelete() {
    if (blockReason) { alert(blockReason); setConfirmDelete(false); return }
    console.log('[DateRow.handleDelete] deleting date.id:', date.id, 'date.name:', date.name)
    setDeleting(true)
    try {
      // Deleting must work regardless of an in-progress voxelizer — cancel
      // it first so we don't leave an orphaned job, but don't let a cancel
      // failure block the deletion itself (the observation is going away
      // either way, so best-effort cancel + swallow errors here).
      if (voxelRunning) {
        console.log('[DateRow.handleDelete] voxel running — cancelling first, date.id:', date.id)
        try {
          await onCancelVoxel(date.id)
        } catch (e) {
          console.warn('[DateRow.handleDelete] voxel cancel before delete failed (continuing anyway):', e.message)
        }
      }
      await deleteObservation(date.id)
      console.log('[DateRow.handleDelete] deleted successfully')
      onDeleted()
    } catch (e) {
      console.error('[DateRow.handleDelete] FAILED:', e.message, e)
      alert(e.message)
    } finally {
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

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

              {/* ── Voxel status (new) ── */}
              <VoxelStatusBadge
                date={date}
                isBusy={isBusy}
                canTrigger={canTrigger}
                onCompute={onComputeVoxel}
              />

              {blockReason ? (
                // A running diff depends on this date — block edit/delete
                // entirely instead of cancelling the diff out from under
                // the user. (Voxel-running never reaches this branch since
                // a diff can't be running on a date that isn't voxelized.)
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

    console.log('[NewDateCard.handleSubmit] site.id:', site.id, 'observedAt:', observedAt, 'name:', name, 'files:', files.length, files.map(f => f.webkitRelativePath || f.relativePath || f.name))

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
      console.log('[NewDateCard.handleSubmit] upload succeeded')
      setProgress('완료!')
      setObservedAt(''); setName(''); setFiles([])
      if (inputRef.current) inputRef.current.value = ''
      setTimeout(() => { setProgress(''); setOpen(false); onCreated() }, 800)
    } catch (e) {
      console.error('[NewDateCard.handleSubmit] FAILED:', e.message, e)
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
            <button className="modal-btn-secondary" onClick={() => { setOpen(false); setObservedAt(''); setName(''); setDatasetType('pointcloud'); setFiles([]); setError(''); setProgress('') }} disabled={loading}>
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
  blockedDateInfo,
  voxelPollingIds,
  onCancelVoxel,
  onComputeVoxel,   // NEW — (dateId) => Promise<void>
  computingId,      // NEW — dateId | null (which date is being locally computed)
}) {
  if (!site) return null

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
            />
          ))}
          <NewDateCard site={site} onCreated={onCreated} />
        </div>

      </div>
    </div>
  )
}