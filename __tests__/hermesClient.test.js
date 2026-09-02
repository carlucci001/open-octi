import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const ORIGINAL_ENV = { ...process.env }

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV, HERMES_API_SERVER_KEY: 'test-hermes-key' }
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
  vi.useRealTimers()
})

describe('hermesChat', () => {
  it('sends an authenticated profile-targeted OpenAI-compatible request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      model: 'hermes-agent',
      choices: [{ message: { role: 'assistant', content: 'foreman wired.' } }],
      usage: { prompt_tokens: 4, completion_tokens: 3 },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    const { hermesChat } = await import('@/lib/hermes-client')

    const result = await hermesChat({
      profile: 'foreman',
      messages: [{ role: 'user', content: 'Reply exactly.' }],
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe('http://127.0.0.1:8642/p/foreman/v1/chat/completions')
    expect(options.method).toBe('POST')
    expect(options.headers.Authorization).toBe('Bearer test-hermes-key')
    expect(JSON.parse(options.body)).toEqual({
      model: 'hermes-agent',
      messages: [{ role: 'user', content: 'Reply exactly.' }],
      stream: false,
    })
    expect(options.signal).toBeInstanceOf(AbortSignal)
    expect(result).toEqual({
      text: 'foreman wired.',
      model: 'hermes-agent',
      profile: 'foreman',
      usage: { prompt_tokens: 4, completion_tokens: 3 },
    })
  })

  it('rejects profiles outside the five-agent Hermes roster before fetching', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { hermesChat } = await import('@/lib/hermes-client')

    await expect(hermesChat({ profile: '../default', messages: [{ role: 'user', content: 'hello' }] }))
      .rejects.toThrow('Unsupported Hermes profile')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('surfaces an honest HTTP error without a fallback', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: { message: 'profile unavailable' },
    }), { status: 503, headers: { 'Content-Type': 'application/json' } })))
    const { hermesChat } = await import('@/lib/hermes-client')

    await expect(hermesChat({ profile: 'nightwatch', messages: [{ role: 'user', content: 'hello' }] }))
      .rejects.toThrow('Hermes nightwatch returned HTTP 503: profile unavailable')
  })

  it('surfaces a wrong-port transport failure without hanging', async () => {
    const { hermesChat } = await import('@/lib/hermes-client')

    await expect(hermesChat({
      profile: 'ledger',
      messages: [{ role: 'user', content: 'hello' }],
      baseUrl: 'http://127.0.0.1:1',
    })).rejects.toThrow(/Hermes ledger request failed:/)
  })

  it('aborts at the configured timeout boundary', async () => {
    vi.stubGlobal('fetch', vi.fn((url, options) => new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    })))
    const { hermesChat } = await import('@/lib/hermes-client')

    await expect(hermesChat({
      profile: 'checker',
      messages: [{ role: 'user', content: 'hello' }],
      timeoutMs: 20,
    })).rejects.toThrow('Hermes checker timed out after 20ms')
  })

  it('requires a server-side Bearer key', async () => {
    delete process.env.HERMES_API_SERVER_KEY
    process.env.HERMES_ENV_FILE = 'C:/definitely-missing-hermes.env'
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { hermesChat } = await import('@/lib/hermes-client')

    await expect(hermesChat({ profile: 'scribe', messages: [{ role: 'user', content: 'hello' }] }))
      .rejects.toThrow('Hermes API Bearer key is not configured')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('uses the authenticated Hermes dashboard plugin REST surface for kanban', async () => {
    process.env.HERMES_DASHBOARD_SESSION_TOKEN = 'dashboard-session-test-token'
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ columns: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
    vi.stubGlobal('fetch', fetchMock)
    const { hermesKanbanRequest } = await import('@/lib/hermes-client')

    await expect(hermesKanbanRequest({ path: '/board', query: { tenant: 'command-center-build' } })).resolves.toEqual({ columns: [] })
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe('http://127.0.0.1:9119/api/plugins/kanban/board?tenant=command-center-build')
    expect(options.headers['X-Hermes-Session-Token']).toBe('dashboard-session-test-token')
    expect(options.cache).toBe('no-store')
  })

  it('logs into the gated dashboard with credentials and carries the session cookie', async () => {
    delete process.env.HERMES_DASHBOARD_SESSION_TOKEN
    process.env.HERMES_DASHBOARD_USERNAME = 'carl'
    process.env.HERMES_DASHBOARD_PASSWORD = 'test-dashboard-password'
    const loginHeaders = new Headers({ 'Content-Type': 'application/json' })
    loginHeaders.append('Set-Cookie', 'hermes_session_at=at-value; HttpOnly; Path=/')
    loginHeaders.append('Set-Cookie', 'hermes_session_rt=rt-value; HttpOnly; Path=/')
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, next: '/' }), { status: 200, headers: loginHeaders }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ columns: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    const { hermesKanbanRequest, clearHermesDashboardSession } = await import('@/lib/hermes-client')
    clearHermesDashboardSession()

    await expect(hermesKanbanRequest({ path: '/board', query: { tenant: 'command-center-build' } })).resolves.toEqual({ columns: [] })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const [loginUrl, loginOptions] = fetchMock.mock.calls[0]
    expect(loginUrl).toBe('http://127.0.0.1:9119/auth/password-login')
    expect(JSON.parse(loginOptions.body)).toEqual({ provider: 'basic', username: 'carl', password: 'test-dashboard-password' })
    const [kanbanUrl, kanbanOptions] = fetchMock.mock.calls[1]
    expect(kanbanUrl).toBe('http://127.0.0.1:9119/api/plugins/kanban/board?tenant=command-center-build')
    expect(kanbanOptions.headers.Cookie).toContain('hermes_session_at=at-value')
    expect(kanbanOptions.headers.Cookie).toContain('hermes_session_rt=rt-value')
    expect(kanbanOptions.headers['X-Hermes-Session-Token']).toBeUndefined()
    clearHermesDashboardSession()
  })

  it('re-logs-in exactly once when the cookie session is rejected', async () => {
    delete process.env.HERMES_DASHBOARD_SESSION_TOKEN
    process.env.HERMES_DASHBOARD_USERNAME = 'carl'
    process.env.HERMES_DASHBOARD_PASSWORD = 'test-dashboard-password'
    const mkLogin = (cookie) => {
      const headers = new Headers({ 'Content-Type': 'application/json' })
      headers.append('Set-Cookie', `hermes_session_at=${cookie}; HttpOnly; Path=/`)
      return new Response(JSON.stringify({ ok: true, next: '/' }), { status: 200, headers })
    }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(mkLogin('stale'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'unauthenticated' }), { status: 401, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(mkLogin('fresh'))
      .mockResolvedValueOnce(new Response(JSON.stringify({ columns: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    const { hermesKanbanRequest, clearHermesDashboardSession } = await import('@/lib/hermes-client')
    clearHermesDashboardSession()

    await expect(hermesKanbanRequest({ path: '/board' })).resolves.toEqual({ columns: [] })
    expect(fetchMock).toHaveBeenCalledTimes(4)
    const [, retryOptions] = fetchMock.mock.calls[3]
    expect(retryOptions.headers.Cookie).toContain('hermes_session_at=fresh')
    clearHermesDashboardSession()
  })
})
