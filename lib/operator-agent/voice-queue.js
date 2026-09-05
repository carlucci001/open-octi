import crypto from 'node:crypto'
import { readData, writeData } from '@/lib/dataStore'

const FILE = 'operator-agent-voice-queue.json'

export function enqueueVoiceOperatorRun(transcript, meta = {}) {
  const data = readData(FILE) || { pending: [] }
  const item = { id: `voice-operator-${crypto.randomUUID()}`, transcript: String(transcript || '').trim(), conversationId: String(meta.conversationId || `operator-voice-${crypto.randomUUID()}`), createdAt: new Date().toISOString(), source: 'maggie-voice' }
  if (!item.transcript) throw new Error('transcript text is required')
  writeData(FILE, { pending: [...(data.pending || []), item].slice(-25), lastUpdated: item.createdAt })
  return item
}

export function takeVoiceOperatorRun() {
  const data = readData(FILE) || { pending: [] }
  const pending = Array.isArray(data.pending) ? data.pending : []
  const item = pending[0] || null
  if (item) writeData(FILE, { pending: pending.slice(1), lastUpdated: new Date().toISOString() })
  return item
}
