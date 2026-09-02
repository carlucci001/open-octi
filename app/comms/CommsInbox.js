'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { Trash2 } from 'lucide-react'

function api(url, body) {
  return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json())
}

const statusColors = {
  delivered: { bg: 'rgba(166,227,161,0.15)', color: '#a6e3a1' },
  sent: { bg: 'rgba(137,180,250,0.15)', color: '#89b4fa' },
  opened: { bg: 'rgba(148,226,213,0.15)', color: '#94e2d5' },
  clicked: { bg: 'rgba(203,166,247,0.15)', color: '#cba6f7' },
  bounced: { bg: 'rgba(243,139,168,0.15)', color: '#f38ba8' },
  complained: { bg: 'rgba(243,139,168,0.15)', color: '#f38ba8' },
  scheduled: { bg: 'rgba(249,226,175,0.15)', color: '#f9e2af' },
  canceled: { bg: 'rgba(127,132,156,0.15)', color: '#7f849c' },
}
const sc = s => statusColors[s] || { bg: 'rgba(127,132,156,0.15)', color: 'var(--text-muted)' }
const is = { background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13, outline: 'none', width: '100%', fontFamily: 'inherit' }
const PAGE_SIZE = 20

const normalizeDomain = value => String(value || '').trim().toLowerCase().replace(/^@/, '')

function emailMatchesDomain(email, domain) {
  const wanted = normalizeDomain(domain)
  if (!wanted) return true

  const values = [email?.domain, email?.from, email?.to, email?.cc, email?.bcc, email?.reply_to, email?.replyTo].flat(Infinity)
  return values.some(value => {
    if (!value) return false
    if (typeof value === 'object') return Object.values(value).some(entry => emailMatchesDomain({ from: entry }, wanted))
    const text = String(value).toLowerCase()
    if (normalizeDomain(text) === wanted) return true
    return [...text.matchAll(/@([a-z0-9.-]+)/g)].some(match => {
      const found = normalizeDomain(match[1])
      return found === wanted || found.endsWith(`.${wanted}`)
    })
  })
}

function Modal({ title, onClose, children, width = 'max-w-2xl' }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div className={`w-full ${width} rounded-xl p-6 animate-fade-in max-h-[90vh] overflow-auto`} style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>{title}</h2>
          <button onClick={onClose} className="text-lg" style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function ComposeModal({ onClose, onSent, prefill = {}, draftId = '' }) {
  const [f, setF] = useState({ to: '', cc: '', bcc: '', replyTo: 'redacted@example.invalid', subject: '', html: '', scheduledAt: '', ...prefill })
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState('')
  const u = (k, v) => setF(p => ({ ...p, [k]: v }))

  const send = async () => {
    if (!f.to || !f.subject) { setErr('Need recipient and subject'); return }
    setSending(true); setErr('')
    const res = await api('/api/comms', {
      action: 'send', to: f.to, cc: f.cc || undefined, bcc: f.bcc || undefined,
      replyTo: f.replyTo || undefined, subject: f.subject,
      html: f.html || `<p>${f.html}</p>`,
      scheduledAt: f.scheduledAt || undefined,
    })
    setSending(false)
    if (res.id) { onSent(draftId); onClose() }
    else setErr(res.message || res.error || 'Send failed')
  }

  return (
    <Modal title={f.scheduledAt ? '⏰ Schedule Email' : '✉ Compose Email'} onClose={onClose}>
      <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>From: <span className="font-mono">Newsroom AIOS &lt;redacted@example.invalid&gt;</span></p>
      {err && <div className="text-xs mb-3 p-2 rounded" style={{ background: 'rgba(243,139,168,0.15)', color: '#f38ba8' }}>{err}</div>}
      <div className="mb-3"><label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-muted)' }}>To *</label><input style={is} placeholder="recipient@example.com" value={f.to} onChange={e => u('to', e.target.value)} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div className="mb-3"><label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-muted)' }}>CC</label><input style={is} placeholder="cc@example.com" value={f.cc} onChange={e => u('cc', e.target.value)} /></div>
        <div className="mb-3"><label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-muted)' }}>BCC</label><input style={is} placeholder="bcc@example.com" value={f.bcc} onChange={e => u('bcc', e.target.value)} /></div>
      </div>
      <div className="mb-3"><label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-muted)' }}>Reply-To</label><input style={is} value={f.replyTo} onChange={e => u('replyTo', e.target.value)} /></div>
      <div className="mb-3"><label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-muted)' }}>Subject *</label><input style={is} placeholder="Email subject" value={f.subject} onChange={e => u('subject', e.target.value)} /></div>
      <div className="mb-3"><label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-muted)' }}>Schedule (optional — up to 72h)</label><input style={is} type="datetime-local" value={f.scheduledAt} onChange={e => u('scheduledAt', e.target.value)} /></div>
      <div className="mb-3"><label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-muted)' }}>Body (HTML supported)</label>
        <textarea style={{ ...is, minHeight: 200, resize: 'vertical', fontFamily: 'JetBrains Mono, monospace', fontSize: 12 }} placeholder="<p>Your email content...</p>" value={f.html} onChange={e => u('html', e.target.value)} /></div>
      <div className="flex gap-2 mt-4">
        <button className="flex-1 py-2 rounded-lg text-sm font-medium disabled:opacity-50" style={{ background: 'var(--accent)', color: 'var(--accent-text)' }} onClick={send} disabled={sending}>
          {sending ? '⏳ Sending...' : f.scheduledAt ? '⏰ Schedule' : '✉ Send'}
        </button>
        <button className="px-4 py-2 rounded-lg text-sm" style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }} onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  )
}

export default function CommsInbox() {
  const [folder, setFolder] = useState('received') // sent | received | scheduled
  const [emails, setEmails] = useState([])
  const [received, setReceived] = useState([])
  const [domains, setDomains] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [domainFilter, setDomainFilter] = useState('all')
  const [selected, setSelected] = useState(null)
  const [detail, setDetail] = useState(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [showCompose, setShowCompose] = useState(false)
  const [composePrefill, setComposePrefill] = useState({})
  const [multiSelect, setMultiSelect] = useState([])
  const [archived, setArchived] = useState([])
  const [deleted, setDeleted] = useState([])
  const [drafts, setDrafts] = useState([])
  const [activeDraftId, setActiveDraftId] = useState('')
  const [showArchived, setShowArchived] = useState(false)
  const [toast, setToast] = useState('')
  const [inboxWarning, setInboxWarning] = useState('')
  const [page, setPage] = useState(1)

  const flash = m => { setToast(m); setTimeout(() => setToast(''), 3000) }

  const loadAll = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true)
    try {
      const [e, r, d, local] = await Promise.all([
        fetch('/api/comms?action=list_emails').then(r => r.json()),
        fetch('/api/comms?action=list_received').then(r => r.json()).catch(() => ({ data: [] })),
        fetch('/api/comms?action=domains').then(r => r.json()),
        fetch('/api/comms-local').then(r => r.json()).catch(() => ({ archived: [] })),
      ])
      setEmails(e.data || [])
      setReceived(r.data || [])
      setInboxWarning([...(r.warnings || []), r.error].filter(Boolean).join(' '))
      setDomains(d.data || [])
      setArchived(local.archived || [])
      setDeleted(local.deleted || [])
      setDrafts((local.drafts || []).filter(draft => draft.status === 'pending_approval'))
    } catch (err) { console.error(err) }
    if (!silent) setLoading(false)
  }, [])

  useEffect(() => {
    loadAll()
    const timer = setInterval(() => loadAll({ silent: true }), 60_000)
    return () => clearInterval(timer)
  }, [loadAll])

  const refresh = () => { loadAll(); setSelected(null); setDetail(null) }

  const loadDetail = async (em, isReceived = false) => {
    setLoadingDetail(true)
    const action = isReceived ? 'get_received' : 'get_email'
    const d = await fetch(`/api/comms?action=${action}&id=${em.id}`).then(r => r.json())
    setDetail({ ...d, _isReceived: isReceived })
    setLoadingDetail(false)
  }

  const selectEmail = (em, isReceived = false) => {
    setSelected(em)
    loadDetail(em, isReceived)
  }

  const cancelEmail = async (id) => {
    if (!confirm('Cancel this scheduled email?')) return
    const res = await api('/api/comms', { action: 'cancel', id })
    if (res.id) { flash('✅ Email canceled'); refresh() }
    else flash('❌ ' + (res.message || 'Cancel failed'))
  }

  const reply = () => {
    if (!detail) return
    setComposePrefill({
      to: detail.from || '',
      subject: `Re: ${detail.subject || ''}`,
      html: `<br/><br/>---<br/><strong>On ${detail.created_at ? new Date(detail.created_at).toLocaleString() : ''}:</strong><br/>${detail.html || detail.text || ''}`,
    })
    setShowCompose(true)
  }

  const forward = () => {
    if (!detail) return
    setComposePrefill({
      subject: `Fwd: ${detail.subject || ''}`,
      html: `<br/><br/>--- Forwarded ---<br/><strong>From:</strong> ${detail.from || ''}<br/><strong>Subject:</strong> ${detail.subject || ''}<br/><strong>Date:</strong> ${detail.created_at ? new Date(detail.created_at).toLocaleString() : ''}<br/><br/>${detail.html || detail.text || ''}`,
    })
    setShowCompose(true)
  }

  const toggleMulti = id => setMultiSelect(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])

  const archiveEmails = async (ids) => {
    const arr = Array.isArray(ids) ? ids : [ids]
    const res = await api('/api/comms-local', { action: 'archive', ids: arr })
    setArchived(res.archived || [])
    setMultiSelect([])
    if (selected && arr.includes(selected.id)) { setSelected(null); setDetail(null) }
    flash(`📦 ${arr.length} email${arr.length > 1 ? 's' : ''} archived`)
  }

  const unarchiveEmails = async (ids) => {
    const arr = Array.isArray(ids) ? ids : [ids]
    const res = await api('/api/comms-local', { action: 'unarchive', ids: arr })
    setArchived(res.archived || [])
    setMultiSelect([])
    flash(`📤 ${arr.length} email${arr.length > 1 ? 's' : ''} restored`)
  }

  const clearArchive = async () => {
    if (!confirm('Restore all archived emails?')) return
    const res = await api('/api/comms-local', { action: 'clear_archive' })
    setArchived(res.archived || [])
    flash('📤 Archive cleared')
  }

  const deleteEmails = async ids => {
    const arr = (Array.isArray(ids) ? ids : [ids]).filter(Boolean)
    if (arr.length === 0) return
    const label = arr.length === 1 ? 'this email' : `${arr.length} emails`
    if (!confirm(`Delete ${label} from Command Center Mail? It will no longer appear here after refresh or provider resync.`)) return
    const res = await api('/api/comms-local', { action: 'delete', ids: arr })
    if (res.ok === false) return flash('❌ ' + (res.error || 'Delete failed'))
    setDeleted(res.deleted || [...new Set([...deleted, ...arr])])
    setArchived(res.archived || archived.filter(id => !arr.includes(id)))
    setMultiSelect([])
    if (selected && arr.includes(selected.id)) { setSelected(null); setDetail(null) }
    flash(`🗑 Deleted ${arr.length} email${arr.length > 1 ? 's' : ''}`)
  }

  const reviewDraft = draft => {
    setActiveDraftId(draft.id)
    setComposePrefill({ to: draft.to, subject: draft.subject, html: draft.html })
    setShowCompose(true)
  }

  const markDraftSent = async draftId => {
    if (draftId) await api('/api/comms-local', { action: 'mark_draft_sent', id: draftId })
    flash('✅ Email sent after approval')
    setActiveDraftId('')
    setTimeout(refresh, 1500)
  }

  const folderList = useMemo(() => {
    let list = folder === 'received' ? received :
      folder === 'scheduled' ? emails.filter(e => e.scheduled_at && e.last_event !== 'delivered') :
      folder === 'archived' ? [...emails, ...received].filter(e => archived.includes(e.id)) :
        emails
    // Hide archived unless viewing archive folder
    if (folder !== 'archived') list = list.filter(e => !archived.includes(e.id))
    return list.filter(e => !deleted.includes(e.id))
  }, [emails, received, folder, archived, deleted])

  const sortedDomains = useMemo(() => [...domains]
    .filter(domain => domain?.name)
    .sort((a, b) => a.name.localeCompare(b.name)), [domains])

  const domainCounts = useMemo(() => Object.fromEntries(sortedDomains.map(domain => [
    domain.name,
    folderList.filter(email => emailMatchesDomain(email, domain.name)).length,
  ])), [folderList, sortedDomains])

  const currentList = useMemo(() => {
    let list = domainFilter === 'all' ? folderList : folderList.filter(email => emailMatchesDomain(email, domainFilter))
    if (!search) return list
    const s = search.toLowerCase()
    return list.filter(e =>
      e.to?.some(t => t.toLowerCase().includes(s)) ||
      e.subject?.toLowerCase().includes(s) ||
      e.from?.toLowerCase().includes(s)
    )
  }, [folderList, domainFilter, search])

  const pageCount = Math.max(1, Math.ceil(currentList.length / PAGE_SIZE))
  const pageItems = useMemo(() => currentList.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [currentList, page])
  const pageStart = currentList.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const pageEnd = Math.min(page * PAGE_SIZE, currentList.length)

  useEffect(() => setPage(1), [folder, domainFilter, search])
  useEffect(() => setPage(current => Math.min(current, pageCount)), [pageCount])

  const stats = useMemo(() => {
    const visibleEmails = emails.filter(email => !deleted.includes(email.id))
    const visibleReceived = received.filter(email => !deleted.includes(email.id))
    return {
      total: visibleEmails.length,
      delivered: visibleEmails.filter(e => e.last_event === 'delivered').length,
      opened: visibleEmails.filter(e => e.last_event === 'opened').length,
      bounced: visibleEmails.filter(e => e.last_event === 'bounced').length,
      received: visibleReceived.length,
      scheduled: visibleEmails.filter(e => e.scheduled_at && e.last_event !== 'delivered').length,
    }
  }, [emails, received, deleted])

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--base)' }}>
      {toast && <div className="fixed top-4 right-4 z-50 px-4 py-2 rounded-lg text-sm font-medium animate-fade-in" style={{ background: toast.startsWith('✅') ? 'var(--green)' : 'var(--amber)', color: '#000' }}>{toast}</div>}

      {/* Header */}
      <div className="flex justify-between items-center px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text)' }}>Command Center Mail</h1>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {domains.map(d => d.name).join(', ') || 'No domains'}
          </p>
        </div>
        <div className="flex gap-2">
          <button className="px-3 py-2 rounded-lg text-xs" style={{ background: 'var(--surface2)', color: 'var(--accent)', border: '1px solid var(--border)' }} onClick={refresh}>↻ Refresh</button>
          <button className="px-4 py-2 rounded-lg text-xs font-medium" style={{ background: 'var(--accent)', color: 'var(--accent-text)' }} onClick={() => { setComposePrefill({}); setShowCompose(true) }}>✉ Compose</button>
        </div>
      </div>
      {inboxWarning && (
        <div className="px-6 py-2 text-xs" style={{ color: 'var(--red)', background: 'var(--red-soft)', borderBottom: '1px solid var(--border)' }}>
          Inbox warning: {inboxWarning}
        </div>
      )}

      {drafts.length > 0 && <div className="px-6 py-3" style={{ borderBottom: '1px solid var(--border)', background: 'var(--amber-soft)' }}>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--amber)' }}>Drafts awaiting Carl approval</div>
        <div className="flex flex-wrap gap-2">{drafts.map(draft => <button key={draft.id} type="button" onClick={() => reviewDraft(draft)} className="rounded-lg px-3 py-2 text-left text-xs" style={{ minHeight: 44, background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}><span className="font-semibold">{draft.subject}</span><span className="ml-2" style={{ color: 'var(--text-muted)' }}>to {draft.to}</span></button>)}</div>
      </div>}

      {/* Stats bar */}
      <div className="flex gap-4 px-6 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
        {[
          { l: 'Sent', v: stats.total, c: 'var(--accent)' },
          { l: 'Delivered', v: stats.delivered, c: 'var(--green)' },
          { l: 'Opened', v: stats.opened, c: 'var(--teal)' },
          { l: 'Bounced', v: stats.bounced, c: 'var(--red)' },
          { l: 'Received', v: stats.received, c: 'var(--purple)' },
          { l: 'Scheduled', v: stats.scheduled, c: 'var(--amber)' },
        ].map(s => (
          <div key={s.l} className="flex items-center gap-2">
            <span className="text-base font-bold font-mono" style={{ color: s.c }}>{s.v}</span>
            <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{s.l}</span>
          </div>
        ))}
      </div>

      {/* Main: folder sidebar + email list + preview */}
      <div className="flex flex-1 overflow-hidden" style={{ height: 'min(64vh, 640px)', minHeight: 480 }}>

        {/* Folder sidebar */}
        <div className="w-40 shrink-0 py-3 px-2" style={{ borderRight: '1px solid var(--border)' }}>
          {[
            { id: 'sent', icon: '📤', label: 'Sent', count: emails.filter(e => !archived.includes(e.id) && !deleted.includes(e.id)).length },
            { id: 'received', icon: '📥', label: 'Received', count: received.filter(e => !archived.includes(e.id) && !deleted.includes(e.id)).length },
            { id: 'scheduled', icon: '⏰', label: 'Scheduled', count: stats.scheduled },
            { id: 'archived', icon: '📦', label: 'Archived', count: archived.length },
          ].map(f => (
            <button key={f.id} onClick={() => { setFolder(f.id); setSelected(null); setDetail(null) }}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left mb-1 text-xs"
              style={{ background: folder === f.id ? 'var(--surface2)' : 'transparent', color: folder === f.id ? 'var(--text)' : 'var(--text-muted)', borderLeft: folder === f.id ? '2px solid var(--accent)' : '2px solid transparent' }}>
              <span>{f.icon}</span>
              <span className="flex-1 font-medium">{f.label}</span>
              {f.count > 0 && <span className="text-[10px] font-mono px-1.5 rounded-full" style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>{f.count}</span>}
            </button>
          ))}

          {/* Domain filter */}
          {sortedDomains.length > 0 && (
            <div className="mt-4 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
              <div className="text-[10px] font-semibold uppercase mb-2 px-3" style={{ color: 'var(--text-muted)' }}>Filter by domain</div>
              <button type="button" aria-pressed={domainFilter === 'all'} aria-label={`Show email from all domains (${folderList.length})`}
                onClick={() => { setDomainFilter('all'); setSelected(null); setDetail(null) }}
                className="w-full min-h-12 flex items-center gap-2 px-3 py-2 rounded-lg text-left mb-1 text-[10px]"
                style={{ background: domainFilter === 'all' ? 'var(--surface2)' : 'transparent', color: domainFilter === 'all' ? 'var(--text)' : 'var(--text-muted)', borderLeft: domainFilter === 'all' ? '2px solid var(--accent)' : '2px solid transparent' }}>
                <span className="flex-1 font-semibold">All domains</span>
                <span className="font-mono px-1.5 rounded-full" style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>{folderList.length}</span>
              </button>
              {sortedDomains.map(d => (
                <button key={d.id || d.name} type="button" aria-pressed={domainFilter === d.name} aria-label={`Filter email by ${d.name} (${domainCounts[d.name] || 0})`} title={d.name}
                  onClick={() => { setDomainFilter(d.name); setSelected(null); setDetail(null) }}
                  className="w-full min-h-12 flex items-center gap-1.5 px-3 py-2 rounded-lg text-left mb-1 text-[10px]"
                  style={{ background: domainFilter === d.name ? 'var(--surface2)' : 'transparent', color: domainFilter === d.name ? 'var(--text)' : 'var(--text-muted)', borderLeft: domainFilter === d.name ? '2px solid var(--accent)' : '2px solid transparent' }}>
                  <span className="w-1.5 h-1.5 shrink-0 rounded-full" style={{ background: d.status === 'verified' ? 'var(--green)' : 'var(--amber)' }} />
                  <span className="flex-1 font-mono truncate">{d.name}</span>
                  <span className="font-mono px-1.5 rounded-full" style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>{domainCounts[d.name] || 0}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Email list */}
        <div className="w-80 shrink-0 flex flex-col overflow-hidden" style={{ borderRight: '1px solid var(--border)' }}>
          <div className="p-2" style={{ borderBottom: '1px solid var(--border)' }}>
            <input aria-label="Search email" style={{ ...is, fontSize: 12, padding: '6px 10px' }} placeholder={domainFilter === 'all' ? 'Search all domains...' : `Search ${domainFilter}...`} value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading ? <div className="text-center py-8 text-xs" style={{ color: 'var(--text-muted)' }}>Loading...</div> :
              currentList.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-2xl mb-2 opacity-50">📭</div>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{domainFilter === 'all' ? 'No emails' : `No email for ${domainFilter}`}</p>
                </div>
              ) : pageItems.map((em, i) => {
                const s = sc(em.last_event)
                const isActive = selected?.id === em.id
                const isMulti = multiSelect.includes(em.id)
                return (
                  <div key={em.id} className="px-3 py-2.5 cursor-pointer transition-all flex gap-2"
                    style={{
                      borderBottom: '1px solid var(--surface2)',
                      background: isActive ? 'var(--surface2)' : 'transparent',
                      borderLeft: isActive ? '3px solid var(--accent)' : '3px solid transparent',
                    }}
                    onClick={() => selectEmail(em, folder === 'received')}>
                    <button className="w-4 h-4 shrink-0 mt-0.5 rounded flex items-center justify-center text-[9px]"
                      onClick={e => { e.stopPropagation(); toggleMulti(em.id) }}
                      style={{ background: isMulti ? 'var(--accent)' : 'transparent', border: `1px solid ${isMulti ? 'var(--accent)' : 'var(--border)'}`, color: 'var(--accent-text)', cursor: 'pointer' }}>
                      {isMulti ? '✓' : ''}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium truncate" style={{ color: 'var(--text)' }}>{em.subject || '(no subject)'}</div>
                      <div className="text-[10px] truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        {folder === 'received' ? `From: ${em.from || '—'}` : `To: ${em.to?.join(', ') || '—'}`}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full" style={{ background: s.bg, color: s.color }}>{em.last_event || 'sent'}</span>
                        <span className="text-[9px] font-mono" style={{ color: 'var(--text-muted)' }}>
                          {em.created_at ? new Date(em.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                        </span>
                      </div>
                    </div>
                    <button type="button" aria-label={`Delete ${em.subject || 'email'}`} title="Delete from Command Center Mail" className="w-7 h-7 shrink-0 rounded flex items-center justify-center" onClick={event => { event.stopPropagation(); deleteEmails([em.id]) }} style={{ background: 'transparent', color: 'var(--red)', border: '1px solid transparent' }}>
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  </div>
                )
              })}
          </div>
          {currentList.length > 0 && (
            <div className="px-3 py-2 flex items-center justify-between gap-2" style={{ borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
              <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>{pageStart}-{pageEnd} of {currentList.length}</span>
              <div className="flex items-center gap-1">
                <button type="button" aria-label="Previous email page" title="Previous page" disabled={page === 1} onClick={() => setPage(current => Math.max(1, current - 1))} className="w-7 h-7 rounded text-sm disabled:opacity-40" style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}>‹</button>
                <span className="min-w-12 text-center text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>{page} / {pageCount}</span>
                <button type="button" aria-label="Next email page" title="Next page" disabled={page === pageCount} onClick={() => setPage(current => Math.min(pageCount, current + 1))} className="w-7 h-7 rounded text-sm disabled:opacity-40" style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}>›</button>
              </div>
            </div>
          )}
          {multiSelect.length > 0 && (
            <div className="px-3 py-2 flex items-center gap-2 flex-wrap" style={{ borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
              <span className="text-xs font-medium" style={{ color: 'var(--accent)' }}>{multiSelect.length} selected</span>
              {folder !== 'archived' ? (
                <button className="text-[10px] px-2 py-1 rounded font-medium" style={{ background: 'rgba(249,226,175,0.15)', color: '#f9e2af', border: '1px solid rgba(249,226,175,0.3)' }} onClick={() => archiveEmails(multiSelect)}>📦 Archive</button>
              ) : (
                <button className="text-[10px] px-2 py-1 rounded font-medium" style={{ background: 'rgba(166,227,161,0.15)', color: '#a6e3a1', border: '1px solid rgba(166,227,161,0.3)' }} onClick={() => unarchiveEmails(multiSelect)}>📤 Restore</button>
              )}
              <button className="text-[10px] px-2 py-1 rounded font-medium" style={{ background: 'var(--red-soft)', color: 'var(--red)', border: '1px solid var(--red)' }} onClick={() => deleteEmails(multiSelect)}>🗑 Delete</button>
              <button className="text-[10px] px-2 py-1 rounded" style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }} onClick={() => setMultiSelect(pageItems.map(e => e.id))}>Select Page</button>
              <button className="text-[10px] px-2 py-1 rounded" style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }} onClick={() => setMultiSelect([])}>Clear</button>
            </div>
          )}
        </div>

        {/* Preview pane — takes remaining space */}
        <div className="flex-1 overflow-y-auto p-6">
          {!selected ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="text-5xl mb-3 opacity-30">📬</div>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Select an email to preview</p>
                <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>Or compose a new one</p>
              </div>
            </div>
          ) : loadingDetail ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading email...</p>
            </div>
          ) : detail ? (
            <div className="max-w-4xl">
              {/* Email header */}
              <div className="mb-6">
                <h2 className="text-xl font-bold mb-3" style={{ color: 'var(--text)' }}>{detail.subject || '(no subject)'}</h2>
                <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
                  <span className="text-xs font-medium text-right" style={{ color: 'var(--text-muted)' }}>From</span>
                  <span className="text-xs font-mono" style={{ color: 'var(--text)' }}>{detail.from || '—'}</span>
                  <span className="text-xs font-medium text-right" style={{ color: 'var(--text-muted)' }}>To</span>
                  <span className="text-xs font-mono" style={{ color: 'var(--text)' }}>{detail.to?.join(', ') || '—'}</span>
                  {detail.cc?.length > 0 && <>
                    <span className="text-xs font-medium text-right" style={{ color: 'var(--text-muted)' }}>CC</span>
                    <span className="text-xs font-mono" style={{ color: 'var(--text)' }}>{detail.cc.join(', ')}</span>
                  </>}
                  {detail.bcc?.length > 0 && <>
                    <span className="text-xs font-medium text-right" style={{ color: 'var(--text-muted)' }}>BCC</span>
                    <span className="text-xs font-mono" style={{ color: 'var(--text)' }}>{detail.bcc.join(', ')}</span>
                  </>}
                  <span className="text-xs font-medium text-right" style={{ color: 'var(--text-muted)' }}>Date</span>
                  <span className="text-xs" style={{ color: 'var(--text)' }}>{detail.created_at ? new Date(detail.created_at).toLocaleString() : '—'}</span>
                  <span className="text-xs font-medium text-right" style={{ color: 'var(--text-muted)' }}>Status</span>
                  <span><span className="text-[10px] px-2 py-0.5 rounded-full" style={{ ...sc(detail.last_event) }}>{detail.last_event || 'sent'}</span></span>
                  <span className="text-xs font-medium text-right" style={{ color: 'var(--text-muted)' }}>ID</span>
                  <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>{detail.id}</span>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 mb-5">
                <button className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ background: 'var(--accent)', color: 'var(--accent-text)' }} onClick={reply}>↩ Reply</button>
                <button className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }} onClick={forward}>↪ Forward</button>
                {archived.includes(detail.id) ? (
                  <button className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ background: 'rgba(166,227,161,0.15)', color: '#a6e3a1', border: '1px solid rgba(166,227,161,0.3)' }} onClick={() => unarchiveEmails([detail.id])}>📤 Restore</button>
                ) : (
                  <button className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ background: 'rgba(249,226,175,0.15)', color: '#f9e2af', border: '1px solid rgba(249,226,175,0.3)' }} onClick={() => archiveEmails([detail.id])}>📦 Archive</button>
                )}
                <button className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ background: 'var(--red-soft)', color: 'var(--red)', border: '1px solid var(--red)' }} onClick={() => deleteEmails([detail.id])}>🗑 Delete</button>
                {detail.scheduled_at && detail.last_event !== 'delivered' && (
                  <button className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ background: 'rgba(243,139,168,0.15)', color: '#f38ba8', border: '1px solid rgba(243,139,168,0.3)' }} onClick={() => cancelEmail(detail.id)}>✕ Cancel</button>
                )}
                {detail.scheduled_at && <span className="text-xs self-center ml-2" style={{ color: 'var(--amber)' }}>⏰ Scheduled: {new Date(detail.scheduled_at).toLocaleString()}</span>}
              </div>

              {/* Email body — BIG preview */}
              <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                {detail.html ? (
                  <div className="p-6" style={{ minHeight: 400 }}>
                    <div dangerouslySetInnerHTML={{ __html: detail.html }} style={{ color: 'var(--text)', lineHeight: 1.7, fontSize: 14 }} />
                  </div>
                ) : detail.text ? (
                  <div className="p-6 whitespace-pre-wrap" style={{ color: 'var(--text)', lineHeight: 1.7, fontSize: 14, minHeight: 400 }}>
                    {detail.text}
                  </div>
                ) : (
                  <div className="p-6 text-center" style={{ color: 'var(--text-muted)', minHeight: 200 }}>
                    <p className="text-sm">No body content</p>
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {showCompose && <ComposeModal draftId={activeDraftId} prefill={composePrefill} onClose={() => { setShowCompose(false); setComposePrefill({}); setActiveDraftId('') }} onSent={markDraftSent} />}
    </div>
  )
}
