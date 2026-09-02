import { describe, expect, it, vi } from 'vitest'
import { consumeBuilderHandoff, issueBuilderHandoff } from '../lib/builderHandoff'
import { canUseTab } from '../lib/roles'

vi.mock('@/lib/auth', () => ({
  requireOwner: vi.fn(async () => ({
    user: { id: 'usr_carl_local', username: 'carl', role: 'owner' },
    error: null,
  })),
  findUserById: vi.fn(() => ({
    id: 'usr_carl_local',
    username: 'carl',
    displayName: 'Carl Farrington',
    role: 'owner',
    tokenVersion: 3,
  })),
  signSession: vi.fn(async ({ uid, ver }) => `signed-session-for-${uid}-${ver}`),
}))

describe('Builder owner handoff', () => {
  process.env.CRM_SESSION_SECRET ||= 'builder-handoff-test-secret'

  it('issues a one-time code and consumes it only once', () => {
    const code = issueBuilderHandoff({ uid: 'usr_carl_local', ver: 4 })

    expect(consumeBuilderHandoff(code)).toMatchObject({ uid: 'usr_carl_local', ver: 4 })
    expect(consumeBuilderHandoff(code)).toBeNull()
  })

  it('rejects missing handoff codes', () => {
    expect(consumeBuilderHandoff('')).toBeNull()
    expect(consumeBuilderHandoff('not-issued')).toBeNull()
  })

  it('rejects a modified signed handoff', () => {
    const code = issueBuilderHandoff({ uid: 'usr_carl_local', ver: 1 })
    expect(consumeBuilderHandoff(`${code.slice(0, -1)}x`)).toBeNull()
  })

  it('keeps the Builder tab owner-only', () => {
    expect(canUseTab({ username: 'carl', role: 'owner' }, 'builder')).toBe(true)
    expect(canUseTab({ username: 'admin', role: 'admin' }, 'builder')).toBe(false)
    expect(canUseTab({ username: 'member', role: 'member' }, 'builder')).toBe(false)
  })

  it('preserves every Command Center theme in the Builder launch URL', async () => {
    const { POST: launch } = await import('../app/api/builder/launch/route')

    for (const theme of ['command', 'codex', 'codex-blue']) {
      const response = await launch(new Request('http://localhost:3002/api/builder/launch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ theme }),
      }))
      const result = await response.json()

      expect(response.status).toBe(200)
      expect(new URL(result.url).searchParams.get('theme')).toBe(theme)
    }
  })

  it('exchanges a launch URL for a short-lived Builder session', async () => {
    const { POST: launch } = await import('../app/api/builder/launch/route')
    const { POST: exchange } = await import('../app/api/builder/handoff/route')

    const launchResponse = await launch(new Request('http://localhost:3002/api/builder/launch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ theme: 'command' }),
    }))
    const launchResult = await launchResponse.json()
    const handoff = new URL(launchResult.url).searchParams.get('handoff')

    expect(launchResponse.status).toBe(200)
    expect(handoff).toBeTruthy()

    const exchangeResponse = await exchange(new Request('http://localhost:3002/api/builder/handoff', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: handoff }),
    }))
    const exchangeResult = await exchangeResponse.json()

    expect(exchangeResponse.status).toBe(200)
    expect(exchangeResult).toMatchObject({
      ok: true,
      sessionToken: 'signed-session-for-usr_carl_local-3',
      user: { username: 'carl', role: 'owner' },
    })
  })
})
