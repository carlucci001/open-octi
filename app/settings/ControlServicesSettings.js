'use client'

import { useEffect, useMemo, useState } from 'react'
import { Copy, Pencil, Plus, Power, Search, Trash2 } from 'lucide-react'
import ThemedSelect from '../components/ThemedSelect'

const blankService = {
  name: '',
  status: 'draft',
  category: 'operations',
  audience: '',
  monthlyPrice: 0,
  setupFee: 0,
  creditBudget: 0,
  cadence: 'manual',
  owner: 'Carl',
  delivery: ['dashboard', 'email'],
  approvalGate: '',
  inputs: '',
  outputs: '',
  runbook: '',
  safeguards: '',
  tags: [],
}

const statusOptions = ['draft', 'active', 'paused', 'retired']
const cadenceOptions = ['manual', 'daily', 'weekly', 'monthly', 'event driven']
const deliveryOptions = ['dashboard', 'email', 'csv', 'webhook', 'api', 'database']
const categoryOptions = ['sales', 'operations', 'retention', 'support', 'finance', 'marketing']

const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }
const labelStyle = { fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0, fontWeight: 800 }
const inputStyle = { width: '100%', minHeight: 42, padding: '10px 12px', background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, outline: 'none' }

function toCsv(value) {
  return Array.isArray(value) ? value.join(', ') : String(value || '')
}

function fromCsv(value) {
  return String(value || '').split(',').map(item => item.trim()).filter(Boolean)
}

function money(value) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(value || 0))
}

function Badge({ children, tone = 'neutral' }) {
  const colors = {
    active: ['rgba(34,197,94,0.14)', '#22c55e'],
    paused: ['rgba(250,204,21,0.15)', '#ca8a04'],
    draft: ['rgba(148,163,184,0.16)', 'var(--text-muted)'],
    retired: ['rgba(239,68,68,0.12)', '#dc2626'],
    neutral: ['var(--surface2)', 'var(--text-muted)'],
  }
  const [background, color] = colors[tone] || colors.neutral
  return <span style={{ display: 'inline-flex', alignItems: 'center', minHeight: 24, padding: '3px 8px', borderRadius: 999, background, color, fontSize: 12, fontWeight: 800 }}>{children}</span>
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'block' }}>
      <div style={{ ...labelStyle, marginBottom: 6 }}>{label}</div>
      {children}
    </label>
  )
}

function TextInput(props) {
  return <input {...props} style={{ ...inputStyle, ...(props.style || {}) }} />
}

function TextArea(props) {
  return <textarea {...props} style={{ ...inputStyle, minHeight: props.rows ? undefined : 92, resize: 'vertical', ...(props.style || {}) }} />
}

function ServiceEditor({ service, onSave, onCancel, busy }) {
  const [draft, setDraft] = useState({ ...blankService, ...service })
  const set = (key, value) => setDraft(prev => ({ ...prev, [key]: value }))

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        onSave({ ...draft, tags: fromCsv(draft.tags), delivery: fromCsv(draft.delivery) })
      }}
      style={{ ...card, marginTop: 12, background: 'var(--surface2)' }}
    >
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <Field label="Service name">
          <TextInput required value={draft.name || ''} onChange={event => set('name', event.target.value)} placeholder="Lead Capture Agent" />
        </Field>
        <Field label="Status">
          <ThemedSelect value={draft.status || 'draft'} onChange={event => set('status', event.target.value)} style={inputStyle}>
            {statusOptions.map(option => <option key={option} value={option}>{option}</option>)}
          </ThemedSelect>
        </Field>
        <Field label="Category">
          <ThemedSelect value={draft.category || 'operations'} onChange={event => set('category', event.target.value)} style={inputStyle}>
            {categoryOptions.map(option => <option key={option} value={option}>{option}</option>)}
          </ThemedSelect>
        </Field>
        <Field label="Audience">
          <TextInput value={draft.audience || ''} onChange={event => set('audience', event.target.value)} placeholder="service businesses" />
        </Field>
      </div>

      <div className="grid gap-3 mt-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <Field label="Monthly price">
          <TextInput type="number" min="0" value={draft.monthlyPrice ?? 0} onChange={event => set('monthlyPrice', event.target.value)} />
        </Field>
        <Field label="Setup fee">
          <TextInput type="number" min="0" value={draft.setupFee ?? 0} onChange={event => set('setupFee', event.target.value)} />
        </Field>
        <Field label="Credit budget">
          <TextInput type="number" min="0" value={draft.creditBudget ?? 0} onChange={event => set('creditBudget', event.target.value)} />
        </Field>
        <Field label="Cadence">
          <ThemedSelect value={draft.cadence || 'manual'} onChange={event => set('cadence', event.target.value)} style={inputStyle}>
            {cadenceOptions.map(option => <option key={option} value={option}>{option}</option>)}
          </ThemedSelect>
        </Field>
        <Field label="Owner">
          <TextInput value={draft.owner || ''} onChange={event => set('owner', event.target.value)} />
        </Field>
      </div>

      <div className="grid gap-3 mt-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
        <Field label="Delivery channels">
          <TextInput value={toCsv(draft.delivery)} onChange={event => set('delivery', event.target.value)} placeholder={deliveryOptions.join(', ')} />
        </Field>
        <Field label="Tags">
          <TextInput value={toCsv(draft.tags)} onChange={event => set('tags', event.target.value)} placeholder="lead intake, crm, follow-up" />
        </Field>
      </div>

      <div className="grid gap-3 mt-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
        <Field label="Inputs">
          <TextArea value={draft.inputs || ''} onChange={event => set('inputs', event.target.value)} />
        </Field>
        <Field label="Outputs">
          <TextArea value={draft.outputs || ''} onChange={event => set('outputs', event.target.value)} />
        </Field>
        <Field label="Approval gate">
          <TextArea value={draft.approvalGate || ''} onChange={event => set('approvalGate', event.target.value)} />
        </Field>
        <Field label="Safeguards">
          <TextArea value={draft.safeguards || ''} onChange={event => set('safeguards', event.target.value)} />
        </Field>
      </div>

      <div className="mt-3">
        <Field label="Runbook">
          <TextArea rows={5} value={draft.runbook || ''} onChange={event => set('runbook', event.target.value)} />
        </Field>
      </div>

      <div className="flex gap-2 mt-4 flex-wrap">
        <button type="submit" disabled={busy} style={{ padding: '10px 16px', minHeight: 42, fontWeight: 800, background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', borderRadius: 8, cursor: busy ? 'wait' : 'pointer' }}>
          {busy ? 'Saving...' : 'Save service'}
        </button>
        <button type="button" onClick={onCancel} style={{ padding: '10px 16px', minHeight: 42, background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer' }}>
          Cancel
        </button>
      </div>
    </form>
  )
}

export default function ControlServicesSettings() {
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [busy, setBusy] = useState('')

  const refresh = async () => {
    setError('')
    try {
      const response = await fetch('/api/control-services', { cache: 'no-store' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || data.ok === false) throw new Error(data.error || 'Unable to load control services')
      setServices(data.services || [])
    } catch (err) {
      setError(err.message || 'Unable to load control services')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { refresh() }, [])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return services
    return services.filter(service => [
      service.name,
      service.status,
      service.category,
      service.audience,
      service.owner,
      toCsv(service.tags),
    ].join(' ').toLowerCase().includes(needle))
  }, [query, services])

  const request = async (url, options = {}) => {
    const response = await fetch(url, {
      ...options,
      headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok || data.ok === false) throw new Error(data.error || 'Control service request failed')
    return data
  }

  const save = async (service) => {
    setBusy(service.id || 'new')
    try {
      if (service.id && services.some(item => item.id === service.id)) {
        await request('/api/control-services', { method: 'PUT', body: JSON.stringify({ service }) })
      } else {
        await request('/api/control-services', { method: 'POST', body: JSON.stringify({ service }) })
      }
      setAdding(false)
      setEditingId(null)
      await refresh()
    } catch (err) {
      setError(err.message || 'Unable to save control service')
    } finally {
      setBusy('')
    }
  }

  const remove = async (service) => {
    if (!confirm(`Delete "${service.name}" from the control services catalog?`)) return
    setBusy(service.id)
    try {
      await request(`/api/control-services?id=${encodeURIComponent(service.id)}`, { method: 'DELETE' })
      await refresh()
    } catch (err) {
      setError(err.message || 'Unable to delete control service')
    } finally {
      setBusy('')
    }
  }

  const action = async (id, actionName) => {
    setBusy(id)
    try {
      await request('/api/control-services', { method: 'POST', body: JSON.stringify({ action: actionName, id }) })
      await refresh()
    } catch (err) {
      setError(err.message || 'Control service action failed')
    } finally {
      setBusy('')
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div style={{ maxWidth: 760, color: 'var(--text-muted)', fontSize: 14 }}>
          Build and maintain the reusable service specs used for pricing, onboarding, delivery controls, approval gates, and operator runbooks.
        </div>
        <button onClick={() => setAdding(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 14px', minHeight: 42, fontWeight: 800, background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
          <Plus size={16} aria-hidden="true" /> New service
        </button>
      </div>

      <div style={{ ...card, marginBottom: 14 }}>
        <div className="flex items-center gap-2" style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '0 10px', maxWidth: 420 }}>
          <Search size={16} color="var(--text-muted)" aria-hidden="true" />
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search services, category, tags" style={{ ...inputStyle, border: 'none', background: 'transparent', paddingLeft: 0 }} />
        </div>
      </div>

      {error && <div style={{ ...card, color: '#dc2626', marginBottom: 14 }}>{error}</div>}

      {adding && (
        <ServiceEditor
          service={blankService}
          busy={busy === 'new'}
          onSave={save}
          onCancel={() => setAdding(false)}
        />
      )}

      <div className="grid gap-3">
        {loading && <div style={{ ...card, color: 'var(--text-muted)' }}>Loading control services...</div>}
        {!loading && filtered.length === 0 && <div style={{ ...card, color: 'var(--text-muted)' }}>No control services match this view.</div>}
        {filtered.map(service => {
          const isEditing = editingId === service.id
          return (
            <article key={service.id} style={card}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div style={{ minWidth: 240, flex: '1 1 360px' }}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 style={{ margin: 0, color: 'var(--text)', fontSize: 18 }}>{service.name}</h2>
                    <Badge tone={service.status}>{service.status}</Badge>
                    <Badge>{service.category}</Badge>
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 6 }}>
                    {service.audience || 'No audience set'} | {service.cadence || 'manual'} | owner: {service.owner || 'unassigned'}
                  </div>
                  <div className="flex gap-2 flex-wrap mt-3">
                    <Badge>{money(service.monthlyPrice)}/mo</Badge>
                    <Badge>{money(service.setupFee)} setup</Badge>
                    <Badge>{service.creditBudget || 0} credits</Badge>
                    {(service.delivery || []).map(item => <Badge key={item}>{item}</Badge>)}
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <IconButton title={service.status === 'active' ? 'Pause service' : 'Activate service'} onClick={() => action(service.id, 'toggle')} disabled={busy === service.id}><Power size={15} /></IconButton>
                  <IconButton title="Duplicate service" onClick={() => action(service.id, 'clone')} disabled={busy === service.id}><Copy size={15} /></IconButton>
                  <IconButton title={isEditing ? 'Close editor' : 'Edit service'} onClick={() => setEditingId(isEditing ? null : service.id)}><Pencil size={15} /></IconButton>
                  <IconButton title="Delete service" danger onClick={() => remove(service)} disabled={busy === service.id}><Trash2 size={15} /></IconButton>
                </div>
              </div>

              <div className="grid gap-3 mt-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
                <SpecBlock label="Inputs" value={service.inputs} />
                <SpecBlock label="Outputs" value={service.outputs} />
                <SpecBlock label="Approval gate" value={service.approvalGate} />
                <SpecBlock label="Safeguards" value={service.safeguards} />
              </div>
              {service.runbook && <SpecBlock label="Runbook" value={service.runbook} wide />}
              {service.tags?.length > 0 && (
                <div className="flex gap-2 flex-wrap mt-3">
                  {service.tags.map(tag => <Badge key={tag}>{tag}</Badge>)}
                </div>
              )}
              {isEditing && (
                <ServiceEditor
                  service={service}
                  busy={busy === service.id}
                  onSave={save}
                  onCancel={() => setEditingId(null)}
                />
              )}
            </article>
          )
        })}
      </div>
    </div>
  )
}

function IconButton({ children, title, onClick, disabled, danger = false }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 38,
        height: 38,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--surface2)',
        color: danger ? '#dc2626' : 'var(--text)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        cursor: disabled ? 'wait' : 'pointer',
      }}
    >
      {children}
    </button>
  )
}

function SpecBlock({ label, value, wide = false }) {
  if (!value) return null
  return (
    <div style={{ marginTop: wide ? 12 : 0, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
      <div style={{ ...labelStyle, marginBottom: 5 }}>{label}</div>
      <div style={{ color: 'var(--text)', fontSize: 13, lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>{value}</div>
    </div>
  )
}
