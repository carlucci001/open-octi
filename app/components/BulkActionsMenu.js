'use client'
import { useState } from 'react'

export default function BulkActionsMenu({
  selectedCount = 0,
  totalCount = 0,
  onSelectPage,
  onClearSelection,
  onDeleteSelected,
  actions = [],
  disabled = false,
  label = 'Bulk actions',
}) {
  const [open, setOpen] = useState(false)
  const hasPageSelection = typeof onSelectPage === 'function' && totalCount > 0
  const hasSelection = selectedCount > 0
  const hasClearOrDelete = typeof onClearSelection === 'function' || typeof onDeleteSelected === 'function'
  const hasMenuItems = hasPageSelection || actions.length > 0 || hasClearOrDelete

  const run = (fn) => {
    if (typeof fn === 'function') fn()
    setOpen(false)
  }

  return (
    <div style={{ position: 'relative' }}>
      <button
        type="button"
        disabled={disabled || !hasMenuItems}
        onClick={() => setOpen(value => !value)}
        style={triggerStyle(disabled || !hasMenuItems)}
      >
        {label}{hasSelection ? ` (${selectedCount})` : ''} ▾
      </button>
      {open && (
        <div role="menu" style={menuStyle}>
          {hasPageSelection && (
            <MenuButton onClick={() => run(onSelectPage)} disabled={disabled}>
              Select page
            </MenuButton>
          )}
          {actions.map(action => (
            <MenuButton
              key={action.label}
              danger={action.tone === 'danger'}
              disabled={disabled || action.disabled}
              onClick={() => run(action.onClick)}
            >
              {action.label}
            </MenuButton>
          ))}
          {onClearSelection && (
            <MenuButton onClick={() => run(onClearSelection)} disabled={disabled || !hasSelection}>
              Clear selection
            </MenuButton>
          )}
          {onDeleteSelected && (
            <MenuButton danger onClick={() => run(onDeleteSelected)} disabled={disabled || !hasSelection}>
              Delete selected
            </MenuButton>
          )}
        </div>
      )}
    </div>
  )
}

function MenuButton({ children, onClick, disabled, danger = false }) {
  return (
    <button type="button" role="menuitem" disabled={disabled} onClick={onClick} style={menuItemStyle(danger, disabled)}>
      {children}
    </button>
  )
}

function triggerStyle(disabled) {
  return {
    minHeight: 40,
    border: '1px solid var(--border)',
    borderRadius: 8,
    background: 'var(--surface)',
    color: 'var(--text)',
    padding: '8px 12px',
    fontSize: 13,
    outline: 'none',
    cursor: disabled ? 'not-allowed' : 'pointer',
    whiteSpace: 'nowrap',
    opacity: disabled ? 0.55 : 1,
  }
}

const menuStyle = {
  position: 'absolute',
  right: 0,
  top: 'calc(100% + 6px)',
  zIndex: 30,
  minWidth: 190,
  padding: 6,
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  boxShadow: '0 14px 30px rgba(15, 23, 42, 0.18)',
}

function menuItemStyle(danger, disabled) {
  return {
    width: '100%',
    minHeight: 34,
    display: 'block',
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
  }
}
