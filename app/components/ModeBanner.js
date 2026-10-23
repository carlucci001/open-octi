'use client'

import { useCallback, useEffect, useState } from 'react'

export default function ModeBanner() {
  const [update, setUpdate] = useState(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  const check = useCallback(async () => {
    try {
      const response = await fetch('/api/openocti/update', { cache: 'no-store' })
      if (!response.ok) return
      const payload = await response.json()
      if (payload.updateAvailable || ['queued', 'backing_up', 'installing', 'verifying', 'failed'].includes(payload.installState)) setUpdate(payload)
      else setUpdate(null)
    } catch {}
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(check, 1800)
    return () => window.clearTimeout(timer)
  }, [check])

  useEffect(() => {
    if (!update || !['queued', 'backing_up', 'installing', 'verifying'].includes(update.installState)) return undefined
    const timer = window.setInterval(check, 5000)
    return () => window.clearInterval(timer)
  }, [check, update])

  async function install() {
    const confirmed = window.confirm(`Install ${update.product} ${update.latestVersion}? The host updater will create a private backup, install only the latest official release, restart the services, and verify health. The application may be unavailable briefly.`)
    if (!confirmed) return
    setBusy(true)
    setMessage('Sending the confirmed update request…')
    try {
      const response = await fetch('/api/openocti/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true, version: update.latestVersion }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'The update could not be started.')
      setMessage(`Update ${update.latestVersion} accepted. Backup and installation are running.`)
      await check()
    } catch (error) {
      setMessage(error.message)
    } finally {
      setBusy(false)
    }
  }

  if (!update) return null
  const running = ['queued', 'backing_up', 'installing', 'verifying'].includes(update.installState)
  return (
    <aside role="status" aria-live="polite" style={{ position: 'relative', zIndex: 1200, display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', padding: '9px 16px', background: 'var(--amber-soft)', color: 'var(--text)', borderBottom: '1px solid var(--amber)' }}>
      <strong>{running ? `${update.product} update in progress` : `${update.product} ${update.latestVersion} is available`}</strong>
      <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{message || update.installMessage || `Installed version: ${update.currentVersion}`}</span>
      {update.canInstall && !running ? <button type="button" disabled={busy} onClick={install} style={{ minHeight: 34, padding: '6px 12px', border: 0, borderRadius: 7, background: 'var(--accent)', color: 'var(--accent-text)', fontWeight: 700 }}>{busy ? 'Starting…' : 'Install update'}</button> : null}
      {!update.installReady && !running ? <a href="/help?topic=upgrades" style={{ color: 'var(--accent)', fontWeight: 700 }}>Enable one-click updates</a> : null}
      <a href={update.release?.url || '/help?topic=upgrades'} target={update.release?.url ? '_blank' : undefined} rel={update.release?.url ? 'noreferrer' : undefined} style={{ color: 'var(--text-muted)', fontSize: 13, textDecoration: 'underline' }}>Release details</a>
    </aside>
  )
}
