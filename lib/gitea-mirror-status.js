import fs from 'fs'
import { execFileSync } from 'child_process'

const DEFAULT_BRANCH = 'master'
const DEFAULT_SCHEDULE = '30 3 * * *'
const CRON_PATH = '/var/spool/cron/crontabs/root'
const MIRROR_LOG_PATH = '/root/logs/mirror-fcc.log'

function runGit(args, { cwd, timeout = 10000 } = {}) {
  try {
    return {
      ok: true,
      output: execFileSync('git', args, {
        cwd,
        encoding: 'utf8',
        timeout,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      }).trim(),
    }
  } catch (error) {
    return { ok: false, output: '', error: error?.code || 'unavailable' }
  }
}

function remoteHead(remote, branch, cwd, command) {
  const result = command(['ls-remote', remote, `refs/heads/${branch}`], { cwd, timeout: 10000 })
  if (!result?.ok || !result.output) return null
  const head = result.output.split(/\s+/)[0]
  return /^[0-9a-f]{40}$/i.test(head) ? head.toLowerCase() : null
}

function commitTime(head, cwd, command) {
  if (!head) return null
  const result = command(['show', '-s', '--format=%cI', head], { cwd, timeout: 5000 })
  if (!result?.ok || !result.output) return null
  const parsed = new Date(result.output)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

function safeRead(readFile, filePath) {
  try {
    return readFile(filePath, 'utf8')
  } catch {
    return ''
  }
}

function safeMtime(statFile, filePath) {
  try {
    return statFile(filePath).mtime.toISOString()
  } catch {
    return null
  }
}

function discoveredSchedule(cronText) {
  const line = cronText
    .split(/\r?\n/)
    .map(value => value.trim())
    .find(value => value && !value.startsWith('#') && value.includes('mirror-fcc-to-gitea.sh'))
  return line ? line.split(/\s+/).slice(0, 5).join(' ') : null
}

export function nextMirrorRunAt(now = new Date()) {
  const next = new Date(now)
  next.setUTCHours(3, 30, 0, 0)
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1)
  return next.toISOString()
}

export function classifyMirrorStatus({ githubHead, giteaHead, githubCommitAt, lastRunAt }) {
  if (!githubHead || !giteaHead) return 'unknown'
  if (githubHead === giteaHead) return 'in-sync'
  if (githubCommitAt && lastRunAt && new Date(githubCommitAt) > new Date(lastRunAt)) {
    return 'awaiting-next-scheduled-run'
  }
  return 'out-of-sync'
}

export function getGiteaMirrorStatus({
  cwd = process.cwd(),
  branch = DEFAULT_BRANCH,
  now = new Date(),
  command = runGit,
  readFile = fs.readFileSync,
  statFile = fs.statSync,
} = {}) {
  const githubHead = remoteHead('origin', branch, cwd, command)
  const giteaHead = remoteHead('gitea', branch, cwd, command)
  const githubCommitAt = commitTime(githubHead, cwd, command)
  const cronText = safeRead(readFile, CRON_PATH)
  const schedule = discoveredSchedule(cronText)
  const lastRunAt = safeMtime(statFile, MIRROR_LOG_PATH)
  const logText = safeRead(readFile, MIRROR_LOG_PATH)
  const lastRunResult = !lastRunAt
    ? 'unknown'
    : /(^|\n).*(fatal|failed|error):?/i.test(logText)
      ? 'failure'
      : 'success'
  const status = classifyMirrorStatus({ githubHead, giteaHead, githubCommitAt, lastRunAt })

  return {
    sourceOfTruth: 'GitHub (origin)',
    backupMirror: 'Gitea (gitea)',
    direction: 'GitHub-to-Gitea only',
    branch,
    githubHead,
    giteaHead,
    inSync: status === 'in-sync',
    status,
    scheduled: Boolean(schedule),
    schedule: schedule || DEFAULT_SCHEDULE,
    scheduleTimezone: 'UTC',
    lastRunAt,
    lastRunResult,
    nextScheduledRunAt: nextMirrorRunAt(now),
  }
}
