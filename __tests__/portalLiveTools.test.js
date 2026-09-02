import fs from 'fs'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PORTAL_LIVE_TOOL_DECLARATIONS, resolvePortalLiveTool } from '../lib/portal-live-tools'

describe('Cheryl portal live tools', () => {
  it('exposes navigation, tracked-request routing, and the six account tools', async () => {
    expect(PORTAL_LIVE_TOOL_DECLARATIONS.map(item => item.name)).toEqual([
      'open_portal_section',
      'start_service_request',
      'get_account_context',
      'list_services',
      'request_service',
      // Paints cards beside the conversation. UI only — never orders or charges.
      'surface_service_cards',
      'create_work_order',
      'get_work_status',
    ])
    await expect(resolvePortalLiveTool('open_portal_section', { section: 'billing' })).resolves.toMatchObject({ ok: true, href: '/portal/billing' })
    await expect(resolvePortalLiveTool('start_service_request', { service: 'legal-document' })).resolves.toMatchObject({ ok: true, href: '/portal/support?service=legal-document#new-support-request' })
  })

  it('rejects arbitrary paths, services, and business actions', async () => {
    expect((await resolvePortalLiveTool('open_portal_section', { section: 'https://evil.example' })).ok).toBe(false)
    expect((await resolvePortalLiveTool('start_service_request', { service: '../billing' })).ok).toBe(false)
    expect((await resolvePortalLiveTool('publish_campaign', {})).ok).toBe(false)
  })

  describe('account tools', () => {
    const originalFetch = global.fetch

    beforeEach(() => {
      global.fetch = vi.fn()
    })
    afterEach(() => {
      global.fetch = originalFetch
    })

    it('calls the portal actions API with credentials for each account tool', async () => {
      global.fetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true, services: [] }) })
      const result = await resolvePortalLiveTool('list_services', {})
      expect(global.fetch).toHaveBeenCalledWith('/api/portal/concierge/actions', expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ tool: 'list_services', args: {} }),
      }))
      expect(result).toMatchObject({ ok: true, services: [] })
    })

    it('surfaces a safe failure message when the actions API rejects the call', async () => {
      global.fetch.mockResolvedValue({ ok: false, json: async () => ({ ok: false, error: 'Not signed in' }) })
      const result = await resolvePortalLiveTool('request_service', { serviceId: 'x' })
      expect(result).toMatchObject({ ok: false, message: 'Not signed in' })
    })

    it('never crashes the voice turn when the network call throws', async () => {
      global.fetch.mockRejectedValue(new Error('network down'))
      const result = await resolvePortalLiveTool('get_work_status', {})
      expect(result.ok).toBe(false)
    })
  })

  it('returns Gemini tool responses and defers navigation until the spoken turn completes', () => {
    const source = fs.readFileSync(path.join(process.cwd(), 'app/portal/components/PortalLiveVoice.jsx'), 'utf8')
    expect(source).toContain('message.toolCall?.functionCalls')
    expect(source).toContain('toolResponse: { functionResponses }')
    expect(source).toContain('session.pendingNavigation')
  })
})
