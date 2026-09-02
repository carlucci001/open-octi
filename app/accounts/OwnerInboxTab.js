'use client'

import { useEffect, useMemo, useState } from 'react'
import { Archive, Check, Inbox, Mail, RefreshCw, ShieldCheck, Trash2, X } from 'lucide-react'
import ThemedSelect from '../components/ThemedSelect'

function fmtDate(value) {
  if (!value) return ''
  try { return new Date(value).toLocaleString() } catch { return value }
}

function toneColor(priority) {
  if (priority === 'high') return 'var(--red)'
  if (priority === 'medium') return 'var(--peach)'
  return 'var(--text-muted)'
}

function messageText(message) {
  const raw = message?.body || message?.html || message?.snippet || ''
  return String(raw)
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

export default function OwnerInboxTab({ account }) {
  const [inbox, setInbox] = useState('all')
  const [messages, setMessages] = useState([])
  const [inboxes, setInboxes] = useState([])
  const [status, setStatus] = useState({})
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [notice, setNotice] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [loadingDetail, setLoadingDetail] = useState(false)

  const inboxOptions = useMemo(() => [
    { id: 'all', label: 'All inboxes' },
    ...inboxes.map(item => ({ id: item.id, label: item.label })),
  ], [inboxes])
  const selectedMessage = useMemo(() => messages.find(message => message.id === selectedId) || null, [messages, selectedId])

  const load = async (nextInbox = inbox) => {
    setLoading(true)
    try {
      const response = await fetch(`/api/owner-inbox?inbox=${encodeURIComponent(nextInbox)}`, { cache: 'no-store' })
      const data = await response.json()
      setMessages(data.messages || [])
      setInboxes(data.inboxes || data.status?.inboxes || [])
      if (data.status) setStatus(data.status)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(inbox) }, [inbox])

  const sync = async () => {
    setSyncing(true)
    setNotice('')
    try {
      const response = await fetch('/api/owner-inbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync_nylas', inbox, limit: 30 }),
      })
      const data = await response.json()
      setMessages(data.messages || [])
      setInboxes(data.inboxes || data.status?.inboxes || [])
      if (data.status) setStatus(data.status)
      const result = data.result || {}
      setNotice(result.ok === false ? result.error || 'Inbox sync needs Nylas configuration.' : `Scanned ${result.scanned || 0}; imported ${result.imported || 0}.`)
    } finally {
      setSyncing(false)
    }
  }

  const update = async (action, id) => {
    const response = await fetch('/api/owner-inbox', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, id, inbox }),
    })
    const data = await response.json()
    if (Array.isArray(data.messages)) setMessages(data.messages)
    else await load()
    if (action === 'delete' && selectedId === id) setSelectedId('')
  }

  const openMessage = async (message) => {
    setSelectedId(message.id)
    if (message.unread) update('mark_read', message.id)
    if (message.detailLoadedAt || message.provider !== 'nylas') return
    setLoadingDetail(true)
    try {
      const response = await fetch('/api/owner-inbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'load_detail', id: message.id, inbox }),
      })
      const data = await response.json()
      if (Array.isArray(data.messages)) setMessages(data.messages)
      if (data.status) setStatus(data.status)
    } finally {
      setLoadingDetail(false)
    }
  }

  const detailDrawer = selectedMessage && (
    <div style={{ position: 'fixed', inset: 0, zIndex: 80, display: 'flex', justifyContent: 'flex-end' }}>
      <button type="button" aria-label="Close message drawer" onClick={() => setSelectedId('')} style={{ position: 'absolute', inset: 0, border: 0, background: 'rgba(0,0,0,0.42)' }} />
      <aside style={{ position: 'relative', width: 'min(720px, 96vw)', height: '100%', background: 'var(--surface)', borderLeft: '1px solid var(--border)', boxShadow: '0 18px 60px rgba(0,0,0,0.34)', display: 'flex', flexDirection: 'column' }}>
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
        <div style={{ minWidth: 0 }}>
          <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>{selectedMessage.inboxLabel} · {fmtDate(selectedMessage.receivedAt)}</div>
          <div style={{ fontWeight: 850, color: 'var(--text)' }}>{selectedMessage.subject}</div>
          <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            From {selectedMessage.from || 'unknown sender'} to {(selectedMessage.to || []).join(', ') || selectedMessage.domain}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {selectedMessage.from && (
            <a href={`mailto:${selectedMessage.from}?subject=${encodeURIComponent(`Re: ${selectedMessage.subject || ''}`)}`} data-tooltip="Reply in mail app" className="p-2 rounded-lg" style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}>
              <Mail size={15} />
            </a>
          )}
            <button type="button" onClick={() => update('archive', selectedMessage.id)} data-tooltip="Archive" className="p-2 rounded-lg" style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>
              <Archive size={15} />
            </button>
            <button type="button" onClick={() => update('delete', selectedMessage.id)} data-tooltip="Delete junk" className="p-2 rounded-lg" style={{ background: 'var(--red-soft)', color: 'var(--red)' }}>
              <Trash2 size={15} />
            </button>
            <button type="button" onClick={() => setSelectedId('')} data-tooltip="Close" className="p-2 rounded-lg" style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>
              <X size={15} />
          </button>
        </div>
      </div>
      <div className="p-4 text-sm" style={{ color: 'var(--text)', whiteSpace: 'pre-wrap', lineHeight: 1.55, overflow: 'auto', flex: 1 }}>
        {loadingDetail ? 'Loading full message...' : messageText(selectedMessage) || 'No message body was available from the provider.'}
      </div>
      </aside>
    </div>
  )

  return (
    <div className="space-y-4">
      <div style={{ border: '1px solid var(--border)', background: 'var(--surface)', borderRadius: 8, padding: 16 }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2" style={{ fontWeight: 800, color: 'var(--text)' }}>
              <ShieldCheck size={17} /> Admin inbox
            </div>
            <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              {account?.name || 'Owner'} is always in admin mode. Legitimate mail is scanned for opportunities across the monitored domains.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemedSelect value={inbox} onChange={e => setInbox(e.target.value)} style={{ minWidth: 210, fontSize: 13 }}>
              {inboxOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}
            </ThemedSelect>
            <button type="button" onClick={sync} disabled={syncing} data-tooltip="Scan connected Nylas inboxes" className="p-2 rounded-lg" style={{ background: 'var(--accent)', color: 'var(--accent-text)', opacity: syncing ? 0.65 : 1 }}>
              <RefreshCw size={16} />
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          {inboxes.map(item => (
            <span key={item.id} className="text-xs px-2 py-1 rounded-md" style={{ border: '1px solid var(--border)', color: 'var(--text-muted)', background: 'var(--surface2)' }}>
              {item.label}: {item.domains?.join(', ')}
            </span>
          ))}
        </div>
        <div className="text-xs mt-3" style={{ color: status.nylasConfigured ? 'var(--green)' : 'var(--peach)' }}>
          {status.nylasConfigured ? `Nylas configured${status.configuredGrantCount ? ` with ${status.configuredGrantCount} grant(s)` : '; grants will be discovered on sync'}.` : 'Nylas is not configured in env/vault yet; the inbox is ready but cannot scan mail.'}
        </div>
        {notice && <div className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>{notice}</div>}
      </div>

      {detailDrawer}

      <div style={{ border: '1px solid var(--border)', background: 'var(--surface)', borderRadius: 8, overflow: 'hidden' }}>
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2" style={{ fontWeight: 800 }}><Inbox size={16} /> Opportunity scan</div>
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{messages.length} visible</div>
        </div>
        {loading ? (
          <div className="p-6 text-sm" style={{ color: 'var(--text-muted)' }}>Loading inbox...</div>
        ) : messages.length === 0 ? (
          <div className="p-6 text-sm" style={{ color: 'var(--text-muted)' }}>No legitimate messages captured for this inbox yet.</div>
        ) : messages.map(message => (
          <div key={message.id} className="px-4 py-3" role="button" tabIndex={0} onClick={() => openMessage(message)} onKeyDown={e => { if (e.key === 'Enter') openMessage(message) }} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', background: selectedId === message.id ? 'var(--surface2)' : 'transparent' }}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="flex flex-wrap items-center gap-2">
                  {message.unread && <span style={{ width: 8, height: 8, borderRadius: 999, background: 'var(--accent)', display: 'inline-block' }} />}
                  <strong style={{ color: 'var(--text)' }}>{message.subject}</strong>
                  <span className="text-xs px-2 py-0.5 rounded-md" style={{ background: 'var(--surface2)', color: toneColor(message.classification?.priority), border: '1px solid var(--border)' }}>
                    {message.classification?.category || 'legitimate'}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{message.inboxLabel}</span>
                </div>
                <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                  {message.from || 'unknown sender'} {' -> '} {(message.to || []).join(', ') || message.domain} {' | '} {fmtDate(message.receivedAt)}
                </div>
                {message.snippet && <div className="text-sm mt-2" style={{ color: 'var(--text)' }}>{message.snippet}</div>}
                {!!message.classification?.opportunitySignals?.length && (
                  <div className="text-xs mt-2" style={{ color: 'var(--green)' }}>
                    Signals: {message.classification.opportunitySignals.join(', ')}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button type="button" onClick={e => { e.stopPropagation(); openMessage(message) }} data-tooltip="Open message" className="p-2 rounded-lg" style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>
                  <Mail size={15} />
                </button>
                <button type="button" onClick={e => { e.stopPropagation(); update('mark_read', message.id) }} data-tooltip="Mark read" className="p-2 rounded-lg" style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>
                  <Check size={15} />
                </button>
                <button type="button" onClick={e => { e.stopPropagation(); update('archive', message.id) }} data-tooltip="Archive" className="p-2 rounded-lg" style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>
                  <Archive size={15} />
                </button>
                <button type="button" onClick={e => { e.stopPropagation(); update('delete', message.id) }} data-tooltip="Delete junk" className="p-2 rounded-lg" style={{ background: 'var(--red-soft)', color: 'var(--red)' }}>
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

    </div>
  )
}
