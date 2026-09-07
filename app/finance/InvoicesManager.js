'use client'

import { useEffect, useRef, useState } from 'react'
import { FileDown, Pencil, Plus, Trash2, X } from 'lucide-react'

const money = amount => Number(amount || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
const blankItem = () => ({ description: '', qty: 1, rate: 0 })
const fieldStyle = { width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }
const actionStyle = { padding: 8, borderRadius: 6, color: 'var(--text-muted)' }

export default function InvoicesManager({ clientId = '', clientName = '', lockClient = false }) {
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState(null)
  const [saving, setSaving] = useState(false)
  const dialog = useRef(null)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    fetch(`/api/invoices${clientId ? `?clientId=${encodeURIComponent(clientId)}` : ''}`, { cache: 'no-store', signal: controller.signal })
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Invoices could not be loaded.'); return data })
      .then(data => setInvoices(Array.isArray(data.invoices) ? data.invoices : []))
      .catch(err => { if (err.name !== 'AbortError') setError(err.message) })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [clientId])
  useEffect(() => { if (draft && dialog.current && !dialog.current.open) dialog.current.showModal() }, [draft])

  const edit = invoice => {
    setError('')
    setDraft(invoice ? { ...invoice, items: (invoice.items || []).map(item => ({ ...item })) } : { clientId, clientName, project: '', date: new Date().toISOString().slice(0, 10), dueDate: '', notes: '', status: 'draft', items: [blankItem()] })
  }
  const close = () => { if (!saving) { dialog.current?.close(); setDraft(null) } }
  const itemChange = (index, key, value) => setDraft(current => ({ ...current, items: current.items.map((item, i) => i === index ? { ...item, [key]: value } : item) }))
  const save = async event => {
    event.preventDefault()
    if (saving) return
    const items = draft.items.map(item => ({ ...item, description: item.description.trim(), qty: Number(item.qty), rate: Number(item.rate) }))
    if (!draft.clientName.trim() || !items.length || items.some(item => !item.description || !Number.isFinite(item.qty) || item.qty <= 0 || !Number.isFinite(item.rate) || item.rate < 0)) {
      setError('Enter a client and at least one item with a positive quantity and a valid rate.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const invoice = { ...draft, clientName: draft.clientName.trim(), items, dueDate: draft.dueDate || null }
      const response = await fetch('/api/invoices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft.id ? { action: 'update', invoice } : { action: 'create', ...invoice }) })
      const data = await response.json()
      if (!response.ok || !data.ok || !data.invoice) throw new Error(data.error || 'Invoice could not be saved.')
      setInvoices(current => [data.invoice, ...current.filter(row => row.id !== data.invoice.id)])
      dialog.current?.close()
      setDraft(null)
    } catch (err) { setError(err.message) } finally { setSaving(false) }
  }
  const shown = invoices.filter(invoice => `${invoice.number} ${invoice.clientName} ${invoice.project || ''}`.toLowerCase().includes(query.toLowerCase()))

  return <section aria-label="Invoices" className="space-y-4">
    <div className="flex items-center gap-3">
      <input aria-label="Search invoices" placeholder="Search invoices" value={query} onChange={event => setQuery(event.target.value)} style={fieldStyle} />
      <button type="button" title="New invoice" aria-label="New invoice" onClick={() => edit(null)} style={{ ...actionStyle, color: 'var(--accent)', flexShrink: 0 }}><Plus size={20} /></button>
    </div>
    {error && !draft && <p role="alert">{error}</p>}
    {loading ? <p role="status">Loading invoices…</p> : !shown.length ? <p style={{ color: 'var(--text-muted)' }}>{query ? 'No matching invoices.' : 'No invoices yet. Create an invoice to get started.'}</p> : <div className="overflow-x-auto"><table className="w-full text-sm text-left">
      <thead><tr>{['Invoice', 'Client', 'Amount', 'Due', 'Status', 'Actions'].map(label => <th key={label} className="p-2" scope="col">{label}</th>)}</tr></thead>
      <tbody>{shown.map(invoice => <tr key={invoice.id} style={{ borderTop: '1px solid var(--border)' }}>
        <td className="p-2">{invoice.number}</td><td className="p-2">{invoice.clientName}</td><td className="p-2">{money(invoice.amount)}</td><td className="p-2">{invoice.dueDate?.slice(0, 10) || '—'}</td><td className="p-2 capitalize">{invoice.status}</td>
        <td className="p-2"><div className="flex gap-1"><button type="button" onClick={() => edit(invoice)} aria-label={`Edit invoice ${invoice.number}`} title="Edit invoice" style={actionStyle}><Pencil size={16} /></button><a href={`/api/invoices?id=${encodeURIComponent(invoice.id)}&pdf=1`} target="_blank" rel="noopener noreferrer" aria-label={`View PDF for ${invoice.number}`} title="View PDF" style={actionStyle}><FileDown size={16} /></a></div></td>
      </tr>)}</tbody>
    </table></div>}
    {draft && <dialog ref={dialog} aria-label={draft.id ? 'Edit invoice' : 'New invoice'} onCancel={event => { if (saving) event.preventDefault(); else setDraft(null) }} onClose={() => setDraft(null)} className="rounded-xl p-5 backdrop:bg-black/60" style={{ width: 'min(720px, calc(100vw - 32px))', maxHeight: '90vh', color: 'var(--text)', background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <form onSubmit={save} className="space-y-4">
        <div className="flex items-center justify-between"><h2 className="font-semibold">{draft.id ? `Invoice ${draft.number}` : 'New invoice'}</h2><button type="button" disabled={saving} onClick={close} aria-label="Close invoice" style={actionStyle}><X size={18} /></button></div>
        {error && <p role="alert">{error}</p>}
        <label className="block text-sm">Client name<input required autoFocus readOnly={lockClient} value={draft.clientName} onChange={event => setDraft({ ...draft, clientName: event.target.value })} style={fieldStyle} /></label>
        <label className="block text-sm">Project<input value={draft.project || ''} onChange={event => setDraft({ ...draft, project: event.target.value })} style={fieldStyle} /></label>
        <div className="grid grid-cols-2 gap-3"><label className="text-sm">Invoice date<input required type="date" value={draft.date?.slice(0, 10) || ''} onChange={event => setDraft({ ...draft, date: event.target.value })} style={fieldStyle} /></label><label className="text-sm">Due date<input type="date" value={draft.dueDate?.slice(0, 10) || ''} onChange={event => setDraft({ ...draft, dueDate: event.target.value })} style={fieldStyle} /></label></div>
        <fieldset className="space-y-2"><legend className="text-sm font-semibold">Items</legend>{draft.items.map((item, index) => <div key={index} className="flex gap-2 items-end">
          <label className="flex-1 min-w-0 text-xs">Description<input required aria-label={`Item ${index + 1} description`} value={item.description || ''} onChange={event => itemChange(index, 'description', event.target.value)} style={fieldStyle} /></label>
          <label className="w-20 text-xs">Qty<input required type="number" min="0.01" step="any" aria-label={`Item ${index + 1} quantity`} value={item.qty} onChange={event => itemChange(index, 'qty', event.target.value)} style={fieldStyle} /></label>
          <label className="w-28 text-xs">Rate (USD)<input required type="number" min="0" step="0.01" aria-label={`Item ${index + 1} rate`} value={item.rate} onChange={event => itemChange(index, 'rate', event.target.value)} style={fieldStyle} /></label>
          <button type="button" disabled={draft.items.length === 1} aria-label={`Remove item ${index + 1}`} title="Remove item" onClick={() => setDraft({ ...draft, items: draft.items.filter((_, i) => i !== index) })} style={actionStyle}><Trash2 size={16} /></button>
        </div>)}<button type="button" onClick={() => setDraft({ ...draft, items: [...draft.items, blankItem()] })} className="text-sm" style={{ color: 'var(--accent)' }}>Add item</button></fieldset>
        <label className="block text-sm">Notes<textarea value={draft.notes || ''} onChange={event => setDraft({ ...draft, notes: event.target.value })} style={fieldStyle} /></label>
        {draft.id && <label className="block text-sm">Status<select value={draft.status} onChange={event => setDraft({ ...draft, status: event.target.value })} style={fieldStyle}>{[...new Set(['draft', 'sent', 'paid', 'overdue', 'cancelled', draft.status])].filter(Boolean).map(status => <option key={status}>{status}</option>)}</select></label>}
        <div className="flex justify-end"><button type="submit" disabled={saving} className="rounded-lg px-4 py-2 font-semibold" style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}>{saving ? 'Saving…' : 'Save invoice'}</button></div>
      </form>
    </dialog>}
  </section>
}
