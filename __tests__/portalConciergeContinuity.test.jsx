import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

let pathname = '/portal/support'
vi.mock('next/navigation', () => ({ usePathname: () => pathname }))
vi.mock('../lib/portal-live-tools', () => ({ dispatchSurfacedCards: vi.fn() }))

import { ConciergeSessionProvider, useConciergeConversation } from '../app/portal/components/concierge-core'

function Consumer() {
  const conversation = useConciergeConversation()
  if (!conversation.ready) return <div>Loading</div>
  return <div>
    <label htmlFor="draft">Draft</label>
    <input id="draft" value={conversation.draft} onChange={event => conversation.setDraft(event.target.value)} />
    <button type="button" onClick={() => conversation.send(conversation.draft)}>Send</button>
    <output>{conversation.messages.map(message => message.content).join('|')}</output>
    <span data-testid="path">{conversation.pageContext.pathname}</span>
  </div>
}

function App({ routeKey }) {
  return <ConciergeSessionProvider><Consumer key={routeKey} /></ConciergeSessionProvider>
}

describe('persistent portal concierge session', () => {
  beforeEach(() => {
    pathname = '/portal/support'
    global.fetch = vi.fn(async (url, options = {}) => {
      if (url === '/api/portal/me') return { ok: true, json: async () => ({ ok: true, portalManager: { name: 'Cheryl' } }) }
      if (url === '/api/portal/concierge' && !options.method) return { ok: true, json: async () => ({ ok: true, messages: [{ role: 'assistant', content: 'Welcome back.' }] }) }
      if (url === '/api/portal/concierge' && options.method === 'POST') {
        const body = JSON.parse(options.body)
        return { ok: true, json: async () => ({ ok: true, runtime: 'gemini', messages: [{ role: 'user', content: body.message }, { role: 'assistant', content: `You are on ${body.pageContext.label}.` }] }) }
      }
      throw new Error(`Unexpected fetch: ${url}`)
    })
  })

  it('keeps the transcript and unsent draft when the route consumer remounts', async () => {
    const view = render(<App routeKey="support" />)
    await screen.findByText('Welcome back.')
    fireEvent.change(screen.getByLabelText('Draft'), { target: { value: 'Please keep this draft' } })

    pathname = '/portal/documents'
    view.rerender(<App routeKey="documents" />)

    expect(screen.getByLabelText('Draft')).toHaveValue('Please keep this draft')
    expect(screen.getByText('Welcome back.')).toBeInTheDocument()
    expect(screen.getByTestId('path')).toHaveTextContent('/portal/documents')
  })

  it('sends the current portal page as context without storing it in the client message', async () => {
    const view = render(<App routeKey="support" />)
    await screen.findByText('Welcome back.')

    pathname = '/portal/documents'
    view.rerender(<App routeKey="documents" />)
    fireEvent.change(screen.getByLabelText('Draft'), { target: { value: 'Where is my latest file?' } })
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send' })))

    await waitFor(() => expect(screen.getByText(/You are on Files/)).toBeInTheDocument())
    const post = global.fetch.mock.calls.find(([, options]) => options?.method === 'POST')
    expect(JSON.parse(post[1].body)).toMatchObject({
      message: 'Where is my latest file?',
      pageContext: { pathname: '/portal/documents', label: 'Files' },
    })
    expect(screen.getByText(/Where is my latest file/)).not.toHaveTextContent('Current portal page')
  })
})
