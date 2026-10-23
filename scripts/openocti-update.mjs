import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { fetchLatestRelease, normalizeVersion, updateConfiguration } from '../lib/openocti-updates.mjs'

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: options.cwd || process.cwd(), env: options.env || process.env, shell: false, stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit' })
    let stdout = ''
    let stderr = ''
    if (options.capture) {
      child.stdout.on('data', chunk => { stdout += chunk })
      child.stderr.on('data', chunk => { stderr += chunk })
    }
    child.on('error', reject)
    child.on('close', code => code === 0 ? resolve({ stdout: stdout.trim(), stderr: stderr.trim() }) : reject(new Error(`${command} exited with code ${code}${stderr.trim() ? `: ${stderr.trim()}` : ''}`)))
  })
}

async function commandWorks(command, args) {
  try { await run(command, args, { capture: true }); return true } catch { return false }
}

async function hasDockerApp(root) {
  try {
    const result = await run('docker', ['compose', 'ps', '-q', 'app'], { cwd: root, capture: true })
    return Boolean(result.stdout)
  } catch {
    return false
  }
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')
}

function writeEnvValue(file, key, value) {
  let contents = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
  const line = `${key}=${value}`
  const pattern = new RegExp(`^${key}=.*$`, 'm')
  contents = pattern.test(contents) ? contents.replace(pattern, line) : `${contents.replace(/\s*$/, '')}\n${line}\n`
  fs.writeFileSync(file, contents.replace(/^\n/, ''), { mode: 0o600 })
}

function copyPrivateConfig(root, backupDir) {
  for (const name of ['.env', 'postiz.env', 'docker-compose.yml', 'VERSION.json']) {
    const source = path.join(root, name)
    if (fs.existsSync(source) && fs.lstatSync(source).isFile()) fs.copyFileSync(source, path.join(backupDir, name.replace(/^\./, 'dot-')))
  }
}

async function assertOfficialCleanCheckout(root, repository) {
  const inside = await run('git', ['rev-parse', '--is-inside-work-tree'], { cwd: root, capture: true })
  if (inside.stdout !== 'true') throw new Error('One-click updates require a Git checkout. ZIP installations must complete one manual migration to a Git checkout first.')
  const remote = (await run('git', ['remote', 'get-url', 'origin'], { cwd: root, capture: true })).stdout.replace(/\.git$/, '')
  const expectedHttps = `https://github.com/${repository}`
  const expectedSsh = `git@github.com:${repository}`
  if (remote !== expectedHttps && remote !== expectedSsh) throw new Error(`Refusing to update from unexpected origin ${remote}.`)
  const dirty = (await run('git', ['status', '--porcelain'], { cwd: root, capture: true })).stdout
  if (dirty) throw new Error('The OpenOcti source checkout has local changes. Preserve or commit them before installing an update.')
  return (await run('git', ['rev-parse', 'HEAD'], { cwd: root, capture: true })).stdout
}

async function updateCheckout(root, tag) {
  await run('git', ['fetch', '--tags', '--prune', 'origin'], { cwd: root })
  await run('git', ['rev-parse', '--verify', `${tag}^{commit}`], { cwd: root, capture: true })
  const branch = (await run('git', ['branch', '--show-current'], { cwd: root, capture: true })).stdout
  if (branch) await run('git', ['merge', '--ff-only', tag], { cwd: root })
  else await run('git', ['checkout', '--detach', tag], { cwd: root })
}

async function backupDockerVolumes(root, backupDir) {
  const listed = await run('docker', ['volume', 'ls', '--filter', 'label=com.docker.compose.project=openocti', '--format', '{{.Name}}'], { cwd: root, capture: true })
  const volumes = listed.stdout.split(/\r?\n/).map(value => value.trim()).filter(Boolean)
  if (!volumes.length) throw new Error('No OpenOcti Docker volumes were found; refusing to update without a backup target.')
  for (const volume of volumes) {
    if (!/^[A-Za-z0-9_.-]+$/.test(volume)) throw new Error('Docker returned an unsafe volume name.')
    await run('docker', ['run', '--rm', '-v', `${volume}:/source:ro`, '-v', `${backupDir}:/backup`, 'node:24-bookworm-slim', 'tar', '-czf', `/backup/${volume}.tgz`, '-C', '/source', '.'], { cwd: root })
  }
  return volumes
}

async function waitForDockerHealth(root) {
  for (let attempt = 0; attempt < 36; attempt += 1) {
    try {
      const result = await run('docker', ['compose', 'ps', '--format', 'json'], { cwd: root, capture: true })
      const rows = result.stdout.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line))
      const app = rows.find(row => row.Service === 'app')
      const openclaw = rows.find(row => row.Service === 'openclaw')
      if (app?.State === 'running' && openclaw?.State === 'running' && (!app.Health || app.Health === 'healthy')) return
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 5000))
  }
  throw new Error('The updated Docker services did not become healthy within three minutes.')
}

async function installDocker({ root, version, tag, backupDir }) {
  await run('docker', ['compose', 'stop'], { cwd: root })
  try {
    await backupDockerVolumes(root, backupDir)
    copyPrivateConfig(root, backupDir)
    await updateCheckout(root, tag)
    writeEnvValue(path.join(root, '.env'), 'OPENOCTI_IMAGE_TAG', version)
    await run('docker', ['compose', 'pull', 'app', 'openclaw'], { cwd: root })
    await run('docker', ['compose', 'up', '-d'], { cwd: root })
    await waitForDockerHealth(root)
  } catch (error) {
    try { await run('docker', ['compose', 'up', '-d'], { cwd: root }) } catch {}
    throw error
  }
}

async function installNode({ root, tag, backupDir }) {
  const service = String(process.env.OPENOCTI_SYSTEMD_SERVICE || 'openocti.service').trim()
  await updateCheckout(root, tag)
  await run('npm', ['ci'], { cwd: root })
  await run('npm', ['run', 'build'], { cwd: root })
  await run('systemctl', ['stop', service], { cwd: root })
  try {
    const dataDir = path.resolve(process.env.CRM_DATA_DIR || path.join(root, 'data'))
    if (!fs.existsSync(dataDir)) throw new Error(`Data directory not found: ${dataDir}`)
    fs.cpSync(dataDir, path.join(backupDir, 'data'), { recursive: true, errorOnExist: true })
    copyPrivateConfig(root, backupDir)
  } finally {
    await run('systemctl', ['start', service], { cwd: root })
  }
  await run('systemctl', ['is-active', '--quiet', service], { cwd: root })
}

export async function checkForUpdate({ root = process.cwd() } = {}) {
  const config = updateConfiguration()
  const latest = await fetchLatestRelease({ repository: config.repository, force: true })
  return { product: config.product, repository: config.repository, latest }
}

export async function installUpdate({ root = process.cwd(), targetVersion, yes = false } = {}) {
  if (!yes) throw new Error('Installation requires explicit --yes confirmation.')
  if (os.platform() !== 'linux') throw new Error('One-click installation currently requires a Linux host. Update checking remains available on other platforms.')
  const config = updateConfiguration()
  const latest = await fetchLatestRelease({ repository: config.repository, force: true })
  const requested = normalizeVersion(targetVersion)
  if (!requested || requested !== latest.version) throw new Error('The requested version is not the latest official release.')
  const previousCommit = await assertOfficialCleanCheckout(root, config.repository)
  const backupRoot = path.resolve(process.env.OPENOCTI_BACKUP_DIR || path.join(root, '..', 'openocti-backups'))
  const backupDir = path.join(backupRoot, `pre-${requested}-${stamp()}`)
  fs.mkdirSync(backupDir, { recursive: false, mode: 0o700 })
  fs.writeFileSync(path.join(backupDir, 'restore.json'), JSON.stringify({ previousCommit, targetVersion: requested, createdAt: new Date().toISOString() }, null, 2), { mode: 0o600 })

  const requestedInstallType = String(process.env.OPENOCTI_INSTALL_TYPE || '').trim().toLowerCase()
  if (requestedInstallType && !['docker', 'node'].includes(requestedInstallType)) {
    throw new Error('OPENOCTI_INSTALL_TYPE must be either docker or node.')
  }
  const dockerAvailable = await commandWorks('docker', ['compose', 'version'])
  const docker = requestedInstallType === 'docker' || (!requestedInstallType && dockerAvailable && await hasDockerApp(root))
  if (requestedInstallType === 'docker' && !dockerAvailable) throw new Error('Docker Compose is not available on this host.')
  if (docker) await installDocker({ root, version: requested, tag: latest.tag, backupDir })
  else await installNode({ root, version: requested, tag: latest.tag, backupDir })
  return { ok: true, version: requested, backupDir }
}

async function main() {
  const command = process.argv[2] || 'check'
  if (command === 'check') {
    const result = await checkForUpdate()
    console.log(`${result.product} latest official release: ${result.latest.version}`)
    return
  }
  if (command === 'install') {
    const targetIndex = process.argv.indexOf('--target')
    const targetVersion = targetIndex >= 0 ? process.argv[targetIndex + 1] : ''
    const result = await installUpdate({ targetVersion, yes: process.argv.includes('--yes') })
    console.log(`OpenOcti ${result.version} installed and verified. Backup: ${result.backupDir}`)
    return
  }
  throw new Error('Usage: node scripts/openocti-update.mjs check | install --target X.Y.Z --yes')
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1 })
}
