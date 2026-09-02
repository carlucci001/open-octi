import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ owner: null, data: {}, audits: [] }))

vi.mock('../lib/auth', () => ({
  requireOwner: vi.fn(async () => state.owner
    ? { user: state.owner, error: null }
    : { user: null, error: Response.json({ ok: false, error: 'unauthorized' }, { status: 401 }) }),
}))

vi.mock('../lib/auditLog', () => ({ logAuditEvent: vi.fn(event => state.audits.push(event)) }))

vi.mock('../lib/dataStore', () => ({
  readData: vi.fn(filename => state.data[filename]),
  mutateData: vi.fn((filename, mutator) => {
    const outcome = mutator(structuredClone(state.data[filename] || {}))
    state.data[filename] = outcome.data
    return outcome.result
  }),
}))

vi.mock('../lib/stripe-billing-catalog.mjs', () => ({
  stripeBillingCatalogHash: vi.fn(() => 'catalog_hash_one'),
}))

vi.mock('../lib/stripe-billing-catalog-source', () => ({
  getRuntimeStripeBillingCatalogDefinitions: vi.fn(() => [{ catalogKey: 'fcc_tier_receptionist' }]),
}))

import { GET, POST } from '../app/api/admin/subscription-plans/route'

function post(body) {
  return new Request('https://openocti.local/api/admin/subscription-plans', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('owner subscription plan administration', () => {
  beforeEach(() => {
    state.owner = null
    state.audits = []
    state.data = {
      'pricing-tiers.json': {
        tiers: [{
          id: 'receptionist',
          name: 'Receptionist',
          tagline: 'Answer every call',
          monthlyFee: 99,
          color: '#3b82f6',
          agents: ['receptionist'],
          capabilities: ['Inbound calls'],
          included: { voiceMinutes: 200 },
          creditAllowance: { includedCredits: 8500 },
        }],
        addons: {
          tools: [{ id: 'stripe', name: 'Stripe processing', monthlyFee: 50, description: 'Payment support' }],
          specialties: [],
          premiumModels: [],
        },
        currency: 'USD',
      },
    }
  })

  it('is owner-only', async () => {
    expect((await GET(new Request('https://openocti.local/api/admin/subscription-plans'))).status).toBe(401)
    expect((await POST(post({ action: 'upsert-plan' }))).status).toBe(401)
  })

  it('returns the backend plans and add-on catalog without Stripe mutation', async () => {
    state.owner = { id: 'owner_carl', role: 'owner' }
    const response = await GET(new Request('https://openocti.local/api/admin/subscription-plans'))
    const result = await response.json()
    expect(result).toMatchObject({
      ok: true,
      catalogHash: 'catalog_hash_one',
      plans: [{ id: 'receptionist', monthlyFee: 99, creditAllowance: { includedCredits: 8500 } }],
      addons: [{ id: 'stripe', group: 'tools', monthlyFee: 50 }],
    })
  })

  it('creates a monthly plan with paid-period credits and marks Stripe review pending', async () => {
    state.owner = { id: 'owner_carl', role: 'owner' }
    const response = await POST(post({
      action: 'upsert-plan',
      requestId: 'plan-create-one',
      plan: {
        id: 'research-desk',
        name: 'Research Desk',
        tagline: 'Deep business research',
        monthlyFee: 249,
        includedCredits: 18000,
        color: '#7c3aed',
        capabilities: 'Competitor reports\nDomain diligence',
        notes: 'Owner-managed plan',
      },
    }))
    const result = await response.json()

    expect(response.status).toBe(200)
    expect(result).toMatchObject({
      ok: true,
      stripeSyncRequired: true,
      saved: { type: 'plan', created: true, item: { id: 'research-desk', monthlyFee: 249, creditAllowance: { includedCredits: 18000 } } },
    })
    expect(state.data['pricing-tiers.json'].tiers.at(-1)).toMatchObject({
      id: 'research-desk',
      capabilities: ['Competitor reports', 'Domain diligence'],
      creditAllowance: { includedCredits: 18000, resetsWithPaidBillingPeriod: true, exhaustionPolicy: 'prepaid_then_pause' },
    })
    expect(state.audits[0]).toMatchObject({ action: 'subscription_plan_created', area: 'billing' })
  })

  it('updates a supported add-on and rejects invalid plan allowances', async () => {
    state.owner = { id: 'owner_carl', role: 'owner' }
    const response = await POST(post({
      action: 'upsert-addon',
      requestId: 'addon-update-one',
      addon: { id: 'stripe', group: 'tools', name: 'Stripe processing', monthlyFee: 65, description: 'Expanded payment support' },
    }))
    expect(await response.json()).toMatchObject({
      ok: true,
      stripeSyncRequired: true,
      saved: { type: 'addon', created: false, item: { monthlyFee: 65 } },
    })
    expect(state.data['pricing-tiers.json'].addons.tools[0].monthlyFee).toBe(65)
    expect(state.audits[0]).toMatchObject({ action: 'subscription_addon_updated' })

    const invalid = await POST(post({
      action: 'upsert-plan',
      requestId: 'plan-invalid-one',
      plan: { id: 'bad', name: 'Bad Plan', monthlyFee: 20, includedCredits: 1.5 },
    }))
    expect(invalid.status).toBe(400)
  })
})
