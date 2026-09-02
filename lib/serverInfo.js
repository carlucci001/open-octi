// Detects how this server is reachable. Three categories:
//   - public:    cloudflared tunnel URL (read from data/tunnel-logs/tunnel-url.txt)
//                Anyone on the internet can reach this — auth still required to log in.
//                This is the right link to send to clients/teammates anywhere.
//   - lan:       direct LAN IPs of this machine. Fastest path when on the same Wi-Fi.
//   - tailscale: Tailscale magic-DNS hostname. Only works for devices ALREADY on
//                this tailnet (each user must install Tailscale and be invited first).
//                Demoted to "advanced" because it's not friction-free for end users.
import fs from 'fs'
import path from 'path'
import os from 'os'
import { exec } from 'child_process'
import { promisify } from 'util'

const run = promisify(exec)
const TUNNEL_URL_FILE = path.join(process.cwd(), 'data', 'tunnel-logs', 'tunnel-url.txt')

function lanCandidates() {
  const out = []
  const ifaces = os.networkInterfaces()
  for (const [name, addrs] of Object.entries(ifaces)) {
    for (const a of addrs || []) {
      if (a.family !== 'IPv4' || a.internal) continue
      // Tailscale's CGNAT range (100.64-127.x) — list separately under tailscale.
      if (a.address.startsWith('100.')) continue
      out.push({ iface: name, ip: a.address })
    }
  }
  return out
}

// Returns the public CRM URL that's safe to send to anyone — meaning a hostname
// from the cloudflared ingress that does NOT have Cloudflare Access gating.
// Priority order:
//   1. openocti.local (business-branded, open)
//   2. portal.farringtondevelopment.com (business-branded, open)
//   3. data/tunnel-logs/tunnel-url.txt (fallback — may be webhook-only)
function readPublicTunnelUrl() {
  const PREFERRED = [
    'https://openocti.local',
    'https://portal.farringtondevelopment.com',
  ]
  // Read the cloudflared config.yml to confirm which hostnames are actually configured.
  let configured = []
  try {
    const cfg = fs.readFileSync(path.join(process.env.USERPROFILE || os.homedir(), '.cloudflared', 'config.yml'), 'utf-8')
    configured = (cfg.match(/hostname:\s*([\w.-]+)/g) || []).map(s => s.replace(/^hostname:\s*/, ''))
  } catch {}
  for (const url of PREFERRED) {
    const host = url.replace(/^https?:\/\//, '')
    if (configured.includes(host)) return url
  }
  try {
    const v = fs.readFileSync(TUNNEL_URL_FILE, 'utf-8').trim()
    if (v && /^https?:\/\//i.test(v)) return v
  } catch {}
  return null
}

let _tailscaleCache = null
let _tailscaleAt = 0
async function tailscaleHostname() {
  if (_tailscaleCache && Date.now() - _tailscaleAt < 60000) return _tailscaleCache
  try {
    const { stdout } = await run('tailscale status --json', { timeout: 3000 })
    const data = JSON.parse(stdout)
    // Prefer DNSName (canonical case, trailing dot) — strip the trailing dot.
    let host = (data.Self?.DNSName || '').replace(/\.$/, '')
    if (!host && data.Self?.HostName) {
      const tailnet = data.MagicDNSSuffix || (data.CurrentTailnet?.Name || '').replace(/^.*\./, '')
      host = tailnet ? `${data.Self.HostName.toLowerCase()}.${tailnet}` : null
    }
    if (host) {
      _tailscaleCache = host
      _tailscaleAt = Date.now()
      return _tailscaleCache
    }
  } catch {}
  _tailscaleCache = null
  _tailscaleAt = Date.now()
  return null
}

export async function getServerEndpoints({ port = 3000 } = {}) {
  const lan = lanCandidates()
  const tail = await tailscaleHostname()
  const pub = readPublicTunnelUrl()
  return {
    public: pub ? { url: pub } : null,
    lan: lan.map(x => ({ label: x.iface, url: `http://${x.ip}:${port}` })),
    tailscale: tail ? { hostname: tail, url: `http://${tail}:${port}` } : null,
    loopback: `http://localhost:${port}`,
  }
}
