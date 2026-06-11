import { toast, requestRender } from './cesiumInit'

// ── Active polygon state ──────────────────────────────────────────────────
const _poly = {
  drawing:  false,
  closed:   false,
  pts:      [],
  geo:      [],
  handler:  null,
  entities: [],
}

// ── Parked polygon slots — one per compare tab + a hidden slot for timeline ──
// When switching tabs we hide + snapshot the active poly into the departing
// tab's slot, then restore (and show) the arriving tab's slot.
// Slot shape: { pts, geo, entities, closed, drawInfo, drawBtn } | null
const _parked = {
  'compare':         null,
  'compare-api':     null,
  'timeline-hidden': null,   // used to park whichever compare tab is active when entering timeline
}

let _onDrawBanner   = () => {}
let _onDrawInfo     = () => {}
let _onDrawBtnLabel = () => {}

export function setDrawCallbacks(onBanner, onInfo, onBtnLabel) {
  _onDrawBanner   = onBanner
  _onDrawInfo     = onInfo
  _onDrawBtnLabel = onBtnLabel
}

// ── Always clears regardless of state — used on project switch ────────────
export function clearPolygon() {
  _clearPoly()
  _parked['compare']         = null
  _parked['compare-api']     = null
  _parked['timeline-hidden'] = null
  _onDrawBtnLabel('✏ Draw Area')
  _onDrawInfo('No area selected — diff runs on full extent')
}

// ── Hide / show the active polygon entities ───────────────────────────────
export function setPolygonVisible(visible) {
  _poly.entities.forEach(e => {
    try { e.show = visible } catch (_) {}
  })
  if (window.viewer) requestRender()
}

/**
 * Swap the active polygon between two compare tabs.
 *
 * Call this when switching from `fromTab` to `toTab`.
 * - Parks the current _poly into `fromTab`'s slot (hidden).
 * - Restores `toTab`'s slot into _poly (visible), or leaves _poly empty.
 * - Fires the draw callbacks so the UI labels match the arriving tab.
 *
 * @param {string} fromTab  'compare' | 'compare-api'
 * @param {string} toTab    'compare' | 'compare-api'
 * @param {string} currentDrawInfo   current drawInfo text (to save)
 * @param {string} currentDrawBtn    current drawBtnLabel text (to save)
 */
export function swapPolygonTab(fromTab, toTab, currentDrawInfo, currentDrawBtn) {
  // 1. Park the current active polygon for fromTab.
  //    If mid-draw, discard the partial polygon entirely — cleaner than parking garbage.
  if (_poly.drawing) {
    if (_poly.handler) { _poly.handler.destroy(); _poly.handler = null }
    _poly.entities.forEach(e => { try { window.viewer.entities.remove(e) } catch (_) {} })
    _poly.entities = []
    _poly.pts = []; _poly.geo = []
    _poly.drawing = false; _poly.closed = false
    if (window.viewer) window.viewer.scene.canvas.style.cursor = ''
    _onDrawBanner(false)
    // Park as null — tab starts fresh when you come back
    _parked[fromTab] = null
  } else {
    // Not drawing: hide entities and park normally
    _poly.entities.forEach(e => { try { e.show = false } catch (_) {} })
    _parked[fromTab] = {
      pts:      _poly.pts,
      geo:      _poly.geo,
      entities: _poly.entities,
      closed:   _poly.closed,
      drawInfo: currentDrawInfo,
      drawBtn:  currentDrawBtn,
    }
  }

  // 2. Restore toTab's parked polygon into _poly, or start fresh
  const slot = _parked[toTab]

  if (slot) {
    // Restore
    _poly.pts      = slot.pts
    _poly.geo      = slot.geo
    _poly.entities = slot.entities
    _poly.closed   = slot.closed
    _poly.drawing  = false
    _poly.handler  = null
    // Show restored entities
    _poly.entities.forEach(e => { try { e.show = true } catch (_) {} })
    // Restore UI labels
    _onDrawInfo(slot.drawInfo)
    _onDrawBtnLabel(slot.drawBtn)
    _parked[toTab] = null
  } else {
    // No parked polygon for this tab — start with a clean slate
    _poly.pts      = []
    _poly.geo      = []
    _poly.entities = []
    _poly.closed   = false
    _poly.drawing  = false
    _poly.handler  = null
    _onDrawInfo('No area selected — diff runs on full extent')
    _onDrawBtnLabel('✏ Draw Area')
  }

  if (window.viewer) requestRender()
}

export function togglePolygonDraw() {
  if (_poly.drawing || _poly.closed) {
    _clearPoly()
    _onDrawBtnLabel('✏ Draw Area')
    _onDrawInfo('No area selected — diff runs on full extent')
  } else {
    _startDraw()
  }
}

function _startDraw() {
  _clearPoly()
  _poly.drawing = true

  const site = window.currentSite
  if (site) {
    import('./cesiumInit').then(({ flyTo }) =>
      flyTo(site.camera.lon, site.camera.lat, site.camera.height * 1.2, -90, 0)
    )
  }

  window.viewer.scene.canvas.style.cursor = 'crosshair'
  _onDrawBanner(true)
  _onDrawBtnLabel('✕ Cancel Drawing')
  _onDrawInfo('Click on the map to add vertices…')

  const Cesium = window.Cesium

  _poly.entities.push(window.viewer.entities.add({
    polygon: {
      hierarchy: new Cesium.CallbackProperty(
        () => _poly.pts.length >= 3
          ? new Cesium.PolygonHierarchy(_poly.pts)
          : new Cesium.PolygonHierarchy([]),
        false
      ),
      material: Cesium.Color.YELLOW.withAlpha(0.12),
    },
  }))
  _poly.entities.push(window.viewer.entities.add({
    polyline: {
      positions: new Cesium.CallbackProperty(
        () => _poly.pts.length >= 2 ? [..._poly.pts, _poly.pts[0]] : [..._poly.pts],
        false
      ),
      width: 2,
      material: new Cesium.PolylineDashMaterialProperty({
        color: Cesium.Color.YELLOW, dashLength: 16,
      }),
      clampToGround: true,
    },
  }))

  _poly.handler = new Cesium.ScreenSpaceEventHandler(window.viewer.scene.canvas)
  _poly.handler.setInputAction(e => {
    if (!_poly.drawing) return
    const ray = window.viewer.camera.getPickRay(e.position)
    const pos = window.viewer.scene.globe.pick(ray, window.viewer.scene)
    if (!pos) return
    _addVertex(pos)
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK)

  _poly.handler.setInputAction(() => {
    if (_poly.pts.length >= 3) _closePoly()
    else toast('Need at least 3 vertices to close the polygon', 'warn')
  }, Cesium.ScreenSpaceEventType.RIGHT_CLICK)

  _poly.handler.setInputAction(() => {
    if (_poly.pts.length > 3) {
      _poly.pts.pop(); _poly.geo.pop()
      const dot = _poly.entities.pop()
      if (dot) window.viewer.entities.remove(dot)
    }
    if (_poly.pts.length >= 3) _closePoly()
  }, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK)
}

function _addVertex(cartesian) {
  const Cesium = window.Cesium
  _poly.pts.push(cartesian)
  const c = Cesium.Cartographic.fromCartesian(cartesian)
  _poly.geo.push({
    lon: Cesium.Math.toDegrees(c.longitude),
    lat: Cesium.Math.toDegrees(c.latitude),
  })
  _poly.entities.push(window.viewer.entities.add({
    position: cartesian,
    point: {
      pixelSize: 8, color: Cesium.Color.YELLOW,
      outlineColor: Cesium.Color.fromCssColorString('#111'), outlineWidth: 1.5,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  }))
  const n = _poly.pts.length
  _onDrawInfo(`${n} ${n === 1 ? 'vertex' : 'vertices'}` +
    (n >= 3 ? ' — right-click or double-click to close' : ''))
  requestRender()
}

function _closePoly() {
  _poly.drawing = false; _poly.closed = true
  if (_poly.handler) { _poly.handler.destroy(); _poly.handler = null }
  window.viewer.scene.canvas.style.cursor = ''
  _onDrawBanner(false)
  _onDrawBtnLabel('✕ Clear Area')
  _onDrawInfo(`✓ ${_poly.pts.length}-vertex polygon — run diff to apply`)
  toast(`Area selected (${_poly.pts.length} vertices). Now run the diff.`, 'ok')
  requestRender()
}

function _clearPoly() {
  _poly.drawing = false; _poly.closed = false
  _poly.pts = []; _poly.geo = []
  if (_poly.handler) { _poly.handler.destroy(); _poly.handler = null }
  _poly.entities.forEach(e => { try { window.viewer.entities.remove(e) } catch (_) {} })
  _poly.entities = []
  if (window.viewer) window.viewer.scene.canvas.style.cursor = ''
  _onDrawBanner(false)
  requestRender()
}

export function getPolygonGeo() {
  return _poly.closed ? _poly.geo : null
}