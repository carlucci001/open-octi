// Read-only Twilio comms capture. Polls the Calls and Messages logs on a
// schedule and files inbound calls/texts into the owner-inbox feed.
// HARD GUARDRAIL (Carl): this runner NEVER writes to Twilio. The live number
// routing/config is untouchable — GET requests only.
import { readData, writeData } from './dataStore'
import { getTwilioConfig, twilioRequest } from './twilio-account-control'
import { recordInboundItem } from './inbound-ingest'
import { pushNtfy } from './ntfy'

const CURSOR_FILE = 'twilio-comms-cursor.json'
const FIRST_RUN_LOOKBACK_MS = 24 * 60 * 60 * 1000
const QUERY_LOOKBACK_MS = 48 * 60 * 60 * 1000
const NOTIFY_CAP = 5

function readCursor() {
  const data = readData(CURSOR_FILE)
  return {
    lastCallAt: Number(data?.lastCallAt) || 0,
    lastSmsAt: Number(data?.lastSmsAt) || 0,
  }
}

function writeCursor(cursor) {
  writeData(CURSOR_FILE, { ...cursor, updatedAt: new Date().toISOString() })
}

function parseTs(value) {
  const ts = Date.parse(value || '')
  return Number.isFinite(ts) ? ts : 0
}

function dateArg(sinceMs) {
  return new Date(sinceMs).toISOString().slice(0, 10)
}

async function listInboundCalls(config, sinceMs) {
  const data = await twilioRequest(config, `/Calls.json?PageSize=100&StartTime%3E=${dateArg(sinceMs)}`)
  return (data?.calls || []).filter(call => call.direction === 'inbound' && parseTs(call.start_time) > sinceMs)
}

async function listInboundSms(config, sinceMs) {
  const data = await twilioRequest(config, `/Messages.json?PageSize=100&DateSent%3E=${dateArg(sinceMs)}`)
  return (data?.messages || []).filter(msg => String(msg.direction || '').startsWith('inbound') && parseTs(msg.date_sent) > sinceMs)
}

export async function runTwilioCommsPoll() {
  const config = getTwilioConfig()
  if (!config) return { ok: true, skipped: 'twilio_not_configured' }

  const now = Date.now()
  const cursor = readCursor()
  const callSince = Math.max(cursor.lastCallAt || (now - FIRST_RUN_LOOKBACK_MS), now - QUERY_LOOKBACK_MS)
  const smsSince = Math.max(cursor.lastSmsAt || (now - FIRST_RUN_LOOKBACK_MS), now - QUERY_LOOKBACK_MS)

  const [calls, texts] = await Promise.all([
    listInboundCalls(config, callSince),
    listInboundSms(config, smsSince),
  ])

  const total = calls.length + texts.length
  const notifyEach = total > 0 && total <= NOTIFY_CAP
  let recorded = 0
  let newestCall = cursor.lastCallAt
  let newestSms = cursor.lastSmsAt

  for (const call of calls) {
    const ts = parseTs(call.start_time)
    const duration = Number(call.duration) || 0
    const result = await recordInboundItem({
      provider: 'twilio',
      providerMessageId: call.sid,
      kind: 'call',
      from: String(call.from || 'unknown'),
      to: [String(call.to || '')],
      phone: String(call.from || ''),
      subject: `Inbound call from ${call.from || 'unknown'}`,
      body: `Status: ${call.status || 'unknown'}${duration ? `, ${duration}s` : ''} → ${call.to || ''}`,
      receivedAt: ts ? new Date(ts).toISOString() : new Date().toISOString(),
      allowCatchAll: true,
      keepSpam: true,
    }, { notify: notifyEach })
    if (result.ok) recorded += 1
    if (ts > newestCall) newestCall = ts
  }

  for (const msg of texts) {
    const ts = parseTs(msg.date_sent)
    const result = await recordInboundItem({
      provider: 'twilio',
      providerMessageId: msg.sid,
      kind: 'sms',
      from: String(msg.from || 'unknown'),
      to: [String(msg.to || '')],
      phone: String(msg.from || ''),
      subject: `Text from ${msg.from || 'unknown'}`,
      body: String(msg.body || ''),
      receivedAt: ts ? new Date(ts).toISOString() : new Date().toISOString(),
      allowCatchAll: true,
      keepSpam: true,
    }, { notify: notifyEach })
    if (result.ok) recorded += 1
    if (ts > newestSms) newestSms = ts
  }

  if (total > NOTIFY_CAP && recorded > 0) {
    await pushNtfy({
      title: `${recorded} new inbound comms (calls/texts)`,
      body: `${calls.length} call${calls.length === 1 ? '' : 's'}, ${texts.length} text${texts.length === 1 ? '' : 's'} captured from Twilio logs.`,
      tags: ['telephone_receiver'],
    })
  }

  if (newestCall !== cursor.lastCallAt || newestSms !== cursor.lastSmsAt) {
    writeCursor({ lastCallAt: newestCall, lastSmsAt: newestSms })
  }

  return { ok: true, calls: calls.length, texts: texts.length, recorded }
}
