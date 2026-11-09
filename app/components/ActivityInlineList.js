'use client'
import { useCallback, useId, useRef, useState } from 'react'
import { Eye, FileText, Loader2, Trash2, X } from 'lucide-react'

// Shared Activity list with an inline detail drawer.
//
// Selecting a row renders its full-width detail drawer as the very next DOM
// sibling of that row (not a modal, not one drawer appended after the list), so
// the drawer always sits between the selected row and the next item/pagination.
// Only one drawer is open per list. Hosts that interleave activities with other
// content (the Feed timeline) keep their own loop and share one drawer state via
// useActivityDrawer() + <ActivityInlineItem>. Hosts with a plain list use the
// default export.

// Contact-card badge labels (moved here from ContactsManager) — also the default
// type label shown in the drawer metadata.
export const ACT_LABELS = { note: 'Note', phone_call: 'Call', call: 'Call', voice_call: 'Call', call_logged: 'Call', email: 'Email', email_sent: 'Email', support_ticket: 'Ticket', document: 'Document', video_invite: 'Video', calendar: 'Calendar', time_tracked: 'Time', invoice_sent: 'Invoice', invoice_created: 'Invoice', payment: 'Payment', lead_qualified: 'Lead', status_change: 'Status', transcript: 'Transcript', website_intake: 'Web' }

const LINK_LABELS = { leadId: 'Lead', accountId: 'Account', contactId: 'Contact', opportunityId: 'Opportunity', documentId: 'Document', ticketId: 'Ticket', invoiceId: 'Invoice', projectId: 'Project' }

// ---------- helpers (moved out of Feed.js / ContactsManager.js) ----------

export function activityDocumentId(activity = {}) {
  return activity.linkedTo?.documentId || activity.meta?.documentId || ''
}

export function isTranscriptActivity(activity = {}) {
  return activity.type === 'transcript' || activity.source === 'maggie-live-transcription' || /transcription|transcript/i.test(activity.subject || '')
}

export function iconFor(t) {
  if (!t) return '•'
  if (/call|phone/i.test(t)) return '📞'
  if (/email/i.test(t)) return '✉️'
  if (/note/i.test(t)) return '📝'
  if (/lead/i.test(t)) return '🌱'
  if (/deal|opportunit/i.test(t)) return '🎯'
  if (/task/i.test(t)) return '✅'
  if (/payment|invoice|finance/i.test(t)) return '💰'
  return '•'
}

export function relTime(iso) {
  if (!iso) return ''
  const ms = Date.now() - new Date(iso).getTime()
  if (ms < 60000) return 'just now'
  if (ms < 3600000) return Math.floor(ms / 60000) + 'm ago'
  if (ms < 86400000) return Math.floor(ms / 3600000) + 'h ago'
  return Math.floor(ms / 86400000) + 'd ago'
}

export function timeAgo(d) {
  const t = new Date(d).getTime(); if (!t) return ''
  const s = Math.floor((Date.now() - t) / 1000)
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`
  return new Date(d).toLocaleDateString()
}

function labelFor(activity, typeLabel) {
  let label
  if (typeof typeLabel === 'function') label = typeLabel(activity.type, activity)
  else if (typeLabel && typeof typeLabel === 'object') label = typeLabel[activity.type]
  return label || ACT_LABELS[activity.type] || activity.type || 'Activity'
}

function nestingDepth(v) {
  if (!v || typeof v !== 'object') return 0
  const vals = Array.isArray(v) ? v : Object.values(v)
  return 1 + vals.reduce((max, x) => Math.max(max, nestingDepth(x)), 0)
}

// Returns a display string, or null when the value is empty or too deeply nested.
function displayValue(v) {
  if (v === null || v === undefined) return null
  if (typeof v === 'string') return v.trim() ? v : null
  if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'bigint') return String(v)
  if (typeof v === 'object') {
    if (Array.isArray(v) ? v.length === 0 : Object.keys(v).length === 0) return null
    if (nestingDepth(v) > 1) return null
    try {
      const json = JSON.stringify(v)
      return json.length > 1000 ? json.slice(0, 1000) + '…' : json
    } catch { return null }
  }
  return null
}

function metadataRows(activity, typeLabel) {
  const linked = []
  for (const [key, value] of Object.entries(activity.linkedTo || {})) {
    const text = displayValue(value)
    if (text) linked.push({ key, label: LINK_LABELS[key] || key, value: text })
  }
  const meta = []
  for (const [key, value] of Object.entries(activity.meta || {})) {
    const text = displayValue(value)
    if (!text) continue
    if (linked.some(l => l.key === key && l.value === text)) continue
    meta.push({ key, label: key, value: text })
  }
  const raw = activity.at || activity.createdAt
  const date = raw ? new Date(raw) : null
  const validDate = date && !Number.isNaN(date.getTime())
  return {
    type: labelFor(activity, typeLabel),
    when: raw ? { text: validDate ? date.toLocaleString() : String(raw), iso: validDate ? date.toISOString() : undefined } : null,
    source: displayValue(activity.source),
    linked,
    meta,
  }
}

function domSafe(value) {
  return String(value).replace(/[^A-Za-z0-9_-]/g, '_')
}

// ---------- shared drawer state ----------

export function useActivityDrawer() {
  const baseId = useId()
  const [openKey, setOpenKey] = useState(null)
  const rows = useRef(new Map())
  const registerRow = useCallback((key, el) => {
    if (el) rows.current.set(key, el)
    else rows.current.delete(key)
  }, [])
  const toggle = useCallback((key) => setOpenKey(cur => (cur === key ? null : key)), [])
  const close = useCallback((key) => {
    rows.current.get(key)?.focus()
    setOpenKey(cur => (cur === key ? null : cur))
  }, [])
  return { baseId, openKey, toggle, close, registerRow }
}

// ---------- item: row + (when selected) drawer, as sibling fragments ----------

export function ActivityInlineItem({ activity: a, itemKey, variant = 'feed', drawer, onOpenDocument, onDelete, deleting = false, typeLabel }) {
  const key = itemKey ?? a.id ?? ''
  const safeKey = domSafe(key)
  const titleId = `${drawer.baseId}-${safeKey}-title`
  const drawerId = `${drawer.baseId}-${safeKey}-drawer`
  const isOpen = drawer.openKey === key
  const docId = activityDocumentId(a)
  const transcript = isTranscriptActivity(a)
  const canOpen = Boolean(docId) && typeof onOpenDocument === 'function'
  const openLabel = transcript ? 'transcript' : 'document'
  const isContact = variant === 'contact'
  const canDelete = Boolean(a.id) && typeof onDelete === 'function'

  const onRowKeyDown = (e) => {
    if (e.key === 'Escape') {
      if (isOpen) { e.preventDefault(); e.stopPropagation(); drawer.close(key) }
      return
    }
    if (e.target !== e.currentTarget) return
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault()
      drawer.toggle(key)
    }
  }
  const openDocument = (e) => {
    e.stopPropagation()
    onOpenDocument?.(a)
  }

  const rowProps = {
    ref: (el) => drawer.registerRow(key, el),
    type: 'button',
    'aria-expanded': isOpen,
    'aria-controls': drawerId,
    'aria-labelledby': titleId,
    onClick: () => drawer.toggle(key),
    onKeyDown: onRowKeyDown,
  }

  const row = (
    <div
      data-activity-row={key}
      aria-busy={deleting || undefined}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && isOpen) {
          event.preventDefault()
          event.stopPropagation()
          drawer.close(key)
        }
      }}
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 8,
        padding: isContact ? 10 : '10px 12px',
        background: !isContact && transcript ? 'var(--surface)' : 'var(--surface2)',
        border: '1px solid ' + ((!isContact && transcript) || isOpen ? 'var(--accent)' : 'var(--border)'),
        borderRadius: 8,
      }}
    >
      <button {...rowProps} title={isOpen ? 'Close activity details' : 'Open activity details'} style={{ flex: 1, minWidth: 0, textAlign: 'left', padding: 0, background: 'none', border: 'none', fontFamily: 'inherit', color: 'var(--text)', cursor: 'pointer', overflowWrap: 'anywhere' }}>
        {isContact ? (
          <>
            <span className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
              <span className="font-bold uppercase px-1.5 py-0.5 rounded" style={{ background: 'var(--accent-soft)', color: 'var(--accent)', fontSize: 9 }}>{labelFor(a, typeLabel)}</span>
              <span>{timeAgo(a.at || a.createdAt)}</span>
            </span>
            <span id={titleId} className="block text-sm mt-1">{a.subject || '(no subject)'}</span>
            {a.body && <span className="text-xs mt-0.5 line-clamp-3" style={{ color: 'var(--text-muted)' }}>{a.body}</span>}
          </>
        ) : (
          <>
            <span style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 2 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}><span aria-hidden="true">{iconFor(a.type)} </span><span id={titleId}>{a.subject || a.type || 'Activity'}</span></span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{relTime(a.at || a.createdAt)}</span>
            </span>
            {a.body && <span style={{ display: 'block', fontSize: 13, color: 'var(--text-muted)', whiteSpace: 'pre-wrap' }}>{a.body.slice(0, 240)}{a.body.length > 240 ? '…' : ''}</span>}
          </>
        )}
      </button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        <ActivityAction label={isOpen ? 'Close activity details' : 'Open activity details'} icon={isOpen ? X : Eye} onClick={() => isOpen ? drawer.close(key) : drawer.toggle(key)} expanded={isOpen} controls={drawerId} />
        {canOpen && <ActivityAction label={`Open ${openLabel}`} icon={FileText} onClick={openDocument} />}
        {canDelete && <ActivityAction label={deleting ? 'Deleting activity' : 'Delete activity'} icon={deleting ? Loader2 : Trash2} danger disabled={deleting} onClick={() => onDelete(a)} />}
      </div>
    </div>
  )

  if (!isOpen) return row

  const info = metadataRows(a, typeLabel)
  const small = isContact ? 12 : 13
  const rows = [
    { label: 'Type', node: info.type },
    info.when && { label: 'When', node: <time dateTime={info.when.iso}>{info.when.text}</time> },
    info.source && { label: 'Source', node: info.source },
    ...info.linked.map(l => ({ label: l.label, node: l.value, code: true })),
    ...info.meta.map(m => ({ label: m.label, node: m.value, code: true })),
  ].filter(Boolean)

  return (
    <>
      {row}
      <div
        id={drawerId}
        role="region"
        aria-labelledby={titleId}
        onKeyDown={(e) => {
          if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); drawer.close(key) }
        }}
        style={{ width: '100%', boxSizing: 'border-box', padding: '12px 14px', background: 'var(--surface)', border: '1px solid var(--accent)', borderRadius: 8, fontSize: small, color: 'var(--text)' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Activity details</span>
          <ActivityAction label="Close activity details" icon={X} onClick={() => drawer.close(key)} />
        </div>
        {a.body && <div style={{ fontSize: small, color: 'var(--text)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', marginBottom: 10 }}>{a.body}</div>}
        <dl style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', columnGap: 12, rowGap: 4, margin: 0, fontSize: 12 }}>
          {rows.map((r, i) => (
            <div key={r.label + ':' + i} style={{ display: 'contents' }}>
              <dt style={{ color: 'var(--text-muted)', fontWeight: 600 }}>{r.label}</dt>
              <dd style={{ margin: 0, color: 'var(--text)', overflowWrap: 'anywhere', fontFamily: r.code ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : undefined }}>{r.node}</dd>
            </div>
          ))}
        </dl>
        {canOpen && (
          <div style={{ marginTop: 10 }}>
            <button
              type="button"
              onClick={() => onOpenDocument?.(a)}
              style={{ padding: '6px 12px', fontSize: 12, fontWeight: 600, background: 'var(--accent)', color: 'var(--accent-text, #fff)', border: 'none', borderRadius: 6, cursor: 'pointer' }}
            >Open {openLabel}</button>
          </div>
        )}
      </div>
    </>
  )
}

function ActivityAction({ label, icon: Icon, onClick, danger = false, disabled = false, expanded, controls }) {
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} aria-expanded={expanded} aria-controls={controls}
      className="inline-grid place-items-center rounded-full"
      style={{ width: 28, height: 28, minWidth: 28, border: '1px solid var(--border)', background: danger ? 'var(--red-soft)' : 'transparent', color: danger ? 'var(--red, #ef4444)' : 'var(--text-muted)', opacity: disabled ? 0.55 : 1, cursor: disabled ? 'wait' : 'pointer' }}
      onClick={onClick}>
      <Icon size={14} strokeWidth={2.15} aria-hidden="true" />
    </button>
  )
}

// ---------- plain list ----------

export default function ActivityInlineList({ activities, variant = 'feed', onOpenDocument, emptyState = null, typeLabel }) {
  const drawer = useActivityDrawer()
  const list = Array.isArray(activities) ? activities : []
  if (list.length === 0) return emptyState ?? null
  const contact = variant === 'contact'
  return (
    <div
      className={contact ? 'grid gap-2' : undefined}
      style={contact ? undefined : { display: 'flex', flexDirection: 'column', gap: 8 }}
    >
      {list.map((a, i) => {
        const key = a.id ?? `idx-${i}`
        return <ActivityInlineItem key={key} itemKey={key} activity={a} variant={variant} drawer={drawer} onOpenDocument={onOpenDocument} typeLabel={typeLabel} />
      })}
    </div>
  )
}
