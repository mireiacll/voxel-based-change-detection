/**
 * ProjectLauncher.jsx — full-screen project selection page.
 *
 * First click selects a card; second click opens it. Clicking a different card selects that one instead.
 */

import { useState } from 'react'
import { updateProject, deleteProject } from '../api'

export default function ProjectLauncher({ sites, onSelect, onPreload, onNewProject, onSiteEdited, onSiteDeleted, loading }) {
  const sortedSites = [...sites].sort((a, b) =>
    new Date(b.updatedAt ?? b.createdAt) - new Date(a.updatedAt ?? a.createdAt)
  )

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
      // first click → select, and start loading this project's data in the
      // background so it's already current if the user navigates away from
      // the launcher (e.g. via the top nav bar) without a second click.
      setSelectedId(site.id)
      onPreload?.(site)
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
            <h1 className="launcher-title">3D 변화 탐지</h1>
            <p className="launcher-sub">
              {selectedId
                ? '한 번 더 클릭해 열기 · 다른 프로젝트 선택 가능'
                : '열 프로젝트를 선택하세요'}
            </p>
          </div>
        </div>

        <div className="launcher-section-label">프로젝트</div>
        <div className="launcher-cards">
          <NewProjectCard onNewProject={onNewProject} />
          {loading
            ? [0, 1, 2].map(i => <div key={i} className="lcard lcard-skeleton" />)
            : sortedSites.map(site => (
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
        </div>

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
          <span className="modal-title">프로젝트 수정 — {site.name}</span>
          <button className="modal-close" onClick={onClose} disabled={saving}>✕</button>
        </div>
        <div className="modal-body">
          <div className="modal-row">
            <div className="modal-field">
              <label>이름</label>
              <input value={name} onChange={e => setName(e.target.value)} disabled={saving} />
            </div>
          </div>
          <div className="modal-row">
            <div className="modal-field">
              <label>설명 <span className="modal-hint">(선택)</span></label>
              <input value={description} onChange={e => setDescription(e.target.value)} disabled={saving} placeholder="간단한 설명" />
            </div>
          </div>
          <div className="modal-row" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
            <div className="modal-field">
              <label>카메라 경도</label>
              <input type="number" step="any" value={lon} onChange={e => setLon(e.target.value)} disabled={saving} />
            </div>
            <div className="modal-field">
              <label>카메라 위도</label>
              <input type="number" step="any" value={lat} onChange={e => setLat(e.target.value)} disabled={saving} />
            </div>
            <div className="modal-field">
              <label>카메라 높이</label>
              <input type="number" step="any" value={height} onChange={e => setHeight(e.target.value)} disabled={saving} />
            </div>
          </div>
          {error && <div className="modal-error">{error}</div>}
        </div>
        <div className="modal-footer">
          <button className="modal-btn-secondary" onClick={onClose} disabled={saving}>취소</button>
          <button className="modal-btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? '저장 중…' : '저장'}
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
          <span className="modal-title">프로젝트 삭제</span>
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
          <button className="modal-btn-secondary" onClick={onClose} disabled={deleting}>취소</button>
          <button className="modal-btn-danger" onClick={handleDelete} disabled={deleting}>
            {deleting ? '삭제 중…' : '삭제'}
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
            title="더보기"
          >
            ⋯
          </button>
          {menuOpen && (
            <div className="lcard-menu-dropdown" onMouseLeave={() => setMenuOpen(false)}>
              <button onClick={() => { setMenuOpen(false); setShowEdit(true) }}>✎ 수정</button>
              <button className="lcard-menu-danger" onClick={() => { setMenuOpen(false); setShowDelete(true) }}>🗑 삭제</button>
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
              <span className="lcard-latest">최신: {latest.label}</span>
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
      <div className="lcard-name" style={{ color: 'var(--muted)' }}>새 프로젝트</div>
      <div className="lcard-meta">
        <span style={{ color: 'var(--muted)', fontSize: 10 }}>
          새 사이트를 추가하거나 데이터를 불러오세요
        </span>
      </div>
    </button>
  )
}