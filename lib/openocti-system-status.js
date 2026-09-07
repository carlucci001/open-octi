import os from 'os'
import net from 'net'
import fs from 'fs'

function gatewayReachable(host, port) {
  return new Promise(resolve => {
    const socket = net.createConnection({ host, port })
    const finish = reachable => { socket.destroy(); resolve(reachable) }
    socket.setTimeout(1500)
    socket.once('connect', () => finish(true))
    socket.once('error', () => finish(false))
    socket.once('timeout', () => finish(false))
  })
}

export async function openOctiSystemStatus({ env = process.env, fetchImpl = fetch, checkGateway = gatewayReachable } = {}) {
  const giteaBase = env.GITEA_INTERNAL_URL
  const gatewayHost = env.OPENCLAW_HOST
  const [giteaHealthy, gatewayHealthy] = await Promise.all([
    giteaBase ? fetchImpl(new URL('/api/healthz', giteaBase), { cache: 'no-store', signal: AbortSignal.timeout(2000) })
      .then(async response => response.ok && (await response.json()).status === 'pass').catch(() => false) : false,
    gatewayHost ? checkGateway(gatewayHost, Number(env.OPENCLAW_PORT || 18789)) : false,
  ])
  const docker = fs.existsSync('/.dockerenv')
  const total = os.totalmem()
  const used = total - os.freemem()
  const load = os.loadavg()
  return {
    edition: 'openocti',
    generatedAt: new Date().toISOString(),
    host: { name: os.hostname(), uptimeSeconds: os.uptime(), cpuCount: os.availableParallelism(), load: { one: load[0], five: load[1], fifteen: load[2] }, memory: { total, used, percent: Math.round(used / total * 100) } },
    // Serving this authenticated response proves that this app process is running.
    crm: { status: 'active', runtime: docker ? 'Docker' : 'Node.js', url: env.PUBLIC_APP_URL || '', workingDirectory: process.cwd() },
    gitea: { status: !giteaBase ? 'not configured' : giteaHealthy ? 'active' : 'unavailable', url: '/api/repository/gitea/' },
    openclaw: { status: !gatewayHost ? 'not configured' : gatewayHealthy ? 'active' : 'unavailable' },
    cloudflared: { status: 'not configured' },
    backup: { status: 'not configured', schedule: '', snapshots: [] },
    repo: { name: 'OpenOcti', path: process.cwd(), branch: '', latestCommit: env.NEXT_PUBLIC_APP_VERSION || '', status: docker ? 'Installed Docker package' : 'Local source checkout', remotes: '' },
  }
}
