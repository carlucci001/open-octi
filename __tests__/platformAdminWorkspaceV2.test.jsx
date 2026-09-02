import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import PlatformAdminWorkspace from '../app/platforms/PlatformAdminWorkspace'

beforeEach(() => {
  global.fetch = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ ok: true, data: { platform: {}, counts: {} } }),
  }))
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('Platform Admin v2 panel capability gating', () => {
  it('does not request the legacy info feed for a health-only platform', () => {
    render(<PlatformAdminWorkspace platform={{
      platformId: 'health-only',
      environment: 'production',
      capabilities: ['health'],
      manifestVersion: '1.0.0',
    }} />)

    expect(global.fetch).not.toHaveBeenCalled()
    expect(screen.getByText(/does not advertise the legacy overview feed/i)).toBeInTheDocument()
  })

  it('renders only panels declared by an explicit v2 capability array', () => {
    render(<PlatformAdminWorkspace platform={{
      platformId: 'example',
      environment: 'production',
      capabilities: ['health', 'revenue'],
    }} />)

    expect(screen.getByRole('tab', { name: /overview/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /health/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /revenue/i })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: /customers/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: /errors/i })).not.toBeInTheDocument()
  })

  it('keeps v1 customers and subscriptions visible and loads their legacy overview', async () => {
    render(<PlatformAdminWorkspace platform={{ platformId: 'legacy', environment: 'production' }} />)
    expect(screen.getByRole('tab', { name: /customers/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /subscriptions/i })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: /health/i })).not.toBeInTheDocument()
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/platforms/legacy/resource?resource=info',
        { cache: 'no-store' },
      )
      expect(screen.queryByText(/loading platform overview/i)).not.toBeInTheDocument()
    })
  })
})
