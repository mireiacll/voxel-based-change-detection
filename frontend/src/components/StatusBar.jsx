export default function StatusBar({ msg, done }) {
  return (
    <div id="statusbar" className={done ? 'done' : ''}>
      <div id="status-dots">
        <span /><span /><span />
      </div>
      <span id="status-text">{msg}</span>
    </div>
  )
}