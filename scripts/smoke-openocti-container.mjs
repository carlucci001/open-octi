import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'

// Runs only against a disposable installation: no host data, published ports,
// provider credentials, or outbound container network access are supplied.
const image = process.argv[2] || 'openocti-ci'
const suffix = randomBytes(6).toString('hex')
const container = `openocti-smoke-${suffix}`
const volume = `${container}-data`
const password = randomBytes(32).toString('hex')
const origin = 'http://127.0.0.1:3000'
let createdVolume = false
let cookie = ''
let stopping = false

function docker(args, { input, allowFailure = false, env = process.env, timeout = 30000 } = {}) {
  const result = spawnSync('docker', args, {
    input, env, encoding: 'utf8', timeout, maxBuffer: 2 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  if (!allowFailure && (result.error || result.status !== 0)) {
    // Never dump subprocess output: it can include session cookies or test data.
    throw new Error(`Docker ${args[0]} failed (exit ${result.status ?? 'unavailable'})`)
  }
  return result
}

function inside(code) {
  return docker(['exec', '-i', container, 'node', '--input-type=module'], { input: code }).stdout.trim()
}

function request(path, { method = 'GET', body, authenticated = true } = {}) {
  const input = { path, method, body, cookie: authenticated ? cookie : '', origin }
  return JSON.parse(inside(`
    const input = ${JSON.stringify(input)};
    const response = await fetch(input.origin + input.path, {
      method: input.method, redirect: 'manual', signal: AbortSignal.timeout(10000),
      headers: {
        'Content-Type': 'application/json', Origin: input.origin,
        ...(input.cookie ? { Cookie: input.cookie } : {}),
      },
      ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
    });
    const text = await response.text();
    let body; try { body = JSON.parse(text); } catch { body = null; }
    console.log(JSON.stringify({
      status: response.status, body,
      cookies: response.headers.getSetCookie().map(value => value.split(';')[0]),
    }));
  `))
}

function json(path, options) {
  const response = request(path, options)
  assert.equal(response.status, 200, `${path}: expected HTTP 200, received ${response.status}`)
  assert.ok(response.body && typeof response.body === 'object', `${path}: expected JSON`)
  return response.body
}

function checkReport(report) {
  assert.equal(report.status, 'healthy', 'Loopback application monitoring must be healthy')
  assert.equal(report.alert.status, 'disabled', 'Smoke run must not send alerts')
  const results = new Map(report.results.map(result => [result.id, result]))
  assert.equal(results.get('public-app')?.status, 'healthy')
  assert.equal(results.get('cloudflare-zone')?.status, 'not_configured')
  assert.equal(results.get('nylas-primary-grant')?.status, 'not_configured')
}

function cleanup() {
  if (stopping) return
  stopping = true
  docker(['rm', '--force', container], { allowFailure: true })
  if (createdVolume) {
    const removed = docker(['volume', 'rm', volume], { allowFailure: true })
    if (removed.status !== 0) {
      console.error('Smoke data volume cleanup failed')
      process.exitCode = 1
    }
  }
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    cleanup()
    process.exit(signal === 'SIGINT' ? 130 : 143)
  })
}

try {
  docker(['volume', 'create', '--label', 'openocti.ci-smoke=true', volume])
  createdVolume = true
  const installationEnv = {
    ...process.env,
    INITIAL_ADMIN_PASSWORD: password,
    CRM_SESSION_SECRET: randomBytes(32).toString('hex'),
    PUBLIC_APP_URL: origin,
    OPENOCTI_BUSINESS_NAME: 'Example Smoke Company',
    OPENOCTI_OWNER_NAME: 'Smoke Administrator',
    OWNER_EMAIL: 'admin@example.invalid',
  }
  docker([
    'run', '--detach', '--name', container, '--label', 'openocti.ci-smoke=true',
    '--network', 'none', '--mount', `type=volume,src=${volume},dst=/data`,
    ...['INITIAL_ADMIN_PASSWORD', 'CRM_SESSION_SECRET', 'PUBLIC_APP_URL',
      'OPENOCTI_BUSINESS_NAME', 'OPENOCTI_OWNER_NAME', 'OWNER_EMAIL'].flatMap(key => ['--env', key]),
    '--env', 'FCC_EDITION=openocti', '--env', 'NEXT_PUBLIC_FCC_EDITION=openocti',
    '--env', 'DATA_BACKEND=sqlite', '--env', 'MONITORING_ALERTS_ENABLED=false',
    image,
  ], { env: installationEnv, timeout: 60000 })

  const deadline = Date.now() + 120000
  let ready = false
  while (Date.now() < deadline) {
    const state = JSON.parse(docker(['inspect', '--format', '{{json .State}}', container]).stdout)
    assert.equal(state.Running, true, 'Application container exited during startup')
    if (state.Health?.Status === 'healthy') { ready = true; break }
    await delay(2000)
  }
  assert.ok(ready, 'Application did not pass its Docker health check within 120 seconds')
  console.log('PASS: fresh installation startup and Docker health check')

  for (const path of ['/api/auth/me', '/api/accounts', '/api/openocti/setup', '/api/platform-admin/v1/monitoring']) {
    const response = request(path, { authenticated: false })
    assert.ok([401, 403].includes(response.status), `${path}: anonymous access must be denied`)
  }
  const capabilities = json('/api/platform-admin/v1/capabilities', { authenticated: false })
  assert.equal(capabilities.edition, 'openocti')
  for (const id of ['daily', 'stripe', 'cloudflare', 'nylas', 'elevenlabs']) {
    assert.equal(capabilities.capabilities.find(item => item.id === id)?.status, 'not_configured', `${id}: fresh installation must be keyless`)
  }
  console.log('PASS: unauthenticated data boundaries and keyless capability state')

  // lib/auth.js explicitly provisions username "admin" for a fresh OpenOcti
  // installation, using only INITIAL_ADMIN_PASSWORD supplied above.
  const login = request('/api/auth/login', {
    method: 'POST', authenticated: false, body: { username: 'admin', password },
  })
  assert.equal(login.status, 200, 'Generated first-run administrator could not log in')
  assert.equal(login.body?.user?.role, 'owner')
  cookie = login.cookies.join('; ')
  assert.ok(cookie, 'Login did not create a session cookie')
  assert.equal(json('/api/auth/me').ok, true)
  const profile = json('/api/openocti/setup', {
    method: 'POST', body: { businessName: 'Example Smoke Company', ownerName: 'Smoke Administrator' },
  }).profile
  assert.equal(profile.complete, true)
  assert.equal(profile.businessName, 'Example Smoke Company')
  const video = request('/api/video/create-room', { method: 'POST', body: {} })
  assert.equal(video.status, 503, 'Missing video credentials must return the configuration gate')
  assert.equal(video.body?.error, 'not_configured')
  console.log('PASS: generated administrator login, setup, and keyless video gate')

  const accounts = json('/api/accounts').accounts
  assert.ok(accounts.length > 0 && accounts.every(account => account.sample === true), 'Fresh accounts must contain only sample records')
  const samples = json('/api/openocti/sample-data')
  assert.ok(samples.enabled && samples.count > 0, 'Generic samples must be available')
  assert.equal(json('/api/openocti/sample-data', { method: 'POST', body: { enabled: false } }).count, 0)
  assert.equal(json('/api/openocti/sample-data', { method: 'POST', body: { enabled: true } }).count, samples.count)
  console.log('PASS: generic samples can be viewed, removed, and restored')

  const resources = JSON.parse(inside(`
    import fs from 'node:fs';
    const manifest = JSON.parse(fs.readFileSync('config/monitoring/community.example.json', 'utf8'));
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    for (const file of ['scripts/run-monitoring.mjs', 'lib/monitoring/runtime.js', 'lib/monitoring/history.js']) fs.accessSync(file);
    console.log(JSON.stringify({ command: pkg.scripts['monitor:run'], installation: manifest.installation.id }));
  `))
  assert.equal(resources.command, 'node scripts/run-monitoring.mjs')
  assert.equal(resources.installation, 'my-openocti')
  assert.equal(json('/api/platform-admin/v1/monitoring').latest, null)
  const run = json('/api/platform-admin/v1/monitoring', { method: 'POST', body: {} })
  assert.equal(run.ok, true)
  checkReport(run.report)
  const cliReport = JSON.parse(docker(['exec', container, 'npm', 'run', '--silent', 'monitor:run', '--', '--json']).stdout)
  checkReport(cliReport)
  const history = json('/api/platform-admin/v1/monitoring')
  assert.ok(history.history.length >= 2, 'API and CLI must share persisted monitoring history')
  checkReport(history.latest)
  console.log('PASS: packaged monitoring resources, default manifest, API/CLI checks, and SQLite history')
  console.log('OpenOcti container smoke passed; provider calls and outbound network were disabled')
} catch (error) {
  console.error(`OpenOcti container smoke failed: ${error.message}`)
  process.exitCode = 1
} finally {
  cleanup()
}
