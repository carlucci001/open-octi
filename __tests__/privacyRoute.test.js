import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const privacyStore = vi.hoisted(() => ({
  cards: { cards: [], lastUpdated: null },
  categories: { categories: [], lastUpdated: null },
  transactions: { transactions: [], lastUpdated: null },
}))

vi.mock('@/lib/permissions', () => ({
  requireCrmRead: vi.fn(async () => ({ user: { id: 'usr_test', role: 'owner' }, error: null })),
  requireCrmWrite: vi.fn(async () => ({ user: { id: 'usr_test', role: 'owner' }, error: null })),
}))

vi.mock('@/lib/privacyFinance', () => ({
  assignPrivacyCardCategory: vi.fn(() => ({ card: null })),
  deletePrivacyCategory: vi.fn(() => ({ deleted: false })),
  getPrivacyCredential: vi.fn(() => ({
    configured: true,
    key: 'privacy_test_key',
    baseUrl: 'https://api.privacy.test',
    environment: 'test',
    credential: { id: 'cred_privacy_test' },
  })),
  privacyAuthHeaders: vi.fn(() => ({ Authorization: 'Bearer test' })),
  privacySummary: vi.fn(() => ({ cardCount: 0, transactionCount: 0 })),
  publicPrivacyWebhookUrl: vi.fn(origin => `${origin}/api/privacy/transaction-webhook`),
  readPrivacyCards: vi.fn(() => privacyStore.cards),
  readPrivacyCategories: vi.fn(() => privacyStore.categories),
  readPrivacyTransactions: vi.fn(() => privacyStore.transactions),
  upsertPrivacyCard: vi.fn(card => ({ card })),
  upsertPrivacyCategory: vi.fn(category => ({ category })),
  upsertPrivacyTransaction: vi.fn(transaction => ({ transaction })),
}))

function createCardRequest(card = {}) {
  return new Request('https://openocti.local/api/privacy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'create_card',
      card: {
        memo: 'Farrington in house',
        spendLimit: '25',
        spendLimitDuration: 'TRANSACTION',
        type: 'MERCHANT_LOCKED',
        cardholderName: 'Carl Farrington',
        ...card,
      },
    }),
  })
}

describe('Privacy finance route', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      message: 'There is a problem with your account. Please contact support.',
    }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('returns a provider error instead of HTTP 500 when Privacy rejects card creation', async () => {
    const { POST } = await import('@/app/api/privacy/route')

    const response = await POST(createCardRequest())
    const body = await response.json()

    expect(response.status).toBe(424)
    expect(body).toMatchObject({
      ok: false,
      code: 'privacy_provider_error',
      providerStatus: 403,
    })
    expect(body.error).toContain('Privacy.com rejected card creation')
    expect(body.error).toContain('There is a problem with your account')
    expect(global.fetch).toHaveBeenCalledWith('https://api.privacy.test/cards', expect.objectContaining({
      method: 'POST',
    }))
  })
})
