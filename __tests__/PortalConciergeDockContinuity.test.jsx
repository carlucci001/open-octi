import React, { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

let pathname = '/portal/support'
let voiceMounts = 0
vi.mock('next/navigation', () => ({ usePathname: () => pathname }))
vi.mock('../lib/portal-live-tools', () => ({ dispatchSurfacedCards: vi.fn() }))
vi.mock('../app/portal/components/PortalLiveVoice', () => ({
  default: function FakeVoice() {
    const [mountId] = useState(() => ++voiceMounts)
    return <button type="button" data-testid="voice-runtime">Voice {mountId}</button>
  },
}))

import PortalConciergeDock from '../app/portal/components/PortalConciergeDock'
import { ConciergeSessionProvider } from '../app/portal/components/concierge-core'

function App() {
  return <ConciergeSessionProvider><PortalConciergeDock /></ConciergeSessionProvider>
}

describe('PortalConciergeDock route continuity', () => {
  beforeEach(() => {
    pathname = '/portal/support'
    voiceMounts = 0
    Element.prototype.scrollIntoView = vi.fn()
    global.fetch = vi.fn(async url => {
      if (url === '/api/portal/me') return { ok: true, json: async () => ({ ok: true, portalManager: { name: 'Cheryl' } }) }
      if (url === '/api/portal/concierge') return { ok: true, json: async () => ({ ok: true, messages: [] }) }
      throw new Error(`Unexpected fetch: ${url}`)
    })
  })

  it('keeps one live-voice runtime mounted when the dock becomes hidden on Concierge Home', async () => {
    const view = render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: /Open your concierge/i }))
    await screen.findByTestId('voice-runtime')
    expect(screen.getByTestId('voice-runtime')).toHaveTextContent('Voice 1')

    pathname = '/portal/dashboard'
    view.rerender(<App />)

    expect(screen.getByTestId('voice-runtime')).toHaveTextContent('Voice 1')
    expect(screen.getByTestId('voice-runtime').closest('[aria-hidden="true"]')).toBeTruthy()
    expect(voiceMounts).toBe(1)
  })
})
