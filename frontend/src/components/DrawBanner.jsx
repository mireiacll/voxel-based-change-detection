export default function DrawBanner({ visible, onCancel, showRightPanel }) {
  return (
    <div
      id="draw-banner"
      className={visible ? '' : 'hidden'}
      style={{ right: showRightPanel ? 'var(--rpw)' : '0' }}
    >
      <span>📍 지도를 클릭해 꼭짓점을 추가하고 &nbsp;·&nbsp; 우클릭 또는 더블클릭으로 다각형을 닫으세요</span>
      <button onClick={onCancel}>✕ 취소</button>
    </div>
  )
}