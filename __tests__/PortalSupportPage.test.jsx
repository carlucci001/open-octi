import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const source = fs.readFileSync(path.join(process.cwd(), 'app/portal/support/page.js'), 'utf8')

describe('PortalSupportPage work controls', () => {
  it('uses the shared accessible toolbar and paginator with server list parameters', () => {
    expect(source).toContain("import PortalListToolbar, { PortalFilterField } from '../components/PortalListToolbar'")
    expect(source).toContain("import PortalPaginator from '../components/PortalPaginator'")
    expect(source).toContain('label="Work request controls"')
    expect(source).toContain('searchPlaceholder="Search requests"')
    expect(source).toContain('page: String(page)')
    expect(source).toContain('pageSize: String(pageSize)')
    expect(source).toContain('sortBy,')
    expect(source).toContain('sortOrder,')
    expect(source).toContain("...(search ? { q: search } : {})")
    expect(source).toContain('label="requests"')
  })

  it('offers tracked closure and reopen actions without a delete action', () => {
    expect(source).toContain("submitTicketAction('request-close')")
    expect(source).toContain('Request closure')
    expect(source).toContain("submitTicketAction('reopen')")
    expect(source).toContain('Reopen request')
    expect(source).not.toContain("submitTicketAction('delete')")
    expect(source).not.toMatch(/>\s*Delete (?:ticket|request)\s*</i)
  })

  it('resets to the first page when filters, sorting, or page size change', () => {
    expect(source).toContain('const resetPage = setter => value =>')
    expect(source).toContain('onSearch={resetPage(setSearch)}')
    expect(source).toContain('onSortBy={resetPage(setSortBy)}')
    expect(source).toContain('onSortOrder={resetPage(setSortOrder)}')
    expect(source).toContain('onPageSize={value => { setPageSize(value); setPage(1) }}')
  })
})
