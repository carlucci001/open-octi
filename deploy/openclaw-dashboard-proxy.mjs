import http from 'node:http'
import https from 'node:https'
import { isDashboardBrowserOrigin, isDashboardSocketPath, resolveOpenClawDashboardBase } from '../lib/openclaw-dashboard.js'

// Next registers its own upgrade listener on the HTTP server. Dispatch this one
// protected socket route separately so two handlers never compete for a socket.
export class DashboardHttpServer extends http.Server {
  constructor(...args) {
    super(...args)
    // Node must see an upgrade listener even before Next handles its first GET.
    this.on('upgrade', (_request, socket) => {
      if (this.listenerCount('upgrade') === 1) socket.destroy()
    })
  }
  emit(event, ...args) {
    if (event === 'upgrade') {
      try {
        if (isDashboardSocketPath(new URL(args[0].url, 'http://localhost').pathname)) {
          return super.emit('openocti:dashboard-upgrade', ...args)
        }
      } catch { /* Let the normal HTTP server handle an invalid request. */ }
    }
    return super.emit(event, ...args)
  }
}

export function attachDashboardUpgrade(server, { authorize, env = process.env }) {
  const connections = new Set()
  const reject = (socket, status) => {
    if (!socket.destroyed) socket.end(`HTTP/1.1 ${status} ${status === 403 ? 'Forbidden' : status === 401 ? 'Unauthorized' : 'Bad Gateway'}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`)
  }
  const onUpgrade = async (request, socket, head) => {
    let pending
    let upstream
    connections.add(socket)
    socket.on('error', () => socket.destroy())
    socket.once('close', () => {
      connections.delete(socket)
      pending?.destroy()
      upstream?.destroy()
    })
    let pathname
    try { pathname = new URL(request.url, 'http://localhost').pathname } catch { return reject(socket, 403) }
    if (!isDashboardSocketPath(pathname)) {
      socket.destroy()
      return
    }
    if (!isDashboardBrowserOrigin(request.headers.origin, request.headers.host, env.PUBLIC_APP_URL)) return reject(socket, 403)
    try {
      if (!await authorize(request)) return reject(socket, 401)
      if (socket.destroyed) return
      const base = new URL(resolveOpenClawDashboardBase(env))
      const target = new URL(`${base.pathname.replace(/\/$/, '')}/__openclaw__/gateway/ws`, base)
      const headers = { Host: base.host, Origin: base.origin, Connection: 'Upgrade', Upgrade: 'websocket' }
      for (const key of ['sec-websocket-key', 'sec-websocket-version', 'sec-websocket-protocol', 'sec-websocket-extensions']) {
        if (request.headers[key]) headers[key] = request.headers[key]
      }
      pending = (base.protocol === 'https:' ? https : http).request(target, { headers })
      pending.setTimeout(10000, () => pending.destroy(new Error('Gateway upgrade timeout')))
      pending.once('error', () => reject(socket, 502))
      pending.once('response', response => { response.resume(); reject(socket, 502) })
      pending.once('upgrade', (response, gatewaySocket, upstreamHead) => {
        upstream = gatewaySocket
        pending.setTimeout(0)
        if (socket.destroyed) { upstream.destroy(); return }
        const lines = ['HTTP/1.1 101 Switching Protocols']
        for (const key of ['upgrade', 'connection', 'sec-websocket-accept', 'sec-websocket-protocol', 'sec-websocket-extensions']) {
          if (response.headers[key]) lines.push(`${key}: ${response.headers[key]}`)
        }
        socket.write(lines.join('\r\n') + '\r\n\r\n')
        if (upstreamHead.length) socket.write(upstreamHead)
        if (head.length) upstream.write(head)
        upstream.on('error', () => socket.destroy())
        upstream.once('close', () => socket.destroy())
        socket.pipe(upstream).pipe(socket)
      })
      pending.end()
    } catch { reject(socket, 502) }
  }
  server.on('openocti:dashboard-upgrade', onUpgrade)
  return () => {
    server.off('openocti:dashboard-upgrade', onUpgrade)
    for (const socket of connections) socket.destroy()
    connections.clear()
  }
}
