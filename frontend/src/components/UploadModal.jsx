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

import { useState, useRef } from 'react'

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000'

export default function UploadModal({ open, site, date, type, onClose, onUploaded }) {
  const [file,     setFile]     = useState(null)
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [progress, setProgress] = useState('')
  const inputRef = useRef(null)

  if (!open || !site || !date) return null

  const isRemesh = type === 'mesh'
  const typeLabel = isRemesh ? 'Mesh' : 'Point Cloud'
  const endpoint  = isRemesh
    ? `${API_BASE}/api/sites/${site.id}/dates/${date.id}/upload/mesh`
    : `${API_BASE}/api/sites/${site.id}/dates/${date.id}/upload/pointcloud`

  const currentPath = isRemesh ? date.mesh : date.pointCloud

  function handleFileChange(e) {
    const f = e.target.files?.[0]
    if (!f) return
    if (!f.name.toLowerCase().endsWith('.zip')) {
      setError('Please select a .zip file.')
      setFile(null)
      return
    }
    setFile(f)
    setError('')
  }

  async function handleUpload() {
    if (!file) return setError('Please choose a .zip file first.')
    setLoading(true)
    setProgress('Uploading…')
    setError('')

    try {
      const formData = new FormData()
      formData.append('file', file)

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
      setFile(null)
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
            <div className="modal-file-row">
              <input
                ref={inputRef}
                type="file"
                accept=".zip"
                onChange={handleFileChange}
                disabled={loading}
                style={{ flex: 1, minWidth: 0 }}
              />
            </div>
            {file && (
              <div className="modal-hint" style={{ marginTop: 4 }}>
                Selected: {file.name} ({(file.size / 1024 / 1024).toFixed(1)} MB)
              </div>
            )}
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
            disabled={loading || !file}
          >
            {loading ? 'Uploading…' : `Upload ${typeLabel}`}
          </button>
        </div>
      </div>
    </div>
  )
}