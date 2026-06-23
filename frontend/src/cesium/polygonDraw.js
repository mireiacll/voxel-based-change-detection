import { toast, requestRender } from './cesiumInit'

// ── Per-tab polygon state ─────────────────────────────────────────────────
//
// Instead of one shared _poly + parked slots (which caused aliasing bugs when
// swapping), each tab owns its own independent state object at all times.
// Only the ACTIVE tab's entities are visible; others are hidden.
//
// Tab key: 'compare-api'  (the only remaining compare mode)
// Timeline never has a polygon so it is not a key here.
// The old 'compare' (simple) mode has been removed — see RightPanel.jsx.

function _emptyState() {
  return {
    drawing:  false,
    closed:   false,
    pts:      [],
    geo:      [],
    handler:  null,
    entities: [],
    drawInfo: 'No area selected — diff runs on full extent',
    drawBtn:  '✏ Draw Area',
  }
}

const _tabs = {
  'compare-api': _emptyState(),
}

// Which tab is currently active (visible).
let _activeTab = 'compare-api'

// Shorthand for the active tab's state
function _s() { return _tabs[_activeTab] }

let _onDrawBanner   = () => {}
let _onDrawInfo     = () => {}
let _onDrawBtnLabel = () => {}

export function setDrawCallbacks(onBanner, onInfo, onBtnLabel) {
  _onDrawBanner   = onBanner
  _onDrawInfo     = onInfo
  _onDrawBtnLabel = onBtnLabel
}

// ── Helpers ───────────────────────────────────────────────────────────────

function _removeEntities(entities) {
  entities.forEach(e => {
    try { window.viewer?.entities.remove(e) } catch (_) {}
  })
}

function _showEntities(entities, visible) {
  entities.forEach(e => {
    try { e.show = visible } catch (_) {}
  })
  if (window.viewer) requestRender()
}

function _syncUI(s) {
  _onDrawInfo(s.drawInfo)
  _onDrawBtnLabel(s.drawBtn)
  _onDrawBanner(s.drawing)
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Call on project switch — wipes ALL tabs completely.
 */
export function clearPolygon() {
  Object.keys(_tabs).forEach(tab => {
    const s = _tabs[tab]
    if (s.handler) { s.handler.destroy(); s.handler = null }
    _removeEntities(s.entities)
    _tabs[tab] = _emptyState()
  })
  _onDrawBanner(false)
  _onDrawBtnLabel('✏ Draw Area')
  _onDrawInfo('No area selected — diff runs on full extent')
  if (window.viewer) window.viewer.scene.canvas.style.cursor = ''
  requestRender()
}

/**
 * Switch active tab.
 * Hides the departing tab's entities, shows the arriving tab's entities,
 * and updates the UI labels to match the arriving tab.
 *
 * @param {string} fromTab  'compare-api' | 'timeline-hidden'
 * @param {string} toTab    'compare-api' | 'timeline-hidden'
 * @param {string} currentDrawInfo   current UI drawInfo (saved into departing tab)
 * @param {string} currentDrawBtn    current UI drawBtn  (saved into departing tab)
 */
export function swapPolygonTab(fromTab, toTab, currentDrawInfo, currentDrawBtn) {
  // ── 1. Deactivate the departing tab ──────────────────────────────────────
  const from = _tabs[fromTab]
  if (from) {
    // If mid-draw, cancel cleanly
    if (from.drawing) {
      if (from.handler) { from.handler.destroy(); from.handler = null }
      _removeEntities(from.entities)
      if (window.viewer) window.viewer.scene.canvas.style.cursor = ''
      Object.assign(from, _emptyState())
    } else {
      // Save current UI labels into the departing tab
      from.drawInfo = currentDrawInfo
      from.drawBtn  = currentDrawBtn
      // Hide its entities
      _showEntities(from.entities, false)
    }
  }

  // ── 2. Activate the arriving tab ─────────────────────────────────────────
  // timeline-hidden is not a real tab slot — arriving from timeline means
  // just showing whichever compare tab we're going to (already handled below).
  if (toTab !== 'timeline-hidden') {
    _activeTab = toTab
    const to = _tabs[toTab]
    // Show its entities
    _showEntities(to.entities, true)
    // Sync UI to arriving tab's saved labels
    _syncUI(to)
  } else {
    // Going INTO timeline — nothing to activate, just hide everything
    // _activeTab stays as-is; timeline has no polygon tab
    Object.keys(_tabs).forEach(tab => _showEntities(_tabs[tab].entities, false))
    _onDrawBanner(false)
    _onDrawInfo('No area selected — diff runs on full extent')
    _onDrawBtnLabel('✏ Draw Area')
  }

  if (window.viewer) requestRender()
}

/**
 * Toggle polygon drawing on/off for the active tab.
 * Called by the Draw Area button and 'd' shortcut.
 */
export function togglePolygonDraw() {
  const s = _s()
  if (s.drawing || s.closed) {
    _clearActivePoly()
    s.drawInfo = 'No area selected — diff runs on full extent'
    s.drawBtn  = '✏ Draw Area'
    _onDrawBtnLabel(s.drawBtn)
    _onDrawInfo(s.drawInfo)
  } else {
    _startDraw()
  }
}

// ── Internal draw logic ───────────────────────────────────────────────────

function _startDraw() {
  _clearActivePoly()   // wipe any stale state on this tab first
  const s = _s()
  s.drawing = true

  // Fly to top-down view so the user can draw accurately
  const site = window.currentSite
  if (site) {
    import('./cesiumInit').then(({ flyTo }) =>
      flyTo(site.centerLon, site.centerLat, site.cameraHeight * 1.8, -90, 0)
    )
  }

  window.viewer.scene.canvas.style.cursor = 'crosshair'
  _onDrawBanner(true)
  s.drawBtn  = '✕ Cancel Drawing'
  s.drawInfo = 'Click on the map to add vertices…'
  _onDrawBtnLabel(s.drawBtn)
  _onDrawInfo(s.drawInfo)

  const Cesium = window.Cesium

  // Polygon fill (live callback reads from this tab's pts)
  s.entities.push(window.viewer.entities.add({
    polygon: {
      hierarchy: new Cesium.CallbackProperty(
        () => s.pts.length >= 3
          ? new Cesium.PolygonHierarchy(s.pts)
          : new Cesium.PolygonHierarchy([]),
        false
      ),
      material: Cesium.Color.YELLOW.withAlpha(0.12),
    },
  }))

  // Outline polyline
  s.entities.push(window.viewer.entities.add({
    polyline: {
      positions: new Cesium.CallbackProperty(
        () => s.pts.length >= 2 ? [...s.pts, s.pts[0]] : [...s.pts],
        false
      ),
      width: 2,
      material: new Cesium.PolylineDashMaterialProperty({
        color: Cesium.Color.YELLOW, dashLength: 16,
      }),
      clampToGround: true,
    },
  }))

  s.handler = new Cesium.ScreenSpaceEventHandler(window.viewer.scene.canvas)

  s.handler.setInputAction(e => {
    if (!s.drawing) return
    const ray = window.viewer.camera.getPickRay(e.position)
    const pos = window.viewer.scene.globe.pick(ray, window.viewer.scene)
    if (!pos) return
    _addVertex(s, pos)
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK)

  s.handler.setInputAction(() => {
    if (s.pts.length >= 3) _closePoly(s)
    else toast('Need at least 3 vertices to close the polygon', 'warn')
  }, Cesium.ScreenSpaceEventType.RIGHT_CLICK)

  s.handler.setInputAction(() => {
    if (s.pts.length > 3) {
      s.pts.pop(); s.geo.pop()
      const dot = s.entities.pop()
      if (dot) window.viewer.entities.remove(dot)
    }
    if (s.pts.length >= 3) _closePoly(s)
  }, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK)
}

function _addVertex(s, cartesian) {
  const Cesium = window.Cesium
  s.pts.push(cartesian)
  const c = Cesium.Cartographic.fromCartesian(cartesian)
  s.geo.push({
    lon: Cesium.Math.toDegrees(c.longitude),
    lat: Cesium.Math.toDegrees(c.latitude),
  })
  s.entities.push(window.viewer.entities.add({
    position: cartesian,
    point: {
      pixelSize: 8, color: Cesium.Color.YELLOW,
      outlineColor: Cesium.Color.fromCssColorString('#111'), outlineWidth: 1.5,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  }))
  const n = s.pts.length
  s.drawInfo = `${n} ${n === 1 ? 'vertex' : 'vertices'}` +
    (n >= 3 ? ' — right-click or double-click to close' : '')
  _onDrawInfo(s.drawInfo)
  requestRender()
}

function _closePoly(s) {
  s.drawing = false; s.closed = true
  if (s.handler) { s.handler.destroy(); s.handler = null }
  window.viewer.scene.canvas.style.cursor = ''
  _onDrawBanner(false)
  s.drawBtn  = '✕ Clear Area'
  s.drawInfo = `✓ ${s.pts.length}-vertex polygon — run diff to apply`
  _onDrawBtnLabel(s.drawBtn)
  _onDrawInfo(s.drawInfo)
  toast(`Area selected (${s.pts.length} vertices). Now run the diff.`, 'ok')
  requestRender()
}

/**
 * Clear ONLY the active tab's polygon (removes its Cesium entities).
 */
function _clearActivePoly() {
  const s = _s()
  s.drawing = false; s.closed = false
  s.pts = []; s.geo = []
  if (s.handler) { s.handler.destroy(); s.handler = null }
  _removeEntities(s.entities)
  s.entities = []
  if (window.viewer) window.viewer.scene.canvas.style.cursor = ''
  _onDrawBanner(false)
  requestRender()
}

// ── Getters ───────────────────────────────────────────────────────────────

/**
 * Returns a WKT POLYGON string from the active tab's closed polygon, or null.
 * Format: POLYGON((lon1 lat1, lon2 lat2, ..., lon1 lat1))
 */
export function getPolygonWkt() {
  const s = _s()
  if (!s.closed || s.geo.length < 3) return null
  const coords = [...s.geo, s.geo[0]]
    .map(p => `${p.lon} ${p.lat}`)
    .join(', ')
  return `POLYGON((${coords}))`
}