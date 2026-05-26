export default function DrawBanner({ visible, onCancel }) {
  return (
    <div id="draw-banner" className={visible ? '' : 'hidden'}>
      <span>📍 Click to add vertices &nbsp;·&nbsp; Right-click or double-click to close polygon</span>
      <button onClick={onCancel}>✕ Cancel</button>
    </div>
  )
}