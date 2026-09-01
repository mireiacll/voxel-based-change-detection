/**
 * auth.js — login/logout + token storage for the coworker REST API.
 *
 * The token is an opaque bearer token from POST /api/auth/login, kept in
 * localStorage together with the user info. api.js reads getToken() to
 * attach the Authorization header, and calls handleUnauthorized() on any
 * 401 so an expired/revoked token drops the app back to the login page.
 */

const EXT_API = import.meta.env.VITE_EXTERNAL_API_URL ?? 'http://localhost:8080'

const TOKEN_KEY = 'auth.token'
const USER_KEY  = 'auth.user'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function getUser() {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? JSON.parse(raw) : null
  } catch (_) {
    return null
  }
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_KEY)
}

// Called by api.js whenever the backend answers 401 — token expired or the
// backend restarted (tokens are in-memory there). Reload lands on LoginPage.
export function handleUnauthorized() {
  if (!getToken()) return
  clearAuth()
  window.location.reload()
}

export async function login(username, password) {
  const res = await fetch(`${EXT_API}/api/auth/login`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ username, password }),
  })
  if (!res.ok) {
    const b = await res.json().catch(() => ({}))
    throw new Error(b.message ?? b.detail ?? '로그인에 실패했습니다.')
  }
  const { token, user } = await res.json()
  localStorage.setItem(TOKEN_KEY, token)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
  return user
}

export async function logout() {
  const token = getToken()
  clearAuth()
  if (!token) return
  // Best-effort server-side revoke — local state is already gone.
  try {
    await fetch(`${EXT_API}/api/auth/logout`, {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
  } catch (_) { /* backend unreachable — nothing to revoke */ }
}

// Validates the stored token against the backend. Returns the user object
// or null (invalid/expired/no token) — never throws on network errors so a
// briefly-down backend doesn't log the user out.
export async function fetchMe() {
  const token = getToken()
  if (!token) return null
  try {
    const res = await fetch(`${EXT_API}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.status === 401) {
      clearAuth()
      return null
    }
    if (!res.ok) return getUser()
    const user = await res.json()
    localStorage.setItem(USER_KEY, JSON.stringify(user))
    return user
  } catch (_) {
    return getUser()
  }
}
