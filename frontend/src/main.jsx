import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/viewer.css'
import App from './App'
import LoginPage from './components/LoginPage'
import { getToken, fetchMe } from './auth'

// Auth gate: validate any stored token on startup, then render either the
// login page or the app. App only mounts once authenticated, so all its
// initial fetches carry the Authorization header.
function Root() {
  const [checking, setChecking] = useState(!!getToken())
  const [user,     setUser]     = useState(null)

  useEffect(() => {
    if (!getToken()) return
    fetchMe().then(me => {
      setUser(me)
      setChecking(false)
    })
  }, [])

  if (checking) {
    return <div className="login-page"><div className="login-checking">로그인 확인 중…</div></div>
  }
  if (!user) {
    return <LoginPage onLogin={setUser} />
  }
  return <App />
}

createRoot(document.getElementById('root')).render(<Root />)
