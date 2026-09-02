'use client'
import ThemedSelect from './ThemedSelect'
import { useState } from 'react'
import BulkActionsMenu from './BulkActionsMenu'
import ViewModeToggle from './ViewModeToggle'

const PAGE_SIZES = [10, 25, 50, 100]

export function DataToolbar({
  total, selected = [], onSelectAll, onDeselectAll, onDeleteSelected,
  view, onViewChange, search, onSearch, sortField, sortDir, onSort, sortOptions = [],
  page, pageSize, onPageChange, onPageSizeChange, totalPages,
  children,
}) {
  const is = { background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 10px', borderRadius: 6, fontSize: 12, outline: 'none', fontFamily: 'inherit' }

  return (
    <div className="space-y-2 mb-5">
      {/* Row 1: Search + View Toggle + Sort */}
      <div className="flex gap-2 items-center flex-wrap">
        <input style={{ ...is, flex: 1, minWidth: 180, padding: '8px 12px', fontSize: 13 }}
          placeholder="Search..." value={search} onChange={e => onSearch(e.target.value)} />
        {children}
        {sortOptions.length > 0 && (
          <ThemedSelect style={{ ...is, minWidth: 120 }} value={sortField} onChange={e => onSort(e.target.value, sortDir)}>
            {sortOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </ThemedSelect>
        )}
        {sortField && (
          <button style={{ ...is, cursor: 'pointer', minWidth: 32, textAlign: 'center' }}
            onClick={() => onSort(sortField, sortDir === 'asc' ? 'desc' : 'asc')}>
            {sortDir === 'asc' ? '↑' : '↓'}
          </button>
        )}
        {onViewChange && <ViewModeToggle value={view} onChange={onViewChange} modes={['grid', 'list']} />}
        {false && onViewChange && (
          <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
            <button onClick={() => onViewChange('list')} className="px-3 py-1.5 text-xs font-medium"
              style={{ background: view === 'list' ? 'var(--accent)' : 'var(--surface2)', color: view === 'list' ? 'var(--accent-text)' : 'var(--text-muted)' }}>
              ☰ List
            </button>
            <button onClick={() => onViewChange('grid')} className="px-3 py-1.5 text-xs font-medium"
              style={{ background: view === 'grid' ? 'var(--accent)' : 'var(--surface2)', color: view === 'grid' ? 'var(--accent-text)' : 'var(--text-muted)' }}>
              ▦ Grid
            </button>
          </div>
        )}
      </div>

      {/* Row 2: Bulk actions + Pagination */}
      <div className="flex justify-between items-center">
        <div className="flex gap-2 items-center">
          {onSelectAll && (
            <BulkActionsMenu
              selectedCount={selected.length}
              totalCount={total}
              onSelectPage={onSelectAll}
              onClearSelection={onDeselectAll}
              onDeleteSelected={onDeleteSelected}
            />
          )}
        </div>

        {totalPages > 0 && (
          <div className="flex gap-2 items-center">
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{total} items</span>
            <ThemedSelect style={{ ...is, width: 'auto' }} value={pageSize} onChange={e => onPageSizeChange(Number(e.target.value))}>
              {PAGE_SIZES.map(s => <option key={s} value={s}>{s}/page</option>)}
            </ThemedSelect>
            <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
              <button disabled={page <= 1} onClick={() => onPageChange(page - 1)}
                className="px-2 py-1 text-xs disabled:opacity-30"
                style={{ background: 'var(--surface2)', color: 'var(--text-muted)', cursor: page <= 1 ? 'default' : 'pointer' }}>
                ‹
              </button>
              <span className="px-3 py-1 text-xs font-mono" style={{ background: 'var(--surface)', color: 'var(--text)' }}>
                {page}/{totalPages}
              </span>
              <button disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}
                className="px-2 py-1 text-xs disabled:opacity-30"
                style={{ background: 'var(--surface2)', color: 'var(--text-muted)', cursor: page >= totalPages ? 'default' : 'pointer' }}>
                ›
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export function useDataControls(items, defaultSort = 'name', defaultDir = 'asc') {
  const [search, setSearch] = useState('')
  const [view, setView] = useState('list')
  const [selected, setSelected] = useState([])
  const [sortField, setSortField] = useState(defaultSort)
  const [sortDir, setSortDir] = useState(defaultDir)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)

  const toggleSelect = (id) => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])
  const selectAll = (ids) => setSelected(ids)
  const deselectAll = () => setSelected([])

  const sorted = [...items].sort((a, b) => {
    const av = a[sortField] ?? '', bv = b[sortField] ?? ''
    const cmp = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv))
    return sortDir === 'asc' ? cmp : -cmp
  })

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const paginated = sorted.slice((safePage - 1) * pageSize, safePage * pageSize)

  return {
    search, setSearch, view, setView, selected, setSelected,
    sortField, sortDir, setSort: (f, d) => { setSortField(f); setSortDir(d) },
    page: safePage, setPage, pageSize, setPageSize: (s) => { setPageSize(s); setPage(1) },
    totalPages, paginated, toggleSelect, selectAll, deselectAll,
  }
}

export function SelectCheckbox({ checked, onChange }) {
  return (
    <button onClick={e => { e.stopPropagation(); onChange() }}
      className="w-5 h-5 rounded flex items-center justify-center text-xs shrink-0"
      style={{ background: checked ? 'var(--accent)' : 'var(--surface)', border: `1px solid ${checked ? 'var(--accent)' : 'var(--border)'}`, color: 'var(--accent-text)', cursor: 'pointer' }}>
      {checked ? '✓' : ''}
    </button>
  )
}
