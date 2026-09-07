import { expect, it } from 'vitest'
import { findChatAgent, mergeChatOperator, chatAgentPersona, chatGatewayAgentId, chatGatewaySessionKey, chatContextPrompt } from '@/lib/agent-chat-selection'

it.each([['main', 'Maggie'], ['octi', 'Octi']])('keeps the selected %s identity when the page default is Craig', (id, name) => {
  const operator = mergeChatOperator({ agentId: id }, { id, name, runtimeProvider: 'openclaw-hetzner' }, true)
  expect(chatAgentPersona(operator, 'You are Craig, the Agents page assistant.')).toContain(`You are ${name},`)
  expect(chatAgentPersona(operator, 'You are Craig, the Agents page assistant.')).not.toContain('You are Craig')
})
it('resolves the public gateway Octi ID to the shipped guide identity', () => {
  expect(findChatAgent({ 'octi-guide': { name: 'Octi' } }, 'octi', true)).toEqual({ name: 'Octi' })
  expect(findChatAgent({ 'octi-guide': { name: 'Octi' } }, 'octi', false)).toBeNull()
})
it('routes Matilda text through the gateway without modifying her voice configuration', () => {
  const stored = { id: 'matilda', name: 'Matilda', runtimeProvider: 'gemini-live' }
  expect(mergeChatOperator({ agentId: 'matilda' }, stored, true).runtimeProvider).toBe('openclaw-hetzner')
  expect(stored.runtimeProvider).toBe('gemini-live')
  expect(mergeChatOperator({ agentId: 'matilda' }, stored, false).runtimeProvider).toBe('gemini-live')
})
it('keeps the page-specific assistant when no agent was selected', () => {
  expect(chatAgentPersona({}, 'You are Craig.')).toBe('You are Craig.')
})

it('routes the public UI guide ID and session to the installed Octi agent', () => {
  expect(chatGatewayAgentId('octi-guide', true)).toBe('octi')
  expect(chatGatewaySessionKey('agent:octi-guide:agent-manager', true)).toBe('agent:octi:agent-manager')
  expect(chatGatewaySessionKey('agent:coding:agent-manager', true)).toBe('agent:coding:agent-manager')
  expect(chatGatewaySessionKey('agent:octi-guide:agent-manager', false)).toBe('agent:octi-guide:agent-manager')
})

it('uses installation-neutral context without rewriting the user message', () => {
  const lines = ['Carl is viewing his Farrington Command Center CRM.']
  const result = chatContextPrompt(lines, 'My colleague is Carl.', true)
  expect(result).toContain('the user is viewing his OpenOcti workspace.')
  expect(result).toContain('[User message]\nMy colleague is Carl.')
  expect(result).not.toContain("[Carl's message]")
  expect(chatContextPrompt(lines, 'Hello', false)).toContain("[Carl's message]")
})

it('rebinds an old Maggie conversation to the selected specialist without changing its suffix', () => {
  expect(chatGatewaySessionKey('agent:main:voice-followup', true, 'legal')).toBe('agent:legal:voice-followup')
  expect(chatGatewaySessionKey('agent:legal:voice-followup', true, 'coding')).toBe('agent:coding:voice-followup')
  expect(chatGatewaySessionKey('agent:main:voice-followup', false, 'legal')).toBe('agent:main:voice-followup')
})
