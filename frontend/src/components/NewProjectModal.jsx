/**
 * NewProjectModal.jsx
 *
 * Modal for creating a new project via the coworker's REST API.
 * Lat/lon are optional — they can be set later from the DataUploadPage.
 * Camera height is always 600 m (not exposed to the user).
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
    name:        '',
    description: '',
    centerLon:   '',
    centerLat:   '',
  })
  const [error,   setError]   = useState('')
  const [loading, setLoading] = useState(false)

  if (!open) return null

  function update(field, value) {
    setForm(prev => ({ ...prev, [field]: value }))
    setError('')
  }

  function validateCoord(raw, label, min, max) {
    if (raw === '' || raw === null) return null   // optional
    const n = parseFloat(raw)
    if (isNaN(n))       throw new Error(`${label}: 숫자를 입력하세요.`)
    if (n < min || n > max) throw new Error(`${label}: ${min}~${max} 범위여야 합니다.`)
    return n
  }

  async function handleSubmit() {
    const { name, centerLon, centerLat } = form
    if (!name.trim()) return setError('Project name is required.')

    let lon = null
    let lat = null
    try {
      lon = validateCoord(centerLon, '경도', -180, 180)
      lat = validateCoord(centerLat, '위도',   -90,  90)
    } catch (e) {
      return setError(e.message)
    }

    // Both must be provided together, or neither
    if ((lon == null) !== (lat == null)) {
      return setError('경도와 위도를 함께 입력하거나 둘 다 비워두세요.')
    }

    setLoading(true)
    setError('')
    try {
      const site = await createProject({
        name:         name.trim(),
        description:  form.description.trim(),
        centerLon:    lon,
        centerLat:    lat,
        cameraHeight: 600,
      })
      setForm({ name: '', description: '', centerLon: '', centerLat: '' })
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
          <span className="modal-title">새 프로젝트</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <div className="modal-section-label">프로젝트 정보</div>

          <div className="modal-field">
            <label>이름</label>
            <input
              type="text"
              value={form.name}
              onChange={e => update('name', e.target.value)}
              placeholder="e.g. 둔포면 — Waste Site"
              disabled={loading}
            />
          </div>

          <div className="modal-field">
            <label>설명 <span className="modal-hint">(선택)</span></label>
            <input
              type="text"
              value={form.description}
              onChange={e => update('description', e.target.value)}
              placeholder="간단한 설명"
              disabled={loading}
            />
          </div>

          <div className="modal-section-label" style={{ marginTop: 12 }}>
            카메라 위치 <span className="modal-hint">(선택, 업로드 페이지에서 나중에 설정 가능)</span>
          </div>

          <div className="modal-row">
            <div className="modal-field">
              <label>경도</label>
              <input
                type="number"
                step="any"
                value={form.centerLon}
                onChange={e => update('centerLon', e.target.value)}
                placeholder="127.0067"
                disabled={loading}
              />
            </div>
            <div className="modal-field">
              <label>위도</label>
              <input
                type="number"
                step="any"
                value={form.centerLat}
                onChange={e => update('centerLat', e.target.value)}
                placeholder="36.9099"
                disabled={loading}
              />
            </div>
          </div>

          {error && <div className="modal-error">{error}</div>}
        </div>

        <div className="modal-footer">
          <button className="modal-btn-secondary" onClick={onClose} disabled={loading}>
            취소
          </button>
          <button className="modal-btn-primary" onClick={handleSubmit} disabled={loading}>
            {loading ? '생성 중…' : '프로젝트 생성'}
          </button>
        </div>
      </div>
    </div>
  )
}