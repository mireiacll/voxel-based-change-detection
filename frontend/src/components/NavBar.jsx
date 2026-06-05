/**
 * NavBar.jsx
 *
 * Top navigation bar.
 * Left:   logo icon + "변화탐지 플랫폼" + subtitle
 * Center: tabs — 프로젝트 | 데이터 업로드 | 변화탐지
 * Right:  active site chip
 *
 * Props
 * ─────
 *   tab        — 'projects' | 'upload' | 'analysis'
 *   onTab      — (tab) => void
 *   activeSite — site object | null
 */

export default function NavBar({ tab, onTab, activeSite }) {
  return (
    <nav id="nav-bar">

      {/* ── Brand ── */}
      <div className="nav-brand">
        <div className="nav-brand-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth="2.2">
            <polygon points="12 2 2 7 12 12 22 7 12 2"/>
            <polyline points="2 17 12 22 22 17"/>
            <polyline points="2 12 12 17 22 12"/>
          </svg>
        </div>
        <div className="nav-brand-text">
          <span className="nav-brand-title">변화탐지 플랫폼</span>
          <span className="nav-brand-sub">시공간 데이터를 시간 단위로 관리하고 변화 정보를 분석하는 플랫폼</span>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="nav-tabs">
        <button
          className={`nav-tab${tab === 'projects' ? ' active' : ''}`}
          onClick={() => onTab('projects')}
        >
          프로젝트
          {activeSite && tab !== 'projects' && <span className="nav-tab-dot" />}
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

      {/* ── Right: site chip ── */}
      <div className="nav-right">
        {activeSite ? (
          <div className="nav-site-chip">
            <span className="nav-site-dot" />
            <span className="nav-site-label">{activeSite.label ?? activeSite.id}</span>
          </div>
        ) : (
          <span className="nav-no-site">프로젝트를 선택하세요</span>
        )}
      </div>

    </nav>
  )
}