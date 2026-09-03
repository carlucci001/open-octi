import { afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

import { editionFor, isClosedSurface, isOpenOcti, openclawRuntimeLogLabel } from '../lib/edition'
import { loginRedirectUrl, middleware } from '../middleware'

afterEach(() => vi.unstubAllEnvs())

describe('OpenOcti edition boundary', () => {
  it('defaults to the Command Center edition', () => {
    expect(editionFor({})).toBe('commandcenter')
    expect(isOpenOcti({})).toBe(false)
  })

  it('recognizes OpenOcti case-insensitively', () => {
    expect(editionFor({ FCC_EDITION: ' OpenOcti ' })).toBe('openocti')
    expect(isOpenOcti({ FCC_EDITION: 'OPENOCTI' })).toBe(true)
  })

  it('reads the build-injected public edition in client-style environments', () => {
    vi.stubEnv('FCC_EDITION', '')
    vi.stubEnv('NEXT_PUBLIC_FCC_EDITION', 'openocti')
    expect(isOpenOcti()).toBe(true)
  })

  it('uses the public gateway label only for OpenOcti logs', () => {
    expect(openclawRuntimeLogLabel(undefined, { FCC_EDITION: 'openocti' })).toBe('openclaw-gateway')
    expect(openclawRuntimeLogLabel(undefined, { FCC_EDITION: 'commandcenter' })).toBe('openclaw-hetzner')
    expect(openclawRuntimeLogLabel('hermes-hetzner', { FCC_EDITION: 'openocti' })).toBe('hermes-hetzner')
  })

  it.each([
    '/portal',
    '/portal/dashboard',
    '/billing',
    '/research',
    '/api/portal/me',
    '/api/stripe/webhook',
    '/api/research-dossiers',
    '/api/concierge/send-email',
  ])('marks %s as closed in OpenOcti', (pathname) => {
    expect(isClosedSurface(pathname, { FCC_EDITION: 'openocti' })).toBe(true)
  })

  it('returns 404 for a closed route before authentication', async () => {
    const previous = process.env.FCC_EDITION
    process.env.FCC_EDITION = 'openocti'
    try {
      const response = await middleware(new NextRequest('http://localhost:3002/api/portal/me'))
      expect(response.status).toBe(404)
      expect(await response.json()).toEqual({ error: 'not_found' })
    } finally {
      if (previous === undefined) delete process.env.FCC_EDITION
      else process.env.FCC_EDITION = previous
    }
  })

  it('keeps keyless production-mode login redirects on PUBLIC_APP_URL', async () => {
    const request = new NextRequest('http://localhost:3102/leads')
    const redirect = loginRedirectUrl(request, '/leads', {
      NODE_ENV: 'production',
      PUBLIC_APP_URL: 'http://127.0.0.1:3102',
    })
    expect(redirect.toString()).toBe('http://127.0.0.1:3102/login?next=%2Fleads')
  })
})
