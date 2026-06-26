// App.jsx — root component
// All UI state lives here. The pattern throughout is:
//   user action → setState → useEffect → imperative Cesium call

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { CONFIG } from './config'
import {
  initViewer, flyTo, setTerrainVisible, setBasemap,
  initSecondaryViewer, destroySecondaryViewer, setBasemap2,
} from './cesium/cesiumInit'
import {
  loadDate, syncVisibility, clearLayers, clearAllLayers,
  applyPcStyle,
  invalidateTilesetUrl,
  loadAllSnapshotTilesets, showSnapshotTileset, clearAllSnapshotTilesets,
  setSnapshotTilesetVisibility,
  loadDiffApiTileset, clearDiffApiTileset,
  setDiffApiTilesetVisibility,
  createLayerController,
} from './cesium/layers'
import { setDrawCallbacks, togglePolygonDraw, clearPolygon, swapPolygonTab } from './cesium/polygonDraw'
import { startCameraSync } from './cesium/viewerSync'
import { loadDiffSnapshotsByDiffId, invalidateDiffCache } from './timelineDiffs'
import {
  fetchProjects,
  enrichProjectWithDates,
  voxelizeAndPoll,
  fetchVoxelTilesetUrl,
  fetchObservation,
  pollJob,
  pollVoxelStatus,
  fetchActiveJobs,
  createAbDiffAndPoll,
  fetchAbDiffResult,
  cancelDiff,
  deleteDiff,
  fetchProjectDiffs,
  fetchProjectDiffsInProgress,
  createTimeSeriesDiffAndPoll,
  cancelVoxelize,
  uploadObservation,
} from './api'
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
const DEFAULT_VIS       = { added: true, removed: true, unchanged: true }

export default function App() {
  const [navTab,         setNavTab]         = useState('projects')
  const [launcherReady,  setLauncherReady]  = useState(false)
  const [showNewProject, setShowNewProject] = useState(false)

  const [sites,      setSites]      = useState([])
  const [activeSite, setActiveSite] = useState(null)

  const [mode, setMode] = useState('compare-api')

  // 'home' = project info + diff history; 'computing' = new-computation form
  const [analysisView, setAnalysisView] = useState('home')
  const [diffName,     setDiffName]     = useState('')

  const [visibleDateIds,       setVisibleDateIds]       = useState(new Set())
  const [activeDate,           setActiveDate]           = useState(null)
  const [activeDateLayerMode,  setActiveDateLayerMode]  = useState('pc')
  const [voxelPollingIds,      setVoxelPollingIds]      = useState(new Set())
  const [diffPollingIds,       setDiffPollingIds]       = useState(new Set())

  // Multiple uploads can run concurrently. Map of tempId → { name, observedAt, datasetType, phase, pct, error }.
  const [uploadingDateInfo, setUploadingDateInfo] = useState(() => new Map())

  const activeDateRef     = useRef(null)
  const activeSiteRef     = useRef(null)
  const visibleIdsRef     = useRef(new Set())
  const modeRef           = useRef('compare-api')
  const analysisViewRef   = useRef('home')
  const deletingObsIdsRef = useRef(new Set())
  const flownSiteIdRef    = useRef(null)
  const diffHistoryRef    = useRef([])
  const splitModeRef      = useRef(false)
  const slotBTypeRef      = useRef(null)

  useEffect(() => { activeDateRef.current   = activeDate },     [activeDate])
  useEffect(() => { activeSiteRef.current   = activeSite },     [activeSite])
  useEffect(() => { visibleIdsRef.current   = visibleDateIds }, [visibleDateIds])
  useEffect(() => { modeRef.current         = mode },           [mode])
  useEffect(() => { analysisViewRef.current = analysisView },   [analysisView])

  const [compareApiVis, setCompareApiVis] = useState({ ...DEFAULT_VIS })
  const [tlVis,         setTlVis]         = useState({ ...DEFAULT_VIS })

  const compareApiVisRef = useRef({ ...DEFAULT_VIS })
  const tlVisRef         = useRef({ ...DEFAULT_VIS })
  useEffect(() => { compareApiVisRef.current = compareApiVis }, [compareApiVis])
  useEffect(() => { tlVisRef.current         = tlVis },         [tlVis])

  const [apiDateIdA,        setApiDateIdA]        = useState('')
  const [apiDateIdB,        setApiDateIdB]        = useState('')
  const [apiError,          setApiError]          = useState(null)
  const [apiSummary,        setApiSummary]        = useState(null)
  const [apiDiffTilesetUrl, setApiDiffTilesetUrl] = useState(null)

  const [diffHistory,       setDiffHistory]       = useState([])
  const [deletingDiffIds,   setDeletingDiffIds]   = useState(() => new Set())
  const [cancellingDiffIds, setCancellingDiffIds] = useState(() => new Set())
  const [activeDiffId,      setActiveDiffId]      = useState(null)

  useEffect(() => { diffHistoryRef.current = diffHistory }, [diffHistory])

  // Split view: slot A reuses all existing single-view state; slot B is parallel state
  // only active when splitMode is on and a second diff entry has been assigned.
  const [splitMode,     setSplitMode]     = useState(false)
  const [activeDiffIdB, setActiveDiffIdB] = useState(null)

  useEffect(() => { splitModeRef.current = splitMode }, [splitMode])

  const [apiSummaryB,        setApiSummaryB]        = useState(null)
  const [apiDiffTilesetUrlB, setApiDiffTilesetUrlB] = useState(null)

  const [tlSnapshotsB,   setTlSnapshotsB]   = useState(null)
  const [tlActiveIndexB, setTlActiveIndexB] = useState(0)
  const [tlPlayingB,     setTlPlayingB]     = useState(false)
  const [tlLoadingB,     setTlLoadingB]     = useState(false)
  const tlSnapshotsBRef  = useRef(null)
  useEffect(() => { tlSnapshotsBRef.current = tlSnapshotsB }, [tlSnapshotsB])

  const [slotBType, setSlotBType] = useState(null) // 'AB' | 'TIME_SERIES' | null
  useEffect(() => { slotBTypeRef.current = slotBType }, [slotBType])

  const [tlVisB,         setTlVisB]         = useState({ ...DEFAULT_VIS })
  const [compareApiVisB, setCompareApiVisB] = useState({ ...DEFAULT_VIS })
  const tlVisBRef         = useRef({ ...DEFAULT_VIS })
  const compareApiVisBRef = useRef({ ...DEFAULT_VIS })
  useEffect(() => { tlVisBRef.current         = tlVisB },         [tlVisB])
  useEffect(() => { compareApiVisBRef.current = compareApiVisB }, [compareApiVisB])

  // ── Blink mode ──────────────────────────────────────────────────────────
  // While on: forces 유지 (unchanged) off (slot A always, slot B too whenever
  // a B slot is occupied), disables the U toggle/shortcut, and flickers
  // whatever added/removed tiles are currently visible. Underlying
  // added/removed state is untouched, so toggling/syncing those independently
  // still works — blink just additionally ANDs a flicker phase onto them at
  // the point visibility is applied.
  const [blinkMode, setBlinkMode] = useState(false)
  const [blinkOn,   setBlinkOn]   = useState(true)
  const blinkModeRef   = useRef(false)
  const blinkTimerRef  = useRef(null)
  const unchangedSnapshotRef = useRef({ a: null, b: null })
  useEffect(() => { blinkModeRef.current = blinkMode }, [blinkMode])

  function handleToggleBlinkMode() {
    setBlinkMode(prev => {
      const next = !prev
      if (next) {
        setBlinkOn(true)
        clearInterval(blinkTimerRef.current)
        blinkTimerRef.current = setInterval(() => setBlinkOn(v => !v), 250)
      } else {
        // Turning OFF — stop flicker, restore 유지 values that were snapshotted.
        clearInterval(blinkTimerRef.current)
        setBlinkOn(true)
        const { a, b } = unchangedSnapshotRef.current
        if (a != null) {
          if (modeRef.current === 'timeline') setTlVis(v => ({ ...v, unchanged: a }))
          else                                setCompareApiVis(v => ({ ...v, unchanged: a }))
        }
        if (b != null) {
          if (slotBTypeRef.current === 'AB')           setCompareApiVisB(v => ({ ...v, unchanged: b }))
          else if (slotBTypeRef.current === 'TIME_SERIES') setTlVisB(v => ({ ...v, unchanged: b }))
        }
        unchangedSnapshotRef.current = { a: null, b: null }
      }
      return next
    })
  }

  // Re-applies the "force 유지 off" whenever blink is on and slot A's mode,
  // split mode, or slot B's assigned type changes — this is what makes blink
  // correctly catch a B slot that gets assigned/replaced *after* blink was
  // already toggled on, not just at the moment of the click.
  useEffect(() => {
    if (!blinkMode) return

    if (modeRef.current === 'timeline') {
      if (unchangedSnapshotRef.current.a == null) unchangedSnapshotRef.current.a = tlVisRef.current.unchanged
      if (tlVisRef.current.unchanged !== false) setTlVis(v => ({ ...v, unchanged: false }))
    } else {
      if (unchangedSnapshotRef.current.a == null) unchangedSnapshotRef.current.a = compareApiVisRef.current.unchanged
      if (compareApiVisRef.current.unchanged !== false) setCompareApiVis(v => ({ ...v, unchanged: false }))
    }

    if (splitMode) {
      if (slotBType === 'AB') {
        if (unchangedSnapshotRef.current.b == null) unchangedSnapshotRef.current.b = compareApiVisBRef.current.unchanged
        if (compareApiVisBRef.current.unchanged !== false) setCompareApiVisB(v => ({ ...v, unchanged: false }))
      } else if (slotBType === 'TIME_SERIES') {
        if (unchangedSnapshotRef.current.b == null) unchangedSnapshotRef.current.b = tlVisBRef.current.unchanged
        if (tlVisBRef.current.unchanged !== false) setTlVisB(v => ({ ...v, unchanged: false }))
      } else {
        unchangedSnapshotRef.current.b = null
      }
    } else {
      unchangedSnapshotRef.current.b = null
    }
  }, [blinkMode, mode, splitMode, slotBType])

  // Safety: if split mode turns off (or component unmounts) while blink is
  // running, stop the timer so it doesn't leak.
  useEffect(() => {
    return () => clearInterval(blinkTimerRef.current)
  }, [])

  const layersBRef        = useRef(null)
  const stopCameraSyncRef = useRef(null)
  const viewer2ReadyRef   = useRef(false)

  // Loads a date into the primary viewer, and also into slot B if split mode is active.
  function loadDateBoth(site, dateObj, currentMode, opts) {
    loadDate(site, dateObj, currentMode, opts)
    if (splitMode && layersBRef.current) {
      layersBRef.current.loadDate(site, dateObj, currentMode, opts)
    }
  }

  // Per-diffId job registry used for cancellation and blocking date edits during analysis.
  // Structure: diffId → { type: 'AB'|'TIME_SERIES', cancelledRef, dateIds }
  const inFlightJobsRef   = useRef(new Map())
  const [inFlightVersion, setInFlightVersion] = useState(0)
  const bumpInFlight = () => setInFlightVersion(v => v + 1)

  const diffPollCancelledMap = useRef(new Map()) // diffId → true when poll should stop

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
  const tlPlayTimer    = useRef(null)
  const viewerReady    = useRef(false)
  const tlSnapshotsRef = useRef(null)
  useEffect(() => { tlSnapshotsRef.current = tlSnapshots }, [tlSnapshots])

  // Dates that are locked because a diff job using them is in flight.
  const blockedDateInfo = useMemo(() => {
    const map = new Map()
    for (const job of inFlightJobsRef.current.values()) {
      const msg = job.type === 'AB'
        ? 'A/B 분석이 진행 중입니다 — 분석이 끝나거나 취소된 후 수정/삭제할 수 있습니다.'
        : '시계열 분석이 진행 중입니다 — 분석이 끝나거나 취소된 후 수정/삭제할 수 있습니다.'
      job.dateIds.forEach(id => map.set(id, msg))
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inFlightVersion])

  // ── Helpers ───────────────────────────────────────────────────────────

  const addToast = useCallback((msg, type = 'ok') => {
    const id = Date.now() + Math.random()
    setToasts(prev => [...prev, { id, msg, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000)
  }, [])

  const refreshSites = useCallback(async () => {
    try {
      const projects = await fetchProjects()
      return await Promise.all(projects.map(p => enrichProjectWithDates(p)))
    } catch (e) {
      console.error('[refreshSites] failed:', e.message)
      return []
    }
  }, [])

  // ── Init ──────────────────────────────────────────────────────────────

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

  // ── Timeline playback ─────────────────────────────────────────────────

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

  // ── Timeline snapshot switch ──────────────────────────────────────────

  const tlActiveIndexRef = useRef(0)
  useEffect(() => { tlActiveIndexRef.current = tlActiveIndex }, [tlActiveIndex])

  useEffect(() => {
    if (!tlSnapshots?.length) return
    if (modeRef.current !== 'timeline') return
    const snap = tlSnapshots[tlActiveIndex]
    if (!snap) return
    showSnapshotTileset(snap.id)
  }, [tlActiveIndex, tlSnapshots])

  // Split mode: create viewer2 + its layer controller + camera sync.
  // `cancelled` guards against a fast double-toggle leaving an orphaned viewer2.
  useEffect(() => {
    if (!splitMode) return
    if (!viewerReady.current) return

    let cancelled = false

    ;(async () => {
      const v2 = await initSecondaryViewer('cesiumContainer2')
      if (cancelled || !v2) return

      viewer2ReadyRef.current = true
      layersBRef.current = createLayerController({ viewer: v2 })
      setBasemap2(basemap)
      if (showTerrain === false) {
        v2.terrainProvider = new window.Cesium.EllipsoidTerrainProvider()
      }

      stopCameraSyncRef.current = startCameraSync(window.viewer, v2)

      // Cesium won't update the primary's framebuffer until kicked after the
      // split-half-left class shrinks it to ~50% width.
      requestAnimationFrame(() => {
        if (window.viewer && !window.viewer.isDestroyed()) {
          window.viewer.resize()
          window.viewer.scene.requestRender()
        }
      })
    })()

    return () => {
      cancelled = true
      stopCameraSyncRef.current?.()
      stopCameraSyncRef.current = null
      layersBRef.current = null
      viewer2ReadyRef.current = false
      destroySecondaryViewer()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [splitMode])

  useEffect(() => {
    if (splitMode && viewer2ReadyRef.current) setBasemap2(basemap)
  }, [basemap, splitMode])

  useEffect(() => {
    if (mode !== 'compare-api') return
    setDiffApiTilesetVisibility(
      compareApiVis.added   && blinkOn,
      compareApiVis.removed && blinkOn,
      compareApiVis.unchanged
    )
  }, [compareApiVis, blinkOn])

  useEffect(() => {
    if (mode !== 'timeline') return
    setSnapshotTilesetVisibility(
      tlVis.added   && blinkOn,
      tlVis.removed && blinkOn,
      tlVis.unchanged
    )
  }, [tlVis, blinkOn])

  // Slot B timeline playback
  const tlPlayTimerB = useRef(null)
  useEffect(() => {
    clearInterval(tlPlayTimerB.current)
    if (tlPlayingB && tlSnapshotsB?.length) {
      tlPlayTimerB.current = setInterval(() => {
        setTlActiveIndexB(i => {
          const next = i + 1
          if (next >= tlSnapshotsB.length) { setTlPlayingB(false); return i }
          return next
        })
      }, 2500)
    }
    return () => clearInterval(tlPlayTimerB.current)
  }, [tlPlayingB, tlSnapshotsB])

  // Slot B snapshot switch
  useEffect(() => {
    if (!splitMode || !tlSnapshotsB?.length || slotBType !== 'TIME_SERIES') return
    const snap = tlSnapshotsB[tlActiveIndexB]
    if (!snap || !layersBRef.current) return
    layersBRef.current.showSnapshotTileset(snap.id)
  }, [tlActiveIndexB, tlSnapshotsB, splitMode, slotBType])

  // Slot B visibility resync
  useEffect(() => {
    if (!splitMode || !layersBRef.current || slotBType !== 'AB') return
    layersBRef.current.setDiffApiTilesetVisibility(
      compareApiVisB.added   && blinkOn,
      compareApiVisB.removed && blinkOn,
      compareApiVisB.unchanged
    )
  }, [compareApiVisB, splitMode, slotBType, blinkOn])

  useEffect(() => {
    if (!splitMode || !layersBRef.current || slotBType !== 'TIME_SERIES') return
    layersBRef.current.setSnapshotTilesetVisibility(
      tlVisB.added   && blinkOn,
      tlVisB.removed && blinkOn,
      tlVisB.unchanged
    )
  }, [tlVisB, splitMode, slotBType, blinkOn])

  useEffect(() => { applyPcStyle(pcSize) },           [pcSize])
  useEffect(() => { setTerrainVisible(showTerrain) }, [showTerrain])
  useEffect(() => { setBasemap(basemap) },             [basemap])

  // ── Keyboard shortcuts ────────────────────────────────────────────────

  useEffect(() => {
    const handler = e => {
      const tag = e.target.tagName
      const isCheckbox = tag === 'INPUT' && e.target.type === 'checkbox'
      if ((tag === 'INPUT' && !isCheckbox) || tag === 'SELECT') return
      if (navTab !== 'analysis') return

      if (e.key === 'a') {
        const m = modeRef.current
        let target
        if (m === 'compare-api') { target = !compareApiVisRef.current.added; setCompareApiVis(v => ({ ...v, added: target })) }
        else if (m === 'timeline') { target = !tlVisRef.current.added; setTlVis(v => ({ ...v, added: target })) }
        if (splitModeRef.current && target !== undefined) {
          if (slotBTypeRef.current === 'AB')           setCompareApiVisB(v => ({ ...v, added: target }))
          else if (slotBTypeRef.current === 'TIME_SERIES') setTlVisB(v => ({ ...v, added: target }))
        }
      }
      if (e.key === 'r') {
        const m = modeRef.current
        let target
        if (m === 'compare-api') { target = !compareApiVisRef.current.removed; setCompareApiVis(v => ({ ...v, removed: target })) }
        else if (m === 'timeline') { target = !tlVisRef.current.removed; setTlVis(v => ({ ...v, removed: target })) }
        if (splitModeRef.current && target !== undefined) {
          if (slotBTypeRef.current === 'AB')           setCompareApiVisB(v => ({ ...v, removed: target }))
          else if (slotBTypeRef.current === 'TIME_SERIES') setTlVisB(v => ({ ...v, removed: target }))
        }
      }
      if (e.key === 'u' && !blinkModeRef.current) {
        const m = modeRef.current
        let target
        if (m === 'compare-api') { target = !compareApiVisRef.current.unchanged; setCompareApiVis(v => ({ ...v, unchanged: target })) }
        else if (m === 'timeline') { target = !tlVisRef.current.unchanged; setTlVis(v => ({ ...v, unchanged: target })) }
        if (splitModeRef.current && target !== undefined) {
          if (slotBTypeRef.current === 'AB')           setCompareApiVisB(v => ({ ...v, unchanged: target }))
          else if (slotBTypeRef.current === 'TIME_SERIES') setTlVisB(v => ({ ...v, unchanged: target }))
        }
      }

      if (e.key === '1') handleCameraTop()

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

  // ── Handlers ──────────────────────────────────────────────────────────

  function loadSiteData(site) {
    clearAllLayers()
    clearPolygon()
    setMode('compare-api')
    setAnalysisView('home')
    setDiffName('')
    setDrawInfo(DEFAULT_DRAW_INFO)
    setDrawBtnLabel(DEFAULT_DRAW_BTN)
    setDrawBanner(false)
    setVisibleDateIds(new Set())
    setActiveDate(null)
    setApiDateIdA(site.dates?.[0]?.id ?? '')
    setApiDateIdB(site.dates?.[1]?.id ?? site.dates?.[0]?.id ?? '')
    setApiSummary(null); setApiError(null); setApiDiffTilesetUrl(null)
    setTlSnapshots(null); setTlActiveIndex(0); setTlPlaying(false)
    setCompareApiVis({ ...DEFAULT_VIS })
    setTlVis({ ...DEFAULT_VIS })
    setActiveSite(site)
    window.currentSite = site
    flownSiteIdRef.current = null
    setActiveDiffId(null)
    setSplitMode(false)
    handleClearSlotB()
    inFlightJobsRef.current.clear()
    bumpInFlight()
    Promise.all([
      fetchProjectDiffs(site.id).catch(e => { console.warn('[loadSiteData] fetchProjectDiffs failed:', e.message); return [] }),
      fetchProjectDiffsInProgress(site.id).catch(e => { console.warn('[loadSiteData] fetchProjectDiffsInProgress failed:', e.message); return [] }),
    ]).then(([succeeded, inProgress]) => {
      setDiffHistory([...inProgress, ...succeeded])
      inProgress.forEach(d => resumeDiffPoll(d.id, d.jobId))
    })
    fetchActiveJobs().then(activeJobs => {
      const obsIds = new Set((site.dates ?? []).map(d => String(d.id)))
      activeJobs
        .filter(j => j.jobType === 'VOXEL_CREATE' && obsIds.has(String(j.targetId)))
        .forEach(j => resumeVoxelPoll(String(j.targetId), j.id))
    }).catch(e => console.warn('[loadSiteData] fetchActiveJobs failed:', e.message))
  }

  function handlePreloadProject(site) {
    if (activeSiteRef.current?.id === site.id) return
    loadSiteData(site)
  }

  function handleOpenProject({ site, initialTab } = {}) {
    if (activeSiteRef.current?.id !== site.id) loadSiteData(site)
    setNavTab(initialTab ?? 'analysis')
    if (site.centerLon != null && site.centerLat != null) {
      flyTo(site.centerLon, site.centerLat - 0.009, site.cameraHeight)
    }
    flownSiteIdRef.current = site.id
  }

  async function handleProjectCreated(newSite) {
    setShowNewProject(false)
    const updated = await refreshSites()
    setSites(updated)
    addToast(`프로젝트 "${newSite.name}" 생성됨`, 'ok')
    const full = updated.find(s => s.id === newSite.id)
    if (full) handleOpenProject({ site: full, initialTab: 'upload' })
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
          if (d?.originalTilesetUrl) {
            invalidateTilesetUrl(d.originalTilesetUrl)
            loadDateBoth(updatedSite, d, modeRef.current, {})
          }
        }
        updatedSite.dates
          .filter(d => (d.voxelStatus === 'QUEUED' || d.voxelStatus === 'RUNNING') && !voxelPollingIds.has(d.id))
          .forEach(d => resumeVoxelPoll(d.id, d.voxelJobId))
      }
    }
    addToast('데이터가 업데이트되었습니다', 'ok')
  }

  // Fire-and-forget upload. Returns a tempId the caller can use to track progress.
  // Multiple uploads can run concurrently — each gets its own tempId row in uploadingDateInfo.
  function handleUploadObservation(siteId, { name, observedAt, datasetType, files }) {
    const tempId = `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    setUploadingDateInfo(prev => {
      const next = new Map(prev)
      next.set(tempId, { name, observedAt, datasetType, phase: 'checking', pct: 0, error: null })
      return next
    })

    function patch(fields) {
      setUploadingDateInfo(prev => {
        if (!prev.has(tempId)) return prev
        const next = new Map(prev)
        next.set(tempId, { ...next.get(tempId), ...fields })
        return next
      })
    }

    ;(async () => {
      try {
        const newDate = await uploadObservation(siteId, {
          name, observedAt, datasetType, files,
          onProgress: p => patch({ phase: p.phase, pct: p.pct }),
        })

        // Patch the new date straight into state — avoids a full refreshSites() round-trip.
        setSites(prev => {
          const next = prev.map(s => {
            if (s.id !== siteId) return s
            if (s.dates.some(d => d.id === newDate.id)) return s
            return { ...s, dates: [...s.dates, newDate].sort((a, b) => (a.observedAt < b.observedAt ? -1 : 1)) }
          })
          const newSite = next.find(s => s.id === siteId)
          if (newSite && activeSiteRef.current?.id === siteId) {
            setActiveSite(newSite)
            window.currentSite = newSite
          }
          return next
        })

        addToast(`✓ 업로드 완료: ${name}`, 'ok')
        setUploadingDateInfo(prev => { const next = new Map(prev); next.delete(tempId); return next })

        // Backend auto-starts voxelization on upload — begin polling if it's already queued.
        if (newDate.voxelStatus === 'QUEUED' || newDate.voxelStatus === 'RUNNING') {
          resumeVoxelPoll(newDate.id, newDate.voxelJobId)
        }
      } catch (e) {
        console.error('[handleUploadObservation] failed:', e.message)
        patch({ phase: 'error', error: e.message })
        addToast(`❌ 업로드 실패: ${name} — ${e.message}`, 'warn')
        // Leave the failed row in uploadingDateInfo so the user can see what went wrong.
      }
    })()

    return tempId
  }

  function handleDismissUpload(tempId) {
    setUploadingDateInfo(prev => { const next = new Map(prev); next.delete(tempId); return next })
  }

  async function handleSiteEdited() {
    const updated = await refreshSites()
    setSites(updated)
    if (activeSite) {
      const updatedSite = updated.find(s => s.id === activeSite.id)
      if (updatedSite) {
        setActiveSite(updatedSite)
        window.currentSite = updatedSite
        if (updatedSite.centerLon != null && updatedSite.centerLat != null) {
          flyTo(updatedSite.centerLon, updatedSite.centerLat - 0.009, updatedSite.cameraHeight)
        }
      }
    }
    addToast('프로젝트 정보가 업데이트되었습니다', 'ok')
  }

  async function handleSiteDeleted(siteId) {
    const updated = await refreshSites()
    setSites(updated)
    if (activeSite?.id === siteId) {
      clearAllLayers()
      clearPolygon()
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
        loadDateBoth(site, d, modeRef.current, {})
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
        loadDateBoth(activeSite, { ...d, originalTilesetUrl: resolvedUrl, datasetType: 'voxel' }, modeRef.current, {})
      } catch (e) {
        console.error('[handleLayerMode] fetchVoxelTilesetUrl failed:', e.message)
        addToast(`Voxel tileset URL 조회 실패: ${e.message}`, 'warn')
      }
    } else {
      loadDateBoth(activeSite, d, modeRef.current, {})
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
      swapPolygonTab(prevMode, 'timeline-hidden', drawInfo, drawBtnLabel)
      setDrawBanner(false)
      syncVisibility('timeline', {})
      const snaps = tlSnapshotsRef.current
      if (snaps?.length) {
        const activeSnap = snaps[tlActiveIndexRef.current]
        if (activeSnap) showSnapshotTileset(activeSnap.id)
      }
      setSnapshotTilesetVisibility(tlVisRef.current.added, tlVisRef.current.removed, tlVisRef.current.unchanged)
    } else if (newMode === 'compare-api') {
      swapPolygonTab(prevMode === 'timeline' ? 'timeline-hidden' : prevMode, 'compare-api', drawInfo, drawBtnLabel)
      setDrawBanner(false)
      syncVisibility('compare-api', {})
    }
  }

  // When user clicks "새 변화탐지"
  function handleNewComputation() {
    setAnalysisView('computing')
    setDiffName('')
    setApiSummary(null)
    setApiError(null)
    setApiDiffTilesetUrl(null)
    clearDiffApiTileset()
    clearAllSnapshotTilesets()
    setTlSnapshots(null)
    setTlActiveIndex(0)
    setActiveDiffId(null)
    if (splitMode) handleToggleSplitMode()
    handleModeChange('compare-api')
  }

  // When user clicks "← 목록으로"
  function handleBackToHome() {
    setAnalysisView('home')
    clearPolygon()
    setDrawInfo(DEFAULT_DRAW_INFO)
    setDrawBtnLabel(DEFAULT_DRAW_BTN)
    setDrawBanner(false)
    // In-flight jobs keep running — just clear visuals.
    clearDiffApiTileset()
    clearAllSnapshotTilesets()
    setApiSummary(null)
    setApiError(null)
    setApiDiffTilesetUrl(null)
    setTlSnapshots(null)
    setTlActiveIndex(0)
    setActiveDiffId(null)
    if (splitMode) handleClearSlotB()
  }

  // Fire-and-forget A·B diff. Multiple jobs can be in flight at once,
  // each tracked by diffId in inFlightJobsRef.
  async function handleApiRun() {
    if (!apiDateIdA || !apiDateIdB) { setApiError('두 날짜를 먼저 선택하세요'); return }
    if (apiDateIdA === apiDateIdB)  { setApiError('서로 다른 날짜를 선택하세요'); return }

    const dA = activeSite.dates.find(d => d.id === apiDateIdA)
    const dB = activeSite.dates.find(d => d.id === apiDateIdB)
    if (dA?.voxelStatus !== 'SUCCEEDED') {
      setApiError(`날짜 A (${dA?.label ?? apiDateIdA})의 Voxel이 아직 생성되지 않았습니다.`)
      return
    }
    if (dB?.voxelStatus !== 'SUCCEEDED') {
      setApiError(`날짜 B (${dB?.label ?? apiDateIdB})의 Voxel이 아직 생성되지 않았습니다.`)
      return
    }

    setApiError(null)
    const runName = diffName || 'A·B 분석'
    const cancelledRef = { current: false }

    const { getPolygonWkt } = await import('./cesium/polygonDraw')
    const areaWkt = getPolygonWkt?.() ?? undefined

    // Runs in the background — intentionally not awaited by the caller.
    ;(async () => {
      let diffId = null
      try {
        const result = await createAbDiffAndPoll(
          activeSite.id,
          apiDateIdA,
          apiDateIdB,
          {
            areaWkt,
            name: diffName || undefined,
            shouldStop: () => cancelledRef.current,
            onStatus: () => {},
            onDiffId: id => {
              diffId = id
              inFlightJobsRef.current.set(String(id), { type: 'AB', cancelledRef, dateIds: [apiDateIdA, apiDateIdB] })
              bumpInFlight()
              setDiffPollingIds(prev => new Set([...prev, String(id)]))
              setDiffHistory(prev => [
                {
                  id, diffId: id,
                  name: diffName || `diff-${id}`,
                  type: 'AB', status: 'QUEUED',
                  createdAt: new Date().toISOString(),
                  labelA: dA?.label, labelB: dB?.label,
                },
                ...prev,
              ])
              addToast(`⚡ "${runName}" 분석 시작됨`, 'ok')
            },
            onJobTick: job => {
              if (diffId == null) return
              const s = job.status === 'QUEUED' ? 'QUEUED' : 'RUNNING'
              setDiffHistory(prev => prev.map(e =>
                String(e.id) === String(diffId) ? { ...e, status: s } : e
              ))
            },
          },
        )

        // null = job was cancelled cleanly; handleCancelHistoryDiff already stamped the row.
        if (result == null) return

        try {
          const entries = await fetchProjectDiffs(activeSite.id)
          // Merge rather than replace — other concurrent jobs may still be QUEUED/RUNNING.
          const refreshedIds = new Set(entries.map(e => String(e.id)))
          setDiffHistory(prev => {
            const inFlight = prev.filter(e =>
              (e.status === 'QUEUED' || e.status === 'RUNNING') && !refreshedIds.has(String(e.id))
            )
            return [...inFlight, ...entries]
          })
        } catch (e) {
          console.warn('[handleApiRun] fetchProjectDiffs refresh failed:', e.message)
        }
        addToast(`✓ "${runName}" 분석 완료 — 기록에서 확인하세요`, 'ok')
      } catch (e) {
        console.error('[handleApiRun] failed:', e.message)
        const wasCancelled = /취소/.test(e.message)
        if (diffId != null) {
          setDiffHistory(prev => prev.map(en =>
            String(en.id) === String(diffId) ? { ...en, status: wasCancelled ? 'CANCELLED' : 'FAILED' } : en
          ))
        }
        if (!wasCancelled) addToast(`❌ "${runName}" 분석 실패: ${e.message}`, 'warn')
      } finally {
        if (diffId != null) {
          setDiffPollingIds(prev => { const s = new Set(prev); s.delete(String(diffId)); return s })
          inFlightJobsRef.current.delete(String(diffId))
          bumpInFlight()
        }
      }
    })()
  }

  // When user clicks "-clear" in the API comparison view
  function handleApiClear() {
    setApiSummary(null); setApiError(null); setApiDiffTilesetUrl(null)
    setActiveDiffId(null)
    clearDiffApiTileset()
    setDrawInfo(DEFAULT_DRAW_INFO)
    setDrawBtnLabel(DEFAULT_DRAW_BTN)
  }

  // Same fire-and-forget pattern as handleApiRun but for TIME_SERIES diffs.
  const handleTlRecompute = useCallback(async () => {
    if (!activeSite) return

    if (activeSite.dates.length < 2) {
      addToast('시계열 분석을 실행하려면 최소 2개의 관측 데이터가 필요합니다', 'warn')
      return
    }

    const missing = activeSite.dates.filter(d => d.voxelStatus !== 'SUCCEEDED')
    if (missing.length > 0) {
      const labels = missing.map(d => d.label ?? d.id).join(', ')
      addToast(`Voxel이 없는 날짜가 있습니다: ${labels}`, 'warn')
      return
    }

    const runName = diffName || '시계열 분석'
    const cancelledRef = { current: false }
    const allDateIds = activeSite.dates.map(d => d.id)
    const sortedDates = [...activeSite.dates].sort((a, b) => (a.observedAt ?? '').localeCompare(b.observedAt ?? ''))
    const tlLabelA = sortedDates[0]?.label
    const tlLabelB = sortedDates[sortedDates.length - 1]?.label

    // Runs in the background — intentionally not awaited by the caller.
    ;(async () => {
      let diffId = null
      try {
        await createTimeSeriesDiffAndPoll(activeSite.id, {
          name: diffName || undefined,
          shouldStop: () => cancelledRef.current,
          onStatus: () => {},
          onDiffId: id => {
            diffId = id
            inFlightJobsRef.current.set(String(id), { type: 'TIME_SERIES', cancelledRef, dateIds: allDateIds })
            bumpInFlight()
            setDiffPollingIds(prev => new Set([...prev, String(id)]))
            setDiffHistory(prev => [
              {
                id, diffId: id,
                name: diffName || `diff-${id}`,
                type: 'TIME_SERIES', status: 'QUEUED',
                createdAt: new Date().toISOString(),
                labelA: tlLabelA, labelB: tlLabelB,
              },
              ...prev,
            ])
            addToast(`⚡ "${runName}" 분석 시작됨`, 'ok')
          },
          onJobTick: job => {
            if (diffId == null) return
            const s = job.status === 'QUEUED' ? 'QUEUED' : 'RUNNING'
            setDiffHistory(prev => prev.map(e =>
              String(e.id) === String(diffId) ? { ...e, status: s } : e
            ))
          },
        })

        // cancelledRef.current true means the job was cancelled cleanly —
        // handleCancelHistoryDiff already stamped the history row.
        if (cancelledRef.current) return

        invalidateDiffCache(activeSite.id)

        try {
          const entries = await fetchProjectDiffs(activeSite.id)
          const refreshedIds = new Set(entries.map(e => String(e.id)))
          setDiffHistory(prev => {
            const inFlight = prev.filter(e =>
              (e.status === 'QUEUED' || e.status === 'RUNNING') && !refreshedIds.has(String(e.id))
            )
            return [...inFlight, ...entries]
          })
        } catch (e) {
          console.warn('[handleTlRecompute] fetchProjectDiffs refresh failed:', e.message)
        }

        addToast(`✓ "${runName}" 분석 완료 — 기록에서 확인하세요`, 'ok')
      } catch (e) {
        console.error('[handleTlRecompute] failed:', e.message)
        const wasCancelled = /취소/.test(e.message)
        if (diffId != null) {
          setDiffHistory(prev => prev.map(en =>
            String(en.id) === String(diffId) ? { ...en, status: wasCancelled ? 'CANCELLED' : 'FAILED' } : en
          ))
        }
        if (!wasCancelled) addToast(`❌ "${runName}" 분석 실패: ${e.message}`, 'warn')
      } finally {
        if (diffId != null) {
          setDiffPollingIds(prev => { const s = new Set(prev); s.delete(String(diffId)); return s })
          inFlightJobsRef.current.delete(String(diffId))
          bumpInFlight()
        }
      }
    })()
  }, [activeSite, diffName])

  function _patchVoxelDate(siteId, dateId, updatedDate) {
    setSites(prev => {
      const next = prev.map(s => {
        if (s.id !== siteId) return s
        return { ...s, dates: s.dates.map(d => d.id === dateId ? { ...d, ...updatedDate } : d) }
      })
      const newSite = next.find(s => s.id === siteId)
      if (newSite) { setActiveSite(newSite); window.currentSite = newSite }
      return next
    })
  }

  async function resumeVoxelPoll(dateId, jobId) {
    const site = activeSiteRef.current
    const dateLabel = site?.dates.find(d => d.id === dateId)?.label ?? dateId
    setVoxelPollingIds(prev => new Set([...prev, dateId]))
    try {
      if (!jobId) {
        const fresh = await fetchObservation(dateId)
        if (fresh.voxelStatus === 'SUCCEEDED') {
          _patchVoxelDate(activeSiteRef.current?.id, dateId, fresh)
          addToast(`✓ Voxel 완료: ${dateLabel}`, 'ok')
          setVoxelPollingIds(prev => { const s = new Set(prev); s.delete(dateId); return s })
          return
        }
        if (fresh.voxelStatus !== 'QUEUED' && fresh.voxelStatus !== 'RUNNING') {
          setVoxelPollingIds(prev => { const s = new Set(prev); s.delete(dateId); return s })
          return
        }
      }

      const voxResult = await pollVoxelStatus(
        dateId,
        s => {
          const pct = s.jobProgress ? ` (${s.jobProgress}%)` : ''
          const msg = s.jobMessage ? ` — ${s.jobMessage}` : ''
          setStatusMsg(`Voxel 생성 중: ${dateLabel} [${s.voxelStatus}${pct}]${msg}`)
          setStatusDone(false)
          // Keep the row's VoxelStatusBadge in sync with QUEUED→RUNNING transitions.
          _patchVoxelDate(activeSiteRef.current?.id, dateId, {
            voxelStatus: s.voxelStatus,
            jobProgress: s.jobProgress,
            jobMessage:  s.jobMessage,
          })
        },
        { shouldStop: () => deletingObsIdsRef.current.has(dateId) }
      )

      if (voxResult.voxelStatus === 'CANCELLED') {
        setVoxelPollingIds(prev => { const s = new Set(prev); s.delete(dateId); return s })
        setStatusMsg(`Voxel 취소됨: ${dateLabel}`)
        setStatusDone(true)
        return
      }
      if (voxResult.voxelStatus !== 'SUCCEEDED') throw new Error(`Voxel ${voxResult.voxelStatus.toLowerCase()}`)

      const updatedDate = await fetchObservation(dateId)
      _patchVoxelDate(activeSiteRef.current?.id, dateId, updatedDate)
      setVoxelPollingIds(prev => { const s = new Set(prev); s.delete(dateId); return s })
      setStatusMsg(`Voxel 완료: ${dateLabel}`)
      setStatusDone(true)
      addToast(`✓ Voxel 생성 완료: ${dateLabel}`, 'ok')
    } catch (e) {
      setVoxelPollingIds(prev => { const s = new Set(prev); s.delete(dateId); return s })
      if (/not found/i.test(e.message)) {
        setStatusMsg(`Voxel 취소됨: ${dateLabel}`)
        setStatusDone(true)
        return
      }
      console.error('[resumeVoxelPoll] failed:', e.message)
      addToast(`❌ Voxel 실패: ${e.message}`, 'warn')
    }
  }

  async function resumeDiffPoll(diffId, jobId) {
    if (!diffId || !jobId) return
    diffPollCancelledMap.current.delete(String(diffId))
    setDiffPollingIds(prev => new Set([...prev, String(diffId)]))

    // Register in inFlightJobsRef so date blocking works for resumed jobs too.
    const entry = diffHistoryRef.current.find(e => String(e.id) === String(diffId))
    const dateIds = entry?.type === 'TIME_SERIES'
      ? (activeSiteRef.current?.dates ?? []).map(d => d.id)
      : [] // AB date IDs aren't reliably available on resume without extra lookups
    if (dateIds.length > 0) {
      inFlightJobsRef.current.set(String(diffId), {
        type: entry?.type === 'TIME_SERIES' ? 'TIME_SERIES' : 'AB',
        cancelledRef: { current: false },
        dateIds,
      })
      bumpInFlight()
    }

    const entryName = entry?.name ?? `diff-${diffId}`
    try {
      const job = await pollJob(
        jobId,
        job => {
          const s = job.status === 'QUEUED' ? 'QUEUED' : 'RUNNING'
          setDiffHistory(prev => prev.map(e =>
            String(e.id) === String(diffId) ? { ...e, status: s } : e
          ))
        },
        { shouldStop: () => diffPollCancelledMap.current.has(String(diffId)) },
      )

      if (job.status === 'CANCELLED') {
        setDiffHistory(prev => prev.map(e =>
          String(e.id) === String(diffId) ? { ...e, status: 'CANCELLED' } : e
        ))
        return
      }

      // fetchProjectDiffs only returns SUCCEEDED — merge to preserve any other in-flight entries.
      if (activeSiteRef.current) {
        const entries = await fetchProjectDiffs(activeSiteRef.current.id)
        const refreshedIds = new Set(entries.map(e => String(e.id)))
        setDiffHistory(prev => {
          const inFlight = prev.filter(e =>
            (e.status === 'QUEUED' || e.status === 'RUNNING') && !refreshedIds.has(String(e.id))
          )
          return [...inFlight, ...entries]
        })
      }
      addToast(`✓ "${entryName}" 분석 완료`, 'ok')
    } catch (e) {
      console.error('[resumeDiffPoll] failed:', e.message)
      const wasCancelled = /취소/.test(e.message)
      setDiffHistory(prev => prev.map(en =>
        String(en.id) === String(diffId) ? { ...en, status: wasCancelled ? 'CANCELLED' : 'FAILED' } : en
      ))
      if (!wasCancelled) addToast(`❌ "${entryName}" 분석 실패: ${e.message}`, 'warn')
    } finally {
      diffPollCancelledMap.current.delete(String(diffId))
      setDiffPollingIds(prev => { const s = new Set(prev); s.delete(String(diffId)); return s })
      if (inFlightJobsRef.current.has(String(diffId))) {
        inFlightJobsRef.current.delete(String(diffId))
        bumpInFlight()
      }
    }
  }

  async function handleComputeVoxel(dateId) {
    if (!activeSite) return
    const siteId = activeSite.id
    const dateLabel = activeSite.dates.find(d => d.id === dateId)?.label ?? dateId
    setVoxelPollingIds(prev => new Set([...prev, dateId]))
    try {
      addToast(`⚡ Voxel 생성 시작: ${dateLabel}`, 'ok')
      const updatedDate = await voxelizeAndPoll(
        dateId,
        ({ status, progress, message }) => {
          const pct = progress ? ` (${progress}%)` : ''
          const msg = message ? ` — ${message}` : ''
          setStatusMsg(`Voxel 생성 중: ${dateLabel} [${status}${pct}]${msg}`)
          setStatusDone(false)
          _patchVoxelDate(siteId, dateId, { voxelStatus: status, jobProgress: progress, jobMessage: message })
        }
      )
      _patchVoxelDate(siteId, dateId, updatedDate)
      setVoxelPollingIds(prev => { const s = new Set(prev); s.delete(dateId); return s })
      setStatusMsg(`Voxel 완료: ${dateLabel}`, true)
      setStatusDone(true)
      addToast(`✓ Voxel 생성 완료: ${dateLabel}`, 'ok')
    } catch (e) {
      setVoxelPollingIds(prev => { const s = new Set(prev); s.delete(dateId); return s })
      if (/^Voxelization cancelled/i.test(e.message) || /not found/i.test(e.message)) {
        setStatusMsg(`Voxel 취소됨: ${dateLabel}`, true)
        setStatusDone(true)
        return
      }
      console.error('[handleComputeVoxel] failed:', e.message)
      setStatusMsg(`Voxel 실패: ${e.message}`, true)
      setStatusDone(true)
      addToast(`❌ Voxel 실패: ${e.message}`, 'warn')
      throw e
    }
  }

  async function handleCancelVoxelForDate(dateId) {
    deletingObsIdsRef.current.add(dateId)
    try {
      await cancelVoxelize(dateId)
      setVoxelPollingIds(prev => { const s = new Set(prev); s.delete(dateId); return s })
      const updatedDate = await fetchObservation(dateId)
      if (activeSite) _patchVoxelDate(activeSite.id, dateId, updatedDate)
      addToast('Voxel 작업이 취소되었습니다', 'ok')
    } catch (e) {
      console.error('[handleCancelVoxelForDate] failed:', e.message)
      addToast(`Voxel 취소 실패: ${e.message}`, 'warn')
      deletingObsIdsRef.current.delete(dateId)
    }
  }

  async function handleLoadDiff(entry) {
    if (!activeSite) return

    // Clicking the active entry toggles it off
    if (activeDiffId != null && String(activeDiffId) === String(entry.id)) {
      if (entry.type === 'TIME_SERIES') {
        clearAllSnapshotTilesets()
        setTlSnapshots(null)
        setTlActiveIndex(0)
        handleModeChange('compare-api')
      } else if (entry.type === 'AB') {
        handleApiClear()
      }
      setActiveDiffId(null)
      return
    }

    if (entry.type === 'TIME_SERIES') {
      if (!entry.diffId) {
        addToast('이전 버전에서 저장된 기록입니다 — 최신 결과를 표시합니다', 'warn')
        handleModeChange('timeline')
        setActiveDiffId(entry.id)
        return
      }
      try {
        setTlLoading(true)
        const snaps = await loadDiffSnapshotsByDiffId(entry.diffId, activeSite.id)
        if (!snaps.length) { addToast('해당 시계열 결과를 불러올 수 없습니다', 'warn'); return }
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
      if (!entry.diffId) { addToast('이전 버전에서 저장된 기록입니다', 'warn'); return }
      handleModeChange('compare-api')
      setApiError(null)
      setApiSummary(null)
      try {
        const { report, tilesetUrl } = await fetchAbDiffResult(entry.diffId)
        setApiSummary(report)
        if (tilesetUrl) {
          setApiDiffTilesetUrl(tilesetUrl)
          try { await loadDiffApiTileset(tilesetUrl) } catch (e) { addToast(`Tileset 로드 실패: ${e.message}`, 'warn') }
        }
        setActiveDiffId(entry.id)
      } catch (e) {
        addToast(`기록 불러오기 실패: ${e.message}`, 'warn')
      }
    }
  }

  // Mirrors handleLoadDiff but writes into slot B state and loads into viewer2.
  async function handleLoadDiffB(entry) {
    if (!activeSite || !layersBRef.current) return

    if (activeDiffIdB != null && String(activeDiffIdB) === String(entry.id)) {
      handleClearSlotB()
      return
    }

    if (entry.type === 'TIME_SERIES') {
      if (!entry.diffId) {
        addToast('이전 버전에서 저장된 기록입니다 — 최신 결과를 표시합니다', 'warn')
        setSlotBType('TIME_SERIES')
        setActiveDiffIdB(entry.id)
        return
      }
      try {
        setTlLoadingB(true)
        const snaps = await loadDiffSnapshotsByDiffId(entry.diffId, activeSite.id)
        if (!snaps.length) { addToast('해당 시계열 결과를 불러올 수 없습니다', 'warn'); return }
        layersBRef.current.clearAllSnapshotTilesets()
        setTlSnapshotsB(snaps)
        setTlActiveIndexB(0)
        await layersBRef.current.loadAllSnapshotTilesets(snaps)
        setSlotBType('TIME_SERIES')
        layersBRef.current.showSnapshotTileset(snaps[0].id)
        setActiveDiffIdB(entry.id)
      } catch (e) {
        addToast(`기록 불러오기 실패: ${e.message}`, 'warn')
      } finally {
        setTlLoadingB(false)
      }
    } else if (entry.type === 'AB') {
      if (!entry.diffId) { addToast('이전 버전에서 저장된 기록입니다', 'warn'); return }
      setApiSummaryB(null)
      try {
        const { report, tilesetUrl } = await fetchAbDiffResult(entry.diffId)
        setApiSummaryB(report)
        setSlotBType('AB')
        if (tilesetUrl) {
          setApiDiffTilesetUrlB(tilesetUrl)
          try { await layersBRef.current.loadDiffApiTileset(tilesetUrl) } catch (e) { addToast(`Tileset 로드 실패: ${e.message}`, 'warn') }
        }
        setActiveDiffIdB(entry.id)
      } catch (e) {
        addToast(`기록 불러오기 실패: ${e.message}`, 'warn')
      }
    }
  }

  function handleClearSlotB() {
    layersBRef.current?.clearAllLayers()
    setApiSummaryB(null)
    setApiDiffTilesetUrlB(null)
    setTlSnapshotsB(null)
    setTlActiveIndexB(0)
    setTlPlayingB(false)
    setSlotBType(null)
    setActiveDiffIdB(null)
    unchangedSnapshotRef.current.b = null
  }

  // Click in split mode: toggles A off if already assigned, toggles B off if in B,
  // fills A first, then B. Repeated clicks on a new row replace B.
  function handleAssignSlot(entry) {
    if (activeDiffId != null && String(activeDiffId) === String(entry.id)) {
      handleLoadDiff(entry)
      return
    }
    if (activeDiffIdB != null && String(activeDiffIdB) === String(entry.id)) {
      handleClearSlotB()
      return
    }
    if (activeDiffId == null) {
      handleLoadDiff(entry)
    } else {
      handleLoadDiffB(entry)
    }
  }

  function handleToggleSplitMode() {
    setSplitMode(v => {
      const next = !v
      if (!next) handleClearSlotB()
      return next
    })
  }

  async function handleDeleteDiff(diffId) {
    if (!activeSite) return
    if (deletingDiffIds.has(diffId)) return
    setDeletingDiffIds(prev => new Set(prev).add(diffId))
    try {
      await deleteDiff(diffId)
    } catch (e) {
      addToast(`Diff 삭제 실패: ${e.message}`, 'warn')
      setDeletingDiffIds(prev => { const s = new Set(prev); s.delete(diffId); return s })
      return
    }
    if (String(activeDiffId) === String(diffId)) setActiveDiffId(null)
    if (String(activeDiffIdB) === String(diffId)) handleClearSlotB()
    try {
      const entries = await fetchProjectDiffs(activeSite.id)
      const refreshedIds = new Set(entries.map(e => String(e.id)))
      setDiffHistory(prev => {
        const inFlight = prev.filter(e =>
          (e.status === 'QUEUED' || e.status === 'RUNNING') &&
          String(e.id) !== String(diffId) &&
          !refreshedIds.has(String(e.id))
        )
        return [...inFlight, ...entries]
      })
    } catch (e) {
      setDiffHistory(prev => prev.filter(e => String(e.id) !== String(diffId)))
    }
    setDeletingDiffIds(prev => { const s = new Set(prev); s.delete(diffId); return s })
    addToast('삭제되었습니다', 'ok')
  }

  // Works for both freshly started jobs (inFlightJobsRef) and
  // jobs resumed after a page reload (diffPollCancelledMap).
  async function handleCancelHistoryDiff(diffId) {
    if (cancellingDiffIds.has(diffId)) return
    setCancellingDiffIds(prev => new Set(prev).add(diffId))
    const entryName = diffHistoryRef.current.find(e => String(e.id) === String(diffId))?.name ?? `diff-${diffId}`
    try {
      const job = inFlightJobsRef.current.get(String(diffId))
      if (job) job.cancelledRef.current = true
      diffPollCancelledMap.current.set(String(diffId), true)
      try {
        await cancelDiff(diffId)
        setDiffHistory(prev => prev.map(e =>
          String(e.id) === String(diffId) ? { ...e, status: 'CANCELLED' } : e
        ))
        addToast(`"${entryName}" 분석이 취소되었습니다`, 'ok')
      } catch (e) {
        addToast(`취소 실패: ${e.message}`, 'warn')
      } finally {
        setDiffPollingIds(prev => { const s = new Set(prev); s.delete(String(diffId)); return s })
        if (inFlightJobsRef.current.has(String(diffId))) {
          inFlightJobsRef.current.delete(String(diffId))
          bumpInFlight()
        }
      }
    } finally {
      setCancellingDiffIds(prev => { const s = new Set(prev); s.delete(diffId); return s })
    }
  }

  function handleCameraSite() {
    if (!activeSite) return
    flyTo(activeSite.centerLon, activeSite.centerLat - 0.009, activeSite.cameraHeight, -40)
  }
  function handleCameraTop() {
    if (!activeSite) return
    flyTo(activeSite.centerLon, activeSite.centerLat, activeSite.cameraHeight * 1.3, -90)
  }

  function handleNavTab(tab) {
    if ((tab === 'upload' || tab === 'analysis') && !activeSite) return
    if ((tab === 'upload' || tab === 'analysis') && activeSite && flownSiteIdRef.current !== activeSite.id) {
      if (activeSite.centerLon != null && activeSite.centerLat != null) {
        flyTo(activeSite.centerLon, activeSite.centerLat - 0.009, activeSite.cameraHeight)
      }
      flownSiteIdRef.current = activeSite.id
    }
    setNavTab(tab)
  }

  const showAnalysis   = navTab === 'analysis'
  const showPcSlider   = activeDate?.datasetType === 'pointcloud' && activeDateLayerMode === 'pc'
  const showRightPanel = splitMode
    ? (apiSummary != null || tlSnapshots != null || apiSummaryB != null || tlSnapshotsB != null)
    : (
        (mode === 'compare-api' && apiSummary != null) ||
        (mode === 'timeline'    && tlSnapshots != null)
      )

  const activeVis = mode === 'timeline' ? tlVis : compareApiVis
  const activeVisSetters = mode === 'timeline'
    ? {
        onShowAdded:     v => setTlVis(s => ({ ...s, added: v })),
        onShowRemoved:   v => setTlVis(s => ({ ...s, removed: v })),
        onShowUnchanged: v => { if (!blinkMode) setTlVis(s => ({ ...s, unchanged: v })) },
      }
    : {
        onShowAdded:     v => setCompareApiVis(s => ({ ...s, added: v })),
        onShowRemoved:   v => setCompareApiVis(s => ({ ...s, removed: v })),
        onShowUnchanged: v => { if (!blinkMode) setCompareApiVis(s => ({ ...s, unchanged: v })) },
      }

  return (
    <>
      <div
        id="cesiumContainer"
        className={`${showAnalysis ? '' : 'cesium-hidden'}${splitMode ? ' split-half-left' : ''}`}
      />
      {splitMode && showAnalysis && (
        <span className="viewport-slot-badge viewport-slot-badge-a dh-slot-a">A</span>
      )}
      {splitMode && (
        <div id="cesiumContainer2" className={showAnalysis ? '' : 'cesium-hidden'} />
      )}
      {splitMode && showAnalysis && (
        <span className="viewport-slot-badge viewport-slot-badge-b dh-slot-b">B</span>
      )}

      <NavBar tab={navTab} onTab={handleNavTab} activeSite={activeSite} />

      {navTab === 'projects' && (
        <div className="tab-overlay">
          <ProjectLauncher
            sites={sites}
            loading={!launcherReady}
            onSelect={handleOpenProject}
            onPreload={handlePreloadProject}
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
            onSiteUpdated={handleSiteEdited}
            blockedDateInfo={blockedDateInfo}
            voxelPollingIds={voxelPollingIds}
            onCancelVoxel={handleCancelVoxelForDate}
            onComputeVoxel={handleComputeVoxel}
            uploadingDateInfo={uploadingDateInfo}
            onUploadObservation={handleUploadObservation}
            onDismissUpload={handleDismissUpload}
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
          <DrawBanner visible={drawBanner} onCancel={togglePolygonDraw} showRightPanel={showRightPanel} />

          <Panel
            activeSite={activeSite}
            visibleDateIds={visibleDateIds} onToggleDate={handleToggleDate}
            pcSize={pcSize}                 onPcSize={setPcSize}
            showPcSlider={showPcSlider}
            voxelPollingIds={voxelPollingIds}
            onLayerMode={handleLayerMode}
            mode={mode}                     onMode={handleModeChange}
            diffHistory={diffHistory}
            diffPollingIds={diffPollingIds}
            activeDiffId={activeDiffId}
            onLoadDiff={handleLoadDiff}
            onDeleteDiff={handleDeleteDiff}
            onCancelDiff={handleCancelHistoryDiff}
            deletingDiffIds={deletingDiffIds}
            cancellingDiffIds={cancellingDiffIds}
            analysisView={analysisView}
            onNewComputation={handleNewComputation}
            onBackToHome={handleBackToHome}
            diffName={diffName}             onDiffName={setDiffName}
            apiDateIdA={apiDateIdA}         onApiDateIdA={setApiDateIdA}
            apiDateIdB={apiDateIdB}         onApiDateIdB={setApiDateIdB}
            onApiRun={handleApiRun}
            apiError={apiError}
            drawInfo={drawInfo}             drawBtnLabel={drawBtnLabel} onDrawArea={togglePolygonDraw}
            onTlRecompute={handleTlRecompute}
            splitMode={splitMode}           onToggleSplitMode={handleToggleSplitMode}
            activeDiffIdB={activeDiffIdB}
            onAssignSlot={handleAssignSlot}
            blinkMode={blinkMode}           onToggleBlinkMode={handleToggleBlinkMode}
          />

          <RightPanel
            mode={mode}
            showAdded={activeVis.added}           onShowAdded={activeVisSetters.onShowAdded}
            showRemoved={activeVis.removed}       onShowRemoved={activeVisSetters.onShowRemoved}
            showUnchanged={activeVis.unchanged}   onShowUnchanged={activeVisSetters.onShowUnchanged}
            tlSnapshots={tlSnapshots}       tlActiveIndex={tlActiveIndex}
            tlOnSelect={i => setTlActiveIndex(i)}
            tlPlaying={tlPlaying}           tlOnPlayPause={() => setTlPlaying(v => !v)}
            tlLoading={tlLoading}
            apiSummary={apiSummary}
            visible={showRightPanel}
            splitMode={splitMode}
            slotBType={slotBType}
            apiSummaryB={apiSummaryB}
            showAddedB={compareApiVisB.added}         onShowAddedB={v => setCompareApiVisB(s => ({ ...s, added: v }))}
            showRemovedB={compareApiVisB.removed}     onShowRemovedB={v => setCompareApiVisB(s => ({ ...s, removed: v }))}
            showUnchangedB={compareApiVisB.unchanged} onShowUnchangedB={v => { if (!blinkMode) setCompareApiVisB(s => ({ ...s, unchanged: v })) }}
            tlSnapshotsB={tlSnapshotsB}     tlActiveIndexB={tlActiveIndexB}
            tlOnSelectB={i => setTlActiveIndexB(i)}
            tlPlayingB={tlPlayingB}         tlOnPlayPauseB={() => setTlPlayingB(v => !v)}
            tlLoadingB={tlLoadingB}
            tlVisAddedB={tlVisB.added}             onTlShowAddedB={v => setTlVisB(s => ({ ...s, added: v }))}
            tlVisRemovedB={tlVisB.removed}         onTlShowRemovedB={v => setTlVisB(s => ({ ...s, removed: v }))}
            tlVisUnchangedB={tlVisB.unchanged}     onTlShowUnchangedB={v => { if (!blinkMode) setTlVisB(s => ({ ...s, unchanged: v })) }}
            onClearSlotB={handleClearSlotB}
          />

          <MapOverlayControls
            basemap={basemap}           onBasemap={setBasemapState}
            showTerrain={showTerrain}   onShowTerrain={setShowTerrain}
            onCameraSite={handleCameraSite} onCameraTop={handleCameraTop}
            drawBanner={drawBanner}
            showRightPanel={showRightPanel}
          />

          <BottomBar
            statusMsg={statusMsg}   statusDone={statusDone}
            coords={coords}
            mode={mode}
            tlSnapshots={splitMode ? null : tlSnapshots}
            tlActiveIndex={tlActiveIndex}
            tlOnSelect={i => setTlActiveIndex(i)}
            tlPlaying={tlPlaying}
            tlOnPlayPause={() => setTlPlaying(v => !v)}
            showRightPanel={showRightPanel}
            splitMode={splitMode}
          />
        </>
      )}

      {showAnalysis && !activeSite && (
        <BottomBar statusMsg={statusMsg} statusDone={statusDone} mode="compare-api" />
      )}

      <Toasts items={toasts} showRightPanel={showRightPanel} />
    </>
  )
}