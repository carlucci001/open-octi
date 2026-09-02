'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { primeLoginWelcomeAudio, queueLoginWelcomeAudio } from './loginWelcomeAudio'
import { brandAssetsFor } from '@/lib/brand-assets'

const BRAND_ASSETS = brandAssetsFor()
const EDITION_NAME = BRAND_ASSETS.openOcti ? 'OpenOcti' : 'Farrington Command Center'

function LoginStarfield() {
  return (
    <div className="login-starfield" aria-hidden="true">
      <span className="login-star-layer login-star-layer-one" />
      <span className="login-star-layer login-star-layer-two" />
      <span className="login-star-layer login-star-layer-three" />
      <span className="login-star-swarm login-star-swarm-one" />
      <span className="login-star-swarm login-star-swarm-two" />
      <span className="login-star-cluster" />
      <span className="login-distant-planet" />
      <span className="login-warp-lines" />
      <span className="login-comet login-comet-one" />
      <span className="login-comet login-comet-two" />
    </div>
  )
}

function LoginLogoHeader() {
  return (
    <div className={`command-dashboard-loader login-command-loader ${BRAND_ASSETS.openOcti ? 'openocti-brand-loader' : ''}`} data-logo-ready="true" aria-label={EDITION_NAME}>
      {!BRAND_ASSETS.openOcti && <div className="command-dashboard-loader-vignette" />}
      {!BRAND_ASSETS.openOcti && <div className="command-dashboard-loader-grid" />}
      <div className="command-dashboard-loader-stage">
        <img src={BRAND_ASSETS.loaderLogo} alt="" className="command-dashboard-loader-logo" />
        {!BRAND_ASSETS.openOcti && <div className="command-dashboard-loader-radar">
          <div className="command-dashboard-loader-radar-sweep"><span className="command-dashboard-loader-radar-edge" /></div>
        </div>}
        {!BRAND_ASSETS.openOcti && <span className="command-dashboard-loader-blip" />}
        {!BRAND_ASSETS.openOcti && <span className="command-dashboard-loader-ping" />}
        {!BRAND_ASSETS.openOcti && <span className="command-dashboard-loader-ping command-dashboard-loader-ping-delay" />}
        {!BRAND_ASSETS.openOcti && <span className="command-dashboard-loader-antenna" />}
        {!BRAND_ASSETS.openOcti && <span className="command-dashboard-loader-wing command-dashboard-loader-wing-left" />}
        {!BRAND_ASSETS.openOcti && <span className="command-dashboard-loader-wing command-dashboard-loader-wing-right" />}
        {!BRAND_ASSETS.openOcti && <span className="command-dashboard-loader-dot command-dashboard-loader-dot-left" />}
        {!BRAND_ASSETS.openOcti && <span className="command-dashboard-loader-dot command-dashboard-loader-dot-right" />}
      </div>
    </div>
  )
}

async function clearPwaRuntimeCaches() {
  if (typeof window === 'undefined') return
  try {
    if ('caches' in window) {
      const keys = await window.caches.keys()
      await Promise.all(keys.map(key => window.caches.delete(key)))
    }
  } catch {}
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations()
      await Promise.all(registrations.map(reg => reg.update().catch(() => {})))
    }
  } catch {}
}

async function readJsonResponse(response) {
  const text = await response.text()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    const contentType = response.headers.get('content-type') || 'unknown'
    throw new Error(`Login API returned ${contentType} instead of JSON. Refreshing the PWA cache usually fixes this.`)
  }
}

async function storeLoginCredential(user, username, password) {
  if (typeof window === 'undefined') return
  if (!username || !password || !window.PasswordCredential || !navigator.credentials?.store) return
  try {
    await navigator.credentials.store(new window.PasswordCredential({
      id: username,
      name: user?.displayName || user?.username || username,
      password,
    }))
  } catch {}
}

export default function LoginPage() {
  const router = useRouter()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [loginPhase, setLoginPhase] = useState('idle')

  const submit = async (e) => {
    e.preventDefault()
    setError('')

    const form = new FormData(e.currentTarget)
    const loginUsername = String(form.get('username') || username || '').trim()
    const loginPassword = String(form.get('password') || password || '')
    if (!loginUsername || !loginPassword) {
      setError('Enter username and password.')
      return
    }

    const welcomeAudio = primeLoginWelcomeAudio()
    setBusy(true)
    setLoginPhase('auth')
    try {
      await clearPwaRuntimeCaches()
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        credentials: 'same-origin',
        body: JSON.stringify({ username: loginUsername, password: loginPassword }),
      })
      const j = await readJsonResponse(r)
      if (!r.ok || !j.ok) {
        setError(j.error || 'login failed')
        setBusy(false)
        setLoginPhase('idle')
        return
      }
      setLoginPhase('redirect')
      try { localStorage.setItem('fcc-tab', 'dashboard') } catch {}
      storeLoginCredential(j.user, loginUsername, loginPassword)
      queueLoginWelcomeAudio(j.user, loginUsername, welcomeAudio)
      router.replace('/')
    } catch (err) {
      setError(err.message)
      setBusy(false)
      setLoginPhase('idle')
    }
  }

  const moveGlow = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    e.currentTarget.style.setProperty('--login-glow-x', `${Math.max(0, Math.min(100, x))}%`)
    e.currentTarget.style.setProperty('--login-glow-y', `${Math.max(0, Math.min(100, y))}%`)
  }

  const resetGlow = (e) => {
    e.currentTarget.style.setProperty('--login-glow-x', '50%')
    e.currentTarget.style.setProperty('--login-glow-y', '44%')
  }

  return (
    <div className="login-starship-screen" style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#020711',
      padding: 24,
    }} onPointerMove={moveGlow} onPointerLeave={resetGlow}>
      <LoginStarfield />
      <form
        onSubmit={submit}
        autoComplete="on"
        method="post"
        style={{
          width: '100%',
          maxWidth: 380,
          padding: 0,
          position: 'relative',
          zIndex: 1,
          display: 'grid',
          justifyItems: 'stretch',
        }}
      >
        <LoginLogoHeader />

        <input
          id="username"
          name="username"
          type="text"
          aria-label="Username"
          placeholder="Username"
          autoFocus
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={username}
          onChange={e => setUsername(e.target.value)}
          onInput={e => setUsername(e.currentTarget.value)}
          style={{
            width: '100%',
            padding: '12px 14px',
            fontSize: 16,
            minHeight: 48,
            border: '1px solid rgba(19, 168, 255, 0.28)',
            borderRadius: 8,
            background: 'rgba(2, 7, 17, 0.82)',
            color: 'var(--text, #fff)',
            marginBottom: 16,
            boxSizing: 'border-box',
          }}
        />

        <input
          id="password"
          name="password"
          type="password"
          aria-label="Password"
          placeholder="Password"
          autoComplete="current-password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          onInput={e => setPassword(e.currentTarget.value)}
          style={{
            width: '100%',
            padding: '12px 14px',
            fontSize: 16,
            minHeight: 48,
            border: '1px solid rgba(19, 168, 255, 0.28)',
            borderRadius: 8,
            background: 'rgba(2, 7, 17, 0.82)',
            color: 'var(--text, #fff)',
            marginBottom: 20,
            boxSizing: 'border-box',
          }}
        />

        {error && (
          <div style={{
            padding: '10px 12px',
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.3)',
            color: '#ef4444',
            borderRadius: 8,
            fontSize: 14,
            marginBottom: 16,
          }}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          style={{
            width: '100%',
            padding: '14px 16px',
            minHeight: 52,
            fontSize: 16,
            fontWeight: 600,
            background: busy ? 'var(--surface2, #2a2a2a)' : '#13a8ff',
            color: '#020711',
            border: 'none',
            borderRadius: 8,
            cursor: busy ? 'wait' : 'pointer',
            opacity: busy ? 0.72 : 1,
            boxShadow: busy ? 'none' : '0 0 22px rgba(19, 168, 255, 0.22)',
          }}
        >
          {busy && loginPhase !== 'auth' ? 'Loading dashboard...' : busy ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
