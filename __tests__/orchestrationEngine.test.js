import { beforeEach, describe, expect, it, vi } from 'vitest'

const store = vi.hoisted(() => ({ data: {} }))

vi.mock('@/lib/dataStore', () => ({
  readData: vi.fn(filename => store.data[filename]),
  writeData: vi.fn((filename, value) => { store.data[filename] = JSON.parse(JSON.stringify(value)) }),
}))

beforeEach(() => {
  store.data = { 'agents.json': { agents: { coding: { name: 'Craig' } } } }
})

describe('Phase 1 orchestration run state machine', () => {
  it('persists pending and awaiting_harness_approval(nodeId) without self-approval', async () => {
    const { RUN_STATUSES, getRun, parkForHarnessApproval, startRun } = await import('@/lib/orchestration-engine')
    const flow = { id: 'flow_1', name: 'Approval contract', steps: [{ id: 'agent_1', type: 'action', kind: 'agent', agentId: 'coding', name: 'Plan work' }] }

    const pending = startRun(flow)
    expect(pending).toMatchObject({ status: 'pending', state: 'pending', pendingHarnessApproval: null })
    expect(RUN_STATUSES).toEqual(['pending', 'awaiting_answer', 'awaiting_harness_approval', 'executing', 'completed', 'failed', 'cancelled'])

    const parked = parkForHarnessApproval(pending.id, 'agent_1', 'Craig requests approval')
    expect(parked).toMatchObject({
      status: 'awaiting_harness_approval',
      state: 'awaiting_harness_approval(agent_1)',
      pendingHarnessApproval: { nodeId: 'agent_1', requestSummary: 'Craig requests approval' },
    })
    expect(getRun(pending.id).transcript.at(-1).detail).toMatch(/did not approve/i)
  })

  it('persists executing(nodeId), failed, and cancelled terminal states honestly', async () => {
    const { advanceRun, cancelRun, startRun } = await import('@/lib/orchestration-engine')
    const badFlow = { id: 'bad', name: 'Bad action', steps: [{ id: 'bad_action', type: 'action', kind: 'unknown', name: 'Unknown' }] }
    const pendingBad = startRun(badFlow)
    const failed = await advanceRun(pendingBad.id, badFlow)
    expect(failed).toMatchObject({ status: 'failed', state: 'failed', currentNodeId: null })
    expect(failed.transcript.some(event => event.type === 'run_failed')).toBe(true)

    const gateFlow = { id: 'gate', name: 'Gate', steps: [{ id: 'gate_1', type: 'gate', question: 'Continue?', options: [{ label: 'Yes', next: 'end' }] }] }
    const pendingGate = startRun(gateFlow)
    const waiting = await advanceRun(pendingGate.id, gateFlow)
    expect(waiting.state).toBe('awaiting_answer(gate_1)')
    expect(cancelRun(waiting.id)).toMatchObject({ status: 'cancelled', state: 'cancelled' })
  })
})
