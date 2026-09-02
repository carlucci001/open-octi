'use client'
import { CalendarDays, GitBranch, Grid3X3, KanbanSquare, LayoutGrid, LayoutList, Table2 } from 'lucide-react'

const ICONS = {
  list: LayoutList,
  card: LayoutGrid,
  cards: LayoutGrid,
  grid: Grid3X3,
  kanban: KanbanSquare,
  pipeline: GitBranch,
  'lead-lists': GitBranch,
  table: Table2,
  calendar: CalendarDays,
}

const LABELS = {
  list: 'List',
  card: 'Card',
  cards: 'Card',
  grid: 'Grid',
  kanban: 'Kanban',
  pipeline: 'Lead Lists',
  'lead-lists': 'Lead Lists',
  table: 'Table',
  calendar: 'Calendar',
}

export default function ViewModeToggle({ value, onChange, modes = ['card', 'list'], className = '', style }) {
  return (
    <div
      className={`inline-flex items-center gap-1 p-1 ${className}`}
      style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, ...style }}
      role="group"
      aria-label="View mode"
    >
      {modes.map(mode => {
        const Icon = ICONS[mode] || LayoutGrid
        const label = LABELS[mode] || mode
        const active = value === mode
        return (
          <button
            key={mode}
            type="button"
            aria-label={`${label} view`}
            title={`${label} view`}
            aria-pressed={active}
            onClick={() => onChange(mode)}
            style={{
              width: 34,
              height: 30,
              display: 'grid',
              placeItems: 'center',
              border: 0,
              borderRadius: 6,
              background: active ? 'var(--accent)' : 'transparent',
              color: active ? 'var(--accent-text)' : 'var(--text-muted)',
              cursor: 'pointer',
            }}
          >
            <Icon size={15} strokeWidth={2.1} />
          </button>
        )
      })}
    </div>
  )
}
