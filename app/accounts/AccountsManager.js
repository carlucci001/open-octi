'use client'
import ThemedSelect from '../components/ThemedSelect'
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import ComponentSettings, { useComponentSettings } from '../components/ComponentSettings'
import PageHeader from '../components/PageHeader'
import { Paginator, usePagination } from '../components/Paginator'
import ViewModeToggle from '../components/ViewModeToggle'
import BulkActionsMenu from '../components/BulkActionsMenu'
import ItemActionsMenu from '../components/ItemActionsMenu'
import { gvCallUrl } from '@/lib/google-voice'
import CallButton from '../components/CallButton'
import InvoicesManager from '../billing/InvoicesManager'
import DocumentsManager from '../documents/DocumentsManager'
import PaymentForm from '../components/PaymentForm'
import SupportManager from '../support/SupportManager'
import OwnerInboxTab from './OwnerInboxTab'
import { Power } from 'lucide-react'

const TYPES = [
  { id: 'client',   label: 'Client',   color: 'var(--green)',  bg: 'var(--green-soft)' },
  { id: 'prospect', label: 'Prospect', color: 'var(--accent)', bg: 'var(--accent-soft)' },
  { id: 'partner',  label: 'Partner',  color: 'var(--purple)', bg: 'var(--purple-soft)' },
  { id: 'vendor',   label: 'Vendor',   color: 'var(--peach)',  bg: 'var(--peach-soft)' },
  { id: 'in-house', label: 'In-House', color: 'var(--text)',   bg: 'var(--surface2)' },
]
const STAGES = [
  { id: 'active',   label: 'Active',   color: 'var(--green)',      bg: 'var(--green-soft)' },
  { id: 'paused',   label: 'Paused',   color: 'var(--amber)',      bg: 'var(--amber-soft)' },
  { id: 'churned',  label: 'Churned',  color: 'var(--text-muted)', bg: 'var(--surface2)' },
]
const PRIORITY = [
  { id: 'low',    label: 'Low',    color: 'var(--text-muted)' },
  { id: 'medium', label: 'Medium', color: 'var(--accent)' },
  { id: 'high',   label: 'High',   color: 'var(--amber)' },
  { id: 'vip',    label: 'VIP',    color: 'var(--red)' },
]

const typeMeta = (t) => TYPES.find(x => x.id === t) || TYPES[1]
const stageMeta = (s) => STAGES.find(x => x.id === s) || STAGES[0]
const priMeta = (p) => PRIORITY.find(x => x.id === p) || PRIORITY[1]
const initials = (n = '') => n.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('') || '?'
const fmtUSD = n => (Number(n) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
const fmtDuration = secs => {
  const total = Math.max(0, Math.round(Number(secs) || 0))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

const CLIENT_EMAIL_IDENTITIES = [
  {
    id: 'farrington',
    label: 'Farrington Development',
    brand: 'farrington',
    from: 'Farrington Development <redacted@example.invalid>',
    detail: 'Development, billing, project follow-up, and CRM relationship notes.',
  },
  {
    id: 'newsroom',
    label: 'ContentHub',
    brand: 'newsroom',
    from: 'ContentHub <redacted@example.invalid>',
    detail: 'Paper partner, newsroom platform, campaign, and publication workflow.',
  },
  {
    id: 'wnctimes',
    label: 'WNC Times',
    brand: 'wnctimes',
    from: 'WNC Times <redacted@example.invalid>',
    detail: 'Publisher correspondence, local media, sponsor, and community outreach.',
  },
]

const CLIENT_EMAIL_REASONS = [
  'Relationship follow-up',
  'Project update',
  'Billing or invoice',
  'Paper partner / newsroom',
  'Media or campaign coordination',
  'General note',
]

function api(url, body) {
  return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json())
}

function Modal({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div className={`relative w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} rounded-xl p-6 animate-fade-in max-h-[85vh] overflow-auto`} style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
        <button type="button" aria-label="Close" onClick={onClose} className="absolute top-3 right-3 w-9 h-9 rounded-lg text-lg font-bold" style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}>X</button>
        <h2 className="text-lg font-semibold mb-4 pr-10" style={{ color: 'var(--text)' }}>{title}</h2>
        {children}
      </div>
    </div>
  )
}

const inp = { background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13, outline: 'none', fontFamily: 'inherit' }

function Field({ label, children }) {
  return <div className="mb-3"><label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-muted)' }}>{label}</label>{children}</div>
}

function StatTile({ value, label, color, onClick, sub }) {
  return (
    <button type="button" onClick={onClick} disabled={!onClick} className="rounded-lg p-4 text-left"
      style={{ background: 'var(--surface)', border: '1px solid var(--border)', cursor: onClick ? 'pointer' : 'default', transition: 'background var(--transition-fast, 120ms)' }}
      onMouseEnter={e => { if (onClick) e.currentTarget.style.background = 'var(--surface2)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface)' }}>
      <div className="text-xl font-bold font-mono truncate" style={{ color }}>{value}</div>
      <div className="text-xs mt-1 truncate" style={{ color: 'var(--text-muted)' }}>{label}</div>
      {sub && <div className="text-[10px] mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>{sub}</div>}
    </button>
  )
}

function activityDocumentId(activity = {}) {
  return activity.linkedTo?.documentId || activity.meta?.documentId || ''
}

function isTranscriptActivity(activity = {}) {
  return activity.type === 'transcript' || activity.source === 'maggie-live-transcription' || /transcription|transcript/i.test(activity.subject || '')
}

function AccountActivityRow({ activity, compact = false, onOpenDocument, onDelete }) {
  const [expanded, setExpanded] = useState(false)
  const docId = activityDocumentId(activity)
  const isTranscript = isTranscriptActivity(activity)
  const body = String(activity.body || '')
  const limit = compact ? 140 : 220
  const clamped = !expanded && body.length > limit
  const shownBody = clamped ? body.slice(0, limit) : body

  return (
    <div className={compact ? 'py-2 text-sm' : 'px-4 py-3 group'} style={{ borderBottom: '1px solid var(--border)' }}>
      <div className="flex items-start gap-2 mb-1">
        <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0" style={{ background: isTranscript ? 'var(--accent-soft)' : 'var(--surface2)', color: isTranscript ? 'var(--accent)' : 'var(--text-muted)' }}>
          {isTranscript ? 'transcript' : activity.type}
        </span>
        <div className="text-sm flex-1 min-w-0" style={{ color: 'var(--text)' }}>{activity.subject}</div>
        {onDelete && (
          <button
            onClick={onDelete}
            title="Delete this activity"
            className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
            style={{ background: 'transparent', border: 'none', color: 'var(--red, #dc2626)', cursor: 'pointer', fontSize: 12, padding: '2px 6px', borderRadius: 4 }}
          >x</button>
        )}
      </div>
      {body && <div className="text-xs mb-2 whitespace-pre-wrap" style={{ color: 'var(--text-muted)' }}>{shownBody}{clamped ? '...' : ''}</div>}
      <div className="flex items-center gap-2 flex-wrap">
        {docId && (
          <button
            className="text-xs px-2 rounded-md font-semibold"
            style={{ background: 'var(--surface2)', color: 'var(--accent)', border: '1px solid var(--border)', minHeight: 30 }}
            onClick={() => onOpenDocument?.(activity)}
          >
            Open {isTranscript ? 'transcript' : 'document'}
          </button>
        )}
        {body.length > limit && (
          <button
            className="text-xs px-2 rounded-md font-semibold"
            style={{ background: 'var(--surface2)', color: 'var(--text-muted)', border: '1px solid var(--border)', minHeight: 30 }}
            onClick={() => setExpanded(v => !v)}
          >
            {expanded ? 'Collapse' : 'Expand'}
          </button>
        )}
        <div className="text-[10px] ml-auto" style={{ color: 'var(--text-muted)' }}>{new Date(activity.at || activity.createdAt || activity.updatedAt).toLocaleString()}</div>
      </div>
    </div>
  )
}

function AdminWalletPanel({ accountId, accountName }) {
  const [wallet, setWallet] = useState(null)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')

  const load = async () => {
    try {
      const r = await fetch(`/api/accounts/wallet?accountId=${encodeURIComponent(accountId)}`, { cache: 'no-store' })
      setWallet(await r.json())
    } catch { setWallet({ ok: false }) }
  }
  useEffect(() => { load() }, [accountId])

  const grant = async () => {
    const amountUsd = Number(amount)
    if (busy || !Number.isFinite(amountUsd) || amountUsd <= 0) return
    setBusy(true)
    setStatus('')
    try {
      const r = await fetch('/api/accounts/wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, amountUsd, note }),
      })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || 'Grant failed')
      setWallet(current => ({ ...current, hasWallet: true, balanceUsd: j.balanceUsd }))
      setStatus(`$${amountUsd.toFixed(2)} added — ${accountName} now has $${j.balanceUsd} to spend in the portal.`)
      setAmount('')
      setNote('')
    } catch (e) {
      setStatus(e.message || 'Grant failed')
    } finally {
      setBusy(false)
    }
  }

  if (!wallet) return null
  return (
    <div className="p-3 rounded-xl mb-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="text-sm font-semibold mb-1">Portal balance</div>
      {wallet.hasWallet ? (
        <>
          <div className="text-2xl font-bold mb-2">${wallet.balanceUsd}</div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="number" min="1" step="1" placeholder="Amount in dollars"
              style={{ ...inp, width: 180, minHeight: 48, fontSize: 16 }}
              value={amount} onChange={e => setAmount(e.target.value)} disabled={busy}
            />
            <input
              placeholder="Note (optional — shows in the ledger)"
              style={{ ...inp, flex: '1 1 220px', minHeight: 48, fontSize: 16 }}
              value={note} onChange={e => setNote(e.target.value)} disabled={busy}
            />
            <button
              type="button" className="px-5 rounded-lg font-medium"
              style={{ minHeight: 48, fontSize: 16, background: 'var(--accent)', color: 'var(--accent-text)', opacity: busy || !Number(amount) ? 0.6 : 1 }}
              onClick={grant} disabled={busy || !Number(amount)}
            >
              {busy ? 'Adding…' : 'Add funds'}
            </button>
          </div>
          {status && <div className="text-sm mt-2" style={{ color: 'var(--text-muted)' }}>{status}</div>}
        </>
      ) : (
        <div className="text-sm" style={{ color: 'var(--text-muted)' }}>{wallet.reason || 'This account has no portal wallet yet.'}</div>
      )}
    </div>
  )
}

const REPORT_TYPE_OPTIONS = [
  { id: 'seo', label: 'SEO' },
  { id: 'aeo', label: 'AEO · answer engines' },
  { id: 'geo', label: 'GEO · AI assistants' },
]

// A run outlives Cloudflare's 100-second proxy ceiling often enough that
// awaiting it in one request is why "Run report" appeared to do nothing. Start
// the run, poll it, and always render a real error rather than a JSON parse
// failure from an HTML gateway page.
async function readJsonOrExplain(response) {
  const text = await response.text()
  try {
    return JSON.parse(text)
  } catch {
    if (response.status === 524 || response.status === 504) {
      throw new Error('The request timed out at the gateway before the report finished. It may still be running — check Documents > Reports in a minute.')
    }
    throw new Error(`Server returned ${response.status} (${(text || '').replace(/<[^>]*>/g, ' ').trim().slice(0, 120) || 'no body'})`)
  }
}

const SCORE_KEYS = ['seo', 'aeo', 'geo']
const scoreTone = value => (value >= 80 ? '#1e7a46' : value >= 60 ? '#996c1f' : '#b3401f')
const signed = n => `${n > 0 ? '+' : ''}${n}`

function ScoreStrip({ scores, delta, comparedTo, label }) {
  const present = SCORE_KEYS.filter(key => Number.isFinite(Number(scores?.[key])))
  if (!present.length) return null
  return (
    <div className="flex flex-wrap items-center gap-2 mt-2">
      {label && <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</span>}
      {present.map(key => {
        const value = Math.round(Number(scores[key]))
        const change = Number(delta?.[key])
        return (
          <span key={key} className="inline-flex items-baseline gap-1.5 px-2.5 py-1 rounded-lg" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
            <span className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{key}</span>
            <span className="text-base font-semibold" style={{ color: scoreTone(value) }}>{value}</span>
            {Number.isFinite(change) && change !== 0 && (
              <span className="text-[11px] font-medium" style={{ color: change > 0 ? '#1e7a46' : '#b3401f' }}>{signed(change)}</span>
            )}
          </span>
        )
      })}
      {comparedTo && (
        <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>vs {String(comparedTo).slice(0, 10)}</span>
      )}
    </div>
  )
}

function UrlReportRunner({ account, onFiled }) {
  const [url, setUrl] = useState(account.website || '')
  const [types, setTypes] = useState(['seo', 'aeo', 'geo'])
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [failed, setFailed] = useState(false)
  const [history, setHistory] = useState(null)
  const toggleType = id => setTypes(current => current.includes(id) ? current.filter(t => t !== id) : [...current, id])

  const loadHistory = useCallback(async () => {
    try {
      const r = await fetch(`/api/reports/url/run?accountId=${encodeURIComponent(account.id)}`, { cache: 'no-store' })
      const j = await readJsonOrExplain(r)
      if (j.ok) setHistory(j)
    } catch { /* history is a convenience; never block the panel on it */ }
  }, [account.id])

  useEffect(() => { loadHistory() }, [loadHistory])

  const run = async () => {
    if (busy || !url.trim() || !types.length) return
    setBusy(true)
    setFailed(false)
    setStatus('Starting…')
    try {
      const started = await readJsonOrExplain(await fetch('/api/reports/url/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ accountId: account.id, url, types }),
      }))
      if (!started.ok) throw new Error(started.error || 'Could not start the report')

      const deadline = Date.now() + 8 * 60 * 1000
      for (;;) {
        await new Promise(resolve => setTimeout(resolve, 4000))
        if (Date.now() > deadline) throw new Error('Gave up waiting after 8 minutes. Check Documents > Reports.')
        const poll = await readJsonOrExplain(await fetch(`/api/reports/url/run?runId=${encodeURIComponent(started.runId)}`, { cache: 'no-store' }))
        if (!poll.ok) throw new Error(poll.error || 'Lost track of the run')
        if (poll.status === 'running') {
          setStatus(`Measuring ${url} — ${poll.elapsedSeconds}s elapsed. Crawl, PageSpeed, then the write-up.`)
          continue
        }
        if (poll.status === 'failed') throw new Error(poll.error || 'Report generation failed')
        setStatus(`Filed to Documents: ${poll.title}`)
        await loadHistory()
        onFiled?.()
        break
      }
    } catch (e) {
      setFailed(true)
      setStatus(e.message || 'Report generation failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="p-3 rounded-xl mb-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="text-sm font-semibold mb-2">Website report — measured live, filed to Documents</div>
      <div className="flex flex-wrap items-center gap-2">
        <input
          style={{ ...inp, flex: '1 1 260px', minHeight: 48, fontSize: 16 }}
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="https://example.com"
          disabled={busy}
        />
        {REPORT_TYPE_OPTIONS.map(option => (
          <label key={option.id} className="flex items-center gap-2 px-3 rounded-lg cursor-pointer" style={{ minHeight: 48, fontSize: 16, background: types.includes(option.id) ? 'var(--accent-soft)' : 'var(--surface2)', border: '1px solid var(--border)' }}>
            <input type="checkbox" checked={types.includes(option.id)} onChange={() => toggleType(option.id)} disabled={busy} />
            {option.label}
          </label>
        ))}
        <button
          type="button"
          className="px-5 rounded-lg font-medium"
          style={{ minHeight: 48, fontSize: 16, background: 'var(--accent)', color: 'var(--accent-text)', opacity: busy || !url.trim() || !types.length ? 0.6 : 1 }}
          onClick={run}
          disabled={busy || !url.trim() || !types.length}
        >
          {busy ? 'Running…' : 'Run report'}
        </button>
      </div>
      {history?.latest && (
        <ScoreStrip
          scores={history.latest.scores}
          delta={history.latest.delta}
          comparedTo={history.latest.comparedTo}
          label={`Last run ${String(history.latest.ranAt || '').slice(0, 10)}`}
        />
      )}
      {status && (
        <div className="text-sm mt-2" style={{ color: failed ? '#b3401f' : 'var(--text-muted)' }}>
          {status}
        </div>
      )}
    </div>
  )
}

function AccountForm({ account, onSave, onClose }) {
  const [f, setF] = useState(account ? { email: '', phone: '', ...account } : {
    name: '', type: 'client', stage: 'active', priority: 'medium',
    contactFirstName: '', contactLastName: '',
    email: '', phone: '', website: '', industry: '', address: '', notes: '', tags: [],
    lastContactedAt: '', nextFollowUpAt: '',
  })
  const [tagInput, setTagInput] = useState('')
  const u = (k, v) => setF(p => ({ ...p, [k]: v }))
  const addTag = () => { const t = tagInput.trim(); if (t && !(f.tags || []).includes(t)) u('tags', [...(f.tags || []), t]); setTagInput('') }
  const removeTag = (t) => u('tags', (f.tags || []).filter(x => x !== t))

  return (
    <Modal title={account?.id ? 'Edit Client Account' : 'New Client Account'} onClose={onClose} wide>
      <Field label="Account Name *"><input style={inp} value={f.name} onChange={e => u('name', e.target.value)} placeholder="ACME Corp" autoFocus /></Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Type"><ThemedSelect style={inp} value={f.type || 'client'} onChange={e => u('type', e.target.value)}>{TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</ThemedSelect></Field>
        <Field label="Stage"><ThemedSelect style={inp} value={f.stage} onChange={e => u('stage', e.target.value)}>{STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</ThemedSelect></Field>
        <Field label="Priority"><ThemedSelect style={inp} value={f.priority} onChange={e => u('priority', e.target.value)}>{PRIORITY.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</ThemedSelect></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {/* Primary contact person. contactFirstName is what the portal
            concierge uses to greet this client by name on login. */}
        <Field label="Contact First Name"><input style={inp} value={f.contactFirstName || ''} onChange={e => u('contactFirstName', e.target.value)} placeholder="Jane" /></Field>
        <Field label="Contact Last Name"><input style={inp} value={f.contactLastName || ''} onChange={e => u('contactLastName', e.target.value)} placeholder="Smith" /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Email"><input type="email" style={inp} value={f.email || ''} onChange={e => u('email', e.target.value)} placeholder="name@example.com" /></Field>
        <Field label="Phone"><input type="tel" style={inp} value={f.phone || ''} onChange={e => u('phone', e.target.value)} placeholder="PHONE_REDACTED" /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Website"><input style={inp} value={f.website} onChange={e => u('website', e.target.value)} placeholder="example.com" /></Field>
        <Field label="Industry"><input style={inp} value={f.industry} onChange={e => u('industry', e.target.value)} placeholder="Media, Tech, etc." /></Field>
      </div>
      <Field label="Address"><input style={inp} value={f.address} onChange={e => u('address', e.target.value)} placeholder="123 Main St, City, State" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Last Contacted"><input type="date" style={inp} value={f.lastContactedAt ? f.lastContactedAt.slice(0, 10) : ''} onChange={e => u('lastContactedAt', e.target.value)} /></Field>
        <Field label="Next Follow-up"><input type="date" style={inp} value={f.nextFollowUpAt ? f.nextFollowUpAt.slice(0, 10) : ''} onChange={e => u('nextFollowUpAt', e.target.value)} /></Field>
      </div>
      <Field label="Tags">
        <div className="flex flex-wrap items-center gap-1.5 p-2 rounded-lg" style={{ background: 'var(--surface2)', border: '1px solid var(--border)', minHeight: 40 }}>
          {(f.tags || []).map(t => <span key={t} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>{t}<button onClick={() => removeTag(t)} className="opacity-60 hover:opacity-100">×</button></span>)}
          <input style={{ background: 'transparent', border: 'none', outline: 'none', color: 'var(--text)', flex: 1, minWidth: 80, fontSize: 12 }} value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag() } }} placeholder="Add tag + Enter" />
        </div>
      </Field>
      <Field label="Notes"><textarea style={{ ...inp, minHeight: 60, resize: 'vertical' }} value={f.notes} onChange={e => u('notes', e.target.value)} placeholder="Context, background, etc." /></Field>
      <div className="flex gap-2 mt-4">
        <button className="flex-1 py-2 rounded-lg text-sm font-medium" style={{ background: 'var(--accent)', color: 'var(--accent-text)' }} onClick={() => f.name.trim() && onSave({ ...f, type: f.type || 'client' })}>Save</button>
        <button className="px-4 py-2 rounded-lg text-sm" style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }} onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  )
}

function ContactForm({ contact, accountId, onSave, onClose }) {
  const [f, setF] = useState(contact || { name: '', email: '', phone: '', title: '', accountId, primary: false, notes: '' })
  const u = (k, v) => setF(p => ({ ...p, [k]: v }))
  return (
    <Modal title={contact?.id ? 'Edit Contact' : 'Add Contact'} onClose={onClose}>
      <Field label="Full Name *"><input style={inp} value={f.name} onChange={e => u('name', e.target.value)} autoFocus /></Field>
      <Field label="Title"><input style={inp} value={f.title} onChange={e => u('title', e.target.value)} placeholder="e.g. Director of Marketing" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Email"><input type="email" style={inp} value={f.email} onChange={e => u('email', e.target.value)} /></Field>
        <Field label="Phone"><input style={inp} value={f.phone} onChange={e => u('phone', e.target.value)} placeholder="PHONE_REDACTED" /></Field>
      </div>
      <Field label="Primary contact?">
        <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text)' }}>
          <input type="checkbox" checked={!!f.primary} onChange={e => u('primary', e.target.checked)} />
          Mark as the primary contact for this account
        </label>
      </Field>
      <Field label="Notes"><textarea style={{ ...inp, minHeight: 50, resize: 'vertical' }} value={f.notes} onChange={e => u('notes', e.target.value)} /></Field>
      <div className="flex gap-2 mt-4">
        <button className="flex-1 py-2 rounded-lg text-sm font-medium" style={{ background: 'var(--accent)', color: 'var(--accent-text)' }} onClick={() => f.name.trim() && onSave(f)}>Save</button>
        <button className="px-4 py-2 rounded-lg text-sm" style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }} onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  )
}

// Maps spoken/fuzzy sub-tab names from Matilda onto real tab ids.
const ACCOUNT_SUB_TABS = ['overview', 'contacts', 'deals', 'projects', 'tasks', 'activity', 'support', 'admin', 'notes', 'documents', 'invoices', 'payments', 'media']
function isOwnerAdminAccount(account = {}) {
  const name = String(account.name || account.label || '').trim().toLowerCase()
  return Boolean(
    account.ownerAccount ||
    account.isOwner ||
    account.type === 'owner' ||
    account.type === 'internal-owner' ||
    name === 'carl farrington' ||
    (account.hidden && name.includes('carl farrington'))
  )
}
function resolveAccountSubTab(raw) {
  if (!raw) return null
  const s = String(raw).toLowerCase().replace(/[^a-z]/g, '')
  const aliases = {
    overview: 'overview', summary: 'overview', details: 'overview', detail: 'overview',
    contact: 'contacts', contacts: 'contacts', people: 'contacts',
    deal: 'deals', deals: 'deals', opportunities: 'deals', opportunity: 'deals',
    project: 'projects', projects: 'projects', work: 'projects',
    task: 'tasks', tasks: 'tasks', todos: 'tasks', todo: 'tasks',
    activity: 'activity', activities: 'activity', log: 'activity', history: 'activity',
    admin: 'admin', inbox: 'admin', owner: 'admin', ownerinbox: 'admin',
    document: 'documents', documents: 'documents', docs: 'documents', doc: 'documents', files: 'documents', contracts: 'documents',
    invoice: 'invoices', invoices: 'invoices', bills: 'invoices',
    payment: 'payments', payments: 'payments', paid: 'payments',
    support: 'support', ticket: 'support', tickets: 'support', help: 'support', helpdesk: 'support',
    media: 'media', images: 'media', photos: 'media', graphics: 'media', pictures: 'media', assets: 'media',
    note: 'notes', notes: 'notes', memo: 'notes', memos: 'notes', reminder: 'notes', reminders: 'notes',
  }
  return aliases[s] || (ACCOUNT_SUB_TABS.includes(s) ? s : null)
}

function AccountDetail({ account, onBack, onEdit, onRefresh }) {
  const [tab, setTab] = useState('overview')
  // Component configuration layer: which 360 tiles display.
  const tilePrefs = useComponentSettings('accounts.360')
  const [tileOverride, setTileOverride] = useState(null)
  const visibleTiles = new Set(tileOverride || tilePrefs.values?.visibleTiles || ['contacts', 'pipeline', 'tickets', 'activity', 'projects', 'tasks', 'time'])
  const [docsRefresh, setDocsRefresh] = useState(0)
  const [contacts, setContacts] = useState([])
  const [opps, setOpps] = useState([])
  const [projects, setProjects] = useState([])
  const [tasks, setTasks] = useState([])
  const [activities, setActivities] = useState([])
  const [invoices, setInvoices] = useState([])
  const [leases, setLeases] = useState([])
  const [tickets, setTickets] = useState([])
  const [editingContact, setEditingContact] = useState(null)
  const [addingContact, setAddingContact] = useState(false)
  const [activityInput, setActivityInput] = useState('')
  // Active video calls now live in <ActiveVideoCall /> at the layout level
  // so they survive route changes. We only need to fire the start event.

  // Voice-driven deep nav — switch sub-tab, then re-broadcast an item query for that tab to handle.
  useEffect(() => {
    const apply = ({ subTab, itemQuery, accountId }) => {
      if (accountId && accountId !== account.id) return
      const resolved = resolveAccountSubTab(subTab)
      if (resolved) setTab(resolved)
      if (itemQuery) {
        setTimeout(() => window.dispatchEvent(new CustomEvent('fcc:record-item', {
          detail: { itemQuery, accountId: account.id, subTab: resolved || subTab },
        })), 200)
      }
    }
    const pending = typeof window !== 'undefined' ? window.__fccPendingRecordSubTab : null
    if (pending && pending.accountId === account.id && Date.now() - pending.ts < 10000) {
      apply(pending)
      window.__fccPendingRecordSubTab = null
    }
    const handler = (e) => apply(e.detail || {})
    window.addEventListener('fcc:record-subtab', handler)
    return () => window.removeEventListener('fcc:record-subtab', handler)
  }, [account.id])

  const load = useCallback(async () => {
    const [c, o, p, t, a, inv, lf, sup] = await Promise.all([
      fetch(`/api/contacts?accountId=${account.id}`).then(r => r.json()),
      fetch(`/api/opportunities?accountId=${account.id}`).then(r => r.json()),
      fetch(`/api/projects?accountId=${account.id}`).then(r => r.json()),
      fetch(`/api/tasks?accountId=${account.id}`).then(r => r.json()),
      fetch(`/api/activities?accountId=${account.id}`).then(r => r.json()),
      fetch(`/api/invoices?clientId=${account.id}`).then(r => r.json()).catch(() => ({ invoices: [] })),
      fetch('/api/leases').then(r => r.json()).catch(() => ({ leases: [] })),
      fetch(`/api/support?accountId=${account.id}`).then(r => r.json()).catch(() => ({ tickets: [] })),
    ])
    setContacts(c.contacts || [])
    setOpps(o.opportunities || [])
    setProjects(p.projects || [])
    setTasks(t.tasks || [])
    setActivities(a.activities || [])
    setInvoices(inv.invoices || [])
    setLeases(lf.leases || [])
    setTickets(sup.tickets || [])
  }, [account.id])
  useEffect(() => { load() }, [load])

  const type = typeMeta(account.type)
  const stage = stageMeta(account.stage)
  const pri = priMeta(account.priority)

  const saveContact = async (form) => {
    const action = form.id ? 'update' : 'add'
    await api('/api/contacts', { action, contact: form })
    setEditingContact(null); setAddingContact(false)
    await load()
  }
  const delContact = async (id) => { if (!confirm('Remove this contact?')) return; await api('/api/contacts', { action: 'delete', id }); await load() }

  const logActivity = async (body) => {
    if (!body.trim()) return
    await api('/api/activities', { action: 'add', activity: { type: 'note', subject: body.trim(), linkedTo: { accountId: account.id } } })
    setActivityInput(''); await load()
  }

  const openActivityDocument = (activity) => {
    const documentId = activityDocumentId(activity)
    if (!documentId) return
    setTab('documents')
    setTimeout(() => window.dispatchEvent(new CustomEvent('fcc:open-document', {
      detail: { documentId, view: isTranscriptActivity(activity) ? 'transcripts' : 'documents' },
    })), 250)
  }

  const openTasks = tasks.filter(t => t.status !== 'done')
  const openOpps = opps.filter(o => !['won', 'lost', 'declined'].includes(o.stageId))
  const pipelineValue = openOpps.reduce((s, o) => s + (Number(o.value) || 0), 0)
  const openTickets = tickets.filter(t => !['resolved', 'closed'].includes(t.status))
  const lastActivity = activities.length ? [...activities].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0] : null
  const lastActivityDays = lastActivity?.createdAt ? Math.floor((Date.now() - new Date(lastActivity.createdAt).getTime()) / 86400000) : null

  // Overview enrichment computations
  const unpaidInvoices = invoices.filter(i => i.status !== 'paid')
  const paidInvoices = invoices.filter(i => i.status === 'paid')
  const outstanding = unpaidInvoices.reduce((s, i) => s + (Number(i.amount) || 0), 0)
  const lifetimeRevenue = paidInvoices.reduce((s, i) => s + (Number(i.paidAmount || i.amount) || 0), 0)
  const nextDueInvoice = unpaidInvoices.filter(i => i.dueDate).sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))[0] || null
  const primaryContact = contacts.find(c => c.isPrimary) || contacts[0] || null
  const nextTask = openTasks.filter(t => t.dueDate).sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))[0] || null
  const daysUntilNextTask = nextTask?.dueDate
    ? Math.round((new Date(nextTask.dueDate).setHours(0,0,0,0) - new Date().setHours(0,0,0,0)) / 86400000)
    : null
  const activeProjects = projects.filter(p => p.status === 'active')
  const portalLease = leases.find(l => l.clientAccountId === account.id && l.status === 'active')
  const portalEnabled = Boolean(portalLease && portalLease.portalAccess !== 'disabled')
  const portalComplimentary = Boolean(portalLease
    && (portalLease.complimentary === true
      || (portalLease.complimentary === undefined && (portalLease.plan === 'complimentary' || portalLease.tierId === 'complimentary')))
    && (!portalLease.complimentaryExpiresAt || Date.parse(portalLease.complimentaryExpiresAt) > Date.now()))
  const timeActivities = activities.filter(a => a.type === 'time_tracked')
  const activityTrackedSeconds = timeActivities.reduce((s, a) => s + (Number(a.meta?.durationSeconds) || 0), 0)
  const trackedSeconds = Number(account.trackedSeconds) || activityTrackedSeconds
  const unbilledTrackedSeconds = timeActivities
    .filter(a => !a.meta?.invoiceId)
    .reduce((s, a) => s + (Number(a.meta?.durationSeconds) || 0), 0)
  const hasBillingSurface = account.type === 'client' || invoices.length > 0 || trackedSeconds > 0

  return (
    <div className="animate-fade-in">
      <button onClick={onBack} className="text-sm mb-4 inline-flex items-center gap-1" style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}>← Accounts</button>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-5">
        <div className="flex items-start gap-4 min-w-0">
          <div className="w-16 h-16 rounded-full flex items-center justify-center font-bold text-lg shrink-0" style={{ background: type.bg, color: type.color }}>{initials(account.name)}</div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-2xl font-bold" style={{ color: 'var(--text)' }}>{account.name}</h2>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: type.bg, color: type.color }}>{type.label}</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: stage.bg, color: stage.color }}>{stage.label}</span>
              {account.priority === 'vip' && <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: 'var(--red)', color: 'white' }}>VIP</span>}
              {account.priority && account.priority !== 'medium' && account.priority !== 'vip' && <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: pri.color }}>{pri.label}</span>}
            </div>
            <div className="text-sm mt-1 flex items-center gap-2 flex-wrap" style={{ color: 'var(--text-muted)' }}>
              {account.email
                ? <a href={`mailto:${account.email}`} className="hover:underline" style={{ color: 'var(--accent)' }}>📧 {account.email}</a>
                : <button onClick={() => onEdit(account)} className="italic opacity-70 hover:opacity-100" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text-muted)' }}>📧 add email</button>
              }
              {account.phone
                ? <TwilioCallButton phone={account.phone} name={account.name} />
                : <button onClick={() => onEdit(account)} className="italic opacity-70 hover:opacity-100" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text-muted)' }}>📞 add phone</button>
              }
              {account.website && <a href={account.website.startsWith('http') ? account.website : `https://${account.website}`} target="_blank" rel="noopener noreferrer" className="hover:underline" style={{ color: 'var(--accent)' }}>🌐 {account.website}</a>}
              {account.industry && <span>· {account.industry}</span>}
              {account.address && <span>· 📍 {account.address}</span>}
            </div>
            {(account.tags || []).length > 0 && <div className="flex flex-wrap gap-1 mt-2">{account.tags.map(t => <span key={t} className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>#{t}</span>)}</div>}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap md:shrink-0">
          {portalLease && (
            <span className="text-[10px] px-2 py-1 rounded-full font-semibold self-center" style={{ background: 'var(--accent-soft)', color: 'var(--accent)', border: '1px solid var(--border)' }}>
              Portal: {portalEnabled ? (portalComplimentary ? 'complimentary' : 'active') : 'disabled'}
            </span>
          )}
          {!portalEnabled && (
            <EnablePortalButton account={account} onEnabled={load} />
          )}
          {portalEnabled && <AccountPortalPreviewButton account={account} />}
          {portalEnabled && <DisablePortalButton account={account} onDisabled={load} />}
          <ClientEmailButton account={account} primaryContact={primaryContact} onSent={load} />
          <VideoCallButton account={account} />
          <ComponentSettings componentId="accounts.360" title="360 tiles" onApplied={(id, v) => setTileOverride(v.visibleTiles)} />
          <button onClick={() => onEdit(account)} className="px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--surface2)', color: 'var(--accent)', border: '1px solid var(--border)' }}>Edit</button>
        </div>
      </div>

      {/* 360 stat row — every tile jumps to its tab */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3 mb-5">
        {visibleTiles.has('contacts') && <StatTile value={contacts.length} label="Contacts" color="var(--accent)" onClick={() => setTab('contacts')} />}
        {visibleTiles.has('pipeline') && <StatTile value={fmtUSD(pipelineValue)} label={`Open Pipeline · ${openOpps.length} deal${openOpps.length !== 1 ? 's' : ''}`} color="var(--green)" onClick={() => setTab('deals')} />}
        {visibleTiles.has('tickets') && <StatTile value={openTickets.length} label="Open Tickets" color={openTickets.length > 0 ? 'var(--red)' : 'var(--text-muted)'} sub={openTickets.length > 0 ? (openTickets[0].subject || openTickets[0].title || openTickets[0].ticketNumber || '') : 'none open'} onClick={() => setTab('support')} />}
        {visibleTiles.has('activity') && <StatTile value={lastActivityDays === null ? '—' : lastActivityDays === 0 ? 'Today' : `${lastActivityDays}d ago`} label="Last Activity" color={lastActivityDays === null || lastActivityDays > 14 ? 'var(--red)' : lastActivityDays > 7 ? 'var(--amber)' : 'var(--green)'} sub={lastActivity?.subject || 'no activity logged'} onClick={() => setTab('activity')} />}
        {visibleTiles.has('projects') && <StatTile value={projects.length} label="Projects" color="var(--amber)" onClick={() => setTab('projects')} />}
        {visibleTiles.has('tasks') && <StatTile value={openTasks.length} label="Open Tasks" color={openTasks.length > 0 ? 'var(--amber)' : 'var(--text-muted)'} onClick={() => setTab('tasks')} />}
        {visibleTiles.has('time') && <StatTile value={fmtDuration(trackedSeconds)} label="Tracked Time" color={trackedSeconds > 0 ? 'var(--accent)' : 'var(--text-muted)'} onClick={() => setTab(hasBillingSurface ? 'invoices' : 'activity')} />}
      </div>

      {/* Tabs */}
      <div className="flex rounded-lg overflow-hidden mb-4 flex-wrap" style={{ border: '1px solid var(--border)', width: 'fit-content' }}>
        {[
          { id: 'overview', label: 'Overview' },
          ...(account.type === 'client' ? [
            { id: 'documents', label: '📄 Documents' },
            { id: 'payments',  label: '💳 Payments' },
          ] : []),
          ...(hasBillingSurface ? [{ id: 'invoices', label: '🧾 Invoices' }] : []),
          { id: 'contacts', label: `Contacts (${contacts.length})` },
          { id: 'deals', label: `Deals (${opps.length})` },
          { id: 'projects', label: `Projects (${projects.length})` },
          { id: 'tasks', label: `Tasks (${tasks.length})` },
          { id: 'activity', label: 'Activity' },
          { id: 'support', label: 'Support' },
          ...(isOwnerAdminAccount(account) ? [{ id: 'admin', label: 'Admin Inbox' }] : []),
          { id: 'notes', label: '📝 Notes' },
          { id: 'media', label: '🖼️ Media' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className="px-4 py-1.5 text-xs font-medium" style={{ background: tab === t.id ? 'var(--accent)' : 'var(--surface2)', color: tab === t.id ? 'var(--accent-text)' : 'var(--text-muted)' }}>{t.label}</button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'overview' && (
        <div className="space-y-4">
          {/* Financial header (clients only, or any account with invoice history) */}
          {hasBillingSurface && (
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
              <div className="rounded-lg p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <div className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-muted)', letterSpacing: '0.06em' }}>Outstanding</div>
                <div className="text-xl font-bold font-mono mt-1" style={{ color: outstanding > 0 ? '#dc2626' : 'var(--text)' }}>{fmtUSD(outstanding)}</div>
                <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{unpaidInvoices.length} unpaid invoice{unpaidInvoices.length === 1 ? '' : 's'}</div>
              </div>
              <div className="rounded-lg p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <div className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-muted)', letterSpacing: '0.06em' }}>Lifetime revenue</div>
                <div className="text-xl font-bold font-mono mt-1" style={{ color: 'var(--green)' }}>{fmtUSD(lifetimeRevenue)}</div>
                <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{paidInvoices.length} paid</div>
              </div>
              <div className="rounded-lg p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <div className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-muted)', letterSpacing: '0.06em' }}>Next due</div>
                <div className="text-xl font-bold mt-1" style={{ color: 'var(--text)' }}>{nextDueInvoice ? new Date(nextDueInvoice.dueDate).toLocaleDateString() : '—'}</div>
                <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{nextDueInvoice ? `${nextDueInvoice.number} · ${fmtUSD(nextDueInvoice.amount)}` : 'nothing pending'}</div>
              </div>
              <div className="rounded-lg p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <div className="text-[11px] uppercase tracking-wider" style={{ color: 'var(--text-muted)', letterSpacing: '0.06em' }}>Unbilled time</div>
                <div className="text-xl font-bold font-mono mt-1" style={{ color: unbilledTrackedSeconds > 0 ? 'var(--accent)' : 'var(--text)' }}>{fmtDuration(unbilledTrackedSeconds)}</div>
                <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{timeActivities.length} tracked session{timeActivities.length === 1 ? '' : 's'}</div>
              </div>
            </div>
          )}

          {/* Primary contact card */}
          {primaryContact && (
            <div className="rounded-lg p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="flex justify-between items-center mb-2">
                <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)', letterSpacing: '0.06em' }}>Primary contact</div>
                <button onClick={() => setTab('contacts')} style={{ fontSize: 13, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 6 }}>View all →</button>
              </div>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)' }}>{primaryContact.name}</div>
                  {primaryContact.title && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{primaryContact.title}</div>}
                </div>
                <div className="flex gap-2 flex-wrap">
                  {primaryContact.phone && (
                    <a href={`tel:${primaryContact.phone}`}
                      style={{ padding: '10px 14px', minHeight: 44, fontSize: 14, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      📞 {primaryContact.phone}
                    </a>
                  )}
                  {primaryContact.email && (
                    <a href={`mailto:${primaryContact.email}`}
                      style={{ padding: '10px 14px', minHeight: 44, fontSize: 14, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      ✉ {primaryContact.email}
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Next upcoming task */}
          {nextTask && (
            <div className="rounded-lg p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: `4px solid ${daysUntilNextTask < 0 ? '#dc2626' : 'var(--amber)'}` }}>
              <div className="flex justify-between items-center mb-2">
                <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)', letterSpacing: '0.06em' }}>Next task</div>
                <button onClick={() => setTab('tasks')} style={{ fontSize: 13, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 6 }}>All tasks →</button>
              </div>
              <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--text)' }}>{nextTask.title}</div>
              {nextTask.dueDate && (
                <div style={{ fontSize: 12, color: daysUntilNextTask < 0 ? '#dc2626' : 'var(--text-muted)', marginTop: 4 }}>
                  Due {new Date(nextTask.dueDate).toLocaleDateString()}
                  {daysUntilNextTask < 0 ? ` · ${Math.abs(daysUntilNextTask)}d overdue` : daysUntilNextTask === 0 ? ' · today' : ` · in ${daysUntilNextTask}d`}
                </div>
              )}
            </div>
          )}

          {/* Active projects */}
          {activeProjects.length > 0 && (
            <div className="rounded-lg p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="flex justify-between items-center mb-2">
                <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)', letterSpacing: '0.06em' }}>Active projects ({activeProjects.length})</div>
                <button onClick={() => setTab('projects')} style={{ fontSize: 13, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 6 }}>View all →</button>
              </div>
              <div className="flex flex-wrap gap-2">
                {activeProjects.slice(0, 6).map(p => (
                  <button key={p.id}
                    onClick={() => window.dispatchEvent(new CustomEvent('fcc:open-record', { detail: { type: 'project', id: p.id, name: p.name, tabId: 'projects' } }))}
                    style={{ padding: '10px 14px', minHeight: 40, fontSize: 14, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 8, cursor: 'pointer' }}>
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {account.notes && <div className="rounded-lg p-4 text-sm italic" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>{account.notes}</div>}

          {/* Recent activity (3 items) */}
          <div className="rounded-lg p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="flex justify-between items-center mb-2">
              <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)', letterSpacing: '0.06em' }}>Recent activity</div>
              {activities.length > 3 && <button onClick={() => setTab('activity')} style={{ fontSize: 13, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 6 }}>View all →</button>}
            </div>
            {activities.slice(0, 3).map(a => (
              <AccountActivityRow key={a.id} activity={a} compact onOpenDocument={openActivityDocument} />
            ))}
            {activities.length === 0 && <div className="text-xs py-3 text-center" style={{ color: 'var(--text-muted)' }}>No activity yet.</div>}
          </div>
        </div>
      )}

      {tab === 'contacts' && (
        <div>
          <div className="flex justify-between items-center mb-3">
            <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Contacts</div>
            <button className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ background: 'var(--accent)', color: 'var(--accent-text)' }} onClick={() => setAddingContact(true)}>+ Add Contact</button>
          </div>
          <div className="rounded-lg overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            {contacts.length === 0 && <div className="text-sm p-6 text-center" style={{ color: 'var(--text-muted)' }}>No contacts yet.</div>}
            {contacts.map((c, i) => (
              <div key={c.id} className="flex items-center gap-3 px-4 py-3 group" style={{ borderBottom: i < contacts.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-[11px]" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>{initials(c.name)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{c.name}</div>
                    {c.primary && <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}>Primary</span>}
                  </div>
                  <div className="text-[11px] flex items-center gap-3" style={{ color: 'var(--text-muted)' }}>
                    {c.title && <span>{c.title}</span>}
                    {c.email && <span>✉ {c.email}</span>}
                    {c.phone && <CallButton phone={c.phone} name={c.name} stopPropagation />}
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button className="text-[10px] px-2 py-1 rounded" style={{ background: 'var(--surface2)', color: 'var(--accent)' }} onClick={() => setEditingContact(c)}>Edit</button>
                  <button className="text-[10px] px-2 py-1 rounded" style={{ background: 'var(--surface2)', color: 'var(--red)' }} onClick={() => delContact(c.id)}>Remove</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'deals' && (
        <div className="rounded-lg overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          {opps.length === 0 ? (
            <div className="text-sm p-6 text-center" style={{ color: 'var(--text-muted)' }}>No opportunities. Qualify a lead to start a deal.</div>
          ) : opps.map((o, i) => (
            <div key={o.id} className="flex items-center justify-between px-4 py-3" style={{ borderBottom: i < opps.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <div className="min-w-0">
                <div className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{o.name}</div>
                <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{o.pipelineId} · {o.stageId}</div>
                {(o.leadGeneration?.dailyLeadTarget > 0 || o.leadRequirements?.requirements?.summary) && (
                  <div className="text-[11px] mt-1" style={{ color: 'var(--accent)' }}>
                    Lead gen{o.leadGeneration?.dailyLeadTarget > 0 ? `: ${o.leadGeneration.dailyLeadTarget}/day` : ''}{o.leadGeneration?.providerPreference ? ` · ${o.leadGeneration.providerPreference}` : ''}
                  </div>
                )}
                {o.leadRequirements?.requirements?.summary && (
                  <div className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>{o.leadRequirements.requirements.summary}</div>
                )}
              </div>
              <div className="text-sm font-mono font-bold" style={{ color: 'var(--green)' }}>{fmtUSD(o.value)}</div>
            </div>
          ))}
        </div>
      )}

      {tab === 'projects' && (
        <div>
          <QuickAddProject accountId={account.id} onAdded={load} />
        <div className="rounded-lg overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          {projects.length === 0 ? (
            <div className="text-sm p-6 text-center" style={{ color: 'var(--text-muted)' }}>No projects yet. Add one above, or close a deal to spawn one automatically.</div>
          ) : projects.map((p, i) => (
            <button
              key={p.id}
              onClick={() => window.dispatchEvent(new CustomEvent('fcc:open-record', { detail: { type: 'project', id: p.id, name: p.name, tabId: 'projects' } }))}
              className="w-full flex items-center justify-between px-4 py-3 text-left transition"
              style={{ borderBottom: i < projects.length - 1 ? '1px solid var(--border)' : 'none', background: 'transparent', border: 'none', borderBottomWidth: i < projects.length - 1 ? 1 : 0, cursor: 'pointer', minHeight: 56 }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface2)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{p.name}</div>
                <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{p.status} · {p.progress || 0}% complete</div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{p.budget ? fmtUSD(p.budget) : '—'}</div>
                <span style={{ color: 'var(--text-muted)', fontSize: 16 }}>›</span>
              </div>
            </button>
          ))}
        </div>
        </div>
      )}

      {tab === 'tasks' && (
        <div>
          <QuickAddTask accountId={account.id} onAdded={load} />
        <div className="rounded-lg overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          {tasks.length === 0 ? (
            <div className="text-sm p-6 text-center" style={{ color: 'var(--text-muted)' }}>No tasks yet. Add one above.</div>
          ) : tasks.map((t, i) => (
            <div key={t.id} className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: i < tasks.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <div className="w-4 h-4 rounded-full flex items-center justify-center" style={{ background: t.status === 'done' ? 'var(--green)' : 'transparent', border: `1.5px solid ${t.status === 'done' ? 'var(--green)' : 'var(--border)'}` }}>
                {t.status === 'done' && <span style={{ color: 'var(--accent-text)', fontSize: 8 }}>✓</span>}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm" style={{ color: t.status === 'done' ? 'var(--text-muted)' : 'var(--text)', textDecoration: t.status === 'done' ? 'line-through' : 'none' }}>{t.title}</div>
                {t.dueDate && <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Due {new Date(t.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>}
              </div>
              <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: t.priority === 'urgent' ? 'var(--red)' : t.priority === 'high' ? 'var(--amber)' : 'var(--text-muted)' }}>{t.priority}</span>
            </div>
          ))}
        </div>
        </div>
      )}

      {tab === 'activity' && (
        <div>
          <div className="flex gap-2 mb-3">
            <input style={{ ...inp, flex: 1 }} placeholder="Log a note, call, or observation — press Enter" value={activityInput} onChange={e => setActivityInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); logActivity(activityInput) } }} />
            <button className="px-3 py-2 rounded-lg text-sm font-medium" style={{ background: 'var(--accent)', color: 'var(--accent-text)' }} onClick={() => logActivity(activityInput)} disabled={!activityInput.trim()}>Log</button>
          </div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{activities.length} activit{activities.length === 1 ? 'y' : 'ies'} logged</div>
            {activities.length > 0 && (
              <button
                onClick={async () => {
                  if (!confirm(`Clear ALL ${activities.length} activity entries for ${account.name}? This cannot be undone.`)) return
                  const r = await fetch('/api/activities', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'clear_for_account', accountId: account.id }),
                  })
                  if (r.ok) setActivities([])
                }}
                className="text-xs px-3 py-1.5 rounded-md"
                style={{ background: 'var(--red-soft, #fee2e2)', color: 'var(--red, #dc2626)', border: '1px solid var(--red, #dc2626)', cursor: 'pointer', minHeight: 32 }}
              >🗑 Clear all activity</button>
            )}
          </div>
          <div className="rounded-lg overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            {activities.length === 0 && <div className="text-sm p-6 text-center" style={{ color: 'var(--text-muted)' }}>Nothing logged yet.</div>}
            {activities.map(a => (
              <AccountActivityRow
                key={a.id}
                activity={a}
                onOpenDocument={openActivityDocument}
                onDelete={async () => {
                  if (!confirm('Delete this activity entry?')) return
                  const r = await fetch('/api/activities', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'delete', id: a.id }),
                  })
                  if (r.ok) setActivities(prev => prev.filter(x => x.id !== a.id))
                }}
              />
            ))}
            {false && activities.map((a, i) => (
              <div key={a.id} className="px-4 py-3 group" style={{ borderBottom: i < activities.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <div className="flex items-start gap-2 mb-1">
                  <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0" style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>{a.type}</span>
                  <div className="text-sm flex-1" style={{ color: 'var(--text)' }}>{a.subject}</div>
                  <button
                    onClick={async () => {
                      if (!confirm('Delete this activity entry?')) return
                      const r = await fetch('/api/activities', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ action: 'delete', id: a.id }),
                      })
                      if (r.ok) setActivities(prev => prev.filter(x => x.id !== a.id))
                    }}
                    title="Delete this activity"
                    className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                    style={{ background: 'transparent', border: 'none', color: 'var(--red, #dc2626)', cursor: 'pointer', fontSize: 12, padding: '2px 6px', borderRadius: 4 }}
                  >✕</button>
                </div>
                {a.body && <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>{a.body}</div>}
                <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{new Date(a.at || a.createdAt || a.updatedAt).toLocaleString()}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'documents' && ['client', 'in-house'].includes(account.type) && (
        <div style={{ marginTop: 12 }}>
          <UrlReportRunner account={account} onFiled={() => setDocsRefresh(n => n + 1)} />
          <DocumentsManager key={docsRefresh} clientId={account.id} lockClient />
        </div>
      )}

      {tab === 'invoices' && hasBillingSurface && (
        <div style={{ marginTop: 12 }}>
          <InvoicesManager clientId={account.id} lockClient />
        </div>
      )}

      {tab === 'payments' && account.type === 'client' && (
        <>
          <AdminWalletPanel accountId={account.id} accountName={account.name} />
          <ClientPaymentsTab clientId={account.id} clientName={account.name} clientEmail={account.email} />
        </>
      )}

      {tab === 'support' && (
        <SupportManager scopedAccountId={account.id} scopedAccountName={account.name} embedded />
      )}

      {tab === 'admin' && isOwnerAdminAccount(account) && (
        <OwnerInboxTab account={account} />
      )}

      {tab === 'notes' && (
        <AccountNotesTab accountId={account.id} accountName={account.name} />
      )}

      {tab === 'media' && (
        <AccountMediaTab accountId={account.id} accountName={account.name} />
      )}

      {addingContact && <ContactForm accountId={account.id} onSave={saveContact} onClose={() => setAddingContact(false)} />}
      {editingContact && <ContactForm contact={editingContact} accountId={account.id} onSave={saveContact} onClose={() => setEditingContact(null)} />}
    </div>
  )
}

function TwilioCallButton({ phone, name }) {
  const [state, setState] = useState('idle') // idle | connecting | ringing | in-call | error
  const [errorMsg, setErrorMsg] = useState('')
  const deviceRef = useRef(null)
  const callRef = useRef(null)
  const confRef = useRef(null)

  const endCall = () => {
    try { callRef.current?.disconnect() } catch {}
    if (confRef.current) {
      fetch('/api/twilio/hangup-conf', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conf: confRef.current }) }).catch(() => {})
      confRef.current = null
    }
    callRef.current = null
    setState('idle')
  }

  const call = async () => {
    setErrorMsg('')
    setState('connecting')
    try {
      const { Device } = await import('@twilio/voice-sdk')
      const tokenRes = await fetch('/api/twilio/token').then(r => r.json())
      if (tokenRes.error) throw new Error(tokenRes.error)

      const device = new Device(tokenRes.token, { codecPreferences: ['opus', 'pcmu'] })
      deviceRef.current = device

      const confName = 'ff-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
      confRef.current = confName

      const connection = await device.connect({ params: { To: phone, Conf: confName } })
      callRef.current = connection
      setState('ringing')

      connection.on('accept', () => setState('in-call'))
      connection.on('disconnect', () => { setState('idle'); callRef.current = null; confRef.current = null; try { device.destroy() } catch {} })
      connection.on('cancel', () => { setState('idle'); callRef.current = null; confRef.current = null })
      connection.on('reject', () => { setState('error'); setErrorMsg('Rejected'); callRef.current = null; confRef.current = null })
      connection.on('error', (e) => { setState('error'); setErrorMsg(e?.message || 'call error'); callRef.current = null; confRef.current = null })
    } catch (e) {
      setState('error')
      setErrorMsg(e?.message || 'Failed to start call')
      setTimeout(() => { setState('idle'); setErrorMsg('') }, 5000)
    }
  }

  const label = {
    idle: `📞 ${phone}`,
    connecting: '📞 Connecting...',
    ringing: `📞 Ringing ${name}...`,
    'in-call': `📞 On call · Hang up`,
    error: `⚠ ${errorMsg}`,
  }[state]

  const color = state === 'error' ? 'var(--red)' : state === 'in-call' ? 'var(--green)' : 'var(--accent)'

  return (
    <button
      onClick={state === 'idle' || state === 'error' ? call : endCall}
      className="hover:underline"
      style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color }}
      title={state === 'in-call' ? 'Click to hang up' : `Call ${name}`}
    >
      {label}
    </button>
  )
}

function ClientEmailButton({ account, primaryContact, onSent }) {
  const [open, setOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [status, setStatus] = useState(null)
  const defaultEmail = account.email || primaryContact?.email || ''
  const [form, setForm] = useState({
    to: defaultEmail,
    sendAs: 'farrington',
    reason: CLIENT_EMAIL_REASONS[0],
    subject: '',
    body: '',
  })
  const selectedIdentity = CLIENT_EMAIL_IDENTITIES.find(identity => identity.id === form.sendAs) || CLIENT_EMAIL_IDENTITIES[0]
  const contactName = primaryContact?.name || account.contact || account.name

  useEffect(() => {
    if (!open) {
      setForm(f => ({ ...f, to: account.email || primaryContact?.email || '' }))
      setStatus(null)
    }
  }, [open, account.email, primaryContact?.email])

  const update = (key, value) => setForm(f => ({ ...f, [key]: value }))

  const send = async () => {
    const to = form.to.trim()
    const subject = form.subject.trim()
    const body = form.body.trim()
    if (!to.includes('@')) {
      setStatus({ kind: 'error', text: 'Enter a valid recipient email.' })
      return
    }
    if (!subject || !body) {
      setStatus({ kind: 'error', text: 'Subject and body are required.' })
      return
    }
    setSending(true)
    setStatus(null)
    try {
      const result = await fetch('/api/tools/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to,
          subject,
          body,
          brand: selectedIdentity.brand,
          from: selectedIdentity.from,
        }),
      }).then(r => r.json().then(j => ({ ...j, _ok: r.ok })))

      if (!result._ok || result.ok === false) {
        throw new Error(result.error || result.message || 'Email failed')
      }

      await api('/api/activities', {
        action: 'add',
        activity: {
          type: 'email_sent',
          subject: `Email sent: ${subject}`,
          body,
          linkedTo: { accountId: account.id },
          meta: {
            to,
            subject,
            sendAs: selectedIdentity.label,
            brand: selectedIdentity.brand,
            reason: form.reason,
            contactName,
            source: 'account-email-composer',
          },
        },
      }).catch(() => null)

      setStatus({ kind: 'success', text: `Email sent to ${to}.` })
      setForm(f => ({ ...f, to, subject: '', body: '' }))
      onSent?.()
      setTimeout(() => setOpen(false), 900)
    } catch (e) {
      setStatus({ kind: 'error', text: e.message || 'Email failed' })
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="px-3 py-2 rounded-lg text-sm inline-flex items-center gap-1.5"
        style={{ background: 'var(--surface2)', color: 'var(--accent)', border: '1px solid var(--border)' }}
        data-tooltip={defaultEmail ? `Email ${account.name} (${defaultEmail})` : `Email ${account.name}`}
        data-tooltip-side="bottom"
        aria-label={`Email ${account.name}`}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.9 5.2a2 2 0 002.2 0L21 8" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 6h14a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2z" />
        </svg>
        Email
      </button>

      {open && (
        <Modal title={`Email ${account.name}`} onClose={() => !sending && setOpen(false)} wide>
          {status && (
            <div
              className="text-xs mb-3 p-2 rounded"
              style={{
                background: status.kind === 'success' ? 'rgba(22,163,74,0.14)' : 'rgba(220,38,38,0.14)',
                color: status.kind === 'success' ? 'var(--green)' : 'var(--red)',
                border: `1px solid ${status.kind === 'success' ? 'rgba(22,163,74,0.28)' : 'rgba(220,38,38,0.28)'}`,
              }}
            >
              {status.text}
            </div>
          )}
          <div
            className="mb-4 rounded-lg p-3"
            style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}
          >
            <div className="text-[11px] uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>Client context</div>
            <div className="text-sm font-medium" style={{ color: 'var(--text)' }}>{account.name}</div>
            <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              Contact: {contactName || 'Not set'} · Recipient: {form.to || 'Not set'} · Sending as: {selectedIdentity.label}
            </div>
          </div>
          <Field label="Send as">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {CLIENT_EMAIL_IDENTITIES.map(identity => {
                const active = identity.id === selectedIdentity.id
                return (
                  <button
                    key={identity.id}
                    type="button"
                    onClick={() => update('sendAs', identity.id)}
                    aria-pressed={active}
                    className="text-left rounded-lg p-3 transition-colors"
                    style={{
                      background: active ? 'var(--accent-soft)' : 'var(--surface2)',
                      color: active ? 'var(--accent)' : 'var(--text)',
                      border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                    }}
                  >
                    <div className="text-sm font-semibold">{identity.label}</div>
                    <div className="text-[11px] mt-1 leading-snug" style={{ color: active ? 'var(--accent)' : 'var(--text-muted)' }}>
                      {identity.detail}
                    </div>
                  </button>
                )
              })}
            </div>
          </Field>
          <Field label="Reason / context">
            <ThemedSelect
              style={inp}
              value={form.reason}
              onChange={e => update('reason', e.target.value)}
            >
              {CLIENT_EMAIL_REASONS.map(reason => <option key={reason} value={reason}>{reason}</option>)}
            </ThemedSelect>
          </Field>
          <Field label="To *">
            <input
              style={inp}
              type="email"
              value={form.to}
              onChange={e => update('to', e.target.value)}
              placeholder="client@example.com"
              autoFocus
            />
          </Field>
          <Field label="Subject *">
            <input
              style={inp}
              value={form.subject}
              onChange={e => update('subject', e.target.value)}
              placeholder={`Follow-up for ${account.name}`}
            />
          </Field>
          <Field label="Body *">
            <textarea
              style={{ ...inp, minHeight: 220, resize: 'vertical', lineHeight: 1.5 }}
              value={form.body}
              onChange={e => update('body', e.target.value)}
              placeholder="Write the email here..."
            />
          </Field>
          <div className="flex justify-end gap-2 mt-4">
            <button
              onClick={() => setOpen(false)}
              disabled={sending}
              className="px-4 py-2 rounded-lg text-sm disabled:opacity-50"
              style={{ background: 'var(--surface2)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
            >
              Cancel
            </button>
            <button
              onClick={send}
              disabled={sending}
              className="px-5 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
              style={{ background: 'var(--accent)', color: 'var(--accent-text)', border: 'none' }}
            >
              {sending ? 'Sending...' : `Send as ${selectedIdentity.label}`}
            </button>
          </div>
        </Modal>
      )}
    </>
  )
}

function VideoCallButton({ account }) {
  const [sending, setSending] = useState(false)
  const [status, setStatus] = useState(null)

  const email = account.email || ''
  const hasEmail = email && email.includes('@')

  const start = async () => {
    setSending(true)
    setStatus(null)
    const unique = Math.random().toString(36).slice(2, 8)
    try {
      const r = await fetch('/api/video/create-room', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: hasEmail ? email : '',
          name: account.name,
          subject: `Video call with Farrington Development`,
          persistent: false,
          seed: `${account.name}-${unique}`,
          linkedTo: { accountId: account.id },
        }),
      }).then(res => res.json())

      if (r.url) {
        // Hand off to the global ActiveVideoCall window so the call survives navigation.
        window.dispatchEvent(new CustomEvent('fcc:start-video-call', {
          detail: { url: r.url, accountId: account.id, accountName: account.name },
        }))
        if (hasEmail) {
          const invite = await fetch('/api/video/invite', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: email,
              name: account.name,
              subject: 'Video call with Farrington Development',
              persistent: false,
              seed: account.name + '-' + unique,
              linkedTo: { accountId: account.id },
              existingUrl: r.url,
              existingRoom: r.name,
            }),
          }).then(res => res.json()).catch(e => ({ ok: false, error: e.message }))
          if (invite.ok) setStatus({ kind: 'success', msg: 'Invite sent to ' + email + '; room opened' })
          else setStatus({ kind: 'error', msg: (invite.error || 'Email failed') + ' - room opened' })
        } else {
          setStatus({ kind: 'info', msg: 'No email on file - copy the link to share' })
        }
      } else {
        setStatus({ kind: 'error', msg: r.error || 'Failed to create video room' })
      }
    } catch (e) {
      setStatus({ kind: 'error', msg: e.message })
    }
    setSending(false)
    setTimeout(() => setStatus(null), 5000)
  }

  return (
    <div className="relative">
      <button
        onClick={start}
        disabled={sending}
        className="px-3 py-2 rounded-lg text-sm inline-flex items-center gap-1.5 disabled:opacity-60"
        style={{ background: 'var(--accent)', color: 'var(--accent-text)', border: 'none' }}
        data-tooltip={hasEmail ? `Video call ${account.name} (${email})` : `Open video room (no email on file)`}
        data-tooltip-side="bottom"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
        {sending ? 'Starting...' : 'Video Call'}
      </button>
      {status && (
        <div
          className="absolute right-0 top-full mt-2 px-3 py-2 rounded-lg text-xs whitespace-nowrap z-10"
          style={{
            background: status.kind === 'success' ? 'var(--green)' : status.kind === 'error' ? 'var(--red)' : 'var(--amber)',
            color: 'var(--accent-text)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          }}
        >
          {status.msg}
        </div>
      )}
    </div>
  )
}

// Admin approval action: grants portal access, with optional complimentary,
// promotional credit, and concierge voice settings. Idempotent server-side.
export function EnablePortalButton({ account, onEnabled }) {
  const [configuring, setConfiguring] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [partialOutcome, setPartialOutcome] = useState('')
  const [complimentary, setComplimentary] = useState(false)
  const [complimentaryDuration, setComplimentaryDuration] = useState('30_days')
  const [complimentaryExpiresAt, setComplimentaryExpiresAt] = useState('')
  const [complimentaryReason, setComplimentaryReason] = useState('30-day concierge introduction')
  const [grantCredits, setGrantCredits] = useState(false)
  const [credits, setCredits] = useState(10000)
  const [creditExpiration, setCreditExpiration] = useState('30_days')
  const [creditExpiresAt, setCreditExpiresAt] = useState('')
  const [creditReason, setCreditReason] = useState('30-day concierge trial')
  const [voiceEnabled, setVoiceEnabled] = useState(false)
  const [dailyVoiceMinutes, setDailyVoiceMinutes] = useState(15)
  const [maxSessionMinutes, setMaxSessionMinutes] = useState(10)
  const [idleTimeoutSeconds, setIdleTimeoutSeconds] = useState(90)

  const enable = async event => {
    event.preventDefault()
    if (busy) return
    setError('')
    if (complimentary && complimentaryReason.trim().length < 3) {
      setError('Enter a reason for complimentary status.')
      return
    }
    if (complimentary && complimentaryDuration === 'custom' && !complimentaryExpiresAt) {
      setError('Choose a complimentary expiration date.')
      return
    }
    if (grantCredits && (!Number.isSafeInteger(Number(credits)) || Number(credits) < 1)) {
      setError('Enter a whole promotional credit amount greater than zero.')
      return
    }
    if (grantCredits && creditReason.trim().length < 3) {
      setError('Enter a reason for the promotional credit audit trail.')
      return
    }
    if (grantCredits && creditExpiration === 'custom' && !creditExpiresAt) {
      setError('Choose a promotional credit expiration date.')
      return
    }
    const choices = [
      'portal access',
      complimentary ? `complimentary status (${complimentaryDuration === '30_days' ? '30 days' : complimentaryDuration === 'never' ? 'no expiration' : complimentaryExpiresAt})` : null,
      grantCredits ? `${Number(credits).toLocaleString()} promotional credits` : null,
      voiceEnabled ? `${dailyVoiceMinutes} premium voice minutes per day` : null,
    ].filter(Boolean).join(', ')
    if (!window.confirm(`Enable ${choices} for ${account.name}?`)) return
    setBusy(true)
    try {
      const requestId = globalThis.crypto?.randomUUID?.()
        || `portal-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
      const r = await fetch('/api/accounts/enable-portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: account.id,
          complimentary,
          ...(complimentary ? {
            complimentaryDuration,
            complimentaryReason: complimentaryReason.trim(),
            ...(complimentaryDuration === 'custom' ? { complimentaryExpiresAt } : {}),
          } : {}),
          promotionalCreditGrant: {
            enabled: grantCredits,
            ...(grantCredits ? {
              credits: Number(credits),
              expiration: creditExpiration,
              ...(creditExpiration === 'custom' ? { expiresAt: creditExpiresAt } : {}),
              reason: creditReason.trim(),
              requestId,
            } : {}),
          },
          conciergeVoice: {
            enabled: voiceEnabled,
            ...(voiceEnabled ? {
              dailySeconds: Number(dailyVoiceMinutes) * 60,
              maxSessionSeconds: Number(maxSessionMinutes) * 60,
              idleTimeoutSeconds: Number(idleTimeoutSeconds),
              warningThresholds: [50, 75, 90, 100],
            } : {}),
          },
        }),
      })
      const j = await r.json()
      if (!r.ok || !j.ok) throw new Error(j.error || 'Could not enable portal')
      if (j.creditGrantFailed) {
        setPartialOutcome(j.creditGrantMessage || 'Portal access was enabled, but promotional credits were not issued. Review the credit ledger before retrying.')
        return
      }
      setConfiguring(false)
      if (typeof onEnabled === 'function') onEnabled()
    } catch (e) {
      setError(e.message || 'Could not enable portal')
    } finally {
      setBusy(false)
    }
  }

  if (partialOutcome) {
    return (
      <div role="status" className="w-full md:w-[28rem] rounded-xl p-4 grid gap-3" style={{ background: 'var(--amber-dim)', color: 'var(--amber)', border: '1px solid var(--border)' }}>
        <div>
          <strong className="text-sm">Portal enabled; credit grant needs review</strong>
          <p className="text-xs mt-1">{partialOutcome}</p>
        </div>
        <button type="button" onClick={() => onEnabled?.()} className="justify-self-end px-4 min-h-12 rounded-lg text-sm font-semibold" style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}>
          Refresh account
        </button>
      </div>
    )
  }

  if (!configuring) {
    return (
      <button
        type="button"
        onClick={() => setConfiguring(true)}
        className="px-3 min-h-12 rounded-lg text-sm inline-flex items-center gap-1.5"
        style={{ background: 'var(--accent)', color: 'var(--accent-text)', border: '1px solid var(--border)' }}
        aria-label={`Configure portal access for ${account.name}`}
      >
        Enable portal
      </button>
    )
  }

  return (
    <form onSubmit={enable} className="w-full md:w-[28rem] rounded-xl p-4 grid gap-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }} aria-label={`Portal access options for ${account.name}`}>
      <div>
        <strong className="text-sm">Enable client portal</strong>
        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Portal access is independent. Add complimentary benefits only when you choose them.</p>
      </div>

      {error && <div role="alert" className="rounded-lg px-3 py-2 text-xs" style={{ background: 'var(--red-dim)', color: 'var(--red)' }}>{error}</div>}

      <label className="flex items-start gap-3 min-h-12">
        <input type="checkbox" checked={complimentary} onChange={event => setComplimentary(event.target.checked)} className="mt-1" />
        <span><strong className="text-sm block">Complimentary account</strong><span className="text-xs" style={{ color: 'var(--text-muted)' }}>Optional owner/admin benefit.</span></span>
      </label>
      {complimentary && (
        <div className="grid sm:grid-cols-2 gap-2 pl-6">
          <label className="grid gap-1 text-xs">Duration
            <select value={complimentaryDuration} onChange={event => setComplimentaryDuration(event.target.value)} className="rounded-lg px-3 min-h-12" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
              <option value="30_days">30 days</option>
              <option value="custom">Custom date</option>
              <option value="never">No expiration</option>
            </select>
          </label>
          {complimentaryDuration === 'custom' && <label className="grid gap-1 text-xs">Expires
            <input type="date" value={complimentaryExpiresAt} onChange={event => setComplimentaryExpiresAt(event.target.value)} className="rounded-lg px-3 min-h-12" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }} />
          </label>}
          <label className="grid gap-1 text-xs sm:col-span-2">Authorization reason
            <input value={complimentaryReason} maxLength={300} onChange={event => setComplimentaryReason(event.target.value)} className="rounded-lg px-3 min-h-12" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }} />
          </label>
        </div>
      )}

      <label className="flex items-start gap-3 min-h-12">
        <input type="checkbox" checked={grantCredits} onChange={event => setGrantCredits(event.target.checked)} className="mt-1" />
        <span><strong className="text-sm block">Grant promotional credits</strong><span className="text-xs" style={{ color: 'var(--text-muted)' }}>Separate from portal and comp status.</span></span>
      </label>
      {grantCredits && (
        <div className="grid sm:grid-cols-2 gap-2 pl-6">
          <label className="grid gap-1 text-xs">Credits
            <input type="number" min="1" max="1000000" step="1" value={credits} onChange={event => setCredits(Number(event.target.value))} className="rounded-lg px-3 min-h-12" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }} />
          </label>
          <label className="grid gap-1 text-xs">Expiration
            <select value={creditExpiration} onChange={event => setCreditExpiration(event.target.value)} className="rounded-lg px-3 min-h-12" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
              <option value="30_days">30 days</option>
              <option value="custom">Custom date</option>
              <option value="never">Never</option>
            </select>
          </label>
          {creditExpiration === 'custom' && <label className="grid gap-1 text-xs sm:col-span-2">Credit expiration date
            <input type="date" value={creditExpiresAt} onChange={event => setCreditExpiresAt(event.target.value)} className="rounded-lg px-3 min-h-12" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }} />
          </label>}
          <label className="grid gap-1 text-xs sm:col-span-2">Grant reason
            <input value={creditReason} maxLength={300} onChange={event => setCreditReason(event.target.value)} className="rounded-lg px-3 min-h-12" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }} />
          </label>
        </div>
      )}

      <label className="flex items-start gap-3 min-h-12">
        <input type="checkbox" checked={voiceEnabled} onChange={event => setVoiceEnabled(event.target.checked)} className="mt-1" />
        <span><strong className="text-sm block">Include premium Cheryl voice allowance</strong><span className="text-xs" style={{ color: 'var(--text-muted)' }}>Usage-limited and independent from credits.</span></span>
      </label>
      {voiceEnabled && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pl-6">
          <label className="grid gap-1 text-xs">Daily minutes
            <input type="number" min="1" step="1" value={dailyVoiceMinutes} onChange={event => setDailyVoiceMinutes(Number(event.target.value))} className="rounded-lg px-3 min-h-12" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }} />
          </label>
          <label className="grid gap-1 text-xs">Session minutes
            <input type="number" min="1" step="1" value={maxSessionMinutes} onChange={event => setMaxSessionMinutes(Number(event.target.value))} className="rounded-lg px-3 min-h-12" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }} />
          </label>
          <label className="grid gap-1 text-xs">Idle seconds
            <input type="number" min="1" step="1" value={idleTimeoutSeconds} onChange={event => setIdleTimeoutSeconds(Number(event.target.value))} className="rounded-lg px-3 min-h-12" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }} />
          </label>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={() => { setConfiguring(false); setError('') }} disabled={busy} className="px-3 min-h-12 rounded-lg text-sm" style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}>Cancel</button>
        <button type="submit" disabled={busy} aria-busy={busy} className="px-4 min-h-12 rounded-lg text-sm font-semibold disabled:opacity-60" style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}>{busy ? 'Enabling…' : 'Enable portal'}</button>
      </div>
    </form>
  )
}

function DisablePortalButton({ account, onDisabled }) {
  const [busy, setBusy] = useState(false)

  const disable = async () => {
    if (busy) return
    if (!window.confirm(`Disable portal access for ${account.name}? Their services and billing will remain active, but all portal sessions and sign-in links will be revoked.`)) return
    setBusy(true)
    try {
      const r = await fetch('/api/accounts/disable-portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: account.id }),
      })
      const j = await r.json()
      if (!r.ok || !j.ok) throw new Error(j.error || 'Could not disable portal')
      if (typeof onDisabled === 'function') onDisabled()
    } catch (e) {
      alert(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={disable}
      disabled={busy}
      aria-label={`Disable portal access for ${account.name}`}
      title="Disable portal access and revoke sessions"
      className="w-9 h-9 rounded-lg inline-flex items-center justify-center disabled:opacity-60"
      style={{ background: 'var(--red-soft)', color: 'var(--red)', border: '1px solid var(--border)' }}
    >
      <Power size={16} aria-hidden="true" />
    </button>
  )
}

function AccountPortalPreviewButton({ account }) {
  const [busy, setBusy] = useState(false)

  const openPortal = async () => {
    if (busy) return
    setBusy(true)
    const portalTab = window.open('about:blank', '_blank')
    try {
      const r = await fetch('/api/admin/portal-login-as', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId: account.id }),
      })
      const j = await r.json()
      if (!j.ok || !j.url) throw new Error(j.error || 'Could not open portal')
      if (portalTab) portalTab.location.href = j.url
      else window.open(j.url, '_blank')
    } catch (e) {
      if (portalTab) portalTab.close()
      alert(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      onClick={openPortal}
      disabled={busy}
      className="px-3 py-2 rounded-lg text-sm inline-flex items-center gap-1.5 disabled:opacity-60"
      style={{ background: 'var(--surface2)', color: 'var(--accent)', border: '1px solid var(--border)' }}
      data-tooltip={`Preview ${account.name}'s client portal`}
      data-tooltip-side="bottom"
      aria-label={`Preview ${account.name}'s client portal`}
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M7 3h8a2 2 0 012 2v14a2 2 0 01-2 2H7z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M11 12h8m0 0l-3-3m3 3l-3 3" />
        <circle cx="10" cy="12" r="0.8" fill="currentColor" stroke="none" />
      </svg>
      {busy ? 'Opening...' : 'Portal'}
    </button>
  )
}

function InlineVideoCall({ url, account, onLeave }) {
  const [copied, setCopied] = useState(false)

  const copy = () => {
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <div className="rounded-xl overflow-hidden flex flex-col" style={{ background: 'var(--surface)', border: '1px solid var(--border)', height: '70vh', minHeight: 480 }}>
      <div className="flex items-center justify-between px-4 py-2" style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}>
        <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text)' }}>
          <span className="inline-block w-2 h-2 rounded-full animate-pulse" style={{ background: 'var(--green)' }}></span>
          <span className="font-semibold">Video Call · {account.name}</span>
          <span className="text-xs hidden md:inline" style={{ color: 'var(--text-muted)' }}>{url.replace('https://', '')}</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={copy} className="text-xs px-2 py-1 rounded" style={{ background: 'var(--surface)', color: 'var(--accent)', border: '1px solid var(--border)' }}>{copied ? '✓ Copied' : 'Copy link'}</button>
          <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs px-2 py-1 rounded" style={{ background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>Pop out ↗</a>
          <button onClick={onLeave} className="text-xs px-3 py-1 rounded font-medium" style={{ background: 'var(--red)', color: 'var(--accent-text)' }}>Leave</button>
        </div>
      </div>
      <iframe
        src={url}
        allow="camera *; microphone *; fullscreen *; display-capture *; autoplay *; clipboard-write *"
        className="flex-1 w-full"
        style={{ background: '#000', border: 'none' }}
      />
    </div>
  )
}

function ClientPaymentsTab({ clientId, clientName, clientEmail }) {
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [showPayForm, setShowPayForm] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  const loadPayments = useCallback(() => {
    fetch(`/api/payments?clientId=${encodeURIComponent(clientId)}`, { cache: 'no-store' }).then(r => r.json()).then(d => {
      const mine = (d.payments || []).filter(p => p.clientId === clientId || p.clientName === clientName)
      setPayments(mine.sort((a,b) => new Date(b.date) - new Date(a.date)))
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [clientId, clientName])

  useEffect(() => {
    loadPayments()
    const id = setInterval(loadPayments, 5000)
    const onChanged = () => loadPayments()
    window.addEventListener('fcc:payments-changed', onChanged)
    window.addEventListener('focus', onChanged)
    return () => {
      clearInterval(id)
      window.removeEventListener('fcc:payments-changed', onChanged)
      window.removeEventListener('focus', onChanged)
    }
  }, [loadPayments, refreshKey])

  const fmtUSD = n => (Number(n) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
  const fmtDate = d => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'
  const isPaidPayment = p => ['succeeded', 'received', 'paid'].includes(String(p?.status || '').toLowerCase())
  const total = payments.filter(isPaidPayment).reduce((s,p) => s + (Number(p.amount) || 0), 0)

  const TakeBtn = (
    <button
      onClick={() => setShowPayForm(true)}
      className="px-5 py-2.5 rounded-lg text-sm font-semibold inline-flex items-center gap-2"
      style={{ background: 'var(--green)', color: 'var(--accent-text)', border: 'none' }}
    >
      <span>💳</span>
      Take Payment
    </button>
  )

  return (
    <>
      {loading ? (
        <div className="text-center py-8" style={{ color: 'var(--text-muted)' }}>Loading payments...</div>
      ) : payments.length === 0 ? (
        <div className="text-center py-12 rounded-xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="text-3xl mb-3">💳</div>
          <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>No payments recorded for {clientName} yet.</p>
          <div className="flex justify-center">{TakeBtn}</div>
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="flex justify-between items-center px-4 py-3" style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}>
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{payments.length} payment{payments.length !== 1 ? 's' : ''}</span>
              <span className="text-sm font-mono font-bold" style={{ color: 'var(--green)' }}>Collected: {fmtUSD(total)}</span>
            </div>
            {TakeBtn}
          </div>
          <table className="w-full" style={{ borderCollapse: 'collapse' }}>
            <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Date','Description','Invoice','Amount','Card','Status'].map(h =>
                <th key={h} className="px-4 py-2 text-left text-xs font-medium uppercase" style={{ color: 'var(--text-muted)' }}>{h}</th>
              )}
            </tr></thead>
            <tbody>
              {payments.map((p, i) => (
                <tr key={p.id} style={{ borderBottom: i < payments.length-1 ? '1px solid var(--border)' : 'none' }}>
                  <td className="px-4 py-2 text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{fmtDate(p.date)}</td>
                  <td className="px-4 py-2 text-sm" style={{ color: 'var(--text)' }}>{p.description || '—'}</td>
                  <td className="px-4 py-2 text-xs font-mono" style={{ color: p.invoiceNumber ? 'var(--accent)' : 'var(--text-muted)' }}>{p.invoiceNumber || '—'}</td>
                  <td className="px-4 py-2 text-sm font-mono font-semibold" style={{ color: 'var(--green)' }}>{fmtUSD(p.amount)}</td>
                  <td className="px-4 py-2 text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{p.brand && p.last4 ? `${p.brand} ••${p.last4}` : '—'}</td>
                  <td className="px-4 py-2 text-xs" style={{ color: isPaidPayment(p) ? 'var(--green)' : 'var(--red)' }}>{p.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showPayForm && (
        <PaymentForm
          prefillClient={{ id: clientId, name: clientName, email: clientEmail }}
          onSuccess={() => { setShowPayForm(false); setRefreshKey(k => k + 1) }}
          onClose={() => setShowPayForm(false)}
        />
      )}
    </>
  )
}

export default function AccountsManager({ onNavigate }) {
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  // Another tab (Pipelines "Open account") can hand us a one-shot search term.
  useEffect(() => {
    try { const v = sessionStorage.getItem('fcc.accounts.prefillSearch'); if (v) { sessionStorage.removeItem('fcc.accounts.prefillSearch'); setSearch(v) } } catch {}
  }, [])
  const [filterStage, setFilterStage] = useState('all')
  const [filterPriority, setFilterPriority] = useState('all')
  const [sortBy, setSortBy] = useState('updated')
  const [sortDir, setSortDir] = useState('desc')
  const [view, setView] = useState('list')
  const [selected, setSelected] = useState(null)
  const [editing, setEditing] = useState(null)
  const [adding, setAdding] = useState(false)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)

  const refresh = useCallback(async () => {
    const r = await fetch('/api/accounts').then(r => r.json())
    setAccounts(r.accounts || [])
    setLoading(false)
    if (selected) {
      const match = (r.accounts || []).find(a => a.id === selected.id && a.type === 'client')
      match ? setSelected(match) : setSelected(null)
    }
  }, [selected])
  useEffect(() => { refresh() /* eslint-disable-next-line */ }, [])

  // Listen for voice-driven record selection (Matilda dispatches this after open_record).
  // Uses window-level pending state so events that fire BEFORE accounts load still get applied.
  useEffect(() => {
    const handler = (e) => {
      const r = e.detail
      if (!r || r.type !== 'account') return
      if (typeof window !== 'undefined') window.__fccPendingAccountSelect = { id: r.id, ts: Date.now() }
      if (r.subTab || r.itemQuery) {
        window.__fccPendingRecordSubTab = { subTab: r.subTab, itemQuery: r.itemQuery, accountId: r.id, ts: Date.now() }
        setTimeout(() => window.dispatchEvent(new CustomEvent('fcc:record-subtab', {
          detail: { subTab: r.subTab, itemQuery: r.itemQuery, accountId: r.id },
        })), 250)
      }
      const match = accounts.find(a => a.id === r.id)
      if (match?.type === 'client') { setSelected(match); window.__fccPendingAccountSelect = null }
    }
    window.addEventListener('fcc:select-record', handler)
    return () => window.removeEventListener('fcc:select-record', handler)
  }, [accounts])

  // When accounts load/change, drain any pending selection that arrived before data was ready
  useEffect(() => {
    if (typeof window === 'undefined') return
    const pending = window.__fccPendingAccountSelect
    if (!pending || Date.now() - pending.ts > 10000) return
    const match = accounts.find(a => a.id === pending.id)
    if (match?.type === 'client') { setSelected(match); window.__fccPendingAccountSelect = null }
  }, [accounts])

  const save = async (form) => {
    const action = form.id ? 'update' : 'add'
    await api('/api/accounts', { action, account: { ...form, type: 'client' } })
    setAdding(false); setEditing(null)
    await refresh()
  }
  const del = async (id) => { if (!confirm('Delete this client account? All related contacts stay.')) return; await api('/api/accounts', { action: 'delete', id }); await refresh(); setSelected(null) }
  const bulkDelete = async () => {
    const ids = Array.from(selectedIds)
    if (!ids.length || !confirm(`Delete ${ids.length} selected client account${ids.length === 1 ? '' : 's'}? Related contacts stay.`)) return
    setBulkDeleting(true)
    try {
      await api('/api/accounts', { action: 'bulk_delete', ids })
      setSelectedIds(new Set())
      await refresh()
    } finally {
      setBulkDeleting(false)
    }
  }

  const filtered = useMemo(() => {
    const priOrder = { vip: 0, high: 1, medium: 2, low: 3 }
    let out = accounts.filter(a => a.type === 'client')
    if (search.trim()) {
      const q = search.toLowerCase()
      out = out.filter(a => (a.name || '').toLowerCase().includes(q) || (a.industry || '').toLowerCase().includes(q) || (a.website || '').toLowerCase().includes(q) || (a.tags || []).some(t => t.toLowerCase().includes(q)))
    }
    if (filterStage !== 'all') out = out.filter(a => a.stage === filterStage)
    if (filterPriority !== 'all') out = out.filter(a => a.priority === filterPriority)
    out = [...out].sort((a, b) => {
      let cmp = 0
      if (sortBy === 'name') cmp = (a.name || '').localeCompare(b.name || '')
      else if (sortBy === 'priority') cmp = (priOrder[a.priority] ?? 9) - (priOrder[b.priority] ?? 9)
      else if (sortBy === 'updated') cmp = new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime()
      return sortDir === 'asc' ? cmp : -cmp
    })
    return out
  }, [accounts, search, filterStage, filterPriority, sortBy, sortDir])

  const stats = useMemo(() => ({
    clients: accounts.filter(a => a.type === 'client').length,
    hiddenOrganizations: accounts.filter(a => a.type !== 'client').length,
    vips: accounts.filter(a => a.type === 'client' && a.priority === 'vip').length,
  }), [accounts])

  const { page, setPage, pageSize, setPageSize, paginated } = usePagination(filtered, 25)
  const paginatedIds = useMemo(() => paginated.map(a => a.id), [paginated])
  useEffect(() => { setSelectedIds(new Set()) }, [search, filterStage, filterPriority, sortBy, sortDir, view, page])
  const toggleSelected = (id, event) => {
    event?.stopPropagation?.()
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  const toggleAll = () => setSelectedIds(prev => prev.size === paginatedIds.length ? new Set() : new Set(paginatedIds))

  const sel = { background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 10px', borderRadius: 6, fontSize: 12, outline: 'none' }

  if (selected) {
    return (
      <div className="p-6">
        <AccountDetail account={selected} onBack={() => setSelected(null)} onEdit={setEditing} onRefresh={refresh} />
        {editing && <AccountForm account={editing} onSave={save} onClose={() => setEditing(null)} />}
      </div>
    )
  }

  return (
    <div className="command-workspace p-6">
      <PageHeader
        icon="🏢"
        title="Accounts"
        subtitle={`${stats.clients} client account${stats.clients === 1 ? '' : 's'} · ${stats.hiddenOrganizations} non-client organization record${stats.hiddenOrganizations === 1 ? '' : 's'} kept out of this view · ${stats.vips} VIP`}
        actions={<button className="px-3 rounded-lg text-sm font-semibold" style={{ background: 'var(--accent)', color: 'var(--accent-text)', minHeight: 40 }} onClick={() => setAdding(true)}>New Client Account</button>}
        viewToggle={<ViewModeToggle value={view} onChange={setView} modes={['list', 'card']} />}
      />

      <div className="command-toolbar flex gap-2 items-center flex-wrap mb-4">
        <input style={{ ...sel, flex: 1, minWidth: 200, padding: '8px 12px', fontSize: 13 }} placeholder="Search client accounts, industry, website, tags..." value={search} onChange={e => setSearch(e.target.value)} />
        <ThemedSelect style={sel} value={filterStage} onChange={e => setFilterStage(e.target.value)}><option value="all">All Stages</option>{STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</ThemedSelect>
        <ThemedSelect style={sel} value={filterPriority} onChange={e => setFilterPriority(e.target.value)}><option value="all">All Priority</option>{PRIORITY.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</ThemedSelect>
        <ThemedSelect style={sel} value={sortBy} onChange={e => setSortBy(e.target.value)}>
          <option value="updated">Sort: Updated</option>
          <option value="name">Sort: Name</option>
          <option value="priority">Sort: Priority</option>
        </ThemedSelect>
        <button style={{ ...sel, cursor: 'pointer', minWidth: 32 }} onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}>{sortDir === 'asc' ? '↑' : '↓'}</button>
        <BulkActionsMenu
          selectedCount={selectedIds.size}
          totalCount={paginated.length}
          onSelectPage={() => setSelectedIds(new Set(paginatedIds))}
          onClearSelection={() => setSelectedIds(new Set())}
          onDeleteSelected={bulkDelete}
          disabled={bulkDeleting}
        />
      </div>

      {loading ? <div className="text-center py-16" style={{ color: 'var(--text-muted)' }}>Loading...</div>
        : filtered.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-3">🏢</div>
            <p style={{ color: 'var(--text-muted)' }}>{stats.clients === 0 ? 'No client accounts yet.' : 'No client accounts match these filters.'}</p>
          </div>
        ) : view === 'card' ? (
          <>
          {false && <div className="rounded-xl p-3 mb-3 flex items-center gap-3 flex-wrap" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
            <label className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--text)' }}>
              <input type="checkbox" checked={selectedIds.size === paginatedIds.length && paginatedIds.length > 0} onChange={toggleAll} style={{ width: 20, height: 20 }} />
              {selectedIds.size === 0 ? 'Select all' : `${selectedIds.size} selected`}
            </label>
            {selectedIds.size > 0 && (
              <>
                <button type="button" onClick={() => setSelectedIds(new Set())} className="rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>Clear</button>
                <button type="button" onClick={bulkDelete} disabled={bulkDeleting} className="ml-auto rounded-lg px-3 py-2 text-sm font-semibold" style={{ background: 'var(--red)', color: 'white', border: '1px solid var(--red)', opacity: bulkDeleting ? 0.6 : 1 }}>{bulkDeleting ? 'Deleting...' : `Delete ${selectedIds.size}`}</button>
              </>
            )}
          </div>}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {paginated.map(a => {
              const type = typeMeta(a.type), stage = stageMeta(a.stage), pri = priMeta(a.priority)
              const isSelected = selectedIds.has(a.id)
              return (
                <div key={a.id} onClick={() => setSelected(a)} className="rounded-xl p-5 cursor-pointer group transition-all relative" style={{ background: isSelected ? 'var(--accent-soft)' : 'var(--surface)', border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}` }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = isSelected ? 'var(--accent)' : 'var(--border)' }}>
                  {a.priority === 'vip' && <div className="absolute top-0 right-0 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-bl-lg rounded-tr-xl" style={{ background: 'var(--red)', color: 'white' }}>VIP</div>}
                  <input type="checkbox" aria-label={`Select ${a.name}`} checked={isSelected} onClick={e => e.stopPropagation()} onChange={e => toggleSelected(a.id, e)} style={{ width: 20, height: 20, position: 'absolute', top: 12, left: 12 }} />
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-sm shrink-0" style={{ background: type.bg, color: type.color }}>{initials(a.name)}</div>
                    <div className="min-w-0 flex-1">
                      <div className="text-base font-semibold truncate" style={{ color: 'var(--text)' }}>{a.name}</div>
                      <div className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{a.industry || 'No industry'}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap mb-3">
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: type.bg, color: type.color }}>{type.label}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: stage.bg, color: stage.color }}>{stage.label}</span>
                    {a.priority !== 'medium' && a.priority !== 'vip' && <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: pri.color }}>{pri.label}</span>}
                  </div>
                  {(a.tags || []).length > 0 && <div className="flex flex-wrap gap-1 mb-2">{a.tags.slice(0, 4).map(t => <span key={t} className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>#{t}</span>)}</div>}
                  {a.notes && <div className="text-xs line-clamp-2 mb-2" style={{ color: 'var(--text-muted)' }}>{a.notes}</div>}
                   <div className="flex justify-end gap-1 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
                    <ItemActionsMenu
                      label={`Actions for ${a.name}`}
                      actions={[
                        { label: 'Open account', onClick: () => setSelected(a) },
                        { label: 'Edit account', onClick: () => setEditing(a) },
                        { label: 'Delete account', tone: 'danger', onClick: () => del(a.id) },
                      ]}
                    />
                  </div>
                </div>
              )
            })}
          </div>
          <Paginator total={filtered.length} page={page} pageSize={pageSize} onPage={setPage} onPageSize={setPageSize} label="accounts" />
          </>
        ) : (
          <>
          {false && <div className="rounded-xl p-3 mb-3 flex items-center gap-3 flex-wrap" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
            <label className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--text)' }}>
              <input type="checkbox" checked={selectedIds.size === paginatedIds.length && paginatedIds.length > 0} onChange={toggleAll} style={{ width: 20, height: 20 }} />
              {selectedIds.size === 0 ? 'Select all' : `${selectedIds.size} selected`}
            </label>
            {selectedIds.size > 0 && (
              <>
                <button type="button" onClick={() => setSelectedIds(new Set())} className="rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>Clear</button>
                <button type="button" onClick={bulkDelete} disabled={bulkDeleting} className="ml-auto rounded-lg px-3 py-2 text-sm font-semibold" style={{ background: 'var(--red)', color: 'white', border: '1px solid var(--red)', opacity: bulkDeleting ? 0.6 : 1 }}>{bulkDeleting ? 'Deleting...' : `Delete ${selectedIds.size}`}</button>
              </>
            )}
          </div>}
          <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
                  <th className="text-left px-4 py-2 w-[44px]" style={{ color: 'var(--text-muted)' }}><input type="checkbox" checked={selectedIds.size === paginatedIds.length && paginatedIds.length > 0} onChange={toggleAll} style={{ width: 20, height: 20 }} /></th>
                  <th className="text-left px-4 py-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Account</th>
                  <th className="text-left px-4 py-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Type</th>
                  <th className="text-left px-4 py-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Stage</th>
                  <th className="text-left px-4 py-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Industry</th>
                  <th className="text-right px-4 py-2 text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}></th>
                </tr>
              </thead>
              <tbody>
                {paginated.map(a => {
                  const type = typeMeta(a.type), stage = stageMeta(a.stage)
                  const isSelected = selectedIds.has(a.id)
                  return (
                    <tr key={a.id} onClick={() => setSelected(a)} className="group cursor-pointer" style={{ borderBottom: '1px solid var(--border)', background: isSelected ? 'var(--accent-soft)' : '' }}
                      onMouseEnter={e => { e.currentTarget.style.background = isSelected ? 'var(--accent-soft)' : 'var(--surface2)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = isSelected ? 'var(--accent-soft)' : '' }}>
                      <td className="px-4 py-3"><input type="checkbox" aria-label={`Select ${a.name}`} checked={isSelected} onClick={e => e.stopPropagation()} onChange={e => toggleSelected(a.id, e)} style={{ width: 20, height: 20 }} /></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-[11px] shrink-0" style={{ background: type.bg, color: type.color }}>{initials(a.name)}</div>
                          <div className="min-w-0">
                            <div className="font-semibold truncate flex items-center gap-1.5" style={{ color: 'var(--text)' }}>{a.name}{a.priority === 'vip' && <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: 'var(--red)', color: 'white' }}>VIP</span>}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3"><span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: type.bg, color: type.color }}>{type.label}</span></td>
                      <td className="px-4 py-3"><span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: stage.bg, color: stage.color }}>{stage.label}</span></td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>{a.industry || '—'}</td>
                      <td className="px-4 py-3 text-right">
                        <ItemActionsMenu
                          label={`Actions for ${a.name}`}
                          actions={[
                            { label: 'Open account', onClick: () => setSelected(a) },
                            { label: 'Edit account', onClick: () => setEditing(a) },
                            { label: 'Delete account', tone: 'danger', onClick: () => del(a.id) },
                          ]}
                        />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <Paginator total={filtered.length} page={page} pageSize={pageSize} onPage={setPage} onPageSize={setPageSize} label="accounts" />
          </>
        )}

      {adding && <AccountForm onSave={save} onClose={() => setAdding(false)} />}
      {editing && !selected && <AccountForm account={editing} onSave={save} onClose={() => setEditing(null)} />}
    </div>
  )
}

function QuickAddTask({ accountId, onAdded }) {
  const [val, setVal] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    const title = val.trim()
    if (!title || busy) return
    setBusy(true)
    try {
      await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add', task: { title, status: 'todo', priority: 'medium', linkedTo: { accountId } } }),
      })
      setVal('')
      await onAdded?.()
    } finally { setBusy(false) }
  }
  return (
    <div className="flex gap-2 mb-3">
      <input
        className="flex-1 px-3 py-2 rounded-lg text-sm"
        style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', minHeight: 44 }}
        placeholder="New task — press Enter to add"
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submit() } }}
      />
      <button
        className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
        style={{ background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', minHeight: 44 }}
        onClick={submit}
        disabled={!val.trim() || busy}
      >
        {busy ? 'Adding…' : 'Add Task'}
      </button>
    </div>
  )
}

function QuickAddProject({ accountId, onAdded }) {
  const [val, setVal] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    const name = val.trim()
    if (!name || busy) return
    setBusy(true)
    try {
      await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add', project: { name, accountId, status: 'active' } }),
      })
      setVal('')
      await onAdded?.()
    } finally { setBusy(false) }
  }
  return (
    <div className="flex gap-2 mb-3">
      <input
        className="flex-1 px-3 py-2 rounded-lg text-sm"
        style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)', minHeight: 44 }}
        placeholder="New project name — press Enter to add"
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); submit() } }}
      />
      <button
        className="px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
        style={{ background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', minHeight: 44 }}
        onClick={submit}
        disabled={!val.trim() || busy}
      >
        {busy ? 'Adding…' : 'Add Project'}
      </button>
    </div>
  )
}

// ─── Account Notes tab — fast capture + recall of notes about this client ──────────
// Notes are stored as activities with type='note' so they show up in the timeline AND
// here filtered by type. Voice agents call take_note_for_client to add them.
function AccountNotesTab({ accountId, accountName }) {
  const [notes, setNotes] = useState([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/activities?accountId=${accountId}&type=note`)
      const j = await r.json()
      setNotes((j.activities || []).sort((a, b) => (b.at || '').localeCompare(a.at || '')))
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [accountId])

  const addNote = async () => {
    if (!draft.trim()) return
    setSaving(true)
    try {
      const lines = draft.trim().split('\n')
      const subject = lines[0].slice(0, 120)
      const body = lines.slice(1).join('\n').trim()
      const r = await fetch('/api/activities', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add', activity: {
          type: 'note', subject, body,
          linkedTo: { accountId },
          at: new Date().toISOString(),
        }}),
      })
      if (r.ok) { setDraft(''); await load() }
    } finally { setSaving(false) }
  }

  const deleteNote = async (id) => {
    if (!confirm('Delete this note?')) return
    const r = await fetch('/api/activities', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', id }),
    })
    if (r.ok) setNotes(prev => prev.filter(n => n.id !== id))
  }

  return (
    <div>
      <div className="mb-3">
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder={`Type a note about ${accountName}… or just say "Hey Maggie, take a note about ${accountName}: ..."`}
          style={{ width: '100%', minHeight: 80, padding: 12, borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 14, outline: 'none', resize: 'vertical' }}
        />
        <div className="flex justify-between items-center mt-2">
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{notes.length} note{notes.length === 1 ? '' : 's'} · also voice-capturable through any agent</div>
          <button
            onClick={addNote}
            disabled={!draft.trim() || saving}
            className="px-4 rounded-lg font-medium"
            style={{ background: draft.trim() ? 'var(--accent)' : 'var(--surface2)', color: draft.trim() ? 'var(--accent-text)' : 'var(--text-muted)', border: 'none', minHeight: 40, fontSize: 14, cursor: saving ? 'wait' : 'pointer' }}
          >{saving ? 'Saving…' : 'Save Note'}</button>
        </div>
      </div>
      {loading && <div className="text-sm p-4 text-center" style={{ color: 'var(--text-muted)' }}>Loading…</div>}
      {!loading && notes.length === 0 && (
        <div style={{ padding: 32, textAlign: 'center', border: '1px dashed var(--border)', borderRadius: 12, color: 'var(--text-muted)', fontSize: 14 }}>
          No notes yet for {accountName}. Type one above or say it to any agent.
        </div>
      )}
      {!loading && notes.length > 0 && (
        <div className="grid gap-2">
          {notes.map(n => (
            <div key={n.id} className="rounded-xl p-3 group" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="flex items-start gap-2">
                <div className="flex-1">
                  {n.subject && <div className="text-sm font-medium mb-1" style={{ color: 'var(--text)' }}>{n.subject}</div>}
                  {n.body && <div className="text-sm mb-1 whitespace-pre-wrap" style={{ color: 'var(--text)', lineHeight: 1.45 }}>{n.body}</div>}
                  <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    {new Date(n.at || n.createdAt).toLocaleString()}
                    {n.meta?.byAgent && <span> · captured by {n.meta.byAgent}</span>}
                  </div>
                </div>
                <button
                  onClick={() => deleteNote(n.id)}
                  title="Delete note"
                  className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                  style={{ background: 'transparent', border: 'none', color: 'var(--red, #dc2626)', cursor: 'pointer', fontSize: 12, padding: '2px 6px', borderRadius: 4 }}
                >✕</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Account Media tab — shows everything in this account's client folder ──────────
function AccountMediaTab({ accountId, accountName }) {
  const folderId = `client:${accountId}`
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [showGen, setShowGen] = useState(false)
  const [genPrompt, setGenPrompt] = useState('')
  const [genTitle, setGenTitle] = useState('')
  const [previewItem, setPreviewItem] = useState(null)
  const [toast, setToast] = useState(null)

  const flash = (msg, kind = 'ok') => { setToast({ msg, kind }); setTimeout(() => setToast(null), 3000) }

  const load = async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/media?folder=${encodeURIComponent(folderId)}`)
      const j = await r.json()
      setItems(j.items || [])
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [accountId])

  const generate = async () => {
    if (!genPrompt.trim()) return flash('prompt required', 'err')
    setGenerating(true)
    try {
      const r = await fetch('/api/media', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate', prompt: genPrompt, title: genTitle || `${accountName} — ${genPrompt.slice(0, 30)}`, folder: folderId }),
      })
      const j = await r.json()
      if (!r.ok || j.error) return flash('Generate failed: ' + (j.error || r.status), 'err')
      flash(`✓ Saved (${j.item.provider})`)
      setGenPrompt(''); setGenTitle(''); setShowGen(false)
      await load()
    } finally { setGenerating(false) }
  }

  const deleteItem = async (id) => {
    if (!confirm('Delete this image permanently?')) return
    const r = await fetch('/api/media', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', id }),
    })
    if (r.ok) { setPreviewItem(null); load(); flash('Deleted') }
  }

  const copyUrl = async (url) => {
    try { await navigator.clipboard.writeText(location.origin + url); flash('URL copied') } catch { flash('Copy failed', 'err') }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h3 className="text-lg font-bold" style={{ color: 'var(--text)' }}>{accountName} — Media</h3>
          <div className="text-sm" style={{ color: 'var(--text-muted)' }}>{items.length} item{items.length === 1 ? '' : 's'} · folder: {folderId}</div>
        </div>
        <button
          onClick={() => setShowGen(true)}
          className="px-5 rounded-lg font-semibold"
          style={{ background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', minHeight: 44, fontSize: 14, cursor: 'pointer' }}
        >
          ✨ Generate Image
        </button>
      </div>

      {loading && <div style={{ padding: 24, color: 'var(--text-muted)', textAlign: 'center' }}>Loading…</div>}
      {!loading && items.length === 0 && (
        <div style={{ padding: 40, textAlign: 'center', border: '1px dashed var(--border)', borderRadius: 12, color: 'var(--text-muted)' }}>
          No images yet for {accountName}. Click ✨ Generate Image, or ask Sasha or Mark to make something for this account by voice.
        </div>
      )}
      {!loading && items.length > 0 && (
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
          {items.map(item => (
            <div
              key={item.id}
              onClick={() => setPreviewItem(item)}
              className="rounded-xl overflow-hidden cursor-pointer"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
            >
              <div style={{ aspectRatio: '1 / 1', background: 'var(--surface2)', overflow: 'hidden' }}>
                <img src={item.url} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              </div>
              <div style={{ padding: 8 }}>
                <div className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{item.title}</div>
                <div className="text-xs mt-1 truncate" style={{ color: 'var(--text-muted)' }}>{new Date(item.createdAt).toLocaleDateString()}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showGen && (
        <div onClick={() => !generating && setShowGen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', zIndex: 90, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 40 }}>
          <div onClick={e => e.stopPropagation()} className="rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)', maxWidth: 600, width: '100%', padding: 24 }}>
            <h2 className="text-xl font-bold mb-4" style={{ color: 'var(--text)' }}>Generate Image for {accountName}</h2>
            <label className="block text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>Prompt</label>
            <textarea
              value={genPrompt}
              onChange={e => setGenPrompt(e.target.value)}
              placeholder="What should the image show?"
              className="w-full px-3 py-2 rounded-lg mb-4"
              style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', outline: 'none', minHeight: 100, resize: 'vertical' }}
            />
            <label className="block text-sm font-semibold mb-1" style={{ color: 'var(--text)' }}>Title (optional)</label>
            <input
              value={genTitle}
              onChange={e => setGenTitle(e.target.value)}
              className="w-full px-3 py-2 rounded-lg mb-5"
              style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', outline: 'none', minHeight: 44 }}
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowGen(false)} disabled={generating} className="px-4 rounded-lg" style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', minHeight: 44, fontSize: 14, cursor: 'pointer' }}>Cancel</button>
              <button onClick={generate} disabled={generating || !genPrompt.trim()} className="px-5 rounded-lg font-semibold" style={{ background: generating ? 'var(--surface2)' : 'var(--accent)', color: generating ? 'var(--text-muted)' : 'var(--accent-text)', border: 'none', minHeight: 44, fontSize: 14, cursor: generating ? 'wait' : 'pointer', opacity: !genPrompt.trim() ? 0.5 : 1 }}>{generating ? 'Generating…' : 'Generate'}</button>
            </div>
          </div>
        </div>
      )}

      {previewItem && (
        <div onClick={() => setPreviewItem(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)', zIndex: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 30 }}>
          <div onClick={e => e.stopPropagation()} className="rounded-2xl" style={{ background: 'var(--surface)', border: '1px solid var(--border)', maxWidth: 1000, width: '100%', maxHeight: '90vh', overflow: 'auto', display: 'grid', gridTemplateColumns: '1fr 280px' }}>
            <div style={{ background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img src={previewItem.url} alt={previewItem.title} style={{ maxWidth: '100%', maxHeight: '90vh', objectFit: 'contain' }} />
            </div>
            <div style={{ padding: 18, borderLeft: '1px solid var(--border)' }}>
              <h3 className="text-base font-bold mb-2" style={{ color: 'var(--text)' }}>{previewItem.title}</h3>
              <div className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>{new Date(previewItem.createdAt).toLocaleString()}</div>
              <div className="text-xs uppercase tracking-wider font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Prompt</div>
              <div className="text-sm mb-4" style={{ color: 'var(--text)', lineHeight: 1.4 }}>{previewItem.prompt}</div>
              <div className="flex flex-col gap-2">
                <button onClick={() => copyUrl(previewItem.url)} className="px-4 rounded-lg" style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', minHeight: 40, fontSize: 13, cursor: 'pointer' }}>📋 Copy URL</button>
                <a href={previewItem.url} download={previewItem.title} className="px-4 rounded-lg text-center" style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', minHeight: 40, fontSize: 13, lineHeight: '40px', textDecoration: 'none' }}>⬇ Download</a>
                <button onClick={() => deleteItem(previewItem.id)} className="px-4 rounded-lg" style={{ background: 'var(--red-soft, #fee2e2)', color: 'var(--red, #dc2626)', border: '1px solid var(--red, #dc2626)', minHeight: 40, fontSize: 13, cursor: 'pointer' }}>🗑 Delete</button>
                <button onClick={() => setPreviewItem(null)} className="px-4 rounded-lg" style={{ background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)', minHeight: 40, fontSize: 13, cursor: 'pointer' }}>Close</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, right: 24, padding: '10px 16px', borderRadius: 10, background: toast.kind === 'err' ? 'var(--red, #dc2626)' : 'var(--green, #16a34a)', color: '#fff', fontSize: 14, fontWeight: 600, zIndex: 100 }}>{toast.msg}</div>
      )}
    </div>
  )
}
