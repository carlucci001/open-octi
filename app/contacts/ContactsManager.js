'use client'
import ThemedSelect from '../components/ThemedSelect'
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import PageHeader from '../components/PageHeader'
import { Paginator, usePagination } from '../components/Paginator'
import ViewModeToggle from '../components/ViewModeToggle'
import ComponentSettings, { useComponentSettings } from '../components/ComponentSettings'
import BulkActionsMenu from '../components/BulkActionsMenu'
import ItemActionsMenu from '../components/ItemActionsMenu'
import { gvCallUrl } from '@/lib/google-voice'
import CallButton from '../components/CallButton'
import ImportCsvModal from './ImportCsvModal'

const initials = (n = '') => n.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('') || '?'

function api(url, body) { return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()) }

const inp = { background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13, outline: 'none', fontFamily: 'inherit' }

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div className="relative w-full max-w-lg rounded-xl p-6 animate-fade-in max-h-[85vh] overflow-auto" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
        <button type="button" aria-label="Close" onClick={onClose} className="absolute top-3 right-3 w-9 h-9 rounded-lg text-lg font-bold" style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}>X</button>
        <h2 className="text-lg font-semibold mb-4 pr-10" style={{ color: 'var(--text)' }}>{title}</h2>
        {children}
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return <div className="mb-3"><label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-muted)' }}>{label}</label>{children}</div>
}

function timeAgo(d) {
  const t = new Date(d).getTime(); if (!t) return ''
  const s = Math.floor((Date.now() - t) / 1000)
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`
  return new Date(d).toLocaleDateString()
}

const ACT_LABELS = { note: 'Note', phone_call: 'Call', call: 'Call', voice_call: 'Call', call_logged: 'Call', email: 'Email', email_sent: 'Email', support_ticket: 'Ticket', document: 'Document', video_invite: 'Video', calendar: 'Calendar', time_tracked: 'Time', invoice_sent: 'Invoice', invoice_created: 'Invoice', payment: 'Payment', lead_qualified: 'Lead', status_change: 'Status', transcript: 'Transcript', website_intake: 'Web' }

const isFollowUpDue = (c) => c?.followUpAt && new Date(c.followUpAt).getTime() <= Date.now()

function ContactDrawer({ contact, account, onClose, onEdit, onChanged }) {
  const [acts, setActs] = useState(null)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [followUp, setFollowUp] = useState(contact.followUpAt ? String(contact.followUpAt).slice(0, 10) : '')

  const loadActs = useCallback(async () => {
    const urls = [`/api/activities?contactId=${encodeURIComponent(contact.id)}`]
    if (contact.accountId) urls.push(`/api/activities?accountId=${encodeURIComponent(contact.accountId)}`)
    const results = await Promise.all(urls.map(u => fetch(u).then(r => r.json()).catch(() => ({ activities: [] }))))
    const seen = new Set(); const merged = []
    for (const r of results) for (const a of (r.activities || [])) { if (a.id && !seen.has(a.id)) { seen.add(a.id); merged.push(a) } }
    merged.sort((a, b) => (b.at || b.createdAt || '').localeCompare(a.at || a.createdAt || ''))
    setActs(merged.slice(0, 40))
  }, [contact.id, contact.accountId])
  useEffect(() => { loadActs() }, [loadActs])

  const logIt = async (type, subject, body = '') => {
    setSaving(true)
    try {
      await api('/api/activities', { action: 'add', activity: { type, subject, body, linkedTo: { contactId: contact.id, ...(contact.accountId ? { accountId: contact.accountId } : {}) } } })
      setNote('')
      await loadActs()
    } finally { setSaving(false) }
  }

  const saveFollowUp = async (value) => {
    setFollowUp(value)
    await api('/api/contacts', { action: 'update', contact: { ...contact, followUpAt: value ? new Date(value + 'T09:00:00').toISOString() : null } })
    onChanged?.()
  }

  const chipBtn = { background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }

  return (
    <Modal title={contact.name} onClose={onClose}>
      <div className="flex items-center gap-3 mb-3">
        <div className="w-11 h-11 rounded-full flex items-center justify-center font-bold text-xs shrink-0" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>{initials(contact.name)}</div>
        <div className="min-w-0">
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{contact.title || 'Contact'}{account ? ` · ${account.name}` : ' · No account linked'}</div>
          <div className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{contact.email || ''}{contact.email && contact.phone ? ' · ' : ''}{contact.phone || ''}</div>
        </div>
      </div>
      <div className="flex gap-2 flex-wrap mb-4">
        {contact.phone && <CallButton phone={contact.phone} name={contact.name} />}
        {contact.email && <a href={`mailto:${contact.email}`} style={{ ...chipBtn, color: 'var(--accent)', textDecoration: 'none' }}>✉ Email</a>}
        <button type="button" disabled={saving} onClick={() => logIt('phone_call', `Call with ${contact.name}`)} style={chipBtn}>Log call</button>
        <button type="button" onClick={onEdit} style={chipBtn}>Edit</button>
      </div>
      <div className="flex items-center gap-2 mb-4">
        <label className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Follow-up</label>
        <input type="date" value={followUp} onChange={e => saveFollowUp(e.target.value)} style={{ ...inp, width: 'auto', padding: '6px 10px' }} />
        {isFollowUpDue({ followUpAt: followUp }) && <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ background: 'var(--red, #ef4444)', color: '#fff' }}>Due</span>}
      </div>
      <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>Activity</div>
      <div className="flex gap-2 mb-3">
        <textarea style={{ ...inp, minHeight: 44, resize: 'vertical' }} placeholder="Add a note..." value={note} onChange={e => setNote(e.target.value)} />
        <button type="button" disabled={saving || !note.trim()} onClick={() => logIt('note', `Note: ${contact.name}`, note.trim())} className="px-3 rounded-lg text-sm font-semibold" style={{ background: 'var(--accent)', color: 'var(--accent-text)', opacity: saving || !note.trim() ? 0.6 : 1 }}>Save</button>
      </div>
      {acts === null ? (
        <div className="text-center py-6 text-sm" style={{ color: 'var(--text-muted)' }}>Loading activity…</div>
      ) : acts.length === 0 ? (
        <div className="text-center py-6 text-sm" style={{ color: 'var(--text-muted)' }}>No activity yet. Notes, calls, emails, and tickets will show up here.</div>
      ) : (
        <div className="grid gap-2">
          {acts.map(a => (
            <div key={a.id} className="rounded-lg p-2.5" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                <span className="font-bold uppercase px-1.5 py-0.5 rounded" style={{ background: 'var(--accent-soft)', color: 'var(--accent)', fontSize: 9 }}>{ACT_LABELS[a.type] || a.type}</span>
                <span>{timeAgo(a.at || a.createdAt)}</span>
              </div>
              <div className="text-sm mt-1" style={{ color: 'var(--text)' }}>{a.subject || '(no subject)'}</div>
              {a.body && <div className="text-xs mt-0.5 line-clamp-3" style={{ color: 'var(--text-muted)' }}>{a.body}</div>}
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}

function ContactForm({ contact, accounts, onSave, onClose, onPromote }) {
  const [f, setF] = useState(contact || { name: '', email: '', phone: '', title: '', accountId: '', primary: false, notes: '', tags: [] })
  const u = (k, v) => setF(p => ({ ...p, [k]: v }))
  const canPromote = !!contact?.id && !f.accountId
  return (
    <Modal title={contact?.id ? 'Edit Contact' : 'New Contact'} onClose={onClose}>
      <Field label="Full Name *"><input style={inp} value={f.name} onChange={e => u('name', e.target.value)} autoFocus /></Field>
      <Field label="Title"><input style={inp} value={f.title} onChange={e => u('title', e.target.value)} placeholder="e.g. Director of Sales" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Email"><input type="email" style={inp} value={f.email} onChange={e => u('email', e.target.value)} /></Field>
        <Field label="Phone"><input style={inp} value={f.phone} onChange={e => u('phone', e.target.value)} placeholder="PHONE_REDACTED" /></Field>
      </div>
      <Field label="Account">
        <ThemedSelect style={inp} value={f.accountId || ''} onChange={e => u('accountId', e.target.value || null)}>
          <option value="">— No account (solo individual) —</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </ThemedSelect>
      </Field>
      <Field label="Primary contact?">
        <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text)' }}>
          <input type="checkbox" checked={!!f.primary} onChange={e => u('primary', e.target.checked)} />
          Mark as the primary contact for the account
        </label>
      </Field>
      <Field label="Follow-up date">
        <input type="date" style={inp} value={f.followUpAt ? String(f.followUpAt).slice(0, 10) : ''} onChange={e => u('followUpAt', e.target.value ? new Date(e.target.value + 'T09:00:00').toISOString() : null)} />
      </Field>
      <Field label="Notes"><textarea style={{ ...inp, minHeight: 60, resize: 'vertical' }} value={f.notes} onChange={e => u('notes', e.target.value)} /></Field>

      {canPromote && (
        <div className="mb-3 p-3 rounded-lg" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
          <div className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
            This contact isn't linked to an account. Promote them to a full Account record (with stage, pipeline, projects, payments).
          </div>
          <button
            className="w-full py-2 rounded-lg text-sm font-medium"
            style={{ background: 'var(--green, #22c55e)', color: '#fff', minHeight: 48, fontSize: 16 }}
            onClick={() => onPromote(contact)}>
            ⇧ Make this an Account
          </button>
        </div>
      )}

      <div className="flex gap-2 mt-4">
        <button className="flex-1 py-2 rounded-lg text-sm font-medium" style={{ background: 'var(--accent)', color: 'var(--accent-text)', minHeight: 48, fontSize: 16 }} onClick={() => f.name.trim() && onSave(f)}>Save</button>
        <button className="px-4 py-2 rounded-lg text-sm" style={{ background: 'var(--surface2)', color: 'var(--text-muted)', minHeight: 48, fontSize: 16 }} onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  )
}

export default function ContactsManager({ onNavigate }) {
  const [contacts, setContacts] = useState([])
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  // Another tab (Pipelines "Open contact") can hand us a one-shot search term.
  useEffect(() => {
    try { const v = sessionStorage.getItem('fcc.contacts.prefillSearch'); if (v) { sessionStorage.removeItem('fcc.contacts.prefillSearch'); setSearch(v) } } catch {}
  }, [])
  const [filterAccount, setFilterAccount] = useState('all')
  const [sortBy, setSortBy] = useState('updated')
  const [sortDir, setSortDir] = useState('desc')
  const [view, setView] = useState('list')
  const [editing, setEditing] = useState(null)
  const [adding, setAdding] = useState(false)
  const [viewing, setViewing] = useState(null)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [importing, setImporting] = useState(false)

  const refresh = useCallback(async () => {
    const [c, a] = await Promise.all([
      fetch('/api/contacts').then(r => r.json()),
      fetch('/api/accounts').then(r => r.json()),
    ])
    setContacts(c.contacts || [])
    setAccounts(a.accounts || [])
    setLoading(false)
  }, [])
  useEffect(() => { refresh() }, [refresh])

  const save = async (form) => {
    const action = form.id ? 'update' : 'add'
    if (!form.id) {
      const probe = await api('/api/contacts', { action: 'dedupe_check', contact: { name: form.name, email: form.email, phone: form.phone } })
      const m = probe.matches?.[0]
      if (m && !confirm(`Possible duplicate contact:\n\n${m.name}${m.email ? ' · ' + m.email : ''}${m.phone ? ' · ' + m.phone : ''}\n\nCreate anyway?`)) return
    }
    await api('/api/contacts', { action, contact: form })
    setEditing(null); setAdding(false)
    await refresh()
  }
  const del = async (id) => { if (!confirm('Remove this contact?')) return; await api('/api/contacts', { action: 'delete', id }); await refresh() }
  const bulkDelete = async () => {
    const ids = Array.from(selectedIds)
    if (!ids.length || !confirm(`Delete ${ids.length} selected contact${ids.length === 1 ? '' : 's'}?`)) return
    setBulkDeleting(true)
    try {
      await api('/api/contacts', { action: 'bulk_delete', ids })
      setSelectedIds(new Set())
      await refresh()
    } finally {
      setBulkDeleting(false)
    }
  }

  const promote = async (contact) => {
    const accountName = prompt(`Promote ${contact.name} into a full Account.\n\nAccount name (the business or organization):`, contact.name || '')
    if (!accountName?.trim()) return
    const r = await api('/api/contacts', { action: 'promote', id: contact.id, accountName: accountName.trim() })
    if (r.error) { alert('Could not promote: ' + r.error); return }
    setEditing(null)
    await refresh()
    alert(`Created account "${r.account.name}" and linked ${contact.name} as primary contact.`)
  }

  const accountsById = useMemo(() => new Map(accounts.map(a => [a.id, a])), [accounts])

  const exportCsv = () => {
    const esc = v => { const t = (v ?? '').toString(); return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t }
    const head = ['Name', 'Email', 'Phone', 'Title', 'Account', 'Tags', 'Follow-up', 'Created']
    const lines = [head.join(',')]
    for (const c of filtered) lines.push([c.name, c.email, c.phone, c.title, accountsById.get(c.accountId)?.name || '', (c.tags || []).join('; '), c.followUpAt ? String(c.followUpAt).slice(0, 10) : '', c.createdAt ? String(c.createdAt).slice(0, 10) : ''].map(esc).join(','))
    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `contacts-${new Date().toISOString().slice(0, 10)}.csv`
    a.click(); URL.revokeObjectURL(a.href)
  }

  const filtered = useMemo(() => {
    let out = contacts
    if (search.trim()) {
      const q = search.toLowerCase()
      out = out.filter(c =>
        (c.name || '').toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q) ||
        (c.phone || '').includes(q) ||
        (c.title || '').toLowerCase().includes(q)
      )
    }
    if (filterAccount === 'none') out = out.filter(c => !c.accountId)
    else if (filterAccount !== 'all') out = out.filter(c => c.accountId === filterAccount)
    out = [...out].sort((a, b) => {
      let cmp = 0
      if (sortBy === 'name') cmp = (a.name || '').localeCompare(b.name || '')
      else if (sortBy === 'account') cmp = (accountsById.get(a.accountId)?.name || '').localeCompare(accountsById.get(b.accountId)?.name || '')
      else if (sortBy === 'updated') cmp = new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime()
      return sortDir === 'asc' ? cmp : -cmp
    })
    return out
  }, [contacts, accountsById, search, filterAccount, sortBy, sortDir])

  const { page, setPage, pageSize, setPageSize, paginated } = usePagination(filtered, 25)

  // Component configuration layer: configured defaults for this list.
  const listPrefs = useComponentSettings('contacts.list')
  const userTouchedSort = useRef(false)
  useEffect(() => {
    if (!listPrefs.loaded || !listPrefs.values) return
    setView(listPrefs.values.view)
    setPageSize(listPrefs.values.pageSize)
    if (!userTouchedSort.current) {
      setSortBy(listPrefs.values.defaultSort ?? 'updated')
      setSortDir(listPrefs.values.defaultSortDir ?? 'desc')
    }
  }, [listPrefs.loaded])
  const paginatedIds = useMemo(() => paginated.map(c => c.id), [paginated])
  useEffect(() => { setSelectedIds(new Set()) }, [search, filterAccount, sortBy, sortDir, view, page])
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

  return (
    <div className="command-workspace p-6">
      <PageHeader
        icon="👤"
        title="Contacts"
        subtitle={`${contacts.length} total · ${contacts.filter(c => c.primary).length} primary · ${contacts.filter(c => !c.accountId).length} unlinked`}
        actions={
          <>
            <button className="px-3 rounded-lg text-sm font-semibold" style={{ background: 'var(--accent)', color: 'var(--accent-text)', minHeight: 40 }} onClick={() => setAdding(true)}>New Contact</button>
            <button style={{ ...sel, cursor: 'pointer', minHeight: 40 }} data-tooltip="Download the current filtered view as CSV" onClick={exportCsv}>⬇ CSV</button>
          </>
        }
        viewToggle={<ViewModeToggle value={view} onChange={setView} modes={['list', 'card']} />}
        controls={<ComponentSettings componentId="contacts.list" title="Contacts list settings" onApplied={(id, v) => { setView(v.view); setPageSize(v.pageSize); if (v.defaultSort) setSortBy(v.defaultSort); if (v.defaultSortDir) setSortDir(v.defaultSortDir) }} />}
      />

      <div className="command-toolbar flex gap-2 items-center flex-wrap mb-4">
        <input style={{ ...sel, flex: 1, minWidth: 200, padding: '8px 12px', fontSize: 13 }} placeholder="Search name, email, phone, title..." value={search} onChange={e => setSearch(e.target.value)} />
        <ThemedSelect style={sel} value={filterAccount} onChange={e => setFilterAccount(e.target.value)}>
          <option value="all">All Accounts</option>
          <option value="none">No Account</option>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </ThemedSelect>
        <ThemedSelect style={sel} value={sortBy} onChange={e => { userTouchedSort.current = true; setSortBy(e.target.value) }}>
          <option value="updated">Sort: Updated</option>
          <option value="name">Sort: Name</option>
          <option value="account">Sort: Account</option>
        </ThemedSelect>
        <button style={{ ...sel, cursor: 'pointer', minWidth: 32 }} onClick={() => { userTouchedSort.current = true; setSortDir(d => d === 'asc' ? 'desc' : 'asc') }}>{sortDir === 'asc' ? '↑' : '↓'}</button>
        <button style={{ ...sel, cursor: 'pointer', minHeight: 40 }} data-tooltip="Import contacts from a CSV file" onClick={() => setImporting(true)}>⬆ Import</button>
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
            <div className="text-4xl mb-3">👤</div>
            <p style={{ color: 'var(--text-muted)' }}>{contacts.length === 0 ? 'No contacts yet. Add one or qualify a lead.' : 'No contacts match.'}</p>
          </div>
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
          {view === 'card' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {paginated.map(c => {
                const account = c.accountId ? accountsById.get(c.accountId) : null
                const isSelected = selectedIds.has(c.id)
                return (
                  <div key={c.id} onClick={() => setViewing(c)} className="rounded-lg p-4 cursor-pointer group" style={{ background: isSelected ? 'var(--accent-soft)' : 'var(--surface)', border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}` }}>
                    <div className="flex items-start justify-between gap-3">
                      <input type="checkbox" aria-label={`Select ${c.name}`} checked={isSelected} onClick={e => e.stopPropagation()} onChange={e => toggleSelected(c.id, e)} style={{ width: 20, height: 20, flexShrink: 0 }} />
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-11 h-11 rounded-full flex items-center justify-center font-bold text-xs shrink-0" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>{initials(c.name)}</div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <div className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{c.name}</div>
                            {c.primary && <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}>Primary</span>}
                            {isFollowUpDue(c) && <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ background: 'var(--red, #ef4444)', color: '#fff' }}>Follow-up</span>}
                          </div>
                          <div className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{c.title || 'Contact'}</div>
                        </div>
                      </div>
                      <ItemActionsMenu
                        label={`Actions for ${c.name}`}
                        actions={[
                          { label: 'Edit contact', onClick: () => setEditing(c) },
                          { label: 'Delete contact', tone: 'danger', onClick: () => del(c.id) },
                        ]}
                      />
                    </div>
                    <div className="mt-3 grid gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                      <div className="truncate">{account ? account.name : 'No account linked'}</div>
                      {c.email && <a href={`mailto:${c.email}`} onClick={e => e.stopPropagation()} className="truncate" style={{ color: 'var(--accent)' }}>{c.email}</a>}
                      {c.phone && <div><CallButton phone={c.phone} name={c.name} stopPropagation /></div>}
                      {c.notes && <div className="line-clamp-2">{c.notes}</div>}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
          <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            {paginated.map((c, i) => {
              const account = c.accountId ? accountsById.get(c.accountId) : null
              const isSelected = selectedIds.has(c.id)
              return (
                <div key={c.id} onClick={() => setViewing(c)} className="flex items-center gap-3 px-4 py-3 cursor-pointer group" style={{ borderBottom: i < paginated.length - 1 ? '1px solid var(--border)' : 'none', background: isSelected ? 'var(--accent-soft)' : '' }}
                  onMouseEnter={e => { e.currentTarget.style.background = isSelected ? 'var(--accent-soft)' : 'var(--surface2)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = isSelected ? 'var(--accent-soft)' : '' }}>
                  <input type="checkbox" aria-label={`Select ${c.name}`} checked={isSelected} onClick={e => e.stopPropagation()} onChange={e => toggleSelected(c.id, e)} style={{ width: 20, height: 20, flexShrink: 0 }} />
                  <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-[11px] shrink-0" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>{initials(c.name)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{c.name}</div>
                      {c.primary && <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}>Primary</span>}
                      {isFollowUpDue(c) && <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: 'var(--red, #ef4444)', color: '#fff' }}>Follow-up</span>}
                    </div>
                    <div className="text-[11px] flex items-center gap-3 flex-wrap" style={{ color: 'var(--text-muted)' }}>
                      {c.title && <span>{c.title}</span>}
                      {account ? <span>🏢 {account.name}</span> : <span className="italic">No account</span>}
                      {c.email && <span>✉ {c.email}</span>}
                      {c.phone && <CallButton phone={c.phone} name={c.name} stopPropagation />}
                    </div>
                  </div>
                  <ItemActionsMenu
                    label={`Actions for ${c.name}`}
                    actions={[
                      { label: 'Edit contact', onClick: () => setEditing(c) },
                      { label: 'Delete contact', tone: 'danger', onClick: () => del(c.id) },
                    ]}
                  />
                </div>
              )
            })}
          </div>
          )}
          <Paginator total={filtered.length} page={page} pageSize={pageSize} onPage={setPage} onPageSize={setPageSize} label="contacts" />
          </>
        )}

      {viewing && <ContactDrawer contact={viewing} account={viewing.accountId ? accountsById.get(viewing.accountId) : null} onClose={() => setViewing(null)} onEdit={() => { setEditing(viewing); setViewing(null) }} onChanged={refresh} />}
      {adding && <ContactForm accounts={accounts} onSave={save} onClose={() => setAdding(false)} />}
      {editing && <ContactForm contact={editing} accounts={accounts} onSave={save} onClose={() => setEditing(null)} onPromote={promote} />}
      {importing && <ImportCsvModal accounts={accounts} onClose={() => setImporting(false)} onDone={async () => { setImporting(false); await refresh() }} />}
    </div>
  )
}
