'use client'

export default function ThemeModeToggle({ theme, onChange, compact = false, menuIcon = false }) {
  const themeCycle = ['command', 'codex-blue', 'codex']
  const themeMeta = {
    command: { label: 'Command theme', swatch: '#13a8ff' },
    codex: { label: 'Brown theme', swatch: '#8a5a2b' },
    'codex-blue': { label: 'Blue theme', swatch: '#3f6f90' },
  }
  const cycleIndex = themeCycle.includes(theme) ? themeCycle.indexOf(theme) : 0
  const nextTheme = themeCycle[(cycleIndex + 1) % themeCycle.length]
  const current = themeMeta[theme] || themeMeta.command
  const next = themeMeta[nextTheme] || themeMeta.command
  const label = `Switch to ${next.label.toLowerCase()}`
  const active = theme !== 'codex'

  return (
    <button
      type="button"
      onClick={() => onChange(nextTheme)}
      aria-label={label}
      aria-pressed={active}
      data-tooltip={current.label}
      data-tooltip-side="bottom"
      className={menuIcon ? 'avatar-menu-tool-icon theme-swatch-toggle' : 'theme-swatch-toggle flex items-center justify-center rounded-lg'}
      style={menuIcon ? undefined : {
        width: compact ? 44 : 48,
        height: compact ? 44 : 48,
        background: active ? 'var(--accent-soft)' : 'var(--surface2)',
        border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
        color: active ? 'var(--accent)' : 'var(--text-muted)',
        cursor: 'pointer',
        transition: 'all var(--transition-fast)',
      }}
    >
      <span className="theme-swatch-dot" style={{ background: current.swatch }} aria-hidden="true" />
    </button>
  )
}
