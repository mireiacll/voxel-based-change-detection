export default function TopBar({ activeSite, coords, onLogoClick }) {
  return (
    <header id="topbar">
      <div id="tb-left">
        <button
          id="tb-logo"
          onClick={onLogoClick}
          title="Projects"
          style={{ cursor: 'pointer', border: 'none' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth="2">
            <polygon points="12 2 2 7 12 12 22 7 12 2"/>
            <polyline points="2 17 12 22 22 17"/>
            <polyline points="2 12 12 17 22 12"/>
          </svg>
        </button>
        <span id="tb-title">3D Change Detection</span>
      </div>

      {/* Active project name in centre */}
      <div id="tb-center">
        {activeSite && (
          <div id="tb-project">
            <span className="tb-project-label">Project</span>
            <span className="tb-project-name">{activeSite.label ?? activeSite.id}</span>
          </div>
        )}
      </div>

      <div id="tb-right">
        <span id="coord-display">
          {coords?.lat !== '—' ? `${coords.lat}°N  ${coords.lon}°E` : '—'}
        </span>
        <span id="elev-display">
          {coords?.height !== '—' ? `${coords.height} m` : '—'}
        </span>
      </div>
    </header>
  )
}