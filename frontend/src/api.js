/**
 * api.js — Adapter between the frontend's internal data model and the
 * coworker's REST API (localhost:8080).
 *
 * Data model mapping
 * ──────────────────
 * Internal "site"       ←→  coworker "project"   (ProjectResponse)
 * Internal "date"       ←→  coworker "observation" (ObservationResponse)
 * Internal "timeseries" ←→  coworker "diff" with type=TIME_SERIES (DiffListResponse)
 * Internal "diff item"  ←→  coworker "diff-item"  (DiffItemResponse)
 *
 * Step 1 (this file): project / site listing + CRUD
 * Step 2 (next):      observations / dates
 * Step 3 (next):      diffs / timeseries
 * Step 4 (next):      upload flow
 */

const EXT_API = import.meta.env.VITE_EXTERNAL_API_URL ?? 'http://localhost:8080'

// ── Fallback defaults for fields the API doesn't have ────────────
// centerLat/centerLon/cameraHeight come from ProjectResponse.
// meshZOffset has no equivalent — use sensible defaults.
const DEFAULT_MESH_Z_OFFSET = 200.0

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
  // 204 No Content has no body
  return res.status === 204 ? {} : res.json().catch(() => ({}))
}

// ─────────────────────────────────────────────────────────────────────────
//  SHAPE CONVERTERS — coworker → internal
// ─────────────────────────────────────────────────────────────────────────

/**
 * Convert a coworker ProjectResponse into the internal "site" shape that
 * the rest of the frontend expects.
 *
 * NOTE: `dates` is NOT included here — it requires a separate API call.
 *       Call `enrichSiteWithDates(site)` to add them.
 *
 * ProjectResponse fields used:
 *   id           (int64)  → stringified, used as siteId
 *   name         (string) → label
 *   centerLat    (double) → camera.lat
 *   centerLon    (double) → camera.lon
 *   cameraHeight (double) → camera.height  (nullable — fallback 600)
 */
function _projectToSite(p) {
  return {
    // IDs are numeric in the coworker API — stringify so existing code keeps working
    id:           String(p.id),
    label:        p.name,
    meshZOffset:  DEFAULT_MESH_Z_OFFSET,
    camera: {
      lon:    p.centerLon    ?? 127.0,
      lat:    p.centerLat    ?? 36.9,
      height: p.cameraHeight ?? 600,
    },
    // dates are populated separately
    dates: [],
    // keep original numeric id in case we need it for API calls
    _extId: p.id,
  }
}

// ─────────────────────────────────────────────────────────────────────────
//  PROJECTS / SITES
// ─────────────────────────────────────────────────────────────────────────

/**
 * List all projects from the coworker API.
 * Returns an array of internal "site" objects (without dates).
 */
export async function fetchProjects() {
  const list = await _get('/api/projects')          // ProjectResponse[]
  return list.map(_projectToSite)
}

/**
 * Fetch a single project by its external numeric id.
 */
export async function fetchProject(extId) {
  const p = await _get(`/api/projects/${extId}`)    // ProjectResponse
  return _projectToSite(p)
}

/**
 * Create a new project.
 *
 * @param {{ name, description?, centerLat, centerLon, cameraHeight }} params
 * @returns internal site object
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
  return _projectToSite(p)
}

/**
 * Update a project's metadata.
 *
 * @param {string|number} extId — coworker numeric project id
 * @param {{ name?, description?, centerLat?, centerLon?, cameraHeight? }} patch
 */
export async function updateProject(extId, patch) {
  // PUT requires all required fields — fetch current state first to fill gaps
  const current = await _get(`/api/projects/${extId}`)
  const p = await _put(`/api/projects/${extId}`, {
    name:         patch.name         ?? current.name,
    description:  patch.description  ?? current.description  ?? '',
    centerLat:    patch.centerLat    ?? current.centerLat,
    centerLon:    patch.centerLon    ?? current.centerLon,
    cameraHeight: patch.cameraHeight ?? current.cameraHeight ?? 600,
    status:       current.status     ?? 'ACTIVE',
  })
  return _projectToSite(p)
}

/**
 * Delete a project.
 */
export async function deleteProject(extId) {
  await _delete(`/api/projects/${extId}`)
}