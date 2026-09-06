import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { isOpenOctiExcluded } from './openocti-excludes.mjs'

const POLICY_PATH = 'openocti/export-source-allowlist.json'

function git(root, args, input) {
  const result = spawnSync('git', ['-C', root, ...args], {
    input, maxBuffer: 256 * 1024 * 1024, windowsHide: true,
  })
  if (result.error || result.status !== 0) throw new Error('SOURCE_GIT_READ_FAILED')
  return result.stdout
}

export function safeSourcePath(value) {
  return typeof value === 'string' && value.length > 0 &&
    !value.includes('\\') && !value.includes(':') && !/[\x00-\x1f]/.test(value) &&
    !value.startsWith('/') && value.split('/').every(part => part && part !== '.' && part !== '..')
}

// The approved source list lives in the same immutable commit as the code.
// No recursive filesystem copy, worktree file contents, credentials, or live data are read.
export function readApprovedSource(root, { ref = 'HEAD' } = {}) {
  const commit = git(root, ['rev-parse', '--verify', `${ref}^{commit}`]).toString().trim()
  let policy
  try { policy = JSON.parse(git(root, ['show', `${commit}:${POLICY_PATH}`]).toString('utf8')) }
  catch { throw new Error('SOURCE_POLICY_INVALID') }
  if (policy.schemaVersion !== 1 || !Array.isArray(policy.files) || !policy.files.length) {
    throw new Error('SOURCE_POLICY_INVALID')
  }
  const names = policy.files
  if (names.some(name => !safeSourcePath(name)) || new Set(names.map(n => n.toLowerCase())).size !== names.length) {
    throw new Error('SOURCE_POLICY_UNSAFE_PATH')
  }
  if (names.some(name =>
    (/(^|\/)\.env(?:[./]|$)/i.test(name) && name !== '.env.example') ||
    /\.(?:sqlite3?|db)(?:-(?:wal|shm|journal))?$/i.test(name) ||
    (!name.startsWith('data-demo/') && !name.startsWith('openocti/') && isOpenOctiExcluded(name)))) {
    throw new Error('SOURCE_PROTECTED_PATH')
  }
  const entries = new Map(git(root, ['ls-tree', '-r', '-z', commit]).toString('utf8').split('\0').filter(Boolean).map(line => {
    const separator = line.indexOf('\t')
    const [mode, type, oid] = line.slice(0, separator).split(' ')
    return [line.slice(separator + 1), { mode, type, oid }]
  }))
  for (const name of names) {
    const entry = entries.get(name)
    if (!entry || entry.type !== 'blob' || !['100644', '100755'].includes(entry.mode)) {
      throw new Error('SOURCE_POLICY_MISSING_OR_NONREGULAR_FILE')
    }
  }
  const changed = git(root, ['diff', '--name-only', '-z', commit]).toString('utf8').split('\0')
  if (changed.some(name => names.includes(name) || name === POLICY_PATH)) throw new Error('SOURCE_INPUT_NOT_COMMITTED')
  const raw = git(root, ['cat-file', '--batch'], Buffer.from(names.map(name => entries.get(name).oid).join('\n') + '\n'))
  let offset = 0
  const files = names.map(name => {
    const end = raw.indexOf(10, offset)
    const [oid, type, length] = raw.subarray(offset, end).toString('ascii').split(' ')
    const size = Number(length)
    if (end < 0 || oid !== entries.get(name).oid || type !== 'blob' || !Number.isSafeInteger(size) || size < 0 || end + 1 + size >= raw.length) {
      throw new Error('SOURCE_OBJECT_INVALID')
    }
    const content = raw.subarray(end + 1, end + 1 + size)
    offset = end + 1 + size + 1
    return { path: name, content, executable: entries.get(name).mode === '100755' }
  })
  return { commit, files }
}

export function createApprovedSourceSnapshot(root, options) {
  const source = readApprovedSource(root, options)
  const snapshot = fs.mkdtempSync(path.join(os.tmpdir(), 'openocti-approved-source-'))
  const cleanup = () => {
    if (path.dirname(snapshot) !== path.resolve(os.tmpdir()) || !path.basename(snapshot).startsWith('openocti-approved-source-')) {
      throw new Error('SOURCE_SNAPSHOT_CLEANUP_REFUSED')
    }
    fs.rmSync(snapshot, { recursive: true, force: true })
  }
  try {
    for (const file of source.files) {
      const target = path.resolve(snapshot, file.path)
      if (!target.startsWith(snapshot + path.sep)) throw new Error('SOURCE_SNAPSHOT_PATH_ESCAPE')
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, file.content, { mode: file.executable ? 0o755 : 0o644 })
    }
    return { root: snapshot, commit: source.commit, fileCount: source.files.length, cleanup }
  } catch (error) {
    cleanup()
    throw error
  }
}
