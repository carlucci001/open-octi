import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ user: { role: 'owner' }, auth: vi.fn(), run: vi.fn(), open: vi.fn() }))
vi.mock('../lib/auth', () => ({ getCurrentUser: mocks.auth }))
vi.mock('../lib/monitoring/runtime', () => ({ runScheduledMonitoring: mocks.run }))
vi.mock('../lib/monitoring/history', () => ({ openMonitoringHistory: mocks.open }))
import { GET, POST } from '../app/api/platform-admin/v1/monitoring/route'

describe('monitoring operator endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.user = { role: 'owner' }
    mocks.auth.mockImplementation(async (request) => {
      request.headers.get('cookie')
      return mocks.user
    })
  })
  it('rejects members before accessing history or running checks', async () => {
    mocks.user = { role: 'member' }
    const request = new Request('https://example.test/api/platform-admin/v1/monitoring')
    expect((await GET(request)).status).toBe(403)
    expect((await POST(request)).status).toBe(403)
    expect(mocks.auth).toHaveBeenCalledWith(request)
    expect(mocks.run).not.toHaveBeenCalled()
    expect(mocks.open).not.toHaveBeenCalled()
  })
  it('reads only this installation history and closes it', async () => {
    const close = vi.fn()
    mocks.open.mockReturnValue({ latest: () => ({ status: 'healthy' }), list: () => [], close })
    const request = new Request('https://example.test/api/platform-admin/v1/monitoring')
    expect((await (await GET(request)).json()).latest.status).toBe('healthy')
    expect(mocks.auth).toHaveBeenCalledWith(request)
    expect(close).toHaveBeenCalledOnce()
  })
  it('does not accept a client-supplied manifest or destination', async () => {
    mocks.run.mockResolvedValue({ ok: false, busy: true })
    expect((await POST(new Request('https://example.test/api/platform-admin/v1/monitoring', { method: 'POST', body: '{"url":"https://attacker.test"}' }))).status).toBe(409)
    expect(mocks.run).toHaveBeenCalledWith()
  })
})
