'use client'

import { FlaskConical, Grid2X2, List } from 'lucide-react'

const labHeaderButtonStyle = {
  width: 40,
  height: 40,
  minWidth: 40,
  display: 'grid',
  placeItems: 'center',
  borderRadius: 8,
  border: '1px solid var(--accent)',
  background: 'var(--surface2)',
  color: 'var(--accent)',
  cursor: 'pointer',
}

// Header standard (Carl, 2026-08-21): every component page's controls live in
// the header's right-hand cluster, on ONE row, in this order:
//   [page actions: labs / tools / primary "+"]  [view-mode toggle]  [settings gear]
// `actions` = page actions, `viewToggle` = the ViewModeToggle, `controls` = the
// ComponentSettings gear (always last). Nothing from this cluster belongs in a
// filter/toolbar row below the header. Default view for every list is 'list'.
export default function PageHeader({ icon, title, subtitle, actions, viewToggle, controls, children, onBack, backLabel = 'Back', className = '' }) {
  return (
    <div
      className={`command-page-header flex flex-col gap-3 mb-4 ${className}`.trim()}
    >
      <div className="command-page-header-main flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label={backLabel}
              title={backLabel}
              className="command-page-header-back shrink-0 rounded-lg inline-flex items-center justify-center"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 18l-6-6 6-6" />
              </svg>
            </button>
          )}
          {icon && (
            <div className="command-page-header-icon shrink-0 rounded-lg flex items-center justify-center" aria-hidden="true">
              {icon}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="command-page-header-title text-xl font-bold sm:truncate">{title}</h1>
            {subtitle && <p className="command-page-header-subtitle text-xs mt-0.5 sm:truncate">{subtitle}</p>}
          </div>
        </div>
        <div className="command-page-header-actions flex flex-nowrap items-center gap-2 shrink-0">
          {actions}
          {viewToggle}
          {controls}
        </div>
      </div>
      {children && <div className="command-page-header-extra">{children}</div>}
    </div>
  )
}

export function ViewToggle({ view, setView, options }) {
  const opts = options || [
    { id: 'list', label: 'List' },
    { id: 'grid', label: 'Cards' },
  ]
  return (
    <div className="command-view-toggle flex rounded-lg border overflow-hidden" style={{ borderColor: 'var(--border)' }} aria-label="Display view">
      {opts.map(o => {
        const Icon = o.icon || (o.id === 'list' ? List : ['grid', 'cards'].includes(o.id) ? Grid2X2 : null)
        return (
          <button key={o.id} type="button" onClick={() => setView(o.id)} aria-pressed={view === o.id} title={`${o.label} view`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium"
            style={view === o.id
              ? { background: 'var(--accent)', color: 'var(--accent-text)' }
              : { background: 'var(--surface)', color: 'var(--text-muted)' }}>
            {Icon && <Icon size={14} aria-hidden="true" />}
            <span>{o.label}</span>
          </button>
        )
      })}
    </div>
  )
}

export function LabHeaderButton({ onClick, label, disabled = false, style, icon }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      data-tooltip={label || 'Open lab'}
      data-tooltip-side="bottom"
      style={{
        ...labHeaderButtonStyle,
        cursor: disabled ? 'not-allowed' : 'pointer',
        ...style,
      }}
    >
      {icon || <FlaskConical size={16} strokeWidth={2.25} />}
    </button>
  )
}

export function LabModuleHeader({ icon, title, actions, children, className = '' }) {
  return (
    <div className={`lab-module-header ${className}`.trim()}>
      <div className="lab-module-title">
        {icon && <span className="lab-module-icon">{icon}</span>}
        <span>{title}</span>
      </div>
      <div className="lab-module-actions">
        {children}
        {actions}
      </div>
    </div>
  )
}

export function PageShell({ children }) {
  return <div className="p-4 sm:p-5">{children}</div>
}
