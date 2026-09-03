'use client'
import Link from 'next/link'
import { Send } from 'lucide-react'
import { useEffect, useState } from 'react'

const greeting = "Hi — I'm Octi. I can guide you through imports, agents, data storage, upgrades, and anything documented in this OpenOcti package."

export default function OpenOctiGuidePanel({ compact = false }) {
  const [enabled, setEnabled] = useState(false); const [messages, setMessages] = useState([{ role: 'assistant', content: greeting }]); const [input, setInput] = useState(''); const [busy, setBusy] = useState(false)
  const refresh = () => fetch('/api/platform-admin/v1/capabilities', { cache: 'no-store' }).then(response => response.json()).then(data => setEnabled((data.capabilities || []).some(item => ['anthropic', 'openai', 'gemini', 'openrouter'].includes(item.id) && item.status === 'configured'))).catch(() => {})
  useEffect(() => { refresh(); window.addEventListener('openocti:key-saved', refresh); return () => window.removeEventListener('openocti:key-saved', refresh) }, [])
  const send = async event => {
    event.preventDefault(); const text = input.trim(); if (!text || busy || !enabled) return
    const next = [...messages, { role: 'user', content: text }]; setMessages(next); setInput(''); setBusy(true)
    try {
      const response = await fetch('/api/agent/openclaw-chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: next, section: 'settings', operatorTool: { agentId: 'octi', role: 'OpenOcti onboarding guide', runtimeProvider: 'openclaw-hetzner' } }) })
      const raw = await response.text(); let answer = ''
      if ((response.headers.get('content-type') || '').includes('text/event-stream')) for (const match of raw.matchAll(/^data:\s*(.+)$/gm)) { try { const data = JSON.parse(match[1]); if (data.text) answer = data.text; if (data.error) answer = data.error } catch {} }
      else { try { const data = JSON.parse(raw); answer = data.text || data.error || '' } catch {} }
      setMessages([...next, { role: 'assistant', content: answer || 'I could not complete that answer. Please try again.' }])
    } catch (reason) { setMessages([...next, { role: 'assistant', content: reason.message }]) } finally { setBusy(false) }
  }
  return <section className="rounded-xl p-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}><h2 className="font-semibold">Ask Octi</h2>{!enabled ? <p className="text-sm mt-2" style={{ color: 'var(--text-muted)' }}>Octi needs one model key. <Link href="/settings/models#anthropic" style={{ color: 'var(--accent)', fontWeight: 700 }}>Add a key in Models &amp; Keys</Link>.</p> : <><div className="mt-3 grid gap-2 overflow-auto" style={{ maxHeight: compact ? 180 : 280 }}>{messages.map((message, index) => <div key={index} className="rounded-lg p-3 text-sm" style={{ justifySelf: message.role === 'user' ? 'end' : 'start', maxWidth: '90%', background: message.role === 'user' ? 'var(--accent-soft)' : 'var(--surface2)' }}>{message.content}</div>)}</div><form onSubmit={send} className="mt-3 flex gap-2"><input value={input} onChange={event => setInput(event.target.value)} placeholder="Ask how OpenOcti works…" className="flex-1 rounded-lg px-3" style={{ minHeight: 46, background: 'var(--surface2)', border: '1px solid var(--border)' }} /><button disabled={busy} aria-label="Send to Octi" className="rounded-lg px-4" style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}><Send size={18} /></button></form></>}</section>
}
