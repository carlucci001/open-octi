'use client'

import { useMemo, useRef, useState } from 'react'

const ELEVENLABS_CDN = 'https://unpkg.com/@elevenlabs/client@1.3.1/dist/lib.iife.js'

function loadElevenLabsClient() {
  if (typeof window === 'undefined') return Promise.reject(new Error('Browser only'))
  if (window.ElevenLabsClient) return Promise.resolve(window.ElevenLabsClient)
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-elevenlabs-client="true"]')
    if (existing) {
      existing.addEventListener('load', () => resolve(window.ElevenLabsClient))
      existing.addEventListener('error', () => reject(new Error('Could not load voice library')))
      return
    }
    const script = document.createElement('script')
    script.src = ELEVENLABS_CDN
    script.async = true
    script.dataset.elevenlabsClient = 'true'
    script.onload = () => window.ElevenLabsClient ? resolve(window.ElevenLabsClient) : reject(new Error('Voice library loaded without client'))
    script.onerror = () => reject(new Error('Could not load voice library'))
    document.head.appendChild(script)
  })
}

function initialForm() {
  return { name: '', email: '', phone: '', when: '', message: '' }
}

function actionTitle(action) {
  if (action === 'callback') return 'Request a callback'
  if (action === 'news-tip') return 'Send a news tip'
  if (action === 'email') return 'Send a note'
  return 'Send a handoff'
}

function actionHelp(action) {
  if (action === 'callback') return 'Leave a good phone number and a time window.'
  if (action === 'news-tip') return 'Give the short version first. Add what, where, when, and how we can reach you.'
  if (action === 'email') return 'Send the front desk a note and contact detail.'
  return 'Send the details and the recent chat.'
}

export default function AgentWidgetPanel({ agent, theme = 'light' }) {
  const dark = theme === 'dark'
  const [view, setView] = useState('chat')
  const [messages, setMessages] = useState([
    { role: 'assistant', content: agent.greeting || `Hi, I am ${agent.name}. What can I help you figure out today?` },
  ])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState(initialForm())
  const [sent, setSent] = useState(null)
  const [voiceState, setVoiceState] = useState({ starting: false, live: false, error: '' })
  const voiceSessionRef = useRef(null)
  const bodyRef = useRef(null)

  const palette = useMemo(() => {
    if (agent.brand === 'wnc-times') {
      return {
        ink: dark ? '#f8fafc' : '#111827',
        muted: dark ? '#cbd5e1' : '#5b6472',
        bg: dark ? '#0d1723' : '#f8fafc',
        panel: dark ? '#132033' : '#ffffff',
        line: dark ? 'rgba(148, 163, 184, .24)' : 'rgba(17, 24, 39, .14)',
        accent: '#b42318',
        accentText: '#ffffff',
        soft: dark ? 'rgba(180, 35, 24, .16)' : 'rgba(180, 35, 24, .08)',
        secondary: '#1f6feb',
      }
    }
    return {
      ink: dark ? '#f7f1e8' : '#17130f',
      muted: dark ? '#c7bcae' : '#685f55',
      bg: dark ? '#17130f' : '#fffaf2',
      panel: dark ? '#211b16' : '#fffdf8',
      line: dark ? 'rgba(245, 158, 11, .28)' : 'rgba(61, 48, 35, .16)',
      accent: '#f59e0b',
      accentText: '#1b1208',
      soft: dark ? 'rgba(245, 158, 11, .12)' : 'rgba(245, 158, 11, .14)',
      secondary: '#2563eb',
    }
  }, [agent.brand, dark])

  function scrollDown() {
    setTimeout(() => {
      if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight
    }, 20)
  }

  async function send(text) {
    const value = String(text || input || '').trim()
    if (!value || busy) return
    const next = [...messages, { role: 'user', content: value }]
    setMessages(next)
    setInput('')
    setBusy(true)
    setError('')
    setView('chat')
    try {
      const r = await fetch('/api/agent-widget/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent: agent.id, messages: next }),
      })
      const j = await r.json()
      if (!r.ok || j.ok === false) throw new Error(j.error || 'Message failed')
      setMessages([...next, { role: 'assistant', content: j.text || 'I have that. Tell me a little more.' }])
      scrollDown()
    } catch (e) {
      setError('Connection dropped. Try again, or use one of the handoff buttons.')
      setMessages([...next, { role: 'assistant', content: 'I lost the connection for a moment. Try once more, or send your details with the buttons below.' }])
    } finally {
      setBusy(false)
    }
  }

  async function startVoice() {
    if (!agent.voiceEnabled) return
    if (voiceSessionRef.current || voiceState.starting) {
      setView('voice')
      return
    }
    setView('voice')
    setVoiceState({ starting: true, live: false, error: '' })
    try {
      const r = await fetch(`/api/agent-widget/voice-token?agent=${encodeURIComponent(agent.id)}`, { cache: 'no-store' })
      const j = await r.json()
      if (!r.ok || !j.signedUrl) throw new Error(j.error || 'Voice is not available yet.')
      const lib = await loadElevenLabsClient()
      if (!lib?.Conversation) throw new Error('Voice client is not available.')
      const session = await lib.Conversation.startSession({
        signedUrl: j.signedUrl,
        onConnect: () => setVoiceState({ starting: false, live: true, error: '' }),
        onDisconnect: () => {
          voiceSessionRef.current = null
          setVoiceState({ starting: false, live: false, error: '' })
          setView('chat')
        },
        onError: e => setVoiceState({ starting: false, live: false, error: e?.message || 'Voice error' }),
      })
      voiceSessionRef.current = session
    } catch (e) {
      voiceSessionRef.current = null
      setVoiceState({ starting: false, live: false, error: e.message })
    }
  }

  async function stopVoice() {
    const session = voiceSessionRef.current
    voiceSessionRef.current = null
    setVoiceState({ starting: false, live: false, error: '' })
    try {
      if (session?.endSession) await session.endSession()
    } catch {}
    setView('chat')
  }

  function openForm(action) {
    setError('')
    setSent(null)
    setView(action)
  }

  function updateForm(key, value) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  async function submitForm(action) {
    setBusy(true)
    setError('')
    try {
      const r = await fetch('/api/agent-widget/handoff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent: agent.id, action, transcript: messages, ...form }),
      })
      const j = await r.json()
      if (!r.ok || j.ok === false) throw new Error(j.error || 'Could not send the handoff.')
      setSent(j)
      setForm(initialForm())
      setView('sent')
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const actions = (agent.actions || []).filter(action => action.id !== 'voice' || agent.voiceEnabled)

  return (
    <main style={{
      minHeight: '100vh',
      margin: 0,
      background: palette.bg,
      color: palette.ink,
      fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif',
      display: 'grid',
      gridTemplateRows: 'auto 1fr auto',
    }}>
      <header style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 16, borderBottom: `1px solid ${palette.line}`, background: palette.panel }}>
        <img src={agent.avatarUrl} alt={agent.name} style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${palette.accent}` }} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 850, lineHeight: 1.1 }}>{agent.name}</div>
          <div style={{ fontSize: 12.5, color: palette.muted, marginTop: 3 }}>{agent.title}</div>
        </div>
      </header>

      <section ref={bodyRef} style={{ overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {view === 'chat' && (
          <>
            {messages.map((m, idx) => (
              <div key={idx} style={{
                alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                maxWidth: '86%',
                padding: '11px 13px',
                borderRadius: m.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                background: m.role === 'user' ? palette.accent : palette.panel,
                color: m.role === 'user' ? palette.accentText : palette.ink,
                border: m.role === 'user' ? '0' : `1px solid ${palette.line}`,
                fontSize: 14,
                lineHeight: 1.45,
              }}>{m.content}</div>
            ))}
            {messages.length <= 1 && (
              <div style={{ display: 'grid', gap: 8, marginTop: 4 }}>
                {(agent.quickQuestions || []).map(q => (
                  <button key={q} type="button" onClick={() => send(q)} style={{ border: `1px solid ${palette.line}`, background: palette.soft, color: palette.ink, borderRadius: 8, padding: '10px 11px', textAlign: 'left', fontWeight: 700, cursor: 'pointer' }}>{q}</button>
                ))}
              </div>
            )}
            {busy && <div style={{ color: palette.muted, fontSize: 13 }}>{agent.name} is typing...</div>}
          </>
        )}

        {view === 'voice' && (
          <div style={{ minHeight: '100%', display: 'grid', placeItems: 'center', textAlign: 'center', gap: 16, padding: '30px 10px' }}>
            <img src={agent.avatarUrl} alt={agent.name} style={{ width: 132, height: 132, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${palette.accent}`, boxShadow: voiceState.live ? `0 0 0 14px ${palette.soft}` : 'none' }} />
            <div style={{ fontSize: 22, fontWeight: 850 }}>{voiceState.live ? `${agent.name} is listening` : 'Connecting voice'}</div>
            <div style={{ maxWidth: 260, color: palette.muted, fontSize: 13 }}>Speak naturally. End the call when you are done.</div>
            {voiceState.error && <div style={{ color: '#b91c1c', fontSize: 13 }}>{voiceState.error}</div>}
            <button type="button" onClick={stopVoice} style={{ minHeight: 42, border: 0, borderRadius: 8, padding: '0 18px', background: palette.accent, color: palette.accentText, fontWeight: 850, cursor: 'pointer' }}>End Call</button>
          </div>
        )}

        {['email', 'callback', 'news-tip'].includes(view) && (
          <div style={{ display: 'grid', gap: 11 }}>
            <div>
              <h2 style={{ fontSize: 22, lineHeight: 1.1, margin: 0 }}>{actionTitle(view)}</h2>
              <p style={{ color: palette.muted, margin: '6px 0 0', fontSize: 13 }}>{actionHelp(view)}</p>
            </div>
            <Field label="Your name" value={form.name} onChange={v => updateForm('name', v)} palette={palette} />
            <Field label="Email" type="email" value={form.email} onChange={v => updateForm('email', v)} palette={palette} />
            {(view === 'callback' || view === 'news-tip') && <Field label="Phone" type="tel" value={form.phone} onChange={v => updateForm('phone', v)} palette={palette} />}
            {view === 'callback' && <Field label="Best time to call" value={form.when} onChange={v => updateForm('when', v)} palette={palette} placeholder="Example: Tuesday afternoon" />}
            <Field label={view === 'news-tip' ? 'What happened?' : 'Brief'} multiline value={form.message} onChange={v => updateForm('message', v)} palette={palette} />
            {error && <div style={{ color: '#b91c1c', fontSize: 13 }}>{error}</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => setView('chat')} style={ghostButton(palette)}>Back</button>
              <button type="button" disabled={busy} onClick={() => submitForm(view)} style={{ ...primaryButton(palette), flex: 1 }}>{busy ? 'Sending...' : 'Send'}</button>
            </div>
          </div>
        )}

        {view === 'sent' && (
          <div style={{ minHeight: '100%', display: 'grid', placeItems: 'center', textAlign: 'center', gap: 14, padding: 24 }}>
            <img src={agent.avatarUrl} alt={agent.name} style={{ width: 96, height: 96, borderRadius: '50%', objectFit: 'cover', border: `2px solid ${palette.accent}` }} />
            <h2 style={{ margin: 0, fontSize: 25 }}>Got it.</h2>
            <p style={{ margin: 0, color: palette.muted, lineHeight: 1.45 }}>{sent?.message || 'The handoff is logged.'}</p>
            <button type="button" onClick={() => setView('chat')} style={primaryButton(palette)}>Back to chat</button>
          </div>
        )}
      </section>

      <footer style={{ padding: 12, borderTop: `1px solid ${palette.line}`, background: palette.panel }}>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, actions.length)}, minmax(0, 1fr))`, gap: 6, marginBottom: 9 }}>
          {actions.map(action => (
            <button key={action.id} type="button" onClick={() => action.id === 'voice' ? startVoice() : openForm(action.id)} style={ghostButton(palette)}>{action.label}</button>
          ))}
        </div>
        <form onSubmit={e => { e.preventDefault(); send() }} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8 }}>
          <input value={input} onChange={e => setInput(e.target.value)} placeholder={`Message ${agent.name}`} style={{ minHeight: 42, borderRadius: 8, border: `1px solid ${palette.line}`, padding: '0 12px', background: dark ? '#0b1220' : '#ffffff', color: palette.ink, fontSize: 14 }} />
          <button disabled={busy || !input.trim()} style={{ ...primaryButton(palette), opacity: busy || !input.trim() ? .62 : 1 }}>Send</button>
        </form>
      </footer>
    </main>
  )
}

function Field({ label, value, onChange, palette, type = 'text', placeholder = '', multiline = false }) {
  const style = {
    width: '100%',
    minHeight: multiline ? 96 : 42,
    resize: multiline ? 'vertical' : 'none',
    borderRadius: 8,
    border: `1px solid ${palette.line}`,
    background: '#ffffff',
    color: '#111827',
    padding: multiline ? '10px 12px' : '0 12px',
    fontSize: 14,
    lineHeight: 1.45,
  }
  return (
    <label style={{ display: 'grid', gap: 5, fontSize: 12, color: palette.muted, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.04em' }}>
      {label}
      {multiline
        ? <textarea value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} style={style} />
        : <input type={type} value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} style={style} />}
    </label>
  )
}

function primaryButton(palette) {
  return {
    minHeight: 42,
    border: 0,
    borderRadius: 8,
    padding: '0 15px',
    background: palette.accent,
    color: palette.accentText,
    fontWeight: 850,
    cursor: 'pointer',
  }
}

function ghostButton(palette) {
  return {
    minHeight: 38,
    border: `1px solid ${palette.line}`,
    borderRadius: 8,
    padding: '0 10px',
    background: palette.soft,
    color: palette.ink,
    fontWeight: 800,
    cursor: 'pointer',
    fontSize: 12.5,
  }
}
