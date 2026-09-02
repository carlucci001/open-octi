import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'

// Ops Lab deploy runner — executes a CI/CD registry entry's registered
// commands on this host as a DETACHED process, so a run survives the CRM's
// own service restart (self-deploy). All run state lives on the filesystem
// under RUNS_DIR (never in kv_store) to avoid DB writes from bash.
// Honesty contract: the transcript renders only what the log proves.

export const RUNS_DIR = process.env.FCC_OPS_RUNS_DIR || '/root/ops-runs'

const ALLOWED_ROOTS = ['/root', '/opt/farrington', '/opt/deer-flow']

export function deployRootAllowed(localPath = '') {
  const raw = String(localPath || '').trim()
  if (!raw) return ''
  const resolved = path.resolve(raw)
  return ALLOWED_ROOTS.some(r => resolved === r || resolved.startsWith(r + path.sep)) ? resolved : ''
}

function shSingleQuote(value = '') {
  return "'" + String(value).replace(/'/g, "'\\''") + "'"
}

export function planSteps(item = {}, options = {}) {
  const steps = []
  const localPath = deployRootAllowed(item.localPath)
  const isVercelHook = Boolean(item.deployHookUrl)
  if (isVercelHook) {
    steps.push({ id: 'deploy-hook', label: 'Trigger Vercel deploy hook', cmd: `curl -fsS -X POST ${shSingleQuote(item.deployHookUrl)}` })
    if (item.healthCheckCommand) steps.push({ id: 'health', label: 'Health check', cmd: item.healthCheckCommand })
    return { kind: 'vercel-hook', localPath: '', steps }
  }
  if (!localPath) return { kind: 'invalid', localPath: '', steps: [], error: 'localPath is empty or outside the allowed deploy roots' }
  const hasGit = fs.existsSync(path.join(localPath, '.git'))
  const hasDb = fs.existsSync(path.join(localPath, 'data', 'crm.sqlite'))
  if (hasDb) steps.push({ id: 'db-backup', label: 'SQLite backup (standing rule)', cmd: `mkdir -p /root/backups/crm-sqlite && sqlite3 ${shSingleQuote(path.join(localPath, 'data', 'crm.sqlite'))} ".backup /root/backups/crm-sqlite/pre-opsdeploy-$(date +%Y%m%d-%H%M%S).sqlite"` })
  if (hasGit) {
    const branch = String(item.branch || 'master').replace(/[^A-Za-z0-9._\/-]/g, '')
    steps.push({ id: 'git-fetch', label: 'git fetch origin', cmd: 'git fetch origin' })
    steps.push({ id: 'git-merge', label: `Fast-forward to origin/${branch}`, cmd: `git merge --ff-only origin/${branch}` })
    steps.push({ id: 'lockfile-install', label: 'npm ci --include=dev (only if lockfile changed)', cmd: 'if git diff --name-only ORIG_HEAD..HEAD 2>/dev/null | grep -q "^package-lock.json$"; then npm ci --include=dev; else echo "lockfile unchanged - skipped"; fi' })
  } else if (item.installCommand) {
    steps.push({ id: 'install', label: 'Install', cmd: item.installCommand })
  }
  if (options.runTests && item.testCommand) steps.push({ id: 'test', label: 'Tests', cmd: item.testCommand })
  if (item.buildCommand) steps.push({ id: 'build', label: 'Build', cmd: item.buildCommand })
  if (item.deployCommand) steps.push({ id: 'deploy', label: 'Deploy / restart', cmd: item.deployCommand })
  if (item.healthCheckCommand) steps.push({ id: 'health', label: 'Health check', cmd: item.healthCheckCommand })
  return { kind: 'hetzner-local', localPath, steps }
}

function scriptFor(runId, item, plan) {
  const lines = []
  lines.push('#!/bin/bash')
  lines.push('set -o pipefail')
  lines.push(`RUN=${shSingleQuote(path.join(RUNS_DIR, runId))}`)
  lines.push('finish(){ printf \'{"status":"%s","failedStep":"%s","finishedAt":"%s"}\' "$1" "$2" "$(date -Is)" > "$RUN.result"; }')
  if (plan.localPath) lines.push(`cd ${shSingleQuote(plan.localPath)} || { echo "::STEP::prepare::FAIL::$(date -Is)"; finish failed prepare; exit 1; }`)
  for (const step of plan.steps) {
    lines.push(`echo "::STEP::${step.id}::START::$(date -Is)"`)
    lines.push(`bash -c ${shSingleQuote(step.cmd)}`)
    lines.push(`if [ $? -ne 0 ]; then echo "::STEP::${step.id}::FAIL::$(date -Is)"; finish failed ${shSingleQuote(step.id)}; exit 1; fi`)
    lines.push(`echo "::STEP::${step.id}::OK::$(date -Is)"`)
  }
  lines.push('finish succeeded ""')
  lines.push('exit 0')
  return lines.join('\n') + '\n'
}

export function startDeploy(item, options = {}) {
  const plan = planSteps(item, options)
  if (plan.kind === 'invalid') return { ok: false, error: plan.error }
  if (!plan.steps.length) return { ok: false, error: 'This entry has no registered commands to run. Fill in its build/deploy commands first.' }
  fs.mkdirSync(RUNS_DIR, { recursive: true })
  const runId = `run-${new Date().toISOString().replace(/[:.]/g, '').slice(0, 15)}-${Math.random().toString(36).slice(2, 6)}`
  const base = path.join(RUNS_DIR, runId)
  const meta = {
    runId,
    itemId: item.id,
    itemName: item.name || item.id,
    kind: plan.kind,
    localPath: plan.localPath,
    startedAt: new Date().toISOString(),
    startedBy: options.actor || 'owner',
    steps: plan.steps.map(s => ({ id: s.id, label: s.label, cmd: s.cmd })),
  }
  fs.writeFileSync(`${base}.meta.json`, JSON.stringify(meta, null, 2))
  fs.writeFileSync(`${base}.sh`, scriptFor(runId, item, plan), { mode: 0o700 })
  const logFd = fs.openSync(`${base}.log`, 'a')
  const child = spawn('setsid', ['bash', `${base}.sh`], { detached: true, stdio: ['ignore', logFd, logFd] })
  child.unref()
  fs.closeSync(logFd)
  return { ok: true, runId, steps: meta.steps }
}

export function deployStatus(runId = '') {
  const safe = String(runId).replace(/[^A-Za-z0-9-]/g, '')
  if (!safe) return { ok: false, error: 'missing runId' }
  const base = path.join(RUNS_DIR, safe)
  let meta = null
  try { meta = JSON.parse(fs.readFileSync(`${base}.meta.json`, 'utf8')) } catch { return { ok: false, error: 'unknown runId' } }
  let log = ''
  try { log = fs.readFileSync(`${base}.log`, 'utf8') } catch {}
  let result = null
  try { result = JSON.parse(fs.readFileSync(`${base}.result`, 'utf8')) } catch {}
  const steps = meta.steps.map(s => ({ ...s, status: 'pending' }))
  for (const match of log.matchAll(/::STEP::([A-Za-z0-9_-]+)::(START|OK|FAIL)::([^\n]*)/g)) {
    const step = steps.find(s => s.id === match[1])
    if (!step) continue
    if (match[2] === 'START') step.status = 'running'
    if (match[2] === 'OK') step.status = 'succeeded'
    if (match[2] === 'FAIL') step.status = 'failed'
  }
  const status = result ? result.status : (log ? 'running' : 'queued')
  return {
    ok: true,
    runId: safe,
    itemId: meta.itemId,
    itemName: meta.itemName,
    startedAt: meta.startedAt,
    finishedAt: result?.finishedAt || null,
    failedStep: result?.failedStep || null,
    status,
    steps,
    logTail: log.slice(-4000),
  }
}

export function recentRuns(itemId = '') {
  try {
    const files = fs.readdirSync(RUNS_DIR).filter(f => f.endsWith('.meta.json'))
    const runs = []
    for (const f of files) {
      try {
        const meta = JSON.parse(fs.readFileSync(path.join(RUNS_DIR, f), 'utf8'))
        if (itemId && meta.itemId !== itemId) continue
        let result = null
        try { result = JSON.parse(fs.readFileSync(path.join(RUNS_DIR, f.replace('.meta.json', '.result')), 'utf8')) } catch {}
        runs.push({ runId: meta.runId, itemId: meta.itemId, itemName: meta.itemName, startedAt: meta.startedAt, status: result?.status || 'running', finishedAt: result?.finishedAt || null })
      } catch {}
    }
    return runs.sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt))).slice(0, 20)
  } catch {
    return []
  }
}
