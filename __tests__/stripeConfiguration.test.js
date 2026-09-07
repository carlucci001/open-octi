import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { resolveStripeConfiguration, saveStripeConfiguration, stripeConfigurationStatus, stripeKeyMode } from '../lib/stripe-configuration'
import { readInstallationIntegration, writeInstallationIntegration, resolveProviderKey, storeOpenOctiProviderKey } from '../lib/openocti-keys'

vi.mock('../lib/dataStore', () => ({ readData: () => ({ credentials: [] }) }))
const auth = vi.hoisted(() => ({ user: null }))
vi.mock('../lib/auth', () => ({ getCurrentUser: vi.fn(() => auth.user) }))
vi.mock('../lib/permissions', () => ({ requireCrmRead: vi.fn(() => auth.user ? { user: auth.user } : { error: new Response(null, { status: 401 }) }) }))
import { GET, POST } from '../app/api/openocti/stripe/route'
import { GET as publicConfig } from '../app/api/payments/config/route'

let directory, env
const pair = { mode: 'test', secretKey: ["sk", "test", "syntheticOwnerSecret"].join('_'), publishableKey: ["pk", "test", "syntheticOwnerPublic"].join('_') }
const accountResponse = () => new Response(JSON.stringify({ id: 'acct_synthetic', business_profile: { name: 'Synthetic test account' }, charges_enabled: false }), { status: 200 })
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'openocti-stripe-config-'))
  env = { FCC_EDITION: 'openocti', CRM_DATA_DIR: directory, CRM_SESSION_SECRET: 'synthetic-test-session-secret-for-stripe' }
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value)
  vi.stubEnv('STRIPE_SECRET_KEY', ''); vi.stubEnv('NEXT_PUBLIC_STRIPE_PK', '')
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Unexpected provider request in test') }))
  auth.user = { id: 'owner-test', role: 'owner' }
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); fs.rmSync(directory, { recursive: true, force: true }) })

describe('installation Stripe configuration', () => {
  it('encrypts the Stripe pair and preserves model-provider entries', async () => {
    storeOpenOctiProviderKey('openai', 'synthetic-model-secret', env)
    const result = await saveStripeConfiguration(pair, env, { fetchImpl: vi.fn(accountResponse) })
    const file = fs.readFileSync(path.join(directory, 'openocti-keys.json'), 'utf8')
    expect(file).not.toContain(pair.secretKey)
    expect(file).not.toContain(pair.publishableKey)
    expect(file).not.toContain('synthetic-model-secret')
    expect(result).toMatchObject({ configured: true, browserReady: true, mode: 'test', accountId: 'acct_synthetic' })
    expect(JSON.stringify(result)).not.toContain(pair.secretKey)
    expect(resolveProviderKey('openai', env).key).toBe('synthetic-model-secret')
    expect(resolveStripeConfiguration(env)).toMatchObject(pair)
  })
  it('prefers the saved account over unrelated environment and vault accounts', () => {
    writeInstallationIntegration('stripe', pair, env)
    const readCredentials = vi.fn(() => { throw new Error('must not read fallback') })
    expect(resolveStripeConfiguration({ ...env, STRIPE_SECRET_KEY: ["sk", "live", "other"].join('_') }, { readCredentials })).toMatchObject({ ...pair, source: 'app' })
    expect(readCredentials).not.toHaveBeenCalled()
  })
  it('requires an explicit choice for ambiguous legacy test/live keys', () => {
    const readCredentials = () => ({ credentials: [{ name: 'Stripe', fields: [{ label: 'Secret (P)', value: ["sk", "live", "first"].join('_') }, { label: 'Secret (S)', value: ["sk", "test", "second"].join('_') }] }] })
    expect(resolveStripeConfiguration(env, { readCredentials })).toMatchObject({ secretKey: '', publishableKey: '', issue: expect.stringContaining('explicitly') })
  })
  it('does not activate a publishable key from the wrong mode', () => {
    expect(resolveStripeConfiguration({ ...env, STRIPE_SECRET_KEY: pair.secretKey, NEXT_PUBLIC_STRIPE_PK: ["pk", "live", "other"].join('_') })).toMatchObject({ secretKey: pair.secretKey, publishableKey: '', issue: expect.any(String) })
  })
  it.each(['live', 'bad-mode'])('rejects mode mismatch before making any provider call (%s)', async mode => {
    const fetchImpl = vi.fn()
    await expect(saveStripeConfiguration({ ...pair, mode }, env, { fetchImpl })).rejects.toThrow()
    expect(fetchImpl).not.toHaveBeenCalled()
  })
  it('requires a new publishable key when replacing the secret', async () => {
    writeInstallationIntegration('stripe', pair, env)
    await expect(saveStripeConfiguration({ mode: 'test', secretKey: ["sk", "test", "newAccount"].join('_') }, env)).rejects.toThrow('same Stripe account')
    expect(fetch).not.toHaveBeenCalled()
  })
  it('keeps saved keys when a validation request fails without exposing Stripe response text', async () => {
    writeInstallationIntegration('stripe', pair, env)
    const result = saveStripeConfiguration({ ...pair, secretKey: ["sk", "test", "rejectedSecret"].join('_') }, env, { fetchImpl: () => new Response('sensitive provider response', { status: 401 }) })
    await expect(result).rejects.toThrow('Stripe rejected the account check (401)')
    expect(readInstallationIntegration('stripe', env)).toEqual(pair)
  })
  it.each(['{bad-json', JSON.stringify({ version: 99, keys: {} })])('refuses corrupted stores and preserves bytes', async content => {
    const file = path.join(directory, 'openocti-keys.json')
    fs.writeFileSync(file, content)
    const result = resolveStripeConfiguration({ ...env, STRIPE_SECRET_KEY: ["sk", "live", "unrelated"].join('_') })
    expect(result).toMatchObject({ source: 'app', secretKey: '', publishableKey: '', issue: expect.any(String) })
    await expect(saveStripeConfiguration(pair, env)).rejects.toThrow('Repair')
    expect(() => writeInstallationIntegration('stripe', pair, env)).toThrow('could not be read')
    expect(fs.readFileSync(file, 'utf8')).toBe(content)
    expect(fetch).not.toHaveBeenCalled()
  })
  it('refuses unreadable stores instead of falling back', () => {
    fs.mkdirSync(path.join(directory, 'openocti-keys.json'))
    expect(resolveStripeConfiguration({ ...env, STRIPE_SECRET_KEY: ["sk", "live", "unrelated"].join('_') }).secretKey).toBe('')
    expect(() => writeInstallationIntegration('stripe', pair, env)).toThrow('could not be read')
  })
  it('refuses decryption failures instead of switching to an unrelated account', async () => {
    writeInstallationIntegration('stripe', pair, env)
    const changed = { ...env, CRM_SESSION_SECRET: 'different-secret', STRIPE_SECRET_KEY: ["sk", "live", "other"].join('_') }
    expect(resolveStripeConfiguration(changed)).toMatchObject({ secretKey: '', source: 'app' })
    await expect(saveStripeConfiguration(pair, changed)).rejects.toThrow('Repair')
    expect(readInstallationIntegration('stripe', env)).toEqual(pair)
  })
  it('preserves private runtime environment precedence', () => {
    expect(resolveStripeConfiguration({ FCC_EDITION: 'commandcenter', STRIPE_SECRET_KEY: 'legacy-key', NEXT_PUBLIC_STRIPE_PK: 'legacy-public' })).toMatchObject({ secretKey: 'legacy-key', publishableKey: 'legacy-public', source: 'env' })
  })
  it('rejects malformed key prefixes', () => {
    expect(stripeKeyMode('not-a-key')).toBeNull()
    expect(stripeKeyMode(["rk", "test", "restricted"].join('_'))).toBe('test')
    expect(stripeKeyMode(["sk", "test", "secret"].join('_'), 'public')).toBeNull()
    expect(stripeConfigurationStatus({ secretKey: pair.secretKey, mode: 'test' }).browserReady).toBe(false)
  })
})

const request = (body, headers = {}) => new Request('http://app:3000/api/openocti/stripe', { method: 'POST', headers: { 'Content-Type': 'application/json', Host: 'localhost:3304', Origin: 'http://localhost:3304', 'Sec-Fetch-Site': 'same-origin', ...headers }, body: JSON.stringify(body) })
describe('Stripe configuration API access and response secrecy', () => {
  it.each([null, 'admin', 'member'])('denies non-owner configuration access (%s)', async role => {
    auth.user = role ? { role } : null
    expect((await GET(request({}))).status).toBe(role ? 403 : 401)
    expect((await POST(request(pair))).status).toBe(role ? 403 : 401)
    expect(fetch).not.toHaveBeenCalled()
  })
  it.each([{ Host: 'localhost:3304', Origin: 'http://localhost:3304' }, { Host: 'demo.example.com', Origin: 'https://demo.example.com' }])('accepts the browser host behind Docker or HTTPS proxy', async headers => {
    fetch.mockImplementation(accountResponse)
    const response = await POST(request(pair, headers))
    expect(response.status).toBe(200)
    expect(JSON.stringify(await response.json())).not.toContain(pair.secretKey)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.calls[0][0]).toBe('https://api.stripe.com/v1/account')
  })
  it.each([{ Origin: 'https://evil.example' }, { 'Sec-Fetch-Site': 'cross-site' }, { Origin: 'null' }])('blocks cross-origin credential changes', async headers => {
    expect((await POST(request(pair, headers))).status).toBe(403)
    expect(fetch).not.toHaveBeenCalled()
  })
  it('exposes only the publishable key and mode to authenticated payment clients', async () => {
    writeInstallationIntegration('stripe', pair, env)
    const data = await (await publicConfig(request({}))).json()
    expect(data).toEqual({ ok: true, mode: 'test', publishableKey: pair.publishableKey })
    expect(JSON.stringify(await (await GET(request({}))).json())).not.toContain(pair.secretKey)
    auth.user = null
    expect((await publicConfig(request({}))).status).toBe(401)
  })
})
