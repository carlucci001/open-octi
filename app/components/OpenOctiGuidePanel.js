'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { searchSetupHelp, SETUP_HELP } from '@/lib/openocti-setup-help'
import OpenOctiVoiceGuide from './OpenOctiVoiceGuide'
import { resolveOpenOctiAssistant } from '@/lib/openocti-assistant'

const control = { minHeight: 48, border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', background: 'var(--surface2)', color: 'var(--text)' }
const PROGRESS_KEY = 'openocti-setup-reading-v1'
const evidenceLabel = value => value === 'accepted' ? 'accepted by Postiz' : value === 'confirmed_by_user' ? 'confirmed by you' : 'not verified'

export default function OpenOctiGuidePanel({ compact = false, initialPrompt = '' }) {
  const [query, setQuery] = useState('')
  const [reviewed, setReviewed] = useState([])
  const [diagnostics, setDiagnostics] = useState(null)
  const [enabled, setEnabled] = useState(false)
  const [message, setMessage] = useState(initialPrompt)
  const [history, setHistory] = useState([])
  const [answer, setAnswer] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [checking, setChecking] = useState(false)
  async function refresh() {
    setChecking(true)
    try {
      const response = await fetch('/api/openocti/postiz', { cache: 'no-store' })
      const data = await response.json()
      setDiagnostics(response.ok && data.ok ? data.diagnostics : null)
    } catch { setDiagnostics(null) }
    try {
      const response = await fetch('/api/platform-admin/v1/capabilities', { cache: 'no-store' })
      const data = await response.json()
      setEnabled(Boolean(resolveOpenOctiAssistant(data.capabilities || []).textProvider))
    } catch { setEnabled(false) }
    setChecking(false)
  }
  useEffect(() => {
    try { const saved = JSON.parse(localStorage.getItem(PROGRESS_KEY) || '[]'); if (Array.isArray(saved)) setReviewed(saved.filter(id => SETUP_HELP.some(topic => topic.id === id))) } catch {}
    const topic = new URLSearchParams(window.location.search).get('topic')
    if (topic) setQuery(topic)
    refresh()
    window.addEventListener('openocti:key-saved', refresh)
    return () => window.removeEventListener('openocti:key-saved', refresh)
  }, [])
  function markReviewed(id) {
    const next = reviewed.includes(id) ? reviewed.filter(value => value !== id) : [...reviewed, id]
    setReviewed(next)
    try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(next)) } catch {}
  }
  async function ask(event) {
    event.preventDefault()
    if (!message.trim() || busy) return
    setBusy(true); setAnswer(''); setError('')
    try {
      const response = await fetch('/api/openocti/help/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ message: message.trim(), history }) })
      const data = await response.json()
      if (!response.ok || !data.ok) throw new Error('unavailable')
      setAnswer(data.text)
      setHistory(previous => [...previous, { role: 'user', content: message.trim() }, { role: 'assistant', content: data.text }].slice(-12))
      setMessage('')
    } catch { setError('Octi could not answer with a model. Check Models & Keys; the built-in topics below still work.') }
    finally { setBusy(false) }
  }
  const topics = searchSetupHelp(query)
  return <section aria-labelledby="octi-help-heading" className="rounded-xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
    <h2 id="octi-help-heading" className="text-xl font-semibold">Ask Octi · Getting started</h2>
    <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>Built-in guidance works without an AI key. Follow one step, check its result, then continue.</p>
    <div className="mt-4 rounded-lg p-4" style={{ background: 'var(--surface2)' }}>
      <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">Your next Postiz step</h3><button type="button" disabled={checking} onClick={refresh} style={control}>{checking ? 'Checking…' : 'Recheck setup'}</button></div>
      <p className="mt-2" role="status">{diagnostics?.next || 'Sign in as an administrator to check this installation. You can read every help topic below without signing in.'}</p>
      {diagnostics && <><p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>Service: {diagnostics.installed === 'bundled' ? 'included in Docker' : 'external or not yet checked'} · Configuration: {diagnostics.configured ? 'saved' : 'needed'} · Reachable: {diagnostics.reachable === null ? 'not checked' : diagnostics.reachable ? 'yes' : 'no'} · Enabled channels: {diagnostics.channelCount ?? 'not checked'} · Scheduled: {evidenceLabel(diagnostics.scheduled)} · Published: {evidenceLabel(diagnostics.published)}</p><Link className="mt-3 inline-flex items-center underline" style={{ minHeight: 48 }} href="/settings/postiz">Open Postiz settings</Link></>}
    </div>
    <form onSubmit={ask} className="mt-5">
      <h3 className="font-semibold">Conversational help <span className="text-sm font-normal">· model-generated answers</span></h3>
      <p className="text-sm mt-1">{enabled ? 'Answers use this version’s bundled guidance and sanitized Postiz checks. Keep API keys in settings.' : 'Add a supported provider in Models & Keys when you want conversational answers. You can search the built-in help now.'}</p>
      <div className="mt-2 flex flex-wrap gap-2"><input aria-label="Question for Octi" maxLength={2000} value={message} onChange={event => setMessage(event.target.value)} placeholder="What should I do next?" style={{ ...control, flex: '1 1 230px' }} /><button disabled={!enabled || busy || !message.trim()} style={{ ...control, opacity: !enabled || busy ? .6 : 1 }}>{busy ? 'Asking…' : 'Ask Octi'}</button></div>
      <div className="mt-3 grid gap-2" aria-label="Conversation with Octi">{history.map((item, index) => <p key={index} className="whitespace-pre-wrap rounded-lg p-3" style={{ background: 'var(--surface2)' }}><strong>{item.role === 'user' ? 'You: ' : 'Octi: '}</strong>{item.content}</p>)}</div>
      {answer && <p className="sr-only" role="status">{answer}</p>}
      {error && <p className="mt-3" role="alert">{error}</p>}
      <Link href="/settings/models" className="inline-flex items-center underline text-sm" style={{ minHeight: 48 }}>Models &amp; Keys</Link>
    </form>
    <OpenOctiVoiceGuide />
    <div className="mt-4"><label className="font-semibold" htmlFor="octi-help-search">Search built-in help</label><input id="octi-help-search" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Try Facebook, invalid key, image upload…" className="mt-2 w-full" style={control} /></div>
    <p className="text-sm mt-2" style={{ color: 'var(--text-muted)' }}>{reviewed.length} of {SETUP_HELP.length} topics reviewed on this browser. Reading progress does not verify setup or publishing.</p>
    <div className="mt-3 grid gap-3" style={compact ? { maxHeight: 440, overflowY: 'auto' } : undefined}>
      {topics.map(topic => <details key={topic.id} className="rounded-lg p-3" style={{ border: '1px solid var(--border)' }}>
        <summary className="font-semibold cursor-pointer py-3">{topic.title}{reviewed.includes(topic.id) ? ' · reviewed' : ''}</summary>
        <ol className="list-decimal pl-6 grid gap-2 mt-2">{topic.steps.map(step => <li key={step}>{step}</li>)}</ol>
        <p className="mt-3"><strong>Expected result: </strong>{topic.expected}</p>
        <div className="mt-3 flex flex-wrap gap-3 items-center"><Link href={topic.href} className="underline inline-flex items-center" style={{ minHeight: 48 }}>Open related screen</Link><button type="button" aria-pressed={reviewed.includes(topic.id)} onClick={() => markReviewed(topic.id)} style={control}>{reviewed.includes(topic.id) ? 'Mark unread' : 'Mark topic reviewed'}</button></div>
      </details>)}
      {!topics.length && <p>No matching topic. Clear the search to see the full setup guide.</p>}
    </div>
    <p className="mt-4 text-sm"><a href="/help/getting-started.md" download className="underline">Download the written guide</a></p>
  </section>
}
