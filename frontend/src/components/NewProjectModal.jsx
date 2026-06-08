/**
 * NewProjectModal.jsx
 *
 * Modal for creating a new site/project.
 *
 * Props
 * -----
 *   open     — bool
 *   onClose  — () => void
 *   onCreated — (site) => void   called after successful creation
 */

import { useState } from 'react'

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000'

export default function NewProjectModal({ open, onClose, onCreated }) {
  const [form, setForm] = useState({
    id:            '',
    label:         '',
    label_en:      '',
    camera_lon:    '',
    camera_lat:    '',
    camera_height: '600',
  })
  const [error,   setError]   = useState('')
  const [loading, setLoading] = useState(false)

  if (!open) return null

  function update(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
    setError('')
  }

  async function handleSubmit() {
    const { id, label, label_en, camera_lon, camera_lat, camera_height } = form

    if (!id.trim())         return setError('Site ID is required.')
    if (!label.trim())      return setError('Label is required.')
    if (!label_en.trim())   return setError('English label is required.')
    if (!camera_lon)        return setError('Longitude is required.')
    if (!camera_lat)        return setError('Latitude is required.')
    if (!camera_height)     return setError('Camera height is required.')

    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${API_BASE}/api/sites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id:            id.trim().toLowerCase(),
          label:         label.trim(),
          label_en:      label_en.trim(),
          camera_lon:    parseFloat(camera_lon),
          camera_lat:    parseFloat(camera_lat),
          camera_height: parseFloat(camera_height),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.detail || `Error ${res.status}`)
        return
      }
      // Reset form
      setForm({ id: '', label: '', label_en: '', camera_lon: '', camera_lat: '', camera_height: '600' })
      onCreated(data.site)
    } catch (e) {
      setError('Network error: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  function handleBackdropClick(e) {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal-box">
        <div className="modal-header">
          <span className="modal-title">New Project</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <div className="modal-section-label">Site Identity</div>

          <div className="modal-field">
            <label>Site ID <span className="modal-hint">(lowercase, no spaces)</span></label>
            <input
              type="text"
              value={form.id}
              onChange={e => update('id', e.target.value)}
              placeholder="e.g. mysite"
            />
          </div>

          <div className="modal-field">
            <label>Label</label>
            <input
              type="text"
              value={form.label}
              onChange={e => update('label', e.target.value)}
              placeholder="e.g. 둔포면 — Waste Site"
            />
          </div>

          <div className="modal-field">
            <label>English Label</label>
            <input
              type="text"
              value={form.label_en}
              onChange={e => update('label_en', e.target.value)}
              placeholder="e.g. Dunpo-myeon"
            />
          </div>

          <div className="modal-section-label" style={{ marginTop: 12 }}>Camera Position</div>

          <div className="modal-row">
            <div className="modal-field">
              <label>Longitude</label>
              <input
                type="number"
                step="any"
                value={form.camera_lon}
                onChange={e => update('camera_lon', e.target.value)}
                placeholder="127.0067"
              />
            </div>
            <div className="modal-field">
              <label>Latitude</label>
              <input
                type="number"
                step="any"
                value={form.camera_lat}
                onChange={e => update('camera_lat', e.target.value)}
                placeholder="36.9099"
              />
            </div>
          </div>

          <div className="modal-field">
              <label>Camera Height (m)</label>
              <input
                type="number"
                step="any"
                value={form.camera_height}
                onChange={e => update('camera_height', e.target.value)}
                placeholder="600"
              />
            </div>

          {error && <div className="modal-error">{error}</div>}
        </div>

        <div className="modal-footer">
          <button className="modal-btn-secondary" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button className="modal-btn-primary" onClick={handleSubmit} disabled={loading}>
            {loading ? 'Creating…' : 'Create Project'}
          </button>
        </div>
      </div>
    </div>
  )
}