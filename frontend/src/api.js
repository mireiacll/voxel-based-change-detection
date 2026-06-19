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

/**
 * The backend returns tileset URLs as relative paths (e.g. /data/3dtiles/…).
 * Cesium resolves relative URLs against the Vite dev-server origin (5173),
 * which knows nothing about those paths and returns an HTML page.
 * Prefix any relative URL with EXT_API (localhost:8080) so Cesium always
 * gets a fully-qualified URL pointing at the correct backend.
 */
export function toAbsoluteUrl(url) {
  if (!url) return null
  if (url.startsWith('http://') || url.startsWith('https://')) return url
  return `${EXT_API}${url.startsWith('/') ? '' : '/'}${url}`
}
// Internal alias — keeps all existing _toAbsoluteUrl(...) call sites working.
const _toAbsoluteUrl = toAbsoluteUrl

/**
 * Rewrite a voxel tileset URL so it points to the visualization sub-folder.
 * Backend returns: …/voxel/tileset.json
 * Cesium needs:   …/voxel/visualization/tileset.json
 */
export function injectVisualizationFolder(url) {
  if (!url) return url
  return url.replace(/\/voxel\/tileset\.json$/, '/voxel/visualization/tileset.json')
}
// Internal alias — keeps all existing _injectVisualizationFolder(...) call sites working.
const _injectVisualizationFolder = injectVisualizationFolder

/**
 * Convert an observation object to a date object.
 */
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

/**
 * Format a YYYY-MM-DD string → "Mon D, YYYY" (e.g. "Jun 1, 2026").
 */
export function formatDate(dateStr) {
  if (!dateStr) return dateStr
  const [year, month, day] = dateStr.split('-')
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const m = months[parseInt(month, 10) - 1] ?? month
  return `${m} ${parseInt(day, 10)}, ${year}`
}
// Internal alias keeps _observationToDate's existing call site working.
const _formatDate = formatDate

/**
 * Fetch a 3D Tiles tileset.json and compute the center longitude/latitude
 * (in degrees) of its content.
 *
 * Only supports the "region" bounding volume form:
 *   region: [west, south, east, north, minHeight, maxHeight]  (radians)
 * This is what the backend's tileset generator produces. "box" / "sphere"
 * bounding volumes aren't handled — if encountered, this throws so the
 * caller can show a clear error instead of silently producing a wrong
 * coordinate.
 *
 * IMPORTANT: this does NOT just average the root node's region. On these
 * tilesets the root region is padded/inflated relative to where the actual
 * leaf content sits (observed ~0.001–0.0015° drift east/north on a real
 * mesh tileset — root region center landed at 127.00852/36.91107 while the
 * actual leaf-tile content centroid is 127.00691/36.91032, matching the
 * sibling point-cloud's center much more closely). So instead this walks
 * the tile tree, collects every LEAF tile's region (tiles with a `content`
 * but no `children`, i.e. the tiles that actually point at real geometry),
 * and computes the center of the tight bounding box around all of them.
 * Falls back to the root region if no leaves are found (e.g. a single-tile
 * tileset where root IS the only/leaf tile).
 *
 * @param {string} tilesetUrl  absolute URL to tileset.json (e.g. date.originalTilesetUrl)
 * @returns {Promise<{lon: number, lat: number}>}
 */
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

  // Walk the tree collecting every leaf's region (a tile with `content` and
  // no `children` is an actual data-bearing leaf — these are tight boxes
  // around real geometry, unlike intermediate/root nodes which can be
  // padded for LOD purposes).
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
    // Fallback: no leaves found (shouldn't normally happen) — use root region.
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
  // centerLat/centerLon are optional — pass through null (don't invent a
  // default location). They can be set later from the Data Upload page via
  // updateProject(). cameraHeight is not user-configurable; always 600.
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
  // ProjectRequest only requires 'name'. EditSiteModal always supplies all
  // fields from its own local state, so no GET round-trip is needed.
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
  // ObservationUpdateRequest requires name + observedAt — both always supplied
  // by the caller (DataUploadPage DateRow), so no GET pre-fetch is needed.
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
 * Cancel an in-progress voxelization job for an observation.
 * Returns ObservationVoxelStatusResponse: { observationId, voxelStatus, voxelJobId, … }
 *
 * Used when the user wants to edit/delete an observation's date while its
 * voxelizer is still running — cancelling frees up the observation instead
 * of forcing the user to wait.
 *
 * @param {string|number} observationId
 */
export async function cancelVoxelize(observationId) {
  console.log('[api.cancelVoxelize] observationId:', observationId)
  const status = await _post(`/api/observations/${observationId}/voxelize/cancel`, {})
  console.log('[api.cancelVoxelize] result — voxelStatus:', status.voxelStatus)
  return status
}

// Terminal statuses shared by job polling and voxel-status polling.
const TERMINAL_JOB_STATUSES = new Set(['SUCCEEDED', 'FAILED', 'CANCELLED'])

/**
 * Poll GET /api/jobs/{jobId} until the job reaches a terminal state.
 * Use this for diff jobs. For voxel jobs prefer pollVoxelStatus.
 *
 * @param {number|string} jobId
 * @param {(job: object) => void} [onProgress]  — called on each poll
 * @param {{ intervalMs?, timeoutMs? }} [opts]
 * @returns {Promise<object>}  final job object
 */
export async function pollJob(jobId, onProgress, { intervalMs = 2000, timeoutMs = 300_000 } = {}) {
  const deadline = Date.now() + timeoutMs
  while (true) {
    const job = await _get(`/api/jobs/${jobId}`)
    console.log(`[pollJob] jobId=${jobId} status=${job.status} progress=${job.progress}`)
    onProgress?.(job)
    if (TERMINAL_JOB_STATUSES.has(job.status)) return job
    if (Date.now() > deadline) throw new Error(`Job ${jobId} timed out after ${timeoutMs / 1000}s`)
    await new Promise(r => setTimeout(r, intervalMs))
  }
}

/**
 * Poll GET /api/observations/{observationId}/voxel-status until terminal.
 *
 * Lighter than pollJob for voxel tracking:
 *   · Targets the observation directly — no need to track voxelJobId.
 *   · Returns voxelTilesetUrl in the terminal response.
 *   · Progress via jobProgress/jobMessage mirrors JobResponse fields.
 *
 * @param {string|number} observationId
 * @param {(s: object) => void} [onProgress]
 * @param {{ intervalMs?, timeoutMs?, shouldStop? }} [opts]
 *   shouldStop — optional () => boolean called before each fetch and after each
 *                sleep. When it returns true the loop exits immediately with a
 *                synthetic CANCELLED result so no further network request is made.
 *                Use this to stop polling when the observation is about to be
 *                deleted, avoiding a 404 network error in the console.
 * @returns {Promise<object>}  final ObservationVoxelStatusResponse
 */
export async function pollVoxelStatus(observationId, onProgress, { intervalMs = 2000, timeoutMs = 1_800_000, shouldStop } = {}) {
  const deadline = Date.now() + timeoutMs
  while (true) {
    // Check before every fetch — catches cancellation that happened while we
    // were sleeping or before the very first tick fires.
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
    // Check again after the sleep — this is the most common race window:
    // delete fires during the 2 s wait, shouldStop is set, we bail before
    // the next GET hits the now-deleted observation.
    if (shouldStop?.()) {
      console.log(`[pollVoxelStatus] obsId=${observationId} — shouldStop=true after sleep, exiting loop cleanly`)
      return { voxelStatus: 'CANCELLED' }
    }
  }
}

/**
 * Fetch all currently active (non-terminal) jobs from GET /api/jobs.
 * Returns JobResponse[]: { id, jobType, targetType, targetId, status, progress, message }
 *
 *   jobType:    'VOXEL_CREATE' | 'DIFF_CREATE'
 *   targetType: 'OBSERVATION'  | 'DIFF' | 'DIFF_ITEM'
 *   targetId:   id of the observation or diff being processed
 *
 * Use on project open to discover in-progress voxel or diff jobs and resume
 * polling them without re-fetching every observation individually.
 */
export async function fetchActiveJobs() {
  const jobs = await _get('/api/jobs')
  return jobs.filter(j => !TERMINAL_JOB_STATUSES.has(j.status))
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
  await voxelizeObservation(observationId, options)
  // pollVoxelStatus is lighter than pollJob: targets the observation directly,
  // no voxelJobId needed, returns voxelTilesetUrl in the terminal response.
  console.log('[api.voxelizeAndPoll] polling voxel-status for obsId:', observationId)
  const status = await pollVoxelStatus(
    observationId,
    s => onProgress?.({ status: s.voxelStatus, progress: s.jobProgress ?? 0, message: s.jobMessage ?? '' })
  )
  if (status.voxelStatus !== 'SUCCEEDED') {
    throw new Error(`Voxelization ${status.voxelStatus.toLowerCase()}: ${status.jobMessage ?? 'no details'}`)
  }
  // Re-fetch observation for the full date-shaped object (voxelPath, etc.)
  return fetchObservation(observationId)
}

// ─────────────────────────────────────────────────────────────────────────
//  DIFFS
// ─────────────────────────────────────────────────────────────────────────

/**
 * Create an A/B diff job between two observations.
 * Returns DiffCreateResponse: { id, projectId, name, type, status, jobId, itemCount }
 *
 * @param {string|number} projectId
 * @param {string|number} sourceObservationId  — observation A (earlier/baseline)
 * @param {string|number} targetObservationId  — observation B (later)
 * @param {object} [opts]  — optional diff params (maxLevel, visualize, areaWkt, …)
 */
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

/**
 * Fetch all diff items for a given diff.
 * Returns DiffItemResponse[].
 */
export async function fetchDiffItems(diffId) {
  console.log('[api.fetchDiffItems] diffId:', diffId)
  const items = await _get(`/api/diffs/${diffId}/items`)
  console.log('[api.fetchDiffItems] got', items.length, 'items')
  return items
}

/**
 * Fetch the detailed report for a single diff item.
 * Returns DiffItemReportResponse: { diffItemId, sourceObservedAt, targetObservedAt,
 *   addedVolume, removedVolume, changedVolume, summaryPath }
 */
export async function fetchDiffItemReport(diffItemId) {
  console.log('[api.fetchDiffItemReport] diffItemId:', diffItemId)
  const report = await _get(`/api/diff-items/${diffItemId}/report`)
  console.log('[api.fetchDiffItemReport] report:', report)
  return report
}

/**
 * Fetch the tileset URL for a single diff item.
 * Returns TilesetUrlResponse: { tilesetUrl }
 */
export async function fetchDiffItemTilesetUrl(diffItemId) {
  console.log('[api.fetchDiffItemTilesetUrl] diffItemId:', diffItemId)
  const { tilesetUrl } = await _get(`/api/diff-items/${diffItemId}/tileset`)
  // Backend returns …/voxel/tileset.json — Cesium needs …/voxel/visualization/tileset.json
  return _injectVisualizationFolder(_toAbsoluteUrl(tilesetUrl))
}

/**
 * Cancel a diff job.
 */
export async function cancelDiff(diffId) {
  console.log('[api.cancelDiff] diffId:', diffId)
  return _post(`/api/diffs/${diffId}/cancel`, {})
}

/**
 * Create an A/B diff and poll until the job completes.
 * Calls onStatus(msg: string) with progress updates.
 * Resolves with the first DiffItemResponse enriched with:
 *   { report: DiffItemReportResponse, tilesetUrl: string|null }
 *
 * @param {string|number} projectId
 * @param {string|number} sourceObservationId
 * @param {string|number} targetObservationId
 * @param {{ areaWkt?, maxLevel?, onStatus? }} [opts]
 */
export async function createAbDiffAndPoll(projectId, sourceObservationId, targetObservationId, opts = {}) {
  const onStatus  = opts.onStatus  ?? (() => {})
  const onDiffId  = opts.onDiffId  ?? (() => {})   // called with diffId once created

  onStatus('A/B 분석 작업 생성 중…')
  const diff = await createAbDiff(projectId, sourceObservationId, targetObservationId, opts)

  if (!diff.jobId) throw new Error('diff 작업 jobId가 없습니다')
  onDiffId(diff.id)   // expose diffId to caller so they can cancel

  onStatus('분석 중… (잠시 기다려 주세요)')
  const job = await pollJob(
    diff.jobId,
    j => {
      const pct = j.progress ? ` (${j.progress}%)` : ''
      const msg = j.message  ? ` — ${j.message}`  : ''
      onStatus(`분석 중${pct}${msg}`)
    },
    { intervalMs: 3000, timeoutMs: 600_000 },
  )

  if (job.status !== 'SUCCEEDED') {
    throw new Error(`분석 ${job.status.toLowerCase()}: ${job.message ?? '오류 없음'}`)
  }

  onStatus('결과 가져오는 중…')
  const items = await fetchDiffItems(diff.id)
  if (!items.length) throw new Error('분석 결과가 없습니다')

  const item = items[0]
  console.log('[createAbDiffAndPoll] item volumes — added:', item.addedVolume, 'removed:', item.removedVolume, 'changed:', item.changedVolume)

  // Try the /report endpoint for extra fields (summaryPath etc) but don't
  // rely on it for volumes — the item itself carries addedVolume/removedVolume/
  // changedVolume directly from the diff computation.
  let report = null
  try { report = await fetchDiffItemReport(item.id) } catch (_) {}
  console.log('[createAbDiffAndPoll] report:', report)

  // The /report endpoint returns zeros — real volumes are in mass-summary.json.
  // summaryPath from report: /data/voxelsets/.../summary.json
  // mass-summary served at:  /files/voxelsets/.../voxel/mass-summary.json
  let massSummary = null
  if (report?.summaryPath) {
    try {
      // Convert /data/voxelsets/…/summary.json → /files/voxelsets/…/voxel/mass-summary.json
      const massUrl = _toAbsoluteUrl(
        report.summaryPath
          .replace(/^\/data\//, '/files/')
          .replace(/\/summary\.json$/, '/voxel/mass-summary.json')
      )
      console.log('[createAbDiffAndPoll] fetching mass-summary from:', massUrl)
      const res = await fetch(massUrl)
      if (res.ok) {
        massSummary = await res.json()
        console.log('[createAbDiffAndPoll] mass-summary:', massSummary)
      } else {
        console.warn('[createAbDiffAndPoll] mass-summary fetch failed:', res.status)
      }
    } catch (e) {
      console.warn('[createAbDiffAndPoll] mass-summary fetch error:', e.message)
    }
  }

  // The mass-summary has per-level breakdowns in levelCounts[].
  // Coarse levels (0-N-1) are large multi-voxel tiles that dominate the totals.
  // The LAST level is the finest resolution and gives the correct human-scale volume.
  const lastLevel = massSummary?.levelCounts?.length
    ? massSummary.levelCounts[massSummary.levelCounts.length - 1]
    : null
  if (lastLevel) console.log('[createAbDiffAndPoll] lastLevel:', lastLevel)

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
    summaryPath:  report?.summaryPath ?? null,
  }
  console.log('[createAbDiffAndPoll] final summary:', summary)

  let tilesetUrl = null
  if (item.resultTilesetUrl) {
    // item already has a URL — still needs visualization injection
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

/**
 * Create a TIME_SERIES diff job for a project (covers all consecutive obs pairs).
 * Returns DiffCreateResponse: { id, projectId, name, type, status, jobId, itemCount }
 *
 * @param {string|number} projectId
 * @param {object} [opts]  — optional diff params (maxLevel, visualize, areaWkt, …)
 */
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

/**
 * Create a TIME_SERIES diff and poll until the job completes.
 * Calls onStatus(msg: string) with progress updates.
 * Calls onDiffId(diffId) once the diff is created (so caller can cancel).
 * Resolves with the DiffCreateResponse on success, or throws on failure.
 *
 * @param {string|number} projectId
 * @param {{ onStatus?, onDiffId?, areaWkt?, maxLevel? }} [opts]
 */
export async function createTimeSeriesDiffAndPoll(projectId, opts = {}) {
  const onStatus = opts.onStatus ?? (() => {})
  const onDiffId = opts.onDiffId ?? (() => {})

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
    },
    { intervalMs: 3000, timeoutMs: 900_000 },
  )

  if (job.status !== 'SUCCEEDED') {
    throw new Error(`시계열 분석 ${job.status.toLowerCase()}: ${job.message ?? '오류 없음'}`)
  }

  onStatus('완료')
  return diff
}