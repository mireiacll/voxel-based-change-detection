/**
 * App.jsx
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { CONFIG } from './config'
import { initViewer, flyTo, setTerrainVisible, setBasemap } from './cesium/cesiumInit'
import {
  loadDate, syncVisibility, clearLayers, clearAllLayers, clearCompareLayers,
  applyPcStyle, 
  //setDateATint, setDateBTint,
  renderVoxelDiff, invalidateTilesetUrl,
  loadAllSnapshotTilesets, showSnapshotTileset, clearAllSnapshotTilesets,
  setSnapshotTilesetVisibility,
  loadDiffApiTileset, clearDiffApiTileset,
  setDiffApiTilesetVisibility,
} from './cesium/layers'
import { runVoxelDiff, cancelVoxelDiff } from './diff'
import { setDrawCallbacks, togglePolygonDraw, clearPolygon, swapPolygonTab } from './cesium/polygonDraw'
import { loadDiffSnapshots, loadDiffSnapshotsByDiffId, invalidateDiffCache } from './timelineDiffs'
import {
  fetchProjects,
  enrichProjectWithDates,
  createProject,
  updateProject,
  deleteProject,
  voxelizeAndPoll,
  fetchVoxelTilesetUrl,
  fetchObservation,
  pollJob,
  createAbDiffAndPoll,
  cancelDiff,
  createTimeSeriesDiffAndPoll,
} from './api'
import {
  loadDiffHistory,
  addDiffHistoryEntry,
  removeDiffHistoryEntry,
} from './components/DiffHistory'

import NavBar             from './components/NavBar'
import Panel              from './components/Panel'
import RightPanel         from './components/RightPanel'
import MapOverlayControls from './components/MapOverlayControls'
import BottomBar          from './components/BottomBar'
import DrawBanner         from './components/DrawBanner'
import Toasts             from './components/Toasts'
import ProjectLauncher    from './components/ProjectLauncher'
import NewProjectModal    from './components/NewProjectModal'
import DataUploadPage     from './components/DataUploadPage'

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

  const [mode, setMode] = useState('compare-api')

  const [visibleDateIds, setVisibleDateIds] = useState(new Set())
  const [activeDate, setActiveDate]         = useState(null)
  const [activeDateLayerMode, setActiveDateLayerMode] = useState('pc')
  const [voxelPollingIds, setVoxelPollingIds] = useState(new Set())

  const activeDateRef  = useRef(null)
  const activeSiteRef  = useRef(null)
  const visibleIdsRef  = useRef(new Set())
  const modeRef        = useRef('compare-api')

  useEffect(() => { activeDateRef.current = activeDate },     [activeDate])
  useEffect(() => { activeSiteRef.current = activeSite },     [activeSite])
  useEffect(() => { visibleIdsRef.current = visibleDateIds }, [visibleDateIds])
  useEffect(() => { modeRef.current       = mode },           [mode])

  const [compareIdA, setCompareIdA] = useState('')
  const [compareIdB, setCompareIdB] = useState('')
  const [colorA, setColorA] = useState('#d49050')
  const [alphaA, setAlphaA] = useState(0.9)
  const [colorB, setColorB] = useState('#4d9fff')
  const [alphaB, setAlphaB] = useState(0.9)

  const [compareVis,    setCompareVis]    = useState({ ...DEFAULT_VIS })
  const [compareApiVis, setCompareApiVis] = useState({ ...DEFAULT_VIS })
  const [tlVis,         setTlVis]         = useState({ ...DEFAULT_VIS })

  const compareVisRef    = useRef({ ...DEFAULT_VIS })
  const compareApiVisRef = useRef({ ...DEFAULT_VIS })
  const tlVisRef         = useRef({ ...DEFAULT_VIS })
  useEffect(() => { compareVisRef.current    = compareVis },    [compareVis])
  useEffect(() => { compareApiVisRef.current = compareApiVis }, [compareApiVis])
  useEffect(() => { tlVisRef.current         = tlVis },         [tlVis])

  const [apiDateIdA,        setApiDateIdA]        = useState('')
  const [apiDateIdB,        setApiDateIdB]        = useState('')
  const [apiRunning,        setApiRunning]        = useState(false)
  const [apiStatus,         setApiStatus]         = useState('')
  const [apiError,          setApiError]          = useState(null)
  const [apiSummary,        setApiSummary]        = useState(null)
  const [apiDiffTilesetUrl, setApiDiffTilesetUrl] = useState(null)

  const [diffHistory, setDiffHistory] = useState([])   // entries for current project
  const [activeDiffId, setActiveDiffId] = useState(null)  // id of the history entry currently loaded/displayed

  const lastCompareDiffRef = useRef(null)
  const apiDiffIdRef      = useRef(null)   // diffId of the in-flight A/B diff (for cancel)

  const [voxelSize,   setVoxelSize]   = useState(CONFIG.DEFAULTS.VOXEL_SIZE)
  const [diffRunning, setDiffRunning] = useState(false)
  const [diffStatus,  setDiffStatus]  = useState({ state: '', msg: '' })
  const [stats,       setStats]       = useState(null)

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
  const [tlRecomputeRunning, setTlRecomputeRunning] = useState(false)
  const [tlRecomputeStatus,  setTlRecomputeStatus]  = useState('')
  const [tlRecomputeDiffId,  setTlRecomputeDiffId]  = useState(null)
  const tlPlayTimer    = useRef(null)
  const viewerReady    = useRef(false)
  const tlSnapshotsRef = useRef(null)
  useEffect(() => { tlSnapshotsRef.current = tlSnapshots }, [tlSnapshots])

  // ── Helpers ───────────────────────────────────────────────────────────
  const addToast = useCallback((msg, type = 'ok') => {
    const id = Date.now() + Math.random()
    setToasts(prev => [...prev, { id, msg, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000)
  }, [])

  /**
   * Fetch all projects then enrich each one with its observations (dates).
   */
  const refreshSites = useCallback(async () => {
    console.log('[refreshSites] start')
    try {
      const projects = await fetchProjects()
      console.log('[refreshSites] projects fetched:', projects.length)
      const enriched = await Promise.all(projects.map(p => enrichProjectWithDates(p)))
      console.log('[refreshSites] enriched sites:', enriched.map(s => `${s.id}:${s.name} (${s.dates.length} dates)`))
      return enriched
    } catch (e) {
      console.error('[refreshSites] FAILED:', e.message, e)
      return []
    }
  }, [])

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

  // ── Timeline load ────────────────────────────────────────────────────
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

  // ── Re-sync compare voxel visibility ────────────────────────────────
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
  }, [compareVis])

  // ── Re-sync compare-api diff tileset style ──────────────────────────────
  useEffect(() => {
    if (mode !== 'compare-api') return
    setDiffApiTilesetVisibility(compareApiVis.added, compareApiVis.removed, compareApiVis.unchanged)
  }, [compareApiVis])

  // ── Re-sync timeline tileset style ───────────────────────────────────
  useEffect(() => {
    if (mode !== 'timeline') return
    setSnapshotTilesetVisibility(tlVis.added, tlVis.removed, tlVis.unchanged)
  }, [tlVis])

  // ── Sync side-effects ────────────────────────────────────────────────
  // useEffect(() => { setDateATint(colorA, alphaA) }, [colorA, alphaA])
  // useEffect(() => { setDateBTint(colorB, alphaB) }, [colorB, alphaB])
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

      if (e.key === 'a') {
        const m = modeRef.current
        if (m === 'compare')          setCompareVis(v    => ({ ...v, added: !v.added }))
        else if (m === 'compare-api') setCompareApiVis(v => ({ ...v, added: !v.added }))
        else if (m === 'timeline')    setTlVis(v => ({ ...v, added: !v.added }))
      }
      if (e.key === 'r') {
        const m = modeRef.current
        if (m === 'compare')          setCompareVis(v    => ({ ...v, removed: !v.removed }))
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
    console.log('[handleOpenProject] site:', site.id, site.name, '— dates:', site.dates.length)
    if (diffRunning) { cancelVoxelDiff(); setDiffRunning(false) }
    clearAllLayers()
    clearPolygon()
    lastCompareDiffRef.current = null
    setMode('compare-api')
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
    setApiSummary(null); setApiStatus(''); setApiError(null); setApiDiffTilesetUrl(null)
    setTlSnapshots(null); setTlActiveIndex(0); setTlPlaying(false)
    setCompareVis({ ...DEFAULT_VIS })
    setCompareApiVis({ ...DEFAULT_VIS })
    setTlVis({ ...DEFAULT_VIS })
    setActiveSite(site)
    window.currentSite = site
    setNavTab('analysis')
    // Load persisted diff history for this project
    setDiffHistory(loadDiffHistory(site.id))
    setActiveDiffId(null)
    // Camera uses the flat fields from the coworker API shape directly
    flyTo(site.centerLon, site.centerLat - 0.006, site.cameraHeight)
    // Auto-resume polling for any dates already mid-voxelization
    console.log('[handleOpenProject] checking dates for auto-resume:',
      site.dates.map(d => `${d.id} status=${d.voxelStatus} jobId=${d.voxelJobId}`))
    site.dates.forEach(d => {
      if (d.voxelStatus === 'QUEUED' || d.voxelStatus === 'RUNNING') {
        console.log('[handleOpenProject] auto-resuming dateId:', d.id,
          'voxelStatus:', d.voxelStatus, 'voxelJobId:', d.voxelJobId)
        resumeVoxelPoll(d.id, d.voxelJobId)
      }
    })
  }

  async function handleProjectCreated(newSite) {
    setShowNewProject(false)
    const updated = await refreshSites()
    setSites(updated)
    addToast(`프로젝트 "${newSite.name}" 생성됨`, 'ok')
    const full = updated.find(s => s.id === newSite.id)
    if (full) handleOpenProject(full)
  }

  async function handleDataChanged() {
    console.log('[handleDataChanged] refreshing sites')
    const updated = await refreshSites()
    setSites(updated)
    if (activeSite) {
      const updatedSite = updated.find(s => s.id === activeSite.id)
      console.log('[handleDataChanged] updatedSite:', updatedSite?.id, '— dates:', updatedSite?.dates.length)
      if (updatedSite) {
        setActiveSite(updatedSite)
        window.currentSite = updatedSite
        const current = activeDateRef.current
        console.log('[handleDataChanged] activeDate was:', current?.id, current?.label)
        if (current) {
          const d = updatedSite.dates.find(x => x.id === current.id)
          console.log('[handleDataChanged] found updated date:', d?.id, 'datasetPath:', d?.datasetPath)
          if (d?.originalTilesetUrl) {
            invalidateTilesetUrl(d.originalTilesetUrl)
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

  async function handleLayerMode(dateId, layerMode) {
    if (!activeSite) return
    const d = activeSite.dates.find(x => x.id === dateId)
    if (!d) return
    setActiveDateLayerMode(layerMode)
    clearLayers()
    if (layerMode === 'vox' && d.voxelPath) {
      try {
        const resolvedUrl = await fetchVoxelTilesetUrl(dateId)
        loadDate(activeSite, { ...d, originalTilesetUrl: resolvedUrl, datasetType: 'voxel' }, modeRef.current, checkState())
      } catch (e) {
        console.error('[handleLayerMode] fetchVoxelTilesetUrl failed:', e.message)
        addToast(`Voxel tileset URL 조회 실패: ${e.message}`, 'warn')
      }
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
        swapPolygonTab(prevMode, 'timeline-hidden', drawInfo, drawBtnLabel)
        setDrawBanner(false)
      }
      syncVisibility('timeline', checkState())
      const snaps = tlSnapshotsRef.current
      if (snaps?.length) {
        const activeSnap = snaps[tlActiveIndexRef.current]
        if (activeSnap) showSnapshotTileset(activeSnap.id)
      }
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
    // Mesh is not supported by the Python diff — block early with a clear message
    if (dA.datasetType === 'mesh' || dB.datasetType === 'mesh') {
      addToast('메쉬 데이터는 차이 계산을 지원하지 않습니다. 포인트클라우드 날짜를 선택하세요.', 'warn')
      return
    }
    // The diff server now fetches tilesets by URL — no local datasetPath needed.
    // Warn if neither the URL nor a path is available (observation has no dataset at all).
    if (!dA.originalTilesetUrl && !dA.datasetPath) {
      addToast(`날짜 A (${dA.label})에 데이터가 없습니다`, 'warn'); return
    }
    if (!dB.originalTilesetUrl && !dB.datasetPath) {
      addToast(`날짜 B (${dB.label})에 데이터가 없습니다`, 'warn'); return
    }
    setDiffRunning(true)
    const _compareTimer = `[compare] ${dA.label} vs ${dB.label}`
    console.time(_compareTimer)
    console.log(`[compare] ⏱ started — ${dA.label} (${dA.id}) vs ${dB.label} (${dB.id})`)
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
    } finally {
      console.timeEnd(_compareTimer)
      setDiffRunning(false)
    }
  }

  function handleCancelDiff() {
    cancelVoxelDiff()
    setDiffRunning(false)
    setDiffStatus({ state: 'done', msg: 'Computation cancelled' })
  }

  function handleClearDiff() {
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

    // Guard: both observations must have a completed voxel before diffing
    const dA = activeSite.dates.find(d => d.id === apiDateIdA)
    const dB = activeSite.dates.find(d => d.id === apiDateIdB)
    if (dA?.voxelStatus !== 'SUCCEEDED') {
      setApiError(`날짜 A (${dA?.label ?? apiDateIdA})의 Voxel이 아직 생성되지 않았습니다. 왼쪽 패널에서 먼저 계산하세요.`)
      return
    }
    if (dB?.voxelStatus !== 'SUCCEEDED') {
      setApiError(`날짜 B (${dB?.label ?? apiDateIdB})의 Voxel이 아직 생성되지 않았습니다. 왼쪽 패널에서 먼저 계산하세요.`)
      return
    }

    apiDiffIdRef.current = null
    setApiRunning(true); setApiError(null); setApiSummary(null); setApiDiffTilesetUrl(null)
    const _apiTimer = `[compare-api] ${dA?.label} vs ${dB?.label}`
    console.time(_apiTimer)
    console.log(`[compare-api] ⏱ started — ${dA?.label} (${apiDateIdA}) vs ${dB?.label} (${apiDateIdB})`)
    try {
      const { getPolygonWkt } = await import('./cesium/polygonDraw')
      const areaWkt = getPolygonWkt?.() ?? undefined

      const result = await createAbDiffAndPoll(
        activeSite.id,
        apiDateIdA,
        apiDateIdB,
        {
          areaWkt,
          onStatus: setApiStatus,
          onDiffId: id => { apiDiffIdRef.current = id },
        },
      )

      // result = { ...DiffItemResponse, report: DiffItemReportResponse, tilesetUrl }
      setApiSummary(result.report)

      // Persist to diff history
      const histEntry = {
        id:            apiDiffIdRef.current ?? result.diffId ?? result.id ?? Date.now(),
        type:          'AB',
        name:          result.name ?? `AB-${apiDateIdA}-${apiDateIdB}`,
        createdAt:     new Date().toISOString(),
        status:        'SUCCEEDED',
        labelA:        dA?.label ?? dA?.observedAt ?? apiDateIdA,
        labelB:        dB?.label ?? dB?.observedAt ?? apiDateIdB,
        areaWkt:       areaWkt ?? null,
        addedVolume:   result.report?.addedVolume   ?? 0,
        removedVolume: result.report?.removedVolume ?? 0,
        diffItemId:    result.report?.diffItemId    ?? result.id,
        tilesetUrl:    result.tilesetUrl ?? null,
      }
      const nextHistory = addDiffHistoryEntry(activeSite.id, histEntry)
      setDiffHistory(nextHistory)
      setActiveDiffId(histEntry.id)

      if (result.tilesetUrl) {
        setApiDiffTilesetUrl(result.tilesetUrl)
        await loadDiffApiTileset(result.tilesetUrl)
      }
    } catch (e) {
      console.error('[handleApiRun] FAILED:', e.message, e)
      setApiError(e.message)
    } finally {
      console.timeEnd(_apiTimer)
      apiDiffIdRef.current = null
      setApiRunning(false)
    }
  }

  async function handleApiCancel() {
    const diffId = apiDiffIdRef.current
    if (!diffId) { setApiRunning(false); return }
    try {
      await cancelDiff(diffId)
      setApiStatus('취소됨')
    } catch (e) {
      console.warn('[handleApiCancel] cancel request failed:', e.message)
    } finally {
      apiDiffIdRef.current = null
      setApiRunning(false)
    }
  }

  function handleApiClear() {
    setApiSummary(null); setApiStatus(''); setApiError(null); setApiDiffTilesetUrl(null)
    setActiveDiffId(null)
    clearDiffApiTileset()
    setDrawInfo(DEFAULT_DRAW_INFO)
    setDrawBtnLabel(DEFAULT_DRAW_BTN)
  }

  const handleTlRecompute = useCallback(async () => {
    if (!activeSite) return

    // Guard: need at least 2 observations
    if (activeSite.dates.length < 2) {
      addToast('시계열 분석을 실행하려면 최소 2개의 관측 데이터가 필요합니다', 'warn')
      return
    }

    // Guard: all dates must have a completed voxel
    const missing = activeSite.dates.filter(d => d.voxelStatus !== 'SUCCEEDED')
    if (missing.length > 0) {
      const labels = missing.map(d => d.label ?? d.id).join(', ')
      addToast(`Voxel이 없는 날짜가 있습니다: ${labels} — 왼쪽 패널에서 먼저 계산하세요`, 'warn')
      return
    }

    clearAllSnapshotTilesets()
    setTlSnapshots(null)
    setTlRecomputeRunning(true)
    setTlRecomputeStatus('')
    setTlRecomputeDiffId(null)
    try {
      const diff = await createTimeSeriesDiffAndPoll(activeSite.id, {
        onStatus: msg => setTlRecomputeStatus(msg),
        onDiffId: id  => setTlRecomputeDiffId(id),
      })
      invalidateDiffCache(activeSite.id)

      // Persist to diff history — store the REAL diffId (from the resolved
      // diff object, not the transient tlRecomputeDiffId state) so this
      // specific computation can be restored later via loadDiffSnapshotsByDiffId.
      const succeededDates = activeSite.dates
        .filter(d => d.voxelStatus === 'SUCCEEDED')
        .sort((a, b) => (a.observedAt ?? '').localeCompare(b.observedAt ?? ''))
      const tsEntry = {
        id:        diff?.id ?? `ts-${activeSite.id}-${Date.now()}`,
        diffId:    diff?.id ?? null,
        type:      'TIME_SERIES',
        name:      `TimeSeries-${activeSite.id}`,
        createdAt: new Date().toISOString(),
        status:    'SUCCEEDED',
        labelA:    succeededDates[0]?.label ?? succeededDates[0]?.observedAt ?? '?',
        labelB:    succeededDates[succeededDates.length - 1]?.label
                ?? succeededDates[succeededDates.length - 1]?.observedAt ?? '?',
        areaWkt:   null,
        observationCount: succeededDates.length,
      }
      const nextHist = addDiffHistoryEntry(activeSite.id, tsEntry)
      setDiffHistory(nextHist)
      setActiveDiffId(tsEntry.id)

      setTlSnapshots(null)  // triggers the load effect to re-fetch
    } catch (e) {
      console.error('[handleTlRecompute] failed:', e.message)
      setTlRecomputeStatus(`오류: ${e.message}`)
    } finally {
      setTlRecomputeRunning(false)
      setTlRecomputeDiffId(null)
    }
  }, [activeSite])

  const handleTlCancelRecompute = useCallback(async () => {
    if (tlRecomputeDiffId) {
      try { await cancelDiff(tlRecomputeDiffId) } catch (_) {}
    }
    setTlRecomputeRunning(false)
    setTlRecomputeStatus('')
    setTlRecomputeDiffId(null)
  }, [tlRecomputeDiffId])

  /**
   * Resume polling for a date whose voxel job is already QUEUED/RUNNING.
   * Called automatically on project open for any such dates.
   */
  async function resumeVoxelPoll(dateId, jobId) {
    const site = activeSiteRef.current
    const dateLabel = site?.dates.find(d => d.id === dateId)?.label ?? dateId
    console.log('[resumeVoxelPoll] START dateId:', dateId, 'jobId:', jobId,
      'siteId:', activeSiteRef.current?.id)
    setVoxelPollingIds(prev => new Set([...prev, dateId]))
    try {
      // If jobId is missing, re-fetch observation — it may have already
      // finished while we weren't polling, or the jobId wasn't loaded yet.
      let resolvedJobId = jobId
      if (!resolvedJobId) {
        const fresh = await fetchObservation(dateId)
        if (fresh.voxelStatus === 'SUCCEEDED') {
          console.log('[resumeVoxelPoll] already SUCCEEDED — patching state directly')
          const sid = activeSiteRef.current?.id
          setSites(prev => {
            const next = prev.map(s => {
              if (s.id !== sid) return s
              const newDates = s.dates.map(d => d.id === dateId ? { ...d, ...fresh } : d)
              return { ...s, dates: newDates }
            })
            const ns = next.find(s => s.id === sid)
            if (ns) { setActiveSite(ns); window.currentSite = ns }
            setVoxelPollingIds(prev => { const s = new Set(prev); s.delete(dateId); return s })
            return next
          })
          addToast(`✓ Voxel 완료: ${dateLabel}`, 'ok')
          return
        }
        resolvedJobId = fresh.voxelJobId
        if (!resolvedJobId) {
          console.warn('[resumeVoxelPoll] still no jobId after re-fetch, status:',
            fresh.voxelStatus, '— cannot poll')
          setVoxelPollingIds(prev => { const s = new Set(prev); s.delete(dateId); return s })
          return
        }
      }

      const job = await pollJob(
        resolvedJobId,
        ({ status, progress, message }) => {
          const pct = progress ? ` (${progress}%)` : ''
          const msg = message ? ` — ${message}` : ''
          setStatusMsg(`Voxel 생성 중: ${dateLabel} [${status}${pct}]${msg}`)
          setStatusDone(false)
        }
      )
      console.log('[resumeVoxelPoll] pollJob DONE — status:', job.status)
      if (job.status !== 'SUCCEEDED') throw new Error(`Voxel ${job.status.toLowerCase()}`)

      const updatedDate = await fetchObservation(dateId)
      console.log('[resumeVoxelPoll] updatedDate — voxelStatus:', updatedDate?.voxelStatus,
        'voxelPath:', updatedDate?.voxelPath)

      const pollSiteId = activeSiteRef.current?.id
      setSites(prev => {
        console.log('[resumeVoxelPoll] setSites — pollSiteId:', pollSiteId,
          'prev ids:', prev.map(s => s.id))
        const next = prev.map(s => {
          if (s.id !== pollSiteId) return s
          const newDates = s.dates.map(d => d.id === dateId ? { ...d, ...updatedDate } : d)
          return { ...s, dates: newDates }
        })
        const newSite = next.find(s => s.id === pollSiteId)
        if (newSite) {
          console.log('[resumeVoxelPoll] setActiveSite — statuses:',
            newSite.dates.map(d => `${d.id}:${d.voxelStatus}`))
          setActiveSite(newSite)
          window.currentSite = newSite
        } else {
          console.warn('[resumeVoxelPoll] WARNING: pollSiteId', pollSiteId, 'not in sites!')
        }
        setVoxelPollingIds(prev => { const s = new Set(prev); s.delete(dateId); return s })
        return next
      })
      setStatusMsg(`Voxel 완료: ${dateLabel}`)
      setStatusDone(true)
      addToast(`✓ Voxel 생성 완료: ${dateLabel}`, 'ok')
    } catch (e) {
      console.error('[resumeVoxelPoll] FAILED:', e.message, e)
      addToast(`❌ Voxel 실패: ${e.message}`, 'warn')
      setVoxelPollingIds(prev => { const s = new Set(prev); s.delete(dateId); return s })
    }
  }

  /**
   * Trigger voxelization for a date (observation) and poll until complete.
   * Shows live progress in the status bar while the job runs.
   * Throws on failure so Panel.jsx can show an error message.
   */
  async function handleComputeVoxel(dateId) {
    if (!activeSite) return
    const siteId = activeSite.id
    const dateLabel = activeSite.dates.find(d => d.id === dateId)?.label ?? dateId
    console.log('[handleComputeVoxel] START dateId:', dateId, 'siteId:', siteId)
    setVoxelPollingIds(prev => new Set([...prev, dateId]))
    try {
      addToast(`⚡ Voxel 생성 시작: ${dateLabel}`, 'ok')
      const updatedDate = await voxelizeAndPoll(
        dateId,
        ({ status, progress, message }) => {
          console.log('[handleComputeVoxel] poll tick — status:', status, 'progress:', progress)
          const pct = progress ? ` (${progress}%)` : ''
          const msg = message ? ` — ${message}` : ''
          setStatusMsg(`Voxel 생성 중: ${dateLabel} [${status}${pct}]${msg}`)
          setStatusDone(false)
        }
      )
      console.log('[handleComputeVoxel] SUCCEEDED — voxelStatus:', updatedDate?.voxelStatus,
        'voxelPath:', updatedDate?.voxelPath)
      setSites(prev => {
        console.log('[handleComputeVoxel] setSites — siteId:', siteId, 'prev ids:', prev.map(s => s.id))
        const next = prev.map(s => {
          if (s.id !== siteId) return s
          const newDates = s.dates.map(d => d.id === dateId ? { ...d, ...updatedDate } : d)
          return { ...s, dates: newDates }
        })
        const newSite = next.find(s => s.id === siteId)
        if (newSite) {
          console.log('[handleComputeVoxel] setActiveSite — statuses:',
            newSite.dates.map(d => `${d.id}:${d.voxelStatus}`))
          setActiveSite(newSite)
          window.currentSite = newSite
        } else {
          console.warn('[handleComputeVoxel] WARNING: siteId', siteId, 'not in sites!')
        }
        setVoxelPollingIds(prev => { const s = new Set(prev); s.delete(dateId); return s })
        return next
      })
      setStatusMsg(`Voxel 완료: ${dateLabel}`, true)
      setStatusDone(true)
      addToast(`✓ Voxel 생성 완료: ${dateLabel}`, 'ok')
    } catch (e) {
      console.error('[handleComputeVoxel] FAILED:', e.message, e)
      setStatusMsg(`Voxel 실패: ${e.message}`, true)
      setStatusDone(true)
      addToast(`❌ Voxel 실패: ${e.message}`, 'warn')
      setVoxelPollingIds(prev => { const s = new Set(prev); s.delete(dateId); return s })
      throw e
    }
  }

  async function handleLoadDiff(entry) {
    if (!activeSite) return

    // Toggle off: clicking the already-active entry clears it, same as
    // clicking an active date row deselects it instead of reloading it.
    if (activeDiffId != null && String(activeDiffId) === String(entry.id)) {
      if (entry.type === 'TIME_SERIES') {
        clearAllSnapshotTilesets()
        setTlSnapshots(null)
        setTlActiveIndex(0)
      } else if (entry.type === 'AB') {
        handleApiClear()
      }
      setActiveDiffId(null)
      return
    }

    if (entry.type === 'TIME_SERIES') {
      if (!entry.diffId) {
        // Legacy history entries (saved before diffId was tracked) have no
        // way to be restored individually — fall back to "latest" with a heads-up.
        addToast('이 기록은 특정 결과를 다시 불러올 수 없습니다 (이전 버전에서 저장됨) — 최신 결과를 표시합니다', 'warn')
        handleModeChange('timeline')
        setActiveDiffId(entry.id)
        return
      }
      try {
        setTlLoading(true)
        const snaps = await loadDiffSnapshotsByDiffId(entry.diffId, activeSite.id)
        if (!snaps.length) {
          addToast('해당 시계열 결과를 불러올 수 없습니다', 'warn')
          return
        }
        clearAllSnapshotTilesets()
        setTlSnapshots(snaps)
        setTlActiveIndex(0)
        await loadAllSnapshotTilesets(snaps)
        handleModeChange('timeline')
        showSnapshotTileset(snaps[0].id)
        setActiveDiffId(entry.id)
      } catch (e) {
        addToast(`기록 불러오기 실패: ${e.message}`, 'warn')
      } finally {
        setTlLoading(false)
      }
    } else if (entry.type === 'AB') {
      // Switch to compare-api mode and restore summary + tileset
      handleModeChange('compare-api')
      setApiSummary({
        diffItemId:       entry.diffItemId ?? null,
        sourceObservedAt: entry.labelA,
        targetObservedAt: entry.labelB,
        addedVolume:      entry.addedVolume   ?? 0,
        removedVolume:    entry.removedVolume ?? 0,
        changedVolume:    0,
        addedCount:       null,
        removedCount:     null,
      })
      if (entry.tilesetUrl) {
        setApiDiffTilesetUrl(entry.tilesetUrl)
        try {
          await loadDiffApiTileset(entry.tilesetUrl)
        } catch (e) {
          addToast(`Tileset 로드 실패: ${e.message}`, 'warn')
        }
      }
      setApiStatus('기록에서 불러옴')
      setApiError(null)
      setActiveDiffId(entry.id)
    }
  }

  function handleDeleteDiff(diffId) {
    if (!activeSite) return
    const next = removeDiffHistoryEntry(activeSite.id, diffId)
    setDiffHistory(next)
    if (activeDiffId === diffId) setActiveDiffId(null)
  }

  function handleCameraSite() {
    if (!activeSite) return
    flyTo(activeSite.centerLon, activeSite.centerLat - 0.006, activeSite.cameraHeight, -40)
  }
  function handleCameraTop() {
    if (!activeSite) return
    flyTo(activeSite.centerLon, activeSite.centerLat, activeSite.cameraHeight * 1.2, -90)
  }

  function handleNavTab(tab) {
    if ((tab === 'upload' || tab === 'analysis') && !activeSite) return
    setNavTab(tab)
  }

  const showAnalysis = navTab === 'analysis'
  const showPcSlider = activeDate?.datasetType === 'pointcloud' && activeDateLayerMode === 'pc'

  // ── Timeline staleness / readiness checks ─────────────────────────────
  // missingVoxels: dates that don't yet have a SUCCEEDED voxel
  const tlMissingVoxels = (activeSite?.dates ?? [])
    .filter(d => d.voxelStatus !== 'SUCCEEDED')
    .map(d => d.label ?? d.id)

  // stale: compare the set of observation IDs used to build the current
  // snapshots against the set of currently SUCCEEDED observations.
  // A TIME_SERIES diff over obs [A, B, C] produces items A→B and B→C.
  // The unique obs IDs referenced are the union of all date_a.id / date_b.id.
  // We compare that set to the current SUCCEEDED obs IDs to detect adds/removes.
  const tlStaleInfo = (() => {
    const succeededDates = (activeSite?.dates ?? []).filter(d => d.voxelStatus === 'SUCCEEDED')

    if (!tlSnapshots?.length || succeededDates.length < 2) {
      return { stale: false, addedLabels: [], removedLabels: [] }
    }

    // IDs used when the diff was computed (from loaded snapshots)
    const snapshotObsIds = new Set()
    tlSnapshots.forEach(s => {
      snapshotObsIds.add(s.date_a.id)
      snapshotObsIds.add(s.date_b.id)
    })

    // IDs of currently SUCCEEDED observations
    const currentObsIds = new Set(succeededDates.map(d => d.id))

    // Dates added since last diff (in current succeeded set but not in snapshots)
    const addedLabels = succeededDates
      .filter(d => !snapshotObsIds.has(d.id))
      .map(d => d.label ?? d.name ?? d.id)

    // Dates removed since last diff (in snapshots but no longer in succeeded set)
    const removedLabels = [...snapshotObsIds]
      .filter(id => !currentObsIds.has(id))
      .map(id => {
        // Try to find a label from activeSite.dates (might not exist if deleted)
        const found = activeSite?.dates.find(d => d.id === id)
        return found?.label ?? found?.name ?? id
      })

    // Reorder detection: compare snapshot ID sequence (sorted by date_a.ts) against
    // current SUCCEEDED observations sorted by observedAt. If order differs → stale.
    let reordered = false
    if (addedLabels.length === 0 && removedLabels.length === 0) {
      // Unique obs IDs in snapshot order (snapshots are pre-sorted by date_a.ts)
      const snapshotIdSequence = []
      tlSnapshots.forEach(s => {
        if (!snapshotIdSequence.includes(s.date_a.id)) snapshotIdSequence.push(s.date_a.id)
        if (!snapshotIdSequence.includes(s.date_b.id)) snapshotIdSequence.push(s.date_b.id)
      })
      // Current SUCCEEDED observations sorted by observedAt
      const currentIdSequence = [...succeededDates]
        .sort((a, b) => (a.observedAt ?? '').localeCompare(b.observedAt ?? ''))
        .map(d => d.id)
      reordered = snapshotIdSequence.some((id, i) => id !== currentIdSequence[i])
      if (reordered) console.log(
        '[tlStaleInfo] reorder detected — snapshot order:', snapshotIdSequence,
        'current order:', currentIdSequence
      )
    }

    const stale = addedLabels.length > 0 || removedLabels.length > 0 || reordered
    return { stale, addedLabels, removedLabels, reordered }
  })()

  // Keep a simple boolean alias for prop passing clarity
  const tlStale = tlStaleInfo.stale

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

          <Panel
            activeSite={activeSite}
            visibleDateIds={visibleDateIds} onToggleDate={handleToggleDate}
            onCameraSite={handleCameraSite} onCameraTop={handleCameraTop}
            pcSize={pcSize}                 onPcSize={setPcSize}
            showPcSlider={showPcSlider}
            voxelPollingIds={voxelPollingIds}
            onLayerMode={handleLayerMode}
            onComputeVoxel={handleComputeVoxel}
            mode={mode}                     onMode={handleModeChange}
            diffHistory={diffHistory}
            activeDiffId={activeDiffId}
            onLoadDiff={handleLoadDiff}
            onDeleteDiff={handleDeleteDiff}
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
            diffRunning={diffRunning}       onRunDiff={handleRunDiff}   onClearDiff={handleClearDiff}   onCancelDiff={handleCancelDiff}
            diffStatus={diffStatus}
            showAdded={activeVis.added}           onShowAdded={activeVisSetters.onShowAdded}
            showRemoved={activeVis.removed}       onShowRemoved={activeVisSetters.onShowRemoved}
            showUnchanged={activeVis.unchanged}   onShowUnchanged={activeVisSetters.onShowUnchanged}
            stats={stats}
            tlSnapshots={tlSnapshots}       tlActiveIndex={tlActiveIndex}
            tlOnSelect={i => setTlActiveIndex(i)}
            tlPlaying={tlPlaying}           tlOnPlayPause={() => setTlPlaying(v => !v)}
            tlLoading={tlLoading}           tlOnRecompute={handleTlRecompute}
            tlRecomputeRunning={tlRecomputeRunning}
            tlRecomputeStatus={tlRecomputeStatus}
            tlOnCancelRecompute={handleTlCancelRecompute}
            tlStale={tlStale}
            tlStaleInfo={tlStaleInfo}
            tlMissingVoxels={tlMissingVoxels}
            apiDateIdA={apiDateIdA}         onApiDateIdA={setApiDateIdA}
            apiDateIdB={apiDateIdB}         onApiDateIdB={setApiDateIdB}
            apiRunning={apiRunning}         onApiRun={handleApiRun}     onApiClear={handleApiClear}   onApiCancel={handleApiCancel}
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