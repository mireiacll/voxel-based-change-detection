export default function TopBar({ activeSite, sites, onSiteChange, coords }) {
  return (
    <header id="topbar">
      <div id="tb-left">
        <div id="tb-logo">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth="2">
            <polygon points="12 2 2 7 12 12 22 7 12 2"/>
            <polyline points="2 17 12 22 22 17"/>
            <polyline points="2 12 12 17 22 12"/>
          </svg>
        </div>
        <span id="tb-title">3D Change Detection</span>
      </div>

      <div id="tb-center">
        <div id="site-tabs">
          {sites.map(site => (
            <button
              key={site.id}
              className={`site-tab${site.id === activeSite.id ? ' active' : ''}`}
              onClick={() => onSiteChange(site)}
            >
              {site.label}
            </button>
          ))}
        </div>
      </div>

      <div id="tb-right">
        <span id="coord-display">
          {coords.lat !== '—' ? `${coords.lat}°N  ${coords.lon}°E` : '—'}
        </span>
        <span id="elev-display">
          {coords.height !== '—' ? `${coords.height} m` : '—'}
        </span>
      </div>
    </header>
  )
}