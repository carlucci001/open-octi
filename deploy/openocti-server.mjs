import next from 'next'
import { attachDashboardUpgrade, DashboardHttpServer } from './openclaw-dashboard-proxy.mjs'

const args = process.argv.slice(2)
const option = (...names) => {
  const index = args.findIndex(arg => names.includes(arg))
  return index >= 0 ? args[index + 1] : undefined
}
const port = Number(option('-p', '--port') || process.env.PORT || 3000)
const hostname = option('-H', '--hostname') || process.env.HOSTNAME || '0.0.0.0'
const authorizationHost = hostname === '0.0.0.0' ? '127.0.0.1' : hostname === '::' ? '[::1]' : hostname.includes(':') ? `[${hostname}]` : hostname
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid application port')
process.env.PORT = String(port)
const app = next({ dev: false, hostname, port })
await app.prepare()
const handle = app.getRequestHandler()
const server = new DashboardHttpServer((request, response) => {
  Promise.resolve(handle(request, response)).catch(() => {
    if (!response.headersSent) response.writeHead(500)
    response.end('Application request failed')
  })
})
const closeDashboard = attachDashboardUpgrade(server, {
  authorize: async request => {
    const response = await fetch(`http://${authorizationHost}:${port}/api/harness/openclaw/authorize`, {
      headers: { cookie: request.headers.cookie || '' },
      redirect: 'manual', signal: AbortSignal.timeout(5000),
    })
    await response.body?.cancel()
    return response.status === 204
  },
})
server.listen(port, hostname, () => console.log(`OpenOcti ready on port ${port}`))
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => {
  closeDashboard()
  server.close(() => { app.close().finally(() => process.exit(0)) })
  setTimeout(() => process.exit(0), 5000).unref()
})
