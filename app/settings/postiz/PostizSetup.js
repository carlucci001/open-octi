'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'

const control = { minHeight: 48, padding: '10px 14px', border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface2)', color: 'var(--text)' }
export default function PostizSetup() {
  const [base, setBase] = useState('')
  const [publicUrl, setPublicUrl] = useState('')
  const [key, setKey] = useState('')
  const [keyPresent, setKeyPresent] = useState(false)
  const [diagnostics, setDiagnostics] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [allowed, setAllowed] = useState(false)
  async function load() {
    setBusy(true); setError('')
    try {
      const response = await fetch('/api/openocti/postiz', { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) throw new Error([401, 403].includes(response.status) ? 'Sign in as an administrator to configure Postiz.' : 'Postiz settings could not be loaded.')
      setAllowed(true); setBase(data.settings.base); setPublicUrl(data.settings.publicUrl); setKeyPresent(data.settings.keyPresent); setDiagnostics(data.diagnostics)
    } catch (reason) { setError(reason.message) }
    finally { setBusy(false) }
  }
  useEffect(() => { load() }, [])
  async function save(event) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const response = await fetch('/api/openocti/postiz', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ base, publicUrl, key }) })
      const data = await response.json()
      if (!response.ok || !data.ok) throw new Error(data.error || 'Settings could not be saved.')
      setKey(''); setKeyPresent(true); setDiagnostics(data.diagnostics)
      window.dispatchEvent(new CustomEvent('openocti:key-saved'))
    } catch (reason) { setError(reason.message) }
    finally { setBusy(false) }
  }
  let dashboard = ''
  async function confirmPublished() {
    setBusy(true); setError('')
    try {
      const response = await fetch('/api/openocti/postiz', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'confirm-published' }) })
      const data = await response.json()
      if (!response.ok || !data.ok) throw new Error(data.error || 'Confirmation could not be saved.')
      setDiagnostics(data.diagnostics)
    } catch (reason) { setError(reason.message) }
    finally { setBusy(false) }
  }
  try { const url = new URL(publicUrl); if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password) dashboard = url.toString() } catch {}
  return <main className="mx-auto p-6" style={{ maxWidth: 820 }}>
    <Link href="/help" className="underline inline-flex items-center mb-4" style={{ minHeight: 48 }}>Ask Octi · Getting started</Link>
    <h1 className="text-2xl font-semibold">Postiz settings</h1>
    <p className="mt-2">Connect this workspace to your own Postiz installation. Its account and social connections are separate from your OpenOcti sign-in.</p>
    {error && <p role="alert" className="mt-4">{error}</p>}
    {allowed && <form onSubmit={save} className="grid gap-4 mt-5 rounded-xl p-5" style={{ border: '1px solid var(--border)' }}>
      <label>Public API URL<input type="url" required value={base} onChange={event => setBase(event.target.value)} className="block mt-1 w-full" style={control} /><span className="text-sm">Docker: http://postiz:5000/api/public/v1 · Plain Node: use the reachable Postiz host and /api/public/v1.</span></label>
      <label>Dashboard URL<input type="url" required value={publicUrl} onChange={event => setPublicUrl(event.target.value)} className="block mt-1 w-full" style={control} /><span className="text-sm">The address your browser uses, usually http://localhost:4007 for a local install.</span></label>
      <label>Public API key<input type="password" autoComplete="new-password" required={!keyPresent} value={key} onChange={event => setKey(event.target.value)} placeholder={keyPresent ? 'Saved securely; leave blank to keep it' : 'Paste the key from your Postiz account'} className="block mt-1 w-full" style={control} /><span className="text-sm">Encrypted in this installation’s data directory. Never paste this key into chat.</span></label>
      <div className="flex flex-wrap gap-3"><button disabled={busy} style={control}>{busy ? 'Checking…' : 'Save and check connection'}</button><button type="button" disabled={busy} onClick={load} style={control}>Recheck saved settings</button>{dashboard && <a href={dashboard} target="_blank" rel="noreferrer" style={control}>Open Postiz dashboard</a>}</div>
    </form>}
    {diagnostics && <section className="mt-5 rounded-xl p-5" style={{ background: 'var(--surface2)' }}><h2 className="font-semibold">Connection result</h2><p className="mt-2" role="status">{diagnostics.next}</p><dl className="mt-3 grid grid-cols-2 gap-2"><dt>Configured</dt><dd>{diagnostics.configured ? 'Yes' : 'No'}</dd><dt>Service reachable</dt><dd>{diagnostics.reachable === null ? 'Not checked' : diagnostics.reachable ? 'Yes' : 'No'}</dd><dt>Enabled channels</dt><dd>{diagnostics.channelCount ?? 'Not checked'}</dd><dt>Scheduled test</dt><dd>{diagnostics.scheduled === 'accepted' ? 'Accepted by Postiz' : 'Not verified'}</dd><dt>Published test</dt><dd>{diagnostics.published === 'confirmed_by_user' ? 'Confirmed by you on the destination platform' : 'Not verified'}</dd></dl><Link href={`/help?topic=${diagnostics.topic}`} className="underline inline-flex items-center mt-3" style={{ minHeight: 48 }}>Read the next step</Link>{diagnostics.scheduled === 'accepted' && diagnostics.published !== 'confirmed_by_user' && <div className="mt-3"><p className="mb-2 text-sm">First open the destination platform and verify the caption and image. This records your confirmation; it does not publish anything.</p><button disabled={busy} type="button" onClick={confirmPublished} style={control}>I verified the published test on the social platform</button></div>}</section>}
  </main>
}
