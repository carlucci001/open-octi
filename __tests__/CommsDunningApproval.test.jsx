import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import CommsInbox from '../app/comms/CommsInbox'

describe('Comms dunning approval', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

  it('does not send a staged draft until Carl opens it and presses Send', async () => {
    const fetchMock = vi.fn(async (url, options = {}) => {
      if (url === '/api/comms?action=list_emails') return Response.json({ data: [] })
      if (url === '/api/comms?action=list_received') return Response.json({ data: [] })
      if (url === '/api/comms?action=domains') return Response.json({ data: [{ id: 'domain-1', name: 'farringtondevelopment.com', status: 'verified' }] })
      if (url === '/api/comms-local' && !options.method) return Response.json({ archived: [], drafts: [{ id: 'draft-1', status: 'pending_approval', to: 'owner@example.com', subject: 'Payment update', html: 'Please update payment.' }] })
      if (url === '/api/comms') return Response.json({ id: 'email-1' })
      if (url === '/api/comms-local' && options.method === 'POST') return Response.json({ ok: true, drafts: [{ id: 'draft-1', status: 'sent' }] })
      throw new Error(`Unexpected fetch ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<CommsInbox />)

    const draft = await screen.findByRole('button', { name: /Payment update.*owner@example.com/i })
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/comms')).toBe(false)
    fireEvent.click(draft)
    expect(screen.getByDisplayValue('owner@example.com')).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/comms')).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: /Send$/i }))

    await waitFor(() => expect(fetchMock.mock.calls.some(([url, options]) => url === '/api/comms-local' && options?.method === 'POST')).toBe(true))
    const markSent = fetchMock.mock.calls.find(([url, options]) => url === '/api/comms-local' && options?.method === 'POST')
    expect(JSON.parse(markSent[1].body)).toEqual({ action: 'mark_draft_sent', id: 'draft-1' })
  })

  it('shows received email in a 20-record paginated viewport', async () => {
    const messages = Array.from({ length: 25 }, (_, index) => ({
      id: `received-${index + 1}`,
      subject: `Message ${index + 1}`,
      from: `sender${index + 1}@example.com`,
      created_at: new Date(2026, 7, 31, 12, index).toISOString(),
      last_event: 'received',
    }))
    const fetchMock = vi.fn(async (url, options = {}) => {
      if (url === '/api/comms?action=list_emails') return Response.json({ data: [] })
      if (url === '/api/comms?action=list_received') return Response.json({ data: messages })
      if (url === '/api/comms?action=domains') return Response.json({ data: [] })
      if (url === '/api/comms-local' && !options.method) return Response.json({ archived: [], drafts: [] })
      throw new Error(`Unexpected fetch ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<CommsInbox />)

    expect(await screen.findByText('Message 1')).toBeInTheDocument()
    expect(screen.getByText('1-20 of 25')).toBeInTheDocument()
    expect(screen.queryByText('Message 21')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Next email page' }))

    expect(await screen.findByText('Message 21')).toBeInTheDocument()
    expect(screen.getByText('21-25 of 25')).toBeInTheDocument()
    expect(screen.queryByText('Message 1')).not.toBeInTheDocument()
  })

  it('filters received email by monitored domain', async () => {
    const fetchMock = vi.fn(async (url, options = {}) => {
      if (url === '/api/comms?action=list_emails') return Response.json({ data: [] })
      if (url === '/api/comms?action=list_received') return Response.json({ data: [
        { id: 'fcc-1', subject: 'Farrington inquiry', from: 'client@example.com', to: ['redacted@example.invalid'], created_at: new Date().toISOString(), last_event: 'received' },
        { id: 'newsroom-1', subject: 'Newsroom reply', from: 'editor@example.com', to: ['redacted@example.invalid'], created_at: new Date().toISOString(), last_event: 'received' },
      ] })
      if (url === '/api/comms?action=domains') return Response.json({ data: [
        { id: 'domain-1', name: 'farringtondevelopment.com', status: 'verified' },
        { id: 'domain-2', name: 'newsroomaios.com', status: 'verified' },
      ] })
      if (url === '/api/comms-local' && !options.method) return Response.json({ archived: [], deleted: [], drafts: [] })
      throw new Error(`Unexpected fetch ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<CommsInbox />)

    expect(await screen.findByText('Farrington inquiry')).toBeInTheDocument()
    expect(screen.getByText('Newsroom reply')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Filter email by farringtondevelopment.com (1)' }))

    expect(screen.getByText('Farrington inquiry')).toBeInTheDocument()
    expect(screen.queryByText('Newsroom reply')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Show email from all domains (2)' }))

    expect(screen.getByText('Newsroom reply')).toBeInTheDocument()
  })

  it('requires confirmation before persistently deleting email from the CRM inbox', async () => {
    const confirmMock = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true)
    vi.stubGlobal('confirm', confirmMock)
    const fetchMock = vi.fn(async (url, options = {}) => {
      if (url === '/api/comms?action=list_emails') return Response.json({ data: [] })
      if (url === '/api/comms?action=list_received') return Response.json({ data: [{ id: 'junk-1', subject: 'Junk offer', from: 'junk@example.com', created_at: new Date().toISOString(), last_event: 'received' }] })
      if (url === '/api/comms?action=domains') return Response.json({ data: [] })
      if (url === '/api/comms-local' && !options.method) return Response.json({ archived: [], deleted: [], drafts: [] })
      if (url === '/api/comms-local' && options.method === 'POST') return Response.json({ ok: true, archived: [], deleted: ['junk-1'], drafts: [] })
      throw new Error(`Unexpected fetch ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<CommsInbox />)

    expect(await screen.findByText('Junk offer')).toBeInTheDocument()
    const deleteButton = screen.getByRole('button', { name: 'Delete Junk offer' })
    fireEvent.click(deleteButton)
    expect(fetchMock.mock.calls.some(([url, options]) => url === '/api/comms-local' && options?.method === 'POST')).toBe(false)

    fireEvent.click(deleteButton)

    await waitFor(() => expect(screen.queryByText('Junk offer')).not.toBeInTheDocument())
    const deleteCall = fetchMock.mock.calls.find(([url, options]) => url === '/api/comms-local' && options?.method === 'POST')
    expect(JSON.parse(deleteCall[1].body)).toEqual({ action: 'delete', ids: ['junk-1'] })
    expect(confirmMock).toHaveBeenCalledTimes(2)
  })
})
