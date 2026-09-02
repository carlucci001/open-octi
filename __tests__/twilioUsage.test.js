import { describe, expect, it, vi } from 'vitest'
import { fetchTwilioUsage } from '../lib/twilio-usage'

const response = body => ({ ok: true, status: 200, json: async () => body })

describe('Twilio usage meter', () => {
  it('reports both today and month-to-date provider spend', async () => {
    const fetchImpl = vi.fn(async url => response({
      usage_records: url.includes('/Today.json')
        ? [{ price: '1.25', price_unit: 'usd' }, { price: '0.50', price_unit: 'usd' }]
        : [{ price: '9.75', price_unit: 'usd' }, { price: '2.00', price_unit: 'usd' }],
    }))

    const result = await fetchTwilioUsage({
      accountSid: 'AC123',
      keySid: 'SK123',
      keySecret: 'secret',
      fetchImpl,
    })

    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(result).toMatchObject({ configured: true, costToday: 1.75, costMonth: 11.75, currency: 'USD' })
  })

  it('does not call Twilio when the required credentials are missing', async () => {
    const fetchImpl = vi.fn()
    await expect(fetchTwilioUsage({ accountSid: '', keySid: '', keySecret: '', fetchImpl }))
      .resolves.toEqual({ configured: false })
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
