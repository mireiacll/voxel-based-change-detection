/**
 * BottomBar.jsx
 *
 * Fixed bottom strip — always visible (status, legend, shortcuts, coords).
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

        {/* 범례 — 3-column grid (2 rows each) */}
        <div className="bb-legend-block">
          <span className="bb-section-label">범례</span>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto auto auto', gap: '3px 20px' }}>
            {/* Col 1: MESH, PC */}
            <div className="bb-legend-item">
              <span className="bb-swatch-tag ltag-amber">MESH</span>
              <span>3D Mesh</span>
            </div>
            {/* Col 2: VOX */}
            <div className="bb-legend-item">
              <span className="bb-swatch-tag ltag-teal">VOX</span>
              <span>Voxel</span>
            </div>
            {/* Col 3: 증가 */}
            <div className="bb-legend-item">
              <span className="bb-swatch" style={{ background: 'var(--added)' }} />
              <span>증가</span>
            </div>
            {/* Row 2 */}
            <div className="bb-legend-item">
              <span className="bb-swatch-tag ltag-purple">PC</span>
              <span>Point Cloud</span>
            </div>
            <div />
            <div className="bb-legend-item">
              <span className="bb-swatch" style={{ background: 'var(--removed)' }} />
              <span>감소</span>
            </div>
          </div>
        </div>

        <div className="bb-sep" />

        {/* Shortcuts */}
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
    </>
  )
}
