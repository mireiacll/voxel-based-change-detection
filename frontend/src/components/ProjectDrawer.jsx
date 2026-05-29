/**
 * ProjectDrawer.jsx
 *
 * Slide-in panel triggered by clicking the logo in the top-left.
 * Shows a simplified file explorer: sites → dates, with expand/collapse.
 * "Open" switches to that site. "New project" stub fires a callback.
 *
 * Props
 * -----
 *   open           — bool
 *   onClose        — () => void
 *   sites          — array from /api/sites
 *   activeSite     — current site object
 *   onSelectSite   — (site) => void
 *   onNewProject   — () => void
 */

import { useState } from 'react'

export default function ProjectDrawer({
  open, onClose, sites, activeSite, onSelectSite, onNewProject,
}) {
  const [expanded, setExpanded] = useState({})

  function toggle(id) {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }))
  }

  function handleSelect(site) {
    onSelectSite(site)
    onClose()
  }

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div className="drawer-backdrop" onClick={onClose} />
      )}

      {/* Drawer panel */}
      <div className={`proj-drawer${open ? ' open' : ''}`}>

        <div className="pd-header">
          <span className="pd-title">Projects</span>
          <button className="pd-close" onClick={onClose} title="Close">✕</button>
        </div>

        {/* New project button */}
        <button className="pd-new-btn" onClick={() => { onNewProject(); onClose() }}>
          <span className="pd-new-plus">+</span>
          New project
        </button>

        <div className="pd-divider" />

        {/* Site tree */}
        <div className="pd-tree">
          {sites.map(site => {
            const isActive  = site.id === activeSite?.id
            const isOpen    = expanded[site.id]
            const dateCount = site.dates?.length ?? 0

            return (
              <div key={site.id} className="pd-site">

                {/* Site row */}
                <div className={`pd-site-row${isActive ? ' active' : ''}`}>
                  <button
                    className="pd-expand"
                    onClick={() => toggle(site.id)}
                    title={isOpen ? 'Collapse' : 'Expand'}
                  >
                    {dateCount > 0
                      ? (isOpen ? '▾' : '▸')
                      : '·'}
                  </button>

                  <button
                    className="pd-site-name"
                    onClick={() => handleSelect(site)}
                    title="Open project"
                  >
                    <span className="pd-site-icon">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                           stroke="currentColor" strokeWidth="2.5">
                        <polygon points="12 2 2 7 12 12 22 7 12 2"/>
                        <polyline points="2 17 12 22 22 17"/>
                        <polyline points="2 12 12 17 22 12"/>
                      </svg>
                    </span>
                    {site.label ?? site.id}
                  </button>

                  {isActive && <span className="pd-badge">open</span>}
                </div>

                {/* Dates sub-tree */}
                {isOpen && dateCount > 0 && (
                  <div className="pd-dates">
                    {site.dates.map(d => (
                      <div key={d.id} className="pd-date-row">
                        <span className="pd-date-line" />
                        <span className="pd-date-icon">📅</span>
                        <span className="pd-date-label">{d.label ?? d.id}</span>
                        <span className="pd-date-id">{d.id}</span>
                      </div>
                    ))}
                  </div>
                )}

              </div>
            )
          })}

          {sites.length === 0 && (
            <div className="pd-empty">No projects found</div>
          )}
        </div>

      </div>
    </>
  )
}