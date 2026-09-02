import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import MoneyConsole from '../app/ops/money/MoneyConsole'

const snapshot = {
  periodKey: '2026-08',
  period: { from: '2026-08-01T00:00:00.000Z', to: '2026-09-01T00:00:00.000Z' },
  portfolio: { currency: 'USD', mrr: 125, newMrr: 20, churnedMrr: 5, failedPayments: 1, trials: { started: 3, converted: 2 }, attributedCostUsd: 'unknown', marginUsd: 'unknown', marginUnknown: true },
  products: [{ productId: 'farrington-command-center', name: 'Command Center', currency: 'USD', mrr: 125, newMrr: 20, churnedMrr: 5, failedPayments: 1, trials: { started: 3, converted: 2 }, attributedCostUsd: 'unknown', marginUsd: 'unknown', marginUnknown: true }],
  clients: [],
  dunningCandidates: [{ id: 'lease-1', platformId: 'getfound3', productName: 'GetFound3', clientName: 'Acme', email: 'redacted@example.invalid', failedAt: '2026-08-10T00:00:00.000Z', targetId: 'cust-1', pauseProposed: true, automatic: false }],
}

describe('Money Console UI', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('stages an Orca dunning draft in Comms and never calls the send route', async () => {
    const fetchMock = vi.fn(async (url, options = {}) => {
      if (String(url).startsWith('/api/ops/money')) return Response.json({ ok: true, snapshot, settings: { dunningProposalDays: 7 } })
      if (url === '/api/email-templates') return Response.json({ templates: [{ id: 'dunning', name: 'Payment follow-up', subject: 'Payment issue for {company}', body: 'Hi {contact}, please update payment for {company}.' }] })
      if (url === '/api/agent/handoff') return Response.json({ ok: true, run: { status: 'done', result: 'Subject: Payment update\n\nHi Acme, please update the payment method.' } })
      if (url === '/api/comms-local' && options.method === 'POST') return Response.json({ ok: true, draft: { id: 'draft-1' } })
      throw new Error(`Unexpected fetch ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<MoneyConsole />)
    expect((await screen.findAllByText(/^\$125(?:\.00)?$/)).length).toBeGreaterThan(0)
    expect(screen.getAllByText('unknown').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: /Draft failed-payment email for Acme/i }))

    expect(await screen.findByText(/Draft staged in Comms/i)).toBeInTheDocument()
    const calls = fetchMock.mock.calls.map(([url]) => url)
    expect(calls).toContain('/api/agent/handoff')
    expect(calls).toContain('/api/comms-local')
    expect(calls).not.toContain('/api/comms')
    const localCall = fetchMock.mock.calls.find(([url]) => url === '/api/comms-local')
    expect(JSON.parse(localCall[1].body)).toMatchObject({ action: 'create_draft', source: 'money-console', approvalRequired: true })
  })

  it('does not invoke pause until Carl opens the proposal and types a reason', async () => {
    const fetchMock = vi.fn(async (url, options = {}) => {
      if (String(url).startsWith('/api/ops/money')) return Response.json({ ok: true, snapshot, settings: { dunningProposalDays: 7 } })
      if (url === '/api/platforms/getfound3/action') return Response.json({ ok: true })
      throw new Error(`Unexpected fetch ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<MoneyConsole />)

    const propose = await screen.findByRole('button', { name: /Propose pause subscription for Acme/i })
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/action'))).toBe(false)
    fireEvent.click(propose)
    const confirm = screen.getByRole('button', { name: /^Pause subscription$/i })
    expect(confirm).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/Reason/i), { target: { value: 'Payment unresolved after outreach' } })
    fireEvent.click(confirm)

    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/api/platforms/getfound3/action'))).toBe(true))
    const actionCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/api/platforms/getfound3/action'))
    expect(JSON.parse(actionCall[1].body)).toMatchObject({ action: 'pause_subscription', reason: 'Payment unresolved after outreach' })
  })
})
