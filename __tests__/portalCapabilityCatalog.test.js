import { describe, expect, it } from 'vitest'
import {
  PORTAL_SERVICE_CAPABILITIES,
  PORTAL_TIER_CAPABILITY_AUDIT,
  portalAutomationCard,
  portalServiceCards,
  portalTierCard,
} from '../lib/portal-capability-catalog'

const EXPECTED_TIERS = [
  'receptionist',
  'communications',
  'office-manager',
  'specialist-graphics',
  'specialist-marketing',
  'specialist-legal',
  'specialist-engineering',
  'specialist-product-manager',
  'specialist-finance-manager',
  'full-suite',
]

describe('Concierge Portal capability-commerce audit', () => {
  it('has an explicit request-only audit for every customer-visible managed plan', () => {
    expect(Object.keys(PORTAL_TIER_CAPABILITY_AUDIT)).toEqual(EXPECTED_TIERS)
    for (const id of EXPECTED_TIERS) {
      const audit = PORTAL_TIER_CAPABILITY_AUDIT[id]
      expect(audit.deliveryEvidence.length).toBeGreaterThan(0)
      expect(audit.verifiedOutcomes.length).toBeGreaterThan(0)
      expect(audit.commerce).toMatchObject({
        mode: 'request',
        directOrder: false,
        fulfillmentRecord: 'portal_support_ticket',
        blockerCode: 'safe_portal_subscription_binding_required',
      })
    }
  })

  it('never turns an unknown or unpriced backend row into a customer card', () => {
    expect(portalTierCard({ id: 'invented', name: 'Invented', monthlyFee: 99 })).toBeNull()
    expect(portalTierCard({ id: 'receptionist', name: 'Receptionist', monthlyFee: 0 })).toBeNull()
  })

  it('uses the audited wording instead of unchecked backend capability claims', () => {
    const card = portalTierCard({
      id: 'receptionist',
      name: 'Receptionist',
      monthlyFee: 99,
      capabilities: ['Promise something the harness cannot do'],
    })
    expect(card.capabilities).not.toContain('Promise something the harness cannot do')
    expect(card.requestHref).toContain('managed-plan-receptionist')
    expect(card.commerce.directOrder).toBe(false)
  })

  it('requires automation price, customer verification, handler, and tracked record', () => {
    const base = { id: 'weekly-report', name: 'Weekly report', verified: true, monthlyFee: 100 }
    expect(portalAutomationCard(base)).toBeNull()
    expect(portalAutomationCard({
      ...base,
      marketplace: { customerVisible: true, capabilityVerified: true },
      fulfillment: { handler: 'weekly_report', trackedRecord: 'documents' },
    })).toMatchObject({
      id: 'weekly-report',
      commerce: { mode: 'request', directOrder: false },
    })
  })

  it('keeps Deep Dives scoped until charging and account filing are wired', () => {
    expect(PORTAL_SERVICE_CAPABILITIES.research).toMatchObject({
      label: 'Scoped service',
      commerce: {
        mode: 'request',
        directOrder: false,
        blockerCode: 'portal_research_charge_and_account_filing_not_wired',
      },
    })
    expect(portalServiceCards('documents').map(card => card.title)).toContain('Sales & competitor deep dives')
  })

  it('keeps the campaign pilot request-only until AI generation and delivery are production-verified', () => {
    expect(PORTAL_SERVICE_CAPABILITIES.campaign.commerce).toMatchObject({
      mode: 'request',
      directOrder: false,
      blockerCode: 'portal_campaign_ai_and_delivery_not_production_ready',
    })
    expect(PORTAL_SERVICE_CAPABILITIES.campaign.description).toContain('structured templates')
    expect(PORTAL_SERVICE_CAPABILITIES.campaign.conditions).toContain('Current drafts are not AI-generated')
    expect(PORTAL_SERVICE_CAPABILITIES.campaign.deliveryEvidence).not.toContain('connector:postiz-facebook')
  })
})
