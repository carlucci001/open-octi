import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

import {
  MAGGIE_CALENDAR_TOOL,
  buildCalendarPrompt,
  planMaggieCalendarUpdate,
} from '../scripts/configure-maggie-calendar-tool.mjs'

const root = process.cwd()
const voiceSessionSource = fs.readFileSync(path.join(root, 'app/components/VoiceSession.js'), 'utf8')

describe('Maggie calendar client tool', () => {
  it('registers a browser handler that cannot claim success without verified booking proof', () => {
    expect(voiceSessionSource).toContain("'create_calendar_event'")
    expect(voiceSessionSource).toContain('create_calendar_event: async')
    expect(voiceSessionSource).toContain("fetch('/api/calendar/book'")
    expect(voiceSessionSource).toContain('allowReschedule: false')
    expect(voiceSessionSource).toContain('reminderMinutes')
    expect(voiceSessionSource).toContain('r.ok === true && r.verified === true && Boolean(r.bookingId)')
  })

  it('defines an exact-time client tool with an explicit reminder', () => {
    expect(MAGGIE_CALENDAR_TOOL.tool_config.type).toBe('client')
    expect(MAGGIE_CALENDAR_TOOL.tool_config.name).toBe('create_calendar_event')
    expect(MAGGIE_CALENDAR_TOOL.tool_config.parameters.required).toEqual(
      expect.arrayContaining(['name', 'startIso', 'reminderMinutes']),
    )
    expect(MAGGIE_CALENDAR_TOOL.tool_config.parameters.properties.reminderMinutes.type).toBe('integer')
  })

  it('updates only the managed calendar rules and removes obsolete calendar tool claims', () => {
    const original = [
      'You are Maggie. Keep this unrelated instruction exactly.',
      'Use nylas_create_event or calendar_create_event to put appointments on the calendar.',
    ].join('\n')

    const updated = buildCalendarPrompt(original)

    expect(updated).toContain('Keep this unrelated instruction exactly.')
    expect(updated).not.toContain('nylas_create_event')
    expect(updated).not.toContain('calendar_create_event')
    expect(updated).toContain('create_calendar_event')
    expect(updated).toContain('booking ID')
    expect(updated).toContain('Do not send an email, invitation, or video link unless Carl explicitly asks')
    expect(updated).toContain('startIso with its UTC offset')
    expect(updated).toContain('Use the farrington-dev calendar by default')
    expect(updated).toContain('Opening Calendar with navigate_to, sending email with send_email')
    expect(buildCalendarPrompt(updated)).toBe(updated)
  })

  it('preserves every existing tool ID and is idempotent when the tool is already attached', () => {
    const agent = {
      conversation_config: {
        agent: {
          prompt: {
            prompt: 'You are Maggie.',
            tool_ids: ['tool_existing_a', 'tool_calendar', 'tool_existing_b'],
          },
        },
      },
    }
    const attachedTools = [
      { id: 'tool_existing_a', name: 'find_contact', type: 'client' },
      { id: 'tool_calendar', name: 'create_calendar_event', type: 'client' },
      { id: 'tool_existing_b', name: 'send_email', type: 'client' },
    ]

    const first = planMaggieCalendarUpdate(agent, attachedTools)
    const after = structuredClone(agent)
    after.conversation_config.agent.prompt.prompt = first.nextPrompt
    after.conversation_config.agent.prompt.tool_ids = first.nextToolIds
    const second = planMaggieCalendarUpdate(after, attachedTools)

    expect(first.nextToolIds).toEqual(agent.conversation_config.agent.prompt.tool_ids)
    expect(first.needsToolCreation).toBe(false)
    expect(second.promptChanged).toBe(false)
    expect(second.needsPatch).toBe(false)
  })

  it('plans an append without inventing or deleting tool IDs', () => {
    const agent = {
      conversation_config: {
        agent: { prompt: { prompt: 'You are Maggie.', tool_ids: ['tool_a', 'tool_b'] } },
      },
    }

    const plan = planMaggieCalendarUpdate(agent, [
      { id: 'tool_a', name: 'find_contact', type: 'client' },
      { id: 'tool_b', name: 'send_email', type: 'client' },
    ])

    expect(plan.currentToolIds).toEqual(['tool_a', 'tool_b'])
    expect(plan.nextToolIds).toEqual(['tool_a', 'tool_b'])
    expect(plan.needsToolCreation).toBe(true)
    expect(plan.needsPatch).toBe(true)
  })
})
