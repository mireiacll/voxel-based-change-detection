/**
 * NewProjectModal.jsx
 *
 * Modal for creating a new project via the coworker's REST API.
 *
 * Props
 * -----
 *   open      — bool
 *   onClose   — () => void
 *   onCreated — (site) => void   called after successful creation
 */

import { useState } from 'react'
import { createProject } from '../api'

export default function NewProjectModal({ open, onClose, onCreated }) {
  const [form, setForm] = useState({
    name:          '',
    description:   '',
    centerLon:     '',
    centerLat:     '',
    cameraHeight:  '600',
  })
  const [error,   setError]   = useState('')
  const [loading, setLoading] = useState(false)

  if (!open) return null

  function update(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
    setError('')
  }

  async function handleSubmit() {
    const { name, centerLon, centerLat, cameraHeight } = form

    if (!name.trim())      return setError('Project name is required.')
    if (!centerLon)        return setError('Longitude is required.')
    if (!centerLat)        return setError('Latitude is required.')
    if (!cameraHeight)     return setError('Camera height is required.')

    setLoading(true)
    setError('')
    try {
      const site = await createProject({
        name:         name.trim(),
        description:  form.description.trim(),
        centerLon:    parseFloat(centerLon),
        centerLat:    parseFloat(centerLat),
        cameraHeight: parseFloat(cameraHeight),
      })
      setForm({ name: '', description: '', centerLon: '', centerLat: '', cameraHeight: '600' })
      onCreated(site)
    } catch (e) {
      setError(e.message)
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
          <div className="modal-section-label">Project Identity</div>

          <div className="modal-field">
            <label>Name</label>
            <input
              type="text"
              value={form.name}
              onChange={e => update('name', e.target.value)}
              placeholder="e.g. 둔포면 — Waste Site"
            />
          </div>

          <div className="modal-field">
            <label>Description <span className="modal-hint">(optional)</span></label>
            <input
              type="text"
              value={form.description}
              onChange={e => update('description', e.target.value)}
              placeholder="Brief description"
            />
          </div>

          <div className="modal-section-label" style={{ marginTop: 12 }}>Camera Position</div>

          <div className="modal-row">
            <div className="modal-field">
              <label>Longitude</label>
              <input
                type="number"
                step="any"
                value={form.centerLon}
                onChange={e => update('centerLon', e.target.value)}
                placeholder="127.0067"
              />
            </div>
            <div className="modal-field">
              <label>Latitude</label>
              <input
                type="number"
                step="any"
                value={form.centerLat}
                onChange={e => update('centerLat', e.target.value)}
                placeholder="36.9099"
              />
            </div>
          </div>

          <div className="modal-field">
            <label>Camera Height (m)</label>
            <input
              type="number"
              step="any"
              value={form.cameraHeight}
              onChange={e => update('cameraHeight', e.target.value)}
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