import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const page = readFileSync('app/portal/activity/page.js', 'utf8')
const css = readFileSync('app/portal/activity/activity.module.css', 'utf8')

describe('portal activity workspace source contract', () => {
  it('preserves URL-backed list controls and adds the server archive filter', () => {
    expect(page).toContain("searchParams.get('q')")
    expect(page).toContain("searchParams.get('type')")
    expect(page).toContain("searchParams.get('from')")
    expect(page).toContain("searchParams.get('to')")
    expect(page).toContain("searchParams.get('sortBy')")
    expect(page).toContain("searchParams.get('pageSize')")
    expect(page).toContain("searchParams.get('archiveState')")
    expect(page).toContain("params.set('archiveState', archiveState)")
  })

  it('uses the tenant-scoped PATCH contract and refreshes the server result', () => {
    expect(page).toContain("method: 'PATCH'")
    expect(page).toContain('JSON.stringify({ activityId: activity.id, archived })')
    expect(page).toContain('setRefreshKey(value => value + 1)')
    expect(page).not.toContain('localStorage')
  })

  it('keeps the compact list usable at 320px widths', () => {
    expect(css).toContain('@media (max-width: 480px)')
    expect(css).toContain('.main { padding: 24px 12px; }')
    expect(css).toContain('grid-template-columns: 32px minmax(0, 1fr)')
    expect(css).toContain('overflow-wrap: anywhere')
  })
})
