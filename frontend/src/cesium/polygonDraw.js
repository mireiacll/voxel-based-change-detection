import { toast, requestRender } from './cesiumInit'

// ── Polygon drawing state ─────────────────────────────────────────────────
const _poly = {
  drawing:  false,
  closed:   false,
  pts:      [],
  geo:      [],
  handler:  null,
  entities: [],
}

let _onDrawBanner   = () => {}
let _onDrawInfo     = () => {}
let _onDrawBtnLabel = () => {}

export function setDrawCallbacks(onBanner, onInfo, onBtnLabel) {
  _onDrawBanner   = onBanner
  _onDrawInfo     = onInfo
  _onDrawBtnLabel = onBtnLabel
}

// Always clears regardless of current state — used on project switch
export function clearPolygon() {
  _clearPoly()
  _onDrawBtnLabel('✏ Draw Area')
  _onDrawInfo('No area selected — diff runs on full extent')
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