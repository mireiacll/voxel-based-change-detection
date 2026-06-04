/**
 * NavBar.jsx
 *
 * Top navigation bar.  Three tabs drive the main "screen":
 *   'projects'  → ProjectLauncher overlay
 *   'upload'    → DataUploadPage overlay
 *   'analysis'  → full viewer (Panel + Cesium)
 *
 * Props
 * ─────
 *   tab          — 'projects' | 'upload' | 'analysis'
 *   onTab        — (tab) => void
 *   activeSite   — site object | null
 *   coords       — { lat, lon, height }
 */

export default function NavBar({ tab, onTab, activeSite, coords }) {
  return (
    <nav id="nav-bar">

      {/* ── Logo ── */}
      <div className="nav-logo">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
             stroke="currentColor" strokeWidth="2.2">
          <polygon points="12 2 2 7 12 12 22 7 12 2"/>
          <polyline points="2 17 12 22 22 17"/>
          <polyline points="2 12 12 17 22 12"/>
        </svg>
        <span className="nav-logo-text">변화탐지</span>
      </div>

      {/* ── Tabs ── */}
      <div className="nav-tabs">
        <button
          className={`nav-tab${tab === 'projects' ? ' active' : ''}`}
          onClick={() => onTab('projects')}
        >
          프로젝트
          {activeSite && tab !== 'projects' && (
            <span className="nav-tab-dot" />
          )}
        </button>

        <button
          className={`nav-tab${tab === 'upload' ? ' active' : ''}`}
          onClick={() => onTab('upload')}
          disabled={!activeSite}
        >
          데이터 업로드
        </button>

        <button
          className={`nav-tab${tab === 'analysis' ? ' active' : ''}`}
          onClick={() => onTab('analysis')}
          disabled={!activeSite}
        >
          변화탐지
        </button>
      </div>

      {/* ── Right: active site + coords ── */}
      <div className="nav-right">
        {activeSite && (
          <div className="nav-site-chip">
            <span className="nav-site-dot" />
            <span className="nav-site-label">{activeSite.label ?? activeSite.id}</span>
          </div>
        )}
        {coords && tab === 'analysis' && (
          <div className="nav-coords">
            <span>{coords.lat}</span>
            <span className="nav-coords-sep">·</span>
            <span>{coords.lon}</span>
            <span className="nav-coords-sep">·</span>
            <span>{coords.height} m</span>
          </div>
        )}
      </div>

    </nav>
  )
}