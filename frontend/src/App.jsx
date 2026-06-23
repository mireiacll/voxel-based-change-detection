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
  pollVoxelStatus,
  fetchActiveJobs,
  createAbDiffAndPoll,
  fetchAbDiffResult,
  cancelDiff,
  deleteDiff,
  fetchProjectDiffs,
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

  const activeDateRef     = useRef(null)
  const activeSiteRef     = useRef(null)
  const visibleIdsRef     = useRef(new Set())
  const modeRef           = useRef('compare-api')
  const deletingObsIdsRef = useRef(new Set())
  const flownSiteIdRef    = useRef(null)

  useEffect(() => { activeDateRef.current = activeDate },     [activeDate])
  useEffect(() => { activeSiteRef.current = activeSite },     [activeSite])
  useEffect(() => { visibleIdsRef.current = visibleDateIds }, [visibleDateIds])
  useEffect(() => { modeRef.current       = mode },           [mode])

  const [compareApiVis, setCompareApiVis] = useState({ ...DEFAULT_VIS })
  const [tlVis,         setTlVis]         = useState({ ...DEFAULT_VIS })

  const compareApiVisRef = useRef({ ...DEFAULT_VIS })
  const tlVisRef         = useRef({ ...DEFAULT_VIS })
  useEffect(() => { compareApiVisRef.current = compareApiVis }, [compareApiVis])
  useEffect(() => { tlVisRef.current         = tlVis },         [tlVis])

  const [apiDateIdA,        setApiDateIdA]        = useState('')
  const [apiDateIdB,        setApiDateIdB]        = useState('')
  const [apiRunning,        setApiRunning]        = useState(false)
  const [apiStatus,         setApiStatus]         = useState('')
  const [apiError,          setApiError]          = useState(null)
  const [apiSummary,        setApiSummary]        = useState(null)
  const [apiDiffTilesetUrl, setApiDiffTilesetUrl] = useState(null)

  const [diffHistory,  setDiffHistory]  = useState([])
  const [activeDiffId, setActiveDiffId] = useState(null)

  const apiDiffIdRef = useRef(null)

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

  const blockedDateInfo = useMemo(() => {
    const map = new Map()
    if (apiRunning) {
      if (apiDateIdA) map.set(apiDateIdA, 'A/B 분석이 진행 중입니다 — 분석이 끝나거나 취소된 후 수정/삭제할 수 있습니다.')
      if (apiDateIdB) map.set(apiDateIdB, 'A/B 분석이 진행 중입니다 — 분석이 끝나거나 취소된 후 수정/삭제할 수 있습니다.')
    }
    if (tlRecomputeRunning && activeSite) {
      activeSite.dates.forEach(d => {
        map.set(d.id, '시계열 분석이 진행 중입니다 — 분석이 끝나거나 취소된 후 수정/삭제할 수 있습니다.')
      })
    }
    return map
  }, [apiRunning, apiDateIdA, apiDateIdB, tlRecomputeRunning, activeSite])

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
  useEffect(() => {
    if (mode !== 'timeline' || !activeSite || tlSnapshots !== null) {
      return
    }
    setTlLoading(true)
    loadDiffSnapshots(activeSite)
      .then(async snaps => {
        setTlSnapshots(snaps)
        setTlActiveIndex(0)
        await loadAllSnapshotTilesets(snaps)
        if (snaps.length > 0) showSnapshotTileset(snaps[0].id)
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
    setApiSummary(null); setApiStatus(''); setApiError(null); setApiDiffTilesetUrl(null)
    setTlSnapshots(null); setTlActiveIndex(0); setTlPlaying(false)
    setCompareApiVis({ ...DEFAULT_VIS })
    setTlVis({ ...DEFAULT_VIS })
    setActiveSite(site)
    window.currentSite = site
    flownSiteIdRef.current = null
    setActiveDiffId(null)
    fetchProjectDiffs(site.id)
      .then(entries => setDiffHistory(entries))
      .catch(e => console.warn('[loadSiteData] fetchProjectDiffs failed:', e.message))
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
    setApiStatus('')
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
    // If a run is in progress, don't clear it — let it finish in background
    // but stop showing the computing view
  }

  async function handleApiRun() {
    if (apiRunning) return
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

    apiDiffIdRef.current = null
    setApiRunning(true); setApiError(null); setApiSummary(null); setApiDiffTilesetUrl(null)
    try {
      const { getPolygonWkt } = await import('./cesium/polygonDraw')
      const areaWkt = getPolygonWkt?.() ?? undefined

      const result = await createAbDiffAndPoll(
        activeSite.id,
        apiDateIdA,
        apiDateIdB,
        {
          areaWkt,
          name: diffName || undefined,
          onStatus: setApiStatus,
          onDiffId: id => { apiDiffIdRef.current = id },
        },
      )

      setApiSummary(result.report)

      if (result.tilesetUrl) {
        setApiDiffTilesetUrl(result.tilesetUrl)
        await loadDiffApiTileset(result.tilesetUrl)
      }

      const diffId = apiDiffIdRef.current ?? result.id
      setActiveDiffId(diffId)
      try {
        const entries = await fetchProjectDiffs(activeSite.id)
        setDiffHistory(entries)
      } catch (e) {
        console.warn('[handleApiRun] fetchProjectDiffs refresh failed:', e.message)
      }
    } catch (e) {
      console.error('[handleApiRun] FAILED:', e.message, e)
      setApiError(e.message)
    } finally {
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

    clearAllSnapshotTilesets()
    setTlSnapshots(null)
    setTlRecomputeRunning(true)
    setTlRecomputeStatus('')
    setTlRecomputeDiffId(null)
    try {
      const diff = await createTimeSeriesDiffAndPoll(activeSite.id, {
        name: diffName || undefined,
        onStatus: msg => setTlRecomputeStatus(msg),
        onDiffId: id  => setTlRecomputeDiffId(id),
      })
      invalidateDiffCache(activeSite.id)

      const diffId = diff?.id ?? null
      setActiveDiffId(diffId)
      try {
        const entries = await fetchProjectDiffs(activeSite.id)
        setDiffHistory(entries)
      } catch (e) {
        console.warn('[handleTlRecompute] fetchProjectDiffs refresh failed:', e.message)
      }

      setTlSnapshots(null)
    } catch (e) {
      console.error('[handleTlRecompute] failed:', e.message)
      setTlRecomputeStatus(`오류: ${e.message}`)
    } finally {
      setTlRecomputeRunning(false)
      setTlRecomputeDiffId(null)
    }
  }, [activeSite, diffName])

  const handleTlCancelRecompute = useCallback(async () => {
    if (tlRecomputeDiffId) {
      try { await cancelDiff(tlRecomputeDiffId) } catch (_) {}
    }
    setTlRecomputeRunning(false)
    setTlRecomputeStatus('')
    setTlRecomputeDiffId(null)
  }, [tlRecomputeDiffId])

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
      setApiStatus('기록 불러오는 중…')
      setApiError(null)
      setApiSummary(null)
      try {
        const { report, tilesetUrl } = await fetchAbDiffResult(entry.diffId)
        setApiSummary(report)
        if (tilesetUrl) {
          setApiDiffTilesetUrl(tilesetUrl)
          try { await loadDiffApiTileset(tilesetUrl) } catch (e) { addToast(`Tileset 로드 실패: ${e.message}`, 'warn') }
        }
        setApiStatus('기록에서 불러옴')
        setActiveDiffId(entry.id)
      } catch (e) {
        setApiStatus('')
        addToast(`기록 불러오기 실패: ${e.message}`, 'warn')
      }
    }
  }

  async function handleDeleteDiff(diffId) {
    if (!activeSite) return
    try {
      await deleteDiff(diffId)
    } catch (e) {
      addToast(`Diff 삭제 실패: ${e.message}`, 'warn')
      return
    }
    if (String(activeDiffId) === String(diffId)) setActiveDiffId(null)
    try {
      const entries = await fetchProjectDiffs(activeSite.id)
      setDiffHistory(entries)
    } catch (e) {
      setDiffHistory(prev => prev.filter(e => String(e.id) !== String(diffId)))
    }
  }

  function handleCameraSite() {
    if (!activeSite) return
    flyTo(activeSite.centerLon, activeSite.centerLat - 0.009, activeSite.cameraHeight, -40)
  }
  function handleCameraTop() {
    if (!activeSite) return
    flyTo(activeSite.centerLon, activeSite.centerLat, activeSite.cameraHeight * 1.8, -90)
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
  const showRightPanel =
    (mode === 'compare-api' && (apiSummary != null || apiRunning)) ||
    (mode === 'timeline'    && tlSnapshots != null)

  // ── Timeline staleness / readiness checks ─────────────────────────────
  const tlMissingVoxels = (activeSite?.dates ?? [])
    .filter(d => d.voxelStatus !== 'SUCCEEDED')
    .map(d => d.label ?? d.id)

  const tlStaleInfo = (() => {
    const succeededDates = (activeSite?.dates ?? []).filter(d => d.voxelStatus === 'SUCCEEDED')
    if (!tlSnapshots?.length || succeededDates.length < 2) return { stale: false, addedLabels: [], removedLabels: [] }
    const snapshotObsIds = new Set()
    tlSnapshots.forEach(s => { snapshotObsIds.add(s.date_a.id); snapshotObsIds.add(s.date_b.id) })
    const currentObsIds = new Set(succeededDates.map(d => d.id))
    const addedLabels = succeededDates.filter(d => !snapshotObsIds.has(d.id)).map(d => d.label ?? d.name ?? d.id)
    const removedLabels = [...snapshotObsIds].filter(id => !currentObsIds.has(id)).map(id => {
      const found = activeSite?.dates.find(d => d.id === id)
      return found?.label ?? found?.name ?? id
    })
    let reordered = false
    if (addedLabels.length === 0 && removedLabels.length === 0) {
      const snapshotIdSequence = []
      tlSnapshots.forEach(s => {
        if (!snapshotIdSequence.includes(s.date_a.id)) snapshotIdSequence.push(s.date_a.id)
        if (!snapshotIdSequence.includes(s.date_b.id)) snapshotIdSequence.push(s.date_b.id)
      })
      const currentIdSequence = [...succeededDates]
        .sort((a, b) => (a.observedAt ?? '').localeCompare(b.observedAt ?? ''))
        .map(d => d.id)
      reordered = snapshotIdSequence.some((id, i) => id !== currentIdSequence[i])
    }
    const stale = addedLabels.length > 0 || removedLabels.length > 0 || reordered
    return { stale, addedLabels, removedLabels, reordered }
  })()

  const tlStale = tlStaleInfo.stale

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
            activeDiffId={activeDiffId}
            onLoadDiff={handleLoadDiff}
            onDeleteDiff={handleDeleteDiff}
            analysisView={analysisView}
            onNewComputation={handleNewComputation}
            onBackToHome={handleBackToHome}
            diffName={diffName}             onDiffName={setDiffName}
            apiDateIdA={apiDateIdA}         onApiDateIdA={setApiDateIdA}
            apiDateIdB={apiDateIdB}         onApiDateIdB={setApiDateIdB}
            apiRunning={apiRunning}         onApiRun={handleApiRun}
            onApiClear={handleApiClear}     onApiCancel={handleApiCancel}
            apiStatus={apiStatus}           apiError={apiError}
            drawInfo={drawInfo}             drawBtnLabel={drawBtnLabel} onDrawArea={togglePolygonDraw}
            tlRecomputeRunning={tlRecomputeRunning}
            onTlRecompute={handleTlRecompute}
            onTlCancelRecompute={handleTlCancelRecompute}
            tlRecomputeStatus={tlRecomputeStatus}
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
            tlStale={tlStale}
            tlStaleInfo={tlStaleInfo}
            tlMissingVoxels={tlMissingVoxels}
            apiRunning={apiRunning}
            apiSummary={apiSummary}
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
          />
        </>
      )}

      {showAnalysis && !activeSite && (
        <BottomBar statusMsg={statusMsg} statusDone={statusDone} mode="compare-api" />
      )}

      <Toasts items={toasts} />
    </>
  )
}