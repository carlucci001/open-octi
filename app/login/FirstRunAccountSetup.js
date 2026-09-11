'use client'
import { useState } from 'react'
import Link from 'next/link'

const inputStyle = { width: '100%', boxSizing: 'border-box', padding: '12px 14px', marginTop: 6, borderRadius: 8, border: '1px solid #42506b', background: '#101a2e', color: '#fff', fontSize: 16 }

export default function FirstRunAccountSetup({ local }) {
  const [busy, setBusy] = useState(false)
  const [opening, setOpening] = useState(false)
  const [error, setError] = useState('')
  async function submit(event) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    if (form.get('password') !== form.get('confirmPassword')) { setError('The passwords do not match.'); return }
    setBusy(true); setError('')
    try {
      const response = await fetch('/api/auth/setup', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: String(form.get('username')).trim(), password: form.get('password'), displayName: form.get('displayName') }) })
      const result = await response.json()
      if (!response.ok || !result.ok) throw new Error(result.error || 'Account setup failed. Please try again.')
      setOpening(true)
      try { localStorage.setItem('fcc-tab', 'dashboard') } catch {}
      // Start a fresh request with the new session cookie; a prefetched login
      // redirect can otherwise leave the client router on the setup screen.
      window.location.replace('/')
    } catch (error) { setError(error.message); setBusy(false) }
  }
  return <main style={{ minHeight: '100vh', background: '#020711', color: '#eaf0ff', display: 'grid', placeItems: 'center', padding: 24, boxSizing: 'border-box' }}>
    <section style={{ width: '100%', maxWidth: 440, padding: 30, boxSizing: 'border-box', border: '1px solid #31415e', borderRadius: 20, background: '#0b1323' }}>
      <p style={{ color: '#85d8ff', margin: '0 0 12px' }}>Welcome to OpenOcti</p>
      <Link href="/help" style={{ display: 'inline-flex', alignItems: 'center', minHeight: 48, color: '#85d8ff' }}>Setup help · no AI key needed</Link>
      <h1 style={{ fontSize: 28, margin: '0 0 12px' }}>Create your admin account</h1>
      <p style={{ color: '#b6c4db', lineHeight: 1.5 }}>Choose your own login for this installation. You will use it whenever you return. No API key is needed to get started.</p>
      <p style={{ color: '#b6c4db', fontSize: 14, lineHeight: 1.5 }}>{process.env.NODE_ENV === 'development' ? 'Development preview: the first dashboard load may take a minute while pages compile. Later visits are faster.' : 'First launch may take a minute or more while your workspace gets ready. Keep this page open.'}</p>
      {!local ? <p role="alert">Open OpenOcti using localhost on the computer running Docker to create your account. For a remote server, follow the remote installation instructions.</p> : <form onSubmit={submit} style={{ display: 'grid', gap: 16 }}>
        <label>Your name<input name="displayName" autoComplete="name" maxLength={80} style={inputStyle} /></label>
        <label>Username<input name="username" autoComplete="username" required minLength={3} maxLength={64} pattern="[a-zA-Z0-9][a-zA-Z0-9_.@\-]{2,63}" style={inputStyle} /></label>
        <label>Password<input name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={72} aria-describedby="password-help" style={inputStyle} /><small id="password-help" style={{ color: '#b6c4db' }}>At least 12 characters.</small></label>
        <label>Confirm password<input name="confirmPassword" type="password" autoComplete="new-password" required minLength={12} maxLength={72} style={inputStyle} /></label>
        {error && <p role="alert" style={{ color: '#ffb7b7', margin: 0 }}>{error}</p>}
        {opening && <p role="status" style={{ color: '#85d8ff', lineHeight: 1.5, margin: 0 }}>Your account is ready. Opening your workspace—this first load may take a minute. Please keep this page open.</p>}
        <button type="submit" disabled={busy} style={{ ...inputStyle, cursor: busy ? 'wait' : 'pointer', background: '#177caf', borderColor: '#299fcb', fontWeight: 700 }}>{opening ? 'Opening your workspace…' : busy ? 'Creating your account…' : 'Create account and get started'}</button>
      </form>}
      <p style={{ fontSize: 13, color: '#8fa3c2', marginBottom: 0 }}>This screen closes permanently after the first account is created.</p>
    </section>
  </main>
}
