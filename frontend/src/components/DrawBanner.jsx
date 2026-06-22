export default function DrawBanner({ visible, onCancel, showRightPanel }) {
  return (
    <div
      id="draw-banner"
      className={visible ? '' : 'hidden'}
      style={{ right: showRightPanel ? 'var(--rpw)' : '0' }}
    >
      <span>📍 Click to add vertices &nbsp;·&nbsp; Right-click or double-click to close polygon</span>
      <button onClick={onCancel}>✕ Cancel</button>
    </div>
  )
}