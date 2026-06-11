/**
 * App.jsx
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { CONFIG } from './config'
import { initViewer, flyTo, setTerrainVisible, setBasemap } from './cesium/cesiumInit'
import {
  loadDate, syncVisibility, clearLayers, clearAllLayers, clearCompareLayers,
  applyPcStyle, setDateATint, setDateBTint,
  renderVoxelDiff, invalidateTilesetUrl,
  loadAllSnapshotTilesets, showSnapshotTileset, clearAllSnapshotTilesets,
  setSnapshotTilesetVisibility,
} from './cesium/layers'
import { runVoxelDiff, cancelVoxelDiff } from './diff'
import { setDrawCallbacks, togglePolygonDraw, clearPolygon, swapPolygonTab } from './cesium/polygonDraw'
import { loadDiffSnapshots, invalidateDiffCache } from './timelineDiffs'
import { fetchProjects, createProject, updateProject, deleteProject} from './api'

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

// Your own FastAPI backend (diff computation, voxel, upload)
const LOCAL_API = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000'

const DEFAULT_DRAW_INFO = 'No area selected — diff runs on full extent'
const DEFAULT_DRAW_BTN  = '✏ Draw Area'

// ── Per-tab visibility defaults ───────────────────────────────────────────
const DEFAULT_VIS = { added: true, removed: true, unchanged: true }

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

  // ── Per-tab visibility state ──────────────────────────────────────────
  // Each tab has its own independent added/removed/unchanged toggles.
  const [compareVis,    setCompareVis]    = useState({ ...DEFAULT_VIS })
  const [compareApiVis, setCompareApiVis] = useState({ ...DEFAULT_VIS })
  const [tlVis,         setTlVis]         = useState({ ...DEFAULT_VIS })

  // Refs for use in effects/keyboard handlers (stale closure prevention)
  const compareVisRef    = useRef({ ...DEFAULT_VIS })
  const compareApiVisRef = useRef({ ...DEFAULT_VIS })
  const tlVisRef         = useRef({ ...DEFAULT_VIS })
  useEffect(() => { compareVisRef.current    = compareVis },    [compareVis])
  useEffect(() => { compareApiVisRef.current = compareApiVis }, [compareApiVis])
  useEffect(() => { tlVisRef.current         = tlVis },         [tlVis])

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

  /**
   * Fetch all projects from API, returned as internal "site"
   * objects (without dates — Step 2 will add those).
   */
  const refreshSites = useCallback(async () => {
    try {
      return await fetchProjects()
    } catch (e) {
      console.error('[refreshSites]', e)
      return []
    }
  }, [])

  // Canonical checkboxState for syncVisibility
  function checkState(overrides = {}) {
    return {
      dataset: true,
      dateA:   true,
      dateB:   true,
      added:   compareVisRef.current.added,
      removed: compareVisRef.current.removed,
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

  // ── Timeline load — preload all snapshot tilesets once per project ──────
  useEffect(() => {
    if (mode !== 'timeline' || !activeSite || tlSnapshots !== null) {
      console.log(`[TL-load effect] skip — mode=${mode} hasSite=${!!activeSite} snapshotsAlreadyLoaded=${tlSnapshots !== null}`)
      return
    }
    console.log(`[TL-load effect] LOADING snapshots for site=${activeSite.id}`)
    setTlLoading(true)
    loadDiffSnapshots(activeSite)
      .then(async snaps => {
        console.log(`[TL-load effect] got ${snaps.length} snapshots, preloading tilesets…`)
        setTlSnapshots(snaps)
        setTlActiveIndex(0)
        await loadAllSnapshotTilesets(snaps)
        console.log(`[TL-load effect] preload done — showing index 0`)
        if (snaps.length > 0) {
          showSnapshotTileset(snaps[0].id)
        }
      })
      .finally(() => setTlLoading(false))
  }, [mode, activeSite, tlSnapshots])

  // ── Timeline snapshot switch ─────────────────────────────────────────
  const tlActiveIndexRef = useRef(0)
  useEffect(() => { tlActiveIndexRef.current = tlActiveIndex }, [tlActiveIndex])

  useEffect(() => {
    if (!tlSnapshots?.length) return
    const currentMode = modeRef.current
    const snap = tlSnapshots[tlActiveIndex]
    console.log(`[TL-index effect] tlActiveIndex=${tlActiveIndex} snapId=${snap?.id} mode=${currentMode}`)
    if (currentMode !== 'timeline') {
      console.log(`[TL-index effect] NOT in timeline mode — skipping show`)
      return
    }
    if (!snap) return
    showSnapshotTileset(snap.id)
  }, [tlActiveIndex, tlSnapshots])

  // ── Re-sync compare voxel visibility when compare toggles change ──────
  useEffect(() => {
    if (mode !== 'compare') return
    if (lastCompareDiffRef.current) {
      const { voxels, gridDef, voxelSize: vs } = lastCompareDiffRef.current
      window.diffState = window.diffState ?? {}
      window.diffState.gridDef = gridDef
      renderVoxelDiff(
        voxels.filter(v =>
          (v.type === 'added'   && compareVis.added) ||
          (v.type === 'removed' && compareVis.removed)
        ),
        vs
      )
    } else {
      syncVisibility('compare', checkState())
    }
  }, [compareVis]) // deliberately omit `mode`

  // ── Re-sync timeline tileset style when timeline toggles change ───────
  useEffect(() => {
    if (mode !== 'timeline') return
    setSnapshotTilesetVisibility(tlVis.added, tlVis.removed, tlVis.unchanged)
  }, [tlVis]) // deliberately omit `mode`

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

      // a/r toggles affect only the current tab
      if (e.key === 'a') {
        const m = modeRef.current
        if (m === 'compare')     setCompareVis(v    => ({ ...v, added: !v.added }))
        else if (m === 'compare-api') setCompareApiVis(v => ({ ...v, added: !v.added }))
        else if (m === 'timeline')    setTlVis(v => ({ ...v, added: !v.added }))
      }
      if (e.key === 'r') {
        const m = modeRef.current
        if (m === 'compare')     setCompareVis(v    => ({ ...v, removed: !v.removed }))
        else if (m === 'compare-api') setCompareApiVis(v => ({ ...v, removed: !v.removed }))
        else if (m === 'timeline')    setTlVis(v => ({ ...v, removed: !v.removed }))
      }

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
  }, [navTab])

  // ── Handlers ─────────────────────────────────────────────────────────

  function handleOpenProject(site) {
    if (diffRunning) { cancelVoxelDiff(); setDiffRunning(false) }
    clearAllLayers()
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
    // Reset all per-tab visibility to defaults on project open
    setCompareVis({ ...DEFAULT_VIS })
    setCompareApiVis({ ...DEFAULT_VIS })
    setTlVis({ ...DEFAULT_VIS })
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
    if (activeSite) {
      const updatedSite = updated.find(s => s.id === activeSite.id)
      if (updatedSite) { setActiveSite(updatedSite); window.currentSite = updatedSite }
    }
    addToast('프로젝트 정보가 업데이트되었습니다', 'ok')
  }

  async function handleSiteDeleted(siteId) {
    const updated = await refreshSites()
    setSites(updated)
    if (activeSite?.id === siteId) {
      if (diffRunning) { cancelVoxelDiff(); setDiffRunning(false) }
      clearAllLayers()
      clearPolygon()
      lastCompareDiffRef.current = null
      setActiveSite(null)
      window.currentSite = null
      setNavTab('projects')
    }
    addToast('프로젝트가 삭제되었습니다', 'ok')
  }

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
        next.clear()
        next.add(d.id)
        setActiveDate(d)
        setActiveDateLayerMode('pc')
        loadDate(site, d, modeRef.current, checkState())
      }
      return next
    })
  }

  function handleLayerMode(dateId, layerMode) {
    if (!activeSite) return
    const d = activeSite.dates.find(x => x.id === dateId)
    if (!d) return
    setActiveDateLayerMode(layerMode)
    clearLayers()
    if (layerMode === 'vox' && d.voxelPath) {
      loadDate(activeSite, { ...d, datasetPath: d.voxelPath, datasetType: 'pointcloud' }, modeRef.current, checkState())
    } else {
      loadDate(activeSite, d, modeRef.current, checkState())
    }
  }

  function handleToggleDate(d) {
    handleToggleDateById(activeSite, d, visibleDateIds)
  }

  function handleModeChange(newMode) {
    const prevMode = modeRef.current
    if (prevMode === newMode) return

    console.log(`[handleModeChange] ${prevMode} → ${newMode}`)
    setMode(newMode)
    modeRef.current = newMode

    if (newMode === 'timeline') {
      if (prevMode === 'compare' || prevMode === 'compare-api') {
        console.log(`[handleModeChange] parking polygon from ${prevMode} → timeline-hidden`)
        swapPolygonTab(prevMode, 'timeline-hidden', drawInfo, drawBtnLabel)
        setDrawBanner(false)
      }
      console.log(`[handleModeChange] syncVisibility(timeline)`)
      syncVisibility('timeline', checkState())
      const snaps = tlSnapshotsRef.current
      if (snaps?.length) {
        const activeSnap = snaps[tlActiveIndexRef.current]
        if (activeSnap) {
          console.log(`[handleModeChange] re-showing active snapshot ${activeSnap.id}`)
          showSnapshotTileset(activeSnap.id)
        }
      }
      // Apply timeline's own visibility state on enter
      setSnapshotTilesetVisibility(tlVisRef.current.added, tlVisRef.current.removed, tlVisRef.current.unchanged)

    } else if (newMode === 'compare') {
      if (prevMode === 'compare-api') {
        swapPolygonTab('compare-api', 'compare', drawInfo, drawBtnLabel)
        setDrawBanner(false)
      } else if (prevMode === 'timeline') {
        swapPolygonTab('timeline-hidden', 'compare', drawInfo, drawBtnLabel)
        setDrawBanner(false)
      }

      if (lastCompareDiffRef.current) {
        const { voxels, gridDef, voxelSize: vs } = lastCompareDiffRef.current
        window.diffState = window.diffState ?? {}
        window.diffState.gridDef = gridDef
        renderVoxelDiff(
          voxels.filter(v =>
            (v.type === 'added'   && compareVisRef.current.added) ||
            (v.type === 'removed' && compareVisRef.current.removed)
          ),
          vs
        )
      } else {
        renderVoxelDiff([], 0.5)
      }
      syncVisibility('compare', checkState())

    } else if (newMode === 'compare-api') {
      if (prevMode === 'compare') {
        swapPolygonTab('compare', 'compare-api', drawInfo, drawBtnLabel)
        setDrawBanner(false)
      } else if (prevMode === 'timeline') {
        swapPolygonTab('timeline-hidden', 'compare-api', drawInfo, drawBtnLabel)
        setDrawBanner(false)
      }

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
    const res = await fetch(`${LOCAL_API}/api/sites/${activeSite.id}/dates/${dateId}/voxel`, {
      method: 'POST',
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }))
      throw new Error(err.detail ?? `HTTP ${res.status}`)
    }
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

  // ── Per-tab visibility props for RightPanel ───────────────────────────
  // RightPanel receives showAdded/onShowAdded etc. — we route the correct
  // per-tab state depending on the current mode.
  const activeVis = mode === 'timeline'
    ? tlVis
    : mode === 'compare-api'
      ? compareApiVis
      : compareVis

  const activeVisSetters = mode === 'timeline'
    ? {
        onShowAdded:     v => setTlVis(s => ({ ...s, added: v })),
        onShowRemoved:   v => setTlVis(s => ({ ...s, removed: v })),
        onShowUnchanged: v => setTlVis(s => ({ ...s, unchanged: v })),
      }
    : mode === 'compare-api'
      ? {
          onShowAdded:     v => setCompareApiVis(s => ({ ...s, added: v })),
          onShowRemoved:   v => setCompareApiVis(s => ({ ...s, removed: v })),
          onShowUnchanged: v => setCompareApiVis(s => ({ ...s, unchanged: v })),
        }
      : {
          onShowAdded:     v => setCompareVis(s => ({ ...s, added: v })),
          onShowRemoved:   v => setCompareVis(s => ({ ...s, removed: v })),
          onShowUnchanged: v => setCompareVis(s => ({ ...s, unchanged: v })),
        }

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
            showAdded={activeVis.added}           onShowAdded={activeVisSetters.onShowAdded}
            showRemoved={activeVis.removed}       onShowRemoved={activeVisSetters.onShowRemoved}
            showUnchanged={activeVis.unchanged}   onShowUnchanged={activeVisSetters.onShowUnchanged}
            stats={stats}
            tlSnapshots={tlSnapshots}       tlActiveIndex={tlActiveIndex}
            tlOnSelect={i => setTlActiveIndex(i)}
            tlPlaying={tlPlaying}           tlOnPlayPause={() => setTlPlaying(v => !v)}
            tlLoading={tlLoading}           tlOnRecompute={() => {
              console.log('[tlOnRecompute] clearing snapshots + preloaded tilesets for reload')
              clearAllSnapshotTilesets()
              setTlSnapshots(null)
            }}
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