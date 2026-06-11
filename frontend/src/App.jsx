/**
 * App.jsx
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { CONFIG } from './config'
import { initViewer, flyTo, setTerrainVisible, setBasemap } from './cesium/cesiumInit'
import {
  loadDate, syncVisibility, clearLayers, clearCompareLayers,
  applyPcStyle, setDateATint, setDateBTint,
  renderVoxelDiff, invalidateTilesetUrl,
} from './cesium/layers'
import { runVoxelDiff, cancelVoxelDiff } from './diff'
import { setDrawCallbacks, togglePolygonDraw, clearPolygon, swapPolygonTab } from './cesium/polygonDraw'
import { loadDiffSnapshots, renderSnapshotTileset } from './timelineDiffs'

import NavBar             from './components/NavBar'
import MapSubHeader       from './components/MapSubHeader'
import Panel              from './components/Panel'
import RightPanel         from './components/RightPanel'
import MapOverlayControls from './components/MapOverlayControls'
import BottomBar          from './components/BottomBar'
import DrawBanner         from './components/DrawBanner'
import Toasts             from './components/Toasts'
import ProjectLauncher    from './components/ProjectLauncher'
import NewProjectModal    from './components/NewProjectModal'
import DataUploadPage     from './components/DataUploadPage'

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000'

const DEFAULT_DRAW_INFO = 'No area selected — diff runs on full extent'
const DEFAULT_DRAW_BTN  = '✏ Draw Area'

export default function App() {
  const [navTab,         setNavTab]         = useState('projects')
  const [launcherReady,  setLauncherReady]  = useState(false)
  const [showNewProject, setShowNewProject] = useState(false)

  const [sites,      setSites]      = useState([])
  const [activeSite, setActiveSite] = useState(null)

  const [mode, setMode] = useState('compare')

  // Set of date ids currently toggled visible in Cesium
  const [visibleDateIds, setVisibleDateIds] = useState(new Set())
  // The most recently toggled-on date (for M shortcut + pc slider)
  const [activeDate, setActiveDate] = useState(null)
  const [activeDateLayerMode, setActiveDateLayerMode] = useState('pc')
  // Keep a ref so keyboard handler can access without stale closure
  const activeDateRef    = useRef(null)
  const activeSiteRef    = useRef(null)
  const visibleIdsRef    = useRef(new Set())
  const modeRef          = useRef('compare')

  useEffect(() => { activeDateRef.current  = activeDate },    [activeDate])
  useEffect(() => { activeSiteRef.current  = activeSite },    [activeSite])
  useEffect(() => { visibleIdsRef.current  = visibleDateIds }, [visibleDateIds])
  useEffect(() => { modeRef.current        = mode },           [mode])

  const [compareIdA, setCompareIdA] = useState('')
  const [compareIdB, setCompareIdB] = useState('')
  const [colorA, setColorA] = useState('#d49050')
  const [alphaA, setAlphaA] = useState(0.9)
  const [colorB, setColorB] = useState('#4d9fff')
  const [alphaB, setAlphaB] = useState(0.9)
  const [showAdded,    setShowAdded]    = useState(CONFIG.DEFAULTS.SHOW_ADDED)
  const [showRemoved,  setShowRemoved]  = useState(CONFIG.DEFAULTS.SHOW_REMOVED)
  const showAddedRef   = useRef(CONFIG.DEFAULTS.SHOW_ADDED)
  const showRemovedRef = useRef(CONFIG.DEFAULTS.SHOW_REMOVED)
  useEffect(() => { showAddedRef.current   = showAdded },   [showAdded])
  useEffect(() => { showRemovedRef.current = showRemoved }, [showRemoved])

  // ── compare-api state ─────────────────────────────────────────────────
  const [apiDateIdA, setApiDateIdA] = useState('')
  const [apiDateIdB, setApiDateIdB] = useState('')
  const [apiRunning, setApiRunning] = useState(false)
  const [apiStatus,  setApiStatus]  = useState('')
  const [apiError,   setApiError]   = useState(null)
  const [apiSummary, setApiSummary] = useState(null)

  // Keep the last compare diff voxels so we can restore them when returning
  // from timeline / compare-api back to compare
  const lastCompareDiffRef = useRef(null)

  const [voxelSize,   setVoxelSize]   = useState(CONFIG.DEFAULTS.VOXEL_SIZE)
  const [diffRunning, setDiffRunning] = useState(false)
  const [diffStatus,  setDiffStatus]  = useState({ state: '', msg: '' })
  const [stats,       setStats]       = useState(null)

  // ── Per-tab polygon UI state ──────────────────────────────────────────
  // The physical polygon in polygonDraw.js is global (one at a time).
  // We save/restore the UI labels per tab so each tab looks independent.
  const [drawInfo,     setDrawInfo]     = useState(DEFAULT_DRAW_INFO)
  const [drawBtnLabel, setDrawBtnLabel] = useState(DEFAULT_DRAW_BTN)
  const [drawBanner,   setDrawBanner]   = useState(false)



  const [basemap,     setBasemapState] = useState('aerial')
  const [showTerrain, setShowTerrain]  = useState(CONFIG.TERRAIN.ENABLED)
  const [pcSize,      setPcSize]       = useState(CONFIG.DEFAULTS.POINT_SIZE)

  const [statusMsg,  setStatusMsg]  = useState('Initialising viewer…')
  const [statusDone, setStatusDone] = useState(false)
  const [toasts,     setToasts]     = useState([])
  const [coords,     setCoords]     = useState({ lat: '—', lon: '—', height: '—' })

  const [tlSnapshots,   setTlSnapshots]   = useState(null)
  const [tlActiveIndex, setTlActiveIndex] = useState(0)
  const [tlLoading,     setTlLoading]     = useState(false)
  const [tlPlaying,     setTlPlaying]     = useState(false)
  const tlPlayTimer  = useRef(null)
  const viewerReady  = useRef(false)
  const tlSnapshotsRef = useRef(null)
  useEffect(() => { tlSnapshotsRef.current = tlSnapshots }, [tlSnapshots])

  // ── Helpers ───────────────────────────────────────────────────────────
  const addToast = useCallback((msg, type = 'ok') => {
    const id = Date.now() + Math.random()
    setToasts(prev => [...prev, { id, msg, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000)
  }, [])

  const refreshSites = useCallback(async () => {
    try {
      const res  = await fetch(`${API_BASE}/api/sites`)
      const data = await res.json()
      return data.sites ?? []
    } catch (e) { console.error('[refreshSites]', e); return [] }
  }, [])

  // Canonical checkboxState for syncVisibility
  function checkState(overrides = {}) {
    return {
      dataset: true,
      dateA:   true,
      dateB:   true,
      added:   showAddedRef.current,
      removed: showRemovedRef.current,
      ...overrides,
    }
  }

  // ── Init ─────────────────────────────────────────────────────────────
  useEffect(() => {
    async function setup() {
      setDrawCallbacks(
        v => setDrawBanner(v),
        i => setDrawInfo(i),
        l => setDrawBtnLabel(l),
      )
      await initViewer({
        onReady:  () => { viewerReady.current = true },
        onStatus: (msg, done) => { setStatusMsg(msg); setStatusDone(!!done) },
        onToast:  addToast,
        onCoords: setCoords,
      })
      const loaded = await refreshSites()
      setSites(loaded)
      setLauncherReady(true)
    }
    setup()
  }, [addToast, refreshSites])

  // ── Timeline playback ────────────────────────────────────────────────
  useEffect(() => {
    clearInterval(tlPlayTimer.current)
    if (tlPlaying && tlSnapshots?.length) {
      tlPlayTimer.current = setInterval(() => {
        setTlActiveIndex(i => {
          const next = i + 1
          if (next >= tlSnapshots.length) { setTlPlaying(false); return i }
          return next
        })
      }, 2500)
    }
    return () => clearInterval(tlPlayTimer.current)
  }, [tlPlaying, tlSnapshots])

  // ── Timeline load — only fires when snapshots haven't been loaded yet ──
  useEffect(() => {
    if (mode !== 'timeline' || !activeSite || tlSnapshots !== null) return
    setTlLoading(true)
    loadDiffSnapshots(activeSite)
      .then(snaps => {
        setTlSnapshots(snaps)
        setTlActiveIndex(0)
        if (snaps.length > 0) doRenderTlSnapshot(snaps, 0)
      })
      .finally(() => setTlLoading(false))
  }, [mode, activeSite, tlSnapshots])

  function doRenderTlSnapshot(snaps, idx) {
    const snap = snaps?.[idx]; if (!snap) return
    renderSnapshotTileset(snap)
  }

  // ── Timeline snapshot render — fires when active index changes while in timeline ──
  useEffect(() => {
    if (mode !== 'timeline' || !tlSnapshots?.length) return
    doRenderTlSnapshot(tlSnapshots, tlActiveIndex)
  }, [tlActiveIndex, tlSnapshots])

  // ── Re-sync visibility when showAdded/showRemoved toggle in compare ───
  useEffect(() => {
    if (mode !== 'compare') return
    if (lastCompareDiffRef.current) {
      // Voxel types are baked into one Primitive — must rebuild to filter by type
      const { voxels, gridDef, voxelSize: vs } = lastCompareDiffRef.current
      window.diffState = window.diffState ?? {}
      window.diffState.gridDef = gridDef
      renderVoxelDiff(
        voxels.filter(v =>
          (v.type === 'added'   && showAdded) ||
          (v.type === 'removed' && showRemoved)
        ),
        vs
      )
    } else {
      syncVisibility('compare', checkState())
    }
  }, [showAdded, showRemoved]) // deliberately omit `mode` — only runs when toggles change

  // ── Sync side-effects ────────────────────────────────────────────────
  useEffect(() => { setDateATint(colorA, alphaA) }, [colorA, alphaA])
  useEffect(() => { setDateBTint(colorB, alphaB) }, [colorB, alphaB])
  useEffect(() => { applyPcStyle(pcSize) },          [pcSize])
  useEffect(() => { setTerrainVisible(showTerrain) }, [showTerrain])
  useEffect(() => { setBasemap(basemap) },            [basemap])

  // ── Keyboard shortcuts ───────────────────────────────────────────────
  useEffect(() => {
    const handler = e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return
      if (navTab !== 'analysis') return

      // M — toggle the active date layer on/off
      if (e.key === 'm' || e.key === 'M') {
        const site = activeSiteRef.current
        if (!site) return
        const current = activeDateRef.current
        const ids     = visibleIdsRef.current
        if (current) {
          handleToggleDateById(site, current, ids)
        } else if (site.dates.length > 0) {
          handleToggleDateById(site, site.dates[0], ids)
        }
        return
      }

      if (e.key === 'a') setShowAdded(v => !v)
      if (e.key === 'r') setShowRemoved(v => !v)
      if (e.key === 'd') togglePolygonDraw()
      if (e.key === '1') handleCameraSite()
      if (e.key === '2') handleCameraTop()

      if (modeRef.current === 'timeline') {
        const snaps = tlSnapshotsRef.current
        if (e.key === 'ArrowLeft')  setTlActiveIndex(i => Math.max(0, i - 1))
        if (e.key === 'ArrowRight') setTlActiveIndex(i => Math.min((snaps?.length ?? 1) - 1, i + 1))
        if (e.key === ' ') { e.preventDefault(); setTlPlaying(v => !v) }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [navTab]) // stable — uses refs for everything that changes

  // ── Handlers ─────────────────────────────────────────────────────────

  function handleOpenProject(site) {
    if (diffRunning) { cancelVoxelDiff(); setDiffRunning(false) }
    clearLayers()
    if (window.diffState) { window.diffState.voxels = []; window.diffState.gridDef = null }
    clearPolygon()
    lastCompareDiffRef.current = null
    setMode('compare')
    setStats(null)
    setDiffStatus({ state: '', msg: '' })
    setDrawInfo(DEFAULT_DRAW_INFO)
    setDrawBtnLabel(DEFAULT_DRAW_BTN)
    setDrawBanner(false)
    setVisibleDateIds(new Set())
    setActiveDate(null)
    setCompareIdA(site.dates[0]?.id ?? '')
    setCompareIdB(site.dates[1]?.id ?? site.dates[0]?.id ?? '')
    setApiDateIdA(site.dates[0]?.id ?? '')
    setApiDateIdB(site.dates[1]?.id ?? site.dates[0]?.id ?? '')
    setApiSummary(null); setApiStatus(''); setApiError(null)
    setTlSnapshots(null); setTlActiveIndex(0); setTlPlaying(false)
    setActiveSite(site)
    window.currentSite = site
    setNavTab('analysis')
    flyTo(site.camera.lon, site.camera.lat - 0.006, site.camera.height)
  }

  async function handleProjectCreated(newSite) {
    setShowNewProject(false)
    const updated = await refreshSites()
    setSites(updated)
    addToast(`프로젝트 "${newSite.label}" 생성됨`, 'ok')
    const full = updated.find(s => s.id === newSite.id)
    if (full) handleOpenProject(full)
  }

  async function handleDataChanged() {
    const updated = await refreshSites()
    setSites(updated)
    if (activeSite) {
      const updatedSite = updated.find(s => s.id === activeSite.id)
      if (updatedSite) {
        setActiveSite(updatedSite)
        window.currentSite = updatedSite
        // Reload any currently visible date
        const current = activeDateRef.current
        if (current) {
          const d = updatedSite.dates.find(x => x.id === current.id)
          if (d?.datasetPath) {
            invalidateTilesetUrl(d.datasetPath)
            loadDate(updatedSite, d, modeRef.current, checkState())
          }
        }
      }
    }
    addToast('데이터가 업데이트되었습니다', 'ok')
  }

  async function handleSiteEdited() {
    const updated = await refreshSites()
    setSites(updated)
    // If the edited site is currently open, sync the activeSite reference
    if (activeSite) {
      const updatedSite = updated.find(s => s.id === activeSite.id)
      if (updatedSite) { setActiveSite(updatedSite); window.currentSite = updatedSite }
    }
    addToast('프로젝트 정보가 업데이트되었습니다', 'ok')
  }

  async function handleSiteDeleted(siteId) {
    const updated = await refreshSites()
    setSites(updated)
    // If the deleted site was open, close it back to the launcher
    if (activeSite?.id === siteId) {
      if (diffRunning) { cancelVoxelDiff(); setDiffRunning(false) }
      clearLayers()
      clearPolygon()
      lastCompareDiffRef.current = null
      setActiveSite(null)
      window.currentSite = null
      setNavTab('projects')
    }
    addToast('프로젝트가 삭제되었습니다', 'ok')
  }

  // Core toggle logic — usable from click and keyboard M
  function handleToggleDateById(site, d, currentIds) {
    setVisibleDateIds(prev => {
      const next = new Set(prev)
      if (next.has(d.id)) {
        next.delete(d.id)
        clearLayers()
        setActiveDate(null)
        setActiveDateLayerMode('pc')
      } else {
        clearLayers()
        next.clear() // only one at a time for now
        next.add(d.id)
        setActiveDate(d)
        setActiveDateLayerMode('pc')
        loadDate(site, d, modeRef.current, checkState())
      }
      return next
    })
  }

  // Switch a date between point-cloud and pre-computed voxel tileset
  function handleLayerMode(dateId, layerMode) {
    if (!activeSite) return
    const d = activeSite.dates.find(x => x.id === dateId)
    if (!d) return
    setActiveDateLayerMode(layerMode)
    // Re-load the date using whichever path is appropriate
    clearLayers()
    if (layerMode === 'vox' && d.voxelPath) {
      // Load the pre-computed voxel tileset as if it were a pointcloud layer
      loadDate(activeSite, { ...d, datasetPath: d.voxelPath, datasetType: 'pointcloud' }, modeRef.current, checkState())
    } else {
      // Restore the original point cloud
      loadDate(activeSite, d, modeRef.current, checkState())
    }
  }

  function handleToggleDate(d) {
    handleToggleDateById(activeSite, d, visibleDateIds)
  }

  function handleModeChange(newMode) {
    const prevMode = modeRef.current
    if (prevMode === newMode) return

    setMode(newMode)
    modeRef.current = newMode

    if (newMode === 'timeline') {
      // Park the active compare tab's polygon (hide entities, save to slot)
      if (prevMode === 'compare' || prevMode === 'compare-api') {
        swapPolygonTab(prevMode, 'timeline-hidden', drawInfo, drawBtnLabel)
        setDrawBanner(false)
      }
      // Hide compare layers, show timeseries layer (if already loaded)
      syncVisibility('timeline', checkState())
      // Only trigger a load if we haven't loaded snapshots yet for this project
      // (tlSnapshots === null means "never loaded" — set in handleOpenProject)
      // Don't reset here; the load effect handles it once.

    } else if (newMode === 'compare') {
      if (prevMode === 'compare-api') {
        // Swap polygons between the two compare tabs
        swapPolygonTab('compare-api', 'compare', drawInfo, drawBtnLabel)
        setDrawBanner(false)
      } else if (prevMode === 'timeline') {
        // Restore compare's polygon (was parked under 'timeline-hidden')
        swapPolygonTab('timeline-hidden', 'compare', drawInfo, drawBtnLabel)
        setDrawBanner(false)
      }

      // Restore compare voxels if we had a previous diff, then sync visibility
      if (lastCompareDiffRef.current) {
        const { voxels, gridDef, voxelSize: vs } = lastCompareDiffRef.current
        window.diffState = window.diffState ?? {}
        window.diffState.gridDef = gridDef
        renderVoxelDiff(
          voxels.filter(v =>
            (v.type === 'added'   && showAddedRef.current) ||
            (v.type === 'removed' && showRemovedRef.current)
          ),
          vs
        )
      } else {
        renderVoxelDiff([], 0.5)
      }
      syncVisibility('compare', checkState())

    } else if (newMode === 'compare-api') {
      if (prevMode === 'compare') {
        // Swap polygons between the two compare tabs
        swapPolygonTab('compare', 'compare-api', drawInfo, drawBtnLabel)
        setDrawBanner(false)
      } else if (prevMode === 'timeline') {
        // Restore compare-api's polygon (was parked under 'timeline-hidden')
        swapPolygonTab('timeline-hidden', 'compare-api', drawInfo, drawBtnLabel)
        setDrawBanner(false)
      }

      // Hide compare A/B meshes and voxels — compare-api only shows the background layer
      renderVoxelDiff([], 0.5)
      syncVisibility('compare-api', checkState())
    }
  }

  async function handleRunDiff() {
    if (diffRunning) return
    const dA = activeSite.dates.find(d => d.id === compareIdA)
    const dB = activeSite.dates.find(d => d.id === compareIdB)
    if (!compareIdA || !compareIdB) { addToast('두 날짜를 먼저 선택하세요', 'warn'); return }
    if (compareIdA === compareIdB)  { addToast('서로 다른 날짜를 선택하세요', 'warn'); return }
    if (!dA || !dB)                 { addToast('날짜를 찾을 수 없습니다', 'warn'); return }
    if (!dA.datasetPath || !dB.datasetPath) { addToast('선택한 날짜 중 데이터가 없습니다', 'warn'); return }
    setDiffRunning(true)
    try {
      await runVoxelDiff(
        activeSite, dA, dB, mode, voxelSize,
        { hex: colorA, alpha: alphaA }, { hex: colorB, alpha: alphaB },
        checkState(),
        (st, msg) => setDiffStatus({ state: st, msg }),
        s => {
          setStats(s)
          // Deep-copy voxels + gridDef — timeline overwrites window.diffState so
          // we must snapshot everything now to restore correctly later
          if (s && window.diffState?.voxels?.length && window.diffState?.gridDef) {
            lastCompareDiffRef.current = {
              voxels:    window.diffState.voxels.map(v => ({ type: v.type, voxel: { ...v.voxel } })),
              gridDef:   { ...window.diffState.gridDef },
              voxelSize: s.voxSize,
            }
          }
        },
      )
    } finally { setDiffRunning(false) }
  }

  function handleClearDiff() {
    if (diffRunning) { cancelVoxelDiff(); setDiffRunning(false) }
    clearCompareLayers()
    lastCompareDiffRef.current = null
    setStats(null)
    setDiffStatus({ state: '', msg: '' })
    setDrawInfo(DEFAULT_DRAW_INFO)
    setDrawBtnLabel(DEFAULT_DRAW_BTN)
  }

  async function handleApiRun() {
    if (apiRunning) return
    if (!apiDateIdA || !apiDateIdB) { setApiError('두 날짜를 먼저 선택하세요'); return }
    if (apiDateIdA === apiDateIdB)  { setApiError('서로 다른 날짜를 선택하세요'); return }
    setApiRunning(true); setApiError(null); setApiSummary(null)
    try {
      const { runFullDiff }   = await import('./backendDiff')
      const { getPolygonGeo } = await import('./cesium/polygonDraw')
      const result = await runFullDiff({
        projectId: activeSite.id,
        dateA: apiDateIdA, dateB: apiDateIdB,
        polygon: getPolygonGeo(),
        onStatus: setApiStatus,
      })
      setApiSummary(result)
    } catch (e) {
      setApiError(e.message)
    } finally {
      setApiRunning(false)
    }
  }

  function handleApiClear() {
    setApiSummary(null); setApiStatus(''); setApiError(null)
    setDrawInfo(DEFAULT_DRAW_INFO)
    setDrawBtnLabel(DEFAULT_DRAW_BTN)
  }

  async function handleComputeVoxel(dateId) {
    if (!activeSite) return
    const res = await fetch(`${API_BASE}/api/sites/${activeSite.id}/dates/${dateId}/voxel`, {
      method: 'POST',
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }))
      throw new Error(err.detail ?? `HTTP ${res.status}`)
    }
    // Refresh sites so the new voxelPath is reflected in activeSite
    const updated = await refreshSites()
    setSites(updated)
    const updatedSite = updated.find(s => s.id === activeSite.id)
    if (updatedSite) { setActiveSite(updatedSite); window.currentSite = updatedSite }
  }

  function handleCameraSite() {
    if (!activeSite) return
    flyTo(activeSite.camera.lon, activeSite.camera.lat - 0.006, activeSite.camera.height, -40)
  }
  function handleCameraTop() {
    if (!activeSite) return
    flyTo(activeSite.camera.lon, activeSite.camera.lat, activeSite.camera.height * 1.2, -90)
  }

  function handleNavTab(tab) {
    if ((tab === 'upload' || tab === 'analysis') && !activeSite) return
    setNavTab(tab)
  }

  const showAnalysis  = navTab === 'analysis'
  const showPcSlider  = activeDate?.datasetType === 'pointcloud' && activeDateLayerMode === 'pc'

  return (
    <>
      <div
        id="cesiumContainer"
        className={[
          '',
          showAnalysis ? '' : 'cesium-hidden',
        ].join(' ').trim()}
      />

      <NavBar tab={navTab} onTab={handleNavTab} activeSite={activeSite} />

      {navTab === 'projects' && (
        <div className="tab-overlay">
          <ProjectLauncher
            sites={sites}
            loading={!launcherReady}
            onSelect={handleOpenProject}
            onNewProject={() => setShowNewProject(true)}
            onSiteEdited={handleSiteEdited}
            onSiteDeleted={handleSiteDeleted}
          />
        </div>
      )}

      {navTab === 'upload' && activeSite && (
        <div className="tab-overlay">
          <DataUploadPage
            site={activeSite}
            onUploaded={handleDataChanged}
            onCreated={handleDataChanged}
          />
        </div>
      )}

      <NewProjectModal
        open={showNewProject}
        onClose={() => setShowNewProject(false)}
        onCreated={handleProjectCreated}
      />

      {showAnalysis && activeSite && (
        <>
          <DrawBanner visible={drawBanner} onCancel={togglePolygonDraw} />

          <MapSubHeader
            mode={mode}
            onMode={handleModeChange}
            compareIdA={compareIdA}
            compareIdB={compareIdB}
            activeSite={activeSite}
          />

          <Panel
            activeSite={activeSite}
            visibleDateIds={visibleDateIds} onToggleDate={handleToggleDate}
            onCameraSite={handleCameraSite} onCameraTop={handleCameraTop}
            pcSize={pcSize}             onPcSize={setPcSize}
            showPcSlider={showPcSlider}
            onLayerMode={handleLayerMode}
            onComputeVoxel={handleComputeVoxel}
          />

          <RightPanel
            mode={mode}
            activeSite={activeSite}
            compareIdA={compareIdA}         onCompareIdA={setCompareIdA}
            compareIdB={compareIdB}         onCompareIdB={setCompareIdB}
            colorA={colorA}                 onColorA={setColorA}
            alphaA={alphaA}                 onAlphaA={setAlphaA}
            colorB={colorB}                 onColorB={setColorB}
            alphaB={alphaB}                 onAlphaB={setAlphaB}
            drawInfo={drawInfo}             drawBtnLabel={drawBtnLabel} onDrawArea={togglePolygonDraw}
            voxelSize={voxelSize}           onVoxelSize={setVoxelSize}
            diffRunning={diffRunning}       onRunDiff={handleRunDiff}   onClearDiff={handleClearDiff}
            diffStatus={diffStatus}
            showAdded={showAdded}           onShowAdded={setShowAdded}
            showRemoved={showRemoved}       onShowRemoved={setShowRemoved}
            stats={stats}
            tlSnapshots={tlSnapshots}       tlActiveIndex={tlActiveIndex}
            tlOnSelect={i => setTlActiveIndex(i)}
            tlPlaying={tlPlaying}           tlOnPlayPause={() => setTlPlaying(v => !v)}
            tlLoading={tlLoading}           tlOnRecompute={() => setTlSnapshots(null)}
            apiDateIdA={apiDateIdA}         onApiDateIdA={setApiDateIdA}
            apiDateIdB={apiDateIdB}         onApiDateIdB={setApiDateIdB}
            apiRunning={apiRunning}         onApiRun={handleApiRun}     onApiClear={handleApiClear}
            apiStatus={apiStatus}           apiError={apiError}
            apiSummary={apiSummary}
          />

          <MapOverlayControls
            basemap={basemap}           onBasemap={setBasemapState}
            showTerrain={showTerrain}   onShowTerrain={setShowTerrain}
          />

          <BottomBar
            statusMsg={statusMsg}   statusDone={statusDone}
            coords={coords}
            mode={mode}
            tlSnapshots={tlSnapshots}
            tlActiveIndex={tlActiveIndex}
            tlOnSelect={i => setTlActiveIndex(i)}
            tlPlaying={tlPlaying}
            tlOnPlayPause={() => setTlPlaying(v => !v)}
          />
        </>
      )}

      {showAnalysis && !activeSite && (
        <BottomBar statusMsg={statusMsg} statusDone={statusDone} mode="compare" />
      )}

      <Toasts items={toasts} />
    </>
  )
}