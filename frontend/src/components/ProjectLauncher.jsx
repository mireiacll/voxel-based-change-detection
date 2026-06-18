/**
 * ProjectLauncher.jsx
 *
 * Props
 * -----
 *   sites         — array from fetchProjects() + enrichProjectWithDates()
 *   onSelect      — ({ site, initialTab }) => void
 *                     initialTab is 'upload' when the site has no observations,
 *                     undefined otherwise (caller uses its own default)
 *   onNewProject  — () => void
 *   onSiteEdited  — () => void
 *   onSiteDeleted — (siteId) => void
 *   loading       — bool
 *
 * Interaction model
 * -----------------
 *   First click  → selects the card (highlighted, stays on launcher)
 *   Second click → opens the project
 *   Clicking a different card → selects that one instead
 */

import { useState } from 'react'
import { updateProject, deleteProject } from '../api'

export default function ProjectLauncher({ sites, onSelect, onNewProject, onSiteEdited, onSiteDeleted, loading }) {
  const recent  = sites.slice(0, 3)
  const theRest = sites.slice(3)

  const [selectedId, setSelectedId] = useState(null)

  function handleCardClick(site) {
    if (selectedId === site.id) {
      // second click → open
      // Check if coordinates are set (either in site object or localStorage)
      const siteHasCoords = site.centerLat != null && site.centerLon != null
      const localHasCoords = localStorage.getItem(`center-from-date-${site.id}`)
      const hasCoords = siteHasCoords || localHasCoords
      
      // If no dates, go to upload tab. If dates but no coords, also go to upload tab.
      const hasDates = (site.dates?.length ?? 0) > 0
      const initialTab = !hasDates || !hasCoords ? 'upload' : undefined
      
      onSelect({ site, initialTab })
    } else {
      // first click → select
      setSelectedId(site.id)
    }
  }

  return (
    <div className="launcher-overlay">
      <div className="launcher-inner">

        <div className="launcher-header">
          <div className="launcher-logo">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" strokeWidth="2">
              <polygon points="12 2 2 7 12 12 22 7 12 2"/>
              <polyline points="2 17 12 22 22 17"/>
              <polyline points="2 12 12 17 22 12"/>
            </svg>
          </div>
          <div>
            <h1 className="launcher-title">3D Change Detection</h1>
            <p className="launcher-sub">
              {selectedId
                ? 'Click again to open — or select a different project'
                : 'Select a project to open'}
            </p>
          </div>
        </div>

        <div className="launcher-section-label">Recent projects</div>
        <div className="launcher-cards">
          {loading
            ? [0, 1, 2].map(i => <div key={i} className="lcard lcard-skeleton" />)
            : recent.map(site => (
                <SiteCard
                  key={site.id}
                  site={site}
                  selected={selectedId === site.id}
                  onClick={handleCardClick}
                  onEdited={onSiteEdited}
                  onDeleted={onSiteDeleted}
                />
              ))
          }
          <NewProjectCard onNewProject={onNewProject} />
        </div>

        {!loading && theRest.length > 0 && (
          <>
            <div className="launcher-section-label" style={{ marginTop: 28 }}>
              All projects
            </div>
            <div className="launcher-list">
              {theRest.map(site => (
                <SiteListRow
                  key={site.id}
                  site={site}
                  selected={selectedId === site.id}
                  onClick={handleCardClick}
                  onEdited={onSiteEdited}
                  onDeleted={onSiteDeleted}
                />
              ))}
            </div>
          </>
        )}

      </div>
    </div>
  )
}

// ── Edit site modal ────────────────────────────────────────────────────────
function EditSiteModal({ site, onClose, onSaved }) {
  const [name,        setName]        = useState(site.name        ?? '')
  const [description, setDescription] = useState(site.description ?? '')
  const [lon,         setLon]         = useState(String(site.centerLon    ?? ''))
  const [lat,         setLat]         = useState(String(site.centerLat    ?? ''))
  const [height,      setHeight]      = useState(String(site.cameraHeight ?? ''))
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState('')

  async function handleSave() {
    if (!name.trim()) return setError('Name is required.')
    setSaving(true)
    setError('')
    try {
      const patch = { name: name.trim(), description: description.trim() }
      if (lon    !== '') patch.centerLon    = parseFloat(lon)
      if (lat    !== '') patch.centerLat    = parseFloat(lat)
      if (height !== '') patch.cameraHeight = parseFloat(height)

      await updateProject(site.id, patch)
      onSaved()
    } catch (e) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  function handleBackdrop(e) {
    if (e.target === e.currentTarget && !saving) onClose()
  }

  return (
    <div className="modal-backdrop" onClick={handleBackdrop}>
      <div className="modal-box modal-box-sm" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Edit Project — {site.name}</span>
          <button className="modal-close" onClick={onClose} disabled={saving}>✕</button>
        </div>
        <div className="modal-body">
          <div className="modal-row">
            <div className="modal-field">
              <label>Name</label>
              <input value={name} onChange={e => setName(e.target.value)} disabled={saving} />
            </div>
          </div>
          <div className="modal-row">
            <div className="modal-field">
              <label>Description <span className="modal-hint">(optional)</span></label>
              <input value={description} onChange={e => setDescription(e.target.value)} disabled={saving} placeholder="Brief description" />
            </div>
          </div>
          <div className="modal-row" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
            <div className="modal-field">
              <label>Camera Lon</label>
              <input type="number" step="any" value={lon} onChange={e => setLon(e.target.value)} disabled={saving} />
            </div>
            <div className="modal-field">
              <label>Camera Lat</label>
              <input type="number" step="any" value={lat} onChange={e => setLat(e.target.value)} disabled={saving} />
            </div>
            <div className="modal-field">
              <label>Camera Height</label>
              <input type="number" step="any" value={height} onChange={e => setHeight(e.target.value)} disabled={saving} />
            </div>
          </div>
          {error && <div className="modal-error">{error}</div>}
        </div>
        <div className="modal-footer">
          <button className="modal-btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="modal-btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Delete confirm modal ───────────────────────────────────────────────────
function DeleteConfirmModal({ site, onClose, onDeleted }) {
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    setDeleting(true)
    try {
      await deleteProject(site.id)
      onDeleted(site.id)
    } catch (e) {
      alert(e.message)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={() => !deleting && onClose()}>
      <div className="modal-box modal-box-sm" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Delete Project</span>
          <button className="modal-close" onClick={onClose} disabled={deleting}>✕</button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: 13, lineHeight: 1.6 }}>
            <strong>{site.name}</strong>을(를) 삭제하시겠습니까?
            <br />
            <span className="modal-hint">모든 날짜 및 데이터 파일이 함께 삭제됩니다. 이 작업은 되돌릴 수 없습니다.</span>
          </p>
        </div>
        <div className="modal-footer">
          <button className="modal-btn-secondary" onClick={onClose} disabled={deleting}>Cancel</button>
          <button className="modal-btn-danger" onClick={handleDelete} disabled={deleting}>
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Site card (hero) ───────────────────────────────────────────────────────
function SiteCard({ site, selected, onClick, onEdited, onDeleted }) {
  const [menuOpen,   setMenuOpen]   = useState(false)
  const [showEdit,   setShowEdit]   = useState(false)
  const [showDelete, setShowDelete] = useState(false)

  const dateCount = site.dates?.length ?? 0
  const latest    = site.dates?.[dateCount - 1]

  return (
    <>
      <div
        className={`lcard${selected ? ' lcard-selected' : ''}`}
        onClick={() => !menuOpen && onClick(site)}
        role="button"
        tabIndex={0}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') onClick(site)
        }}
      >
        <div className="lcard-bg" aria-hidden />

        <div className="lcard-menu-wrap" onClick={e => e.stopPropagation()}>
          <button
            className="lcard-menu-btn"
            onClick={() => setMenuOpen(v => !v)}
            title="More options"
          >
            ⋯
          </button>
          {menuOpen && (
            <div className="lcard-menu-dropdown" onMouseLeave={() => setMenuOpen(false)}>
              <button onClick={() => { setMenuOpen(false); setShowEdit(true) }}>✎ Edit</button>
              <button className="lcard-menu-danger" onClick={() => { setMenuOpen(false); setShowDelete(true) }}>🗑 Delete</button>
            </div>
          )}
        </div>

        <div className="lcard-body">
          <div className="lcard-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" strokeWidth="2">
              <polygon points="12 2 2 7 12 12 22 7 12 2"/>
              <polyline points="2 17 12 22 22 17"/>
              <polyline points="2 12 12 17 22 12"/>
            </svg>
          </div>
          <div className="lcard-name">{site.name}</div>
          <div className="lcard-meta">
            <span>{dateCount} survey{dateCount !== 1 ? 's' : ''}</span>
            {latest && (
              <span className="lcard-latest">Latest: {latest.label}</span>
            )}
          </div>
        </div>

        <div className="lcard-arrow">
          {selected ? '↵' : '→'}
        </div>
      </div>

      {showEdit && (
        <EditSiteModal
          site={site}
          onClose={() => setShowEdit(false)}
          onSaved={() => { setShowEdit(false); onEdited?.() }}
        />
      )}
      {showDelete && (
        <DeleteConfirmModal
          site={site}
          onClose={() => setShowDelete(false)}
          onDeleted={id => { setShowDelete(false); onDeleted?.(id) }}
        />
      )}
    </>
  )
}

// ── New project card ───────────────────────────────────────────────────────
function NewProjectCard({ onNewProject }) {
  return (
    <button className="lcard lcard-new" onClick={onNewProject}>
      <div className="lcard-new-icon">+</div>
      <div className="lcard-name" style={{ color: 'var(--muted)' }}>New project</div>
      <div className="lcard-meta">
        <span style={{ color: 'var(--muted)', fontSize: 10 }}>
          Add a new site or import data
        </span>
      </div>
    </button>
  )
}

// ── Compact list row ───────────────────────────────────────────────────────
function SiteListRow({ site, selected, onClick, onEdited, onDeleted }) {
  const [menuOpen,   setMenuOpen]   = useState(false)
  const [showEdit,   setShowEdit]   = useState(false)
  const [showDelete, setShowDelete] = useState(false)

  const dateCount = site.dates?.length ?? 0

  return (
    <>
      <div className="llist-row-wrap">
        <button
          className={`llist-row${selected ? ' llist-selected' : ''}`}
          onClick={() => onClick(site)}
        >
          <div className={`llist-dot${selected ? ' llist-dot-selected' : ''}`} />
          <div className="llist-name">{site.name}</div>
          <div className="llist-meta">{dateCount} survey{dateCount !== 1 ? 's' : ''}</div>
          <div className="llist-arrow">{selected ? '↵' : '→'}</div>
        </button>

        <div className="llist-menu-wrap">
          <button
            className="lcard-menu-btn"
            onClick={() => setMenuOpen(v => !v)}
            title="More options"
          >
            ⋯
          </button>
          {menuOpen && (
            <div className="lcard-menu-dropdown" onMouseLeave={() => setMenuOpen(false)}>
              <button onClick={() => { setMenuOpen(false); setShowEdit(true) }}>✎ Edit</button>
              <button className="lcard-menu-danger" onClick={() => { setMenuOpen(false); setShowDelete(true) }}>🗑 Delete</button>
            </div>
          )}
        </div>
      </div>

      {showEdit && (
        <EditSiteModal
          site={site}
          onClose={() => setShowEdit(false)}
          onSaved={() => { setShowEdit(false); onEdited?.() }}
        />
      )}
      {showDelete && (
        <DeleteConfirmModal
          site={site}
          onClose={() => setShowDelete(false)}
          onDeleted={id => { setShowDelete(false); onDeleted?.(id) }}
        />
      )}
    </>
  )
}