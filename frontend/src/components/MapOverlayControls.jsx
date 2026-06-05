/**
 * MapOverlayControls.jsx
 *
 * Floating controls sitting on top of the Cesium map (bottom-left corner).
 * Contains:
 *   · Basemap / background picker (dropdown)
 *   · Terrain toggle (inside the picker, not a separate toggle)
 *   · Point cloud size slider (only shown when active date is pointcloud)
 *
 * Basemap options match what Cesium's IonImageryProvider / built-in providers offer.
 *
 * Props
 * ─────
 *   basemap        — string  current basemap id
 *   onBasemap      — (id) => void
 *   showTerrain    — bool
 *   onShowTerrain  — (bool) => void
 *   pcSize         — number
 *   onPcSize       — (n) => void
 *   showPcSlider   — bool  (true when active date is pointcloud)
 */

import { useState } from 'react'

const BASEMAPS = [
  { id: 'aerial',       label: '위성 (Aerial)' },
  { id: 'aerial_roads', label: '위성 + 도로' },
  { id: 'osm',          label: 'OpenStreetMap' },
  { id: 'dark',         label: '다크 맵' },
  { id: 'none',         label: '없음 (Globe only)' },
]

export default function MapOverlayControls({
  basemap, onBasemap,
  showTerrain, onShowTerrain,
  pcSize, onPcSize,
  showPcSlider,
}) {
  const [open, setOpen] = useState(false)

  const currentLabel = BASEMAPS.find(b => b.id === basemap)?.label ?? '배경 선택'

  return (
    <div id="map-overlay-controls">

      {/* ── Basemap picker ── */}
      <div className="moc-picker">
        <button
          className="moc-trigger"
          onClick={() => setOpen(v => !v)}
          title="배경 지도 선택"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
               stroke="currentColor" strokeWidth="2">
            <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/>
            <line x1="9" y1="3" x2="9" y2="18"/>
            <line x1="15" y1="6" x2="15" y2="21"/>
          </svg>
          <span>{currentLabel}</span>
          <span className="moc-chevron">{open ? '▴' : '▾'}</span>
        </button>

        {open && (
          <div className="moc-dropdown">
            <div className="moc-dropdown-label">배경 지도</div>
            {BASEMAPS.map(b => (
              <button
                key={b.id}
                className={`moc-option${basemap === b.id ? ' selected' : ''}`}
                onClick={() => { onBasemap(b.id); setOpen(false) }}
              >
                {basemap === b.id && <span className="moc-check">✓</span>}
                {b.label}
              </button>
            ))}

            <div className="moc-divider" />
            <div className="moc-dropdown-label">지형</div>
            <label className="moc-terrain-row">
              <input
                type="checkbox"
                checked={showTerrain}
                onChange={e => onShowTerrain(e.target.checked)}
              />
              <span>3D 지형 (Terrain)</span>
            </label>
          </div>
        )}
      </div>

      {/* ── Point cloud size (only when PC date active) ── */}
      {showPcSlider && (
        <div className="moc-pc-size">
          <span className="moc-pc-label">포인트 크기</span>
          <input
            type="range" min="1" max="20" step="0.5"
            value={pcSize}
            onChange={e => onPcSize(parseFloat(e.target.value))}
          />
          <span className="moc-pc-val">{pcSize}</span>
        </div>
      )}

    </div>
  )
}