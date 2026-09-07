// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ required: true }))
vi.mock('@/lib/first-run-account', async importOriginal => ({ ...(await importOriginal()), needsFirstRunAccount: () => state.required, createFirstRunAccount: vi.fn(async () => ({ id: 'test-owner', username: 'owner', role: 'owner' })) }))
vi.mock('@/lib/auth', () => ({ signSession: async () => 'test-session', buildSessionCookie: value => `fcc_session=${value}; HttpOnly`, SESSION_TTL_MS: 1000 }))
import { GET, POST } from '@/app/api/auth/setup/route'
import { createFirstRunAccount } from '@/lib/first-run-account'
beforeEach(() => { state.required = true; vi.clearAllMocks() })
const request = (origin = 'http://localhost:3303') => new Request('http://localhost:3303/api/auth/setup', { method: 'POST', headers: { host: 'localhost:3303', origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'owner', password: 'test-password-long' }) })
it('reports setup state without requiring a login', async () => {
  const response = await GET(new Request('http://localhost:3303/api/auth/setup'))
  expect(await response.json()).toEqual({ required: true, local: true })
})
it('creates the first account and signs it in', async () => {
  const response = await POST(request())
  expect(response.status).toBe(200)
  expect(response.headers.get('Set-Cookie')).toContain('HttpOnly')
  expect((await response.json()).ok).toBe(true)
})
it('rejects a cross-origin attempt before writing an account', async () => {
  expect((await POST(request('https://attacker.invalid'))).status).toBe(403)
  expect(createFirstRunAccount).not.toHaveBeenCalled()
})
it('rejects another setup request when an account exists', async () => {
  state.required = false
  expect((await POST(request())).status).toBe(409)
  expect(createFirstRunAccount).not.toHaveBeenCalled()
})
