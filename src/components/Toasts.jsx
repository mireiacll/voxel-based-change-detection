export default function Toasts({ items }) {
  return (
    <div id="toasts">
      {items.map(t => (
        <div key={t.id} className={`toast t${t.type}`}>
          {t.msg}
        </div>
      ))}
    </div>
  )
}