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
  cancelDiff,
  createTimeSeriesDiffAndPoll,
  cancelVoxelize,
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

  const activeDateRef     = useRef(null)
  const activeSiteRef     = useRef(null)
  const visibleIdsRef     = useRef(new Set())
  const modeRef           = useRef('compare-api')
  // Observation ids that are in the process of being deleted. pollVoxelStatus
  // checks this via shouldStop() before each fetch so it exits cleanly without
  // firing a GET that would 404 on the now-deleted observation.
  const deletingObsIdsRef = useRef(new Set())

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

  /**
   * Dates that must NOT be edited/deleted right now because a diff job is
   * actively using them. Editing or deleting an observation mid-diff would
   * leave the running diff referencing a date that's changing or gone.
   *
   * Unlike voxelization (which is safely cancellable), a running diff is
   * NOT auto-cancelled here — instead the edit/delete UI for the relevant
   * date(s) is disabled until the diff finishes or the user cancels it
   * themselves (via the existing "취소" button in the diff panel).
   *
   *   - A/B diff running  → only date A and date B are blocked.
   *   - Time-series running → ALL dates in the active site are blocked,
   *     since a time-series diff spans every consecutive pair.
   *
   * Returns a Map<dateId, reason-string-for-tooltip>.
   */
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
        } else if (site.dates.length > 0) {
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

  function handleOpenProject(site) {
    console.log('[handleOpenProject] site:', site.id, site.name, '— dates:', site.dates.length)
    clearAllLayers()
    clearPolygon()
    setMode('compare-api')
    setDrawInfo(DEFAULT_DRAW_INFO)
    setDrawBtnLabel(DEFAULT_DRAW_BTN)
    setDrawBanner(false)
    setVisibleDateIds(new Set())
    setActiveDate(null)
    setApiDateIdA(site.dates[0]?.id ?? '')
    setApiDateIdB(site.dates[1]?.id ?? site.dates[0]?.id ?? '')
    setApiSummary(null); setApiStatus(''); setApiError(null); setApiDiffTilesetUrl(null)
    setTlSnapshots(null); setTlActiveIndex(0); setTlPlaying(false)
    setCompareApiVis({ ...DEFAULT_VIS })
    setTlVis({ ...DEFAULT_VIS })
    setActiveSite(site)
    window.currentSite = site
    setNavTab('analysis')
    setDiffHistory(loadDiffHistory(site.id))
    setActiveDiffId(null)
    flyTo(site.centerLon, site.centerLat - 0.006, site.cameraHeight)
    // Use GET /api/jobs to discover all in-progress jobs at once, then
    // resume polling only for VOXEL_CREATE jobs that target this project's observations.
    // This is one request instead of N (one per observation with QUEUED/RUNNING status).
    fetchActiveJobs().then(activeJobs => {
      console.log('[handleOpenProject] active jobs:', activeJobs.map(j => `${j.id} ${j.jobType} targetId=${j.targetId} status=${j.status}`))
      const obsIds = new Set(site.dates.map(d => String(d.id)))
      activeJobs
        .filter(j => j.jobType === 'VOXEL_CREATE' && obsIds.has(String(j.targetId)))
        .forEach(j => {
          console.log('[handleOpenProject] resuming voxel poll for obsId:', j.targetId)
          resumeVoxelPoll(String(j.targetId), j.id)
        })
    }).catch(e => console.warn('[handleOpenProject] fetchActiveJobs failed:', e.message))
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
            loadDate(updatedSite, d, modeRef.current, {})
          }
        }

        // The backend auto-starts voxelization as soon as a dataset is
        // uploaded — but until now nothing in this live session noticed,
        // because resumeVoxelPoll was only ever kicked off from
        // handleOpenProject (on initial project open / page refresh).
        // Without this, a freshly uploaded date's voxel progress/status
        // would silently update on the server but never appear in the UI
        // until the user manually refreshed the browser.
        // Pick up any date that's QUEUED/RUNNING and not already being
        // tracked in voxelPollingIds, and start polling it now.
        updatedSite.dates
          .filter(d => (d.voxelStatus === 'QUEUED' || d.voxelStatus === 'RUNNING') && !voxelPollingIds.has(d.id))
          .forEach(d => {
            console.log('[handleDataChanged] detected new/unpolled voxel job — resuming poll for dateId:', d.id, 'voxelStatus:', d.voxelStatus)
            resumeVoxelPoll(d.id, d.voxelJobId)
          })
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

    console.log(`[handleModeChange] ${prevMode} → ${newMode}`)
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

  async function handleApiRun() {
    if (apiRunning) return
    if (!apiDateIdA || !apiDateIdB) { setApiError('두 날짜를 먼저 선택하세요'); return }
    if (apiDateIdA === apiDateIdB)  { setApiError('서로 다른 날짜를 선택하세요'); return }

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

      setApiSummary(result.report)

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

    if (activeSite.dates.length < 2) {
      addToast('시계열 분석을 실행하려면 최소 2개의 관측 데이터가 필요합니다', 'warn')
      return
    }

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

      setTlSnapshots(null)
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

  // ── Shared helper — patch one date inside sites + activeSite after voxel completes ─
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
    console.log('[resumeVoxelPoll] START dateId:', dateId, 'jobId:', jobId,
      'siteId:', activeSiteRef.current?.id)
    setVoxelPollingIds(prev => new Set([...prev, dateId]))
    try {
      // Check if already done before starting the poll loop.
      // pollVoxelStatus works without a jobId — we only need the observationId.
      if (!jobId) {
        const fresh = await fetchObservation(dateId)
        if (fresh.voxelStatus === 'SUCCEEDED') {
          console.log('[resumeVoxelPoll] already SUCCEEDED — patching state directly')
          _patchVoxelDate(activeSiteRef.current?.id, dateId, fresh)
          addToast(`✓ Voxel 완료: ${dateLabel}`, 'ok')
          setVoxelPollingIds(prev => { const s = new Set(prev); s.delete(dateId); return s })
          return
        }
        if (fresh.voxelStatus !== 'QUEUED' && fresh.voxelStatus !== 'RUNNING') {
          console.warn('[resumeVoxelPoll] unexpected voxelStatus:', fresh.voxelStatus, '— skipping poll')
          setVoxelPollingIds(prev => { const s = new Set(prev); s.delete(dateId); return s })
          return
        }
      }

      // Use pollVoxelStatus — lighter endpoint, no jobId needed after resolution.
      // shouldStop lets the loop exit cleanly before the next GET when the
      // observation is being deleted (handleCancelVoxelForDate marks the id).
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
      console.log('[resumeVoxelPoll] pollVoxelStatus DONE — status:', voxResult.voxelStatus)

      if (voxResult.voxelStatus === 'CANCELLED') {
        // Expected outcome when the user (or the date-edit/delete flow)
        // cancelled the job themselves — not a failure, so no error toast.
        console.log('[resumeVoxelPoll] cancelled by user — no error toast')
        setVoxelPollingIds(prev => { const s = new Set(prev); s.delete(dateId); return s })
        setStatusMsg(`Voxel 취소됨: ${dateLabel}`)
        setStatusDone(true)
        return
      }
      if (voxResult.voxelStatus !== 'SUCCEEDED') throw new Error(`Voxel ${voxResult.voxelStatus.toLowerCase()}`)

      const updatedDate = await fetchObservation(dateId)
      console.log('[resumeVoxelPoll] updatedDate — voxelStatus:', updatedDate?.voxelStatus)
      _patchVoxelDate(activeSiteRef.current?.id, dateId, updatedDate)
      setVoxelPollingIds(prev => { const s = new Set(prev); s.delete(dateId); return s })
      setStatusMsg(`Voxel 완료: ${dateLabel}`)
      setStatusDone(true)
      addToast(`✓ Voxel 생성 완료: ${dateLabel}`, 'ok')
    } catch (e) {
      setVoxelPollingIds(prev => { const s = new Set(prev); s.delete(dateId); return s })
      if (/not found/i.test(e.message)) {
        // The observation was deleted while this poll loop was still
        // in-flight (delete cancels the voxelizer but the next poll tick
        // can race ahead and hit a 404 before the loop notices). The date
        // is gone either way — not a real failure, so no error toast.
        console.log('[resumeVoxelPoll] observation deleted mid-poll — no error toast')
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
      console.log('[handleComputeVoxel] SUCCEEDED — voxelStatus:', updatedDate?.voxelStatus)
      _patchVoxelDate(siteId, dateId, updatedDate)
      setVoxelPollingIds(prev => { const s = new Set(prev); s.delete(dateId); return s })
      setStatusMsg(`Voxel 완료: ${dateLabel}`, true)
      setStatusDone(true)
      addToast(`✓ Voxel 생성 완료: ${dateLabel}`, 'ok')
    } catch (e) {
      setVoxelPollingIds(prev => { const s = new Set(prev); s.delete(dateId); return s })
      if (/^Voxelization cancelled/i.test(e.message)) {
        // Expected outcome when the user (or the date-edit/delete flow)
        // cancelled the job themselves — not a failure, so no error toast.
        console.log('[handleComputeVoxel] cancelled by user — no error toast')
        setStatusMsg(`Voxel 취소됨: ${dateLabel}`, true)
        setStatusDone(true)
        return
      }
      if (/not found/i.test(e.message)) {
        // The observation was deleted while this poll loop was still
        // in-flight (delete cancels the voxelizer but the next poll tick
        // can race ahead and hit a 404 before the loop notices). The date
        // is gone either way — this isn't a real failure, so no error toast.
        console.log('[handleComputeVoxel] observation deleted mid-poll — no error toast')
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

  /**
   * Cancel an in-progress voxelizer job for a date.
   * Unlike a running diff, voxelization is safe to auto-cancel: nothing else
   * depends on it yet, so the edit/delete UI calls this directly instead of
   * just blocking the buttons.
   */
  async function handleCancelVoxelForDate(dateId) {
    console.log('[handleCancelVoxelForDate] dateId:', dateId)
    // Mark the id before doing anything async. The pollVoxelStatus loop running
    // in resumeVoxelPoll checks this ref via shouldStop() before each fetch and
    // after each sleep, so it exits cleanly without firing a GET on a deleted
    // observation.
    //
    // IMPORTANT: do NOT clear this in a finally block here. The only caller of
    // this function is DateRow.handleDelete, which calls onCancelVoxel(id) and
    // then immediately calls deleteObservation(id) right after — so this id is
    // always headed for deletion. Meanwhile there may be a resumeVoxelPoll loop
    // for this exact id sleeping in pollVoxelStatus's 2s setTimeout *right now*
    // (e.g. the poll that was auto-started when the backend kicked off
    // voxelization on upload, before the user clicked delete). That loop only
    // checks shouldStop() twice per 2s cycle — once before the fetch, once
    // after the sleep. If we clear the ref here as soon as cancelVoxelize +
    // fetchObservation resolve (typically well under a second), the flag can
    // close before that other loop ever wakes up to see it, and it proceeds to
    // GET an observation that's about to be (or already) deleted, causing a
    // 404. Previously this is exactly what happened — verified via the 404
    // stack trace pointing at the resumeVoxelPoll call kicked off by
    // handleDataChanged on upload, not the delete flow itself.
    //
    // Leaving the id in the ref permanently is safe: ids are server-assigned
    // and never reused, deleteObservation makes the id gone for good, and any
    // future resumeVoxelPoll call for a *different* id is unaffected. We still
    // clear it in the few early-return/failure paths below where the
    // observation was NOT actually cancelled and might still be alive (so a
    // legitimate future poll for this id shouldn't be permanently blocked).
    deletingObsIdsRef.current.add(dateId)
    try {
      const status = await cancelVoxelize(dateId)
      console.log('[handleCancelVoxelForDate] cancelled — voxelStatus:', status.voxelStatus)
      setVoxelPollingIds(prev => { const s = new Set(prev); s.delete(dateId); return s })
      const updatedDate = await fetchObservation(dateId)
      if (activeSite) _patchVoxelDate(activeSite.id, dateId, updatedDate)
      addToast('Voxel 작업이 취소되었습니다', 'ok')
      // NOTE: deliberately not clearing deletingObsIdsRef here — see comment above.
    } catch (e) {
      console.error('[handleCancelVoxelForDate] FAILED:', e.message, e)
      addToast(`Voxel 취소 실패: ${e.message}`, 'warn')
      // The cancel itself failed, so the observation is presumably still
      // alive and still voxelizing — don't leave it permanently blocked from
      // being polled again.
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
      } else if (entry.type === 'AB') {
        handleApiClear()
      }
      setActiveDiffId(null)
      return
    }

    if (entry.type === 'TIME_SERIES') {
      if (!entry.diffId) {
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
  const tlMissingVoxels = (activeSite?.dates ?? [])
    .filter(d => d.voxelStatus !== 'SUCCEEDED')
    .map(d => d.label ?? d.id)

  const tlStaleInfo = (() => {
    const succeededDates = (activeSite?.dates ?? []).filter(d => d.voxelStatus === 'SUCCEEDED')

    if (!tlSnapshots?.length || succeededDates.length < 2) {
      return { stale: false, addedLabels: [], removedLabels: [] }
    }

    const snapshotObsIds = new Set()
    tlSnapshots.forEach(s => {
      snapshotObsIds.add(s.date_a.id)
      snapshotObsIds.add(s.date_b.id)
    })

    const currentObsIds = new Set(succeededDates.map(d => d.id))

    const addedLabels = succeededDates
      .filter(d => !snapshotObsIds.has(d.id))
      .map(d => d.label ?? d.name ?? d.id)

    const removedLabels = [...snapshotObsIds]
      .filter(id => !currentObsIds.has(id))
      .map(id => {
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
      if (reordered) console.log(
        '[tlStaleInfo] reorder detected — snapshot order:', snapshotIdSequence,
        'current order:', currentIdSequence
      )
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
            blockedDateInfo={blockedDateInfo}
            voxelPollingIds={voxelPollingIds}
            onCancelVoxel={handleCancelVoxelForDate}
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
            drawInfo={drawInfo}             drawBtnLabel={drawBtnLabel} onDrawArea={togglePolygonDraw}
            showAdded={activeVis.added}           onShowAdded={activeVisSetters.onShowAdded}
            showRemoved={activeVis.removed}       onShowRemoved={activeVisSetters.onShowRemoved}
            showUnchanged={activeVis.unchanged}   onShowUnchanged={activeVisSetters.onShowUnchanged}
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
        <BottomBar statusMsg={statusMsg} statusDone={statusDone} mode="compare-api" />
      )}

      <Toasts items={toasts} />
    </>
  )
}