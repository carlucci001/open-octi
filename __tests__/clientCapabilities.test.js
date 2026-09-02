import { afterEach, describe, expect, it, vi } from 'vitest'

import { clearClientCapabilityCache, clientCapabilityStatus } from '../lib/client-capabilities'

describe('browser capability status', () => {
  afterEach(() => {
    clearClientCapabilityCache()
    vi.unstubAllGlobals()
  })

  it('shares one manifest request and returns inline missing-variable details', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      capabilities: [
        { id: 'site-note', status: 'not_configured', missing: ['SITE_NOTE_ENDPOINT'] },
        { id: 'elevenlabs', status: 'configured', missing: [] },
      ],
    }), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(clientCapabilityStatus('site-note')).resolves.toMatchObject({
      status: 'not_configured',
      missing: ['SITE_NOTE_ENDPOINT'],
    })
    await expect(clientCapabilityStatus('elevenlabs')).resolves.toMatchObject({ status: 'configured' })
    expect(fetchMock).toHaveBeenCalledOnce()
  })
})
