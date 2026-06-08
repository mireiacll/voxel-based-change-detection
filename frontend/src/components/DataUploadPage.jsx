/**
 * DataUploadPage.jsx
 *
 * Full-screen overlay shown when the "데이터 업로드" tab is active.
 * Lists all survey dates for the active site.
 * Each date has upload, edit-label, and delete actions.
 * A "+ New Date" card lets you create a date and upload its dataset in one step.
 *
 * Props
 * ─────
 *   site       — site object (required)
 *   onUploaded — () => void   called after any successful upload (triggers site refresh)
 *   onCreated  — () => void   called after date creation
 */

import { useState, useRef, useEffect } from 'react'

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000'

const MONTHS = {
  '01': 'Jan', '02': 'Feb', '03': 'Mar', '04': 'Apr',
  '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Aug',
  '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dec',
}

function autoLabel(code) {
  const m = code.match(/^(\d{2})(\d{2})(\d{2})$/)
  if (!m) return ''
  const [, yy, mm, dd] = m
  return `${MONTHS[mm] || mm} ${parseInt(dd, 10)}, 20${yy}`
}

function DatasetTypeBadge({ type }) {
  if (!type) return <span className="dup-badge dup-badge-none">미업로드</span>
  if (type === 'mesh')
    return <span className="dup-badge dup-badge-mesh">3D Mesh</span>
  return <span className="dup-badge dup-badge-pc">Point Cloud</span>
}

// ── Single-date row ───────────────────────────────────────────────────────

function DateRow({ site, date, onUploaded, onDeleted }) {
  const [open,        setOpen]        = useState(false)
  const [files,       setFiles]       = useState([])
  const [dragOver,    setDragOver]    = useState(false)
  const [loading,     setLoading]     = useState(false)
  const [progress,    setProgress]    = useState('')
  const [error,       setError]       = useState('')
  const [datasetType, setDatasetType] = useState(date.datasetType || 'pointcloud')

  // Edit state — code (YYMMDD) + auto-generated label, mirrors new-date form
  const [editing,    setEditing]    = useState(false)
  const [editCode,   setEditCode]   = useState(date.id)
  const [editLabel,  setEditLabel]  = useState(date.label)
  const [editError,  setEditError]  = useState('')
  const [editSaving, setEditSaving] = useState(false)

  useEffect(() => {
    if (editing && /^\d{6}$/.test(editCode)) setEditLabel(autoLabel(editCode))
  }, [editCode, editing])

  // Delete confirm state
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting,      setDeleting]      = useState(false)

  const inputRef = useRef(null)

  function handleFileChange(e) {
    setFiles([...e.target.files])
    setError('')
  }

  async function handleUpload() {
    if (!files.length) return setError('파일을 선택하세요.')
    setLoading(true)
    setProgress('업로드 중…')
    setError('')
    try {
      const formData = new FormData()
      files.forEach(f => formData.append('files', f, f.webkitRelativePath || f.relativePath || f.name))
      const url = `${API_BASE}/api/sites/${site.id}/dates/${date.id}/upload?dataset_type=${datasetType}`
      const res  = await fetch(url, { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) { setError(data.detail || `Error ${res.status}`); return }
      setProgress('완료!')
      setFiles([])
      if (inputRef.current) inputRef.current.value = ''
      setTimeout(() => { setProgress(''); setOpen(false); onUploaded() }, 800)
    } catch (e) {
      setError('Network error: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleSaveLabel() {
    if (!/^\d{6}$/.test(editCode)) return setEditError('날짜 코드는 6자리여야 합니다 (YYMMDD).')
    if (!editLabel.trim())          return setEditError('레이블은 필수입니다.')
    setEditSaving(true)
    setEditError('')
    try {
      const res = await fetch(`${API_BASE}/api/sites/${site.id}/dates/${date.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label: editLabel.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setEditError(data.detail || `Error ${res.status}`); return }
      setEditing(false)
      onUploaded()
    } catch (e) {
      setEditError('Network error: ' + e.message)
    } finally {
      setEditSaving(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      const res = await fetch(`${API_BASE}/api/sites/${site.id}/dates/${date.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const data = await res.json()
        alert(data.detail || `Error ${res.status}`)
        return
      }
      onDeleted()
    } catch (e) {
      alert('Network error: ' + e.message)
    } finally {
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  // ── Folder drop — fixed readEntries 100-item limit ────────────────────
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

  async function handleDrop(e) {
    e.preventDefault()
    setDragOver(false)
    const droppedFiles = await getDroppedFiles([...e.dataTransfer.items])
    if (!droppedFiles.length) return
    setFiles(droppedFiles)
    setError('')
  }

  const folderName =
    files[0]?.webkitRelativePath?.split('/')[0] ||
    files[0]?.relativePath?.split('/')[0] ||
    files[0]?.name

  const hasData = !!date.datasetPath

  return (
    <div className={`dup-date-card${open ? ' dup-date-card-open' : ''}`}>
      <div className="dup-date-header" onClick={() => !loading && !editing && !confirmDelete && setOpen(v => !v)}>
        <div className="dup-date-info">
          {editing ? (
            <div className="dup-edit-label-row" onClick={e => e.stopPropagation()}>
              <input
                className="dup-edit-label-input dup-edit-label-code"
                value={editCode}
                maxLength={6}
                onChange={e => { setEditCode(e.target.value.replace(/\D/g, '')); setEditError('') }}
                onKeyDown={e => { if (e.key === 'Enter') handleSaveLabel(); if (e.key === 'Escape') setEditing(false) }}
                placeholder="YYMMDD"
                autoFocus
                disabled={editSaving}
              />
              <input
                className="dup-edit-label-input dup-edit-label-readonly"
                value={editLabel || '—'}
                readOnly
                tabIndex={-1}
                placeholder="레이블"
              />
              <button className="dup-icon-btn dup-icon-confirm" onClick={handleSaveLabel} disabled={editSaving} title="저장">✓</button>
              <button className="dup-icon-btn" onClick={() => { setEditing(false); setEditCode(date.id); setEditLabel(date.label); setEditError('') }} disabled={editSaving} title="취소">✕</button>
              {editError && <span className="dup-inline-error">{editError}</span>}
            </div>
          ) : (
            <>
              <span className="dup-date-label">{date.label}</span>
              <span className="dup-date-code">{date.id}</span>
              <DatasetTypeBadge type={date.datasetType} />
            </>
          )}
        </div>

        <div className="dup-date-actions" onClick={e => e.stopPropagation()}>
          {!editing && !confirmDelete && (
            <>
              <button
                className={`dup-upload-toggle${hasData ? ' has-data' : ''}`}
                onClick={() => setOpen(v => !v)}
                title={hasData ? '데이터 교체' : '데이터 업로드'}
              >
                {hasData ? '🔁 교체' : '↑ 업로드'}
              </button>
              <button
                className="dup-icon-btn"
                onClick={() => { setEditing(true); setEditLabel(date.label); setOpen(false) }}
                title="레이블 수정"
              >
                ✎
              </button>
              <button
                className="dup-icon-btn dup-icon-danger"
                onClick={() => { setConfirmDelete(true); setOpen(false) }}
                title="날짜 삭제"
              >
                🗑
              </button>
            </>
          )}
          {confirmDelete && (
            <div className="dup-confirm-delete">
              <span>삭제하시겠습니까?</span>
              <button className="dup-icon-btn dup-icon-danger" onClick={handleDelete} disabled={deleting}>
                {deleting ? '…' : '삭제'}
              </button>
              <button className="dup-icon-btn" onClick={() => setConfirmDelete(false)} disabled={deleting}>취소</button>
            </div>
          )}
        </div>
      </div>

      {open && (
        <div className="dup-upload-body">
          {hasData && (
            <div className="dup-current">
              <span className="dup-current-label">현재:</span>
              <code>{date.datasetPath}</code>
            </div>
          )}

          <div className="modal-field" style={{ marginBottom: 10 }}>
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
          {error    && <div className="modal-error">{error}</div>}
          {progress && <div className="modal-progress">{progress}</div>}
          <div className="dup-actions">
            <button className="modal-btn-secondary" onClick={() => { setOpen(false); setFiles([]) }} disabled={loading}>
              취소
            </button>
            <button className="modal-btn-primary" onClick={handleUpload} disabled={loading || !files.length}>
              {loading ? '업로드 중…' : '업로드'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── New date card ─────────────────────────────────────────────────────────

function NewDateCard({ site, onCreated }) {
  const [open,         setOpen]         = useState(false)
  const [dateCode,     setDateCode]     = useState('')
  const [label,        setLabel]        = useState('')
  const [datasetType,  setDatasetType]  = useState('pointcloud')
  const [files,        setFiles]        = useState([])
  const [dragOver,     setDragOver]     = useState(false)
  const [loading,      setLoading]      = useState(false)
  const [progress,     setProgress]     = useState('')
  const [error,        setError]        = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    if (/^\d{6}$/.test(dateCode)) setLabel(autoLabel(dateCode))
  }, [dateCode])

  function handleFileChange(e) { setFiles([...e.target.files]); setError('') }

  async function handleSubmit() {
    if (!/^\d{6}$/.test(dateCode)) return setError('날짜 코드는 정확히 6자리여야 합니다 (YYMMDD).')
    if (!label.trim())              return setError('레이블은 필수입니다.')

    setLoading(true)
    setError('')
    try {
      setProgress('날짜 생성 중…')
      const r1 = await fetch(`${API_BASE}/api/sites/${site.id}/dates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date_code: dateCode, label: label.trim(), dataset_type: datasetType }),
      })
      const d1 = await r1.json()
      if (!r1.ok) { setError(d1.detail || `Error ${r1.status}`); return }

      if (files.length) {
        setProgress('업로드 중…')
        const formData = new FormData()
        files.forEach(f => formData.append('files', f, f.webkitRelativePath || f.relativePath || f.name))
        const r2 = await fetch(`${API_BASE}/api/sites/${site.id}/dates/${dateCode}/upload`, {
          method: 'POST', body: formData,
        })
        const d2 = await r2.json()
        if (!r2.ok) { setError(d2.detail || `Upload error ${r2.status}`); return }
      }

      setProgress('완료!')
      setDateCode(''); setLabel(''); setFiles([])
      if (inputRef.current) inputRef.current.value = ''
      setTimeout(() => { setProgress(''); setOpen(false); onCreated() }, 800)
    } catch (e) {
      setError('Network error: ' + e.message)
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
              <label>날짜 코드 <span className="modal-hint">(YYMMDD)</span></label>
              <input
                type="text"
                maxLength={6}
                value={dateCode}
                onChange={e => { setDateCode(e.target.value.replace(/\D/g, '')); setError('') }}
                placeholder="예) 260601"
              />
            </div>
            <div className="modal-field">
              <label>레이블</label>
              <input
                type="text"
                value={label}
                onChange={e => { setLabel(e.target.value); setError('') }}
                placeholder="예) Jun 1, 2026"
              />
            </div>
          </div>

          <div className="modal-field">
            <label>데이터 유형</label>
            <div className="dup-type-toggle">
              <button
                className={`dup-type-btn${datasetType === 'pointcloud' ? ' active' : ''}`}
                onClick={() => setDatasetType('pointcloud')}
              >
                ☁ Point Cloud
              </button>
              <button
                className={`dup-type-btn${datasetType === 'mesh' ? ' active' : ''}`}
                onClick={() => setDatasetType('mesh')}
              >
                ◈ 3D Mesh
              </button>
            </div>
          </div>

          <div className="modal-field">
            <label>데이터 파일 <span className="modal-hint">(선택 사항 — 나중에 업로드 가능)</span></label>
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
            <button className="modal-btn-secondary" onClick={() => { setOpen(false); setDateCode(''); setLabel(''); setFiles([]) }} disabled={loading}>
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

export default function DataUploadPage({ site, onUploaded, onCreated }) {
  if (!site) return null

  return (
    <div className="dup-overlay">
      <div className="dup-inner">

        <div className="dup-header">
          <div>
            <div className="dup-title">데이터 업로드</div>
            <div className="dup-subtitle">{site.label ?? site.id}</div>
          </div>
          <div className="dup-hint">
            각 날짜에는 단일 데이터셋(포인트 클라우드 또는 3D 메쉬)이 있습니다.
          </div>
        </div>

        <div className="dup-list">
          {site.dates.map(d => (
            <DateRow key={d.id} site={site} date={d} onUploaded={onUploaded} onDeleted={onCreated} />
          ))}
          <NewDateCard site={site} onCreated={onCreated} />
        </div>

      </div>
    </div>
  )
}