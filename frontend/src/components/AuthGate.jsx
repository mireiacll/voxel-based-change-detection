import { useEffect, useState } from 'react'
import App from '../App'
import { API_URL, authFetch, login, logout } from '../auth'
import './auth.css'

export default function AuthGate() {
  const [user, setUser] = useState(null)
  const [checking, setChecking] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    const expired = () => { setUser(null); setError('로그인이 필요합니다.') }
    window.addEventListener('auth-expired', expired)
    authFetch(`${API_URL}/api/auth/me`, { cache: 'no-store' })
      .then(async res => { if (res.ok) { setUser(await res.json()); setError('') } else if (res.status !== 401) throw new Error() })
      .catch(() => setError('인증 서버에 연결할 수 없습니다.'))
      .finally(() => setChecking(false))
    return () => window.removeEventListener('auth-expired', expired)
  }, [])

  async function submit(event) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    setBusy(true); setError('')
    try {
      await login(data.get('username'), data.get('password'))
      form.reset()
      const res = await authFetch(`${API_URL}/api/auth/me`)
      if (!res.ok) throw new Error('로그인 상태를 확인할 수 없습니다.')
      setUser(await res.json())
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }

  if (checking) return <div className="auth-screen">로그인 상태 확인 중…</div>
  if (user) return <><App /><div className="auth-session"><span>{user.username}</span><button disabled={busy} onClick={async () => {
    setBusy(true)
    try { await logout(); setUser(null); setError('') }
    catch (err) { window.alert(err.message) }
    finally { setBusy(false) }
  }}>로그아웃</button></div></>
  return <main className="auth-screen"><form className="auth-card" onSubmit={submit}>
    <span className="auth-brand">VOXEL CHANGE DETECTION</span>
    <h1>로그인</h1><p>지정된 계정으로 로그인해주세요.</p>
    <label htmlFor="username">아이디</label><input id="username" name="username" autoComplete="username" required autoFocus disabled={busy} />
    <label htmlFor="password">비밀번호</label><input id="password" name="password" type="password" autoComplete="current-password" required disabled={busy} />
    {error && <p className="auth-error" role="alert">{error}</p>}
    <button disabled={busy} type="submit">{busy ? '로그인 중…' : '로그인'}</button>
  </form></main>
}
