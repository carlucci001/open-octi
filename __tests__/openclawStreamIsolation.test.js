// @vitest-environment node
import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ socket: null }))
vi.mock('ws', async () => {
  const { EventEmitter } = await import('node:events')
  return { default: class extends EventEmitter {
    constructor() { super(); state.socket = this }
    send(raw) { this.emit('sent', JSON.parse(raw)) }
    close() { this.emit('close') }
  } }
})
import { openclawChat } from '@/lib/openclaw-client'
beforeEach(() => { vi.useFakeTimers(); state.socket = null })
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers() })

function emit(message) { state.socket.emit('message', Buffer.from(JSON.stringify(message))) }
const event = (runId, message) => ({ type: 'event', event: 'chat', payload: { runId, state: 'final', message } })

it('never returns another agent reply received before or after its own send acknowledgement', async () => {
  const chunks = []
  const response = openclawChat({ message: 'Who are you?', sessionKey: 'agent:legal:test', onChunk: text => chunks.push(text) })
  state.socket.on('sent', request => {
    if (request.method === 'connect') return emit({ type: 'res', id: request.id, ok: true, payload: {} })
    if (request.method === 'chat.send') {
      emit(event('maggie-run', 'I am Maggie.'))
      // Our own terminal event can also arrive before the acknowledgement.
      emit(event('linda-run', 'I am Linda.'))
      emit({ type: 'res', id: request.id, ok: true, payload: { runId: 'linda-run' } })
      emit(event('another-run', 'I am Craig.'))
    }
  })
  state.socket.emit('open')
  await vi.advanceTimersByTimeAsync(150)
  await expect(response).resolves.toEqual({ text: 'I am Linda.', runId: 'linda-run' })
  expect(chunks.join(' ')).not.toMatch(/Maggie|Craig/)
})

it('does not append a chat delta already delivered as an assistant snapshot', async () => {
  const chunks = []
  const response = openclawChat({ message: 'Hello', sessionKey: 'agent:legal:test', onChunk: text => chunks.push(text) })
  state.socket.on('sent', request => emit({ type: 'res', id: request.id, ok: true, payload: request.method === 'chat.send' ? { runId: 'linda-run' } : {} }))
  state.socket.emit('open')
  await vi.advanceTimersByTimeAsync(150)
  emit({ type: 'event', event: 'agent', payload: { runId: 'linda-run', stream: 'assistant', data: { text: 'I am Linda.' } } })
  emit({ type: 'event', event: 'chat', payload: { runId: 'linda-run', state: 'delta', deltaText: 'Linda.' } })
  emit(event('linda-run', 'I am Linda.'))
  await expect(response).resolves.toEqual({ text: 'I am Linda.', runId: 'linda-run' })
  expect(chunks).toEqual(['I am Linda.', 'I am Linda.'])
})
