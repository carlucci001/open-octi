import { describe, expect, it, vi } from 'vitest'
import { createIncidentTask } from '../lib/incidents'

describe('Incident task handoff', () => {
  it('creates one Carl-owned Projects task with an Incident Inbox backlink', () => {
    const createTask = vi.fn((_type, task) => ({ id: 'tk_1', ...task }))
    const updateIncident = vi.fn((_type, _id, patch) => ({ id: 'inc_1', ...patch }))
    const incident = {
      id: 'inc_1', platformId: 'getfound3', platformName: 'GetFound3', title: 'Checkout timed out', level: 'error', status: 'open', count: 4, taskId: null, notes: [],
    }

    const result = createIncidentTask(incident, { createTask, updateIncident, appUrl: 'https://openocti.local', now: '2026-08-22T20:00:00.000Z' })

    expect(result.task).toMatchObject({
      id: 'tk_1',
      title: '[GetFound3] Checkout timed out',
      status: 'todo',
      priority: 'high',
      assignedTo: 'Carl',
      assignedToUserId: 'carl',
      linkedTo: { incidentId: 'inc_1' },
    })
    expect(result.task.description).toContain('https://openocti.local/?tab=incident-inbox&incident=inc_1')
    expect(updateIncident).toHaveBeenCalledWith('incidents', 'inc_1', expect.objectContaining({ taskId: 'tk_1' }))
  })

  it('is idempotent when the incident already has a task', () => {
    const createTask = vi.fn()
    const result = createIncidentTask({ id: 'inc_1', taskId: 'tk_existing' }, { createTask })
    expect(result).toEqual({ taskId: 'tk_existing', created: false })
    expect(createTask).not.toHaveBeenCalled()
  })
})
