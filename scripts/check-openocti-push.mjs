import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { verifyOpenOctiBoundary } from './verify-openocti-boundary.mjs'

const MAX_TREE_BYTES = 128 * 1024 * 1024
const PUBLIC_REPOSITORY = 'https://github.com/carlucci001/open-octi.git'
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i
class PushGuardError extends Error {}
function reject(code) { throw new PushGuardError(code) }

export function isApprovedPublicRemote(value) {
  if (/^git@github\.com:carlucci001\/open-octi(?:\.git)?\/?$/.test(value || '')) return true
  try {
    const url = new URL(value)
    return url.hostname === 'github.com' && !url.password && !url.port && !url.search && !url.hash
      && /^\/carlucci001\/open-octi(?:\.git)?\/?$/.test(url.pathname)
      && ((url.protocol === 'https:' && !url.username) || (url.protocol === 'ssh:' && url.username === 'git'))
  } catch { return false }
}

function git(root, args, options = {}, failureCode = 'GIT_CHECK_FAILED') {
  const result = spawnSync('git', args, {
    cwd: root, encoding: 'utf8', timeout: 120000, maxBuffer: MAX_TREE_BYTES, ...options,
  })
  if (result.error || result.status !== 0) reject(failureCode)
  return result.stdout
}

function requireClean(root, head) {
  if (git(root, ['rev-parse', '--verify', 'HEAD^{commit}']).trim() !== head) reject('HEAD_CHANGED')
  if (git(root, ['status', '--porcelain=v1', '--untracked-files=no', '--ignore-submodules=none']).trim()) {
    reject('TRACKED_CHECKOUT_NOT_CLEAN')
  }
}

export function verifyPushedRefs(root, input, head) {
  const lines = input.trim().split(/\r?\n/).filter(Boolean)
  if (!lines.length) reject('NO_REF_UPDATES')
  const objects = new Set()
  for (const line of lines) {
    const fields = line.trim().split(/\s+/)
    if (fields.length !== 4) reject('INVALID_REF_UPDATE')
    const [localRef, localOid, remoteRef, remoteOid] = fields
    if (/^0+$/.test(localOid) || localRef === '(delete)') reject('REF_DELETION_FORBIDDEN')
    if (!OID.test(localOid) || !OID.test(remoteOid) || !/^refs\/(?:heads|tags)\//.test(remoteRef)) reject('INVALID_REF_UPDATE')
    // ^{commit} dereferences annotated tags and rejects non-commit objects.
    if (git(root, ['rev-parse', '--verify', `${localOid}^{commit}`]).trim() !== head) reject('PUSHED_REF_IS_NOT_HEAD')
    objects.add(localOid)
  }
  return objects
}

function requireSinglePublicRelease(root, head) {
  const advertised = git(root, ['ls-remote', '--exit-code', PUBLIC_REPOSITORY, 'refs/heads/main'],
    { timeout: 30000 }, 'PUBLIC_MAIN_UNAVAILABLE').trim().split(/\s+/)
  if (advertised.length !== 2 || !OID.test(advertised[0]) || advertised[1] !== 'refs/heads/main') reject('PUBLIC_MAIN_UNAVAILABLE')
  if (head === advertised[0]) return
  const ancestry = git(root, ['rev-list', '--parents', '-n', '1', head]).trim().split(/\s+/)
  if (ancestry.length !== 2 || ancestry[0] !== head || ancestry[1] !== advertised[0]) {
    reject('SINGLE_PUBLIC_RELEASE_COMMIT_REQUIRED')
  }
}

function materializeCommittedTree(root, head, target) {
  const entries = git(root, ['ls-tree', '-r', '-z', '--full-tree', head]).split('\0').filter(Boolean).map(entry => {
    const match = /^(100644|100755) blob ([a-f0-9]+)\t([^\r\n]+)$/.exec(entry)
    if (!match || !OID.test(match[2])) reject('UNSUPPORTED_TRACKED_OBJECT')
    const relative = match[3]
    if (relative.includes('\\') || path.isAbsolute(relative) || relative.split('/').some(part => !part || part === '.' || part === '..')) {
      reject('UNSAFE_TRACKED_PATH')
    }
    const destination = path.resolve(target, relative)
    if (!destination.startsWith(path.resolve(target) + path.sep)) reject('UNSAFE_TRACKED_PATH')
    return { oid: match[2], destination }
  })
  if (!entries.length) reject('EMPTY_TRACKED_TREE')
  // Read exact committed blobs, bypassing checkout filters and export-ignore.
  const blobs = git(root, ['cat-file', '--batch'], {
    encoding: null, input: entries.map(entry => entry.oid).join('\n') + '\n',
  })
  let offset = 0
  for (const entry of entries) {
    const end = blobs.indexOf(10, offset)
    if (end < 0) reject('INVALID_COMMITTED_BLOB')
    const header = blobs.subarray(offset, end).toString('ascii').split(' ')
    const size = Number(header[2])
    if (header[0] !== entry.oid || header[1] !== 'blob' || !Number.isSafeInteger(size) || size < 0
      || end + 1 + size >= blobs.length || blobs[end + 1 + size] !== 10) reject('INVALID_COMMITTED_BLOB')
    fs.mkdirSync(path.dirname(entry.destination), { recursive: true })
    fs.writeFileSync(entry.destination, blobs.subarray(end + 1, end + 1 + size))
    offset = end + size + 2
  }
  if (offset !== blobs.length) reject('INVALID_COMMITTED_BLOB')
}

function scanCommittedTree(root, head, pushedObjects) {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'openocti-push-check-'))
  try {
    const tree = path.join(temporary, 'tree')
    fs.mkdirSync(tree)
    materializeCommittedTree(root, head, tree)
    const objects = path.join(temporary, 'objects')
    fs.mkdirSync(objects)
    fs.writeFileSync(path.join(objects, head), git(root, ['cat-file', 'commit', head], { encoding: null }))
    const scannedTags = new Set()
    for (let oid of pushedObjects) {
      while (oid !== head && !scannedTags.has(oid)) {
        scannedTags.add(oid)
        if (git(root, ['cat-file', '-t', oid]).trim() !== 'tag') reject('UNSUPPORTED_PUSHED_OBJECT')
        const tag = git(root, ['cat-file', 'tag', oid], { encoding: null })
        fs.writeFileSync(path.join(objects, oid), tag)
        oid = /^object ([a-f0-9]+)\n/.exec(tag.toString('utf8'))?.[1]
        if (!OID.test(oid || '')) reject('UNSUPPORTED_PUSHED_OBJECT')
      }
    }
    const config = path.join(temporary, 'default-rules.toml')
    fs.writeFileSync(config, '[extend]\nuseDefault = true\n')
    const scan = spawnSync('gitleaks', [
      'dir', temporary, '--config', config, '--gitleaks-ignore-path', path.join(temporary, 'no-repository-ignores'),
      '--ignore-gitleaks-allow', '--redact=100', '--no-banner', '--exit-code', '1',
    ], { cwd: temporary, encoding: 'utf8', timeout: 120000, maxBuffer: 1024 * 1024 })
    if (scan.error?.code === 'ENOENT') reject('GITLEAKS_REQUIRED')
    if (scan.error || scan.status !== 0) reject('SECRET_SCAN_FAILED')
  } finally {
    const resolved = path.resolve(temporary)
    if (!resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) || !path.basename(resolved).startsWith('openocti-push-check-')) {
      reject('TEMPORARY_CLEANUP_FAILED')
    }
    fs.rmSync(resolved, { recursive: true, force: true })
  }
}

export function checkOpenOctiPush(remoteUrl, refInput, directory = process.cwd()) {
  if (!isApprovedPublicRemote(remoteUrl)) reject('PUBLIC_REMOTE_REQUIRED')
  const root = git(directory, ['rev-parse', '--show-toplevel']).trim()
  const head = git(root, ['rev-parse', '--verify', 'HEAD^{commit}']).trim()
  if (!OID.test(head)) reject('INVALID_HEAD')
  const pushedObjects = verifyPushedRefs(root, refInput, head)
  requireClean(root, head)
  requireSinglePublicRelease(root, head)
  let boundary
  try { boundary = verifyOpenOctiBoundary(root) } catch { reject('PUBLIC_BOUNDARY_FAILED') }
  if (!boundary?.ok || boundary.mode !== 'git') reject('PUBLIC_GIT_BOUNDARY_REQUIRED')
  scanCommittedTree(root, head, pushedObjects)
  requireClean(root, head)
  return { ok: true }
}

export function main(argv = process.argv.slice(2)) {
  try {
    if (argv.length !== 2) reject('INVALID_HOOK_ARGUMENTS')
    checkOpenOctiPush(argv[1], fs.readFileSync(0, 'utf8'))
    console.log('OpenOcti public push checks passed.')
    return 0
  } catch (error) {
    console.error(`OpenOcti public push blocked: ${error instanceof PushGuardError ? error.message : 'PUSH_CHECK_FAILED'}`)
    return 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) process.exitCode = main()
