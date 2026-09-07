import React from 'react'
import { act, render, screen, waitFor, cleanup } from '@testing-library/react'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { useStripeClient } from '../lib/use-stripe-client'
import { useCapabilities, notifyCapabilitiesChanged, clearClientCapabilityCache } from '../lib/client-capabilities'
import { loadStripe } from '@stripe/stripe-js'

vi.mock('@stripe/stripe-js', () => ({ loadStripe: vi.fn(key => ({ key })) }))
const reply = data => Promise.resolve({ ok: true, json: async () => data })

function Probe() {
  const { stripePromise, loading } = useStripeClient()
  const { capabilities } = useCapabilities()
  return <div><span data-testid="key">{loading ? 'loading' : stripePromise?.key || 'none'}</span><span data-testid="capability">{capabilities[0]?.status || 'loading'}</span></div>
}

beforeEach(() => { vi.stubEnv('FCC_EDITION', 'openocti'); clearClientCapabilityCache(); vi.clearAllMocks() })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); clearClientCapabilityCache() })

it('refreshes both a mounted payment form and its capability gate when keys are saved', async () => {
  let configured = false
  vi.stubGlobal('fetch', vi.fn(url => reply(url.includes('/payments/config') ? { publishableKey: configured ? 'pk_test_new' : null } : { capabilities: [{ id: 'stripe', status: configured ? 'configured' : 'not_configured' }] })))
  render(<Probe />)
  await waitFor(() => expect(screen.getByTestId('key').textContent).toBe('none'))
  expect(screen.getByTestId('capability').textContent).toBe('not_configured')
  configured = true
  act(() => notifyCapabilitiesChanged())
  await waitFor(() => expect(screen.getByTestId('key').textContent).toBe('pk_test_new'))
  expect(screen.getByTestId('capability').textContent).toBe('configured')
  expect(loadStripe).toHaveBeenLastCalledWith('pk_test_new')
})

it('drops old payment elements during a mode change and ignores a stale earlier response', async () => {
  let resolveOld
  let count = 0
  vi.stubGlobal('fetch', vi.fn(url => {
    if (!url.includes('/payments/config')) return reply({ capabilities: [] })
    count += 1
    if (count === 1) return new Promise(resolve => { resolveOld = resolve })
    return reply({ publishableKey: 'pk_live_current' })
  }))
  render(<Probe />)
  act(() => notifyCapabilitiesChanged())
  await waitFor(() => expect(screen.getByTestId('key').textContent).toBe('pk_live_current'))
  await act(async () => resolveOld(await reply({ publishableKey: 'pk_test_stale' })))
  expect(screen.getByTestId('key').textContent).toBe('pk_live_current')
  expect(loadStripe).not.toHaveBeenCalledWith('pk_test_stale')
})
