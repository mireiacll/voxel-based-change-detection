/**
 * NavBar.jsx
 *
 * Top navigation bar.
 * Left:   logo icon + "변화탐지 플랫폼"
 * Center: tabs — 프로젝트 | 데이터 업로드 | 변화탐지
 * Right:  active site chip
 *
 * Props
 * ─────
 *   tab        — 'projects' | 'upload' | 'analysis'
 *   onTab      — (tab) => void
 *   activeSite — site object | null
 */

import { useState, useEffect } from 'react'

export default function NavBar({ tab, onTab, activeSite }) {
  // Force re-render when localStorage changes (triggered by SetLocationModal)
  const [, setLocalUpdate] = useState(0)

  useEffect(() => {
    const handleStorageChange = (e) => {
      if (activeSite?.id && e.key === `center-from-date-${activeSite.id}`) {
        setLocalUpdate(prev => prev + 1)
      }
    }
    window.addEventListener('storage', handleStorageChange)
    return () => window.removeEventListener('storage', handleStorageChange)
  }, [activeSite?.id])

  const hasDates  = (activeSite?.dates?.length ?? 0) > 0
  
  // Check if coordinates are set in the site object OR stored in localStorage
  const siteHasCoords = activeSite?.centerLat != null && activeSite?.centerLon != null
  const localHasCoords = activeSite?.id && localStorage.getItem(`center-from-date-${activeSite.id}`)
  const hasCoords = siteHasCoords || localHasCoords

  const analysisDisabled = !activeSite || !hasDates || !hasCoords
  const analysisTitle = !activeSite
    ? undefined
    : !hasDates
      ? '관측 데이터가 없습니다'
      : !hasCoords
        ? '변화탐지를 사용하려면 먼저 데이터 업로드 탭에서 프로젝트 위치를 설정하세요'
        : undefined

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
          disabled={analysisDisabled}
          title={analysisTitle}
        >
          변화탐지
        </button>
      </div>

      {/* ── Right: site chip ── */}
      <div className="nav-right">
        {activeSite ? (
          <div className="nav-site-chip">
            <span className="nav-site-dot" />
            <span className="nav-site-label">{activeSite.name ?? activeSite.label ?? activeSite.id}</span>
          </div>
        ) : (
          <span className="nav-no-site">프로젝트를 선택하세요</span>
        )}
      </div>

    </nav>
  )
}