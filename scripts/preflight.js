// Preflight check — run before any demo. Verifies every external dependency is alive.
// Usage: npm run preflight
//
// Exits 0 if all green, 1 if any red.

const http = require('http')
const https = require('https')
const net = require('net')
const fs = require('fs')
const { spawnSync } = require('child_process')

const checks = []

function add(name, fn) { checks.push({ name, fn }) }

function tcpProbe(host, port, ms = 3000) {
  return new Promise(resolve => {
    const s = new net.Socket()
    let done = false
    const finish = (ok, err) => { if (done) return; done = true; try { s.destroy() } catch {} ; resolve({ ok, err }) }
    s.setTimeout(ms)
    s.once('connect', () => finish(true))
    s.once('timeout', () => finish(false, `timeout after ${ms}ms`))
    s.once('error', e => finish(false, e.message))
    s.connect(port, host)
  })
}

function httpProbe(url, expectStatus = [200, 401, 403, 404]) {
  return new Promise(resolve => {
    const lib = url.startsWith('https') ? https : http
    const req = lib.request(url, { method: 'GET', timeout: 5000 }, res => {
      const ok = expectStatus.includes(res.statusCode)
      resolve({ ok, status: res.statusCode })
      res.resume()
    })
    req.on('error', e => resolve({ ok: false, err: e.message }))
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, err: 'timeout' }) })
    req.end()
  })
}

// 1. CRM dev server on :3000
add('CRM dev server (localhost:3000)', async () => {
  const r = await httpProbe('http://localhost:3000/api/openclaw/agents')
  if (!r.ok) return { ok: false, msg: `dev server unreachable (${r.err || 'status ' + r.status})` }
  return { ok: true, msg: `up (status ${r.status})` }
})

add('CRM data backend is SQLite', async () => {
  const r = spawnSync(process.execPath, ['scripts/verify-data-backend.js'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...process.env, DATA_BACKEND: process.env.DATA_BACKEND || 'sqlite' },
  })
  if (r.status !== 0) {
    const output = `${r.stdout || ''}\n${r.stderr || ''}`.split(/\r?\n/).filter(Boolean).slice(-4).join('; ')
    return { ok: false, msg: output || 'backend verification failed' }
  }
  return { ok: true, msg: 'SQLite pinned and readable' }
})

// 2. SSH tunnel for OpenClaw chat (localhost:18789)
add('OpenClaw chat tunnel (localhost:18789)', async () => {
  const r = await tcpProbe('127.0.0.1', 18789, 2000)
  if (!r.ok) return { ok: false, msg: `tunnel down — run scripts/install-tunnel-watchdog.ps1 or open SSH tunnel manually (${r.err})` }
  return { ok: true, msg: 'tunnel listening' }
})

// 4. Cloudflared tunnel (openocti.local → :3000)
add('Cloudflared tunnel (openocti.local)', async () => {
  const r = await httpProbe('https://openocti.local/api/pricing')
  if (!r.ok) return { ok: false, msg: `tunnel not reaching CRM (${r.err || 'status ' + r.status}) — check cloudflared service` }
  return { ok: true, msg: `up (status ${r.status})` }
})

// 5. ElevenLabs API
add('ElevenLabs API', async () => {
  let key = null
  try {
    const c = JSON.parse(fs.readFileSync('c:/dev/farrington-command-center/data/credentials.json', 'utf8'))
    const e = (c.credentials || []).find(x => /eleven/i.test(x.name || ''))
    key = (e?.fields || []).find(f => /key/i.test(f.label || ''))?.value?.trim()
  } catch {}
  if (!key) return { ok: false, msg: 'API key missing from vault' }
  return new Promise(resolve => {
    const req = https.request('https://api.elevenlabs.io/v1/user', {
      method: 'GET', headers: { 'xi-api-key': key }, timeout: 5000,
    }, res => {
      const ok = res.statusCode === 200
      resolve({ ok, msg: ok ? 'authenticated' : `status ${res.statusCode}` })
      res.resume()
    })
    req.on('error', e => resolve({ ok: false, msg: e.message }))
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, msg: 'timeout' }) })
    req.end()
  })
})

// 6. Stripe API (publishable key validation by hitting account endpoint with secret)
add('Stripe API', async () => {
  let key = null
  try {
    const c = JSON.parse(fs.readFileSync('c:/dev/farrington-command-center/data/credentials.json', 'utf8'))
    const s = (c.credentials || []).find(x => /stripe/i.test(x.name || ''))
    const f = (s?.fields || []).find(x => /secret.*\(p\)/i.test(x.label || '')) || (s?.fields || []).find(x => /secret/i.test(x.label || ''))
    key = f?.value?.trim()
  } catch {}
  if (!key) return { ok: false, msg: 'Stripe secret key missing' }
  return new Promise(resolve => {
    const req = https.request('https://api.stripe.com/v1/account', {
      method: 'GET', headers: { Authorization: `Bearer ${key}` }, timeout: 5000,
    }, res => {
      const ok = res.statusCode === 200
      resolve({ ok, msg: ok ? 'authenticated' : `status ${res.statusCode}` })
      res.resume()
    })
    req.on('error', e => resolve({ ok: false, msg: e.message }))
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, msg: 'timeout' }) })
    req.end()
  })
})

// 7. Marketing site is reachable (the leasing pages)
add('Marketing site (farringtondevelopment.com/lease)', async () => {
  const r = await httpProbe('https://farringtondevelopment.com/lease')
  if (!r.ok) return { ok: false, msg: `marketing site down (${r.err || 'status ' + r.status})` }
  return { ok: true, msg: `up (status ${r.status})` }
})

// 8. Twilio
add('Twilio API', async () => {
  // Look for account creds in env (.env.local)
  let sid = process.env.TWILIO_ACCOUNT_SID
  let keySid = process.env.TWILIO_API_KEY_SID
  let keySecret = process.env.TWILIO_API_KEY_SECRET
  if (!sid || !keySid || !keySecret) {
    try {
      const env = fs.readFileSync('c:/dev/farrington-command-center/.env.local', 'utf8')
      sid = sid || (env.match(/^TWILIO_ACCOUNT_SID=(.+)$/m) || [])[1]?.trim()
      keySid = keySid || (env.match(/^TWILIO_API_KEY_SID=(.+)$/m) || [])[1]?.trim()
      keySecret = keySecret || (env.match(/^TWILIO_API_KEY_SECRET=(.+)$/m) || [])[1]?.trim()
    } catch {}
  }
  if (!sid || !keySid || !keySecret) return { ok: false, msg: 'Twilio creds missing from .env.local' }
  const auth = Buffer.from(`${keySid}:${keySecret}`).toString('base64')
  return new Promise(resolve => {
    // Use a resource endpoint (works with API Key auth — the Account info endpoint requires Auth Token)
    const req = https.request(`https://api.twilio.com/2010-04-01/Accounts/${sid}/IncomingPhoneNumbers.json?PageSize=1`, {
      method: 'GET', headers: { Authorization: `Basic ${auth}` }, timeout: 5000,
    }, res => {
      const ok = res.statusCode === 200
      resolve({ ok, msg: ok ? 'authenticated' : `status ${res.statusCode}` })
      res.resume()
    })
    req.on('error', e => resolve({ ok: false, msg: e.message }))
    req.on('timeout', () => { req.destroy(); resolve({ ok: false, msg: 'timeout' }) })
    req.end()
  })
})

;(async () => {
  console.log('\n  Preflight check\n  ───────────────────────────────────────────────────')
  let allGreen = true
  for (const c of checks) {
    process.stdout.write(`  ${c.name.padEnd(48)} `)
    try {
      const r = await c.fn()
      if (r.ok) console.log(`✓  ${r.msg || 'ok'}`)
      else { console.log(`✗  ${r.msg || 'failed'}`); allGreen = false }
    } catch (e) {
      console.log(`✗  ${e.message}`)
      allGreen = false
    }
  }
  console.log('  ───────────────────────────────────────────────────')
  if (allGreen) {
    console.log('  All systems green. Safe to demo.\n')
    process.exit(0)
  } else {
    console.log('  Some systems down — fix above before demoing.\n')
    process.exit(1)
  }
})()
