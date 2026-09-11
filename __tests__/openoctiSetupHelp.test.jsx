import React from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import OpenOctiGuidePanel from '../app/components/OpenOctiGuidePanel'
vi.mock('next/link', () => ({ default: ({ children, ...props }) => <a {...props}>{children}</a> }))
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals() })

it('keeps help searchable without a provider and persists reading progress across refreshes', async () => {
  vi.stubGlobal('fetch', vi.fn(async url => ({ ok: !url.includes('/postiz'), json: async () => ({ capabilities: [] }) })))
  const view = render(<OpenOctiGuidePanel />)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Recheck setup' })).not.toBeDisabled())
  expect(screen.getByText('Install and sign in')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Ask Octi' })).toBeDisabled()
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'image upload' } })
  expect(screen.getByText('An image upload fails')).toBeInTheDocument()
  fireEvent.click(screen.getByText('An image upload fails'))
  fireEvent.click(screen.getAllByRole('button', { name: 'Mark topic reviewed' })[0])
  expect(screen.getByText(/1 of 12 topics reviewed/)).toBeInTheDocument()
  view.unmount(); render(<OpenOctiGuidePanel />)
  await waitFor(() => expect(screen.getByText(/1 of 12 topics reviewed/)).toBeInTheDocument())
})

it('retains built-in recovery guidance when a configured provider fails', async () => {
  vi.stubGlobal('fetch', vi.fn(async url => ({ ok: !url.includes('/chat'), json: async () => url.includes('/capabilities') ? { capabilities: [{ id: 'openai', status: 'configured' }] } : url.includes('/chat') ? { ok: false } : { ok: true, diagnostics: { next: 'Connect a social account.', configured: true, channelCount: 0, reachable: true } } })))
  render(<OpenOctiGuidePanel />)
  fireEvent.change(screen.getByRole('textbox', { name: 'Question for Octi' }), { target: { value: 'How do I start?' } })
  await waitFor(() => expect(screen.getByRole('button', { name: 'Ask Octi' })).not.toBeDisabled())
  fireEvent.click(screen.getByRole('button', { name: 'Ask Octi' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('built-in topics below still work')
  expect(screen.getByText('A scheduled post does not publish')).toBeInTheDocument()
  expect(screen.getByText(/Scheduled: not verified · Published: not verified/)).toBeInTheDocument()
})
