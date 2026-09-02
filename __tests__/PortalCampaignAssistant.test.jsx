import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import PortalCampaignAssistant from '../app/portal/campaign-assistant/CampaignAssistantClient'

vi.mock('../app/portal/PortalNav', () => ({
  default: ({ companyName }) => <nav aria-label="Customer portal">{companyName}</nav>,
}))

const campaign = {
  id: 'camp_portal_1',
  name: 'Acme Heating — seven-day social campaign',
  status: 'draft',
  platform: 'Facebook',
  posts: Array.from({ length: 7 }, (_, index) => ({
    id: `post_${index + 1}`,
    sequence: index + 1,
    platform: 'Facebook',
    status: 'draft',
    scheduledFor: `2026-07-${String(index + 17).padStart(2, '0')}T14:00:00.000Z`,
    hook: index === 0 ? 'A better spring start' : `Facebook idea ${index + 1}`,
    body: 'Useful campaign copy for local homeowners.',
    cta: 'Request an estimate',
  })),
}

describe('Portal Campaign Assistant page', () => {
  let fetchMock

  beforeEach(() => {
    window.history.replaceState({}, '', '/portal/campaign-assistant')
    fetchMock = vi.fn(async (url, options = {}) => {
      if (url === '/api/portal/me') {
        return { json: async () => ({ ok: true, user: { companyName: 'Acme Heating' } }) }
      }
      if (url === '/api/portal/campaign-assistant/delivery' && options.method === 'POST') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ok: true,
            status: 'approved',
            message: 'All seven social drafts are approved.',
            campaign: {
              ...campaign,
              status: 'approved',
              posts: campaign.posts.map(post => ({ ...post, status: 'approved' })),
            },
          }),
        }
      }
      if (url === '/api/portal/campaign-assistant' && options.method === 'POST') {
        return {
          status: 201,
          json: async () => ({
            ok: true,
            assistantMessage: 'Your seven-day social campaign is ready as a draft.',
            campaign,
          }),
        }
      }
      if (url === '/api/portal/campaign-assistant/delivery') {
        return {
          json: async () => ({
            ok: true,
            channels: [
              { id: 'facebook_one', provider: 'facebook', name: 'Acme Facebook' },
              { id: 'instagram_one', provider: 'instagram', name: 'Acme Instagram' },
            ],
          }),
        }
      }
      if (url === '/api/portal/social/facebook/connect' && options.method === 'POST') {
        return {
          status: 502,
          json: async () => ({ ok: false, status: 'provider_unavailable', error: 'Facebook authorization could not start.' }),
        }
      }
      if (url === '/api/portal/social/facebook/connect') {
        return { json: async () => ({ ok: true, status: 'disconnected' }) }
      }
      return { json: async () => ({ ok: true, campaigns: [] }) }
    })
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    window.history.replaceState({}, '', '/portal/campaign-assistant')
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('prefills a campaign request handed off by Cheryl without submitting or charging it', async () => {
    window.history.replaceState({}, '', '/portal/campaign-assistant?request=Promote%20our%20spring%20service')
    render(<PortalCampaignAssistant />)

    expect(await screen.findByDisplayValue('Promote our spring service')).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false)
  })

  it('accepts one chat request and renders all seven social drafts for review', async () => {
    render(<PortalCampaignAssistant />)

    expect(await screen.findByRole('heading', { name: 'Campaign Assistant', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /Acme Facebook/i })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /Acme Instagram/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Connect Facebook' })).toBeInTheDocument()
    const request = screen.getByLabelText('Describe your campaign')
    fireEvent.change(request, {
      target: { value: 'Promote spring HVAC service to homeowners around Asheville.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Build 7-day campaign' }))

    expect(await screen.findByText('Your seven-day social campaign is ready as a draft.')).toBeInTheDocument()
    expect(screen.getByText('A better spring start')).toBeInTheDocument()
    expect(screen.getAllByText('Draft · not published')).toHaveLength(7)
    expect(screen.getByText('Acme Heating — seven-day social campaign')).toBeInTheDocument()

    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(([, options]) => options?.method === 'POST')
      expect(JSON.parse(postCall[1].body)).toEqual({
        message: 'Promote spring HVAC service to homeowners around Asheville.',
        requestId: expect.any(String),
      })
    })
  })

  it('preserves the inline Facebook OAuth start path beside mapped channel selection', async () => {
    const popup = { close: vi.fn(), location: { href: '' } }
    vi.spyOn(window, 'open').mockReturnValue(popup)
    render(<PortalCampaignAssistant />)

    fireEvent.click(await screen.findByRole('button', { name: 'Connect Facebook' }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/portal/social/facebook/connect', { method: 'POST' })
      expect(window.open).toHaveBeenCalledWith(
        'about:blank',
        'farrington-facebook-connect',
        'popup,width=760,height=820'
      )
      expect(popup.close).toHaveBeenCalled()
    })
    expect(screen.getByText('Facebook authorization could not start.')).toBeInTheDocument()
  })

  it('includes the client-selected connected channels in campaign actions', async () => {
    render(<PortalCampaignAssistant />)

    fireEvent.click(await screen.findByRole('checkbox', { name: /Acme Instagram/i }))
    fireEvent.change(screen.getByLabelText('Describe your campaign'), {
      target: { value: 'Promote spring HVAC service to homeowners around Asheville.' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Build 7-day campaign' }))
    await screen.findByText('Acme Heating — seven-day social campaign')
    fireEvent.click(screen.getByRole('button', { name: 'Approve 7 drafts' }))

    await waitFor(() => {
      const actionCall = fetchMock.mock.calls.find(([url, options]) => (
        url === '/api/portal/campaign-assistant/delivery' && options?.method === 'POST'
      ))
      expect(JSON.parse(actionCall[1].body)).toMatchObject({
        campaignId: 'camp_portal_1',
        action: 'approve_campaign',
        channelIds: ['instagram_one'],
      })
    })
  })
})
