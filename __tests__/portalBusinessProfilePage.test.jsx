import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../app/portal/PortalNav', () => ({
  default: ({ companyName }) => <nav aria-label="Portal">{companyName}</nav>,
}))

import BusinessProfilePage from '../app/portal/profile/page'

const completion = {
  completed: 4,
  total: 36,
  percent: 11,
  sections: [
    'identity', 'locationsHours', 'offerings', 'idealCustomers', 'qualifiedLeads',
    'brand', 'workflows', 'approvals', 'systems', 'resilience',
  ].map(id => ({ id, completed: 0, total: 3, percent: 0 })),
}

const metrics = {
  overall: { label: 'Overall completion', percent: 11, detail: '4 of 36 meaningful fields have information.' },
  verifiedInformation: { label: 'Verified information', percent: 25, detail: '1 of 4 populated fields were confirmed by the client.' },
  freshness: { label: 'Profile freshness', percent: 100, detail: '4 of 4 populated fields were updated in the last 180 days.' },
  leadReadiness: { label: 'Lead readiness', percent: 17, detail: '1 of 6 lead-definition fields have information.' },
  automationReadiness: { label: 'Automation readiness', percent: 0, detail: '0 of 5 workflow fields have information.' },
  websiteReadiness: { label: 'Website & integration readiness', percent: 25, detail: '1 of 4 website and system fields have information.' },
  recoveryReadiness: { label: 'Recovery readiness', percent: 0, detail: '0 of 5 recovery planning fields have information.' },
}

function profile(fields = {}) {
  return {
    id: 'business_tenant-acme_account-acme',
    accountId: 'account-acme',
    tenantId: 'tenant-acme',
    fields: {
      businessName: {
        value: 'Acme Development',
        status: 'suggested',
        source: { type: 'account_record', ref: 'account-acme' },
        verifiedAt: null,
        updatedAt: '2026-08-26T10:00:00.000Z',
      },
      ...fields,
    },
    completion,
    metrics,
    currentSectionId: 'identity',
    navigation: { continueSectionId: 'identity', nextIncompleteSectionId: 'identity' },
    updatedAt: '2026-08-26T10:00:00.000Z',
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
  window.history.replaceState({}, '', '/portal/profile')
})

describe('portal business profile page', () => {
  it('renders one accessible profile card at a time and never forces completion', async () => {
    vi.stubGlobal('fetch', vi.fn(async url => ({
      ok: true,
      json: async () => url === '/api/portal/me'
        ? { user: { companyName: 'Acme Development' } }
        : { profile: profile() },
    })))

    render(<BusinessProfilePage />)

    expect(await screen.findByRole('heading', { name: 'Your business profile' })).toBeInTheDocument()
    expect(screen.getByText('Step 1 of 10')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Business identity' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Locations & hours' })).not.toBeInTheDocument()
    expect(screen.getByText(/11% complete/i)).toBeInTheDocument()
    expect(screen.getByText(/100% is encouraged, never required/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Finish for now' })).toHaveAttribute('href', '/portal/dashboard')
    expect(screen.getByText(/Do not enter passwords, API keys, or other credentials/i)).toBeInTheDocument()
    expect(screen.getByText(/Suggested from your account/i)).toBeInTheDocument()
    expect(screen.getByText('Lead readiness')).toBeInTheDocument()
    expect(screen.getByLabelText('Years in business')).toBeInTheDocument()
  })

  it('collects Google Business Profile identifiers and status without requesting credentials', async () => {
    const systemsProfile = profile()
    systemsProfile.currentSectionId = 'systems'
    systemsProfile.navigation = { continueSectionId: 'systems', nextIncompleteSectionId: 'systems' }
    vi.stubGlobal('fetch', vi.fn(async url => ({
      ok: true,
      json: async () => url === '/api/portal/me'
        ? { user: { companyName: 'Acme Development' } }
        : { profile: systemsProfile },
    })))

    render(<BusinessProfilePage />)

    expect(await screen.findByLabelText('Google Business Profile URL')).toBeInTheDocument()
    expect(screen.getByLabelText('Google Business Profile place or account ID')).toBeInTheDocument()
    expect(screen.getByLabelText('Google Business Profile status')).toBeInTheDocument()
    expect(screen.getByText(/Status records profile readiness only and does not mean OAuth is connected/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/Google.*password|Google.*API key/i)).not.toBeInTheDocument()
  })

  it('resumes the persisted card and advances to the next card with screen-reader status', async () => {
    const resumedProfile = profile()
    resumedProfile.currentSectionId = 'workflows'
    resumedProfile.navigation = { continueSectionId: 'workflows', nextIncompleteSectionId: 'workflows' }
    const fetchMock = vi.fn(async (url, options = {}) => ({
      ok: true,
      json: async () => url === '/api/portal/me'
        ? { user: { companyName: 'Acme Development' } }
        : options.method === 'PATCH'
          ? { profile: { ...resumedProfile, currentSectionId: JSON.parse(options.body).currentSectionId || resumedProfile.currentSectionId } }
          : { profile: resumedProfile },
    }))
    vi.stubGlobal('fetch', fetchMock)

    render(<BusinessProfilePage />)

    expect(await screen.findByText('Step 7 of 10')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Workflows & automation' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Next section' }))

    expect(await screen.findByText('Step 8 of 10')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Approvals & contacts' })).toBeInTheDocument()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/portal/business-profile',
      expect.objectContaining({ method: 'PATCH', body: expect.stringContaining('"currentSectionId":"approvals"') }),
    ))
  })

  it('autosaves a changed field on blur and supports an explicit manual save', async () => {
    const fetchMock = vi.fn(async (url, options = {}) => {
      if (url === '/api/portal/me') return { ok: true, json: async () => ({ user: { companyName: 'Acme Development' } }) }
      if (!options.method) return { ok: true, json: async () => ({ profile: profile() }) }
      const body = JSON.parse(options.body)
      const [key, value] = Object.entries(body.fields)[0] || []
      return {
        ok: true,
        json: async () => ({
          profile: profile(key ? {
            [key]: {
              value,
              status: 'confirmed',
              source: { type: 'client_profile', ref: 'redacted@example.invalid' },
              verifiedAt: '2026-08-26T11:00:00.000Z',
              updatedAt: '2026-08-26T11:00:00.000Z',
            },
          } : {}),
        }),
      }
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<BusinessProfilePage />)
    const summary = await screen.findByLabelText('Business summary')
    fireEvent.change(summary, { target: { value: 'We build and manage neighborhood retail locations.' } })
    fireEvent.blur(summary)

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/portal/business-profile',
      expect.objectContaining({ method: 'PATCH', body: expect.stringContaining('"saveMode":"autosave"') }),
    ))

    fireEvent.change(screen.getByLabelText('Industry'), { target: { value: 'Commercial development' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      '/api/portal/business-profile',
      expect.objectContaining({ method: 'PATCH', body: expect.stringContaining('"saveMode":"manual"') }),
    ))
    expect(await screen.findByText(/All changes saved/i)).toBeInTheDocument()
  })
})
