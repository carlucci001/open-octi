import { describe, expect, it } from 'vitest'
import { conciergeServiceReadiness, GOOGLE_BUSINESS_PROFILE_STATUS, readinessReply } from '../lib/portal-concierge-readiness'

const field = value => ({ value, status: 'confirmed' })

describe('Cheryl service readiness', () => {
  it.each([
    ['Find qualified leads for us', 'lead_generation'],
    ['Publish a blog about our opening', 'blog_publishing'],
    ['Administer our Joomla website', 'website_administration'],
    ['Automate our intake workflow', 'automation'],
    ['Set up managed website backups', 'managed_backups'],
    ['Create a disaster recovery plan', 'disaster_recovery'],
  ])('maps %s to the tenant profile requirements for %s', (message, service) => {
    const result = conciergeServiceReadiness({ message, profile: { fields: {} }, account: {} }).intent
    expect(result).toMatchObject({ service, ready: false, blocking: true })
    expect(result.missingFieldKeys.length).toBeGreaterThan(0)
    expect(result.questionPrompts.length).toBeGreaterThan(0)
    expect(result.questionPrompts.length).toBeLessThanOrEqual(3)
    expect(result.profileHref).toMatch(/^\/portal\/profile\?section=/)
    expect(readinessReply(result)).toContain('business profile')
  })

  it('marks all six services ready only when their real profile inputs are present', () => {
    const fields = Object.fromEntries([
      'businessName', 'yearsInBusiness', 'offerings', 'idealCustomers', 'territory', 'qualifiedLeadCriteria',
      'businessSummary', 'brandVoice', 'website', 'websitePlatform', 'hostingProvider', 'salesProcess',
      'repetitiveTasks', 'automationOpportunities', 'approvalRequirements', 'backupStatus', 'backupDestination',
      'recoveryPriorities', 'recoveryTimeGoal', 'drpStatus',
    ].map(key => [key, field(`${key} value`)]))
    const readiness = conciergeServiceReadiness({ profile: { fields }, account: {} }).all
    expect(Object.values(readiness).every(item => item.ready)).toBe(true)
  })

  it('never represents Google Business Profile metadata as an OAuth connection', () => {
    expect(GOOGLE_BUSINESS_PROFILE_STATUS).toEqual(expect.objectContaining({ status: 'setup_required', oauthConnected: false }))
  })
})
