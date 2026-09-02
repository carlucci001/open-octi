import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import OrcaHandoffPanel from '../app/agents/OrcaHandoffPanel'

const payload = {
  ok: true, agent: 'orca', paidFallback: false, orcaConfigured: true,
  settings: { mode: 'per-agent', enabledAgents: ['main'] },
  runs: [{ id: 'oh_1', status: 'done', fromAgentId: 'main', task: 'summarize', tier: 'free', resolvedModel: 'deepseek/x-free', createdAt: new Date().toISOString(), latencyMs: 1200, result: 'hello' }],
}

beforeEach(() => {
  global.fetch = vi.fn(async (url, opts) => {
    if (opts?.method === 'POST') {
      const body = JSON.parse(opts.body)
      return { json: async () => ({ ok: true, settings: { mode: body.mode || 'per-agent', enabledAgents: ['main'] } }) }
    }
    return { json: async () => payload }
  })
})

describe('OrcaHandoffPanel', () => {
  it('renders collapsed with a summary line and expands on click', async () => {
    render(<OrcaHandoffPanel agents={[{ id: 'main', name: 'Maggie' }, { id: 'receptionist', name: 'Doreen' }]} />)
    await waitFor(() => expect(screen.getByText(/1 handoff last 24h · all free/)).toBeTruthy())
    expect(screen.queryByText('Master switch:')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Orca handoffs/ }))
    expect(screen.getByText('Master switch:')).toBeTruthy()
    expect(screen.getByText('deepseek/x-free')).toBeTruthy()
    expect(screen.getByText('Maggie · on')).toBeTruthy()
    expect(screen.getByText('Doreen · off')).toBeTruthy()
  })

  it('posts the master switch change', async () => {
    render(<OrcaHandoffPanel agents={[{ id: 'main', name: 'Maggie' }]} />)
    fireEvent.click(screen.getByRole('button', { name: /Orca handoffs/ }))
    fireEvent.click(await screen.findByTestId('orca-mode-all'))
    await waitFor(() => {
      const post = global.fetch.mock.calls.find(c => c[1]?.method === 'POST')
      expect(post).toBeTruthy()
      expect(JSON.parse(post[1].body)).toEqual({ action: 'set_mode', mode: 'all' })
    })
  })

  it('shows the OrcaRouter credential slot when it is not configured', async () => {
    global.fetch = vi.fn(async () => ({ json: async () => ({ ...payload, orcaConfigured: false }) }))
    render(<OrcaHandoffPanel agents={[{ id: 'main', name: 'Maggie' }]} />)
    fireEvent.click(screen.getByRole('button', { name: /Orca handoffs/ }))
    expect(await screen.findByRole('status')).toHaveTextContent(/add ORCAROUTER_API_KEY to enable OrcaRouter handoffs/i)
  })
})
