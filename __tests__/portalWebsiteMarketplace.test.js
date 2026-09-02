import { describe, expect, it } from 'vitest'

import { PORTAL_SERVICE_CAPABILITIES } from '@/lib/portal-capability-catalog'
import { buildPortalServiceRequestDraft } from '@/app/portal/components/portal-service-requests'

describe('website services marketplace', () => {
  it.each([
    'blogPublishing',
    'websiteAdministration',
    'managedBackups',
    'disasterRecovery',
  ])('keeps %s approval gated until its delivery connection is verified', key => {
    const service = PORTAL_SERVICE_CAPABILITIES[key]
    expect(service).toBeTruthy()
    expect(service.commerce.mode).toBe('request')
    expect(service.commerce.directOrder).toBe(false)
    expect(service.commerce.fulfillmentRecord).toBe('portal_support_ticket')
  })

  it.each([
    ['blog-publishing', 'content_media'],
    ['website-administration', 'website_issue'],
    ['managed-backups', 'website_issue'],
    ['disaster-recovery-plan', 'website_issue'],
  ])('builds a valid tracked request for %s', (service, category) => {
    const draft = buildPortalServiceRequestDraft(service)
    expect(draft.category).toBe(category)
    expect(draft.subject).toBeTruthy()
    expect(draft.description.length).toBeGreaterThan(40)
  })
})
