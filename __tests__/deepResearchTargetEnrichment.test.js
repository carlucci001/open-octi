import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  recordCompletedDossier: vi.fn(),
  dnsAnswers: new Map(),
  lookup: vi.fn(),
}))

vi.mock('node:dns/promises', () => ({
  lookup: mocks.lookup,
  default: { lookup: mocks.lookup },
}))

vi.mock('../lib/agent-creds', () => ({
  getCred: vi.fn(() => null),
  upsertCredential: vi.fn(),
}))

vi.mock('../lib/research-dossiers.js', () => ({
  recordCompletedDossier: mocks.recordCompletedDossier,
}))

import { composeEnrichedTarget, enrichUrlTarget, extractSiteIdentity, runDeepResearchDossier } from '../lib/deep-research'

const HOMEPAGE = `<!DOCTYPE html>
<html lang="en">
<head>
<title>Acme Roofing | Asheville NC Roofing Contractor</title>
<meta name="description" content="Roofing since 1998">
<meta property="og:site_name" content="Acme Roofing">
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"RoofingContractor","name":"Acme Roofing LLC","address":{"@type":"PostalAddress","addressLocality":"Asheville","addressRegion":"NC"}}
</script>
</head>
<body><h1>Roofs that outlast the mortgage</h1></body>
</html>`

const ENRICHED = 'Acme Roofing — Asheville, NC — "Roofing since 1998" — acmeroofing.com'

// Mocked responses use a Map, which matches the headers.get(name) shape the
// code relies on, and expose no body stream so the size cap falls back to text().
function htmlResponse(html, { status = 200, url = 'https://acmeroofing.com/' } = {}) {
  return {
    status,
    url,
    headers: new Map([['content-type', 'text/html; charset=utf-8']]),
    text: async () => html,
  }
}

function redirectResponse(location, url = 'https://acmeroofing.com/') {
  return { status: 301, url, headers: new Map([['location', location]]), text: async () => '' }
}

function useDns() {
  mocks.lookup.mockReset()
  mocks.dnsAnswers = new Map()
  mocks.lookup.mockImplementation(async (host) => {
    const answer = mocks.dnsAnswers.get(String(host))
    if (answer === 'NXDOMAIN') throw new Error('ENOTFOUND')
    return [{ address: answer || '93.184.216.34', family: 4 }]
  })
}

describe('enrichUrlTarget', () => {
  let fetchMock

  beforeEach(() => {
    useDns()
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('passes a non-URL target through untouched with no fetch and no DNS lookup', async () => {
    for (const target of ['Acme Roofing, Asheville NC', 'Mike Vallotton', 'J.D. Power & Associates', 'Smith Co.', '']) {
      const result = await enrichUrlTarget(target)
      expect(result.target).toBe(target.trim())
      expect(result.enriched).toBe(false)
      expect(result.fields).toBeNull()
    }
    expect(fetchMock).not.toHaveBeenCalled()
    expect(mocks.lookup).not.toHaveBeenCalled()
  })

  it('enriches a bare domain from the fetched homepage', async () => {
    fetchMock.mockResolvedValue(htmlResponse(HOMEPAGE))
    const result = await enrichUrlTarget('acmeroofing.com')

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock.mock.calls[0][0]).toBe('https://acmeroofing.com/')
    expect(fetchMock.mock.calls[0][1].redirect).toBe('manual')
    expect(fetchMock.mock.calls[0][1].headers['User-Agent']).toMatch(/Farrington/)

    expect(result.enriched).toBe(true)
    expect(result.original).toBe('acmeroofing.com')
    expect(result.target).toBe(ENRICHED)
    expect(result.fields.businessName).toBe('Acme Roofing')
    expect(result.fields.h1).toBe('Roofs that outlast the mortgage')
  })

  it('follows a redirect to another public host', async () => {
    fetchMock
      .mockResolvedValueOnce(redirectResponse('https://www.acmeroofing.com/'))
      .mockResolvedValueOnce(htmlResponse(HOMEPAGE, { url: 'https://www.acmeroofing.com/' }))
    const result = await enrichUrlTarget('https://acmeroofing.com')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.enriched).toBe(true)
    expect(result.target).toBe(ENRICHED)
  })

  it('blocks private, loopback, metadata and non-http targets without fetching', async () => {
    const blocked = [
      'http://localhost:3000/',
      'http://127.0.0.1/',
      'http://127.9.9.9/',
      'http://0.0.0.0/',
      'http://10.0.0.5/admin',
      'http://127.0.0.1/',
      'http://172.16.4.2/',
      'http://172.31.255.1/',
      'http://169.254.169.254/latest/meta-data/',
      'http://100.100.100.200/',
      'http://[::1]/',
      'http://[fd00::1]/',
      'http://[fe80::1]/',
      'http://metadata.google.internal/',
      'http://box.internal/',
      'http://nas.local/',
      'ftp://acmeroofing.com/',
      'file:///etc/passwd',
      'http://user:redacted@example.invalid/',
      'http://acmeroofing.com:22/',
    ]
    for (const target of blocked) {
      const result = await enrichUrlTarget(target)
      expect(result.target, target).toBe(target)
      expect(result.enriched, target).toBe(false)
    }
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('blocks a public hostname that resolves to a private address', async () => {
    mocks.dnsAnswers.set('acmeroofing.com', '169.254.169.254')
    const result = await enrichUrlTarget('acmeroofing.com')
    expect(mocks.lookup).toHaveBeenCalled()
    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.target).toBe('acmeroofing.com')
    expect(result.enriched).toBe(false)
  })

  it('returns the original target when DNS does not resolve', async () => {
    mocks.dnsAnswers.set('acmeroofing.com', 'NXDOMAIN')
    const result = await enrichUrlTarget('acmeroofing.com')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.target).toBe('acmeroofing.com')
  })

  it('refuses a redirect that lands on a private host', async () => {
    fetchMock.mockResolvedValueOnce(redirectResponse('http://169.254.169.254/latest/meta-data/'))
    const result = await enrichUrlTarget('acmeroofing.com')
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(result.target).toBe('acmeroofing.com')
    expect(result.enriched).toBe(false)
  })

  it('returns the original target when the fetch times out or the site is down', async () => {
    fetchMock.mockRejectedValue(Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' }))
    const timedOut = await enrichUrlTarget('acmeroofing.com')
    expect(timedOut.target).toBe('acmeroofing.com')
    expect(timedOut.enriched).toBe(false)

    fetchMock.mockResolvedValue(htmlResponse('', { status: 503 }))
    const down = await enrichUrlTarget('acmeroofing.com')
    expect(down.target).toBe('acmeroofing.com')
    expect(down.enriched).toBe(false)
  })

  it('returns the original target when the HTML yields nothing usable', async () => {
    fetchMock.mockResolvedValue(htmlResponse('<html><body><p>hi</p></body></html>'))
    const result = await enrichUrlTarget('acmeroofing.com')
    expect(result.target).toBe('acmeroofing.com')
    expect(result.enriched).toBe(false)
  })
})

describe('extractSiteIdentity / composeEnrichedTarget', () => {
  it('reads title, description, og:site_name, h1 and schema.org address', () => {
    const fields = extractSiteIdentity(HOMEPAGE, 'https://www.acmeroofing.com/')
    expect(fields.hostname).toBe('acmeroofing.com')
    expect(fields.title).toBe('Acme Roofing | Asheville NC Roofing Contractor')
    expect(fields.description).toBe('Roofing since 1998')
    expect(fields.ogSiteName).toBe('Acme Roofing')
    expect(fields.h1).toBe('Roofs that outlast the mortgage')
    expect(fields.location).toBe('Asheville, NC')
    expect(composeEnrichedTarget(fields)).toBe(ENRICHED)
  })

  it('falls back to a visible city/state when there is no structured data', () => {
    const html = '<html><head><title>Blue Ridge Cabinets - Handmade Kitchens</title></head><body><p>Visit our shop in Weaverville, NC 28787.</p></body></html>'
    const fields = extractSiteIdentity(html, 'https://blueridgecabinets.com/')
    expect(fields.businessName).toBe('Blue Ridge Cabinets')
    expect(fields.location).toBe('Weaverville, NC')
    expect(composeEnrichedTarget(fields)).toContain('Blue Ridge Cabinets — Weaverville, NC 28787')
  })

  it('returns an empty string when only the hostname is known', () => {
    expect(composeEnrichedTarget(extractSiteIdentity('<html></html>', 'https://acmeroofing.com/'))).toBe('')
    expect(composeEnrichedTarget(null)).toBe('')
  })
})

describe('runDeepResearchDossier target handling', () => {
  let fetchMock
  const originalEnv = { ...process.env }

  beforeEach(() => {
    useDns()
    mocks.recordCompletedDossier.mockReset()
    process.env.DEERFLOW_API_BASE_URL = 'http://127.0.0.1:8000'
    delete process.env.PERPLEXITY_API_KEY
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    process.env = { ...originalEnv }
  })

  function jsonResponse(body) {
    return { ok: true, status: 200, url: '', headers: new Map(), text: async () => JSON.stringify(body), json: async () => body }
  }

  function deerflowFetch(onHomepage) {
    return async (url) => {
      const href = String(url)
      if (href === 'https://acmeroofing.com/') return onHomepage()
      if (href.endsWith('/api/threads')) return jsonResponse({ thread_id: 'thread_1' })
      if (href.includes('/runs/stream')) return jsonResponse({})
      if (href.endsWith('/state')) {
        return jsonResponse({ messages: [{ role: 'assistant', content: '{"executiveSummary":"ok","riskLevel":"low","confidence":"high","sources":[]}' }] })
      }
      throw new Error(`unexpected fetch ${href}`)
    }
  }

  it('researches the enriched target but stores the original target', async () => {
    fetchMock.mockImplementation(deerflowFetch(() => htmlResponse(HOMEPAGE)))

    const payload = await runDeepResearchDossier({ target: 'acmeroofing.com', usePerplexity: false, source: 'test' })

    expect(payload.target).toBe('acmeroofing.com')
    expect(payload.enrichedTarget).toBe(ENRICHED)
    expect(payload.targetEnrichment.fields.businessName).toBe('Acme Roofing')

    const streamCall = fetchMock.mock.calls.find(call => String(call[0]).includes('/runs/stream'))
    expect(streamCall[1].body).toContain('Acme Roofing — Asheville, NC')

    expect(mocks.recordCompletedDossier).toHaveBeenCalledOnce()
    expect(mocks.recordCompletedDossier.mock.calls[0][0].target).toBe('acmeroofing.com')
  })

  it('still runs when enrichment fails and keeps the original target everywhere', async () => {
    fetchMock.mockImplementation(deerflowFetch(() => { throw new Error('ECONNREFUSED') }))

    const payload = await runDeepResearchDossier({ target: 'acmeroofing.com', usePerplexity: false, source: 'test' })
    expect(payload.target).toBe('acmeroofing.com')
    expect(payload.enrichedTarget).toBe('acmeroofing.com')
    expect(payload.targetEnrichment).toBeNull()
    expect(mocks.recordCompletedDossier.mock.calls[0][0].target).toBe('acmeroofing.com')
  })
})
