/**
 * ProjectLauncher.jsx  — unchanged from original.
 *
 * The "New project" card already calls the onNewProject prop,
 * which App.jsx now wires to open NewProjectModal.
 * No changes needed here.
 *
 * Props
 * -----
 *   sites        — array from /api/sites
 *   onSelect     — (site) => void
 *   onNewProject — () => void
 *   loading      — bool
 */

export default function ProjectLauncher({ sites, onSelect, onNewProject, loading }) {
  const recent  = sites.slice(0, 3)
  const theRest = sites.slice(3)

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
            <p className="launcher-sub">Select a project to open</p>
          </div>
        </div>

        {/* ── Recent / hero cards ── */}
        <div className="launcher-section-label">Recent projects</div>
        <div className="launcher-cards">
          {loading
            ? [0, 1, 2].map(i => <div key={i} className="lcard lcard-skeleton" />)
            : recent.map(site => (
                <SiteCard key={site.id} site={site} onSelect={onSelect} />
              ))
          }

          {/* New project card — always shown */}
          <NewProjectCard onNewProject={onNewProject} />
        </div>

        {/* ── Rest of the sites ── */}
        {!loading && theRest.length > 0 && (
          <>
            <div className="launcher-section-label" style={{ marginTop: 28 }}>
              All projects
            </div>
            <div className="launcher-list">
              {theRest.map(site => (
                <SiteListRow key={site.id} site={site} onSelect={onSelect} />
              ))}
            </div>
          </>
        )}

      </div>
    </div>
  )
}

function SiteCard({ site, onSelect }) {
  const dateCount = site.dates?.length ?? 0
  const latest    = site.dates?.[dateCount - 1]

  return (
    <button className="lcard" onClick={() => onSelect(site)}>
      {/* Decorative grid pattern */}
      <div className="lcard-bg" aria-hidden />
      <div className="lcard-body">
        <div className="lcard-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth="2">
            <polygon points="12 2 2 7 12 12 22 7 12 2"/>
            <polyline points="2 17 12 22 22 17"/>
            <polyline points="2 12 12 17 22 12"/>
          </svg>
        </div>
        <div className="lcard-name">{site.label ?? site.id}</div>
        <div className="lcard-meta">
          <span>{dateCount} survey{dateCount !== 1 ? 's' : ''}</span>
          {latest && (
            <span className="lcard-latest">Latest: {latest.label ?? latest.id}</span>
          )}
        </div>
      </div>
      <div className="lcard-arrow">→</div>
    </button>
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

// ── Compact list row (for sites beyond the first 3) ────────────────────────
function SiteListRow({ site, onSelect }) {
  const dateCount = site.dates?.length ?? 0
  return (
    <button className="llist-row" onClick={() => onSelect(site)}>
      <div className="llist-dot" />
      <div className="llist-name">{site.label ?? site.id}</div>
      <div className="llist-meta">{dateCount} survey{dateCount !== 1 ? 's' : ''}</div>
      <div className="llist-arrow">→</div>
    </button>
  )
}