#!/usr/bin/env node
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { WebSocketServer, WebSocket } from 'ws'
import bridge from '../lib/twilio-agent-bridge.js'

const require = createRequire(import.meta.url)

function loadDotEnvFile(filename) {
  const filePath = path.join(process.cwd(), filename)
  if (!fs.existsSync(filePath)) return
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue
    const index = trimmed.indexOf('=')
    const key = trimmed.slice(0, index).trim()
    let value = trimmed.slice(index + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (key && process.env[key] === undefined) process.env[key] = value
  }
}

loadDotEnvFile('.env')
loadDotEnvFile('.env.local')

const PORT = Number(process.env.TWILIO_AGENT_BRIDGE_PORT || bridge.DEFAULT_BRIDGE_PORT || 8788)
const PATHNAME = process.env.TWILIO_AGENT_BRIDGE_PATH || bridge.DEFAULT_STREAM_PATH || '/twilio-agent-stream'
const OPENAI_WS = 'wss://api.openai.com/v1/realtime'
const startedAt = new Date()
const sessions = new Map()

const TRANSFER_AGENTS = [
  { id: 'matilda', names: ['matilda'], label: 'Matilda' },
  { id: 'main', names: ['maggie', 'main'], label: 'Maggie' },
  { id: 'coding', names: ['craig', 'coding'], label: 'Craig' },
  { id: 'finance-manager', names: ['frank', 'frankie', 'finance'], label: 'Frank' },
  { id: 'social-media', names: ['sasha', 'social'], label: 'Sasha' },
  { id: 'legal', names: ['linda', 'legal'], label: 'Linda' },
  { id: 'communications', names: ['cameron', 'communications'], label: 'Cameron' },
  { id: 'ContentHub-promoter', names: ['mark', 'marketing'], label: 'Mark' },
  { id: 'doreen', names: ['doreen', 'reception'], label: 'Doreen' },
  { id: 'diane', names: ['diane', 'morning'], label: 'Diane' },
]

const TRANSFER_TOOL = {
  type: 'function',
  name: 'transfer_to_agent',
  description: 'Immediately transfer this active phone conversation to another named Farrington agent. Use this when the caller asks for Craig, Maggie, Frank, Sasha, Linda, Cameron, Mark, Doreen, Diane, Matilda, or another teammate. Do not claim transfers are unavailable.',
  parameters: {
    type: 'object',
    properties: {
      agentName: { type: 'string', description: 'Target agent name, such as Craig, Maggie, Frank, Sasha, Linda, Cameron, Mark, Doreen, Diane, or Matilda.' },
      reason: { type: 'string', description: 'Optional concise reason for the handoff.' },
    },
    required: ['agentName'],
    additionalProperties: false,
  },
}

function log(message, extra = {}) {
  const fields = Object.entries(extra).filter(([, value]) => value !== undefined && value !== '')
  const suffix = fields.length ? ` ${fields.map(([key, value]) => `${key}=${String(value)}`).join(' ')}` : ''
  console.log(`[twilio-agent-bridge] ${message}${suffix}`)
}

function json(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(payload))
}

function closeSocket(ws, code = 1000, reason = 'done') {
  try {
    if (ws && ws.readyState === WebSocket.OPEN) ws.close(code, reason)
  } catch {}
}

function sendJson(ws, payload) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return false
  ws.send(JSON.stringify(payload))
  return true
}

function normalizeAgentName(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .replace(/\b(agent|assistant|team|department|person)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function resolveTransferAgent(value = '') {
  const normalized = normalizeAgentName(value)
  if (!normalized) return null
  return TRANSFER_AGENTS.find(agent => {
    if (agent.id === normalized) return true
    return agent.names.some(name => normalized === name || normalized.includes(name))
  }) || null
}

function detectTranscriptTransfer(transcript = '') {
  const text = normalizeAgentName(transcript)
  if (!/\b(transfer|send|connect|route|switch|handoff|hand off|get me|put me through|talk to|speak to|speak with)\b/.test(text)) return null
  return TRANSFER_AGENTS.find(agent => agent.names.some(name => new RegExp(`(^|\\s)${name}(?=\\s|$)`).test(text))) || null
}

function agentInstructions(state) {
  const agent = resolveTransferAgent(state.agentId)
  const label = agent?.label || state.agentId || 'a Farrington Command Center voice agent'
  return [
    `You are ${label} answering a phone call through the Farrington-owned Twilio bridge.`,
    'Keep replies short, natural, interruption-friendly, and useful.',
    'You are not ElevenLabs. You are running through the Farrington Hetzner voice bridge.',
    state.prompt ? `Session instruction: ${state.prompt}` : '',
    state.transferReason ? `Transfer context: ${state.transferReason}` : '',
    'If the caller asks to speak with another Farrington agent, call transfer_to_agent immediately. Say only a brief confirmation such as "Transferring now" or "Sending you to Craig now." Do not say transfers are unavailable or being prepared.',
  ].filter(Boolean).join('\n\n')
}

function applyAgentTransfer(state, target, reason = '', source = 'tool') {
  if (!target) return 'I need the target agent name to transfer.'
  if (state.agentId === target.id) return `You are already speaking with ${target.label}.`
  const now = Date.now()
  if (state.lastTransferAt && now - state.lastTransferAt < 1500) return `Transferring now.`
  const from = state.agentId || 'unknown'
  state.agentId = target.id
  state.transferReason = reason || ''
  state.lastTransferAt = now
  log('agent transfer applied', { callSid: state.callSid, streamSid: state.streamSid, from, to: target.id, source })
  sendJson(state.upstream, {
    type: 'session.update',
    session: {
      instructions: agentInstructions(state),
      tools: [TRANSFER_TOOL],
      tool_choice: 'auto',
    },
  })
  sendJson(state.upstream, {
    type: 'response.create',
    response: {
      modalities: ['audio', 'text'],
      instructions: `Say one short sentence confirming the transfer is complete and continue as ${target.label}.`,
    },
  })
  return `Transferred to ${target.label}.`
}

function handleTransferToolCall(state, call) {
  const callId = call?.call_id
  let args = {}
  try { args = call?.arguments ? JSON.parse(call.arguments) : {} } catch {}
  const requested = args.agentName || args.agent_name || args.name || args.target || args.agentId || ''
  const target = resolveTransferAgent(requested)
  const output = target
    ? applyAgentTransfer(state, target, args.reason || '', 'function_call')
    : `No phone voice agent named "${requested || 'unknown'}" is available. Available agents: ${TRANSFER_AGENTS.map(agent => agent.label).join(', ')}.`
  if (callId) {
    sendJson(state.upstream, {
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: callId,
        output,
      },
    })
  }
}

function sendTwilioAudio(state, payload) {
  if (!state.streamSid || !payload) return
  sendJson(state.twilio, {
    event: 'media',
    streamSid: state.streamSid,
    media: { payload },
  })
}

function sendTwilioClear(state) {
  if (!state.streamSid) return
  sendJson(state.twilio, { event: 'clear', streamSid: state.streamSid })
}

function openAiKeyCandidates() {
  const candidates = []
  const seen = new Set()
  const add = (source, label, key) => {
    const value = String(key || '').trim()
    if (!value || seen.has(value)) return
    seen.add(value)
    candidates.push({ source, label, key: value, suffix: value.length > 6 ? value.slice(-6) : '' })
  }

  try {
    const Database = require('better-sqlite3')
    const dbPath = path.join(process.cwd(), 'data/crm.sqlite')
    if (fs.existsSync(dbPath)) {
      const db = new Database(dbPath, { readonly: true })
      const row = db.prepare("select data from kv_store where filename = ?").get('credentials.json')
      db.close()
      const data = row?.data ? JSON.parse(row.data) : { credentials: [] }
      for (const cred of data.credentials || []) {
        if (!/openai/i.test(cred?.name || '')) continue
        for (const field of cred.fields || []) {
          if (/key|token|api|codex/i.test(field?.label || '')) add('vault', `${cred.name || 'OpenAI'}:${field.label || 'key'}`, field.value)
        }
      }
    }
  } catch (error) {
    log('vault key scan skipped', { message: error.message })
  }

  add('env', 'OPENAI_API_KEY', process.env.OPENAI_API_KEY)
  add('env', 'OPENAI_ADMIN_KEY', process.env.OPENAI_ADMIN_KEY)
  return candidates
}

function connectOpenAI(state, candidateIndex = 0) {
  const candidates = state.openAiCandidates || openAiKeyCandidates()
  state.openAiCandidates = candidates
  const candidate = candidates[candidateIndex]
  if (!candidate) {
    log('openai unavailable', { callSid: state.callSid, reason: 'missing_OPENAI_API_KEY' })
    closeSocket(state.twilio, 1011, 'OpenAI key not configured')
    return
  }

  const model = state.model || bridge.defaultModel('openai')
  const voice = bridge.normalizeVoice('openai', state.voiceName)
  const upstream = new WebSocket(`${OPENAI_WS}?model=${encodeURIComponent(model)}`, {
    headers: {
      Authorization: `Bearer ${candidate.key}`,
      'OpenAI-Beta': 'realtime=v1',
    },
    handshakeTimeout: 15000,
  })
  state.upstream = upstream

  upstream.on('open', () => {
    log('openai connected', { callSid: state.callSid, streamSid: state.streamSid, agent: state.agentId, model, voice, keySource: candidate.source, keySuffix: candidate.suffix })
    sendJson(upstream, {
      type: 'session.update',
      session: {
        type: 'realtime',
        model,
        instructions: agentInstructions(state),
        modalities: ['text', 'audio'],
        voice,
        input_audio_format: 'g711_ulaw',
        output_audio_format: 'g711_ulaw',
        input_audio_transcription: { model: 'gpt-4o-mini-transcribe' },
        turn_detection: { type: 'server_vad', threshold: 0.5, silence_duration_ms: 700 },
        tools: [TRANSFER_TOOL],
        tool_choice: 'auto',
      },
    })
    if (state.greeting) {
      sendJson(upstream, {
        type: 'response.create',
        response: {
          modalities: ['audio', 'text'],
          instructions: state.greeting,
        },
      })
    }
  })

  upstream.on('message', raw => {
    let event
    try { event = JSON.parse(raw.toString()) } catch { return }
    if (event.type === 'response.audio.delta' || event.type === 'response.output_audio.delta') {
      sendTwilioAudio(state, event.delta)
    } else if (event.type === 'input_audio_buffer.speech_started') {
      sendTwilioClear(state)
    } else if (event.type === 'conversation.item.input_audio_transcription.completed' && event.transcript) {
      const target = detectTranscriptTransfer(event.transcript)
      if (target) applyAgentTransfer(state, target, event.transcript, 'transcript')
    } else if (event.type === 'response.done') {
      const calls = (event.response?.output || []).filter(item => item.type === 'function_call' && item.name === 'transfer_to_agent')
      for (const call of calls) handleTransferToolCall(state, call)
    } else if (event.type === 'response.function_call_arguments.done' && event.name === 'transfer_to_agent') {
      handleTransferToolCall(state, event)
    } else if (event.type === 'error') {
      log('openai error', { callSid: state.callSid, message: event.error?.message || 'unknown' })
    }
  })

  upstream.on('close', (code, reason) => {
    log('openai closed', { callSid: state.callSid, code, reason: reason?.toString?.() || '' })
    closeSocket(state.twilio, 1000, 'provider closed')
  })

  upstream.on('error', error => {
    log('openai websocket error', { callSid: state.callSid, message: error.message, keySource: candidate.source, keySuffix: candidate.suffix })
    closeSocket(state.twilio, 1011, 'provider error')
  })

  upstream.on('unexpected-response', (_request, response) => {
    log('openai unexpected response', { callSid: state.callSid, status: response.statusCode, keySource: candidate.source, keySuffix: candidate.suffix })
    if ((response.statusCode === 401 || response.statusCode === 403) && candidateIndex + 1 < candidates.length) {
      connectOpenAI(state, candidateIndex + 1)
      return
    }
    closeSocket(state.twilio, 1011, 'provider authentication failed')
  })
}

function connectProvider(state) {
  if (state.provider === 'gemini') {
    log('gemini adapter not live yet', { callSid: state.callSid, agent: state.agentId })
    closeSocket(state.twilio, 1011, 'Gemini bridge adapter requires audio conversion')
    return
  }
  connectOpenAI(state)
}

function handleTwilioMessage(state, raw) {
  let event
  try { event = JSON.parse(raw.toString()) } catch { return }
  if (event.event === 'connected') return

  if (event.event === 'start') {
    const params = event.start?.customParameters || {}
    const requiredToken = process.env.TWILIO_AGENT_BRIDGE_TOKEN || ''
    if (requiredToken && params.bridgeToken !== requiredToken) {
      log('rejected stream token', { streamSid: event.start?.streamSid, callSid: event.start?.callSid })
      closeSocket(state.twilio, 1008, 'bridge token required')
      return
    }

    state.streamSid = event.start?.streamSid || event.streamSid
    state.callSid = event.start?.callSid || ''
    state.provider = bridge.providerFrom(params.provider || process.env.TWILIO_AGENT_PROVIDER || 'openai')
    state.agentId = bridge.clean(params.agentId, 'matilda', 80)
    state.model = bridge.clean(params.model, bridge.defaultModel(state.provider), 120)
    state.voiceName = bridge.clean(params.voiceName, bridge.defaultVoice(state.provider), 80)
    state.leaseId = bridge.clean(params.leaseId, '', 80)
    state.clientId = bridge.clean(params.clientId, '', 80)
    state.prompt = bridge.clean(params.prompt, '', 1000)
    state.greeting = bridge.clean(params.greeting, '', 300)
    sessions.set(state.streamSid, state)
    log('twilio stream started', { callSid: state.callSid, streamSid: state.streamSid, provider: state.provider, agent: state.agentId })
    connectProvider(state)
    return
  }

  if (event.event === 'media') {
    if (!event.media?.payload || !state.upstream || state.upstream.readyState !== WebSocket.OPEN) return
    sendJson(state.upstream, { type: 'input_audio_buffer.append', audio: event.media.payload })
    return
  }

  if (event.event === 'stop') {
    log('twilio stream stopped', { callSid: state.callSid, streamSid: state.streamSid })
    closeSocket(state.upstream, 1000, 'twilio stopped')
    closeSocket(state.twilio, 1000, 'twilio stopped')
  }
}

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    json(res, 200, {
      ok: true,
      service: 'farrington-voice-bridge',
      path: PATHNAME,
      uptimeSeconds: Math.round((Date.now() - startedAt.getTime()) / 1000),
      activeStreams: sessions.size,
      providers: {
        openai: Boolean(process.env.OPENAI_API_KEY),
        gemini: Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY),
      },
    })
    return
  }
  json(res, 404, { ok: false, error: 'not found' })
})

const wss = new WebSocketServer({ noServer: true })

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url || '/', 'http://localhost')
  if (url.pathname !== PATHNAME) {
    socket.destroy()
    return
  }
  wss.handleUpgrade(req, socket, head, ws => {
    const state = { twilio: ws, connectedAt: new Date().toISOString() }
    ws.on('message', raw => handleTwilioMessage(state, raw))
    ws.on('close', () => {
      if (state.streamSid) sessions.delete(state.streamSid)
      closeSocket(state.upstream, 1000, 'twilio socket closed')
      log('twilio socket closed', { callSid: state.callSid, streamSid: state.streamSid })
    })
    ws.on('error', error => log('twilio websocket error', { message: error.message }))
  })
})

server.listen(PORT, '127.0.0.1', () => {
  log('listening', { port: PORT, path: PATHNAME })
})
