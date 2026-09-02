import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { randomUUID, timingSafeEqual } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { DeepSeekHarness } from '@deepseek-ai/dsh-sdk-client'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const HOST = String(process.env.HOST || '127.0.0.1').trim()
const PORT = Number(process.env.PORT || 3091)
const STATE_DIR = path.resolve(process.env.DSH_STATE_DIR || '/var/lib/farrington-deepseek-harness')
const CONFIG_PATH = path.resolve(process.env.DSH_CONFIG_PATH || path.join(HERE, 'cordis.yml'))
const DEMO_BIN = path.join(HERE, 'node_modules', '@deepseek-ai', 'dsh-sdk-jsonrpc-demo', 'lib', 'bin.js')
const MODEL = String(process.env.DSH_MODEL || 'deepseek-v4-flash').trim()
const MAX_BODY_BYTES = 256 * 1024
const MAX_PROMPT_CHARS = 48_000
const MAX_REQUESTS_PER_MINUTE = 10
const REQUEST_TIMEOUT_MS = 150_000

if (HOST !== '127.0.0.1') throw new Error('DeepSeek Harness bridge must bind to 127.0.0.1')
if (!Number.isInteger(PORT) || PORT < 1024 || PORT > 65535) throw new Error('Invalid bridge port')

function readCredential(name, envName) {
  const direct = String(process.env[envName] || '').trim()
  if (direct) return direct
  const explicitFile = String(process.env[`${envName}_FILE`] || '').trim()
  const systemdFile = process.env.CREDENTIALS_DIRECTORY
    ? path.join(process.env.CREDENTIALS_DIRECTORY, name)
    : ''
  const filename = explicitFile || systemdFile
  if (!filename) return ''
  try {
    return fs.readFileSync(filename, 'utf8').trim()
  } catch {
    return ''
  }
}

const API_KEY = readCredential('deepseek_api_key', 'DEEPSEEK_API_KEY')
const BRIDGE_TOKEN = readCredential('bridge_token', 'DEEPSEEK_HARNESS_BRIDGE_TOKEN')
if (!API_KEY) throw new Error('DeepSeek API credential is unavailable')
if (BRIDGE_TOKEN.length < 32) throw new Error('Bridge token must contain at least 32 characters')

fs.mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 })
const REQUESTS_DIR = path.join(STATE_DIR, 'requests')
fs.rmSync(REQUESTS_DIR, { recursive: true, force: true })
fs.mkdirSync(REQUESTS_DIR, { recursive: true, mode: 0o700 })

let busy = false
let recentRequests = []
let activeOperation = null

function authorized(request) {
  const supplied = String(request.headers.authorization || '').replace(/^Bearer\s+/i, '')
  const expected = Buffer.from(BRIDGE_TOKEN)
  const actual = Buffer.from(supplied)
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

function sendJson(response, status, payload) {
  if (response.writableEnded) return
  const body = JSON.stringify(payload)
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  response.end(body)
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    request.on('data', chunk => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('request-too-large'))
        request.destroy()
        return
      }
      chunks.push(chunk)
    })
    request.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(new Error('invalid-json'))
      }
    })
    request.on('error', reject)
  })
}

function withinRateLimit() {
  const cutoff = Date.now() - 60_000
  recentRequests = recentRequests.filter(value => value >= cutoff)
  if (recentRequests.length >= MAX_REQUESTS_PER_MINUTE) return false
  recentRequests.push(Date.now())
  return true
}

async function removeEphemeralDirectory(directory) {
  try {
    await fs.promises.rm(directory, { recursive: true, force: true })
  } catch (error) {
    console.warn(`[dax-bridge] cleanup_failed code=${String(error?.code || 'unknown')}`)
  }
}

async function runHarness(prompt, requestId, request, response) {
  const requestRoot = path.join(REQUESTS_DIR, requestId)
  const workspace = path.join(requestRoot, 'workspace')
  const sessionRoot = path.join(requestRoot, 'sessions')
  await fs.promises.mkdir(workspace, { recursive: true, mode: 0o700 })
  await fs.promises.mkdir(sessionRoot, { recursive: true, mode: 0o700 })

  const childEnv = {
    HOME: STATE_DIR,
    PATH: '/usr/local/bin:/usr/bin:/bin',
    NODE_ENV: 'production',
    NO_COLOR: '1',
    DEEPSEEK_API_KEY: API_KEY,
    DSH_CWD: workspace,
    DSH_SESSION_ROOT: sessionRoot,
    DSH_SYSTEM_PROMPT: 'You are Dax, Farrington Command Center\'s conversation-only experimental DeepSeek Harness assistant. You have no tools. Never claim that you changed files, CRM records, or external systems.',
    DSH_TELEMETRY_DISABLED: '1',
  }

  let harness
  let closing
  let cleaning
  const closeHarness = () => {
    if (!harness) return Promise.resolve()
    if (!closing) closing = harness.close().catch(() => {})
    return closing
  }
  const cleanup = () => {
    if (!cleaning) {
      cleaning = (async () => {
        await closeHarness()
        await removeEphemeralDirectory(requestRoot)
      })()
    }
    return cleaning
  }
  activeOperation = { requestId, close: closeHarness, cleanup }
  const disconnect = () => {
    if (!response.writableEnded) void closeHarness()
  }
  request.once('aborted', disconnect)
  response.once('close', disconnect)

  try {
    harness = new DeepSeekHarness({
      launch: {
        command: process.execPath,
        args: [DEMO_BIN, CONFIG_PATH],
        cwd: HERE,
        env: childEnv,
        requestTimeoutMs: REQUEST_TIMEOUT_MS,
        shutdownTimeoutMs: 1_000,
        disposeEofGraceMs: 6_000,
        disposeGraceMs: 3_000,
      },
      cwd: workspace,
      provider: 'deepseek-official',
      model: MODEL,
      maxTokens: 8_192,
    })
    const result = await harness.run(prompt)
    return String(result?.finalResponse || '').trim()
  } finally {
    request.off('aborted', disconnect)
    response.off('close', disconnect)
    await cleanup()
    if (activeOperation?.requestId === requestId) activeOperation = null
  }
}

const server = http.createServer(async (request, response) => {
  if (request.method === 'GET' && request.url === '/healthz') {
    return sendJson(response, 200, {
      ok: true,
      runtime: 'deepseek-harness',
      version: '0.1.0-rc.7',
      model: MODEL,
      profile: 'chat-only',
      tools: [],
      busy,
    })
  }
  if (request.method !== 'POST' || request.url !== '/v1/chat') {
    return sendJson(response, 404, { ok: false, error: 'not-found' })
  }
  if (!authorized(request)) return sendJson(response, 401, { ok: false, error: 'unauthorized' })
  if (busy) return sendJson(response, 429, { ok: false, error: 'busy' })
  if (!withinRateLimit()) return sendJson(response, 429, { ok: false, error: 'rate-limited' })

  const requestId = randomUUID()
  const startedAt = Date.now()
  busy = true
  try {
    const payload = await readJson(request)
    const prompt = typeof payload?.prompt === 'string' ? payload.prompt.trim() : ''
    if (!prompt || prompt.length > MAX_PROMPT_CHARS) {
      return sendJson(response, 422, { ok: false, error: 'invalid-prompt', requestId })
    }
    const text = await runHarness(prompt, requestId, request, response)
    if (!text) throw new Error('empty-response')
    console.log(`[dax-bridge] completed requestId=${requestId} durationMs=${Date.now() - startedAt} inputChars=${prompt.length} outputChars=${text.length}`)
    return sendJson(response, 200, {
      ok: true,
      requestId,
      text,
      model: MODEL,
      profile: 'chat-only',
    })
  } catch (error) {
    console.warn(`[dax-bridge] failed requestId=${requestId} durationMs=${Date.now() - startedAt} type=${String(error?.constructor?.name || 'Error')}`)
    return sendJson(response, 502, { ok: false, error: 'harness-unavailable', requestId })
  } finally {
    busy = false
  }
})

server.requestTimeout = 170_000
server.headersTimeout = 10_000
server.keepAliveTimeout = 5_000
server.listen(PORT, HOST, () => {
  console.log(`[dax-bridge] ready host=${HOST} port=${PORT} profile=chat-only tools=0`)
})

async function shutdown(signal) {
  console.log(`[dax-bridge] shutdown signal=${signal}`)
  const activeCleanup = activeOperation?.cleanup?.() || Promise.resolve()
  server.close(async () => {
    await activeCleanup
    process.exit(0)
  })
  await activeCleanup
  setTimeout(() => process.exit(1), 15_000).unref()
}

process.once('SIGTERM', () => { void shutdown('SIGTERM') })
process.once('SIGINT', () => { void shutdown('SIGINT') })
