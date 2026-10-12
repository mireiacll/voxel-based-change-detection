import * as Cesium from 'cesium'

export const API_URL = import.meta.env.VITE_EXTERNAL_API_URL ?? 'http://localhost:8080'
const apiOrigin = new URL(API_URL || window.location.origin, window.location.origin)
Cesium.TrustedServers.add(apiOrigin.hostname, Number(apiOrigin.port || (apiOrigin.protocol === 'https:' ? 443 : 80)))
let csrfToken

export async function refreshCsrf() {
  const res = await fetch(`${API_URL}/api/auth/csrf`, { credentials: 'include', cache: 'no-store' })
  if (!res.ok) throw new Error('인증 서버에 연결할 수 없습니다.')
  csrfToken = await res.json()
  return csrfToken
}

export async function authFetch(url, options = {}) {
  const target = new URL(url, window.location.origin)
  // Never send the session or CSRF token to external report URLs.
  if (target.origin !== apiOrigin.origin) return fetch(url, options)
  const headers = new Headers(options.headers)
  if (!['GET', 'HEAD', 'OPTIONS'].includes((options.method || 'GET').toUpperCase())) {
    const token = csrfToken || await refreshCsrf()
    headers.set(token.headerName, token.token)
  }
  const res = await fetch(url, { ...options, headers, credentials: 'include' })
  let expired = res.status === 401
  if (res.status === 403 && !target.pathname.endsWith('/auth/login')) {
    // CSRF validation can reject a write before authentication after expiry.
    const session = await fetch(`${API_URL}/api/auth/me`, { credentials: 'include', cache: 'no-store' })
    expired = session.status === 401
  }
  if (expired && !target.pathname.endsWith('/auth/login')) {
    csrfToken = undefined
    window.dispatchEvent(new Event('auth-expired'))
  }
  return res
}

export async function login(username, password) {
  await refreshCsrf()
  const res = await authFetch(`${API_URL}/api/auth/login`, {
    method: 'POST', body: new URLSearchParams({ username, password }),
  })
  if (!res.ok) throw new Error(res.status === 401 ? '아이디 또는 비밀번호가 올바르지 않습니다.' : '로그인에 실패했습니다. 다시 시도해주세요.')
  await refreshCsrf()
}

export async function logout() {
  const res = await authFetch(`${API_URL}/api/auth/logout`, { method: 'POST' })
  if (!res.ok && res.status !== 401) throw new Error('로그아웃에 실패했습니다.')
  csrfToken = undefined
}
