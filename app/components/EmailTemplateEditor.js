'use client'
// Shared editor for the lead follow-up letters (/api/email-templates).
// Used two places: the standalone Email Templates page, and inside the
// Leads email modal ("Edit templates"). Self-contained — fetches, saves,
// creates, deletes on its own; `onChanged` lets a host refresh its copy.
import { useState, useEffect, useCallback } from 'react'
import ThemedSelect from './ThemedSelect'

const BRANDS = [
  { id: 'farrington_dev', label: 'Farrington Development' },
  { id: 'ContentStudio', label: 'ContentStudio' },
  { id: 'sample_business', label: 'WNC Times' },
]
const brandLabel = (id) => BRANDS.find(b => b.id === id)?.label || id

const inp = { background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', width: '100%', padding: '8px 10px', borderRadius: 8, fontSize: 13, outline: 'none' }

export default function EmailTemplateEditor({ initialBrand = 'farrington_dev', onChanged, onDone, doneLabel = 'Done' }) {
  const [templates, setTemplates] = useState(null)
  const [selectedId, setSelectedId] = useState('')
  const [draft, setDraft] = useState(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/email-templates')
      const data = await res.json()
      const list = Array.isArray(data.templates) ? data.templates : []
      setTemplates(list)
      return list
    } catch {
      setTemplates([])
      return []
    }
  }, [])

  useEffect(() => {
    load().then(list => {
      const first = list.find(t => t.brandContext === initialBrand) || list[0]
      if (first) { setSelectedId(first.id); setDraft({ ...first }) }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load])

  const pick = (id, list = templates) => {
    const t = (list || []).find(x => x.id === id)
    setSelectedId(t ? id : '')
    setDraft(t ? { ...t } : null)
    setNote('')
  }

  const call = async (payload) => {
    setBusy(true)
    setNote('')
    try {
      const res = await fetch('/api/email-templates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`)
      const list = await load()
      onChanged?.()
      return { data, list }
    } catch (e) {
      setNote(e.message || 'Save failed')
      return null
    } finally {
      setBusy(false)
    }
  }

  const save = async () => {
    if (!draft?.id) return
    const out = await call({ action: 'save', template: draft })
    if (out) setNote('Saved.')
  }
  const createNew = async () => {
    const out = await call({ action: 'create', template: { brandContext: draft?.brandContext || initialBrand } })
    if (out?.data?.template) pick(out.data.template.id, out.list)
  }
  const del = async () => {
    if (!draft?.id) return
    if (!confirm(`Delete template "${draft.name}"?`)) return
    const out = await call({ action: 'delete', id: draft.id })
    if (out) pick(out.list[0]?.id || '', out.list)
  }

  const ud = (k, v) => setDraft(p => ({ ...p, [k]: v }))

  if (templates === null) {
    return <div className="text-sm py-8 text-center" style={{ color: 'var(--text-muted)' }}>Loading letters...</div>
  }

  return (
    <div>
      <div className="text-[11px] rounded-lg px-3 py-2 mb-3" style={{ background: 'var(--accent-soft)', color: 'var(--accent)', border: '1px solid var(--accent)' }}>
        These are the letters behind &ldquo;Email lead&rdquo; and the automatic project-completion email. Variables fill in automatically: <b>{'{contact}'}</b> = contact name, <b>{'{company}'}</b> = business name, <b>{'{brand}'}</b> = sending brand — and in the &ldquo;Project complete&rdquo; letter, <b>{'{project}'}</b> = project name, <b>{'{reviewLink}'}</b> = the Google review link. Each letter sends from its brand&rsquo;s own address.
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="mb-3">
          <label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-muted)' }}>Letter</label>
          <ThemedSelect style={inp} value={selectedId} onChange={e => pick(e.target.value)}>
            {templates.length === 0 && <option value="">No letters yet — create one</option>}
            {templates.map(t => <option key={t.id} value={t.id}>{brandLabel(t.brandContext)} — {t.name}</option>)}
          </ThemedSelect>
        </div>
        <div className="mb-3">
          <label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-muted)' }}>Brand / pipeline it belongs to</label>
          <ThemedSelect style={inp} value={draft?.brandContext || initialBrand} onChange={e => ud('brandContext', e.target.value)} disabled={!draft}>
            {BRANDS.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
          </ThemedSelect>
        </div>
      </div>
      {draft ? (
        <>
          <div className="mb-3">
            <label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-muted)' }}>Template name</label>
            <input style={inp} value={draft.name} onChange={e => ud('name', e.target.value)} />
          </div>
          <div className="mb-3">
            <label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-muted)' }}>Subject</label>
            <input style={inp} value={draft.subject} onChange={e => ud('subject', e.target.value)} />
          </div>
          <div className="mb-3">
            <label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-muted)' }}>Letter</label>
            <textarea style={{ ...inp, minHeight: 280, resize: 'vertical' }} value={draft.body} onChange={e => ud('body', e.target.value)} />
          </div>
        </>
      ) : (
        <div className="text-sm mb-3" style={{ color: 'var(--text-muted)' }}>No letter selected — create one below.</div>
      )}
      {note && <div className="text-xs mb-3" style={{ color: note === 'Saved.' ? 'var(--green)' : 'var(--red)' }}>{note}</div>}
      <div className="flex gap-2 justify-end flex-wrap">
        {onDone && <button type="button" className="px-4 rounded-lg text-sm" style={{ background: 'var(--surface2)', color: 'var(--text-muted)', minHeight: 44 }} onClick={onDone} disabled={busy}>{doneLabel}</button>}
        <button type="button" className="px-4 rounded-lg text-sm" style={{ background: 'var(--surface2)', color: 'var(--red)', border: '1px solid var(--border)', minHeight: 44 }} onClick={del} disabled={busy || !draft}>Delete</button>
        <button type="button" className="px-4 rounded-lg text-sm font-semibold" style={{ background: 'var(--surface2)', color: 'var(--accent)', minHeight: 44 }} onClick={createNew} disabled={busy}>New template</button>
        <button type="button" className="px-5 rounded-lg text-sm font-semibold" style={{ background: 'var(--accent)', color: 'var(--accent-text)', minHeight: 44 }} onClick={save} disabled={busy || !draft}>{busy ? 'Working...' : 'Save template'}</button>
      </div>
    </div>
  )
}
