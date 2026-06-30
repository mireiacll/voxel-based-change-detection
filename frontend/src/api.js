/**
 * api.js — Adapter between the frontend and the coworker's REST API (localhost:8080).
 *
 * Data model mapping
 * ──────────────────
 * Internal "site"  ←→  coworker "project"     (ProjectResponse)
 * Internal "date"  ←→  coworker "observation"  (ObservationResponse)
 *
 * Project fields used directly throughout the app:
 *   site.id           — stringified numeric project id
 *   site.name         — display name  (was site.label in the old FastAPI world)
 *   site.centerLat    — camera latitude
 *   site.centerLon    — camera longitude
 *   site.cameraHeight — camera height in metres
 *   site.dates        — array of date objects (see _observationToDate below)
 *
 * Date fields used throughout the app:
 *   date.id           — stringified observation id
 *   date.label        — display label  (observedAt formatted, or name)
 *   date.observedAt   — raw date string from API  (YYYY-MM-DD)
 *   date.name         — raw observation name from API
 *   date.datasetPath  — originalTilesPath  (equivalent of old dataset_path)
 *   date.datasetType  — always 'pointcloud' when a tileset exists, else null
 *   date.voxelPath    — voxelPath from observation
 *   date.voxelStatus  — voxelStatus enum from API
 *   date.voxelJobId   — voxelJobId for polling
 */

const EXT_API = import.meta.env.VITE_EXTERNAL_API_URL ?? 'http://localhost:8080'

// ─────────────────────────────────────────────────────────────────────────
//  INTERNAL HELPERS
// ─────────────────────────────────────────────────────────────────────────

async function _get(path) {
  const url = `${EXT_API}${path}`
  const res = await fetch(url)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    console.error('[api._get] ERROR', res.status, url, body)
    throw new Error(body.message ?? body.detail ?? `HTTP ${res.status} — ${path}`)
  }
  return res.json()
}

async function _post(path, body) {
  const url = `${EXT_API}${path}`
  console.log('[api._post] →', url, body)
  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })
  console.log('[api._post] ←', res.status, url)
  if (!res.ok) {
    const b = await res.json().catch(() => ({}))
    console.error('[api._post] ERROR', res.status, url, b)
    throw new Error(b.message ?? b.detail ?? `HTTP ${res.status} — ${path}`)
  }
  return res.json()
}

async function _put(path, body) {
  const url = `${EXT_API}${path}`
  console.log('[api._put] →', url, body)
  const res = await fetch(url, {
    method:  'PUT',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })
  console.log('[api._put] ←', res.status, url)
  if (!res.ok) {
    const b = await res.json().catch(() => ({}))
    console.error('[api._put] ERROR', res.status, url, b)
    throw new Error(b.message ?? b.detail ?? `HTTP ${res.status} — ${path}`)
  }
  return res.json()
}

async function _delete(path) {
  const url = `${EXT_API}${path}`
  console.log('[api._delete] →', url)
  const res = await fetch(url, { method: 'DELETE' })
  console.log('[api._delete] ←', res.status, url)
  if (!res.ok) {
    const b = await res.json().catch(() => ({}))
    console.error('[api._delete] ERROR', res.status, url, b)
    throw new Error(b.message ?? b.detail ?? `HTTP ${res.status} — ${path}`)
  }
  return res.status === 204 ? {} : res.json().catch(() => ({}))
}

// ─────────────────────────────────────────────────────────────────────────
//  SHAPE CONVERTERS
// ─────────────────────────────────────────────────────────────────────────

function _normaliseProject(p) {
  return {
    ...p,
    id:    String(p.id),
    dates: [],
  }
}

// Backend returns tileset URLs as relative paths (e.g. /data/3dtiles/...).
// Cesium would resolve those against the Vite dev server (5173), which
// doesn't know about them, so we prefix with EXT_API to get a real URL.
export function toAbsoluteUrl(url) {
  if (!url) return null
  if (url.startsWith('http://') || url.startsWith('https://')) return url
  return `${EXT_API}${url.startsWith('/') ? '' : '/'}${url}`
}
// kept so existing _toAbsoluteUrl(...) call sites still work
const _toAbsoluteUrl = toAbsoluteUrl

// Backend gives us .../voxel/tileset.json, but Cesium needs the
// visualization variant at .../voxel/visualization/tileset.json
export function injectVisualizationFolder(url) {
  if (!url) return url
  return url.replace(/\/voxel\/tileset\.json$/, '/voxel/visualization/tileset.json')
}
// Internal alias — keeps all existing _injectVisualizationFolder(...) call sites working.
const _injectVisualizationFolder = injectVisualizationFolder

//Convert an observation object to a date object
function _observationToDate(obs) {
  return {
    id:          String(obs.id),
    name:        obs.name,
    observedAt:  obs.observedAt,
    label: obs.observedAt
      ? _formatDate(obs.observedAt)
      : obs.name,
    datasetPath: obs.originalTilesPath ?? null,
    datasetType: obs.datasetType ?? null,
    voxelPath:   obs.voxelPath ?? null,
    voxelStatus: obs.voxelStatus ?? 'NONE',
    voxelJobId:  obs.voxelJobId ?? null,
    originalTilesetUrl: _toAbsoluteUrl(obs.originalTilesetUrl),
    voxelTilesetUrl:    _injectVisualizationFolder(_toAbsoluteUrl(obs.voxelTilesetUrl)),
  }
}

// "YYYY-MM-DD" -> "Mon D, YYYY" (e.g. "Jun 1, 2026")
export function formatDate(dateStr) {
  if (!dateStr) return dateStr
  const [year, month, day] = dateStr.split('-')
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const m = months[parseInt(month, 10) - 1] ?? month
  return `${m} ${parseInt(day, 10)}, ${year}`
}
// kept so _observationToDate's call site still works
const _formatDate = formatDate

// Fetches a tileset.json and computes the center lon/lat (in degrees) of its content. 
// Note: this deliberately doesn't just average the root node's region. The
// root region is padded relative to where the actual content sits. 
// So instead we walk the tile tree, collect every leaf's region, 
// and take the center of the tight bounding box around those. 
export async function fetchTilesetCenter(tilesetUrl) {
  if (!tilesetUrl) throw new Error('tileset URL이 없습니다.')
  console.log('[api.fetchTilesetCenter] fetching', tilesetUrl)
  const res = await fetch(tilesetUrl)
  if (!res.ok) throw new Error(`tileset.json을 가져오지 못했습니다 (HTTP ${res.status})`)
  const json = await res.json()

  const rootRegion = json?.root?.boundingVolume?.region
  if (!Array.isArray(rootRegion) || rootRegion.length < 4) {
    throw new Error('tileset.json에서 위치 정보(region)를 찾을 수 없습니다.')
  }

  // Walk the tree and collect every leaf's region. A tile with `content`
  // and no `children` is an actual data-bearing leaf — tight boxes around
  // real geometry, unlike intermediate/root nodes which get padded for LOD.
  let leafWest = Infinity, leafSouth = Infinity
  let leafEast = -Infinity, leafNorth = -Infinity
  let leafCount = 0

  function walk(node) {
    if (!node) return
    const children = node.children
    const hasChildren = Array.isArray(children) && children.length > 0
    if (!hasChildren && node.content) {
      const r = node.boundingVolume?.region
      if (Array.isArray(r) && r.length >= 4) {
        const [w, s, e, n] = r
        if (w < leafWest)  leafWest  = w
        if (s < leafSouth) leafSouth = s
        if (e > leafEast)  leafEast  = e
        if (n > leafNorth) leafNorth = n
        leafCount++
      }
    }
    if (hasChildren) {
      for (const c of children) walk(c)
    }
  }
  walk(json.root)

  let west, south, east, north, source
  if (leafCount > 0) {
    west = leafWest; south = leafSouth; east = leafEast; north = leafNorth
    source = `leaf-bbox (${leafCount} leaves)`
  } else {
    // no leaves found (shouldn't normally happen) — fall back to root region
    ;[west, south, east, north] = rootRegion
    source = 'root-region (fallback, no leaves found)'
  }

  const lon = (west + east) / 2 * 180 / Math.PI
  const lat = (south + north) / 2 * 180 / Math.PI
  console.log('[api.fetchTilesetCenter] computed center — lon:', lon, 'lat:', lat, '| source:', source)
  return { lon, lat }
}


// ─────────────────────────────────────────────────────────────────────────
//  PROJECTS / SITES
// ─────────────────────────────────────────────────────────────────────────

export async function fetchProjects() {
  console.log('[api.fetchProjects] fetching all projects from', EXT_API)
  const list = await _get('/api/projects')
  console.log('[api.fetchProjects] got', list.length, 'projects:', list.map(p => `${p.id}:${p.name}`))
  return list.map(_normaliseProject)
}

export async function enrichProjectWithDates(site) {
  console.log('[api.enrichProjectWithDates] fetching observations for project', site.id, site.name)
  const observations = await _get(`/api/projects/${site.id}/observations`)
  console.log('[api.enrichProjectWithDates] got', observations.length, 'observations for', site.name,
    observations.map(o => `${o.id}:${o.name}:${o.observedAt}`))
  const sorted = [...observations].sort((a, b) =>
    (a.observedAt ?? '').localeCompare(b.observedAt ?? '')
  )
  return {
    ...site,
    dates: sorted.map(_observationToDate),
  }
}

export async function createProject({ name, description, centerLat, centerLon, cameraHeight }) {
  // centerLat/centerLon are optional,
  // they can be set later via updateProject() from the Data Upload page
  const p = await _post('/api/projects', {
    name,
    description:  description ?? '',
    centerLat:    centerLat ?? null,
    centerLon:    centerLon ?? null,
    cameraHeight: cameraHeight ?? 600,
    status:       'ACTIVE',
  })
  return _normaliseProject(p)
}

export async function updateProject(id, patch) {
  // ProjectRequest only requires 'name', but EditSiteModal always passes
  // its full local state, so we don't need to GET first.
  const p = await _put(`/api/projects/${id}`, {
    name:         patch.name         ?? '',
    description:  patch.description  ?? '',
    centerLat:    patch.centerLat    ?? null,
    centerLon:    patch.centerLon    ?? null,
    cameraHeight: patch.cameraHeight ?? 600,
    status:       patch.status       ?? 'ACTIVE',
  })
  return _normaliseProject(p)
}

// Updates just the cameraHeight on a project, keeping everything else as-is —
// saves callers from having to pass every field just to change the height.
export async function updateCameraHeight(site, newHeight) {
  return updateProject(site.id, {
    name:         site.name,
    description:  site.description  ?? '',
    centerLat:    site.centerLat    ?? null,
    centerLon:    site.centerLon    ?? null,
    cameraHeight: newHeight,
    status:       site.status       ?? 'ACTIVE',
  })
}

export async function deleteProject(id) {
  await _delete(`/api/projects/${id}`)
}

// ─────────────────────────────────────────────────────────────────────────
//  OBSERVATIONS / DATES
// ─────────────────────────────────────────────────────────────────────────

// "260601" -> "2026-06-01" (backend's observedAt wants full ISO dates)
export function dateCodeToIso(code) {
  const m = code.match(/^(\d{2})(\d{2})(\d{2})$/)
  if (!m) throw new Error(`Invalid date code: ${code}`)
  const [, yy, mm, dd] = m
  return `20${yy}-${mm}-${dd}`
}

export async function fetchObservation(observationId) {
  const obs = await _get(`/api/observations/${observationId}`)
  return _observationToDate(obs)
}

//Fetch the resolved voxel tileset URL for an observation.
export async function fetchVoxelTilesetUrl(observationId) {
  const { tilesetUrl } = await _get(`/api/observations/${observationId}/tileset/voxel`)
  return _injectVisualizationFolder(_toAbsoluteUrl(tilesetUrl))
}

export async function updateObservation(observationId, patch) {
  // ObservationUpdateRequest requires name + observedAt — DataUploadPage's
  // DateRow always supplies both, so no GET pre-fetch is needed.
  console.log('[api.updateObservation] PUT', observationId, patch)
  const obs = await _put(`/api/observations/${observationId}`, {
    name:       patch.name,
    observedAt: patch.observedAt,
  })
  console.log('[api.updateObservation] updated', obs.id, obs.name, obs.observedAt)
  return _observationToDate(obs)
}

export async function deleteObservation(observationId) {
  console.log('[api.deleteObservation] deleting observation', observationId)
  await _delete(`/api/observations/${observationId}`)
  console.log('[api.deleteObservation] deleted', observationId)
}

// Figures out the common leading folder to strip from a set of relative
// paths so tileset.json ends up at the zip root, no matter how the user
// dropped things in — already flat, one subfolder (tiles/tileset.json), or
// two levels deep (251106/tiles/tileset.json).
//
// Strategy: try the deepest common prefix where stripping it leaves
// "tileset.json" at the root. Falls back to just stripping the first path
// segment (the dropped folder's own name) if tileset.json isn't found that way.
function _commonPrefixToStrip(paths) {
  // Split each path into segments
  const segments = paths.map(p => p.split('/'))
  // Maximum prefix length to try = depth of the shallowest file - 1
  const maxDepth = Math.min(...segments.map(s => s.length)) - 1

  for (let depth = maxDepth; depth >= 1; depth--) {
    // All files must share the same first `depth` segments
    const prefix = segments[0].slice(0, depth)
    const allMatch = segments.every(s =>
      prefix.every((seg, i) => s[i] === seg)
    )
    if (!allMatch) continue

    const prefixStr = prefix.join('/') + '/'
    // After stripping this prefix, is tileset.json at the root?
    const stripped = paths.map(p => p.slice(prefixStr.length))
    if (stripped.includes('tileset.json')) return prefixStr
  }

  // No clean tileset.json at root found — just strip the top folder name
  // (the dropped folder itself) so we don't nest unnecessarily
  const topFolder = segments[0][0]
  const allSameTop = segments.every(s => s[0] === topFolder)
  if (allSameTop && maxDepth >= 1) return topFolder + '/'

  return ''  // already flat
}

// Lazy-loads JSZip from CDN so we don't need a bundler dependency.
// Shared by _buildZip (folder -> zip) and _normalizeZip (zip -> zip).
async function _loadJSZip() {
  if (!window._JSZip) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js'
      s.onload  = resolve
      s.onerror = () => reject(new Error('Failed to load JSZip'))
      document.head.appendChild(s)
    })
    window._JSZip = window.JSZip
  }
  return window._JSZip
}

// Checks that a (prefix-stripped) set of paths is a valid tileset upload —
// tileset.json at the root plus a data/ folder
function _validateTilesetPaths(paths) {
  if (!paths.includes('tileset.json')) {
    throw new Error('tileset.json을 찾을 수 없습니다 — 최상위에 tileset.json과 data 폴더가 있는 폴더 또는 ZIP을 선택하세요.')
  }
  if (!paths.some(p => p.startsWith('data/'))) {
    throw new Error('data 폴더를 찾을 수 없습니다 — 최상위에 tileset.json과 data 폴더가 있는 폴더 또는 ZIP을 선택하세요.')
  }
}

// Builds a zip blob from a File array using JSZip
// Normalizes the internal structure so tileset.json always ends up at the
// zip root, alongside data/, regardless of whether the user dropped a flat
// folder or a nested one (e.g. tiles/tileset.json). Reports progress via
// onProgress(percent) if given.
async function _buildZip(files, onProgress) {
  const JSZip = await _loadJSZip()
  const zip   = new JSZip()

  // Collect raw paths
  const rawPaths = files.map(f => f.webkitRelativePath || f.relativePath || f.name)

  // Figure out how much leading path to strip
  const prefixToStrip = _commonPrefixToStrip(rawPaths)
  console.log('[api._buildZip] stripping prefix:', JSON.stringify(prefixToStrip),
    '— first few paths:', rawPaths.slice(0, 3))

  const strippedPaths = rawPaths.map(p =>
    prefixToStrip && p.startsWith(prefixToStrip) ? p.slice(prefixToStrip.length) : p
  )
  _validateTilesetPaths(strippedPaths)

  for (let i = 0; i < files.length; i++) {
    zip.file(strippedPaths[i], files[i])
  }

  const blob = await zip.generateAsync(
    { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 1 } },
    meta => onProgress?.(Math.round(meta.percent)),
  )
  return blob
}

// Same normalization as _buildZip, but for a .zip the user picked or dropped
// directly — strips any wrapping folder(s) so tileset.json ends up at the
// zip root, validates the result, and throws the same error as the folder
// path if the structure doesn't match. Returns the blob unchanged if it was
// already flat (no point re-zipping).
async function _normalizeZip(blob) {
  const JSZip = await _loadJSZip()
  const zip   = await JSZip.loadAsync(blob)

  const entries  = Object.values(zip.files).filter(f => !f.dir)
  const rawPaths = entries.map(f => f.name)

  const prefixToStrip = _commonPrefixToStrip(rawPaths)
  const strippedPaths = rawPaths.map(p =>
    prefixToStrip && p.startsWith(prefixToStrip) ? p.slice(prefixToStrip.length) : p
  )
  console.log('[api._normalizeZip] stripping prefix:', JSON.stringify(prefixToStrip),
    '— first few paths:', rawPaths.slice(0, 3))
  _validateTilesetPaths(strippedPaths)

  if (!prefixToStrip) return blob  // already flat — send as-is

  console.log('[api._normalizeZip] re-packaging zip with stripped paths')
  const out = new JSZip()
  for (let i = 0; i < entries.length; i++) {
    out.file(strippedPaths[i], await entries[i].async('blob'))
  }
  return out.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 1 } })
}

// Uploads a new observation (tileset folder or zip) for a project.
//
// A single .zip is validated and re-packaged if needed so tileset.json sits
// at the zip root alongside data/. A folder drop (multiple files) gets
// bundled into a zip in-browser via JSZip first, since the backend only
// accepts zips. Either way we throw if tileset.json + data/ aren't found.
//
// onProgress gets called with { phase, pct } where phase is 'checking' |
// 'zipping' | 'uploading' — pct is real upload progress from XHR byte
// counters during 'uploading', not an estimate.
export async function uploadObservation(projectId, { name, observedAt, datasetType = 'pointcloud', files, onProgress }) {
  const fileList = [...files]
  const url = new URL(`${EXT_API}/api/projects/${projectId}/observations`)
  url.searchParams.set('name', name)
  url.searchParams.set('observedAt', observedAt)
  url.searchParams.set('datasetType', datasetType)

  let zipBlob
  const isSingleZip =
    fileList.length === 1 &&
    (fileList[0].name.toLowerCase().endsWith('.zip') ||
     fileList[0].type === 'application/zip' ||
     fileList[0].type === 'application/x-zip-compressed')

  onProgress?.({ phase: 'checking', pct: 0 })

  if (isSingleZip) {
    // user picked/dropped a zip directly — validate + normalize its structure
    console.log('[api.uploadObservation] single zip selected, validating/normalising:', fileList[0].name, fileList[0].size, 'bytes')
    zipBlob = await _normalizeZip(fileList[0])
  } else {
    // folder drop (or multi-file selection) — bundle into a zip first
    console.log('[api.uploadObservation] building zip from', fileList.length, 'files…')
    zipBlob = await _buildZip(fileList, pct => onProgress?.({ phase: 'zipping', pct }))
    console.log('[api.uploadObservation] zip built:', zipBlob.size, 'bytes')
  }

  onProgress?.({ phase: 'uploading', pct: 0 })
  console.log('[api.uploadObservation] →', url.toString(), { name, observedAt, zipSize: zipBlob.size })

  const form = new FormData()
  form.append('file', zipBlob, `${name}.zip`)

  // XHR instead of fetch so we get real upload-progress events — fetch has
  // no way to report bytes-sent for a request body, which made big uploads
  // look frozen even though the transfer was still going.
  const obs = await new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url.toString())
    xhr.upload.onprogress = e => {
      if (!e.lengthComputable) return
      onProgress?.({ phase: 'uploading', pct: Math.round((e.loaded / e.total) * 100) })
    }
    xhr.onload = () => {
      console.log('[api.uploadObservation] ←', xhr.status)
      if (xhr.status >= 200 && xhr.status < 300) {
        try { resolve(JSON.parse(xhr.responseText)) }
        catch (e) { reject(new Error('Failed to parse server response')) }
        return
      }
      let msg = `HTTP ${xhr.status}`
      try {
        const b = JSON.parse(xhr.responseText)
        msg = b.message ?? b.detail ?? msg
      } catch (_) { /* non-JSON error body — keep generic message */ }
      console.error('[api.uploadObservation] ERROR', xhr.status, xhr.responseText)
      reject(new Error(msg))
    }
    xhr.onerror = () => reject(new Error('네트워크 오류 — 업로드에 실패했습니다.'))
    xhr.send(form)
  })

  console.log('[api.uploadObservation] created observation', obs.id, obs.name)
  onProgress?.({ phase: 'uploading', pct: 100 })
  return _observationToDate(obs)
}

// Triggers voxelization for an observation, returns the updated date object.
export async function voxelizeObservation(observationId, options = {}) {
  console.log('[api.voxelizeObservation] triggering voxelization for', observationId, options)
  const obs = await _post(`/api/observations/${observationId}/voxelize`, options)
  console.log('[api.voxelizeObservation] result — voxelStatus:', obs.voxelStatus, 'voxelJobId:', obs.voxelJobId)
  return _observationToDate(obs)
}

// Cancels an in-progress voxelization job. Used when the user wants to
// edit/delete a date while its voxelizer is still running — cancelling frees
// up the observation instead of making them wait it out.
export async function cancelVoxelize(observationId) {
  console.log('[api.cancelVoxelize] observationId:', observationId)
  const status = await _post(`/api/observations/${observationId}/voxelize/cancel`, {})
  console.log('[api.cancelVoxelize] result — voxelStatus:', status.voxelStatus)
  return status
}

// Terminal statuses shared by job polling and voxel-status polling.
const TERMINAL_JOB_STATUSES = new Set(['SUCCEEDED', 'FAILED', 'CANCELLED'])

// Polls GET /api/jobs/{jobId} until it reaches a terminal state. Used for
// diff jobs — for voxel jobs use pollVoxelStatus instead.
//
// shouldStop, if given, is checked before every fetch and after every sleep;
// when it returns true the loop exits right away with a synthetic CANCELLED
// result instead of firing another request. Set this flag right before
// calling cancelDiff() so the loop stops as soon as it wakes up.
export async function pollJob(jobId, onProgress, { intervalMs = 2000, timeoutMs = 300_000, shouldStop } = {}) {
  const deadline = Date.now() + timeoutMs
  while (true) {
    if (shouldStop?.()) {
      console.log(`[pollJob] jobId=${jobId} — shouldStop=true, exiting loop cleanly`)
      return { status: 'CANCELLED' }
    }
    const job = await _get(`/api/jobs/${jobId}`)
    console.log(`[pollJob] jobId=${jobId} status=${job.status} progress=${job.progress}`)
    onProgress?.(job)
    if (TERMINAL_JOB_STATUSES.has(job.status)) return job
    if (Date.now() > deadline) throw new Error(`Job ${jobId} timed out after ${timeoutMs / 1000}s`)
    await new Promise(r => setTimeout(r, intervalMs))
    if (shouldStop?.()) {
      console.log(`[pollJob] jobId=${jobId} — shouldStop=true after sleep, exiting loop cleanly`)
      return { status: 'CANCELLED' }
    }
  }
}

// Polls GET /api/observations/{observationId}/voxel-status until terminal.
// Lighter than pollJob for voxel tracking: targets the observation directly

// shouldStop works the same as in pollJob — use it to stop polling right
// before an observation gets deleted, so we don't hit a 404 afterward.
export async function pollVoxelStatus(observationId, onProgress, { intervalMs = 5000, timeoutMs = 1_800_000, shouldStop } = {}) {
  const deadline = Date.now() + timeoutMs
  while (true) {
    // catches cancellation that happened while sleeping, or before the first tick
    if (shouldStop?.()) {
      console.log(`[pollVoxelStatus] obsId=${observationId} — shouldStop=true, exiting loop cleanly`)
      return { voxelStatus: 'CANCELLED' }
    }
    const s = await _get(`/api/observations/${observationId}/voxel-status`)
    console.log(`[pollVoxelStatus] obsId=${observationId} voxelStatus=${s.voxelStatus} progress=${s.jobProgress}`)
    onProgress?.(s)
    if (TERMINAL_JOB_STATUSES.has(s.voxelStatus)) return s
    if (Date.now() > deadline) throw new Error(`Voxel job for observation ${observationId} timed out`)
    await new Promise(r => setTimeout(r, intervalMs))
    // most common race: delete fires during the sleep, shouldStop gets set,
    // we bail here before the next GET hits the now-deleted observation
    if (shouldStop?.()) {
      console.log(`[pollVoxelStatus] obsId=${observationId} — shouldStop=true after sleep, exiting loop cleanly`)
      return { voxelStatus: 'CANCELLED' }
    }
  }
}

// Fetches all currently active (non-terminal) jobs. Used on project open to
// discover in-progress voxel/diff jobs and resume polling them, instead of
// re-fetching every observation one by one.
export async function fetchActiveJobs() {
  const jobs = await _get('/api/jobs')
  return jobs.filter(j => !TERMINAL_JOB_STATUSES.has(j.status))
}

// Triggers voxelization and polls until it's done, calling
// onProgress({ status, progress, message }) along the way. Resolves with
// the refreshed date object, or throws on failure.
export async function voxelizeAndPoll(observationId, onProgress, options = {}) {
  console.log('[api.voxelizeAndPoll] start observationId:', observationId)
  await voxelizeObservation(observationId, options)
  console.log('[api.voxelizeAndPoll] polling voxel-status for obsId:', observationId)
  const status = await pollVoxelStatus(
    observationId,
    s => onProgress?.({ status: s.voxelStatus, progress: s.jobProgress ?? 0, message: s.jobMessage ?? '' })
  )
  if (status.voxelStatus !== 'SUCCEEDED') {
    throw new Error(`Voxelization ${status.voxelStatus.toLowerCase()}: ${status.jobMessage ?? 'no details'}`)
  }
  // re-fetch for the full date-shaped object (voxelPath, etc.)
  return fetchObservation(observationId)
}

// ─────────────────────────────────────────────────────────────────────────
//  DIFFS
// ─────────────────────────────────────────────────────────────────────────

// Creates an A/B diff job between two observations (A = earlier/baseline,
// B = later). opts can include maxLevel, visualize, areaWkt, etc.
export async function createAbDiff(projectId, sourceObservationId, targetObservationId, opts = {}) {
  console.log('[api.createAbDiff] projectId:', projectId, 'A:', sourceObservationId, 'B:', targetObservationId)
  const body = {
    name:                 opts.name ?? `ab-${sourceObservationId}-${targetObservationId}`,
    sourceObservationId:  Number(sourceObservationId),
    targetObservationId:  Number(targetObservationId),
    visualize:            opts.visualize ?? true,
    massSummary:          opts.massSummary ?? true,
    ...( opts.areaWkt ? { areaWkt: opts.areaWkt } : {} ),
    ...( opts.maxLevel != null ? { maxLevel: opts.maxLevel } : {} ),
  }
  const diff = await _post(`/api/projects/${projectId}/diffs/ab`, body)
  console.log('[api.createAbDiff] created diffId:', diff.id, 'jobId:', diff.jobId, 'status:', diff.status)
  return diff
}

//Fetch all diff items for a given diff
export async function fetchDiffItems(diffId) {
  console.log('[api.fetchDiffItems] diffId:', diffId)
  const items = await _get(`/api/diffs/${diffId}/items`)
  console.log('[api.fetchDiffItems] got', items.length, 'items')
  return items
}

export async function fetchDiffItemReport(diffItemId) {
  console.log('[api.fetchDiffItemReport] diffItemId:', diffItemId)
  const report = await _get(`/api/diff-items/${diffItemId}/report`)
  console.log('[api.fetchDiffItemReport] report:', report)
  return report
}

//Fetch the tileset URL for a single diff item.
export async function fetchDiffItemTilesetUrl(diffItemId) {
  console.log('[api.fetchDiffItemTilesetUrl] diffItemId:', diffItemId)
  const { tilesetUrl } = await _get(`/api/diff-items/${diffItemId}/tileset`)
  return _injectVisualizationFolder(_toAbsoluteUrl(tilesetUrl))
}

//Cancel a diff job.
export async function cancelDiff(diffId) {
  console.log('[api.cancelDiff] diffId:', diffId)
  return _post(`/api/diffs/${diffId}/cancel`, {})
}

export async function deleteDiff(diffId) {
  console.log('[api.deleteDiff] diffId:', diffId)
  await _delete(`/api/diffs/${diffId}`)
}

//Fetch a single diff by id.
export async function fetchDiffById(diffId) {
  return _get(`/api/diffs/${diffId}`)
}

// Fetches in-progress (QUEUED or RUNNING) diffs for a project, shaped for
// DiffHistory's pending display.
export async function fetchProjectDiffsInProgress(projectId) {
  const [queued, running] = await Promise.all([
    _get(`/api/projects/${projectId}/diffs?status=QUEUED`).catch(() => []),
    _get(`/api/projects/${projectId}/diffs?status=RUNNING`).catch(() => []),
  ])
  return [...queued, ...running].map(d => ({
    id:        d.id,
    diffId:    d.id,
    name:      d.name ?? `diff-${d.id}`,
    type:      d.type === 'A_B' ? 'AB' : 'TIME_SERIES',
    status:    d.status,
    jobId:     d.jobId,
    createdAt: d.createdAt,
  }))
}

// Fetches all SUCCEEDED diffs for a project, enriched with date labels from
// each diff's items, shaped for DiffHistory display.
export async function fetchProjectDiffs(projectId) {
  console.log('[api.fetchProjectDiffs] projectId:', projectId)
  const list = await _get(`/api/projects/${projectId}/diffs?status=SUCCEEDED`)
  console.log('[api.fetchProjectDiffs] got', list.length, 'succeeded diffs')

  const entries = await Promise.all(
    list.map(async diff => {
      try {
        const detail = await _get(`/api/diffs/${diff.id}`)
        const items  = detail.items ?? []
        const isAB   = diff.type === 'A_B'

        // Sort items by sourceObservedAt to get first→last range
        const sorted = [...items].sort((a, b) =>
          (a.sourceObservedAt ?? '').localeCompare(b.sourceObservedAt ?? '')
        )
        const firstItem = sorted[0]
        const lastItem  = sorted[sorted.length - 1]

        const labelA = firstItem
          ? (_formatDate(firstItem.sourceObservedAt) ?? firstItem.sourceObservedAt ?? '?')
          : '?'
        const labelB = (isAB ? firstItem : lastItem)
          ? (_formatDate((isAB ? firstItem : lastItem)?.targetObservedAt)
              ?? (isAB ? firstItem : lastItem)?.targetObservedAt ?? '?')
          : '?'

        // For AB: volume + tileset from first (only) item
        const abItem = isAB ? firstItem : null
        const tilesetUrl = abItem?.resultTilesetUrl
          ? _injectVisualizationFolder(_toAbsoluteUrl(abItem.resultTilesetUrl))
          : null

        return {
          id:               diff.id,
          diffId:           diff.id,
          type:             isAB ? 'AB' : 'TIME_SERIES',
          name:             diff.name ?? `diff-${diff.id}`,
          createdAt:        diff.createdAt,
          status:           'SUCCEEDED',
          labelA,
          labelB,
          areaWkt:          detail.areaWkt ?? null,
          // AB-only
          diffItemId:       abItem?.id ?? null,
          addedVolume:      abItem?.addedVolume   ?? 0,
          removedVolume:    abItem?.removedVolume ?? 0,
          tilesetUrl,
          // TS-only
          observationCount: isAB ? null : (items.length + 1),
        }
      } catch (e) {
        console.warn('[api.fetchProjectDiffs] failed to enrich diff', diff.id, e.message)
        return null
      }
    })
  )

  // Filter out any that failed, sort newest first
  return entries
    .filter(Boolean)
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
}

// Given a diff item, fetches its report and (mass-summary.json)
// use the LAST level in levelCounts[], since that's the finest resolution
export async function fetchDiffItemFineSummary(item) {
  let report = null
  try { report = await fetchDiffItemReport(item.id) } catch (_) {}
  console.log('[fetchDiffItemFineSummary] report:', report)

  // report.summaryPath looks like /data/voxelsets/.../summary.json, but the
  // actual mass-summary is served at /files/voxelsets/.../voxel/mass-summary.json
  let massSummary = null
  if (report?.summaryPath) {
    try {
      const massUrl = _toAbsoluteUrl(
        report.summaryPath
          .replace(/^\/data\//, '/files/')
          .replace(/\/summary\.json$/, '/voxel/mass-summary.json')
      )
      console.log('[fetchDiffItemFineSummary] fetching mass-summary from:', massUrl)
      const res = await fetch(massUrl)
      if (res.ok) {
        massSummary = await res.json()
        console.log('[fetchDiffItemFineSummary] mass-summary:', massSummary)
      } else {
        console.warn('[fetchDiffItemFineSummary] mass-summary fetch failed:', res.status)
      }
    } catch (e) {
      console.warn('[fetchDiffItemFineSummary] mass-summary fetch error:', e.message)
    }
  }

  const lastLevel = massSummary?.levelCounts?.length
    ? massSummary.levelCounts[massSummary.levelCounts.length - 1]
    : null
  if (lastLevel) console.log('[fetchDiffItemFineSummary] lastLevel:', lastLevel)

  const summary = {
    diffItemId:       item.id,
    sourceObservedAt: item.sourceObservedAt ?? report?.sourceObservedAt,
    targetObservedAt: item.targetObservedAt ?? report?.targetObservedAt,
    // Use last-level fine-resolution volumes; fall back to totals then item/report
    addedVolume:   lastLevel?.addApproxVolumeCubicMeters
                ?? massSummary?.totalAddApproxVolumeCubicMeters
                ?? item.addedVolume   ?? report?.addedVolume   ?? 0,
    removedVolume: lastLevel?.removeApproxVolumeCubicMeters
                ?? massSummary?.totalRemoveApproxVolumeCubicMeters
                ?? item.removedVolume ?? report?.removedVolume ?? 0,
    changedVolume: 0,
    // Voxel counts from last level for display
    addedCount:   lastLevel?.addVoxelCount    ?? massSummary?.totalAddVoxelCount    ?? 0,
    removedCount: lastLevel?.removeVoxelCount ?? massSummary?.totalRemoveVoxelCount ?? 0,
    // Average voxel volume at the finest level — same field timeline uses to
    // derive the displayed voxel edge length (cbrt of this value).
    avg_vox_vol:  lastLevel?.averageVoxelVolumeCubicMeters ?? null,
    summaryPath:  report?.summaryPath ?? null,
  }
  console.log('[fetchDiffItemFineSummary] final summary:', summary)
  return summary
}

// Re-fetches the fine-resolution summary + tileset URL for a past AB diff,
// for restoring a Diff History entry. Mirrors the tail end of
// createAbDiffAndPoll but starts from an already-known diffId instead of
// running a new job.
export async function fetchAbDiffResult(diffId) {
  console.log('[fetchAbDiffResult] diffId:', diffId)
  const items = await fetchDiffItems(diffId)
  if (!items.length) throw new Error('분석 결과가 없습니다')
  const item = items[0]

  const report = await fetchDiffItemFineSummary(item)

  let tilesetUrl = null
  if (item.resultTilesetUrl) {
    tilesetUrl = _injectVisualizationFolder(_toAbsoluteUrl(item.resultTilesetUrl))
  } else {
    try { tilesetUrl = await fetchDiffItemTilesetUrl(item.id) } catch (_) {}
  }

  return { report, tilesetUrl }
}

// Creates an A/B diff and polls until done, calling onStatus(msg) with
// progress updates. Resolves with the first diff item enriched with
// { report, tilesetUrl }.
export async function createAbDiffAndPoll(projectId, sourceObservationId, targetObservationId, opts = {}) {
  const onStatus  = opts.onStatus  ?? (() => {})
  const onDiffId  = opts.onDiffId  ?? (() => {})   // called with diffId once created, so caller can cancel
  const onJobTick = opts.onJobTick ?? (() => {})   // called on each poll tick with the raw job object
  const shouldStop = opts.shouldStop ?? null        // () => boolean, set before calling cancel

  onStatus('A/B 분석 작업 생성 중…')
  const diff = await createAbDiff(projectId, sourceObservationId, targetObservationId, opts)

  if (!diff.jobId) throw new Error('diff 작업 jobId가 없습니다')
  onDiffId(diff.id)

  onStatus('분석 중… (잠시 기다려 주세요)')
  const job = await pollJob(
    diff.jobId,
    j => {
      const pct = j.progress ? ` (${j.progress}%)` : ''
      const msg = j.message  ? ` — ${j.message}`  : ''
      onStatus(`분석 중${pct}${msg}`)
      onJobTick(j)
    },
    { intervalMs: 3000, timeoutMs: 600_000, shouldStop },
  )

  if (job.status === 'CANCELLED') {
    onStatus('취소됨')
    return null
  }
  if (job.status !== 'SUCCEEDED') {
    throw new Error(`분석 ${job.status.toLowerCase()}: ${job.message ?? '오류 없음'}`)
  }

  onStatus('결과 가져오는 중…')
  const items = await fetchDiffItems(diff.id)
  if (!items.length) throw new Error('분석 결과가 없습니다')

  const item = items[0]
  console.log('[createAbDiffAndPoll] item volumes — added:', item.addedVolume, 'removed:', item.removedVolume, 'changed:', item.changedVolume)

  const summary = await fetchDiffItemFineSummary(item)
  console.log('[createAbDiffAndPoll] final summary:', summary)

  let tilesetUrl = null
  if (item.resultTilesetUrl) {
    tilesetUrl = _injectVisualizationFolder(_toAbsoluteUrl(item.resultTilesetUrl))
  } else {
    try { tilesetUrl = await fetchDiffItemTilesetUrl(item.id) } catch (_) {}
  }

  onStatus('완료')
  return { ...item, report: summary, tilesetUrl }
}

// ─────────────────────────────────────────────────────────────────────────
//  TIME-SERIES DIFFS
// ─────────────────────────────────────────────────────────────────────────

// Creates a TIME_SERIES diff job for a project, covering all consecutive
// observation pairs.
export async function createTimeSeriesDiff(projectId, opts = {}) {
  console.log('[api.createTimeSeriesDiff] projectId:', projectId)
  const body = {
    name:        opts.name ?? `timeseries-${projectId}-${Date.now()}`,
    visualize:   opts.visualize   ?? true,
    massSummary: opts.massSummary ?? true,
    ...( opts.areaWkt   ? { areaWkt:   opts.areaWkt   } : {} ),
    ...( opts.maxLevel != null ? { maxLevel: opts.maxLevel } : {} ),
  }
  const diff = await _post(`/api/projects/${projectId}/diffs/time-series`, body)
  console.log('[api.createTimeSeriesDiff] created diffId:', diff.id, 'jobId:', diff.jobId, 'status:', diff.status)
  return diff
}

// Creates a TIME_SERIES diff and polls until done, calling onStatus(msg)
// with progress updates and onDiffId(diffId) once created. Resolves with
// the diff on success, throws on failure.
export async function createTimeSeriesDiffAndPoll(projectId, opts = {}) {
  const onStatus  = opts.onStatus  ?? (() => {})
  const onDiffId  = opts.onDiffId  ?? (() => {})
  const onJobTick = opts.onJobTick ?? (() => {})   // called on each poll tick with the raw job object
  const shouldStop = opts.shouldStop ?? null        // () => boolean — set before cancel call

  onStatus('시계열 분석 작업 생성 중…')
  const diff = await createTimeSeriesDiff(projectId, opts)

  if (!diff.jobId) throw new Error('diff 작업 jobId가 없습니다')
  onDiffId(diff.id)

  onStatus('시계열 분석 중… (잠시 기다려 주세요)')
  const job = await pollJob(
    diff.jobId,
    j => {
      const pct = j.progress ? ` (${j.progress}%)` : ''
      const msg = j.message  ? ` — ${j.message}`   : ''
      onStatus(`시계열 분석 중${pct}${msg}`)
      onJobTick(j)
    },
    { intervalMs: 3000, timeoutMs: 900_000, shouldStop },
  )

  if (job.status === 'CANCELLED') {
    onStatus('취소됨')
    return null
  }
  if (job.status !== 'SUCCEEDED') {
    throw new Error(`시계열 분석 ${job.status.toLowerCase()}: ${job.message ?? '오류 없음'}`)
  }

  onStatus('완료')
  return diff
}