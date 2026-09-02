import fs from 'fs'
import path from 'path'
import { execFileSync } from 'child_process'
import { NextResponse } from 'next/server'
import { readData, writeData } from '@/lib/dataStore'
import { requireCrmRead, requireCrmWrite, requireUserManagement } from '@/lib/permissions'
import { DEFAULT_CICD_ITEMS, mergeCicdDefaults, readCicdItems } from '@/lib/cicd-registry'
import { startDeploy, deployStatus, recentRuns, planSteps } from '@/lib/opsDeploy'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const FILE = 'ops-lab.json'
const LIVE_DEPLOY_PATH = process.env.FCC_LIVE_PATH || process.env.CRM_LIVE_PATH || process.cwd()
const SOURCE_BRANCH = process.env.FCC_SOURCE_BRANCH || process.env.FCC_GITEA_BRANCH || 'master'
const SOURCE_REMOTE = process.env.FCC_SOURCE_REMOTE || 'redacted@example.invalid:carlucci001/farrington-command-center.git'

function toNumber(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function readLoad() {
  try {
    const [one = '0', five = '0', fifteen = '0'] = fs.readFileSync('/proc/loadavg', 'utf8').trim().split(/\s+/)
    return { one: toNumber(one), five: toNumber(five), fifteen: toNumber(fifteen) }
  } catch {
    return { one: 0, five: 0, fifteen: 0 }
  }
}

function readMemory() {
  try {
    const meminfo = Object.fromEntries(
      fs.readFileSync('/proc/meminfo', 'utf8')
        .split('\n')
        .map(line => line.match(/^([^:]+):\s+(\d+)/))
        .filter(Boolean)
        .map(match => [match[1], Number(match[2]) * 1024]),
    )
    const total = meminfo.MemTotal || 0
    const available = meminfo.MemAvailable || 0
    const used = Math.max(0, total - available)
    return { total, used, available, percent: total ? Math.round((used / total) * 100) : 0 }
  } catch {
    return { total: 0, used: 0, available: 0, percent: 0 }
  }
}

function readDisk() {
  const output = run('df', ['-kP', '/'])
  const line = output.split('\n')[1] || ''
  const [, blocks = '0', used = '0', available = '0', percent = '0'] = line.trim().split(/\s+/)
  const totalBytes = toNumber(blocks) * 1024
  const usedBytes = toNumber(used) * 1024
  const availableBytes = toNumber(available) * 1024
  return {
    total: totalBytes,
    used: usedBytes,
    available: availableBytes,
    percent: toNumber(percent.replace('%', '')),
  }
}

function readUptimeSeconds() {
  try {
    return Math.floor(toNumber(fs.readFileSync('/proc/uptime', 'utf8').split(/\s+/)[0]))
  } catch {
    return 0
  }
}

const DEFAULT_DATA = {
  cicdItems: DEFAULT_CICD_ITEMS,
  voiceExperiments: [
    {
      id: 'voice-chatterbox',
      name: 'Chatterbox Voice Lab',
      status: 'planned',
      engine: 'Chatterbox',
      model: 'ResembleAI/chatterbox',
      voiceName: '',
      sampleText: 'This is a Command Center voice lab preview. Use this pass to compare pacing, tone, and clarity before promoting a voice into production.',
      prompt: 'Experiment with open-source voices before phone promotion.',
      knowledgeBase: 'Voice Lab notes, agent prompts, generated samples',
      tags: ['lab', 'open-source', 'tts'],
    },
  ],
  migrationJobs: [
    {
      id: 'migration-intake',
      name: 'Universal Content Intake',
      status: 'draft',
      source: 'Any platform export',
      target: 'Command Center knowledge and CRM entities',
      notes: 'Map imported content into projects, clients, notes, media, articles, and agent knowledge.',
      tags: ['mapping', 'knowledge-base'],
    },
  ],
  restorePlans: [
    {
      id: 'restore-fcc-nightly',
      name: 'FCC Nightly Restore Plan',
      status: 'active',
      source: '/mnt/fcc-backup/backups',
      target: 'Ubuntu host and Command Center data',
      notes: 'Restore from rsync snapshot. CRM database has a SQLite-safe app-database copy.',
      tags: ['backup', 'restore', 'production'],
    },
  ],
}

const COLLECTIONS = new Set(['cicdItems', 'voiceExperiments', 'migrationJobs', 'restorePlans'])

function genId(prefix = 'ops') {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}

function readOpsData() {
  const data = readData(FILE)
  if (!data) return { ...DEFAULT_DATA, lastUpdated: new Date().toISOString() }
  return { ...DEFAULT_DATA, ...data, cicdItems: mergeCicdDefaults(data.cicdItems) }
}

function run(command, args = []) {
  try {
    return execFileSync(command, args, {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return ''
  }
}

function backupSnapshots() {
  const root = '/mnt/fcc-backup/backups'
  try {
    return fs.readdirSync(root, { withFileTypes: true })
      .filter(d => d.isDirectory() && /^20\d\d-\d\d-\d\d_/.test(d.name))
      .map(d => {
        const full = path.join(root, d.name)
        const manifest = path.join(full, 'manifest.txt')
        let created = ''
        try {
          const text = fs.readFileSync(manifest, 'utf8')
          created = (text.match(/^Created:\s*(.+)$/m) || [])[1] || ''
        } catch {}
        return { id: d.name, name: d.name, path: full, created }
      })
      .sort((a, b) => b.name.localeCompare(a.name))
      .slice(0, 12)
  } catch {
    return []
  }
}

function safeProjectRoot(localPath = '') {
  const raw = String(localPath || '').trim()
  if (!raw) return ''
  const resolved = path.resolve(raw)
  const allowedRoots = [
    path.resolve('/home/carl/dev'),
    path.resolve('/root/fcc-candidates'),
    path.resolve(process.cwd()),
  ]
  return allowedRoots.some(root => resolved === root || resolved.startsWith(root + path.sep)) ? resolved : ''
}

function readSmallText(filePath, max = 8000) {
  try {
    const stat = fs.statSync(filePath)
    if (!stat.isFile()) return ''
    return fs.readFileSync(filePath, 'utf8').slice(0, max)
  } catch {
    return ''
  }
}

function projectHints(localPath = '') {
  const root = safeProjectRoot(localPath)
  if (!root) return { ok: false, error: 'Repository path is outside the allowed project roots.' }

  const docs = []
  for (const name of ['AGENTS.md', 'README.md', 'PRD.md', 'prd.md', 'package.json']) {
    const text = readSmallText(path.join(root, name))
    if (text) docs.push({ name, text })
  }
  try {
    const docsDir = path.join(root, 'docs')
    const files = fs.readdirSync(docsDir)
      .filter(name => /\.md$/i.test(name) && /prd|release|deploy|ci|cd|build|ops/i.test(name))
      .slice(0, 5)
    for (const name of files) {
      const text = readSmallText(path.join(docsDir, name), 5000)
      if (text) docs.push({ name: `docs/${name}`, text })
    }
  } catch {}

  const packageJson = docs.find(d => d.name === 'package.json')?.text
  let scripts = {}
  try { scripts = JSON.parse(packageJson || '{}').scripts || {} } catch {}
  const has = key => Object.prototype.hasOwnProperty.call(scripts, key)

  return {
    ok: true,
    localPath: root,
    docs: docs.map(d => d.name),
    suggested: {
      installCommand: packageJson ? 'npm ci' : '',
      buildCommand: has('build') ? 'npm run build' : '',
      testCommand: has('test') ? 'npm test' : has('test:unit') ? 'npm run test:unit' : '',
      previewCommand: has('dev') ? 'npm run dev' : '',
      healthCheckCommand: /farrington-command-center/i.test(root) ? 'curl -fsSI https://openocti.local && curl -fsS http://localhost:3000/api/pricing' : '',
      processNotes: docs.length
        ? `Hints read from ${docs.map(d => d.name).join(', ')}. Review before making this live.`
        : 'No README, PRD, AGENTS, package, or deployment docs were found in the project root.',
    },
  }
}

function systemStatus() {
  const giteaActive = run('systemctl', ['is-active', 'gitea.service']) || 'unknown'
  const crmActive = run('systemctl', ['is-active', 'farrington-crm.service']) || 'unknown'
  const openclawActive = run('systemctl', ['is-active', 'openclaw-gateway.service']) || 'unknown'
  const cloudflaredActive = run('systemctl', ['is-active', 'cloudflared.service']) || 'unknown'
  const crmWorkingDirectory = run('systemctl', ['show', 'farrington-crm.service', '-p', 'WorkingDirectory', '--value'])
  const backupLog = run('tail', ['-n', '4', '/var/log/fcc-nightly-backup.log'])
  const deployedPath = crmWorkingDirectory || LIVE_DEPLOY_PATH
  const repoPath = fs.existsSync(path.join(deployedPath, '.git')) ? deployedPath : ''
  const gitStatus = repoPath
    ? run('git', ['-C', repoPath, 'status', '--short', '--branch'])
    : 'deployment copy (no .git directory in live folder)'
  const gitBranch = repoPath ? run('git', ['-C', repoPath, 'rev-parse', '--abbrev-ref', 'HEAD']) : SOURCE_BRANCH
  const latestCommit = repoPath ? run('git', ['-C', repoPath, 'log', '-1', '--oneline']) : (process.env.NEXT_PUBLIC_APP_VERSION || '')
  const remotes = repoPath
    ? run('git', ['-C', repoPath, 'remote', '-v'])
    : `gitea\t${SOURCE_REMOTE} (source)\nproduction\t${deployedPath} (deployed copy)`
  const load = readLoad()
  const cpuCount = toNumber(run('nproc', []), 1) || 1
  const memory = readMemory()
  const disk = readDisk()
  return {
    generatedAt: new Date().toISOString(),
    host: {
      name: run('hostname', []) || 'unknown',
      uptimeSeconds: readUptimeSeconds(),
      cpuCount,
      load,
      loadPercent: Math.min(100, Math.round((load.one / cpuCount) * 100)),
      memory,
      disk,
    },
    gitea: {
      status: giteaActive,
      url: '/api/repository/gitea/',
    },
    crm: {
      status: crmActive,
      url: 'https://openocti.local',
      workingDirectory: crmWorkingDirectory,
    },
    openclaw: {
      status: openclawActive,
      url: 'http://127.0.0.1:18789',
    },
    cloudflared: {
      status: cloudflaredActive,
      url: 'https://openocti.local',
    },
    backup: {
      status: backupSnapshots().length ? 'active' : 'unknown',
      schedule: '2:17 AM daily',
      log: backupLog,
      snapshots: backupSnapshots(),
    },
    repo: {
      path: repoPath || deployedPath,
      branch: gitBranch,
      latestCommit,
      status: gitStatus,
      remotes,
    },
  }
}

export async function GET(request) {
  const { error } = await requireCrmRead(request)
  if (error) return error
  const data = readOpsData()
  return NextResponse.json({ ok: true, ...data, system: systemStatus() })
}

export async function POST(request) {
  const { error } = await requireCrmWrite(request)
  if (error) return error
  const body = await request.json()

  if (body.action === 'deploy') {
    const { error: ownerError } = await requireUserManagement(request)
    if (ownerError) return ownerError
    if (body.confirm !== true) return NextResponse.json({ error: 'Deploy requires confirm: true' }, { status: 400 })
    const item = readCicdItems().find(row => row.id === body.itemId)
    if (!item) return NextResponse.json({ error: 'Unknown CI/CD entry' }, { status: 404 })
    const result = startDeploy(item, { runTests: body.runTests === true, actor: 'owner' })
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
    return NextResponse.json({ ok: true, runId: result.runId, steps: result.steps })
  }
  if (body.action === 'deploy-plan') {
    const item = readCicdItems().find(row => row.id === body.itemId)
    if (!item) return NextResponse.json({ error: 'Unknown CI/CD entry' }, { status: 404 })
    const plan = planSteps(item, { runTests: body.runTests === true })
    return NextResponse.json({ ok: !plan.error, ...plan })
  }
  if (body.action === 'deploy-status') {
    const status = deployStatus(body.runId)
    if (!status.ok) return NextResponse.json({ error: status.error }, { status: 404 })
    return NextResponse.json(status)
  }
  if (body.action === 'deploy-runs') {
    return NextResponse.json({ ok: true, runs: recentRuns(body.itemId || '') })
  }
  if (body.action === 'project-hints') {
    const hints = projectHints(body.localPath)
    return NextResponse.json(hints.ok ? hints : { error: hints.error || 'Unable to inspect project.' }, { status: hints.ok ? 200 : 400 })
  }

  const collection = body.collection
  if (!COLLECTIONS.has(collection)) {
    return NextResponse.json({ error: 'unknown collection' }, { status: 400 })
  }

  const data = readOpsData()
  const list = Array.isArray(data[collection]) ? data[collection] : []

  if (body.action === 'add') {
    const now = new Date().toISOString()
    const item = {
      id: genId(collection.replace(/Items|Jobs|Plans|Experiments/g, '').toLowerCase() || 'ops'),
      status: 'draft',
      tags: [],
      createdAt: now,
      updatedAt: now,
      ...(body.item || {}),
    }
    data[collection] = [item, ...list]
  } else if (body.action === 'update') {
    const patch = body.item || {}
    if (!patch.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    data[collection] = list.map(item => item.id === patch.id ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item)
  } else if (body.action === 'clone') {
    const source = list.find(item => item.id === body.id)
    if (!source) return NextResponse.json({ error: 'source record not found' }, { status: 404 })
    const now = new Date().toISOString()
    const copy = {
      ...source,
      id: genId(collection.replace(/Items|Jobs|Plans|Experiments/g, '').toLowerCase() || 'ops'),
      name: `${source.name || source.repo || 'CI/CD process'} copy`,
      status: 'draft',
      default: false,
      clonedFrom: source.id,
      createdAt: now,
      updatedAt: now,
    }
    data[collection] = [copy, ...list]
  } else if (body.action === 'set-default') {
    if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    data[collection] = list.map(item => ({ ...item, default: item.id === body.id, updatedAt: item.id === body.id ? new Date().toISOString() : item.updatedAt }))
  } else if (body.action === 'delete') {
    if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    data[collection] = list.filter(item => item.id !== body.id)
  } else {
    return NextResponse.json({ error: 'unknown action' }, { status: 400 })
  }

  data.lastUpdated = new Date().toISOString()
  writeData(FILE, data)
  return NextResponse.json({ ok: true, ...data, system: systemStatus() })
}
