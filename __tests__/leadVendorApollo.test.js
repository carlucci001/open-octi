// Fixtures are real rows from Carl's own run (actor T1XDXWc1L92AfIJtd, run
// emMobGbRIPEk1vU3N, 2026-08-06) — including the banner row the actor emits
// as if it were a person, and the fact that a run scoped to Asheville, North
// Carolina came back with 20 leads and none of them in NC.
import { describe, expect, it, vi } from 'vitest'
import {
  parseLocation,
  isApolloLeadRow,
  apolloRowMatchesLocation,
  apolloRowToPlace,
  resolveLeadVendorConfig,
  getLeadVendorAdapter,
} from '../lib/lead-vendors'

const BANNER = { fullName: '🟢 Industry filter is now working properly' }

const SF_LEAD = {
  employee_id: '42617447',
  fullName: 'Russell Sherman',
  title: 'Co-founder & CTO',
  email: 'personal@example.invalid',
  all_emails: 'personal@example.invalid, personal@example.invalid',
  phone_numbers: 'PHONE_REDACTED, 9892255375',
  organizationName: 'VISO Trust',
  organizationAddress: 'PO Box 193152',
  organizationCity: 'San Francisco',
  organizationState: 'CA',
  organizationZipcode: '94119',
  organizationPhone: '+18053019014',
  organizationWebsite: 'https://visotrust.com',
  linkedinUrl: 'https://www.linkedin.com/in/neverenoughinfo',
  organizationIndustry: 'Computer and Network Security',
  organizationRevenue: '5 - 10 Million',
}

const AVL_LEAD = {
  ...SF_LEAD,
  employee_id: '99',
  fullName: 'Jane Roberts',
  email: 'redacted@example.invalid',
  organizationName: 'Blue Ridge Digital',
  organizationCity: 'Asheville',
  organizationState: 'NC',
  organizationPhone: 'N/A',
  phone_numbers: '',
}

// Mocks the async start→poll→dataset protocol the adapter now uses (run-sync
// killed a statewide pull TIMED-OUT at its 240s ceiling on 2026-08-14).
// Start responds SUCCEEDED so tests never sleep on the poll loop.
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json' },
})
function apolloActorMock(items, capture = {}) {
  return async (url, opts) => {
    const u = String(url)
    if (u.includes('/acts/') && u.includes('/runs?')) {
      capture.body = JSON.parse(opts.body)
      return json({ data: { id: 'run_test', status: 'SUCCEEDED', defaultDatasetId: 'ds_test' } }, 201)
    }
    if (u.includes('/actor-runs/')) return json({ data: { status: 'SUCCEEDED' } })
    if (u.includes('/datasets/ds_test/')) return json(items)
    throw new Error(`unexpected fetch ${u}`)
  }
}

describe('apollo lead vendor', () => {
  it('normalizes the server-enforced paid-search cap', () => {
    expect(resolveLeadVendorConfig({ provider: 'apollo', maxPaidBatches: 2 }).maxPaidBatches).toBe(2)
    expect(resolveLeadVendorConfig({ provider: 'apollo', maxPaidBatches: 0 }).maxPaidBatches).toBe(1)
    expect(resolveLeadVendorConfig({ provider: 'apollo', maxPaidBatches: 99 }).maxPaidBatches).toBe(6)
  })

  it('drops the actor status banner instead of filing it as a person', () => {
    expect(isApolloLeadRow(BANNER)).toBe(false)
    expect(isApolloLeadRow(SF_LEAD)).toBe(true)
  })

  it('parses locations the sweep actually passes', () => {
    expect(parseLocation('Asheville, NC')).toEqual({ city: 'Asheville', state: 'North Carolina', postalCodes: [] })
    expect(parseLocation('Asheville, North Carolina')).toEqual({ city: 'Asheville', state: 'North Carolina', postalCodes: [] })
    expect(parseLocation('Asheville')).toEqual({ city: 'Asheville', state: '', postalCodes: [] })
    expect(parseLocation('28801, 28803').postalCodes).toEqual(['28801', '28803'])
  })

  it('refuses to run when a location cannot become postal codes', async () => {
    const config = resolveLeadVendorConfig({ provider: 'apollo' })
    const original = globalThis.fetch
    globalThis.fetch = async () => new Response('{}', { status: 404 })
    try {
      await expect(getLeadVendorAdapter(config).findBusinesses(
        { query: 'plumbing', location: 'Nowheresville, NC', maxItems: 25 },
        config,
        'k',
      )).rejects.toThrow(/postal codes/i)
    } finally {
      globalThis.fetch = original
    }
  })

  it('rejects the out-of-area leads the vendor filter let through', () => {
    const target = { city: 'Asheville', state: 'North Carolina' }
    expect(apolloRowMatchesLocation(SF_LEAD, target)).toBe(false)
    expect(apolloRowMatchesLocation(AVL_LEAD, target)).toBe(true)
  })

  it('matches a two-letter state abbreviation against the full state name', () => {
    expect(apolloRowMatchesLocation(AVL_LEAD, { city: '', state: 'North Carolina' })).toBe(true)
    expect(apolloRowMatchesLocation(SF_LEAD, { city: '', state: 'North Carolina' })).toBe(false)
  })

  it('maps a person onto the keys the sweep normalizer reads', () => {
    const place = apolloRowToPlace(SF_LEAD)
    expect(place.businessName).toBe('VISO Trust')
    expect(place.contactName).toBe('Russell Sherman')
    expect(place.jobTitle).toBe('Co-founder & CTO')
    expect(place.website).toBe('https://visotrust.com')
    expect(place.address).toBe('PO Box 193152, San Francisco, CA, 94119')
    expect(place.phone).toBe('PHONE_REDACTED')
    expect(place.email).toBe('personal@example.invalid')
  })

  it('flags freemail so a personal address is never mistaken for a work one', () => {
    expect(apolloRowToPlace(SF_LEAD).emailKind).toBe('personal')
    expect(apolloRowToPlace(AVL_LEAD).emailKind).toBe('corporate')
  })

  it('drops an N/A company phone rather than storing the string "N/A"', () => {
    expect(apolloRowToPlace(AVL_LEAD).phone).toBe('')
  })

  it('refuses the whole run when every lead is out of area, rather than importing them', async () => {
    const config = resolveLeadVendorConfig({ provider: 'apollo' })
    const adapter = getLeadVendorAdapter(config)
    const original = globalThis.fetch
    globalThis.fetch = apolloActorMock([BANNER, SF_LEAD])
    try {
      await expect(adapter.findBusinesses(
        { query: 'Computer and Network Security', location: 'Asheville, NC, 28801', maxItems: 25 },
        config,
        'test-key',
      )).rejects.toThrow(/location filter did not apply/i)
    } finally {
      globalThis.fetch = original
    }
  })

  it('returns in-area leads and keeps the banner out of the results', async () => {
    const config = resolveLeadVendorConfig({ provider: 'apollo' })
    const adapter = getLeadVendorAdapter(config)
    const original = globalThis.fetch
    globalThis.fetch = apolloActorMock([BANNER, SF_LEAD, AVL_LEAD])
    try {
      const places = await adapter.findBusinesses(
        { query: 'Computer and Network Security', location: 'Asheville, NC, 28801', maxItems: 25 },
        config,
        'test-key',
      )
      expect(places).toHaveLength(1)
      expect(places[0].businessName).toBe('Blue Ridge Digital')
      expect(places[0].contactName).toBe('Jane Roberts')
    } finally {
      globalThis.fetch = original
    }
  })

  it('caps statewide runs at 100 ZIPs and sends disjoint batches', async () => {
    // "North Carolina" resolves to 1,091 ZIPs; the actor's input schema says
    // companyCityPostalCode maxItems: 100 — exceeding it is an instant HTTP
    // 400 (run lsr_msrz4ij6jwgsbc, 2026-08-13).
    const config = resolveLeadVendorConfig({ provider: 'apollo' })
    const adapter = getLeadVendorAdapter(config)
    const original = globalThis.fetch
    const firstCapture = {}
    const secondCapture = {}
    try {
      globalThis.fetch = apolloActorMock([AVL_LEAD], firstCapture)
      await adapter.findBusinesses(
        { query: 'computer stores', location: 'North Carolina', maxItems: 25, batchIndex: 0 },
        config,
        'test-key',
      )
      globalThis.fetch = apolloActorMock([AVL_LEAD], secondCapture)
      await adapter.findBusinesses(
        { query: 'computer stores', location: 'North Carolina', maxItems: 25, batchIndex: 1 },
        config,
        'test-key',
      )

      expect(firstCapture.body.companyCityPostalCode).toHaveLength(100)
      expect(secondCapture.body.companyCityPostalCode).toHaveLength(100)
      expect(firstCapture.body.companyCityPostalCode.filter(zip => secondCapture.body.companyCityPostalCode.includes(zip))).toHaveLength(0)
    } finally {
      globalThis.fetch = original
    }
  })

  it('does not invoke the paid actor for a second batch when configured ZIPs fit one request', async () => {
    const config = resolveLeadVendorConfig({
      provider: 'apollo',
      postalCodes: Array.from({ length: 50 }, (_, index) => String(28000 + index)),
    })
    const adapter = getLeadVendorAdapter(config)
    const original = globalThis.fetch
    const fetchSpy = vi.fn()
    globalThis.fetch = fetchSpy
    try {
      const rows = await adapter.findBusinesses(
        { query: 'computer stores', location: 'North Carolina', maxItems: 25, batchIndex: 1 },
        config,
        'test-key',
      )
      expect(rows).toEqual([])
      expect(fetchSpy).not.toHaveBeenCalled()
    } finally {
      globalThis.fetch = original
    }
  })

  it('sends only allowed enum industries for a free-text category', async () => {
    const config = resolveLeadVendorConfig({ provider: 'apollo' })
    const adapter = getLeadVendorAdapter(config)
    const original = globalThis.fetch
    const capture = {}
    globalThis.fetch = apolloActorMock([AVL_LEAD], capture)
    try {
      await adapter.findBusinesses(
        { query: 'Computer stores, computer repair, owner, phone, website, email', location: 'Asheville, NC', maxItems: 25 },
        config,
        'test-key',
      )
      expect(capture.body.industry).toContain('IT Services and IT Consulting')
      expect(capture.body.industry).not.toContain('Computer stores')
      expect(capture.body.industry).not.toContain('owner')
    } finally {
      globalThis.fetch = original
    }
  })

  it('refuses when no category term maps to an allowed industry', async () => {
    const config = resolveLeadVendorConfig({ provider: 'apollo' })
    const adapter = getLeadVendorAdapter(config)
    await expect(adapter.findBusinesses(
      { query: 'zzqx blorp', location: 'Asheville, NC', maxItems: 25 },
      config,
      'test-key',
    )).rejects.toThrow(/allowed industry list/)
  })

  it('surfaces the actor\'s error body instead of a bare HTTP status', async () => {
    const config = resolveLeadVendorConfig({ provider: 'apollo' })
    const adapter = getLeadVendorAdapter(config)
    const original = globalThis.fetch
    globalThis.fetch = async () => new Response(JSON.stringify({
      error: { type: 'invalid-input', message: 'Field input.companyCityPostalCode must NOT have more than 100 items' },
    }), { status: 400, headers: { 'Content-Type': 'application/json' } })
    try {
      await expect(adapter.findBusinesses(
        { query: 'plumbing', location: 'Asheville, NC', maxItems: 25 },
        config,
        'test-key',
      )).rejects.toThrow(/HTTP 400 — .*more than 100 items/)
    } finally {
      globalThis.fetch = original
    }
  })

  it('reports a vendor-side timeout with guidance instead of hanging', async () => {
    // Live case 2026-08-14: Apify run D0hR1MTCCJU7Twx9S ended TIMED-OUT.
    const config = resolveLeadVendorConfig({ provider: 'apollo' })
    const adapter = getLeadVendorAdapter(config)
    const original = globalThis.fetch
    globalThis.fetch = async url => {
      if (String(url).includes('/runs?')) {
        return json({ data: { id: 'run_t', status: 'TIMED-OUT', defaultDatasetId: 'ds_t' } }, 201)
      }
      throw new Error(`unexpected fetch ${url}`)
    }
    try {
      await expect(adapter.findBusinesses(
        { query: 'plumbing', location: 'Asheville, NC', maxItems: 25 },
        config,
        'test-key',
      )).rejects.toThrow(/TIMED-OUT.*LEAD_PEOPLE_RUN_TIMEOUT/s)
    } finally {
      globalThis.fetch = original
    }
  })

  it('surfaces the vendor\'s outage banner instead of reporting 0 leads', async () => {
    // Live case 2026-08-14 (run QhNoLaUdsArAl2tUu): dataset of two banner
    // rows, no leads — the second one an apology formatted as a person.
    const config = resolveLeadVendorConfig({ provider: 'apollo' })
    const adapter = getLeadVendorAdapter(config)
    const original = globalThis.fetch
    globalThis.fetch = apolloActorMock([
      BANNER,
      { id: '1', fullName: 'Actor could not process your request. Try again in an hour or contact support if it persists.' },
    ])
    try {
      await expect(adapter.findBusinesses(
        { query: 'computer stores', location: 'North Carolina', maxItems: 25 },
        config,
        'test-key',
      )).rejects.toThrow(/service problem.*Try again in an hour/s)
    } finally {
      globalThis.fetch = original
    }
  })

  it('does not run a website-crawl enrichment pass — Apollo already has the email', async () => {
    const config = resolveLeadVendorConfig({ provider: 'apollo' })
    const contacts = await getLeadVendorAdapter(config).extractContacts(['https://example.com'], config, 'k')
    expect(contacts.size).toBe(0)
  })

  it('leaves the Google Places provider untouched as the default', () => {
    const config = resolveLeadVendorConfig()
    expect(config.provider).toBe('apify')
    expect(config.finderActorId).toBe('compass~crawler-google-places')
  })
})
