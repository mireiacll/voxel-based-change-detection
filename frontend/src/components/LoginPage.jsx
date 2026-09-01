/**
 * LoginPage.jsx — full-screen login gate shown before the app mounts.
 * Calls auth.login(); on success the parent (main.jsx) swaps in <App/>.
 */

import { useState } from 'react'
import { login } from '../auth'

export default function LoginPage({ onLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState(null)
  const [busy,     setBusy]     = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (busy) return
    setError(null)
    setBusy(true)
    try {
      const user = await login(username.trim(), password)
      onLogin(user)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-brand">
          <div className="nav-brand-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" strokeWidth="2.2">
              <polygon points="12 2 2 7 12 12 22 7 12 2"/>
              <polyline points="2 17 12 22 22 17"/>
              <polyline points="2 12 12 17 22 12"/>
            </svg>
          </div>
          <h1 className="login-title">변화탐지 플랫폼</h1>
          <p className="login-subtitle">계속하려면 로그인하세요</p>
        </div>

        <label className="login-label">
          아이디
          <input
            className="login-input"
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value)}
            autoComplete="username"
            autoFocus
            required
          />
        </label>

        <label className="login-label">
          비밀번호
          <input
            className="login-input"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>

        {error && <div className="login-error">{error}</div>}

        <button className="login-btn" type="submit" disabled={busy}>
          {busy ? '로그인 중…' : '로그인'}
        </button>

        <div className="login-hint">
          기본 계정 — 관리자: <code>admin / admin1234</code><br/>
          사용자: <code>user1 / user1234</code>, <code>user2 / user1234</code>
        </div>
      </form>
    </div>
  )
}
