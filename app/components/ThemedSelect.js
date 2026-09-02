'use client'
import { useState, useRef, useEffect, Children, isValidElement } from 'react'
import { createPortal } from 'react-dom'

// Drop-in replacement for a native <select>. Keeps the same children
// (<option>/<optgroup>) and the same onChange(e => e.target.value) contract, but
// renders a fully themed dropdown so the popup matches the app instead of the
// browser's white OS box. Conversion at a call site = rename <select> to
// <ThemedSelect> and add the import.
export default function ThemedSelect({ value, onChange, children, style, disabled, className, placeholder, title, ['aria-label']: ariaLabel, onClick, onMouseDown }) {
  const [open, setOpen] = useState(false)
  const [menuRect, setMenuRect] = useState(null)
  const ref = useRef(null)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => {
      if (ref.current?.contains(e.target) || menuRef.current?.contains(e.target)) return
      setOpen(false)
    }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])

  useEffect(() => {
    if (!open) return
    const position = () => {
      const button = ref.current?.getBoundingClientRect()
      if (!button) return
      const margin = 8
      const viewportHeight = window.innerHeight || 720
      const viewportWidth = window.innerWidth || 1024
      const spaceBelow = viewportHeight - button.bottom - margin
      const spaceAbove = button.top - margin
      const estimated = Math.min(420, Math.max(48, flat.length * 36 + groups.filter(g => g.label && g.items.length).length * 24 + 10))
      const openUp = spaceBelow < Math.min(estimated, 160) && spaceAbove > spaceBelow
      const maxHeight = Math.max(120, Math.min(420, (openUp ? spaceAbove : spaceBelow) - 4))
      const width = Math.min(Math.max(button.width, 180), viewportWidth - margin * 2)
      setMenuRect({
        left: Math.max(margin, Math.min(button.left, viewportWidth - width - margin)),
        top: openUp ? Math.max(margin, button.top - Math.min(estimated, maxHeight) - 4) : button.bottom + 4,
        width,
        maxHeight,
      })
    }
    position()
    window.addEventListener('resize', position)
    window.addEventListener('scroll', position, true)
    return () => {
      window.removeEventListener('resize', position)
      window.removeEventListener('scroll', position, true)
    }
  }, [open, children])

  // Walk option/optgroup children into grouped items.
  const groups = []
  let cur = { label: null, items: [] }
  groups.push(cur)
  const labelOf = (node) => {
    if (typeof node === 'string' || typeof node === 'number') return String(node)
    if (Array.isArray(node)) return node.map(labelOf).join('')
    if (isValidElement(node)) return labelOf(node.props?.children)
    return ''
  }
  const walk = (nodes) => Children.forEach(nodes, (c) => {
    if (!isValidElement(c)) return
    if (c.type === 'optgroup') {
      cur = { label: c.props.label, items: [] }
      groups.push(cur)
      walk(c.props.children)
      cur = { label: null, items: [] }
      groups.push(cur)
    } else if (c.type === 'option') {
      cur.items.push({ value: c.props.value, label: labelOf(c.props.children) || String(c.props.value ?? ''), disabled: c.props.disabled })
    }
  })
  walk(children)

  const flat = groups.flatMap(g => g.items)
  const selected = flat.find(o => String(o.value) === String(value))
  const pick = (v) => {
    setOpen(false)
    onChange?.({ target: { value: v }, stopPropagation: () => {} })
  }

  return (
    <div
      ref={ref}
      className={className}
      title={title}
      onClick={e => { e.stopPropagation(); onClick?.(e) }}
      onMouseDown={e => { e.stopPropagation(); onMouseDown?.(e) }}
      style={{ position: 'relative', minWidth: 0, ...style }}
    >
      <button type="button" disabled={disabled} aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open}
        onClick={e => { e.stopPropagation(); if (!disabled) setOpen(o => !o) }}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, width: '100%',
          minHeight: 38, padding: '8px 12px', fontSize: 14, lineHeight: 1.2,
          border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface2)', color: 'var(--text)',
          cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1, textAlign: 'left', fontFamily: 'inherit', fontWeight: 500,
        }}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selected ? selected.label : (placeholder || flat[0]?.label || 'Select…')}
        </span>
        <span aria-hidden="true" style={{ opacity: 0.55, fontSize: 10, flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>▼</span>
      </button>
      {open && menuRect && createPortal((
        <div
          ref={menuRef}
          role="listbox"
          onClick={e => e.stopPropagation()}
          onMouseDown={e => e.stopPropagation()}
          style={{
          position: 'fixed', top: menuRect.top, left: menuRect.left, width: menuRect.width, zIndex: 10000,
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
          boxShadow: '0 18px 50px rgba(0,0,0,0.32)', padding: 5, maxHeight: menuRect.maxHeight, overflowY: 'auto',
        }}>
          {groups.map((g, gi) => g.items.length === 0 ? null : (
            <div key={gi}>
              {g.label && <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--text-muted)', padding: '7px 9px 3px' }}>{g.label}</div>}
              {g.items.map((o, oi) => {
                const active = String(o.value) === String(value)
                return (
                  <button key={oi} type="button" disabled={o.disabled} role="option" aria-selected={active}
                    onClick={e => { e.stopPropagation(); if (!o.disabled) pick(o.value) }}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', borderRadius: 7, border: 'none',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      background: active ? 'var(--accent-soft)' : 'transparent', color: active ? 'var(--accent)' : 'var(--text)',
                      fontSize: 13.5, fontWeight: active ? 600 : 500, cursor: o.disabled ? 'not-allowed' : 'pointer', opacity: o.disabled ? 0.5 : 1, fontFamily: 'inherit',
                    }}
                    onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--surface2)' }}
                    onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}>
                    {o.label}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      ), document.body)}
    </div>
  )
}
