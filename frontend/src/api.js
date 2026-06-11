/**
 * api.js — Adapter between the frontend and the coworker's REST API (localhost:8080).
 *
 * Data model mapping
 * ──────────────────
 * Internal "site"  ←→  coworker "project"     (ProjectResponse)
 * Internal "date"  ←→  coworker "observation"  (ObservationResponse)
 *
 * Shape philosophy (Step 1 + 2)
 * ──────────────────────────────
 * Projects are returned almost as-is from the API — no deep transformation.
 * The only normalisation is:
 *   - id is stringified (numeric → string) so existing string comparisons work
 *   - dates[] is populated by a separate fetchObservations call
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
  console.log('[API GET]', `${EXT_API}${path}`)
  const res = await fetch(`${EXT_API}${path}`)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.message ?? body.detail ?? `HTTP ${res.status} — ${path}`)
  }
  return res.json()
}

async function _post(path, body) {
  const res = await fetch(`${EXT_API}${path}`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })
  if (!res.ok) {
    const b = await res.json().catch(() => ({}))
    throw new Error(b.message ?? b.detail ?? `HTTP ${res.status} — ${path}`)
  }
  return res.json()
}

async function _put(path, body) {
  const res = await fetch(`${EXT_API}${path}`, {
    method:  'PUT',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  })
  if (!res.ok) {
    const b = await res.json().catch(() => ({}))
    throw new Error(b.message ?? b.detail ?? `HTTP ${res.status} — ${path}`)
  }
  return res.json()
}

async function _delete(path) {
  const res = await fetch(`${EXT_API}${path}`, { method: 'DELETE' })
  if (!res.ok) {
    const b = await res.json().catch(() => ({}))
    throw new Error(b.message ?? b.detail ?? `HTTP ${res.status} — ${path}`)
  }
  return res.status === 204 ? {} : res.json().catch(() => ({}))
}

// ─────────────────────────────────────────────────────────────────────────
//  SHAPE CONVERTERS
// ─────────────────────────────────────────────────────────────────────────

/**
 * Minimal normalisation of a ProjectResponse.
 * We only stringify the numeric id and attach an empty dates array.
 * All other fields (name, centerLat, centerLon, cameraHeight, status, …)
 * are kept as-is so the rest of the app reads them directly from the API shape.
 */
function _normaliseProject(p) {
  return {
    ...p,
    id:    String(p.id),   // normalise numeric → string for consistent comparisons
    dates: [],             // populated separately by enrichProjectWithDates()
  }
}

/**
 * Convert an ObservationResponse into the internal "date" shape.
 *
 * ObservationResponse fields:
 *   id                 (int64)
 *   projectId          (int64)
 *   name               (string)
 *   observedAt         (date string, YYYY-MM-DD)
 *   originalTilesPath  (string | null)
 *   originalTilesetUrl (string | null)
 *   voxelPath          (string | null)
 *   voxelTilesetUrl    (string | null)
 *   voxelStatus        (enum)
 *   voxelJobId         (int64 | null)
 */
function _observationToDate(obs) {
  return {
    // Core identity
    id:          String(obs.id),
    name:        obs.name,
    observedAt:  obs.observedAt,

    // Human-readable label: prefer observedAt date, fall back to name
    label: obs.observedAt
      ? _formatDate(obs.observedAt)
      : obs.name,

    // Dataset — maps to old datasetPath / datasetType
    datasetPath: obs.originalTilesPath ?? null,
    datasetType: obs.originalTilesPath ? 'pointcloud' : null,

    // Pre-computed voxel
    voxelPath:   obs.voxelPath ?? null,
    voxelStatus: obs.voxelStatus ?? 'NONE',
    voxelJobId:  obs.voxelJobId ?? null,

    // Tileset URLs (used for direct Cesium loading if available)
    originalTilesetUrl: obs.originalTilesetUrl ?? null,
    voxelTilesetUrl:    obs.voxelTilesetUrl    ?? null,
  }
}

/**
 * Format a YYYY-MM-DD date string into a human-readable label.
 * e.g. "2025-04-15" → "Apr 15, 2025"
 */
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

/**
 * List all projects. Returns normalised project objects without dates.
 * Call enrichProjectWithDates() on each one to populate site.dates.
 */
export async function fetchProjects() {
  const list = await _get('/api/projects')   // ProjectResponse[]
  return list.map(_normaliseProject)
}

/**
 * Fetch a single project by its id (string or number).
 */
export async function fetchProject(id) {
  const p = await _get(`/api/projects/${id}`)
  return _normaliseProject(p)
}

/**
 * Fetch observations for a project and attach them as site.dates.
 * Returns a new site object with dates populated.
 *
 * @param {object} site — normalised project object from fetchProjects()
 * @returns {object} site with dates[] populated
 */
export async function enrichProjectWithDates(site) {
  const observations = await _get(`/api/projects/${site.id}/observations`)
  // Sort by observedAt ascending so oldest date is first
  const sorted = [...observations].sort((a, b) =>
    (a.observedAt ?? '').localeCompare(b.observedAt ?? '')
  )
  return {
    ...site,
    dates: sorted.map(_observationToDate),
  }
}

/**
 * Create a new project.
 *
 * @param {{ name, description?, centerLat, centerLon, cameraHeight }} params
 * @returns normalised project object (no dates)
 */
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

/**
 * Update a project's metadata.
 * PUT requires all required fields — we fetch current state to fill gaps.
 *
 * @param {string|number} id
 * @param {{ name?, description?, centerLat?, centerLon?, cameraHeight? }} patch
 */
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

/**
 * Delete a project.
 */
export async function deleteProject(id) {
  await _delete(`/api/projects/${id}`)
}

// ─────────────────────────────────────────────────────────────────────────
//  OBSERVATIONS / DATES
// ─────────────────────────────────────────────────────────────────────────

/**
 * Fetch a single observation by id and return it as a date object.
 */
export async function fetchObservation(observationId) {
  const obs = await _get(`/api/observations/${observationId}`)
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
  const obs = await _post(`/api/observations/${observationId}/voxelize`, options)
  return _observationToDate(obs)
}

/**
 * Upload a new observation (GLB/tileset file) for a project.
 *
 * @param {string|number} projectId
 * @param {{ name, observedAt, file }} params  — observedAt as YYYY-MM-DD string
 * @returns date object
 */
export async function uploadObservation(projectId, { name, observedAt, file }) {
  const url = new URL(`${EXT_API}/api/projects/${projectId}/observations`)
  url.searchParams.set('name', name)
  url.searchParams.set('observedAt', observedAt)

  const form = new FormData()
  form.append('file', file)

  const res = await fetch(url.toString(), { method: 'POST', body: form })
  if (!res.ok) {
    const b = await res.json().catch(() => ({}))
    throw new Error(b.message ?? b.detail ?? `HTTP ${res.status}`)
  }
  const obs = await res.json()
  return _observationToDate(obs)
}