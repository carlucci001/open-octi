'use client'
import { createPortal } from 'react-dom'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { MoreHorizontal } from 'lucide-react'

export default function ItemActionsMenu({ label = 'Item actions', actions = [], align = 'right' }) {
  const [open, setOpen] = useState(false)
  const [menuPosition, setMenuPosition] = useState(null)
  const triggerRef = useRef(null)
  const menuRef = useRef(null)
  const enabledActions = actions.filter(Boolean)
  const disabled = enabledActions.length === 0

  const updatePosition = () => {
    const trigger = triggerRef.current
    if (!trigger) return
    const rect = trigger.getBoundingClientRect()
    const menuWidth = 190
    const gap = 6
    const margin = 10
    const left = align === 'left'
      ? Math.max(margin, Math.min(rect.left, window.innerWidth - menuWidth - margin))
      : Math.max(margin, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - margin))
    const roomBelow = window.innerHeight - rect.bottom - gap - margin
    const top = roomBelow >= 180
      ? rect.bottom + gap
      : Math.max(margin, rect.top - gap - Math.min(220, window.innerHeight - margin * 2))
    const maxHeight = Math.max(140, Math.min(260, window.innerHeight - top - margin))
    setMenuPosition({ left, top, width: menuWidth, maxHeight })
  }

  useLayoutEffect(() => {
    if (!open) return
    updatePosition()
  }, [open, align])

  useEffect(() => {
    if (!open) return
    const closeOnOutside = (event) => {
      if (triggerRef.current?.contains(event.target) || menuRef.current?.contains(event.target)) return
      setOpen(false)
    }
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    document.addEventListener('pointerdown', closeOnOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
      document.removeEventListener('pointerdown', closeOnOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  const run = (action, event) => {
    event?.stopPropagation?.()
    if (action.disabled) return
    action.onClick?.(event)
    setOpen(false)
  }

  return (
    <div
      style={{ position: 'relative', display: 'inline-flex' }}
      onPointerDown={event => event.stopPropagation()}
      onClick={event => event.stopPropagation()}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        title={label}
        disabled={disabled}
        onClick={event => {
          event.stopPropagation()
          setOpen(value => !value)
        }}
        style={triggerStyle(disabled)}
      >
        <MoreHorizontal size={17} strokeWidth={2.2} aria-hidden="true" />
      </button>
      {open && menuPosition && createPortal(
        <div
          ref={menuRef}
          role="menu"
          style={menuStyle(menuPosition)}
          onPointerDown={event => event.stopPropagation()}
          onClick={event => event.stopPropagation()}
        >
          {enabledActions.map(action => (
            action.href ? (
            <a
              key={action.label}
              role="menuitem"
              href={action.href}
              target={action.target}
              rel={action.rel}
              aria-disabled={action.disabled || undefined}
              onClick={event => run(action, event)}
              style={menuItemStyle(action.tone === 'danger', action.disabled, Boolean(action.icon))}
            >
              {action.icon && <action.icon size={16} strokeWidth={2} aria-hidden="true" />}
              <span>{action.label}</span>
            </a>
            ) : (
              <button
                key={action.label}
                type="button"
                role="menuitem"
                disabled={action.disabled}
                onClick={event => run(action, event)}
                style={menuItemStyle(action.tone === 'danger', action.disabled, Boolean(action.icon))}
              >
                {action.icon && <action.icon size={16} strokeWidth={2} aria-hidden="true" />}
                <span>{action.label}</span>
              </button>
            )
          ))}
        </div>,
        document.body
      )}
    </div>
  )
}

function triggerStyle(disabled) {
  return {
    width: 34,
    height: 34,
    minWidth: 34,
    borderRadius: 8,
    border: '1px solid var(--border)',
    background: 'var(--surface2)',
    color: 'var(--text)',
    display: 'inline-grid',
    placeItems: 'center',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.55 : 1,
  }
}

function menuStyle(position) {
  return {
    position: 'fixed',
    left: position.left,
    top: position.top,
    zIndex: 100000,
    width: position.width,
    maxHeight: position.maxHeight,
    overflowY: 'auto',
    padding: 6,
    borderRadius: 8,
    border: '1px solid var(--border)',
    background: 'var(--surface)',
    boxShadow: '0 18px 46px rgba(15, 23, 42, 0.30)',
  }
}

function menuItemStyle(danger, disabled, hasIcon) {
  return {
    width: '100%',
    minHeight: 34,
    display: hasIcon ? 'flex' : 'block',
    alignItems: hasIcon ? 'center' : undefined,
    gap: hasIcon ? 9 : undefined,
    padding: '8px 10px',
    border: 0,
    borderRadius: 6,
    background: 'transparent',
    color: disabled ? 'var(--text-muted)' : danger ? 'var(--red)' : 'var(--text)',
    textAlign: 'left',
    fontSize: 13,
    fontWeight: danger ? 750 : 650,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.55 : 1,
    textDecoration: 'none',
    boxSizing: 'border-box',
  }
}
