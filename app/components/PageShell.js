'use client'
import { useState, useEffect } from 'react'

// Unified page container. Every manager page wraps its body in this so padding,
// max-width, and vertical rhythm stay identical across the CRM.
export default function PageShell({ children, max = '7xl' }) {
  const widths = { '6xl': '72rem', '7xl': '80rem', '5xl': '64rem' }
  return (
    <div style={{ padding: 24, maxWidth: widths[max] || widths['7xl'], margin: '0 auto' }}>
      {children}
    </div>
  )
}

// Unified filter bar — search input, child controls, then consistent trailing buttons.
// Usage: <FilterBar search={s} onSearch={fn} placeholder="...">...controls...</FilterBar>
export function FilterBar({ search, onSearch, placeholder = 'Search...', children, onConfigure }) {
  return (
    <div className="flex gap-2 items-center flex-wrap" style={{ marginBottom: 16 }}>
      <input
        style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13, outline: 'none', flex: 1, minWidth: 200 }}
        placeholder={placeholder}
        value={search}
        onChange={e => onSearch(e.target.value)}
      />
      {children}
      {onConfigure && (
        <button onClick={onConfigure} data-tooltip="Customize this page"
          className="px-2 py-1.5 rounded-lg"
          style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14 }}>
          ⚙
        </button>
      )}
    </div>
  )
}

// Column configuration system. Stores user preferences per page in localStorage.
// Pass the full columns config (defaults), get back a live object the user has tweaked.
export function useColumnConfig(pageKey, defaultColumns) {
  const storageKey = `fcc-columns-${pageKey}`
  const [config, setConfig] = useState(defaultColumns)

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null')
      if (saved && Array.isArray(saved)) {
        // Merge: take user overrides but keep default structure for any new columns
        const merged = defaultColumns.map(d => {
          const over = saved.find(s => s.id === d.id)
          return over ? { ...d, label: over.label ?? d.label, visible: over.visible ?? d.visible } : d
        })
        setConfig(merged)
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey])

  const updateConfig = (next) => {
    setConfig(next)
    try { localStorage.setItem(storageKey, JSON.stringify(next.map(c => ({ id: c.id, label: c.label, visible: c.visible })))) } catch {}
  }

  const reset = () => {
    try { localStorage.removeItem(storageKey) } catch {}
    setConfig(defaultColumns)
  }

  return { config, setConfig: updateConfig, reset, visible: config.filter(c => c.visible !== false) }
}

// Modal UI to reorder, rename, show/hide columns.
export function ColumnConfigModal({ columns, onChange, onReset, onClose, pageLabel }) {
  const [local, setLocal] = useState(columns)

  const setRow = (i, patch) => setLocal(prev => prev.map((c, idx) => idx === i ? { ...c, ...patch } : c))
  const move = (i, dir) => {
    const j = i + dir
    if (j < 0 || j >= local.length) return
    const next = [...local]; [next[i], next[j]] = [next[j], next[i]]
    setLocal(next)
  }
  const save = () => { onChange(local); onClose() }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div className="w-full max-w-md rounded-xl p-6 animate-fade-in max-h-[85vh] overflow-auto" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold mb-1" style={{ color: 'var(--text)' }}>Customize {pageLabel}</h2>
        <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>Show/hide columns, rename headers, reorder. Saved per device.</p>

        <div className="space-y-1 mb-4">
          {local.map((c, i) => (
            <div key={c.id} className="flex items-center gap-2 p-2 rounded-lg" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
              <input type="checkbox" checked={c.visible !== false} onChange={e => setRow(i, { visible: e.target.checked })} />
              <input type="text" value={c.label} onChange={e => setRow(i, { label: e.target.value })}
                className="flex-1 text-sm px-2 py-1 rounded"
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', outline: 'none' }}
              />
              <div className="flex">
                <button onClick={() => move(i, -1)} disabled={i === 0} className="text-xs px-2 disabled:opacity-30" style={{ color: 'var(--text-muted)', cursor: i === 0 ? 'default' : 'pointer', background: 'none', border: 'none' }}>↑</button>
                <button onClick={() => move(i, 1)} disabled={i === local.length - 1} className="text-xs px-2 disabled:opacity-30" style={{ color: 'var(--text-muted)', cursor: i === local.length - 1 ? 'default' : 'pointer', background: 'none', border: 'none' }}>↓</button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <button onClick={save} className="flex-1 py-2 rounded-lg text-sm font-medium" style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}>Save</button>
          <button onClick={() => { onReset(); onClose() }} className="px-4 py-2 rounded-lg text-sm" style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>Reset to defaults</button>
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm" style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
