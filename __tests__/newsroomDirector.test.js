import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  NEWSROOM_DIRECTOR_TOOLS,
  callNewsroomPlatform,
  callNewspaperSite,
  listNewsroomPapers,
  planReporterAssignments,
  resolveNewsroomPaper,
} from '@/lib/newsroom-director'
import { PRESET_BY_ID } from '@/lib/agent-presets'

const ORIGINAL_ENV = { ...process.env }

beforeEach(() => {
  process.env.NEWSROOM_AIOS_BASE_URL = 'https://newsroom.example.test'
  process.env.NEWSROOM_AIOS_ALLOWED_HOSTS = 'newsroom.example.test'
  process.env.NEWSROOM_AIOS_WNC_TENANT_ID = 'wnc-tenant'
  process.env.NEWSROOM_AIOS_WNC_API_KEY = 'wnc-secret-key'
  process.env.NEWSROOM_AIOS_OCEANSIDE_TENANT_ID = 'oceanside-tenant'
  process.env.NEWSROOM_AIOS_OCEANSIDE_API_KEY = 'oceanside-secret-key'
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
  vi.restoreAllMocks()
})

describe('Newsroom Director paper isolation', () => {
  it('resolves aliases to the correct tenant without exposing keys in public listings', () => {
    expect(resolveNewsroomPaper('WNC Times')).toMatchObject({ id: 'wnc', tenantId: 'wnc-tenant' })
    expect(resolveNewsroomPaper('Oceanside News')).toMatchObject({ id: 'oceanside', tenantId: 'oceanside-tenant' })

    const publicListing = JSON.stringify(listNewsroomPapers())
    expect(publicListing).not.toContain('wnc-secret-key')
    expect(publicListing).not.toContain('oceanside-secret-key')
  })

  it('sends only the selected paper tenant headers to Newsroom AIOS', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))

    await callNewsroomPlatform('oceanside', '/api/support/status')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe('https://newsroom.example.test/api/support/status')
    expect(options.headers['X-Tenant-ID']).toBe('oceanside-tenant')
    expect(options.headers['X-API-Key']).toBe('oceanside-secret-key')
    expect(options.headers['X-API-Key']).not.toBe('wnc-secret-key')
  })

  it('uses tenant authentication for protected newspaper-side Director routes', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))

    await callNewspaperSite('wnc', '/api/admin/director/assignments')

    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe('https://wnctimes.com/api/admin/director/assignments')
    expect(options.headers['X-Tenant-ID']).toBe('wnc-tenant')
    expect(options.headers['X-API-Key']).toBe('wnc-secret-key')
  })

  it('refuses to send credentials to an unapproved host', async () => {
    process.env.NEWSROOM_AIOS_WNC_SITE_URL = 'https://attacker.example.test'
    const fetchMock = vi.spyOn(globalThis, 'fetch')

    await expect(callNewspaperSite('wnc', '/api/admin/director/assignments'))
      .rejects.toThrow(/not an approved credential host/i)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('Newsroom Director agent preset', () => {
  it('uses OpenClaw and exposes preview plus guarded assignment tools', () => {
    const preset = PRESET_BY_ID['newsroom-director']
    expect(preset.runtimeProvider).toBe('openclaw-hetzner')
    expect(preset.voice).toEqual({
      provider: 'chirp3',
      chirp3Model: 'chirp3-hd',
      chirp3Voice: 'en-US-Chirp3-HD-Aoede',
    })
    expect(preset.voiceProfile).toMatch(/female newsroom operator/i)
    expect(preset.avatarPrompt).toMatch(/female executive editor/i)
    expect(preset.tools).toContain('newsroom_preview_reporter_assignments')
    expect(preset.tools).toContain('newsroom_apply_reporter_assignments')
    expect(NEWSROOM_DIRECTOR_TOOLS.newsroom_apply_reporter_assignments).toBeDefined()
  })

  it('checks for an open duplicate before creating a support ticket', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      tickets: [{ id: 'ticket-1', subject: 'Article images missing', status: 'open' }],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))

    const result = await NEWSROOM_DIRECTOR_TOOLS.newsroom_create_support_ticket.run({
      paper: 'wnc',
      subject: 'Article images missing',
      message: 'Images are not rendering.',
    })

    expect(result.created).toBe(false)
    expect(result.duplicate.id).toBe('ticket-1')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('Newsroom Director reporter assignment planning', () => {
  const reporters = [
    { id: 'sports-reporter', displayName: 'Sam Sports' },
    { id: 'civic-reporter', displayName: 'Casey Civic' },
  ]

  it('matches explicit category specialties and balances repeated assignments', () => {
    const result = planReporterAssignments({
      reporters,
      reporterCategories: {
        'sports-reporter': ['Sports'],
        'civic-reporter': ['Government'],
      },
      articles: [
        { id: 'a1', title: 'Friday game', category: 'Sports', author: 'Staff' },
        { id: 'a2', title: 'Council meeting', category: 'Government', author: 'Unknown' },
        { id: 'a3', title: 'Weekend tournament', category: 'Sports', author: 'Imported Author' },
      ],
    })

    expect(result.proposals).toHaveLength(3)
    expect(result.proposals.find(item => item.articleId === 'a1').proposedReporterId).toBe('sports-reporter')
    expect(result.proposals.find(item => item.articleId === 'a2').proposedReporterId).toBe('civic-reporter')
    expect(result.proposals.find(item => item.articleId === 'a3').proposedReporterId).toBe('sports-reporter')
  })

  it('does not propose changes to assigned articles unless explicitly requested', () => {
    const result = planReporterAssignments({
      reporters,
      articles: [
        { id: 'assigned', title: 'Assigned story', category: 'Sports', authorId: 'sports-reporter', author: 'Sam Sports' },
        { id: 'open', title: 'Open story', category: 'Sports', author: 'Staff' },
      ],
    })

    expect(result.proposals.map(item => item.articleId)).toEqual(['open'])
    expect(result.summary.onlyUnassigned).toBe(true)
  })

  it('limits the plan and reports when category specialties were inferred', () => {
    const result = planReporterAssignments({
      reporters,
      maxChanges: 1,
      articles: [
        { id: 'history', title: 'Prior game', category: 'Sports', authorId: 'sports-reporter', author: 'Sam Sports' },
        { id: 'open-1', title: 'Open one', category: 'Sports', author: 'Staff' },
        { id: 'open-2', title: 'Open two', category: 'Sports', author: 'Staff' },
      ],
    })

    expect(result.proposals).toHaveLength(1)
    expect(result.proposals[0].proposedReporterId).toBe('sports-reporter')
    expect(result.warnings[0]).toMatch(/inferred/i)
  })
})
