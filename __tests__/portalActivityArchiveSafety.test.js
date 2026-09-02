import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const normalizeNewlines = value => value.replace(/\r\n/g, '\n')
const route = normalizeNewlines(fs.readFileSync(path.join(process.cwd(), 'app/api/portal/activity/route.js'), 'utf8'))
const preferences = normalizeNewlines(fs.readFileSync(path.join(process.cwd(), 'lib/portal-activity-preferences.js'), 'utf8'))

describe('portal activity archive safety contract', () => {
  it('applies the newest-50 exposure ceiling before archive filtering and pagination', () => {
    const exposure = route.indexOf('const exposed = tagged.slice(-MAX_PAGE_SIZE)')
    const filtering = route.indexOf('const filtered = exposed.filter')
    const pagination = route.indexOf('const activities = filtered')

    expect(exposure).toBeGreaterThan(-1)
    expect(filtering).toBeGreaterThan(exposure)
    expect(pagination).toBeGreaterThan(filtering)
    expect(route).toContain('.filter(activity => activity.tenantId === lease.tenantId)\n    .slice(-MAX_PAGE_SIZE)')
    expect(route).toContain('const activity = exposed.find(candidate => candidate.id === activityId)')
  })

  it('keeps immutable audit records separate from reversible archive preferences', () => {
    expect(preferences).toContain("const STORE_FILE = 'portal-activity-preferences.json'")
    expect(route).toContain("const activitiesFile = readData('activities.json')")
    expect(route).not.toContain("mutateData('activities.json'")
    expect(route).not.toMatch(/export\s+async\s+function\s+DELETE/)
    expect(route).toContain('setPortalActivityArchived(session, lease, activityId, payload.archived)')
  })

  it('requires exact lease, account, and tenant scope without persisting session identity', () => {
    expect(route).toContain('lease.id === session.leaseId')
    expect(route).toContain('lease.clientAccountId === session.accountId')
    expect(route).toContain('lease.tenantId === session.tenantId')
    expect(preferences).toContain('return { leaseId: session.leaseId, accountId: session.accountId, tenantId: session.tenantId }')
    expect(preferences).not.toContain('return { sessionId:')
  })
})
