/**
 * MapOverlayControls.jsx
 *
 * Basemap sources (all confirmed in your Cesium ion account):
 *   Ion asset IDs:
 *     2        Bing Maps Aerial
 *     3        Bing Maps Aerial with Labels
 *     4        Bing Maps Road
 *     3830182  Google Maps 2D Satellite
 *     3830183  Google Maps 2D Satellite with Labels
 *     3830184  Google Maps 2D Roadmap
 *     3830185  Google Maps 2D Labels Only
 *     3830186  Google Maps 2D Contour
 *   No-ion:
 *     osm      OpenStreetMap (tile.openstreetmap.org)
 *     dark     OSM darkened (brightness 0.3)
 *     none     Globe only (no imagery)
 */

import { useState, useEffect, useRef, useCallback } from 'react'

// Thumb SVGs at 56x56 to match Cesium native picker density
const S = 56

function makeSvgThumb(id) {
  const defs = {
    aerial: [
      `<rect width="${S}" height="${S}" fill="#1a3a2a"/>`,
      `<rect x="0" y="0" width="26" height="26" fill="#2a5a3a"/>`,
      `<rect x="30" y="6" width="20" height="14" fill="#3a6a2a"/>`,
      `<rect x="6" y="32" width="32" height="18" fill="#234a1a"/>`,
      `<rect x="40" y="26" width="16" height="30" fill="#1a4a30"/>`,
      `<rect x="12" y="12" width="12" height="10" fill="#4a7a3a"/>`,
    ],
    aerial_labels: [
      `<rect width="${S}" height="${S}" fill="#1a3a2a"/>`,
      `<rect x="0" y="0" width="26" height="26" fill="#2a5a3a"/>`,
      `<rect x="6" y="32" width="32" height="18" fill="#234a1a"/>`,
      `<rect x="40" y="26" width="16" height="30" fill="#1a4a30"/>`,
      `<rect x="25" y="0" width="2" height="${S}" fill="rgba(255,255,255,0.4)"/>`,
      `<rect x="0" y="26" width="${S}" height="2" fill="rgba(255,255,255,0.3)"/>`,
      `<text x="4" y="16" font-family="sans-serif" font-size="6" fill="rgba(255,255,255,0.85)">202</text>`,
      `<text x="28" y="38" font-family="sans-serif" font-size="5" fill="rgba(255,255,255,0.8)">Seoul</text>`,
    ],
    roads: [
      `<rect width="${S}" height="${S}" fill="#e8e0d8"/>`,
      `<rect x="0" y="22" width="${S}" height="9" fill="#f0e8e0"/>`,
      `<rect x="12" y="0" width="7" height="${S}" fill="#ede6dc"/>`,
      `<rect x="28" y="0" width="4" height="${S}" fill="#e4dcd2"/>`,
      `<rect x="42" y="0" width="3" height="${S}" fill="#ece4da"/>`,
      `<rect x="0" y="37" width="${S}" height="3" fill="#e0d8d0"/>`,
      `<text x="3" y="20" font-family="sans-serif" font-size="6" fill="#c04020">202</text>`,
      `<text x="14" y="31" font-family="sans-serif" font-size="5" fill="#884422">Malvern</text>`,
    ],
    gmaps_sat: [
      `<rect width="${S}" height="${S}" fill="#1c3020"/>`,
      `<rect x="0" y="0" width="32" height="32" fill="#243822"/>`,
      `<rect x="32" y="0" width="24" height="26" fill="#1a3018"/>`,
      `<rect x="6" y="32" width="26" height="24" fill="#2a4224"/>`,
      `<rect x="36" y="28" width="20" height="28" fill="#1e3620"/>`,
      `<rect x="14" y="12" width="12" height="9" fill="#304a28"/>`,
    ],
    gmaps_sat_labels: [
      `<rect width="${S}" height="${S}" fill="#1c3020"/>`,
      `<rect x="0" y="0" width="32" height="32" fill="#243822"/>`,
      `<rect x="6" y="32" width="26" height="24" fill="#2a4224"/>`,
      `<rect x="36" y="28" width="20" height="28" fill="#1e3620"/>`,
      `<rect x="26" y="0" width="2" height="${S}" fill="rgba(255,255,255,0.35)"/>`,
      `<rect x="0" y="28" width="${S}" height="2" fill="rgba(255,255,255,0.3)"/>`,
      `<text x="3" y="16" font-family="sans-serif" font-size="5" fill="rgba(255,255,255,0.85)">서울</text>`,
      `<text x="28" y="40" font-family="sans-serif" font-size="5" fill="rgba(255,255,255,0.75)">강남</text>`,
    ],
    gmaps_road: [
      `<rect width="${S}" height="${S}" fill="#f5f0e8"/>`,
      `<rect x="0" y="20" width="${S}" height="7" fill="#fad080"/>`,
      `<rect x="10" y="0" width="5" height="${S}" fill="#ffffff"/>`,
      `<rect x="26" y="0" width="4" height="${S}" fill="#ffffff"/>`,
      `<rect x="40" y="0" width="3" height="${S}" fill="#f0ece4"/>`,
      `<rect x="0" y="34" width="${S}" height="3" fill="#ffffff"/>`,
      `<rect x="3" y="4" width="6" height="5" fill="#c8e0a0"/>`,
      `<rect x="28" y="24" width="9" height="6" fill="#c8e0a0"/>`,
      `<text x="3" y="18" font-family="sans-serif" font-size="6" fill="#c04020">202</text>`,
    ],
    gmaps_contour: [
      `<rect width="${S}" height="${S}" fill="#e8f0e0"/>`,
      `<path d="M4 40 Q14 32 22 36 Q30 40 38 30 Q46 20 52 26" fill="none" stroke="#a0b890" stroke-width="1.2"/>`,
      `<path d="M0 46 Q10 38 20 42 Q30 46 40 36 Q50 26 56 32" fill="none" stroke="#8aac78" stroke-width="1"/>`,
      `<path d="M2 30 Q12 22 22 28 Q32 34 42 22 Q50 14 56 18" fill="none" stroke="#b0c4a0" stroke-width="1"/>`,
      `<path d="M0 20 Q8 14 18 18 Q28 22 38 12 Q46 4 56 8" fill="none" stroke="#98b888" stroke-width="0.8"/>`,
      `<text x="3" y="54" font-family="sans-serif" font-size="5" fill="#6a8a60">100m</text>`,
    ],
    osm: [
      `<rect width="${S}" height="${S}" fill="#d4e8c8"/>`,
      `<rect x="0" y="20" width="${S}" height="9" fill="#b8c8a8"/>`,
      `<rect x="14" y="0" width="7" height="${S}" fill="#c0d4b0"/>`,
      `<rect x="26" y="6" width="4" height="44" fill="#b4c8a4"/>`,
      `<rect x="40" y="0" width="3" height="${S}" fill="#bcc8ac"/>`,
      `<rect x="0" y="36" width="${S}" height="3" fill="#a8bcaa"/>`,
      `<rect x="3" y="3" width="8" height="7" fill="#e8f0e0"/>`,
    ],
    dark: [
      `<rect width="${S}" height="${S}" fill="#080a10"/>`,
      `<rect x="0" y="20" width="${S}" height="1.5" fill="#2a3040"/>`,
      `<rect x="14" y="0" width="1.5" height="${S}" fill="#2a3040"/>`,
      `<rect x="30" y="0" width="1.5" height="${S}" fill="#2a3040"/>`,
      `<rect x="40" y="0" width="1" height="${S}" fill="#1e2630"/>`,
      `<rect x="0" y="36" width="${S}" height="1" fill="#1e2630"/>`,
      `<rect x="20" y="10" width="10" height="6" fill="#2e3850"/>`,
    ],
    none: [
      `<rect width="${S}" height="${S}" fill="#07070d"/>`,
      `<circle cx="${S/2}" cy="${S/2}" r="20" fill="#0e1a2e" stroke="#1e3a5e" stroke-width="1.2"/>`,
      `<ellipse cx="${S/2}" cy="${S/2}" rx="10" ry="20" fill="none" stroke="#1e3a5e" stroke-width="0.8"/>`,
      `<line x1="${S/2-20}" y1="${S/2}" x2="${S/2+20}" y2="${S/2}" stroke="#1e3a5e" stroke-width="0.8"/>`,
    ],
  }

  const els = defs[id] ?? defs['aerial']
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">${els.join('')}</svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

// ── Catalogue ─────────────────────────────────────────────────────────────

const BASEMAPS = [
  { section: 'Bing Maps',   id: 'aerial',           label: 'Bing Aerial',        thumb: makeSvgThumb('aerial') },
  { section: 'Bing Maps',   id: 'aerial_labels',    label: 'Aerial + Labels',    thumb: makeSvgThumb('aerial_labels') },
  { section: 'Bing Maps',   id: 'roads',            label: 'Bing Roads',         thumb: makeSvgThumb('roads') },
  { section: 'Google Maps', id: 'gmaps_sat',        label: 'Satellite',          thumb: makeSvgThumb('gmaps_sat') },
  { section: 'Google Maps', id: 'gmaps_sat_labels', label: 'Satellite + Labels', thumb: makeSvgThumb('gmaps_sat_labels') },
  { section: 'Google Maps', id: 'gmaps_road',       label: 'Roadmap',            thumb: makeSvgThumb('gmaps_road') },
  { section: 'Google Maps', id: 'gmaps_contour',    label: 'Contour',            thumb: makeSvgThumb('gmaps_contour') },
  { section: 'Other',       id: 'osm',              label: 'OpenStreetMap',      thumb: makeSvgThumb('osm') },
  { section: 'Other',       id: 'dark',             label: 'Dark Map',           thumb: makeSvgThumb('dark') },
  { section: 'Other',       id: 'none',             label: 'Globe Only',         thumb: makeSvgThumb('none') },
]

const SECTIONS = ['Bing Maps', 'Google Maps', 'Other']

// ── Zoom helpers ──────────────────────────────────────────────────────────

// Amount to move the camera forward/backward per click (in metres).
// Scales with current altitude so it feels proportional at any zoom level.
function getCameraZoomAmount() {
  const viewer = window.viewer
  if (!viewer) return 500
  const carto = window.Cesium.Cartographic.fromCartesian(
    viewer.camera.position
  )
  const alt = carto?.height ?? 500
  // ~15 % of current altitude, clamped to a sensible range
  return Math.max(10, Math.min(alt * 0.15, 50000))
}

function zoomIn() {
  const viewer = window.viewer
  if (!viewer) return
  viewer.camera.zoomIn(getCameraZoomAmount())
  viewer.scene.requestRender()
}

function zoomOut() {
  const viewer = window.viewer
  if (!viewer) return
  viewer.camera.zoomOut(getCameraZoomAmount())
  viewer.scene.requestRender()
}

// ── Component ─────────────────────────────────────────────────────────────

export default function MapOverlayControls({
  basemap, onBasemap,
  showTerrain, onShowTerrain,
}) {
  const [open, setOpen] = useState(false)
  const panelRef = useRef(null)

  useEffect(() => {
    if (!open) return
    function handle(e) {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  const currentMap = BASEMAPS.find(b => b.id === basemap) ?? BASEMAPS[0]

  // Hold-to-repeat zoom: press and hold fires repeatedly
  const zoomInterval = useRef(null)

  const startZoom = useCallback((fn) => {
    fn()
    zoomInterval.current = setInterval(fn, 120)
  }, [])

  const stopZoom = useCallback(() => {
    clearInterval(zoomInterval.current)
    zoomInterval.current = null
  }, [])

  // Clean up on unmount
  useEffect(() => () => clearInterval(zoomInterval.current), [])

  return (
    <div id="map-overlay-controls">

      {/* ── Zoom widget ── */}
      <div className="moc-zoom">
        <button
          className="moc-zoom-btn"
          title="확대"
          onMouseDown={() => startZoom(zoomIn)}
          onMouseUp={stopZoom}
          onMouseLeave={stopZoom}
          onTouchStart={e => { e.preventDefault(); startZoom(zoomIn) }}
          onTouchEnd={stopZoom}
        >
          +
        </button>
        <div className="moc-zoom-divider" />
        <button
          className="moc-zoom-btn"
          title="축소"
          onMouseDown={() => startZoom(zoomOut)}
          onMouseUp={stopZoom}
          onMouseLeave={stopZoom}
          onTouchStart={e => { e.preventDefault(); startZoom(zoomOut) }}
          onTouchEnd={stopZoom}
        >
          −
        </button>
      </div>

      {/* ── Basemap trigger ── */}
      <div className="moc-picker" ref={panelRef}>
        <button
          className="moc-trigger"
          onClick={() => setOpen(v => !v)}
          title="배경 지도 선택"
        >
          <img
            src={currentMap.thumb}
            width={16} height={16}
            style={{ borderRadius: 3, display: 'block', flexShrink: 0 }}
            alt=""
          />
          <span>{currentMap.label}</span>
          <span className="moc-chevron">{open ? '▴' : '▾'}</span>
        </button>

        {open && (
          <div className="moc-panel">
            {SECTIONS.map(section => {
              const items = BASEMAPS.filter(b => b.section === section)
              return (
                <div key={section}>
                  <div className="moc-panel-section">
                    <div className="moc-panel-section-label">{section}</div>
                  </div>
                  <div className="moc-grid">
                    {items.map(b => (
                      <button
                        key={b.id}
                        className={`moc-thumb${basemap === b.id ? ' selected' : ''}`}
                        onClick={() => { onBasemap(b.id); setOpen(false) }}
                        title={b.label}
                      >
                        <div className="moc-thumb-img">
                          <img src={b.thumb} alt={b.label} />
                          {basemap === b.id && (
                            <div style={{
                              position: 'absolute', inset: 0,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              background: 'rgba(0,0,0,.35)',
                            }}>
                              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                <circle cx="8" cy="8" r="7" fill="rgba(0,0,0,.5)"/>
                                <path d="M4 8l2.5 2.5 5.5-5" stroke="#5af" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                              </svg>
                            </div>
                          )}
                        </div>
                        <span className="moc-thumb-name">{b.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )
            })}

            {/* Terrain toggle */}
            <div className="moc-terrain-section">
              <div className="moc-panel-section-label" style={{ marginBottom: 6 }}>지형</div>
              <label className="moc-terrain-row">
                <input
                  type="checkbox"
                  checked={showTerrain}
                  onChange={e => onShowTerrain(e.target.checked)}
                />
                <span>3D 지형 (Terrain)</span>
              </label>
            </div>
          </div>
        )}
      </div>

    </div>
  )
}