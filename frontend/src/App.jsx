/**
 * App.jsx
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { CONFIG } from './config'
import { initViewer, flyTo, setTerrainVisible, setBasemap } from './cesium/cesiumInit'
import {
  loadDate, syncVisibility, clearLayers, clearAllLayers,
  applyPcStyle,
  invalidateTilesetUrl,
  loadAllSnapshotTilesets, showSnapshotTileset, clearAllSnapshotTilesets,
  setSnapshotTilesetVisibility,
  loadDiffApiTileset, clearDiffApiTileset,
  setDiffApiTilesetVisibility,
} from './cesium/layers'
import { setDrawCallbacks, togglePolygonDraw, clearPolygon, swapPolygonTab } from './cesium/polygonDraw'
import { loadDiffSnapshotsByDiffId, invalidateDiffCache } from './timelineDiffs'
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
  pollVoxelStatus,
  fetchActiveJobs,
  createAbDiffAndPoll,
  fetchAbDiffResult,
  cancelDiff,
  deleteDiff,
  fetchProjectDiffs,
  fetchProjectDiffsInProgress,
  fetchDiffById,
  createTimeSeriesDiffAndPoll,
  cancelVoxelize,
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

// ── Per-tab visibility defaults ───────────────────────────────────────────
const DEFAULT_VIS = { added: true, removed: true, unchanged: true }

export default function App() {
  const [navTab,         setNavTab]         = useState('projects')
  const [launcherReady,  setLauncherReady]  = useState(false)
  const [showNewProject, setShowNewProject] = useState(false)

  const [sites,      setSites]      = useState([])
  const [activeSite, setActiveSite] = useState(null)

  const [mode, setMode] = useState('compare-api')

  // 'home' shows project info + diff history; 'computing' shows the new-computation form
  const [analysisView, setAnalysisView] = useState('home')
  const [diffName,     setDiffName]     = useState('')

  const [visibleDateIds, setVisibleDateIds] = useState(new Set())
  const [activeDate, setActiveDate]         = useState(null)
  const [activeDateLayerMode, setActiveDateLayerMode] = useState('pc')
  const [voxelPollingIds, setVoxelPollingIds] = useState(new Set())
  const [diffPollingIds,  setDiffPollingIds]  = useState(new Set())

  const activeDateRef     = useRef(null)
  const activeSiteRef     = useRef(null)
  const visibleIdsRef     = useRef(new Set())
  const modeRef           = useRef('compare-api')
  const analysisViewRef   = useRef('home')
  const deletingObsIdsRef = useRef(new Set())
  const flownSiteIdRef    = useRef(null)
  const diffHistoryRef    = useRef([])

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
  const [activeDiffId, setActiveDiffId] = useState(null)

  useEffect(() => { diffHistoryRef.current = diffHistory }, [diffHistory])

  // ── In-flight job registry ───────────────────────────────────────────
  // Replaces the old per-mode singleton tracking (apiRunning/apiDiffIdRef/
  // apiCancelledRef, tlRecomputeRunning/tlRecomputeDiffIdRef/tlCancelledRef).
  // Each call to handleApiRun/handleTlRecompute fires independently and
  // registers itself here the instant onDiffId resolves, keyed by diffId:
  //   diffId → { type: 'AB'|'TIME_SERIES', cancelledRef: {current:bool}, dateIds: [id,...] }
  // This lets any number of A·B and/or timeline jobs run concurrently,
  // each individually cancellable from the diff-history list, with
  // blockedDateInfo derived as the union of dateIds across all entries.
  const inFlightJobsRef = useRef(new Map())
  const [inFlightVersion, setInFlightVersion] = useState(0) // bump to force blockedDateInfo recompute
  const bumpInFlight = () => setInFlightVersion(v => v + 1)

  const diffPollCancelledMap = useRef(new Map()) // diffId → true when history-entry poll should stop

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
  // Snapshots are ONLY loaded explicitly:
  //   · after handleTlRecompute completes (sets tlSnapshots(null) to re-trigger)
  //   · when the user clicks a TS entry in diff history (handleLoadDiff)
  // We do NOT auto-fetch on entering the timeline tab so that the computing
  // view starts blank and doesn't display stale previous results.
  // This effect is therefore intentionally left empty — snapshot loading is
  // handled directly in handleTlRecompute and handleLoadDiff.
  // (kept as a no-op block so the dependency refs stay declared in order)

  // ── Timeline snapshot switch ─────────────────────────────────────────
  const tlActiveIndexRef = useRef(0)
  useEffect(() => { tlActiveIndexRef.current = tlActiveIndex }, [tlActiveIndex])

  useEffect(() => {
    if (!tlSnapshots?.length) return
    const currentMode = modeRef.current
    const snap = tlSnapshots[tlActiveIndex]
    if (currentMode !== 'timeline') return
    if (!snap) return
    showSnapshotTileset(snap.id)
  }, [tlActiveIndex, tlSnapshots])

  // ── Re-sync compare-api diff tileset style ───────────────────────────
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
        } else if (site.dates?.length > 0) {
          handleToggleDateById(site, site.dates[0], ids)
        }
        return
      }

      if (e.key === 'a') {
        const m = modeRef.current
        if (m === 'compare-api') setCompareApiVis(v => ({ ...v, added: !v.added }))
        else if (m === 'timeline') setTlVis(v => ({ ...v, added: !v.added }))
      }
      if (e.key === 'r') {
        const m = modeRef.current
        if (m === 'compare-api') setCompareApiVis(v => ({ ...v, removed: !v.removed }))
        else if (m === 'timeline') setTlVis(v => ({ ...v, removed: !v.removed }))
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

  function loadSiteData(site) {
    console.log('[loadSiteData] site:', site.id, site.name, '— dates:', site.dates?.length)
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
    inFlightJobsRef.current.clear()
    bumpInFlight()
    Promise.all([
      fetchProjectDiffs(site.id)
        .catch(e => { console.warn('[loadSiteData] fetchProjectDiffs failed:', e.message); return [] }),
      fetchProjectDiffsInProgress(site.id)
        .catch(e => { console.warn('[loadSiteData] fetchProjectDiffsInProgress failed:', e.message); return [] }),
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
    console.log('[handleDataChanged] refreshing sites')
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
            loadDate(updatedSite, d, modeRef.current, {})
          }
        }
        updatedSite.dates
          .filter(d => (d.voxelStatus === 'QUEUED' || d.voxelStatus === 'RUNNING') && !voxelPollingIds.has(d.id))
          .forEach(d => resumeVoxelPoll(d.id, d.voxelJobId))
      }
    }
    addToast('데이터가 업데이트되었습니다', 'ok')
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
        loadDate(site, d, modeRef.current, {})
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
        loadDate(activeSite, { ...d, originalTilesetUrl: resolvedUrl, datasetType: 'voxel' }, modeRef.current, {})
      } catch (e) {
        console.error('[handleLayerMode] fetchVoxelTilesetUrl failed:', e.message)
        addToast(`Voxel tileset URL 조회 실패: ${e.message}`, 'warn')
      }
    } else {
      loadDate(activeSite, d, modeRef.current, {})
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
    handleModeChange('compare-api')
  }

  // When user clicks "← 목록으로"
  function handleBackToHome() {
    setAnalysisView('home')
    clearPolygon()
    setDrawInfo(DEFAULT_DRAW_INFO)
    setDrawBtnLabel(DEFAULT_DRAW_BTN)
    setDrawBanner(false)
    // Hide all diff visuals — the viewer should be blank on the home view.
    // Any in-flight jobs keep running in the background regardless (they're
    // tracked in inFlightJobsRef, not view state), so the history spinner
    // keeps going — we just don't want stale tileset results sitting in
    // the viewport.
    clearDiffApiTileset()
    clearAllSnapshotTilesets()
    setApiSummary(null)
    setApiError(null)
    setApiDiffTilesetUrl(null)
    setTlSnapshots(null)
    setTlActiveIndex(0)
    setActiveDiffId(null)
  }

  // Fires an A·B computation and returns immediately once the job is
  // created — does NOT block on the full poll-to-completion. The caller
  // (the run button) resets the form (name field) the instant this
  // function returns, so the user can immediately queue another run.
  // Multiple calls can be in flight at once, each independently tracked
  // in inFlightJobsRef and individually cancellable from diff history.
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
            onStatus: () => {
              // No live status display anymore — results are only ever
              // loaded from diff history afterward, never auto-shown.
            },
            onDiffId: id => {
              diffId = id
              inFlightJobsRef.current.set(String(id), {
                type: 'AB',
                cancelledRef,
                dateIds: [apiDateIdA, apiDateIdB],
              })
              bumpInFlight()
              setDiffPollingIds(prev => new Set([...prev, String(id)]))
              setDiffHistory(prev => [
                {
                  id,
                  diffId: id,
                  name: diffName || `diff-${id}`,
                  type: 'AB',
                  status: 'QUEUED',
                  createdAt: new Date().toISOString(),
                  labelA: dA?.label,
                  labelB: dB?.label,
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

        // null means the job was cancelled cleanly — nothing further to do;
        // handleCancelHistoryDiff already stamped the history row CANCELLED.
        if (result == null) return

        try {
          const entries = await fetchProjectDiffs(activeSite.id)
          // Merge: keep any optimistic in-progress entries other concurrent
          // jobs may have added (QUEUED/RUNNING), replacing only entries that
          // now exist in the refreshed list.
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
        console.error('[handleApiRun] FAILED:', e.message, e)
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

  function handleApiClear() {
    setApiSummary(null); setApiError(null); setApiDiffTilesetUrl(null)
    setActiveDiffId(null)
    clearDiffApiTileset()
    setDrawInfo(DEFAULT_DRAW_INFO)
    setDrawBtnLabel(DEFAULT_DRAW_BTN)
  }

  // Fires a timeline (시계열) computation and returns immediately once the
  // job is created — same fire-and-forget pattern as handleApiRun. Results
  // are never auto-displayed; the user loads them from diff history.
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
    const sortedDates = [...activeSite.dates].sort((a, b) =>
      (a.observedAt ?? '').localeCompare(b.observedAt ?? '')
    )
    const tlLabelA = sortedDates[0]?.label
    const tlLabelB = sortedDates[sortedDates.length - 1]?.label

    // Runs in the background — intentionally not awaited by the caller.
    ;(async () => {
      let diffId = null
      try {
        await createTimeSeriesDiffAndPoll(activeSite.id, {
          name: diffName || undefined,
          shouldStop: () => cancelledRef.current,
          onStatus: () => {
            // No live status display anymore — results load from history.
          },
          onDiffId: id => {
            diffId = id
            inFlightJobsRef.current.set(String(id), {
              type: 'TIME_SERIES',
              cancelledRef,
              dateIds: allDateIds,
            })
            bumpInFlight()
            setDiffPollingIds(prev => new Set([...prev, String(id)]))
            setDiffHistory(prev => [
              {
                id,
                diffId: id,
                name: diffName || `diff-${id}`,
                type: 'TIME_SERIES',
                status: 'QUEUED',
                createdAt: new Date().toISOString(),
                labelA: tlLabelA,
                labelB: tlLabelB,
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
      console.error('[resumeVoxelPoll] FAILED:', e.message, e)
      addToast(`❌ Voxel 실패: ${e.message}`, 'warn')
    }
  }

  async function resumeDiffPoll(diffId, jobId) {
    if (!diffId || !jobId) return
    diffPollCancelledMap.current.delete(String(diffId))
    setDiffPollingIds(prev => new Set([...prev, String(diffId)]))

    // Register in the in-flight registry too, so blockedDateInfo correctly
    // blocks edit/delete on the relevant dates for jobs resumed after a
    // page reload — not just freshly-started ones. The cancelledRef here
    // mirrors diffPollCancelledMap (the pre-existing mechanism for resumed
    // jobs) so handleCancelHistoryDiff's cancelDiff() call still works via
    // its existing diffPollCancelledMap path; this registration only adds
    // date-blocking, it doesn't change cancellation flow for resumed jobs.
    const entry = diffHistoryRef.current.find(e => String(e.id) === String(diffId))
    const dateIds = entry?.type === 'TIME_SERIES'
      ? (activeSiteRef.current?.dates ?? []).map(d => d.id)
      : [] // AB date IDs aren't known for resumed entries without extra lookups; skip blocking for those
    if (dateIds.length > 0) {
      inFlightJobsRef.current.set(String(diffId), {
        type: entry?.type === 'TIME_SERIES' ? 'TIME_SERIES' : 'AB',
        cancelledRef: { current: false },
        dateIds,
      })
      bumpInFlight()
    }

    // Do NOT force RUNNING here — let pollJob's first tick set the real
    // status (QUEUED or RUNNING) from the backend, so multiple in-progress
    // entries each show their true state rather than all showing 생성 중.
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

      // CANCELLED — either shouldStop fired (e.g. someone clicked ✕ on this
      // exact entry while we were polling) or the backend itself cancelled
      // the job. Either way, just stamp THIS entry — do not touch any other
      // row, and do NOT fall through to the full-history refresh below,
      // which only returns SUCCEEDED diffs and would otherwise wipe out
      // every other still-in-flight entry that hasn't reached SUCCEEDED yet.
      if (job.status === 'CANCELLED') {
        setDiffHistory(prev => prev.map(e =>
          String(e.id) === String(diffId) ? { ...e, status: 'CANCELLED' } : e
        ))
        return
      }

      // Job done — refresh full diff history to get the enriched SUCCEEDED
      // entry. Merge rather than overwrite: fetchProjectDiffs only returns
      // SUCCEEDED diffs, so a bare setDiffHistory(entries) here would erase
      // any OTHER diff that's still QUEUED/RUNNING/being resumed concurrently
      // (e.g. one job finishing while a second is still in progress).
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
      console.error('[resumeDiffPoll] FAILED:', e.message)
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
      console.error('[handleComputeVoxel] FAILED:', e.message, e)
      setStatusMsg(`Voxel 실패: ${e.message}`, true)
      setStatusDone(true)
      addToast(`❌ Voxel 실패: ${e.message}`, 'warn')
      throw e
    }
  }

  async function handleCancelVoxelForDate(dateId) {
    deletingObsIdsRef.current.add(dateId)
    try {
      const status = await cancelVoxelize(dateId)
      setVoxelPollingIds(prev => { const s = new Set(prev); s.delete(dateId); return s })
      const updatedDate = await fetchObservation(dateId)
      if (activeSite) _patchVoxelDate(activeSite.id, dateId, updatedDate)
      addToast('Voxel 작업이 취소되었습니다', 'ok')
    } catch (e) {
      console.error('[handleCancelVoxelForDate] FAILED:', e.message, e)
      addToast(`Voxel 취소 실패: ${e.message}`, 'warn')
      deletingObsIdsRef.current.delete(dateId)
    }
  }

  async function handleLoadDiff(entry) {
    if (!activeSite) return

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
    try {
      // fetchProjectDiffs only returns SUCCEEDED diffs — merge rather than
      // overwrite, or any other QUEUED/RUNNING entry not yet SUCCEEDED would
      // get wiped from the list even though its job is still alive.
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

  // Cancels a QUEUED/RUNNING diff job directly from the history list.
  // Works uniformly for any in-flight job — freshly started (tracked in
  // inFlightJobsRef) or resumed after a page reload (tracked in
  // diffPollCancelledMap) — since there's no more single "computing view's
  // job" to special-case; every job is already individually tracked by
  // diffId the instant it's created.
  async function handleCancelHistoryDiff(diffId) {
    if (cancellingDiffIds.has(diffId)) return
    setCancellingDiffIds(prev => new Set(prev).add(diffId))
    const entryName = diffHistoryRef.current.find(e => String(e.id) === String(diffId))?.name
      ?? `diff-${diffId}`
    try {
      const job = inFlightJobsRef.current.get(String(diffId))
      if (job) job.cancelledRef.current = true   // stop pollJob before the network cancel round-trip
      diffPollCancelledMap.current.set(String(diffId), true)  // stop resumeDiffPoll before network cancel
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

  const showAnalysis = navTab === 'analysis'
  const showPcSlider = activeDate?.datasetType === 'pointcloud' && activeDateLayerMode === 'pc'

  // Mirror RightPanel's own visibility logic so DrawBanner + MapOverlayControls
  // can correctly offset themselves left when the right panel is actually visible.
  // Right panel only appears when there are actual results to show.
  // For A/B: only when apiSummary is populated (job done).
  // For timeline: only when snapshots are loaded (job done).
  // Running state is shown in the left Panel — the right panel stays hidden during computation.
  const showRightPanel =
    (mode === 'compare-api' && apiSummary != null) ||
    (mode === 'timeline'    && tlSnapshots != null)


  const activeVis = mode === 'timeline' ? tlVis : compareApiVis
  const activeVisSetters = mode === 'timeline'
    ? {
        onShowAdded:     v => setTlVis(s => ({ ...s, added: v })),
        onShowRemoved:   v => setTlVis(s => ({ ...s, removed: v })),
        onShowUnchanged: v => setTlVis(s => ({ ...s, unchanged: v })),
      }
    : {
        onShowAdded:     v => setCompareApiVis(s => ({ ...s, added: v })),
        onShowRemoved:   v => setCompareApiVis(s => ({ ...s, removed: v })),
        onShowUnchanged: v => setCompareApiVis(s => ({ ...s, unchanged: v })),
      }

  return (
    <>
      <div
        id="cesiumContainer"
        className={showAnalysis ? '' : 'cesium-hidden'}
      />

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
            tlSnapshots={tlSnapshots}
            tlActiveIndex={tlActiveIndex}
            tlOnSelect={i => setTlActiveIndex(i)}
            tlPlaying={tlPlaying}
            tlOnPlayPause={() => setTlPlaying(v => !v)}
            showRightPanel={showRightPanel}
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