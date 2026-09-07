import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import NetworkManager from '@/app/network/NetworkManager'

vi.mock('@/lib/edition', () => ({ isOpenOcti: () => true }))
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('renders the installation services without inheriting the private deployment topology', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ edition: 'openocti', crm: { status: 'active', runtime: 'Docker' }, openclaw: { status: 'active' }, gitea: { status: 'active' } }) }))
  const { container } = render(<NetworkManager />)
  await screen.findByText('Application running in Docker')
  expect(container.textContent).not.toMatch(/Farrington|Hetzner|Cloudflare|Stripe|Resend|ElevenLabs|\/root\//i)
  expect(screen.getByLabelText('This installation topology')).toHaveTextContent('OpenClaw')
  expect(screen.getByLabelText('This installation topology')).toHaveTextContent('Gitea')
  expect(fetch).toHaveBeenCalledTimes(1)
  expect(fetch.mock.calls[0][0]).toBe('/api/network/status')
})

it('does not draw unconfigured sidecars as connected nodes', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ edition: 'openocti', crm: { status: 'active', runtime: 'Node.js' }, openclaw: { status: 'not configured' }, gitea: { status: 'not configured' } }) }))
  render(<NetworkManager />)
  const diagram = await screen.findByLabelText('This installation topology')
  expect(diagram).not.toHaveTextContent('OpenClaw')
  expect(diagram).not.toHaveTextContent('Gitea')
  expect(screen.getAllByText('Not configured')).toHaveLength(2)
})
