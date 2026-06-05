/**
 * BottomBar.jsx
 *
 * Fixed bottom strip (analysis view).
 * In timeline mode, replaced entirely by TimelineBar.
 *
 * Layout (left → right):
 *   · Status dots + message
 *   · Sep
 *   · Legend (vertical: 범례 label, then Added / Removed rows)
 *   · Sep
 *   · Shortcuts (two columns: action keys | camera/timeline keys)
 *   · Coords (right edge, auto-pushed)
 */

import TimelineBar from './TimelineBar'

export default function BottomBar({
  statusMsg, statusDone,
  coords,
  mode,
  tlSnapshots, tlActiveIndex, tlOnSelect,
  tlPlaying, tlOnPlayPause,
}) {
  // Timeline mode with data → hand off to TimelineBar
  if (mode === 'timeline' && tlSnapshots?.length > 0) {
    return (
      <TimelineBar
        snapshots={tlSnapshots}
        activeIndex={tlActiveIndex}
        onSelect={tlOnSelect}
        playing={tlPlaying}
        onPlayPause={tlOnPlayPause}
      />
    )
  }

  return (
    <div id="bottom-bar">

      {/* Status */}
      <div className="bb-status">
        {!statusDone && (
          <div id="status-dots"><span /><span /><span /></div>
        )}
        <span id="status-text">{statusMsg}</span>
      </div>

      <div className="bb-sep" />

      {/* 범례 — vertical */}
      <div className="bb-legend-block">
        <span className="bb-section-label">범례</span>
        <div className="bb-legend-item">
          <span className="bb-swatch" style={{ background: 'var(--added)' }} />
          <span>증가</span>
        </div>
        <div className="bb-legend-item">
          <span className="bb-swatch" style={{ background: 'var(--removed)' }} />
          <span>감소</span>
        </div>
      </div>

      <div className="bb-sep" />

      {/* Shortcuts — two rows */}
      <div className="bb-shortcuts-block">
        <span className="bb-section-label">단축키</span>
        <div className="bb-shortcuts-cols">
          <div className="bb-shortcuts-row">
            <span className="bb-key-item"><kbd>A</kbd>추가 토글</span>
            <span className="bb-key-item"><kbd>R</kbd>제거 토글</span>
            <span className="bb-key-item"><kbd>D</kbd>영역 그리기</span>
            <span className="bb-key-item"><kbd>M</kbd>레이어 토글</span>
          </div>
          <div className="bb-shortcuts-row">
            <span className="bb-key-item"><kbd>1</kbd>현장 뷰</span>
            <span className="bb-key-item"><kbd>2</kbd>수직 뷰</span>
            {mode === 'timeline' && (
              <>
                <span className="bb-key-item"><kbd>← →</kbd>이동</span>
                <span className="bb-key-item"><kbd>Space</kbd>재생</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Coords — right edge */}
      {coords && coords.lat !== '—' && (
        <>
          <div className="bb-sep" style={{ marginLeft: 'auto' }} />
          <div className="bb-coords">
            <span>{coords.lat}°N</span>
            <span className="bb-sep-dot">·</span>
            <span>{coords.lon}°E</span>
            <span className="bb-sep-dot">·</span>
            <span>{coords.height} m</span>
          </div>
        </>
      )}

    </div>
  )
}