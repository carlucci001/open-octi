// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import bcrypt from 'bcryptjs'
const state = vi.hoisted(() => ({ data: null, openOcti: true }))
vi.mock('@/lib/dataStore', () => ({
  readData: () => state.data,
  mutateData: (_file, mutator) => { const result = mutator(state.data); state.data = result.data; return result.result },
}))
vi.mock('@/lib/edition', () => ({ isOpenOcti: () => state.openOcti }))
import { needsFirstRunAccount, createFirstRunAccount, isLocalSetupRequest } from '@/lib/first-run-account'

beforeEach(() => { state.data = null; state.openOcti = true; vi.stubEnv('INITIAL_ADMIN_PASSWORD', '') })
describe('first installation account', () => {
  it('creates an owner with a hashed password and permanently closes setup', async () => {
    expect(needsFirstRunAccount()).toBe(true)
    const user = await createFirstRunAccount({ username: 'demo-owner', password: 'demo-only-password-123' })
    expect(user.role).toBe('owner')
    expect(user).not.toHaveProperty('passwordHash')
    expect(await bcrypt.compare('demo-only-password-123', state.data.users[0].passwordHash)).toBe(true)
    expect(needsFirstRunAccount()).toBe(false)
    await expect(createFirstRunAccount({ username: 'other-owner', password: 'another-password-123' })).rejects.toMatchObject({ status: 409 })
    expect(state.data.users).toHaveLength(1)
  })
  it('allows only one owner when two setup requests race', async () => {
    const results = await Promise.allSettled(['first-owner', 'second-owner'].map(username => createFirstRunAccount({ username, password: 'demo-only-password-123' })))
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(state.data.users).toHaveLength(1)
  })
  it('never enables setup for the private edition or a configured initial password', async () => {
    state.openOcti = false
    expect(needsFirstRunAccount()).toBe(false)
    await expect(createFirstRunAccount({})).rejects.toMatchObject({ status: 409 })
    state.openOcti = true
    vi.stubEnv('INITIAL_ADMIN_PASSWORD', 'installer-provided-password')
    expect(needsFirstRunAccount()).toBe(false)
  })
  it('rejects weak passwords and invalid usernames', async () => {
    await expect(createFirstRunAccount({ username: 'owner', password: 'short' })).rejects.toMatchObject({ status: 400 })
    await expect(createFirstRunAccount({ username: '<script>', password: 'demo-only-password-123' })).rejects.toMatchObject({ status: 400 })
    expect(state.data).toBeNull()
  })
  it('requires a local host and matching browser origin', () => {
    const request = (host, origin) => new Request(`http://${host}/api/auth/setup`, { headers: { host, ...(origin ? { origin } : {}) } })
    expect(isLocalSetupRequest(request('127.0.0.1:3303', 'http://127.0.0.1:3303'), true)).toBe(true)
    expect(isLocalSetupRequest(request('localhost:3303', 'http://attacker.example'), true)).toBe(false)
    expect(isLocalSetupRequest(request('public.example', 'http://public.example'), true)).toBe(false)
    expect(isLocalSetupRequest(request('localhost:3303'), true)).toBe(false)
  })
})
