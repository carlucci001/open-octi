import crypto from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { spawn } from 'node:child_process'

const root = path.resolve(process.env.OPENOCTI_ROOT || process.cwd())
const socketPath = path.resolve(process.env.OPENOCTI_UPDATER_SOCKET || '/run/openocti-updater/control.sock')
const stateFile = path.resolve(process.env.OPENOCTI_UPDATER_STATE || '/var/lib/openocti-updater/status.json')
const token = String(process.env.OPENOCTI_UPDATER_TOKEN || '').trim()
let child = null
let state = readState()

function readState() {
  try { return JSON.parse(fs.readFileSync(stateFile, 'utf8')) } catch { return { state: 'idle', message: 'Ready to install official updates.' } }
}

function saveState(next) {
  state = { ...state, ...next, updatedAt: new Date().toISOString() }
  fs.mkdirSync(path.dirname(stateFile), { recursive: true, mode: 0o700 })
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), { mode: 0o600 })
}

function authorized(request) {
  const supplied = String(request.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token || supplied.length !== token.length) return false
  return crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(token))
}

function send(response, status, payload) {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  response.end(JSON.stringify(payload))
}

function parseBody(request) {
  return new Promise((resolve, reject) => {
    let raw = ''
    request.on('data', chunk => {
      raw += chunk
      if (raw.length > 4096) request.destroy(new Error('request too large'))
    })
    request.on('end', () => { try { resolve(JSON.parse(raw || '{}')) } catch { reject(new Error('invalid JSON')) } })
    request.on('error', reject)
  })
}

const server = http.createServer(async (request, response) => {
  if (!authorized(request)) return send(response, 401, { error: 'unauthorized' })
  if (request.method === 'GET' && request.url === '/status') return send(response, 200, state)
  if (request.method !== 'POST' || request.url !== '/install') return send(response, 404, { error: 'not found' })
  if (child) return send(response, 409, { error: 'an update is already running' })

  let body
  try { body = await parseBody(request) } catch (error) { return send(response, 400, { error: error.message }) }
  if (!/^\d+\.\d+\.\d+$/.test(String(body.version || ''))) return send(response, 400, { error: 'invalid version' })

  saveState({ state: 'queued', targetVersion: body.version, message: 'Confirmed update queued.' })
  child = spawn(process.execPath, [path.join(root, 'scripts', 'openocti-update.mjs'), 'install', '--target', body.version, '--yes'], { cwd: root, env: process.env, shell: false, stdio: ['ignore', 'pipe', 'pipe'] })
  const log = []
  const append = chunk => { log.push(...String(chunk).split(/\r?\n/).filter(Boolean)); if (log.length > 30) log.splice(0, log.length - 30) }
  child.stdout.on('data', append)
  child.stderr.on('data', append)
  child.on('error', error => { saveState({ state: 'failed', message: error.message, log }); child = null })
  child.on('close', code => {
    saveState(code === 0
      ? { state: 'complete', message: `Update ${body.version} installed and verified.`, completedVersion: body.version, log }
      : { state: 'failed', message: `Update stopped with exit code ${code}. The backup was retained.`, log })
    child = null
  })
  return send(response, 202, { state: 'queued', message: `Update ${body.version} accepted.` })
})

if (!token) {
  console.error('OPENOCTI_UPDATER_TOKEN is required.')
  process.exit(1)
}
fs.mkdirSync(path.dirname(socketPath), { recursive: true, mode: 0o755 })
try { if (fs.existsSync(socketPath)) fs.unlinkSync(socketPath) } catch {}
server.listen(socketPath, () => {
  fs.chmodSync(socketPath, 0o666)
  saveState({ state: child ? state.state : 'idle', message: 'Ready to install official updates.' })
  console.log(`OpenOcti updater listening on ${socketPath}`)
})

for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(() => process.exit(0)))
