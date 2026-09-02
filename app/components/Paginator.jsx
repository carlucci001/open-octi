'use client'

const PAGE_SIZES = [25, 50, 100, 250]

export function Paginator({ total, page, pageSize, onPage, onPageSize, label = 'items', pageSizes = PAGE_SIZES }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(Math.max(1, page), totalPages)
  const start = total === 0 ? 0 : (safePage - 1) * pageSize + 1
  const end = Math.min(safePage * pageSize, total)

  const btn = { background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '4px 10px', borderRadius: 6, fontSize: 12, outline: 'none', cursor: 'pointer' }
  const disabled = { ...btn, opacity: 0.4, cursor: 'default' }

  return (
    <div className="flex items-center justify-between gap-3 mt-3 px-2 flex-wrap">
      <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
        <span className="font-mono">{start.toLocaleString()}–{end.toLocaleString()}</span>
        <span> of </span>
        <span className="font-mono font-semibold" style={{ color: 'var(--text)' }}>{total.toLocaleString()}</span>
        <span> {label}</span>
      </div>
      <div className="flex items-center gap-2">
        <label className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Page size</label>
        <select style={{ ...btn, padding: '3px 8px' }} value={pageSize} onChange={e => onPageSize(Number(e.target.value))}>
          {pageSizes.map(n => <option key={n} value={n}>{n}</option>)}
        </select>
        <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
          <button style={safePage <= 1 ? disabled : btn} disabled={safePage <= 1} onClick={() => onPage(1)} data-tooltip="First">« </button>
          <button style={safePage <= 1 ? disabled : btn} disabled={safePage <= 1} onClick={() => onPage(safePage - 1)} data-tooltip="Previous">‹</button>
          <span className="px-3 py-1 text-xs font-mono whitespace-nowrap" style={{ background: 'var(--surface)', color: 'var(--text)' }}>
            {safePage} / {totalPages}
          </span>
          <button style={safePage >= totalPages ? disabled : btn} disabled={safePage >= totalPages} onClick={() => onPage(safePage + 1)} data-tooltip="Next">›</button>
          <button style={safePage >= totalPages ? disabled : btn} disabled={safePage >= totalPages} onClick={() => onPage(totalPages)} data-tooltip="Last"> »</button>
        </div>
      </div>
    </div>
  )
}

// Convenience hook that returns paginated slice + page controls.
// Caller passes in the filtered array; hook handles page + pageSize state.
import { useState, useMemo } from 'react'
export function usePagination(items, defaultSize = 50) {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(defaultSize)
  const paginated = useMemo(() => {
    const totalPages = Math.max(1, Math.ceil(items.length / pageSize))
    const safe = Math.min(Math.max(1, page), totalPages)
    return items.slice((safe - 1) * pageSize, safe * pageSize)
  }, [items, page, pageSize])
  return {
    page, setPage,
    pageSize,
    setPageSize: (n) => { setPageSize(n); setPage(1) },
    paginated,
  }
}
