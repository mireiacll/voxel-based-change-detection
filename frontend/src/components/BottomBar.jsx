/**
 * BottomBar.jsx
 *
 * Fixed bottom strip — always visible (status, shortcuts, coords).
 * In timeline mode, TimelineBar renders just above it.
 */

import TimelineBar from './TimelineBar'

export default function BottomBar({
  statusMsg, statusDone,
  coords,
  mode,
  tlSnapshots, tlActiveIndex, tlOnSelect,
  tlPlaying, tlOnPlayPause,
  showRightPanel,
  splitMode,
}) {
  const showTimeline = mode === 'timeline' && tlSnapshots?.length > 0

  return (
    <>
      {/* Timeline slider strip — sits just above the bottom bar */}
      {showTimeline && (
        <TimelineBar
          snapshots={tlSnapshots}
          activeIndex={tlActiveIndex}
          onSelect={tlOnSelect}
          playing={tlPlaying}
          onPlayPause={tlOnPlayPause}
          showRightPanel={showRightPanel}
        />
      )}

      {/* Always-visible bottom bar */}
      <div id="bottom-bar">

        {/* Status */}
        <div className="bb-status">
          {!statusDone && <div id="status-dots"><span /><span /><span /></div>}
          <span id="status-text">{statusMsg}</span>
        </div>

        {/* Separator */}
        <div className="bb-sep" />

        {/* Shortcuts — single row with title */}
        <div className="bb-shortcuts-block">
          <span className="bb-section-label">단축키</span>
          {showRightPanel && (
            <>
              <span className="bb-key-item"><kbd>A</kbd>추가</span>
              <span className="bb-key-item"><kbd>R</kbd>제거</span>
              <span className="bb-key-item"><kbd>U</kbd>비변화</span>
              {splitMode && <span className="bb-key-hint">(A·B 동시)</span>}
            </>
          )}
          <span className="bb-key-item"><kbd>1</kbd>수직 뷰</span>
          {mode === 'timeline' && (
            <>
              <span className="bb-key-item"><kbd>← →</kbd>이동</span>
              <span className="bb-key-item"><kbd>Space</kbd>재생</span>
            </>
          )}
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
    </>
  )
}