/**
 * App.jsx — root React component
 *
 * Navigation model:
 *   navTab === 'projects'  → ProjectLauncher overlay (full screen)
 *   navTab === 'upload'    → DataUploadPage overlay  (full screen)
 *   navTab === 'analysis'  → Cesium viewer + Panel
 *
 * Mesh Z offset is read from DB on site load and applied silently —
 * no UI control.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { CONFIG } from './config'
import { initViewer, flyTo, setTerrainVisible } from './cesium/cesiumInit'
import { loadDate, syncVisibility, clearLayers, clearCompareLayers,
         applyPcStyle, setDateATint, setDateBTint,
         renderVoxelDiff, invalidateTilesetUrl } from './cesium/layers'
import { runVoxelDiff, reapplyDiffFilter, cancelVoxelDiff } from './diff'
import { setDrawCallbacks, togglePolygonDraw, clearPolygon } from './cesium/polygonDraw'
import { loadDiffSnapshots, snapshotToRenderVoxels } from './timelineDiffs'

import NavBar          from './components/NavBar'
import Panel           from './components/Panel'
import DrawBanner      from './components/DrawBanner'
import StatusBar       from './components/StatusBar'
import Toasts          from './components/Toasts'
import ProjectLauncher from './components/ProjectLauncher'
import NewProjectModal from './components/NewProjectModal'
import DataUploadPage  from './components/DataUploadPage'
import TimelineBar     from './components/TimelineBar'

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000'

export default function App() {
  // Navigation: 'projects' | 'upload' | 'analysis'
  const [navTab,        setNavTab]        = useState('projects')
  const [launcherReady, setLauncherReady] = useState(false)
  const [showNewProject, setShowNewProject] = useState(false)

  const [activeSite, setActiveSite] = useState(null)
  const [activeDate, setActiveDate] = useState(null)
  const [sites,      setSites]      = useState([])
  const [mode,       setMode]       = useState('view')

  // const [showMesh,    setShowMesh]    = useState(CONFIG.DEFAULTS.SHOW_MESH)
  // const [showPc,      setShowPc]      = useState(CONFIG.DEFAULTS.SHOW_PC)
  const [showDataset, setShowDataset] = useState(CONFIG.DEFAULTS.SHOW_DATASET)
  const [showTerrain, setShowTerrain] = useState(CONFIG.TERRAIN.ENABLED)
  const [showDateA,   setShowDateA]   = useState(true)
  const [showDateB,   setShowDateB]   = useState(true)
  const [showAdded,   setShowAdded]   = useState(CONFIG.DEFAULTS.SHOW_ADDED)
  const [showRemoved, setShowRemoved] = useState(CONFIG.DEFAULTS.SHOW_REMOVED)

  const [colorA, setColorA] = useState('#d49050')
  const [alphaA, setAlphaA] = useState(0.9)
  const [colorB, setColorB] = useState('#4d9fff')
  const [alphaB, setAlphaB] = useState(0.9)

  const [compareIdA, setCompareIdA] = useState('')
  const [compareIdB, setCompareIdB] = useState('')
  const [pcSize, setPcSize]         = useState(CONFIG.DEFAULTS.POINT_SIZE)
  const [voxelSize, setVoxelSize]   = useState(CONFIG.DEFAULTS.VOXEL_SIZE)

  const [statusMsg,  setStatusMsg]  = useState('Initialising viewer…')
  const [statusDone, setStatusDone] = useState(false)
  const [toasts,     setToasts]     = useState([])

  const [drawBanner,   setDrawBanner]   = useState(false)
  const [drawInfo,     setDrawInfo]     = useState('No area selected — diff runs on full extent')
  const [drawBtnLabel, setDrawBtnLabel] = useState('✏ Draw Area')

  const [diffStatus,  setDiffStatus]  = useState({ state: '', msg: '' })
  const [diffRunning, setDiffRunning] = useState(false)
  const [stats,       setStats]       = useState(null)
  const [coords,      setCoords]      = useState({ lat: '—', lon: '—', height: '—' })

  const [tlSnapshots,   setTlSnapshots]   = useState(null)
  const [tlActiveIndex, setTlActiveIndex] = useState(0)
  const [tlLoading,     setTlLoading]     = useState(false)
  const [tlPlaying,     setTlPlaying]     = useState(false)
  const tlPlayTimer = useRef(null)
  const viewerReady = useRef(false)

  useEffect(() => {
    if (tlPlayTimer.current) clearInterval(tlPlayTimer.current)
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

  const checkboxState = useCallback(() => ({
    dataset: showDataset, dateA: showDateA, dateB: showDateB,
    added: showAdded, removed: showRemoved, terrain: showTerrain,
  }), [showDataset, showDateA, showDateB, showAdded, showRemoved, showTerrain])

  const addToast = useCallback((msg, type = 'ok') => {
    const id = Date.now() + Math.random()
    setToasts(prev => [...prev, { id, msg, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000)
  }, [])

  const refreshSites = useCallback(async () => {
    try {
      const res  = await fetch(`${API_BASE}/api/sites`)
      const data = await res.json()
      return data.sites || []
    } catch (e) { console.error('[refreshSites]', e); return [] }
  }, [])

  useEffect(() => {
    async function setup() {
      setDrawCallbacks(
        (v) => setDrawBanner(v),
        (i) => setDrawInfo(i),
        (l) => setDrawBtnLabel(l),
      )
      await initViewer({
        onReady:  () => { viewerReady.current = true },
        onStatus: (msg, done) => { setStatusMsg(msg); setStatusDone(!!done) },
        onToast:  addToast,
        onCoords: setCoords,
      })
      const loadedSites = await refreshSites()
      setSites(loadedSites)
      setLauncherReady(true)
      if (!loadedSites.length) return

      // const first     = loadedSites[0]
      // const firstDate = first.dates[0] ?? null
      // setActiveSite(first)
      // setActiveDate(firstDate)
      // setCompareIdA(firstDate?.id || '')
      // setCompareIdB(first.dates?.[1]?.id || firstDate?.id || '')
      // window.currentSite = first
      // Always start on the projects tab so the user sees the launcher.
      // Auto-loading happens only after they explicitly open a project.
    }
    setup()
  }, [addToast, refreshSites])

  useEffect(() => {
    if (mode !== 'timeline' || !activeSite || tlSnapshots !== null) return
    setTlLoading(true)
    loadDiffSnapshots(activeSite)
      .then(snaps => {
        setTlSnapshots(snaps); setTlActiveIndex(0)
        if (snaps.length > 0) renderTimelineSnapshot(snaps, 0, showAdded, showRemoved)
      })
      .finally(() => setTlLoading(false))
  }, [mode, activeSite, tlSnapshots, showAdded, showRemoved])

  function renderTimelineSnapshot(snaps, idx, addedV, removedV) {
    const snap = snaps?.[idx]; if (!snap) return
    window.diffState = window.diffState ?? {}
    window.diffState.gridDef = { lonStep: snap.grid_def.lon_step, latStep: snap.grid_def.lat_step, hStep: snap.grid_def.h_step }
    renderVoxelDiff(snapshotToRenderVoxels(snap, addedV, removedV), snap.vox_size)
  }

  useEffect(() => {
    if (mode !== 'timeline' || !tlSnapshots?.length) return
    renderTimelineSnapshot(tlSnapshots, tlActiveIndex, showAdded, showRemoved)
  }, [tlActiveIndex, mode, tlSnapshots, showAdded, showRemoved])

  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return
      if (navTab !== 'analysis') return
      if (e.key === 'm') setShowDataset(v => !v)
      if (e.key === 'a') setShowAdded(v => !v)
      if (e.key === 'r') setShowRemoved(v => !v)
      if (e.key === 'd' && mode === 'compare') togglePolygonDraw()
      if (mode === 'timeline') {
        if (e.key === 'ArrowLeft')  setTlActiveIndex(i => Math.max(0, i - 1))
        if (e.key === 'ArrowRight') setTlActiveIndex(i => Math.min((tlSnapshots?.length ?? 1) - 1, i + 1))
        if (e.key === ' ') { e.preventDefault(); setTlPlaying(v => !v) }
      }
      if (e.key === 'v') handleModeChange('view')
      if (e.key === 'c') handleModeChange('compare')
      if (e.key === '1') handleCameraSite()
      if (e.key === '2') handleCameraTop()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, activeSite, navTab])

  useEffect(() => {
    if (!viewerReady.current) return
    syncVisibility(mode, { dataset: showDataset, dateA: showDateA, dateB: showDateB, terrain: showTerrain })
  }, [mode, showDataset, showDateA, showDateB, showTerrain])

  useEffect(() => {
    if (mode === 'timeline' && tlSnapshots?.length)
      renderTimelineSnapshot(tlSnapshots, tlActiveIndex, showAdded, showRemoved)
    else
      reapplyDiffFilter(showAdded, showRemoved)
  }, [showAdded, showRemoved, mode, tlSnapshots, tlActiveIndex])

  useEffect(() => { setDateATint(colorA, alphaA) }, [colorA, alphaA])
  useEffect(() => { setDateBTint(colorB, alphaB) }, [colorB, alphaB])
  useEffect(() => { applyPcStyle(pcSize) }, [pcSize])
  useEffect(() => { setTerrainVisible(showTerrain) }, [showTerrain])

  // ── Event handlers ────────────────────────────────────────────────────

  function handleOpenProject(site) {
    const isSame = site.id === activeSite?.id
    if (isSame && navTab === 'analysis') return
    const firstDate = site.dates[0] || null
    if (diffRunning) { cancelVoxelDiff(); setDiffRunning(false) }
    clearLayers()
    if (window.diffState) { window.diffState.voxels = []; window.diffState.gridDef = null }
    clearPolygon()
    setMode('view'); setStats(null); setDiffStatus({ state: '', msg: '' })
    setDrawInfo('No area selected — diff runs on full extent')
    setDrawBtnLabel('✏ Draw Area')
    setCompareIdA(site.dates[0]?.id || '')
    setCompareIdB(site.dates[1]?.id || site.dates[0]?.id || '')
    setTlSnapshots(null); setTlActiveIndex(0); setTlPlaying(false)
    setActiveSite(site); setActiveDate(firstDate)
    window.currentSite = site
    setNavTab('analysis')
    if (firstDate) {
      setTimeout(() => {
        loadDate(site, firstDate, 'view', { dataset: showDataset })
        flyTo(site.camera.lon, site.camera.lat - 0.006, site.camera.height)
      }, 0)
    }
  }

  async function handleProjectCreated(newSite) {
    setShowNewProject(false)
    const updated = await refreshSites()
    setSites(updated)
    addToast(`Project "${newSite.label}" created`, 'ok')
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

        const updatedDate = updatedSite.dates.find(d => d.id === activeDate?.id)

        // Always sync activeDate so Panel badge reflects new datasetType immediately
        if (updatedDate) setActiveDate(updatedDate)

        if (updatedDate && navTab === 'upload') {
          // Invalidate Cesium's URL cache so it fetches fresh data, not the
          // old tileset that was served from the same path before re-upload.
          if (updatedDate.datasetPath) invalidateTilesetUrl(updatedDate.datasetPath)
          clearLayers()
          loadDate(updatedSite, updatedDate, mode, { dataset: showDataset })
        }
      }
    }
    addToast('데이터가 업데이트되었습니다', 'ok')
  }

  function handleDateChange(d) {
    if (mode === 'compare') return
    if (d.id === activeDate?.id) return
    setActiveDate(d)
    loadDate(activeSite, d, mode, { dataset: showDataset })
  }

  function handleModeChange(newMode) {setMode(newMode)}

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
        checkboxState(),
        (st, msg) => setDiffStatus({ state: st, msg }),
        (s) => setStats(s),
      )
    } finally { setDiffRunning(false) }
  }

  function handleClearDiff() {
    if (diffRunning) { cancelVoxelDiff(); setDiffRunning(false) }
    clearCompareLayers(); setStats(null)
    setDiffStatus({ state: '', msg: '' })
    setDrawInfo('No area selected — diff runs on full extent')
  }

  function handleCameraSite() { flyTo(activeSite.camera.lon, activeSite.camera.lat - 0.006, activeSite.camera.height, -40) }
  function handleCameraTop()  { flyTo(activeSite.camera.lon, activeSite.camera.lat, activeSite.camera.height * 1.2, -90) }

  function handleNavTab(tab) {
    if ((tab === 'upload' || tab === 'analysis') && !activeSite) return
    setNavTab(tab)
  }

  const showAnalysis = navTab === 'analysis'

  return (
    <>
      <div id="cesiumContainer" className={`${mode === 'timeline' ? 'tl-mode' : ''}${showAnalysis ? '' : ' cesium-hidden'}`} />

      <NavBar tab={navTab} onTab={handleNavTab} activeSite={activeSite} coords={showAnalysis ? coords : null} />

      {navTab === 'projects' && (
        <div className="tab-overlay">
          <ProjectLauncher
            sites={sites}
            loading={!launcherReady}
            onSelect={handleOpenProject}
            onNewProject={() => setShowNewProject(true)}
          />
        </div>
      )}

      {navTab === 'upload' && activeSite && (
        <div className="tab-overlay">
          <DataUploadPage site={activeSite} onUploaded={handleDataChanged} onCreated={handleDataChanged} />
        </div>
      )}

      <NewProjectModal open={showNewProject} onClose={() => setShowNewProject(false)} onCreated={handleProjectCreated} />

      {showAnalysis && (
        <>
          <DrawBanner visible={drawBanner} onCancel={togglePolygonDraw} />
          {activeSite && (
            <Panel
              mode={mode}             onModeChange={handleModeChange}
              activeSite={activeSite} activeDate={activeDate}   onDateChange={handleDateChange}
              pcSize={pcSize}         onPcSize={setPcSize}
              showDataset={showDataset} onShowDataset={setShowDataset}
              showTerrain={showTerrain} onShowTerrain={setShowTerrain}
              compareIdA={compareIdA} onCompareIdA={setCompareIdA}
              compareIdB={compareIdB} onCompareIdB={setCompareIdB}
              showDateA={showDateA}   onShowDateA={setShowDateA}
              showDateB={showDateB}   onShowDateB={setShowDateB}
              colorA={colorA}         onColorA={setColorA}
              alphaA={alphaA}         onAlphaA={setAlphaA}
              colorB={colorB}         onColorB={setColorB}
              alphaB={alphaB}         onAlphaB={setAlphaB}
              showAdded={showAdded}     onShowAdded={setShowAdded}
              showRemoved={showRemoved} onShowRemoved={setShowRemoved}
              voxelSize={voxelSize}     onVoxelSize={setVoxelSize}
              drawInfo={drawInfo}       drawBtnLabel={drawBtnLabel} onDrawArea={togglePolygonDraw}
              diffRunning={diffRunning} onRunDiff={handleRunDiff}   onClearDiff={handleClearDiff}
              diffStatus={diffStatus}   stats={stats}
              onCameraSite={handleCameraSite} onCameraTop={handleCameraTop}
              tlSnapshots={tlSnapshots}       tlActiveIndex={tlActiveIndex}
              tlOnSelect={i => setTlActiveIndex(i)}
              tlPlaying={tlPlaying}           tlOnPlayPause={() => setTlPlaying(v => !v)}
              tlLoading={tlLoading}           tlOnRecompute={() => setTlSnapshots(null)}
            />
          )}
          {mode === 'timeline' && tlSnapshots?.length > 0
            ? <TimelineBar snapshots={tlSnapshots} activeIndex={tlActiveIndex} onSelect={i => setTlActiveIndex(i)} playing={tlPlaying} onPlayPause={() => setTlPlaying(v => !v)} />
            : <StatusBar msg={statusMsg} done={statusDone} />
          }
        </>
      )}

      <Toasts items={toasts} />
    </>
  )
}