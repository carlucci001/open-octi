import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import OrchestrationDesigner from '../app/nvidia-labs/OrchestrationDesigner'

const flow = {
  id: 'orc_seed',
  slug: 'carls-client-onboarding',
  name: "Carl's client onboarding",
  description: 'Client interview',
  enabled: false,
  tags: ['onboarding', 'client'],
  clonedFrom: 'orc_source',
  runCount: 2,
  lastRunAt: '2026-08-23T12:00:00.000Z',
  whatThisFlowDoes: { text: 'This flow asks the onboarding questions and records Phase 2 work.', flowVersion: 1 },
  nodes: [],
  edges: [],
  steps: [
    { id: 'nda-gate', type: 'gate', question: 'NDA?', options: [{ label: 'Yes', next: 'draft-nda' }, { label: 'No', next: 'end' }] },
    { id: 'draft-nda', type: 'action', kind: 'document', name: 'Draft NDA', agentId: 'legal', instruction: 'Draft it', requiredTools: ['fcc_create_document'] },
  ],
}

const agents = [
  { id: 'legal', name: 'Linda', role: 'Legal' },
  { id: 'coding', name: 'Craig', role: 'Engineering' },
]

beforeEach(() => {
  global.fetch = vi.fn(async (_url, options = {}) => {
    if (!options.method) return { json: async () => ({ orchestrations: [flow], agents }) }
    const body = JSON.parse(options.body)
    if (body.action === 'start') {
      return { json: async () => ({ ok: true, runId: 'orun_1', run: {
        id: 'orun_1', flowId: flow.id, flowName: flow.name, flowSummary: flow.whatThisFlowDoes.text,
        status: 'awaiting_answer', state: 'awaiting_answer(nda-gate)', currentGate: { gateId: 'nda-gate', question: 'NDA?', options: [{ label: 'Yes', capture: null }, { label: 'No', capture: null }] },
        transcript: [{ type: 'gate_asked', question: 'NDA?', status: 'awaiting_answer' }],
      } }) }
    }
    if (body.action === 'reassign_preview') {
      return { json: async () => ({ ok: true, preview: true, moved: 1, validation: { errors: [], warnings: ['Target agent coding is missing required tool fcc_create_document'], harness: { checkedAgentId: 'coding', configFound: true, missingTools: ['fcc_create_document'] } } }) }
    }
    if (body.action === 'reassign') {
      return { json: async () => ({ ok: true, moved: 1, validation: { warnings: [] }, orchestration: { ...flow, steps: flow.steps.map(step => step.agentId === 'legal' ? { ...step, agentId: 'coding' } : step) } }) }
    }
    return { json: async () => ({ ok: true, orchestration: flow }) }
  })
})

describe('OrchestrationDesigner Phase 1', () => {
  it('shows every capability, generated summary, and library metadata honestly', async () => {
    render(<OrchestrationDesigner />)

    expect(await screen.findByRole('heading', { name: 'Orchestration designer' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Capabilities' })).toBeInTheDocument()
    for (const label of ['Gate', 'Agent action', 'Task action', 'Document action', 'API call', 'MCP call']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    expect(screen.getByText(flow.whatThisFlowDoes.text)).toBeInTheDocument()
    expect(screen.getByText('Disabled')).toBeInTheDocument()
    expect(screen.getByText(/2 runs/)).toBeInTheDocument()
    expect(screen.getByText(/Cloned from orc_source/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: `Clone ${flow.name}` })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: `Reassign agents in ${flow.name}` })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: `Export ${flow.name}` })).toBeInTheDocument()
  })

  it('starts a run from an on-screen context field instead of a browser prompt', async () => {
    render(<OrchestrationDesigner />)
    fireEvent.click(await screen.findByRole('button', { name: `Run ${flow.name}` }))
    fireEvent.change(screen.getByLabelText('Client or run context'), { target: { value: 'Acme Hardware' } })
    fireEvent.click(screen.getByRole('button', { name: 'Start interview' }))

    await waitFor(() => {
      const startCall = global.fetch.mock.calls.find(([, options]) => options?.method === 'POST' && JSON.parse(options.body).action === 'start')
      expect(JSON.parse(startCall[1].body)).toMatchObject({ action: 'start', id: flow.id, input: 'Acme Hardware' })
    })
    expect((await screen.findAllByText('NDA?')).length).toBeGreaterThan(0)
    expect(screen.getAllByText(flow.whatThisFlowDoes.text).length).toBeGreaterThan(0)
  })

  it('previews harness revalidation before applying an agent reassignment', async () => {
    render(<OrchestrationDesigner />)
    fireEvent.click(await screen.findByRole('button', { name: `Reassign agents in ${flow.name}` }))
    fireEvent.click(screen.getByLabelText('Reassign to'))
    fireEvent.click(await screen.findByRole('option', { name: /Craig/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Preview reassignment' }))

    expect(await screen.findByText(/missing required tool fcc_create_document/)).toBeInTheDocument()
    expect(screen.getByText(/1 node assignment would change/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Apply reassignment' }))

    await waitFor(() => {
      const actions = global.fetch.mock.calls
        .filter(([, options]) => options?.method === 'POST')
        .map(([, options]) => JSON.parse(options.body).action)
      expect(actions).toEqual(expect.arrayContaining(['reassign_preview', 'reassign']))
    })
  })
})
