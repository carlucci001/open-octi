'use client'
// <ComponentSettings> — the reusable per-component configuration surface.
// Mount a gear next to any section header; it opens a right-side drawer whose
// fields render from the server registry schema (lib/component-settings.js).
// Overrides are staged per scope (Global / Brand / Account / This campaign)
// and saved sparsely; every field shows where its effective value comes from.
import { useEffect, useState } from 'react'
import { RotateCcw, Settings2, X } from 'lucide-react'

const SCOPE_LABELS = { global: 'Global', brand: 'Brand', account: 'Account', campaign: 'Campaign' }

function qs(params) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value)
  return search.toString()
}

function contextParams(context = {}) {
  return { brandId: context.brandId || '', accountId: context.accountId || '', campaignId: context.campaignId || '' }
}

// Hook: resolved settings for a component in a given context. Pages read
// values off this instead of hardcoded defaults; null values on failure so
// callers keep their code fallback (settings.values?.pageSize ?? 25).
export function useComponentSettings(componentId, context = {}) {
  const [state, setState] = useState({ loaded: false, values: null, sources: null, schema: null })
  const contextKey = `${context.brandId || ''}|${context.accountId || ''}|${context.campaignId || ''}`
  useEffect(() => {
    let alive = true
    fetch(`/api/component-settings?${qs({ componentId, ...contextParams(context) })}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(j => { if (alive) setState(j.ok ? { loaded: true, values: j.values, sources: j.sources, schema: j.schema } : { loaded: true, values: null, sources: null, schema: null }) })
      .catch(() => { if (alive) setState({ loaded: true, values: null, sources: null, schema: null }) })
    return () => { alive = false }
  }, [componentId, contextKey])
  const apply = values => setState(s => ({ ...s, values: { ...(s.values || {}), ...values } }))
  return { ...state, apply }
}

function scopeKindOf(scope) {
  return scope === 'global' ? 'global' : String(scope).split(':')[0]
}

function scopePillsFor(schema, context = {}) {
  const kinds = new Set()
  for (const setting of schema?.settings || []) for (const kind of setting.scopes || []) kinds.add(kind)
  const pills = [{ scope: 'global', label: 'Global' }]
  if (context.brandId && kinds.has('brand')) pills.push({ scope: `brand:${context.brandId}`, label: `Brand: ${context.brandLabel || context.brandId}` })
  if (context.accountId && kinds.has('account')) pills.push({ scope: `account:${context.accountId}`, label: 'Account' })
  if (context.campaignId && kinds.has('campaign')) pills.push({ scope: `campaign:${context.campaignId}`, label: 'This campaign' })
  return pills
}

function sourceBadge(source, scope) {
  if (source === scope) return 'Set here'
  if (source === 'default') return 'Default'
  return SCOPE_LABELS[scopeKindOf(source)] || source
}

async function fetchSection(component) {
  const base = await fetch(`/api/component-settings?${qs({ componentId: component.id, ...contextParams(component.context) })}`, { cache: 'no-store' }).then(r => r.json())
  if (!base.ok) throw new Error(base.error || 'settings unavailable')
  const pills = scopePillsFor(base.schema, component.context)
  const scope = pills[pills.length - 1].scope
  const raw = await fetch(`/api/component-settings?${qs({ componentId: component.id, scope })}`, { cache: 'no-store' }).then(r => r.json())
  return {
    id: component.id,
    context: component.context || {},
    schema: base.schema,
    values: base.values,
    sources: base.sources,
    pills,
    scope,
    overrides: raw.ok ? raw.overrides : {},
    set: {},
    unset: [],
  }
}

function FieldControl({ setting, value, onChange }) {
  const inputStyle = { background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: 6, padding: '5px 8px', fontSize: 13, width: '100%', outline: 'none' }
  if (setting.type === 'boolean') {
    return (
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--text)' }}>
        <input type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked)} />
        <span>{value ? 'On' : 'Off'}</span>
      </label>
    )
  }
  if (setting.type === 'number') {
    return (
      <input
        type="number"
        style={inputStyle}
        value={value ?? ''}
        min={setting.min}
        max={setting.max}
        onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))}
      />
    )
  }
  if (setting.type === 'enum') {
    return (
      <select style={inputStyle} value={String(value ?? '')} onChange={e => onChange(e.target.value)}>
        {(setting.options || []).map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    )
  }
  if (setting.type === 'multi-enum') {
    const selected = new Set(Array.isArray(value) ? value.map(String) : [])
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {(setting.options || []).map(option => (
          <label key={option.value} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'var(--text)' }}>
            <input
              type="checkbox"
              checked={selected.has(option.value)}
              onChange={e => {
                const next = new Set(selected)
                e.target.checked ? next.add(option.value) : next.delete(option.value)
                onChange([...next])
              }}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    )
  }
  return null
}

export default function ComponentSettings({ components, componentId, context, onApplied, title = 'Section settings', buttonStyle }) {
  const list = components || (componentId ? [{ id: componentId, context: context || {} }] : [])
  const [open, setOpen] = useState(false)
  const [sections, setSections] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const openDrawer = async () => {
    setOpen(true)
    setLoading(true)
    setError('')
    try {
      const loaded = []
      for (const component of list) loaded.push(await fetchSection(component))
      setSections(loaded)
    } catch (e) {
      setError(e.message || 'Could not load settings')
      setSections([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!open) return undefined
    const onKey = event => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const patchSection = (index, patch) => {
    setSections(prev => prev.map((section, i) => (i === index ? { ...section, ...patch } : section)))
  }

  const switchScope = async (index, scope) => {
    const section = sections[index]
    if (!section || section.scope === scope) return
    try {
      const raw = await fetch(`/api/component-settings?${qs({ componentId: section.id, scope })}`, { cache: 'no-store' }).then(r => r.json())
      patchSection(index, { scope, overrides: raw.ok ? raw.overrides : {}, set: {}, unset: [] })
    } catch {
      patchSection(index, { scope, overrides: {}, set: {}, unset: [] })
    }
  }

  const setField = (index, key, value) => {
    setSections(prev => prev.map((section, i) => {
      if (i !== index) return section
      return { ...section, set: { ...section.set, [key]: value }, unset: section.unset.filter(k => k !== key) }
    }))
  }

  const resetField = (index, key) => {
    setSections(prev => prev.map((section, i) => {
      if (i !== index) return section
      const nextSet = { ...section.set }
      delete nextSet[key]
      const hasStored = Object.prototype.hasOwnProperty.call(section.overrides, key)
      const nextUnset = hasStored && !section.unset.includes(key) ? [...section.unset, key] : section.unset
      return { ...section, set: nextSet, unset: nextUnset }
    }))
  }

  const dirty = sections.some(section => Object.keys(section.set).length > 0 || section.unset.length > 0)

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      for (let i = 0; i < sections.length; i += 1) {
        const section = sections[i]
        if (!Object.keys(section.set).length && !section.unset.length) continue
        const response = await fetch('/api/component-settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ componentId: section.id, scope: section.scope, set: section.set, unset: section.unset, context: section.context }),
        }).then(r => r.json())
        if (!response.ok) throw new Error(response.error || `Saving ${section.id} failed`)
        const index = i
        setSections(prev => prev.map((s, idx) => (idx === index ? { ...s, values: response.values, sources: response.sources, overrides: response.overrides, set: {}, unset: [] } : s)))
        if (onApplied) onApplied(section.id, response.values)
      }
    } catch (e) {
      setError(e.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  const gearStyle = { width: 34, height: 30, display: 'grid', placeItems: 'center', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text-muted)', cursor: 'pointer', ...buttonStyle }
  const badgeStyle = { fontSize: 10, fontWeight: 800, padding: '2px 6px', borderRadius: 999, border: '1px solid var(--border)', color: 'var(--text-muted)', whiteSpace: 'nowrap' }

  return (
    <>
      <button type="button" aria-label={title} title={title} data-tooltip={title} style={gearStyle} onClick={openDrawer}>
        <Settings2 size={15} strokeWidth={2.1} />
      </button>
      {open && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 140, background: 'rgba(0,0,0,0.45)' }} onClick={() => setOpen(false)}>
          <aside
            onClick={e => e.stopPropagation()}
            style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 'min(430px, 94vw)', background: 'var(--surface)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', boxShadow: '-12px 0 32px rgba(0,0,0,0.35)' }}
          >
            <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text)', fontWeight: 900, fontSize: 14 }}>
                <Settings2 size={16} /> {title}
              </div>
              <button type="button" aria-label="Close" onClick={() => setOpen(false)} style={{ background: 'transparent', border: 0, color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={17} />
              </button>
            </header>
            <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 20 }}>
              {loading && <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading settings…</div>}
              {!loading && error && <div style={{ color: 'var(--danger, #f87171)', fontSize: 13 }}>{error}</div>}
              {!loading && sections.map((section, index) => (
                <section key={section.id} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ color: 'var(--text)', fontWeight: 900, fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.4 }}>{section.schema?.label || section.id}</div>
                  {section.pills.length > 1 && (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {section.pills.map(pill => {
                        const active = section.scope === pill.scope
                        return (
                          <button
                            key={pill.scope}
                            type="button"
                            onClick={() => switchScope(index, pill.scope)}
                            style={{ fontSize: 11, fontWeight: 800, padding: '4px 10px', borderRadius: 999, cursor: 'pointer', border: '1px solid var(--border)', background: active ? 'var(--accent)' : 'var(--surface2)', color: active ? 'var(--accent-text)' : 'var(--text-muted)' }}
                          >
                            {pill.label}
                          </button>
                        )
                      })}
                    </div>
                  )}
                  {(section.schema?.settings || []).filter(setting => setting.scopes.includes(section.scope === 'global' ? 'global' : section.scope.split(':')[0])).map(setting => {
                    const staged = Object.prototype.hasOwnProperty.call(section.set, setting.key)
                    const willInherit = section.unset.includes(setting.key)
                    const stored = Object.prototype.hasOwnProperty.call(section.overrides, setting.key)
                    const value = staged
                      ? section.set[setting.key]
                      : willInherit
                        ? setting.default
                        : (stored ? section.overrides[setting.key] : section.values?.[setting.key])
                    const badge = staged ? 'Editing' : willInherit ? 'Will inherit' : sourceBadge(section.sources?.[setting.key] || 'default', section.scope)
                    return (
                      <div key={setting.key} style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text)' }}>{setting.label}</span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={badgeStyle}>{badge}</span>
                            {(staged || stored) && !willInherit && (
                              <button type="button" title="Reset to inherited" data-tooltip="Reset to inherited" onClick={() => resetField(index, setting.key)} style={{ background: 'transparent', border: 0, color: 'var(--text-muted)', cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
                                <RotateCcw size={13} />
                              </button>
                            )}
                          </span>
                        </div>
                        <FieldControl setting={setting} value={value} onChange={next => setField(index, setting.key, next)} />
                        {setting.help && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{setting.help}</div>}
                      </div>
                    )
                  })}
                </section>
              ))}
            </div>
            <footer style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
              {error && !loading && <span style={{ marginRight: 'auto', fontSize: 12, color: 'var(--danger, #f87171)' }}>{error}</span>}
              <button type="button" onClick={() => setOpen(false)} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer' }}>Close</button>
              <button
                type="button"
                disabled={!dirty || saving}
                onClick={save}
                style={{ background: dirty && !saving ? 'var(--accent)' : 'var(--surface2)', border: '1px solid var(--border)', color: dirty && !saving ? 'var(--accent-text)' : 'var(--text-muted)', padding: '6px 16px', borderRadius: 8, fontSize: 13, fontWeight: 800, cursor: dirty && !saving ? 'pointer' : 'default' }}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </footer>
          </aside>
        </div>
      )}
    </>
  )
}
