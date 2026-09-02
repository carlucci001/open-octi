import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SocialOperatorPanel from '../app/campaign-studio/SocialOperatorPanel'

const config = {
  platforms: [
    { id: 'BlueSky', label: 'BlueSky' },
    { id: 'LinkedIn', label: 'LinkedIn' },
    { id: 'Instagram', label: 'Instagram' },
  ],
  approvalRules: [
    { id: 'approval_required', label: 'Approval required' },
    { id: 'guarded_auto', label: 'Guarded automatic' },
  ],
  budgets: {},
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('SocialOperatorPanel', () => {
  let onCampaignSaved

  beforeEach(() => {
    window.localStorage.clear()
    onCampaignSaved = vi.fn()
    vi.stubGlobal('fetch', vi.fn(async (input, init = {}) => {
      const url = String(input)
      if (url === '/api/clients') return json({ clients: [
        { id: 'cl_acme', name: 'Acme Outdoor' },
        { id: 'cl_beta', name: 'Beta Bakery' },
      ] })
      if (url === '/api/openclaw/agents') return json({ agents: [{ id: 'sasha', name: 'Sasha', title: 'Media operator', enabled: true, draft: false }] })
      if (url === '/api/postiz/channels') return json({ ok: true, channels: [
        { id: 'postiz_1', name: 'Acme Instagram', identifier: 'instagram', tenantId: 'acme', clientId: 'cl_acme', disabled: false },
        { id: 'postiz_linkedin', name: 'Acme LinkedIn', identifier: 'linkedin', tenantId: 'acme', clientId: 'cl_acme', disabled: false },
      ] })
      if (url.startsWith('/api/content-lab')) return json({ ok: true, jobs: [] })
      if (url === '/api/media') return json({ ok: true, items: [] })
      if (url === '/api/campaign-studio' && init.method === 'POST') {
        const request = JSON.parse(init.body)
        return json({
          ok: true,
          budget: { clientId: 'cl_acme', limit: 10, used: 0, reserved: 2, remaining: 8 },
          campaign: {
            id: 'camp_operator_1',
            kind: 'social_operator',
            name: 'Acme Outdoor — Saturday trail clinic',
            socialOperator: {
              client: { id: 'cl_acme', name: 'Acme Outdoor' },
              agent: { id: 'sasha', name: 'Sasha' },
              jobStatus: 'awaiting_approval',
              budget: { estimated: 2, actual: 0, remaining: 8 },
              channels: request.job.channels,
            },
            posts: request.job.platforms.map((platform, index) => ({
              id: `post_${index}`,
              sequence: index + 1,
              platform,
              format: 'social post',
              status: 'draft',
              scheduledFor: '2026-07-16T14:00:00.000Z',
              hook: 'Saturday trail clinic',
              body: 'Client-aware copy',
              cta: 'Learn more',
            })),
          },
        })
      }
      return json({ ok: false, error: `Unexpected request: ${url}` }, 500)
    }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('renders the visible Command Center operator workflow', async () => {
    render(<SocialOperatorPanel config={config} campaigns={[]} onCampaignSaved={onCampaignSaved} />)

    expect(screen.getByRole('heading', { name: 'Social Operator' })).toBeInTheDocument()
    expect(screen.getByText('Assignment and source')).toBeInTheDocument()
    expect(screen.getByText('Platform variants')).toBeInTheDocument()
    expect(screen.getByText('Connected Postiz accounts')).toBeInTheDocument()
    expect(screen.getByLabelText('Wizard research')).toBeInTheDocument()
    expect(screen.getByLabelText('Media plan')).toBeInTheDocument()
    expect(screen.getByLabelText('At the limit')).toBeInTheDocument()
    expect(await screen.findByRole('option', { name: 'Acme Outdoor' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Sasha — Media operator' })).toBeInTheDocument()
  })

  it('creates a saved operator campaign from the selected client, agent, topic, platforms, rule, budget, and account', async () => {
    render(<SocialOperatorPanel config={config} campaigns={[]} onCampaignSaved={onCampaignSaved} />)

    fireEvent.change(await screen.findByLabelText('Client'), { target: { value: 'cl_acme' } })
    fireEvent.change(screen.getByLabelText('Assigned agent'), { target: { value: 'sasha' } })
    fireEvent.change(screen.getByLabelText('Topic or working headline'), { target: { value: 'Saturday trail clinic' } })
    fireEvent.click(screen.getByRole('button', { name: /Acme Instagram/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Generate and save variants' }))

    await waitFor(() => expect(onCampaignSaved).toHaveBeenCalledTimes(1))
    expect(onCampaignSaved.mock.calls[0][0]).toMatchObject({
      id: 'camp_operator_1',
      kind: 'social_operator',
      socialOperator: { jobStatus: 'awaiting_approval' },
    })
    expect(screen.getByText('Variants generated and saved. Approval is required before Postiz handoff.')).toBeInTheDocument()
  })

  it('clears selected Postiz accounts when the client changes', async () => {
    render(<SocialOperatorPanel config={config} campaigns={[]} onCampaignSaved={onCampaignSaved} />)

    const clientSelect = await screen.findByLabelText('Client')
    fireEvent.change(clientSelect, { target: { value: 'cl_acme' } })
    const account = screen.getByRole('button', { name: /Acme Instagram/i })
    fireEvent.click(account)
    expect(account).toHaveAttribute('aria-pressed', 'true')

    fireEvent.change(clientSelect, { target: { value: 'cl_beta' } })
    expect(account).toHaveAttribute('aria-pressed', 'false')
  })

  it('disables a delivered variant and only offers accounts matching its platform', async () => {
    const campaign = {
      id: 'camp_delivered',
      kind: 'social_operator',
      socialOperator: {
        jobStatus: 'approved',
        client: { id: 'cl_acme', name: 'Acme Outdoor' },
        agent: { id: 'sasha', name: 'Sasha' },
        budget: { estimated: 1, actual: 1, remaining: 9 },
        channels: [
          { id: 'postiz_1', name: 'Acme Instagram', identifier: 'instagram', tenantId: 'acme' },
          { id: 'postiz_linkedin', name: 'Acme LinkedIn', identifier: 'linkedin', tenantId: 'acme' },
        ],
      },
      posts: [{
        id: 'post_instagram',
        sequence: 1,
        platform: 'Instagram',
        format: 'social post',
        status: 'scheduled',
        scheduledFor: '2026-07-16T14:00:00.000Z',
        hook: 'Saturday trail clinic',
        body: 'Client-aware copy',
        cta: 'Learn more',
        postiz: { postId: 'postiz_post_1', recordedAt: '2026-07-15T12:00:00.000Z' },
      }],
    }

    render(<SocialOperatorPanel config={config} campaigns={[campaign]} onCampaignSaved={onCampaignSaved} />)

    const channelSelect = await screen.findByLabelText('Connected account')
    expect(within(channelSelect).getByRole('option', { name: /Acme Instagram/i })).toBeInTheDocument()
    expect(within(channelSelect).queryByRole('option', { name: /Acme LinkedIn/i })).not.toBeInTheDocument()
    expect(channelSelect).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Schedule Instagram variant' })).toBeDisabled()
    expect(screen.getByText('Scheduled through Postiz. Duplicate handoff is disabled.')).toBeInTheDocument()
  })
})
