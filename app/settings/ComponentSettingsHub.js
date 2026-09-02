'use client'
// Central Screen Settings hub — one place to configure every registered
// component. Each row (and each group header) opens the same ComponentSettings
// drawer used by the per-screen gears; changes here are the same layered
// overrides (global scope by default). Reachable from the persistent gear in
// the top toolbar on every page.
import { useEffect, useMemo, useState } from 'react'
import { Settings2, SlidersHorizontal } from 'lucide-react'
import ComponentSettings from '../components/ComponentSettings'

const GROUP_ORDER = ['Campaign Studio', 'Sales', 'Accounts & Clients', 'Support & Delivery', 'Workspace', 'Other']

export default function ComponentSettingsHub() {
  const [components, setComponents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [q, setQ] = useState('')

  const load = () => {
    fetch('/api/component-settings', { cache: 'no-store' })
      .then(r => r.json())
      .then(j => {
        if (j.ok) { setComponents(j.components || []); setError('') }
        else setError(j.error || 'Could not load screen settings')
      })
      .catch(e => setError(e.message || 'Could not load screen settings'))
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const groups = useMemo(() => {
    const query = q.trim().toLowerCase()
    const filtered = query
      ? components.filter(c => `${c.label} ${c.id} ${c.group}`.toLowerCase().includes(query))
      : components
    const byGroup = new Map()
    for (const c of filtered) {
      const key = c.group || 'Other'
      if (!byGroup.has(key)) byGroup.set(key, [])
      byGroup.get(key).push(c)
    }
    const names = [...byGroup.keys()].sort((a, b) => {
      const ai = GROUP_ORDER.indexOf(a); const bi = GROUP_ORDER.indexOf(b)
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi) || a.localeCompare(b)
    })
    return names.map(name => ({ name, items: byGroup.get(name) }))
  }, [components, q])

  const customizedCount = components.filter(c => c.overrideScopes?.length).length

  const card = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }
  const badge = { fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 999, border: '1px solid var(--border)', whiteSpace: 'nowrap' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ ...card, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <SlidersHorizontal size={18} style={{ color: 'var(--accent)' }} />
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ color: 'var(--text)', fontWeight: 800, fontSize: 14 }}>Screen Settings</div>
          <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
            Every configurable screen in one place. Changes save at Global scope by default and apply everywhere a brand, account, or campaign hasn&rsquo;t overridden them. The same drawers are reachable from the gear on each screen.
          </div>
        </div>
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Filter screens..."
          style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '7px 11px', borderRadius: 8, fontSize: 13, outline: 'none', minWidth: 200 }}
        />
        <span style={{ ...badge, color: 'var(--text-muted)' }}>{components.length} screens · {customizedCount} customized</span>
      </div>

      {loading && <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: 8 }}>Loading screen settings…</div>}
      {!loading && error && <div style={{ color: 'var(--danger, #f87171)', fontSize: 13, padding: 8 }}>{error}</div>}

      {!loading && !error && groups.map(group => (
        <section key={group.name} style={{ ...card, overflow: 'hidden' }}>
          <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}>
            <div style={{ color: 'var(--text)', fontWeight: 900, fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5 }}>{group.name}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ ...badge, color: 'var(--text-muted)' }}>{group.items.length} screen{group.items.length === 1 ? '' : 's'}</span>
              <ComponentSettings
                components={group.items.map(c => ({ id: c.id, context: {} }))}
                title={`${group.name} settings`}
                onApplied={load}
              />
            </div>
          </header>
          <div>
            {group.items.map((c, i) => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
                <Settings2 size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: 'var(--text)', fontWeight: 700, fontSize: 13 }}>{c.label}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 11, fontFamily: 'monospace' }}>{c.id}</div>
                </div>
                <span style={{ ...badge, color: 'var(--text-muted)' }}>{c.settingsCount} setting{c.settingsCount === 1 ? '' : 's'}</span>
                {c.overrideScopes?.length > 0 && (
                  <span style={{ ...badge, color: 'var(--accent)', borderColor: 'var(--accent)' }} title={`Overrides at: ${c.overrideScopes.join(', ')}`}>Customized</span>
                )}
                <ComponentSettings componentId={c.id} title={`${c.label} settings`} onApplied={load} />
              </div>
            ))}
          </div>
        </section>
      ))}
      {!loading && !error && !groups.length && (
        <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: 8 }}>No screens match &ldquo;{q}&rdquo;.</div>
      )}
    </div>
  )
}
