import React from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import OpenOctiGuidePanel from '../app/components/OpenOctiGuidePanel'
vi.mock('next/link', () => ({ default: ({ children, ...props }) => <a {...props}>{children}</a> }))
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals() })

function stubFetch({ profile, capabilities = [], postiz, chatOk = false }) {
  const fetchMock = vi.fn(async url => {
    if (url.includes('/openocti/setup')) return { ok: true, json: async () => ({ ok: true, profile }) }
    if (url.includes('/platform-admin/v1/capabilities')) return { ok: true, json: async () => ({ capabilities }) }
    if (url.includes('/openocti/postiz')) return { ok: true, json: async () => ({ ok: true, diagnostics: postiz }) }
    if (url.includes('/help/chat')) return { ok: chatOk, json: async () => (chatOk ? { ok: true, text: 'Here is how.' } : { ok: false }) }
    return { ok: false, json: async () => ({}) }
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

it('sends a brand-new install to the workspace step, hides Postiz, and never checks Postiz diagnostics', async () => {
  const fetchMock = stubFetch({ profile: { complete: false, firstRunVisitedAgentsAt: '' }, capabilities: [] })
  render(<OpenOctiGuidePanel />)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Recheck' })).not.toBeDisabled())

  const nextStepBlock = screen.getByRole('button', { name: 'Recheck' }).closest('.rounded-lg')
  expect(within(nextStepBlock).getByText('Name your workspace so your agents and documents carry your business name.')).toBeInTheDocument()
  expect(within(nextStepBlock).queryByText(/Postiz/)).toBeNull()
  expect(screen.getByRole('heading', { name: 'Your next step' })).toBeInTheDocument()

  expect(screen.queryByRole('textbox', { name: 'Question for Octi' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Ask Octi' })).toBeNull()
  expect(screen.getByText(/Conversational help needs a model key/)).toBeInTheDocument()

  expect(fetchMock.mock.calls.some(([url]) => url.includes('/openocti/postiz'))).toBe(false)

  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'image upload' } })
  expect(screen.getByText('An image upload fails')).toBeInTheDocument()
  fireEvent.click(screen.getAllByRole('button', { name: 'Mark topic reviewed' })[0])
  expect(screen.getByText(/1 of 12 topics reviewed/)).toBeInTheDocument()
})

it('only surfaces the optional Postiz step once the workspace, a model key, and agents are done', async () => {
  const fetchMock = stubFetch({
    profile: { complete: true, firstRunVisitedAgentsAt: '2026-09-01T00:00:00.000Z' },
    capabilities: [{ id: 'openai', status: 'configured' }],
    postiz: { next: 'Connect a social account.', installed: 'bundled', configured: true, channelCount: 0, reachable: true, scheduled: 'not_verified', published: 'not_verified' },
  })
  render(<OpenOctiGuidePanel />)

  await waitFor(() => expect(screen.getByRole('heading', { name: 'Optional · Publishing with Postiz' })).toBeInTheDocument())
  expect(screen.getByRole('link', { name: 'Open Postiz settings' })).toBeInTheDocument()
  expect(screen.getByText(/Connect a social account\./)).toBeInTheDocument()
  expect(fetchMock.mock.calls.some(([url]) => url.includes('/openocti/postiz'))).toBe(true)

  expect(screen.getByRole('textbox', { name: 'Question for Octi' })).toBeInTheDocument()
})

it('retains built-in recovery guidance when a configured provider fails to answer', async () => {
  stubFetch({
    profile: { complete: true, firstRunVisitedAgentsAt: '2026-09-01T00:00:00.000Z' },
    capabilities: [{ id: 'openai', status: 'configured' }],
    postiz: { next: 'Connect a social account.', configured: true, channelCount: 0, reachable: true },
    chatOk: false,
  })
  render(<OpenOctiGuidePanel />)
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'Question for Octi' })).toBeInTheDocument())
  fireEvent.change(screen.getByRole('textbox', { name: 'Question for Octi' }), { target: { value: 'How do I start?' } })
  fireEvent.click(screen.getByRole('button', { name: 'Ask Octi' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('built-in topics below still work')
  expect(screen.getByText('A scheduled post does not publish')).toBeInTheDocument()
})
