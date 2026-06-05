/**
 * MapSubHeader.jsx
 *
 * Thin bar sitting between the NavBar and the Cesium map.
 * Contains:
 *   · "A vs B 비교" | "시계열 변화탐지" mode tabs (left)
 *   · Dataset A / Dataset B labels shown when in compare mode (right — overlaid on map edge)
 *
 * Props
 * ─────
 *   mode       — 'compare' | 'timeline'
 *   onMode     — (mode) => void
 *   compareIdA — string  (date id)
 *   compareIdB — string
 *   activeSite — site object (to resolve label from id)
 */

export default function MapSubHeader({ mode, onMode, compareIdA, compareIdB, activeSite }) {
  const dates = activeSite?.dates ?? []

  function dateLabel(id) {
    if (!id) return '—'
    return dates.find(d => d.id === id)?.label ?? id
  }

  return (
    <div id="map-sub-header">
      <div className="msh-tabs">
        <button
          className={`msh-tab${mode === 'compare' ? ' active' : ''}`}
          onClick={() => onMode('compare')}
        >
          A vs B 비교
        </button>
        <button
          className={`msh-tab${mode === 'timeline' ? ' active' : ''}`}
          onClick={() => onMode('timeline')}
        >
          시계열 변화탐지
        </button>
      </div>

      {mode === 'compare' && (compareIdA || compareIdB) && (
        <div className="msh-dataset-labels">
          {compareIdA && (
            <span className="msh-dataset-tag msh-tag-a">
              Dataset A — {dateLabel(compareIdA)}
            </span>
          )}
          {compareIdB && (
            <span className="msh-dataset-tag msh-tag-b">
              Dataset B — {dateLabel(compareIdB)}
            </span>
          )}
        </div>
      )}
    </div>
  )
}