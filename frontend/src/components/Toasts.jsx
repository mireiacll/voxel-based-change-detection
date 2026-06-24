export default function Toasts({ items, showRightPanel }) {
  return (
    <div id="toasts" className={showRightPanel ? 'toasts-rp-open' : ''}>
      {items.map(t => (
        <div key={t.id} className={`toast t${t.type}`}>
          {t.msg}
        </div>
      ))}
    </div>
  )
}