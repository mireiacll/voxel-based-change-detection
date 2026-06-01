/**
 * UploadModal.jsx
 *
 * Modal for uploading a mesh or point cloud tileset zip for a specific date.
 *
 * Props
 * -----
 *   open      — bool
 *   site      — site object
 *   date      — date object  { id, label, mesh, pointCloud }
 *   type      — 'mesh' | 'pointcloud'
 *   onClose   — () => void
 *   onUploaded — () => void   called after successful upload (triggers refresh)
 */

import { useState, useRef, useEffect } from 'react'

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000'

export default function UploadModal({ open, site, date, type, onClose, onUploaded }) {
  const [files,     setFiles]     = useState([])
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [progress, setProgress] = useState('')
  const inputRef = useRef(null)

  const [dragOver, setDragOver] = useState(false)

  useEffect(() => {
    if (!open) {
        setFiles([])
        setError('')
        setProgress('')
        setDragOver(false)

        if (inputRef.current) {
        inputRef.current.value = ''
        }
    }
  }, [open])

  if (!open || !site || !date) return null

  const isRemesh = type === 'mesh'
  const typeLabel = isRemesh ? 'Mesh' : 'Point Cloud'
  const endpoint  = isRemesh
    ? `${API_BASE}/api/sites/${site.id}/dates/${date.id}/upload/mesh`
    : `${API_BASE}/api/sites/${site.id}/dates/${date.id}/upload/pointcloud`

  const currentPath = isRemesh ? date.mesh : date.pointCloud

  const folderName =
    files[0]?.webkitRelativePath?.split('/')[0] ||
    files[0]?.relativePath?.split('/')[0] ||
    files[0]?.name

  const hasTileset = files.some(
    f =>
      f.name.toLowerCase() === 'tileset.json' ||
      f.webkitRelativePath?.toLowerCase().includes('tileset.json') ||
      f.relativePath?.toLowerCase().includes('tileset.json')
  )

  function handleFileChange(e) {
    const selected = [...e.target.files]

    if (!selected.length) return

    setFiles(selected)
    setError('')
  }

  async function handleUpload() {
    if (!files.length) return setError('Please choose a .zip file first.')
    setLoading(true)
    setProgress('Uploading…')
    setError('')

    try {
    const formData = new FormData()

    files.forEach(f => {
      formData.append(
        'files',
        f,
        f.webkitRelativePath || f.relativePath || f.name
      )
    })

      const res = await fetch(endpoint, {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.detail || `Upload failed: ${res.status}`)
        return
      }
      setProgress('Done!')
      setFiles([])
      if (inputRef.current) inputRef.current.value = ''
      setTimeout(() => {
        setProgress('')
        onUploaded()
      }, 800)
    } catch (e) {
      setError('Network error: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  function handleBackdropClick(e) {
    if (e.target === e.currentTarget && !loading) onClose()
  }

  async function handleDrop(e) {
    e.preventDefault()
    setDragOver(false)

    const items = [...e.dataTransfer.items]

    const droppedFiles = await getDroppedFiles(items)

    if (!droppedFiles.length) return

    setFiles(droppedFiles)
    setError('')
  }

  function handleDragOver(e) {
    e.preventDefault()
    setDragOver(true)
  }

  function handleDragLeave() {
    setDragOver(false)
  }

  async function readEntry(entry, path = '') {
    if (entry.isFile) {
        return new Promise(resolve => {
        entry.file(file => {
            file.relativePath = path + file.name
            resolve([file])
        })
        })
    }

    if (entry.isDirectory) {
        const reader = entry.createReader()

        return new Promise(resolve => {
            const allEntries = []

            const readBatch = () => {
                reader.readEntries(async entries => {
                    if (entries.length === 0) {
                        let files = []

                        for (const child of allEntries) {
                            const childFiles = await readEntry(
                                child,
                                path + entry.name + '/'
                            )
                            files.push(...childFiles)
                        }

                        resolve(files)
                        return
                    }

                    allEntries.push(...entries)
                    readBatch()
                })
            }

            readBatch()
        })
    }

    return []
  }

  async function getDroppedFiles(items) {
    let files = []

    for (const item of items) {
        const entry = item.webkitGetAsEntry?.()

        if (entry) {
        const entryFiles = await readEntry(entry)
        files.push(...entryFiles)
        }
    }

    return files
  }

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal-box modal-box-sm">
        <div className="modal-header">
          <span className="modal-title">Upload {typeLabel} Tileset</span>
          <button className="modal-close" onClick={onClose} disabled={loading}>✕</button>
        </div>

        <div className="modal-body">
          <div className="modal-site-tag">
            {site.label ?? site.id} · {date.label ?? date.id}
          </div>

          {currentPath && (
            <div className="modal-current-path">
              <span className="modal-hint">Current: </span>
              <code>{currentPath}</code>
              <div className="modal-hint" style={{ marginTop: 2 }}>
                Uploading a new file will replace the existing tileset.
              </div>
            </div>
          )}

          <div className="modal-field" style={{ marginTop: 12 }}>
            <label>
              {typeLabel} zip file <span className="modal-hint">(.zip containing tileset.json)</span>
            </label>
            <div
                className={`upload-dropzone
                    ${dragOver ? 'dragging' : ''}
                    ${files.length ? 'has-files' : ''}
                `}
                onClick={() => inputRef.current?.click()}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
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
                    <div>
                        Drag a ZIP or folder here
                        <br />
                        or click to browse
                    </div>
                ) : (
                    <div className="upload-selected">
                        <div className="upload-icon">📁</div>
                        <div>
                        <strong>{folderName}</strong>
                        <br />
                        {files.length} files
                        </div>
                        <div className="upload-replace">
                        Drop another folder to replace
                        </div>
                    </div>
                )}
            </div>
          </div>

          <div className="modal-hint" style={{ marginTop: 8, lineHeight: '1.5' }}>
            The zip should contain <code>tileset.json</code> and the associated
            <code>.glb</code> files. Both flat and nested structures (e.g.
            <code>tiles/tileset.json</code>) are supported.
          </div>

          {error    && <div className="modal-error">{error}</div>}
          {progress && <div className="modal-progress">{progress}</div>}
        </div>

        <div className="modal-footer">
          <button className="modal-btn-secondary" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button
            className="modal-btn-primary"
            onClick={handleUpload}
            disabled={loading || files.length === 0}
          >
            {loading ? 'Uploading…' : `Upload ${typeLabel}`}
          </button>
        </div>
      </div>
    </div>
  )
}