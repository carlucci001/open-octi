import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  credential: { key: 'fake_integration_key' },
  responses: [],
  assertSafePlatformUrl: vi.fn(async value => new URL(value)),
  guardedFetch: vi.fn(async () => mocks.responses.shift()),
}))

vi.mock('../lib/agent-creds', () => ({
  getCred: vi.fn(() => mocks.credential),
}))

vi.mock('../lib/platforms/ssrf', () => ({
  assertSafePlatformUrl: mocks.assertSafePlatformUrl,
  guardedFetch: mocks.guardedFetch,
}))

import {
  fetchContactMessage,
  listContactMessages,
  MyvtcApiError,
} from '../lib/myvtc/client'

function response(status, body, retryAfter = '') {
  return { ok: status >= 200 && status < 300, status, text: body ? JSON.stringify(body) : '', retryAfter }
}

beforeEach(() => {
  mocks.credential = { key: 'fake_integration_key' }
  mocks.responses = []
  mocks.assertSafePlatformUrl.mockClear()
  mocks.guardedFetch.mockClear()
})

describe('MyVTC API client', () => {
  it('pages until a contact is found on page two', async () => {
    mocks.responses.push(
      response(200, { data: [{ id: 'other' }], nextCursor: 'opaque-page-2' }),
      response(200, { data: [{ id: 'contact-2', name: 'Second Page' }], nextCursor: null }),
    )

    await expect(fetchContactMessage('contact-2')).resolves.toMatchObject({ id: 'contact-2', name: 'Second Page' })
    expect(mocks.guardedFetch).toHaveBeenCalledTimes(2)
    expect(mocks.guardedFetch.mock.calls[0][0]).toContain('/api/v1/contact-messages?limit=25')
    expect(mocks.guardedFetch.mock.calls[1][0]).toContain('cursor=opaque-page-2')
  })

  it('honours Retry-After once and retries a 429 without exposing the key', async () => {
    vi.useFakeTimers()
    mocks.responses.push(
      response(429, { error: { code: 'RATE_LIMITED', message: 'wait' } }, '1'),
      response(200, { data: [], nextCursor: null }),
    )

    const pending = listContactMessages()
    await vi.runAllTimersAsync()
    await expect(pending).resolves.toEqual({ data: [], nextCursor: null })
    expect(mocks.guardedFetch).toHaveBeenCalledTimes(2)
    expect(JSON.stringify(mocks.guardedFetch.mock.calls)).toContain('fake_integration_key')
    vi.useRealTimers()
  })

  it('returns a typed fixed error after the retry is exhausted', async () => {
    mocks.responses.push(
      response(429, { error: { code: 'fake_integration_key', message: 'fake_integration_key' } }),
      response(429, { error: { code: 'fake_integration_key', message: 'fake_integration_key' } }),
    )

    const error = await listContactMessages().catch(value => value)
    expect(error).toBeInstanceOf(MyvtcApiError)
    expect(error.code).toBe('RATE_LIMITED')
    expect(error.message).not.toContain('fake_integration_key')
  })

  it('fails safely when the Command Vault key is absent', async () => {
    mocks.credential = null
    await expect(listContactMessages()).rejects.toMatchObject({ code: 'NOT_CONFIGURED', status: 503 })
    expect(mocks.guardedFetch).not.toHaveBeenCalled()
  })
})
