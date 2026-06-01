/**
 * App.jsx — root React component
 *
 * Holds all UI state and wires it to the imperative Cesium layer.
 *
 * Pattern:
 *   React state change → re-renders panel UI
 *                      → calls imperative function (loadDate, syncVisibility…)
 *                      → Cesium scene updates
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { CONFIG } from './config'
import { initViewer, flyTo, setTerrainVisible } from './cesium/cesiumInit'
import { loadDate, syncVisibility, clearLayers, clearCompareLayers, applyPcStyle, setDateATint, setDateBTint, applyMeshZOffset } from './cesium/layers'
import { runVoxelDiff, reapplyDiffFilter, cancelVoxelDiff } from './diff'
import { setDrawCallbacks, togglePolygonDraw, clearPolygon } from './cesium/polygonDraw'

import TopBar          from './components/TopBar'
import Panel           from './components/Panel'
import DrawBanner      from './components/DrawBanner'
import StatusBar       from './components/StatusBar'
import Toasts          from './components/Toasts'
import ProjectLauncher from './components/ProjectLauncher'
import ProjectDrawer   from './components/ProjectDrawer'
import NewProjectModal from './components/NewProjectModal'
import AddDateModal    from './components/AddDateModal'
import UploadModal     from './components/UploadModal'

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://127.0.0.1:8000'

// ═════════════════════════════════════════════════════════════════════════

export default function App() {
  // ── Project launcher / drawer ─────────────────────────────────────────
  const [showLauncher,  setShowLauncher]  = useState(true)
  const [launcherReady, setLauncherReady] = useState(false)
  const [drawerOpen,    setDrawerOpen]    = useState(false)

  // ── Modal state ───────────────────────────────────────────────────────
  const [showNewProject, setShowNewProject] = useState(false)
  const [addDateSite,    setAddDateSite]    = useState(null)   // site to add a date to
  const [uploadState,    setUploadState]    = useState(null)   // { site, date, type }

  // ── Site / date ──────────────────────────────────────────────────────
  const [activeSite, setActiveSite] = useState(null)
  const [activeDate, setActiveDate] = useState(null)
  const [sites,      setSites]      = useState([])
  const [mode,       setMode]       = useState('view')

  // ── Layer visibility toggles ─────────────────────────────────────────
  const [showMesh,    setShowMesh]    = useState(CONFIG.DEFAULTS.SHOW_MESH)
  const [showPc,      setShowPc]      = useState(CONFIG.DEFAULTS.SHOW_PC)
  const [showTerrain, setShowTerrain] = useState(CONFIG.TERRAIN.ENABLED)
  const [showDateA,   setShowDateA]   = useState(true)
  const [showDateB,   setShowDateB]   = useState(true)
  const [showAdded,   setShowAdded]   = useState(CONFIG.DEFAULTS.SHOW_ADDED)
  const [showRemoved, setShowRemoved] = useState(CONFIG.DEFAULTS.SHOW_REMOVED)

  // ── Tint controls ────────────────────────────────────────────────────
  const [colorA, setColorA] = useState('#d49050')
  const [alphaA, setAlphaA] = useState(0.9)
  const [colorB, setColorB] = useState('#4d9fff')
  const [alphaB, setAlphaB] = useState(0.9)

  // ── Compare selects ──────────────────────────────────────────────────
  const [compareIdA, setCompareIdA] = useState('')
  const [compareIdB, setCompareIdB] = useState('')

  // ── Point cloud size ─────────────────────────────────────────────────
  const [pcSize, setPcSize] = useState(CONFIG.DEFAULTS.POINT_SIZE)

  // ── Voxel size input ─────────────────────────────────────────────────
  const [voxelSize, setVoxelSize] = useState(CONFIG.DEFAULTS.VOXEL_SIZE)

  // ── Status bar ───────────────────────────────────────────────────────
  const [statusMsg,  setStatusMsg]  = useState('Initialising viewer…')
  const [statusDone, setStatusDone] = useState(false)

  // ── Toasts ───────────────────────────────────────────────────────────
  const [toasts, setToasts] = useState([])

  // ── Draw banner + button label ────────────────────────────────────────
  const [drawBanner,   setDrawBanner]   = useState(false)
  const [drawInfo,     setDrawInfo]     = useState('No area selected — diff runs on full extent')
  const [drawBtnLabel, setDrawBtnLabel] = useState('✏ Draw Area')

  // ── Diff ─────────────────────────────────────────────────────────────
  const [diffStatus,  setDiffStatus]  = useState({ state: '', msg: '' })
  const [diffRunning, setDiffRunning] = useState(false)
  const [stats,       setStats]       = useState(null)

  // ── Coordinates ──────────────────────────────────────────────────────
  const [coords, setCoords] = useState({ lat: '—', lon: '—', height: '—' })

  const [meshZOffset, setMeshZOffset] = useState(CONFIG.DEFAULTS.MESH_Z_OFFSET)

  const viewerReady = useRef(false)

  // ── Build checkbox state object ───────────────────────────────────────
  const checkboxState = useCallback(() => ({
    mesh:    showMesh,
    pc:      showPc,
    dateA:   showDateA,
    dateB:   showDateB,
    added:   showAdded,
    removed: showRemoved,
    terrain: showTerrain,
  }), [showMesh, showPc, showDateA, showDateB, showAdded, showRemoved, showTerrain])

  // ── Toasts helper ────────────────────────────────────────────────────
  const addToast = useCallback((msg, type = 'ok') => {
    const id = Date.now() + Math.random()
    setToasts(prev => [...prev, { id, msg, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000)
  }, [])

  // ── Fetch sites from backend ─────────────────────────────────────────
  const refreshSites = useCallback(async () => {
    try {
      const res  = await fetch(`${API_BASE}/api/sites`)
      const data = await res.json()
      return data.sites || []
    } catch (e) {
      console.error('[refreshSites]', e)
      return []
    }
  }, [])

  useEffect(() => {
    async function setup() {
      setDrawCallbacks(
        (visible) => setDrawBanner(visible),
        (info)    => setDrawInfo(info),
        (label)   => setDrawBtnLabel(label),
      )
      await initViewer({
        onReady:  () => { viewerReady.current = true },
        onStatus: (msg, done) => {
          setStatusMsg(msg)
          setStatusDone(!!done)
        },
        onToast:  addToast,
        onCoords: setCoords,
      })

      const loadedSites = await refreshSites()
      setSites(loadedSites)
      setLauncherReady(true)

      if (loadedSites.length === 0) return

      const first     = loadedSites[0]
      const firstDate = first.dates[0] ?? null

      setActiveSite(first)
      setActiveDate(firstDate)
      setMeshZOffset(first.meshZOffset ?? CONFIG.DEFAULTS.MESH_Z_OFFSET)
      setCompareIdA(firstDate?.id || '')
      setCompareIdB(first.dates?.[1]?.id || firstDate?.id || '')
      window.currentSite = first

      // Skip launcher when there is only one site
      if (loadedSites.length === 1) {
        setShowLauncher(false)
        if (firstDate) {
          loadDate(first, firstDate, 'view', { mesh: CONFIG.DEFAULTS.SHOW_MESH, pc: CONFIG.DEFAULTS.SHOW_PC })
          flyTo(first.camera.lon, first.camera.lat, first.camera.height)
        }
      }
    }
    setup()
  }, [addToast, refreshSites])

  // ── Keyboard shortcuts ────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return
      if (e.key === 'm') setShowMesh(v => !v)
      if (e.key === 'p') setShowPc(v => !v)
      if (e.key === 'a') setShowAdded(v => !v)
      if (e.key === 'r') setShowRemoved(v => !v)
      if (e.key === 'd' && mode === 'compare') togglePolygonDraw()
      if (e.key === 'v') handleModeChange('view')
      if (e.key === 'c') handleModeChange('compare')
      if (e.key === '1') handleCameraSite()
      if (e.key === '2') handleCameraTop()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, activeSite])

  // ── Sync Cesium visibility ────────────────────────────────────────────
  useEffect(() => {
    if (!viewerReady.current) return
    syncVisibility(mode, {
      mesh:  showMesh,
      pc:    showPc,
      dateA: showDateA,
      dateB: showDateB,
      terrain: showTerrain,
    })
  }, [mode, showMesh, showPc, showDateA, showDateB, showTerrain])

  useEffect(() => { reapplyDiffFilter(showAdded, showRemoved) }, [showAdded, showRemoved])
  useEffect(() => { setDateATint(colorA, alphaA) }, [colorA, alphaA])

  // ── Tint B ────────────────────────────────────────────────────────────
  useEffect(() => { setDateBTint(colorB, alphaB) }, [colorB, alphaB])
  useEffect(() => { applyPcStyle(pcSize) }, [pcSize])
  useEffect(() => { applyMeshZOffset(meshZOffset) }, [meshZOffset])
  useEffect(() => { setTerrainVisible(showTerrain) }, [showTerrain])

  // ════════════════════════════════════════════════════════════════════
  //  EVENT HANDLERS
  // ════════════════════════════════════════════════════════════════════

  // ── Open a project (from launcher card or drawer row) ────────────────
  function handleOpenProject(site) {
    const isSame = site.id === activeSite?.id
    setShowLauncher(false)
    setDrawerOpen(false)
    if (isSame && !showLauncher) return

    const firstDate = site.dates[0] || null

    // ── 1. Cancel any running diff ────────────────────────────────────────
    if (diffRunning) {
      cancelVoxelDiff()
      setDiffRunning(false)
    }

    // ── 2. Clear Cesium scene ─────────────────────────────────────────────
    clearLayers()
    if (window.diffState) {
      window.diffState.voxels  = []
      window.diffState.gridDef = null
    }

    // ── 3. Clear drawn polygon ────────────────────────────────────────────
    clearPolygon()

    // ── 4. Reset React UI state ───────────────────────────────────────────
    setMode('view')
    setStats(null)
    setDiffStatus({ state: '', msg: '' })
    setDrawInfo('No area selected — diff runs on full extent')
    setDrawBtnLabel('✏ Draw Area')
    setCompareIdA(site.dates[0]?.id || '')
    setCompareIdB(site.dates[1]?.id || site.dates[0]?.id || '')
    setActiveSite(site)
    setActiveDate(firstDate)
    window.currentSite = site

    setMeshZOffset(site.meshZOffset ?? CONFIG.DEFAULTS.MESH_Z_OFFSET)

    // ── 5. Load first date + fly ──────────────────────────────────────────
    // Deferred one tick so the React state flush and clearLayers complete
    // before we start adding new primitives to the scene.
    if (firstDate) {
      setTimeout(() => {
        loadDate(site, firstDate, 'view', { mesh: showMesh, pc: showPc })
        flyTo(site.camera.lon, site.camera.lat - 0.006, site.camera.height)
      }, 0)
    }
  }

  // ── New project modal ────────────────────────────────────────────────
  function handleNewProject() {
    setDrawerOpen(false)
    setShowNewProject(true)
  }

  async function handleProjectCreated(newSite) {
    setShowNewProject(false)
    const updated = await refreshSites()
    setSites(updated)
    addToast(`Project "${newSite.label}" created`, 'ok')
    // Auto-open new project
    const full = updated.find(s => s.id === newSite.id)
    if (full) handleOpenProject(full)
  }

  // ── Add date modal ───────────────────────────────────────────────────
  function handleAddDate(site) {
    setAddDateSite(site)
  }

  async function handleDateCreated(newDate) {
    const site = addDateSite
    setAddDateSite(null)
    const updated = await refreshSites()
    setSites(updated)

    // If the site is currently active, update activeSite too
    if (activeSite && activeSite.id === site.id) {
      const updatedSite = updated.find(s => s.id === site.id)
      if (updatedSite) setActiveSite(updatedSite)
    }
    addToast(`Date "${newDate.label}" added to ${site.label ?? site.id}`, 'ok')
  }

  // ── Upload modal ─────────────────────────────────────────────────────
  function handleUpload(site, date, type) {
    setUploadState({ site, date, type })
  }

  async function handleUploaded() {
    const { site, type } = uploadState
    setUploadState(null)
    const updated = await refreshSites()
    setSites(updated)

    // Update activeSite if it's the one we just uploaded to
    if (activeSite && activeSite.id === site.id) {
      const updatedSite = updated.find(s => s.id === site.id)
      if (updatedSite) {
        setActiveSite(updatedSite)
        window.currentSite = updatedSite
      }
    }
    const label = type === 'mesh' ? 'Mesh' : 'Point cloud'
    addToast(`${label} uploaded successfully`, 'ok')
  }

  function handleDateChange(d) {
    if (mode === 'compare') return
    if (d.id === activeDate?.id) return
    setActiveDate(d)
    loadDate(activeSite, d, mode, { mesh: showMesh, pc: showPc })
  }

  function handleModeChange(newMode) {
    setMode(newMode)
  }

  async function handleRunDiff() {
    if (diffRunning) return
    const dA = activeSite.dates.find(d => d.id === compareIdA)
    const dB = activeSite.dates.find(d => d.id === compareIdB)

    if (!compareIdA || !compareIdB) { addToast('Select both dates first', 'warn'); return }
    if (compareIdA === compareIdB)  { addToast('Select two different dates', 'warn'); return }
    if (!dA || !dB)                 { addToast('Date not found in config', 'warn'); return }

    setDiffRunning(true)
    try {
      await runVoxelDiff(
        activeSite, dA, dB, mode,
        voxelSize,
        { hex: colorA, alpha: alphaA },
        { hex: colorB, alpha: alphaB },
        checkboxState(),
        (st, msg) => setDiffStatus({ state: st, msg }),
        (s)       => setStats(s),
      )
    } finally {
      setDiffRunning(false)
    }
  }

  function handleClearDiff() {
    // If a diff is currently computing, cancel it first
    if (diffRunning) {
      cancelVoxelDiff()
      setDiffRunning(false)
    }
    clearCompareLayers()
    setStats(null)
    setDiffStatus({ state: '', msg: '' })
    setDrawInfo('No area selected — diff runs on full extent')
  }

  async function handleSaveMeshZOffset() {
    if (!activeSite) return
    try {
      const res = await fetch(
        `${API_BASE}/api/sites/${activeSite.id}/z-offset`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mesh_z_offset: meshZOffset }),
        }
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      setActiveSite(prev => ({ ...prev, meshZOffset }))
      setSites(prev => prev.map(s => s.id === activeSite.id ? { ...s, meshZOffset } : s))
      addToast('Mesh Z offset saved', 'ok')
    } catch (err) {
      console.error(err)
      addToast('Failed to save mesh Z offset', 'warn')
    }
  }

  function handleCameraSite() {
    flyTo(activeSite.camera.lon, activeSite.camera.lat - 0.006, activeSite.camera.height, -40)
  }
  function handleCameraTop() {
    flyTo(activeSite.camera.lon, activeSite.camera.lat, activeSite.camera.height * 1.2, -90)
  }

  // ═══════════════════════════════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════════════════════════════

  return (
    <>
      <div id="cesiumContainer" />

      {showLauncher && (
        <ProjectLauncher
          sites={sites}
          loading={!launcherReady}
          onSelect={handleOpenProject}
          onNewProject={handleNewProject}
        />
      )}

      <ProjectDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        sites={sites}
        activeSite={activeSite}
        onSelectSite={handleOpenProject}
        onNewProject={handleNewProject}
        onAddDate={handleAddDate}
        onUpload={handleUpload}
      />

      {/* ── Modals ── */}
      <NewProjectModal
        open={showNewProject}
        onClose={() => setShowNewProject(false)}
        onCreated={handleProjectCreated}
      />

      <AddDateModal
        open={!!addDateSite}
        site={addDateSite}
        onClose={() => setAddDateSite(null)}
        onCreated={handleDateCreated}
      />

      <UploadModal
        open={!!uploadState}
        site={uploadState?.site}
        date={uploadState?.date}
        type={uploadState?.type}
        onClose={() => setUploadState(null)}
        onUploaded={handleUploaded}
      />

      <DrawBanner visible={drawBanner} onCancel={togglePolygonDraw} />

      <TopBar
        activeSite={activeSite}
        coords={coords}
        onLogoClick={() => setDrawerOpen(v => !v)}
      />

    {activeSite && (
      <Panel
        // mode
        mode={mode}
        onModeChange={handleModeChange}
        // dates
        activeSite={activeSite}
        activeDate={activeDate}
        onDateChange={handleDateChange}
        // layer toggles
        showMesh={showMesh}    onShowMesh={setShowMesh}
        showPc={showPc}        onShowPc={setShowPc}
        pcSize={pcSize}        onPcSize={setPcSize}

        meshZOffset={meshZOffset}
        onMeshZOffset={setMeshZOffset}
        onSaveMeshZOffset={handleSaveMeshZOffset}

        showTerrain={showTerrain} onShowTerrain={setShowTerrain}
        // compare
        compareIdA={compareIdA} onCompareIdA={setCompareIdA}
        compareIdB={compareIdB} onCompareIdB={setCompareIdB}
        showDateA={showDateA}  onShowDateA={setShowDateA}
        showDateB={showDateB}  onShowDateB={setShowDateB}
        colorA={colorA}        onColorA={setColorA}
        alphaA={alphaA}        onAlphaA={setAlphaA}
        colorB={colorB}        onColorB={setColorB}
        alphaB={alphaB}        onAlphaB={setAlphaB}
        // change detection
        showAdded={showAdded}     onShowAdded={setShowAdded}
        showRemoved={showRemoved} onShowRemoved={setShowRemoved}
        voxelSize={voxelSize}     onVoxelSize={setVoxelSize}
        drawInfo={drawInfo}
        drawBtnLabel={drawBtnLabel}
        onDrawArea={togglePolygonDraw}
        diffRunning={diffRunning}
        onRunDiff={handleRunDiff}
        onClearDiff={handleClearDiff}
        diffStatus={diffStatus}
        stats={stats}
        // camera
        onCameraSite={handleCameraSite}
        onCameraTop={handleCameraTop}
      />
    )}

      <StatusBar msg={statusMsg} done={statusDone} />
      <Toasts items={toasts} />
    </>
  )
}