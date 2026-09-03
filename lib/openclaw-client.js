import WebSocket from 'ws'
import { randomUUID } from 'crypto'

const DEFAULT_SESSION = 'agent:main:screen-control-v2'

export function mergeOpenClawChatDelta(currentText, payload) {
  const current = typeof currentText === 'string' ? currentText : ''
  const delta = typeof payload?.deltaText === 'string' ? payload.deltaText : ''
  if (!delta) return current
  if (payload?.replace === true || delta.startsWith(current)) return delta
  return `${current}${delta}`
}

export function openClawMessageText(message) {
  if (typeof message === 'string') return message.trim()
  const content = Array.isArray(message?.content) ? message.content : []
  return content
    .map((part) => typeof part === 'string' ? part : (typeof part?.text === 'string' ? part.text : ''))
    .join('')
    .trim()
}

export function resolveOpenclawGateway(env = process.env) {
  const host = String(env.OPENCLAW_HOST || 'localhost').trim()
  const port = String(env.OPENCLAW_PORT || '18789').trim()
  const protocol = String(env.OPENCLAW_PROTOCOL || 'http').trim().toLowerCase() === 'https' ? 'https' : 'http'
  return {
    host,
    port,
    origin: `${protocol}://${host}:${port}`,
    wsUrl: `${protocol === 'https' ? 'wss' : 'ws'}://${host}:${port}/__openclaw__/gateway/ws`,
    token: String(env.OPENCLAW_GATEWAY_TOKEN || env.OPENCLAW_API_KEY || '').trim(),
  }
}

export async function openclawChat({ message, sessionKey = DEFAULT_SESSION, token, onChunk, firstChunkMs = 45000, betweenChunksMs = 6000, maxMs = 300000 }) {
  return new Promise((resolve, reject) => {
    const gateway = resolveOpenclawGateway()
    const gatewayToken = token || gateway.token
    const ws = new WebSocket(gateway.wsUrl, { headers: { Origin: gateway.origin }, handshakeTimeout: 10000 })
    const pending = new Map()
    let settled = false
    let fullText = ''
    let runId = null
    let gotFirstChunk = false
    let idleTimer = null
    const maxTimer = setTimeout(() => done(new Error(`OpenClaw exceeded ${maxMs}ms`)), maxMs)

    const done = (err, text) => {
      if (settled) return
      settled = true
      clearTimeout(maxTimer); if (idleTimer) clearTimeout(idleTimer)
      try { ws.close() } catch {}
      if (err) reject(err); else resolve({ text, runId })
    }
    const armIdle = () => {
      if (idleTimer) clearTimeout(idleTimer)
      const ms = gotFirstChunk ? betweenChunksMs : firstChunkMs
      idleTimer = setTimeout(() => {
        if (!gotFirstChunk) done(new Error(`OpenClaw didn't start responding within ${firstChunkMs}ms — is DeepSeek reachable? Check OpenClaw logs.`))
        else done(null, fullText || '(empty response)')
      }, ms)
    }

    const call = (method, params) => new Promise((res, rej) => {
      const id = randomUUID()
      pending.set(id, { res, rej })
      ws.send(JSON.stringify({ type: 'req', id, method, params }))
      setTimeout(() => { if (pending.has(id)) { pending.delete(id); rej(new Error(`${method} timeout`)) } }, 15000)
    })

    ws.on('open', async () => {
      try {
        await new Promise(r => setTimeout(r, 150))
        await call('connect', {
          minProtocol: 4, maxProtocol: 4,
          client: { id: 'openclaw-control-ui', version: 'farrington-crm', platform: 'web', mode: 'webchat', instanceId: randomUUID() },
          role: 'operator',
          // 4.26 split scopes into granular names. The catch-all 'operator.admin'
          // is not enough on its own. This list matches what the bundled control-ui
          // requests and is the canonical client.
          scopes: ['operator.admin', 'operator.approvals', 'operator.pairing', 'operator.read', 'operator.write'],
          caps: ['tool-events'],
          auth: { token: gatewayToken }, userAgent: 'OpenOcti/1.0', locale: 'en-US',
        })
        const r = await call('chat.send', { sessionKey, message, deliver: true, idempotencyKey: randomUUID() })
        runId = r?.runId
        armIdle() // start the "waiting for first chunk" timer
      } catch (e) { done(e) }
    })

    ws.on('message', (data) => {
      let m
      try { m = JSON.parse(data.toString()) } catch { return }

      if (m.type === 'res' && pending.has(m.id)) {
        const p = pending.get(m.id); pending.delete(m.id)
        m.ok ? p.res(m.payload) : p.rej(new Error(m.error?.message || 'request rejected'))
        return
      }

      if (m.type !== 'event') return
      const payload = m.payload || {}

      // Ignore other runs
      if (payload.runId && runId && payload.runId !== runId) return

      // Assistant streaming text (DeepSeek's growing reply)
      if (m.event === 'agent' && payload.stream === 'assistant') {
        const text = payload.data?.text
        if (typeof text === 'string') {
          fullText = text
          gotFirstChunk = true
          if (typeof onChunk === 'function') try { onChunk(fullText) } catch {}
        }
        armIdle()
        return
      }

      // Chat event with final state
      if (m.event === 'chat') {
        const state = payload.state
        if (state === 'final' || state === 'done' || state === 'complete' || state === 'settled') {
          // Extract final text if present
          const finalText = openClawMessageText(payload.message)
          if (finalText) fullText = finalText
          return done(null, fullText)
        }
        // Keep resetting idle on delta
        if (state === 'delta') {
          fullText = mergeOpenClawChatDelta(fullText, payload)
          gotFirstChunk = true
          if (typeof onChunk === 'function') try { onChunk(fullText) } catch {}
          armIdle()
        }
        return
      }

      // Lifecycle end
      if (m.event === 'agent' && payload.stream === 'lifecycle') {
        const phase = payload.data?.phase
        if (phase === 'end' || phase === 'complete' || phase === 'finished' || phase === 'done' || phase === 'stop') {
          // OpenClaw broadcasts lifecycle end immediately before its terminal
          // chat event. Keep the socket alive long enough to receive that final.
          gotFirstChunk = true
          armIdle()
          return
        }
      }
    })

    ws.on('error', (e) => done(e))
    ws.on('close', () => { if (!settled) done(null, fullText) })
  })
}
