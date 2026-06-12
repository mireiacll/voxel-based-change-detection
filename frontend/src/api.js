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
  console.log('[api._get] →', url)
  const res = await fetch(url)
  console.log('[api._get] ←', res.status, url)
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

/**
 * The backend returns tileset URLs as relative paths (e.g. /data/3dtiles/…).
 * Cesium resolves relative URLs against the Vite dev-server origin (5173),
 * which knows nothing about those paths and returns an HTML page.
 * Prefix any relative URL with EXT_API (localhost:8080) so Cesium always
 * gets a fully-qualified URL pointing at the correct backend.
 */
function _toAbsoluteUrl(url) {
  if (!url) return null
  if (url.startsWith('http://') || url.startsWith('https://')) return url
  return `${EXT_API}${url.startsWith('/') ? '' : '/'}${url}`
}

/**
 * Rewrite a voxel tileset URL so it points to the visualization sub-folder.
 * Backend returns: …/voxel/tileset.json
 * Cesium needs:   …/voxel/visualization/tileset.json
 */
function _injectVisualizationFolder(url) {
  if (!url) return url
  return url.replace(/\/voxel\/tileset\.json$/, '/voxel/visualization/tileset.json')
}

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

function _formatDate(dateStr) {
  if (!dateStr) return dateStr
  const [year, month, day] = dateStr.split('-')
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const m = months[parseInt(month, 10) - 1] ?? month
  return `${m} ${parseInt(day, 10)}, ${year}`
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

export async function fetchProject(id) {
  const p = await _get(`/api/projects/${id}`)
  return _normaliseProject(p)
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
  const p = await _post('/api/projects', {
    name,
    description:  description ?? '',
    centerLat:    centerLat   ?? 36.9,
    centerLon:    centerLon   ?? 127.0,
    cameraHeight: cameraHeight ?? 600,
    status:       'ACTIVE',
  })
  return _normaliseProject(p)
}

export async function updateProject(id, patch) {
  const current = await _get(`/api/projects/${id}`)
  const p = await _put(`/api/projects/${id}`, {
    name:         patch.name         ?? current.name,
    description:  patch.description  ?? current.description  ?? '',
    centerLat:    patch.centerLat    ?? current.centerLat,
    centerLon:    patch.centerLon    ?? current.centerLon,
    cameraHeight: patch.cameraHeight ?? current.cameraHeight ?? 600,
    status:       current.status     ?? 'ACTIVE',
  })
  return _normaliseProject(p)
}

export async function deleteProject(id) {
  await _delete(`/api/projects/${id}`)
}

// ─────────────────────────────────────────────────────────────────────────
//  OBSERVATIONS / DATES
// ─────────────────────────────────────────────────────────────────────────

/**
 * Convert a YYMMDD date code (e.g. "260601") to a YYYY-MM-DD string
 * required by the coworker API's observedAt field (e.g. "2026-06-01").
 */
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

/**
 * Fetch the resolved voxel tileset URL for an observation.
 * Uses GET /api/observations/{observationId}/tileset/voxel → TilesetUrlResponse.
 */
export async function fetchVoxelTilesetUrl(observationId) {
  const { tilesetUrl } = await _get(`/api/observations/${observationId}/tileset/voxel`)
  return _injectVisualizationFolder(_toAbsoluteUrl(tilesetUrl))
}
export async function updateObservation(observationId, patch) {
  console.log('[api.updateObservation] fetching current for', observationId)
  const current = await _get(`/api/observations/${observationId}`)
  const payload = {
    name:       patch.name       ?? current.name,
    observedAt: patch.observedAt ?? current.observedAt,
  }
  console.log('[api.updateObservation] PUT', observationId, payload)
  const res = await fetch(`${EXT_API}/api/observations/${observationId}`, {
    method:  'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  console.log('[api.updateObservation] ←', res.status)
  if (!res.ok) {
    const b = await res.json().catch(() => ({}))
    console.error('[api.updateObservation] ERROR', res.status, b)
    throw new Error(b.message ?? b.detail ?? `HTTP ${res.status}`)
  }
  const obs = await res.json()
  console.log('[api.updateObservation] updated', obs.id, obs.name, obs.observedAt)
  return _observationToDate(obs)
}

export async function deleteObservation(observationId) {
  console.log('[api.deleteObservation] deleting observation', observationId)
  await _delete(`/api/observations/${observationId}`)
  console.log('[api.deleteObservation] deleted', observationId)
}

/**
 * Given a list of relative paths, return the common leading folder prefix to
 * strip so that tileset.json ends up at the zip root regardless of whether
 * the user dropped:
 *   Case A — already flat:   tileset.json, data/RR1.glb, …
 *   Case B — one subfolder:  tiles/tileset.json, tiles/data/RR1.glb, …
 *   Case C — two levels:     251106/tiles/tileset.json, …
 *
 * Strategy: find the deepest common prefix such that after stripping it,
 * at least one path is exactly "tileset.json". Falls back to stripping just
 * the first path segment (the dropped folder name) if tileset.json isn't found.
 *
 * @param {string[]} paths
 * @returns {string}  prefix to strip including trailing "/"  (may be "")
 */
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

/**
 * Lazy-load JSZip from CDN — no bundler changes required.
 * Shared by _buildZip (folder → zip) and _normalizeZip (zip → zip).
 */
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

/**
 * Validate that a set of (already prefix-stripped) relative paths represents
 * a valid tileset upload: tileset.json at the root, plus a data/ folder.
 * Throws a user-facing error if either is missing — this is what rejects
 * "other formats" (random files/folders with no tileset.json + data/).
 *
 * @param {string[]} paths
 */
function _validateTilesetPaths(paths) {
  if (!paths.includes('tileset.json')) {
    throw new Error('tileset.json을 찾을 수 없습니다 — 최상위에 tileset.json과 data 폴더가 있는 폴더 또는 ZIP을 선택하세요.')
  }
  if (!paths.some(p => p.startsWith('data/'))) {
    throw new Error('data 폴더를 찾을 수 없습니다 — 최상위에 tileset.json과 data 폴더가 있는 폴더 또는 ZIP을 선택하세요.')
  }
}

/**
 * Build a zip blob from a File array using JSZip (loaded dynamically from CDN).
 *
 * Normalises the internal zip structure so tileset.json is always at the root
 * of the zip, regardless of whether the user dropped a flat folder or a
 * nested one (e.g. tiles/tileset.json). The backend therefore always sees:
 *   tileset.json
 *   data/
 *     RR1.glb  …
 *
 * Calls onProgress(percent 0–100) if provided.
 *
 * @param {File[]} files
 * @param {(pct: number) => void} [onProgress]
 * @returns {Promise<Blob>}  application/zip blob
 */
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

/**
 * Given a .zip File/Blob the user selected or dropped directly, make sure
 * tileset.json ends up at the root of the zip — stripping any wrapping
 * folder(s), e.g. "tiles/tileset.json" or "251106/tiles/tileset.json" — and
 * validate the result contains tileset.json + a data/ folder. Throws the
 * same error as the folder path if the structure doesn't match.
 *
 * If the zip is already flat at the root, it's returned unchanged (no
 * unnecessary re-zip).
 *
 * @param {Blob} blob
 * @returns {Promise<Blob>}  application/zip blob
 */
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

/**
 * Upload a new observation (tileset folder or zip) for a project.
 *
 * If the user selected a single .zip file, it is validated and (if needed)
 * re-packaged so tileset.json sits at the zip root alongside data/.
 * If the user dropped a folder (multiple files), they are bundled into a
 * zip in-browser via JSZip before upload — the backend only accepts zips.
 * Either way, an error is thrown if tileset.json + data/ aren't found,
 * rejecting anything that isn't a valid tileset upload.
 *
 * @param {string|number} projectId
 * @param {{ name, observedAt, files, onProgress? }} params
 *   name         — observation name (YYMMDD code)
 *   observedAt   — YYYY-MM-DD string
 *   files        — File[] from a zip picker or folder drop
 *   onProgress   — optional (pct: number) => void  (0–100, zipping phase only)
 * @returns date object
 */
export async function uploadObservation(projectId, { name, observedAt, datasetType = 'pointcloud', files, onProgress }) {
  const fileList = [...files]
  const url = new URL(`${EXT_API}/api/projects/${projectId}/observations`)
  url.searchParams.set('name', name)
  url.searchParams.set('observedAt', observedAt)
  url.searchParams.set('datasetType', datasetType)

  // ── Determine what to send ──────────────────────────────────────────────
  let zipBlob
  const isSingleZip =
    fileList.length === 1 &&
    (fileList[0].name.toLowerCase().endsWith('.zip') ||
     fileList[0].type === 'application/zip' ||
     fileList[0].type === 'application/x-zip-compressed')

  if (isSingleZip) {
    // User picked/dropped a zip directly — validate + normalise its internal
    // structure (tileset.json must end up at the zip root, alongside data/)
    console.log('[api.uploadObservation] single zip selected, validating/normalising:', fileList[0].name, fileList[0].size, 'bytes')
    onProgress?.(0)
    zipBlob = await _normalizeZip(fileList[0])
    onProgress?.(100)
  } else {
    // Folder drop (or multi-file selection) — bundle into a zip first
    console.log('[api.uploadObservation] building zip from', fileList.length, 'files…')
    onProgress?.(0)
    zipBlob = await _buildZip(fileList, onProgress)
    console.log('[api.uploadObservation] zip built:', zipBlob.size, 'bytes')
    onProgress?.(100)
  }

  console.log('[api.uploadObservation] →', url.toString(), { name, observedAt, zipSize: zipBlob.size })

  const form = new FormData()
  form.append('file', zipBlob, `${name}.zip`)

  const res = await fetch(url.toString(), { method: 'POST', body: form })
  console.log('[api.uploadObservation] ←', res.status)
  if (!res.ok) {
    const b = await res.json().catch(() => ({}))
    console.error('[api.uploadObservation] ERROR', res.status, b)
    throw new Error(b.message ?? b.detail ?? `HTTP ${res.status}`)
  }
  const obs = await res.json()
  console.log('[api.uploadObservation] created observation', obs.id, obs.name)
  return _observationToDate(obs)
}

/**
 * Trigger voxelization for an observation.
 * Returns the updated observation as a date object.
 *
 * @param {string|number} observationId
 * @param {{ maxLevel?, visualize?, cubeDataType?, recursive? }} options
 */
export async function voxelizeObservation(observationId, options = {}) {
  console.log('[api.voxelizeObservation] triggering voxelization for', observationId, options)
  const obs = await _post(`/api/observations/${observationId}/voxelize`, options)
  console.log('[api.voxelizeObservation] result — voxelStatus:', obs.voxelStatus, 'voxelJobId:', obs.voxelJobId)
  return _observationToDate(obs)
}

/**
 * Poll GET /api/jobs/{jobId} until the job reaches a terminal state.
 *
 * @param {number|string} jobId
 * @param {(job: object) => void} [onProgress]  — called on each poll with the job object
 * @param {{ intervalMs?, timeoutMs? }} [opts]
 * @returns {Promise<object>}  final job object
 */
export async function pollJob(jobId, onProgress, { intervalMs = 2000, timeoutMs = 300_000 } = {}) {
  const TERMINAL = new Set(['SUCCEEDED', 'FAILED', 'CANCELLED'])
  const deadline = Date.now() + timeoutMs
  while (true) {
    const job = await _get(`/api/jobs/${jobId}`)
    console.log(`[pollJob] jobId=${jobId} status=${job.status} progress=${job.progress}`)
    onProgress?.(job)
    if (TERMINAL.has(job.status)) return job
    if (Date.now() > deadline) throw new Error(`Job ${jobId} timed out after ${timeoutMs / 1000}s`)
    await new Promise(r => setTimeout(r, intervalMs))
  }
}

/**
 * Trigger voxelization for an observation and poll until complete.
 * Calls onProgress({ status, progress, message }) during the wait.
 * Resolves with the final (refreshed) date object, or throws on failure.
 *
 * @param {string|number} observationId
 * @param {(info: { status: string, progress: number, message: string }) => void} [onProgress]
 * @param {{ maxLevel?, visualize?, cubeDataType?, recursive? }} [options]
 */
export async function voxelizeAndPoll(observationId, onProgress, options = {}) {
  console.log('[api.voxelizeAndPoll] start observationId:', observationId)
  const date = await voxelizeObservation(observationId, options)
  const jobId = date.voxelJobId
  if (!jobId) throw new Error('voxelizeObservation returned no jobId')
  console.log('[api.voxelizeAndPoll] polling jobId:', jobId)
  const job = await pollJob(jobId, j => onProgress?.({ status: j.status, progress: j.progress ?? 0, message: j.message ?? '' }))
  if (job.status !== 'SUCCEEDED') {
    throw new Error(`Voxelization ${job.status.toLowerCase()}: ${job.message ?? 'no details'}`)
  }
  // Re-fetch the observation so we get the updated voxelPath / voxelStatus
  return fetchObservation(observationId)
}