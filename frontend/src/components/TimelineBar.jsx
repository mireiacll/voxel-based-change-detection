/**
 * TimelineBar.jsx
 *
 * Fixed bottom bar shown only in time-series mode.
 * Replaces the status bar — sits at the same bottom position.
 *
 * Features:
 *  · Proportionally-spaced date markers based on real timestamps
 *  · Draggable scrubber that snaps to the nearest snapshot
 *  · Play / pause button that auto-advances every `playInterval` ms
 *  · Keyboard: ← → to step, Space to play/pause
 *
 * Props
 * ─────
 *   snapshots      — Snapshot[]   ordered array from timelineDiffs.js
 *   activeIndex    — number       currently displayed snapshot index
 *   onSelect       — (index) => void
 *   playing        — bool
 *   onPlayPause    — () => void
 */

import { useRef, useCallback, useEffect } from 'react'

// ── Helpers ───────────────────────────────────────────────────────────────

function lerp(a, b, t) { return a + (b - a) * t }

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)) }

// Map timestamp → 0..1 position along the track
function tsToFrac(ts, minTs, maxTs) {
  if (maxTs === minTs) return 0
  return (ts - minTs) / (maxTs - minTs)
}

// ── Component ─────────────────────────────────────────────────────────────

export default function TimelineBar({ snapshots, activeIndex, onSelect, playing, onPlayPause }) {
  const trackRef = useRef(null)

  if (!snapshots || snapshots.length === 0) return null

  // Timestamps from the "after" date of each snapshot gives us the end points
  // We anchor left = start of first snapshot (date_a.ts) and right = date_b.ts of last
  const allTs  = snapshots.flatMap(s => [s.date_a.ts, s.date_b.ts])
  const minTs  = Math.min(...allTs)
  const maxTs  = Math.max(...allTs)

  // Each marker sits at the midpoint between its two dates (represents the change period)
  const markerFracs = snapshots.map(s => tsToFrac((s.date_a.ts + s.date_b.ts) / 2, minTs, maxTs))

  // The scrubber sits at the active snapshot's marker
  const scrubFrac = markerFracs[activeIndex] ?? 0

  // ── Drag handling ─────────────────────────────────────────────────────
  function fracToNearest(frac) {
    let best = 0, bestDist = Infinity
    markerFracs.forEach((f, i) => {
      const d = Math.abs(f - frac)
      if (d < bestDist) { bestDist = d; best = i }
    })
    return best
  }

  function handleTrackClick(e) {
    const rect = trackRef.current.getBoundingClientRect()
    const frac = clamp((e.clientX - rect.left) / rect.width, 0, 1)
    onSelect(fracToNearest(frac))
  }

  function handleScrubMouseDown(e) {
    e.preventDefault()
    e.stopPropagation()

    function onMove(ev) {
      const rect = trackRef.current?.getBoundingClientRect()
      if (!rect) return
      const frac = clamp((ev.clientX - rect.left) / rect.width, 0, 1)
      onSelect(fracToNearest(frac))
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup',   onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
  }

  // ── Touch support ─────────────────────────────────────────────────────
  function handleTouchMove(e) {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect) return
    const touch = e.touches[0]
    const frac  = clamp((touch.clientX - rect.left) / rect.width, 0, 1)
    onSelect(fracToNearest(frac))
  }

  const active = snapshots[activeIndex]

  return (
    <div id="timeline-bar">

      {/* ── Left: play controls ── */}
      <div className="tl-left">
        <button
          className={`tl-play-btn${playing ? ' tl-playing' : ''}`}
          onClick={onPlayPause}
          title={playing ? 'Pause (Space)' : 'Play (Space)'}
        >
          {playing
            ? <svg width="10" height="10" viewBox="0 0 10 10"><rect x="1" y="1" width="3" height="8" rx="1"/><rect x="6" y="1" width="3" height="8" rx="1"/></svg>
            : <svg width="10" height="10" viewBox="0 0 10 10"><polygon points="1,1 9,5 1,9"/></svg>
          }
        </button>

        <button
          className="tl-step-btn"
          onClick={() => onSelect(Math.max(0, activeIndex - 1))}
          disabled={activeIndex === 0}
          title="Previous (←)"
        >‹</button>

        <button
          className="tl-step-btn"
          onClick={() => onSelect(Math.min(snapshots.length - 1, activeIndex + 1))}
          disabled={activeIndex === snapshots.length - 1}
          title="Next (→)"
        >›</button>
      </div>

      {/* ── Centre: track ── */}
      <div className="tl-track-wrap">

        {/* Active snapshot label above track */}
        {active && (
          <div className="tl-active-label">
            <span className="tl-active-a">{active.date_a.label}</span>
            <span className="tl-active-arrow">→</span>
            <span className="tl-active-b">{active.date_b.label}</span>
            <span className="tl-active-stats">
              <span className="tl-stat-added">+{active.stats.added_count}</span>
              <span className="tl-stat-removed">−{active.stats.removed_count}</span>
            </span>
          </div>
        )}

        {/* The track itself */}
        <div
          className="tl-track"
          ref={trackRef}
          onClick={handleTrackClick}
          onTouchMove={handleTouchMove}
        >
          {/* Filled progress bar up to active marker */}
          <div
            className="tl-fill"
            style={{ width: `${scrubFrac * 100}%` }}
          />

          {/* Snapshot markers */}
          {snapshots.map((s, i) => {
            const frac    = markerFracs[i]
            const isActive = i === activeIndex
            return (
              <button
                key={s.id}
                className={`tl-marker${isActive ? ' tl-marker-active' : ''}`}
                style={{ left: `${frac * 100}%` }}
                onClick={e => { e.stopPropagation(); onSelect(i) }}
                title={`${s.date_a.label} → ${s.date_b.label}`}
              >
                {/* Tooltip on hover */}
                <span className="tl-marker-tip">
                  {s.date_a.label}<br/>→ {s.date_b.label}
                </span>
              </button>
            )
          })}

          {/* Date labels below track (at marker positions, only for non-overlapping) */}
          {snapshots.map((s, i) => {
            const frac = markerFracs[i]
            return (
              <span
                key={`lbl-${s.id}`}
                className={`tl-date-lbl${i === activeIndex ? ' tl-date-lbl-active' : ''}`}
                style={{ left: `${frac * 100}%` }}
              >
                {s.date_a.label.replace(/, \d{4}/, '')}–{s.date_b.label.replace(/, \d{4}/, '')}
              </span>
            )
          })}

          {/* Scrubber handle */}
          <div
            className="tl-scrubber"
            style={{ left: `${scrubFrac * 100}%` }}
            onMouseDown={handleScrubMouseDown}
          />
        </div>
      </div>

      {/* ── Right: snapshot counter ── */}
      <div className="tl-right">
        <span className="tl-counter">
          {activeIndex + 1} <span className="tl-counter-of">/ {snapshots.length}</span>
        </span>
      </div>

    </div>
  )
}