import { describe, expect, it } from 'vitest'
import { parseReconciliationCsv, parseSubscriptionCsv, subscriptionMatchKey } from '../lib/subscriptionImport'
import { reconcileSubscriptionRecords } from '../lib/subscriptionReconciliation'

describe('subscription CSV import', () => {
  it('normalizes Carl finance provider fields into subscription records', () => {
    const csv = [
      'vendor_name,product_or_plan,category,amount,currency,billing_frequency,billing_type,billing_day_of_month,last_charge_date,next_charge_date,status,payment_method,business_entity,project_or_product,min_observed_amount,max_observed_amount,avg_monthly_amount,last_3_charges',
      '"Anthropic, Inc.",Claude Pro,AI,$20.00,usd,Monthly,Fixed,6,5/6/2026,2026-06-06,Active,"MC 6918",Farrington Development LLC,NewsroomAIOS,4.19,271.97,85.50,"[59,60,61]"',
    ].join('\n')

    const parsed = parseSubscriptionCsv(csv)
    expect(parsed.records).toHaveLength(1)
    expect(parsed.records[0].ok).toBe(true)
    expect(parsed.records[0].subscription).toMatchObject({
      vendor: 'Anthropic, Inc.',
      productOrPlan: 'Claude Pro',
      category: 'ai',
      amount: 20,
      currency: 'USD',
      frequency: 'monthly',
      billingType: 'fixed',
      billingDayOfMonth: 6,
      lastChargeDate: '2026-05-06',
      nextDue: '2026-06-06',
      status: 'active',
      paymentMethod: 'MC 6918',
      businessEntity: 'Farrington Development LLC',
      projectOrProduct: 'NewsroomAIOS',
      minObservedAmount: 4.19,
      maxObservedAmount: 271.97,
      avgMonthlyAmount: 85.5,
    })
    expect(parsed.records[0].subscription.last3Charges).toEqual([59, 60, 61])
  })

  it('uses a stable match key for import updates', () => {
    const key = subscriptionMatchKey({
      vendor: 'Claude',
      productOrPlan: 'Team',
      paymentMethod: 'MC 6918',
    })
    expect(key).toBe('claude|team|mc 6918')
  })
})

describe('subscription reconciliation preview', () => {
  it('accepts sparse Claude email receipt exports', () => {
    const csv = [
      'merchant,description,receipt_amount,receipt_date,invoice_number,subject',
      'OpenAI,ChatGPT Team,$30.00,6/22/2026,INV-123,"Receipt from OpenAI"',
    ].join('\n')

    const parsed = parseReconciliationCsv(csv)
    expect(parsed.records).toHaveLength(1)
    expect(parsed.records[0].ok).toBe(true)
    expect(parsed.records[0].subscription).toMatchObject({
      vendor: 'OpenAI',
      productOrPlan: 'ChatGPT Team',
      amount: 30,
      lastChargeDate: '2026-06-22',
      sourceReceiptId: 'INV-123',
    })
  })

  it('returns suggestions without mutating existing subscriptions', () => {
    const existing = [{
      id: 'sub_openai',
      vendor: 'OpenAI',
      productOrPlan: 'ChatGPT Team',
      amount: 25,
      currency: 'USD',
      frequency: 'monthly',
      paymentMethod: 'MC 6918',
      sourceReceiptId: 'INV-123',
    }]
    const parsed = parseReconciliationCsv([
      'merchant,description,receipt_amount,invoice_number',
      'OpenAI,ChatGPT Team,$30.00,INV-123',
      'Cloudflare,Pro Plan,$20.00,INV-999',
    ].join('\n'))

    const result = reconcileSubscriptionRecords(existing, parsed.records, {
      now: new Date('2026-06-23T12:00:00.000Z'),
    })

    expect(existing[0].amount).toBe(25)
    expect(result.summary).toMatchObject({
      suggested_update: 1,
      suggested_create: 1,
      unchanged: 0,
      needs_review: 0,
      skipped: 0,
    })
    expect(result.items[0]).toMatchObject({
      action: 'suggested_update',
      matchedSubscriptionId: 'sub_openai',
      confidence: 'strong',
    })
    expect(result.items[0].changes).toContainEqual({ field: 'amount', from: 25, to: 30 })
    expect(result.items[1]).toMatchObject({
      action: 'suggested_create',
      matchedSubscriptionId: null,
      vendor: 'Cloudflare',
    })
  })

  it('routes vendor-only matches to review', () => {
    const existing = [{
      id: 'sub_adobe',
      vendor: 'Adobe',
      productOrPlan: 'Creative Cloud',
      amount: 59.99,
      currency: 'USD',
      frequency: 'monthly',
    }]
    const parsed = parseReconciliationCsv([
      'merchant,receipt_amount',
      'Adobe,$59.99',
    ].join('\n'))

    const result = reconcileSubscriptionRecords(existing, parsed.records)

    expect(result.summary.needs_review).toBe(1)
    expect(result.items[0]).toMatchObject({
      action: 'needs_review',
      matchedSubscriptionId: 'sub_adobe',
      reason: 'vendor only',
    })
  })
})
