'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, Plus } from 'lucide-react'

const inp = { background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13, outline: 'none', fontFamily: 'inherit' }
const TYPE_META = {
  account: { icon: '\ud83c\udfe2', label: 'Accounts' },
  contact: { icon: '\ud83d\udc64', label: 'Contacts' },
  lead: { icon: '\ud83c\udfaf', label: 'Leads' },
  opportunity: { icon: '\ud83d\udcb0', label: 'Deals' },
  project: { icon: '\ud83d\udcc1', label: 'Projects' },
  task: { icon: '\u2611\ufe0f', label: 'Tasks' },
  ticket: { icon: '\ud83c\udfab', label: 'Tickets' },
}
const ADD_TYPES = [
  { id: 'contact', label: 'Contact' },
  { id: 'lead', label: 'Lead' },
  { id: 'deal', label: 'Deal' },
  { id: 'ticket', label: 'Ticket' },
]

// Small masthead trigger — drop into any tool-icon cluster.
export function CommandPaletteTrigger() {
  const fire = (mode) => window.dispatchEvent(new CustomEvent('fcc:palette-open', { detail: { mode } }))
  return (
    <>
      <button type="button" className="avatar-menu-tool-icon" aria-label="Search everything (Ctrl+K)"
        data-tooltip="Search (Ctrl+K)" data-tooltip-side="bottom" onClick={() => fire('search')}>
        <Search size={16} />
      </button>
      <button type="button" className="avatar-menu-tool-icon" aria-label="Quick add"
        data-tooltip="Quick add" data-tooltip-side="bottom" onClick={() => fire('add')}>
        <Plus size={18} />
      </button>
    </>
  )
}

export default function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState('search') // search | add
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [sel, setSel] = useState(0)
  const [searching, setSearching] = useState(false)
  const [addType, setAddType] = useState('contact')
  const [form, setForm] = useState({})
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [accounts, setAccounts] = useState([])
  const [pipelines, setPipelines] = useState([])
  const inputRef = useRef(null)
  const debRef = useRef(null)

  const close = useCallback(() => { setOpen(false); setQ(''); setResults([]); setSel(0); setForm({}); setErr('') }, [])

  // Global hotkey + open events
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setMode('search'); setOpen(true) }
      if (e.key === 'Escape') close()
    }
    const onOpen = (e) => { setMode(e.detail?.mode === 'add' ? 'add' : 'search'); setOpen(true) }
    window.addEventListener('keydown', onKey)
    window.addEventListener('fcc:palette-open', onOpen)
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('fcc:palette-open', onOpen) }
  }, [close])

  // Focus input when opened; lazy-load selects for quick-add
  useEffect(() => {
    if (!open) return
    setTimeout(() => inputRef.current?.focus(), 60)
    if (accounts.length === 0) fetch('/api/accounts').then(r => r.json()).then(d => setAccounts(d.accounts || [])).catch(() => {})
    if (pipelines.length === 0) fetch('/api/pipelines').then(r => r.json()).then(d => setPipelines(d.pipelines || [])).catch(() => {})
  }, [open]) // eslint-disable-line

  // Debounced search
  useEffect(() => {
    if (!open || mode !== 'search') return
    clearTimeout(debRef.current)
    if (q.trim().length < 2) { setResults([]); setSearching(false); return }
    setSearching(true)
    debRef.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`).then(r => r.json())
        setResults(r.results || []); setSel(0)
      } catch { setResults([]) }
      setSearching(false)
    }, 220)
    return () => clearTimeout(debRef.current)
  }, [q, open, mode])

  const openResult = (r) => {
    if (!r) return
    window.dispatchEvent(new CustomEvent('fcc:open-record', { detail: { type: r.type, id: r.id, name: r.name, tabId: r.tabId } }))
    close()
  }

  const onSearchKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(s + 1, results.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(s - 1, 0)) }
    if (e.key === 'Enter') { e.preventDefault(); openResult(results[sel]) }
  }

  const u = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const quickAdd = async () => {
    setErr(''); setBusy(true)
    try {
      let created = null
      if (addType === 'contact') {
        if (!form.name?.trim()) throw new Error('Name is required')
        const r = await post('/api/contacts', { action: 'add', contact: { name: form.name.trim(), email: form.email || '', phone: form.phone || '', title: form.title || '', accountId: form.accountId || null } })
        created = { type: 'contact', tabId: 'contacts', rec: r.contact }
      } else if (addType === 'lead') {
        if (!form.name?.trim() && !form.company?.trim()) throw new Error('Name or company is required')
        const r = await post('/api/leads', { action: 'add', lead: { name: form.name || '', company: form.company || '', email: form.email || '', phone: form.phone || '' } })
        created = { type: 'lead', tabId: 'leads', rec: r.lead }
      } else if (addType === 'deal') {
        if (!form.name?.trim()) throw new Error('Deal name is required')
        if (!form.accountId) throw new Error('Pick an account')
        const p = pipelines.find(x => x.id === (form.pipelineId || pipelines[0]?.id))
        const r = await post('/api/opportunities', { action: 'add', opportunity: { name: form.name.trim(), accountId: form.accountId, pipelineId: p?.id || null, stageId: p?.stages?.[0]?.id || null, value: Number(form.value) || 0, probability: p?.stages?.[0]?.probability || 0 } })
        created = { type: 'opportunity', tabId: 'pipelines', rec: r.opportunity }
      } else if (addType === 'ticket') {
        if (!form.subject?.trim()) throw new Error('Subject is required')
        const r = await post('/api/support', { action: 'add', ticket: { subject: form.subject.trim(), description: form.description || '', accountId: form.accountId || null, priority: form.priority || 'normal' } })
        created = { type: 'ticket', tabId: 'support', rec: r.ticket }
      }
      setBusy(false)
      if (created?.rec?.id) {
        window.dispatchEvent(new CustomEvent('fcc:open-record', { detail: { type: created.type, id: created.rec.id, name: created.rec.name || created.rec.subject, tabId: created.tabId } }))
      }
      close()
    } catch (e) {
      setBusy(false); setErr(e.message || 'Failed to create')
    }
  }

  if (!open) return null

  const grouped = results.reduce((m, r) => { (m[r.type] = m[r.type] || []).push(r); return m }, {})
  let flatIndex = -1

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center pt-[12vh] p-4" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(3px)' }} onClick={close}>
      <div className="w-full max-w-xl rounded-xl overflow-hidden animate-fade-in" style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: '0 20px 60px rgba(0,0,0,.35)' }} onClick={e => e.stopPropagation()}>
        {/* Mode switch */}
        <div className="flex items-center gap-1 px-3 pt-3">
          {[{ id: 'search', label: '\ud83d\udd0d Search' }, { id: 'add', label: '+ Quick add' }].map(m => (
            <button key={m.id} onClick={() => setMode(m.id)} className="px-3 py-1.5 rounded-lg text-xs font-semibold"
              style={{ background: mode === m.id ? 'var(--accent)' : 'var(--surface2)', color: mode === m.id ? 'var(--accent-text)' : 'var(--text-muted)' }}>{m.label}</button>
          ))}
          <span className="ml-auto text-[10px] font-mono px-2 py-1 rounded" style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>Esc</span>
        </div>

        {mode === 'search' ? (
          <div className="p-3">
            <input ref={inputRef} style={{ ...inp, fontSize: 15, padding: '10px 14px' }} value={q} onChange={e => setQ(e.target.value)} onKeyDown={onSearchKey}
              placeholder="Search accounts, contacts, leads, deals, projects, tasks, tickets…" />
            <div className="mt-2 max-h-[50vh] overflow-auto">
              {searching && <div className="px-3 py-4 text-xs" style={{ color: 'var(--text-muted)' }}>Searching…</div>}
              {!searching && q.trim().length >= 2 && results.length === 0 && (
                <div className="px-3 py-4 text-xs" style={{ color: 'var(--text-muted)' }}>No matches for “{q}”</div>
              )}
              {Object.entries(grouped).map(([type, rows]) => (
                <div key={type} className="mb-1">
                  <div className="px-2 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{TYPE_META[type]?.label || type}</div>
                  {rows.map(r => {
                    flatIndex += 1
                    const i = flatIndex
                    return (
                      <button key={`${r.type}-${r.id}`} onClick={() => openResult(r)} onMouseEnter={() => setSel(i)}
                        className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-left"
                        style={{ background: sel === i ? 'var(--accent-soft)' : 'transparent' }}>
                        <span className="text-sm">{TYPE_META[r.type]?.icon || '\u2022'}</span>
                        <span className="text-sm font-medium truncate" style={{ color: 'var(--text)' }}>{r.name}</span>
                        {r.sub && <span className="text-[11px] truncate ml-auto" style={{ color: 'var(--text-muted)' }}>{r.sub}</span>}
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="p-3">
            <div className="flex gap-1.5 mb-3">
              {ADD_TYPES.map(t => (
                <button key={t.id} onClick={() => { setAddType(t.id); setForm({}); setErr('') }} className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                  style={{ background: addType === t.id ? 'var(--accent)' : 'var(--surface2)', color: addType === t.id ? 'var(--accent-text)' : 'var(--text-muted)', border: '1px solid var(--border)' }}>{t.label}</button>
              ))}
            </div>
            {err && <div className="mb-2 px-3 py-2 rounded-lg text-xs" style={{ background: 'var(--red-soft)', color: 'var(--red)' }}>{err}</div>}
            <div className="space-y-2">
              {addType === 'contact' && (<>
                <input ref={inputRef} style={inp} placeholder="Full name *" value={form.name || ''} onChange={e => u('name', e.target.value)} />
                <div className="grid grid-cols-2 gap-2">
                  <input style={inp} placeholder="Email" value={form.email || ''} onChange={e => u('email', e.target.value)} />
                  <input style={inp} placeholder="Phone" value={form.phone || ''} onChange={e => u('phone', e.target.value)} />
                </div>
                <select style={inp} value={form.accountId || ''} onChange={e => u('accountId', e.target.value)}>
                  <option value="">— Link to account (optional) —</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </>)}
              {addType === 'lead' && (<>
                <input ref={inputRef} style={inp} placeholder="Lead name *" value={form.name || ''} onChange={e => u('name', e.target.value)} />
                <div className="grid grid-cols-2 gap-2">
                  <input style={inp} placeholder="Company" value={form.company || ''} onChange={e => u('company', e.target.value)} />
                  <input style={inp} placeholder="Phone" value={form.phone || ''} onChange={e => u('phone', e.target.value)} />
                </div>
                <input style={inp} placeholder="Email" value={form.email || ''} onChange={e => u('email', e.target.value)} />
              </>)}
              {addType === 'deal' && (<>
                <input ref={inputRef} style={inp} placeholder="Deal name *" value={form.name || ''} onChange={e => u('name', e.target.value)} />
                <select style={inp} value={form.accountId || ''} onChange={e => u('accountId', e.target.value)}>
                  <option value="">— Account * —</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <div className="grid grid-cols-2 gap-2">
                  <select style={inp} value={form.pipelineId || pipelines[0]?.id || ''} onChange={e => u('pipelineId', e.target.value)}>
                    {pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <input type="number" style={inp} placeholder="Value ($)" value={form.value || ''} onChange={e => u('value', e.target.value)} />
                </div>
              </>)}
              {addType === 'ticket' && (<>
                <input ref={inputRef} style={inp} placeholder="Subject *" value={form.subject || ''} onChange={e => u('subject', e.target.value)} />
                <select style={inp} value={form.accountId || ''} onChange={e => u('accountId', e.target.value)}>
                  <option value="">— Account (optional) —</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
                <div className="grid grid-cols-2 gap-2">
                  <select style={inp} value={form.priority || 'normal'} onChange={e => u('priority', e.target.value)}>
                    {['low', 'normal', 'high', 'urgent'].map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <input style={inp} placeholder="Short description" value={form.description || ''} onChange={e => u('description', e.target.value)} />
                </div>
              </>)}
              <button onClick={quickAdd} disabled={busy} className="w-full py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50"
                style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}>{busy ? 'Creating…' : `Create ${ADD_TYPES.find(t => t.id === addType)?.label}`}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function post(url, body) {
  return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .then(async r => { const j = await r.json(); if (!r.ok || j.error) throw new Error(j.error || `HTTP ${r.status}`); return j })
}
