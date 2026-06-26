/**
 * AddDateModal.jsx — add a new survey date to a site.
 * Upload is required; the API creates the observation and uploads in one step.
 */

import { useState, useEffect, useRef } from 'react'
import { uploadObservation, dateCodeToIso } from '../api'

const MONTHS = {
  '01': 'Jan', '02': 'Feb', '03': 'Mar', '04': 'Apr',
  '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Aug',
  '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dec',
}

function autoLabel(code) {
  const m = code.match(/^(\d{2})(\d{2})(\d{2})$/)
  if (!m) return ''
  const [, yy, mm, dd] = m
  const month = MONTHS[mm] || mm
  return `${month} ${parseInt(dd, 10)}, 20${yy}`
}

export default function AddDateModal({ open, site, onClose, onCreated }) {
  const [dateCode, setDateCode] = useState('')
  const [label,    setLabel]    = useState('')
  const [datasetType, setDatasetType] = useState('pointcloud')
  const [files,    setFiles]    = useState([])
  const [dragOver, setDragOver] = useState(false)
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [progress, setProgress] = useState('')
  const inputRef = useRef(null)

  // Auto-generate label when date code is fully entered
  useEffect(() => {
    if (/^\d{6}$/.test(dateCode)) {
      setLabel(autoLabel(dateCode))
    }
  }, [dateCode])

  // Reset on close
  useEffect(() => {
    if (!open) {
      setDateCode(''); setLabel(''); setDatasetType('pointcloud'); setFiles([])
      setError(''); setProgress(''); setDragOver(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }, [open])

  if (!open || !site) return null

  async function handleSubmit() {
    if (!/^\d{6}$/.test(dateCode)) return setError('Date code must be exactly 6 digits, e.g. 260601')
    if (!label.trim())              return setError('Label is required.')
    if (!files.length)              return setError('Please select a tileset file or folder.')
    console.log('[AddDateModal.handleSubmit] site.id:', site.id, 'dateCode:', dateCode, 'observedAt:', dateCodeToIso(dateCode), 'files:', files.length, files.map(f => f.webkitRelativePath || f.relativePath || f.name))

    setLoading(true)
    setError('')
    try {
      setProgress('Zipping…  0%')
      const date = await uploadObservation(site.id, {
        name:        dateCode,
        observedAt:  dateCodeToIso(dateCode),
        datasetType: datasetType,
        files,
        onProgress:  pct => setProgress(
          pct < 100 ? `Zipping…  ${pct}%` : 'Uploading…'
        ),
      })
      console.log('[AddDateModal.handleSubmit] created observation:', date.id, date.name, date.observedAt)
      setProgress('Done!')
      setTimeout(() => {
        setProgress('')
        onCreated(date)
      }, 800)
    } catch (e) {
      console.error('[AddDateModal.handleSubmit] FAILED:', e.message, e)
      setError(e.message)
      setProgress('')
    } finally {
      setLoading(false)
    }
  }

  function handleBackdropClick(e) {
    if (e.target === e.currentTarget && !loading) onClose()
  }

  // ── Folder drop helpers ───────────────────────────────────────────────

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
    e.preventDefault(); setDragOver(false)
    const dropped = await getDroppedFiles([...e.dataTransfer.items])
    if (!dropped.length) return
    setFiles(dropped); setError('')
  }

  const folderName =
    files[0]?.webkitRelativePath?.split('/')[0] ||
    files[0]?.relativePath?.split('/')[0] ||
    files[0]?.name

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal-box modal-box-sm">
        <div className="modal-header">
          <span className="modal-title">Add Survey Date</span>
          <button className="modal-close" onClick={onClose} disabled={loading}>✕</button>
        </div>

        <div className="modal-body">
          <div className="modal-site-tag">{site.name ?? site.id}</div>

          <div className="modal-field">
            <label>Date Code <span className="modal-hint">(YYMMDD)</span></label>
            <input
              type="text"
              maxLength={6}
              value={dateCode}
              onChange={e => { setDateCode(e.target.value.replace(/\D/g, '')); setError('') }}
              placeholder="e.g. 260601"
              disabled={loading}
            />
          </div>

          <div className="modal-field">
            <label>Label</label>
            <input
              type="text"
              value={label}
              onChange={e => { setLabel(e.target.value); setError('') }}
              placeholder="e.g. Jun 1, 2026"
              disabled={loading}
            />
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
              Tileset File <span className="modal-hint">(required — folder or ZIP containing tileset.json)</span>
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
                onChange={e => { setFiles([...e.target.files]); setError('') }}
                disabled={loading}
              />
              {files.length === 0 ? (
                <div>Drag a folder or ZIP here<br/>or click to browse</div>
              ) : (
                <div className="upload-selected">
                  <div className="upload-icon">📁</div>
                  <div>
                    <strong>{folderName}</strong>
                    <br />
                    {files.length} files
                  </div>
                  <div className="upload-replace">Drop another folder to replace</div>
                </div>
              )}
            </div>
          </div>

          {error    && <div className="modal-error">{error}</div>}
          {progress && <div className="modal-progress">{progress}</div>}
        </div>

        <div className="modal-footer">
          <button className="modal-btn-secondary" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button className="modal-btn-primary" onClick={handleSubmit} disabled={loading || !files.length}>
            {loading ? 'Uploading…' : 'Add Date'}
          </button>
        </div>
      </div>
    </div>
  )
}