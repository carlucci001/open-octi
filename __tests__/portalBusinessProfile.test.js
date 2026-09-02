import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ data: {}, session: null, storageError: null }))

vi.mock('../lib/portal-auth', () => ({
  getSessionFromRequest: vi.fn(() => state.session),
}))

vi.mock('../lib/dataStore', () => ({
  readData: vi.fn(filename => structuredClone(state.data[filename] || null)),
  mutateData: vi.fn((filename, mutator) => {
    if (state.storageError) throw state.storageError
    const outcome = mutator(structuredClone(state.data[filename] || null))
    state.data[filename] = structuredClone(outcome.data)
    return structuredClone(outcome.result)
  }),
}))

import { GET, PATCH } from '../app/api/portal/business-profile/route'
import {
  BUSINESS_PROFILE_FIELDS,
  calculateBusinessProfileCompletion,
  deriveBusinessProfileMetrics,
  evaluateBusinessProfileServiceReadiness,
  getBusinessProfileNavigation,
} from '../lib/portal-business-profile'

const session = {
  sessionId: 'session-acme',
  email: 'redacted@example.invalid',
  accountId: 'account-acme',
  tenantId: 'tenant-acme',
}

function request(method = 'GET', body) {
  return new Request('http://localhost/api/portal/business-profile', {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
}

describe('portal business profile API', () => {
  beforeEach(() => {
    state.session = { ...session }
    state.storageError = null
    state.data = {
      'accounts.json': {
        accounts: [{
          id: 'account-acme',
          name: 'Acme Development',
          email: 'redacted@example.invalid',
          phone: '555-0100',
          website: 'https://acme.example',
        }],
      },
    }
  })

  it('requires an authenticated portal session', async () => {
    state.session = null

    const response = await GET(request())

    expect(response.status).toBe(401)
  })

  it('seeds account suggestions with provenance and never invents credentials', async () => {
    const response = await GET(request())
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.profile).toMatchObject({ accountId: 'account-acme', tenantId: 'tenant-acme' })
    expect(json.profile.fields.businessName).toMatchObject({
      value: 'Acme Development',
      status: 'suggested',
      verifiedAt: null,
      source: { type: 'account_record', ref: 'account-acme' },
    })
    expect(json.profile.fields.website.updatedAt).toEqual(expect.any(String))
    expect(Object.keys(BUSINESS_PROFILE_FIELDS)).not.toEqual(expect.arrayContaining([
      'password', 'apiKey', 'accessToken', 'ftpPassword',
    ]))
  })

  it('does not overwrite client-entered values when account data is seeded again', async () => {
    state.data['client-growth-profiles.json'] = {
      profiles: [{
        id: 'business_tenant-acme_account-acme',
        accountId: 'account-acme',
        tenantId: 'tenant-acme',
        fields: {
          businessName: {
            value: 'Acme Client Approved Name',
            status: 'confirmed',
            source: { type: 'client_profile', ref: 'redacted@example.invalid' },
            verifiedAt: '2026-08-25T10:00:00.000Z',
            updatedAt: '2026-08-25T10:00:00.000Z',
          },
          services: {
            value: ['Commercial build-outs', 'Site planning'],
            status: 'confirmed',
            source: { type: 'client_profile', ref: 'redacted@example.invalid' },
            verifiedAt: '2026-08-25T10:00:00.000Z',
            updatedAt: '2026-08-25T10:00:00.000Z',
          },
        },
        createdAt: '2026-08-25T10:00:00.000Z',
        updatedAt: '2026-08-25T10:00:00.000Z',
      }],
    }

    const response = await GET(request())
    const json = await response.json()

    expect(json.profile.fields.businessName.value).toBe('Acme Client Approved Name')
    expect(json.profile.fields.website.value).toBe('https://acme.example')
    expect(json.profile.fields.offerings.value).toBe('Commercial build-outs, Site planning')
  })

  it('saves supported fields with client provenance and completion metadata', async () => {
    await GET(request())

    const response = await PATCH(request('PATCH', {
      saveMode: 'autosave',
      fields: {
        businessSummary: 'We build neighborhood retail locations.',
        offerings: 'Commercial build-outs and site planning',
        idealCustomers: 'Growing independent retailers',
      },
    }))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.profile.fields.businessSummary).toMatchObject({
      value: 'We build neighborhood retail locations.',
      status: 'confirmed',
      source: { type: 'client_profile', ref: 'redacted@example.invalid' },
      verifiedAt: expect.any(String),
      updatedAt: expect.any(String),
    })
    expect(json.profile.lastSaveMode).toBe('autosave')
    expect(json.profile.completion.percent).toBeGreaterThan(0)
  })

  it('persists the last worked section and returns a resumable navigation target', async () => {
    await GET(request())

    const response = await PATCH(request('PATCH', { currentSectionId: 'workflows' }))
    const json = await response.json()

    expect(response.status).toBe(200)
    expect(json.profile.currentSectionId).toBe('workflows')
    expect(json.profile.currentSectionUpdatedAt).toEqual(expect.any(String))
    expect(json.profile.navigation.continueSectionId).toBe('workflows')
  })

  it('rejects unsupported, secret-like, invalid-type, and over-length input', async () => {
    await GET(request())

    for (const fields of [
      { apiKey: 'do-not-store' },
      { unknownField: 'not allowed' },
      { businessName: ['must', 'be', 'text'] },
      { businessName: 'x'.repeat(141) },
      { primaryEmail: 'not-an-email' },
      { website: 'javascript:alert(1)' },
    ]) {
      const response = await PATCH(request('PATCH', { fields }))
      expect(response.status).toBe(400)
    }
  })

  it('returns clear validation errors without exposing unexpected storage errors', async () => {
    await GET(request())
    const validationResponse = await PATCH(request('PATCH', { fields: { primaryEmail: 'not-an-email' } }))
    const validationJson = await validationResponse.json()
    expect(validationResponse.status).toBe(400)
    expect(validationJson.error).toBe('Enter a valid primary email address')

    state.storageError = new Error('SQLITE_CORRUPT at C:\\private\\crm.sqlite')
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const internalResponse = await GET(request())
    const internalJson = await internalResponse.json()

    expect(internalResponse.status).toBe(500)
    expect(internalJson.error).toBe('Business profile request failed. Please try again.')
    expect(JSON.stringify(internalJson)).not.toContain('SQLITE_CORRUPT')
    expect(JSON.stringify(internalJson)).not.toContain('crm.sqlite')
    consoleSpy.mockRestore()
  })

  it('never reads or updates another tenant profile', async () => {
    state.data['client-growth-profiles.json'] = {
      profiles: [{
        id: 'business_tenant-other_account-acme',
        accountId: 'account-acme',
        tenantId: 'tenant-other',
        fields: { businessName: { value: 'Other Tenant Name' } },
      }],
    }

    const response = await GET(request())
    const json = await response.json()

    expect(json.profile.tenantId).toBe('tenant-acme')
    expect(json.profile.fields.businessName.value).toBe('Acme Development')
    expect(state.data['client-growth-profiles.json'].profiles).toHaveLength(2)
  })
})

describe('business profile completion', () => {
  it('counts meaningful fields and reports every progressive section', () => {
    const completion = calculateBusinessProfileCompletion({
      businessName: { value: 'Acme Development' },
      offerings: { value: 'Commercial construction' },
      automationOpportunities: { value: 'Lead follow-up' },
    })

    expect(completion.completed).toBe(3)
    expect(completion.total).toBeGreaterThan(20)
    expect(completion.sections.map(section => section.id)).toEqual([
      'identity', 'locationsHours', 'offerings', 'idealCustomers', 'qualifiedLeads',
      'brand', 'workflows', 'approvals', 'systems', 'resilience',
    ])
  })

  it('routes a completed current card to the next incomplete card', () => {
    const identityFields = Object.fromEntries(
      Object.entries(BUSINESS_PROFILE_FIELDS)
        .filter(([, definition]) => definition.section === 'identity')
        .map(([key]) => [key, { value: key === 'website' ? 'https://acme.example' : `${key} value` }]),
    )

    const navigation = getBusinessProfileNavigation(identityFields, 'identity')

    expect(navigation.continueSectionId).toBe('locationsHours')
    expect(navigation.nextIncompleteSectionId).toBe('locationsHours')
  })

  it('derives truthful readiness metrics from named profile fields and timestamps', () => {
    const metrics = deriveBusinessProfileMetrics({
      businessName: { value: 'Acme', status: 'confirmed', updatedAt: '2026-08-20T00:00:00.000Z' },
      offerings: { value: 'Construction', status: 'confirmed', updatedAt: '2026-08-20T00:00:00.000Z' },
      idealCustomers: { value: 'Retailers', status: 'suggested', updatedAt: '2025-01-01T00:00:00.000Z' },
      qualifiedLeadCriteria: { value: 'Opening within 12 months', status: 'confirmed', updatedAt: '2026-08-20T00:00:00.000Z' },
      repetitiveTasks: { value: 'Lead follow-up', status: 'confirmed', updatedAt: '2026-08-20T00:00:00.000Z' },
      website: { value: 'https://acme.example', status: 'suggested', updatedAt: '2026-08-20T00:00:00.000Z' },
      backupStatus: { value: 'Nightly', status: 'confirmed', updatedAt: '2026-08-20T00:00:00.000Z' },
    }, { now: new Date('2026-08-27T00:00:00.000Z') })

    expect(metrics.overall).toMatchObject({ label: 'Overall completion', completed: 7, total: Object.keys(BUSINESS_PROFILE_FIELDS).length })
    expect(metrics.verifiedInformation).toMatchObject({ label: 'Verified information', completed: 5, total: 7 })
    expect(metrics.freshness).toMatchObject({ label: 'Profile freshness', completed: 6, total: 7 })
    expect(metrics.leadReadiness.basedOn).toContain('qualifiedLeadCriteria')
    expect(metrics.automationReadiness.basedOn).toContain('repetitiveTasks')
    expect(metrics.websiteReadiness.basedOn).toContain('website')
    expect(metrics.recoveryReadiness.basedOn).toContain('backupStatus')
    expect(metrics.missingYearsInBusiness).toBe(true)
  })

  it('evaluates service readiness as non-blocking guidance with missing questions and target cards', () => {
    const readiness = evaluateBusinessProfileServiceReadiness({
      businessName: { value: 'Acme' },
      website: { value: 'https://acme.example' },
      websitePlatform: { value: 'WordPress' },
      hostingProvider: { value: 'Managed host' },
    })

    expect(readiness.website_administration).toMatchObject({
      ready: true,
      score: 100,
      missingFieldKeys: [],
      blocking: false,
    })
    expect(readiness.lead_generation.ready).toBe(false)
    expect(readiness.lead_generation.missingFieldKeys).toContain('yearsInBusiness')
    expect(readiness.lead_generation.missingYearsInBusiness).toBe(true)
    expect(readiness.lead_generation.questionPrompts.length).toBeGreaterThan(0)
    expect(readiness.lead_generation.targetSection).toBe('identity')
    expect(Object.keys(readiness)).toEqual(expect.arrayContaining([
      'lead_generation', 'blog_publishing', 'website_administration',
      'automation', 'managed_backups', 'disaster_recovery',
    ]))
  })
})
