// @vitest-environment node
import http from 'node:http'
import net from 'node:net'
import { createHash, randomBytes } from 'node:crypto'
import { once } from 'node:events'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { attachDashboardUpgrade, DashboardHttpServer } from '../deploy/openclaw-dashboard-proxy.mjs'
import { OPENCLAW_DASHBOARD_PATH, openClawDashboardLocation, resolveOpenClawDashboardBase, isDashboardBrowserOrigin } from '../lib/openclaw-dashboard.js'

const cleanup = []
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close() })
async function listen(server) {
  const sockets = new Set()
  server.on('connection', socket => {
    sockets.add(socket)
    socket.on('error', () => {})
    socket.once('close', () => sockets.delete(socket))
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  cleanup.push(async () => {
    for (const socket of sockets) socket.destroy()
    await new Promise(resolve => server.close(resolve))
  })
  return server.address().port
}
async function requestUpgrade(port, { origin = `http://127.0.0.1:${port}`, path = `${OPENCLAW_DASHBOARD_PATH}/`, head = '' } = {}) {
  const socket = net.connect(port, '127.0.0.1')
  cleanup.push(() => socket.destroy())
  let received = ''
  socket.on('data', chunk => { received += chunk.toString() })
  await once(socket, 'connect')
  const nonce = randomBytes(16).toString('base64')
  socket.write(`GET ${path} HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nOrigin: ${origin}\r\nCookie: session=private-crm-session\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: ${nonce}\r\n\r\n${head}`)
  return { socket, text: () => received }
}
async function gateway(prefix = '') {
  const seen = []
  const upstream = http.createServer()
  upstream.on('upgrade', (request, socket, head) => {
    seen.push({ url: request.url, headers: request.headers })
    const accept = createHash('sha1').update(request.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64')
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Accept: ${accept}\r\n\r\nserver-initial`)
    if (head.length) socket.write(head)
    socket.on('data', chunk => socket.write(chunk))
  })
  const port = await listen(upstream)
  return { seen, env: { OPENCLAW_DASHBOARD_INTERNAL_URL: `http://127.0.0.1:${port}${prefix}` }, origin: `http://127.0.0.1:${port}` }
}
async function proxy(env, authorize = vi.fn(async () => true), nextUpgrade) {
  const server = new DashboardHttpServer((_request, response) => response.end('app'))
  if (nextUpgrade) server.on('upgrade', nextUpgrade)
  const close = attachDashboardUpgrade(server, { env, authorize })
  const port = await listen(server)
  cleanup.push(close)
  return { port, close, authorize }
}

describe('OpenClaw dashboard installation addressing', () => {
  it('keeps dashboard launches on the browser origin and the token in a fragment', () => {
    expect(openClawDashboardLocation('example token')).toBe(`${OPENCLAW_DASHBOARD_PATH}/#token=example%20token`)
    expect(openClawDashboardLocation()).toBe(`${OPENCLAW_DASHBOARD_PATH}/`)
  })
  it('uses the configured Docker gateway, port and optional proxy prefix', () => {
    expect(resolveOpenClawDashboardBase({ OPENCLAW_HOST: 'openclaw', OPENCLAW_PORT: '18789' })).toBe('http://openclaw:18789')
    expect(resolveOpenClawDashboardBase({ OPENCLAW_DASHBOARD_INTERNAL_URL: 'http://127.0.0.1:18789/prefix/' })).toBe('http://127.0.0.1:18789/prefix')
    expect(() => resolveOpenClawDashboardBase({ OPENCLAW_DASHBOARD_URL: 'https://unconfigured.example.com' })).toThrow()
    expect(() => resolveOpenClawDashboardBase({ OPENCLAW_DASHBOARD_URL: 'http://user:password@localhost' })).toThrow()
  })
  it('rejects missing and foreign browser origins', () => {
    expect(isDashboardBrowserOrigin(undefined, 'localhost:3304')).toBe(false)
    expect(isDashboardBrowserOrigin('https://foreign.example', 'localhost:3304')).toBe(false)
    expect(isDashboardBrowserOrigin('http://localhost:3304', 'localhost:3304')).toBe(true)
    expect(isDashboardBrowserOrigin('https://octi.example', 'app:3000', 'https://octi.example')).toBe(true)
  })
})

describe('authenticated dashboard WebSocket transport', () => {
  it('upgrades before the first HTTP request and forwards bytes and initial heads in both directions', async () => {
    const upstream = await gateway('/prefix')
    const app = await proxy(upstream.env)
    const client = await requestUpgrade(app.port, { head: 'client-initial' })
    await vi.waitFor(() => expect(client.text()).toContain('server-initialclient-initial'))
    client.socket.write('roundtrip')
    await vi.waitFor(() => expect(client.text()).toContain('roundtrip'))
    expect(upstream.seen).toHaveLength(1)
    expect(upstream.seen[0].url).toBe('/prefix/__openclaw__/gateway/ws')
    expect(upstream.seen[0].headers.origin).toBe(upstream.origin)
    expect(upstream.seen[0].headers.cookie).toBeUndefined()
    expect(app.authorize).toHaveBeenCalledOnce()
  })
  it('keeps Next upgrade handlers away from the dashboard while preserving unrelated upgrades', async () => {
    const upstream = await gateway()
    const nextUpgrade = vi.fn((_request, socket) => socket.end('HTTP/1.1 418 Next Handler\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'))
    const app = await proxy(upstream.env, undefined, nextUpgrade)
    const dashboard = await requestUpgrade(app.port)
    await vi.waitFor(() => expect(dashboard.text()).toContain('101 Switching Protocols'))
    expect(nextUpgrade).not.toHaveBeenCalled()
    const other = await requestUpgrade(app.port, { path: '/another-socket' })
    await vi.waitFor(() => expect(other.text()).toContain('418 Next Handler'))
    expect(nextUpgrade).toHaveBeenCalledOnce()
  })
  it('rejects cross-origin requests before checking the session or contacting the gateway', async () => {
    const upstream = await gateway()
    const app = await proxy(upstream.env)
    const client = await requestUpgrade(app.port, { origin: 'https://foreign.example' })
    await vi.waitFor(() => expect(client.text()).toContain('403 Forbidden'))
    expect(app.authorize).not.toHaveBeenCalled()
    expect(upstream.seen).toHaveLength(0)
  })
  it('rejects expired or non-admin sessions without contacting the gateway', async () => {
    const upstream = await gateway()
    const app = await proxy(upstream.env, vi.fn(async () => false))
    const client = await requestUpgrade(app.port)
    await vi.waitFor(() => expect(client.text()).toContain('401 Unauthorized'))
    expect(upstream.seen).toHaveLength(0)
  })
  it('returns a bounded gateway failure when authorization cannot be checked', async () => {
    const app = await proxy({}, async () => { throw new Error('Unavailable') })
    const client = await requestUpgrade(app.port)
    await vi.waitFor(() => expect(client.text()).toContain('502 Bad Gateway'))
  })
  it('closes clients waiting for authorization without opening an upstream connection', async () => {
    const upstream = await gateway()
    let allow
    const authorize = vi.fn(() => new Promise(resolve => { allow = resolve }))
    const app = await proxy(upstream.env, authorize)
    const client = await requestUpgrade(app.port)
    await vi.waitFor(() => expect(authorize).toHaveBeenCalledOnce())
    app.close()
    await vi.waitFor(() => expect(client.socket.destroyed).toBe(true))
    allow(true)
    await new Promise(resolve => setImmediate(resolve))
    expect(upstream.seen).toHaveLength(0)
  })
  it('closes an established dashboard socket during shutdown', async () => {
    const upstream = await gateway()
    const app = await proxy(upstream.env)
    const client = await requestUpgrade(app.port)
    await vi.waitFor(() => expect(client.text()).toContain('101 Switching Protocols'))
    app.close()
    await vi.waitFor(() => expect(client.socket.destroyed).toBe(true))
  })
})
