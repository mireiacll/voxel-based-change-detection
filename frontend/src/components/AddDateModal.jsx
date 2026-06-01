/**
 * AddDateModal.jsx
 *
 * Modal for adding a new survey date to an existing site.
 *
 * Props
 * -----
 *   open     — bool
 *   site     — site object  (must be set when open)
 *   onClose  — () => void
 *   onCreated — (date) => void
 */

import { useState, useEffect } from 'react'

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
  const month = MONTHS[mm] || mm
  return `${month} ${parseInt(dd, 10)}, 20${yy}`
}

export default function AddDateModal({ open, site, onClose, onCreated }) {
  const [dateCode, setDateCode] = useState('')
  const [label,    setLabel]    = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)

  // Auto-generate label when date code is fully entered
  useEffect(() => {
    if (/^\d{6}$/.test(dateCode)) {
      setLabel(autoLabel(dateCode))
    }
  }, [dateCode])

  if (!open || !site) return null

  async function handleSubmit() {
    if (!/^\d{6}$/.test(dateCode)) return setError('Date code must be exactly 6 digits, e.g. 260601')
    if (!label.trim())              return setError('Label is required.')

    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${API_BASE}/api/sites/${site.id}/dates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date_code: dateCode, label: label.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.detail || `Error ${res.status}`)
        return
      }
      setDateCode('')
      setLabel('')
      onCreated(data.date)
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
      <div className="modal-box modal-box-sm">
        <div className="modal-header">
          <span className="modal-title">Add Survey Date</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <div className="modal-site-tag">{site.label ?? site.id}</div>

          <div className="modal-field">
            <label>Date Code <span className="modal-hint">(YYMMDD)</span></label>
            <input
              type="text"
              maxLength={6}
              value={dateCode}
              onChange={e => { setDateCode(e.target.value.replace(/\D/g, '')); setError('') }}
              placeholder="e.g. 260601"
            />
          </div>

          <div className="modal-field">
            <label>Label</label>
            <input
              type="text"
              value={label}
              onChange={e => { setLabel(e.target.value); setError('') }}
              placeholder="e.g. Jun 1, 2026"
            />
          </div>

          {error && <div className="modal-error">{error}</div>}
        </div>

        <div className="modal-footer">
          <button className="modal-btn-secondary" onClick={onClose} disabled={loading}>
            Cancel
          </button>
          <button className="modal-btn-primary" onClick={handleSubmit} disabled={loading}>
            {loading ? 'Creating…' : 'Add Date'}
          </button>
        </div>
      </div>
    </div>
  )
}