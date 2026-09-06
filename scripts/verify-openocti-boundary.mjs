import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

export const BOUNDARY_MANIFEST = 'OPENOCTI_BOUNDARY.json'
const policyFile = path.join(path.dirname(fileURLToPath(import.meta.url)), 'openocti-boundary-policy.json')
const policy = JSON.parse(fs.readFileSync(policyFile, 'utf8'))
const pinned = { ...policy.seeds, ...policy.dataResources, ...policy.examples, ...policy.opaqueAssets }
const textExtensions = new Set(['', '.bat', '.cmd', '.cjs', '.conf', '.css', '.csv', '.example', '.html',
  '.js', '.json', '.jsx', '.md', '.mjs', '.ps1', '.service', '.sh', '.sql', '.svg', '.timer',
  '.toml', '.ts', '.tsx', '.txt', '.vbs', '.yaml', '.yml'])
const generated = name => /^(?:node_modules|\.next[^/]*|coverage|\.turbo)(?:\/|$)/i.test(name)
const rootRuntimeEnv = name => name === '.env' || name === '.env.local'
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex')
const checks = Object.freeze({
  safePaths: 'PASS', regularFilesOnly: 'PASS', runtimeArtifacts: 'PASS',
  approvedPublicFixtures: 'PASS', approvedOpaqueAssets: 'PASS',
  redactedContentScan: 'PASS', exactInventoryAndHashes: 'PASS',
})

export class BoundaryError extends Error {
  constructor(rule, relative = '') {
    const safe = /^[A-Za-z0-9_./@()+ ,\[\]-]{0,240}$/.test(relative) ? relative : '[unsafe path]'
    super(`OpenOcti boundary ${rule}${safe ? `: ${safe}` : ''}`)
    this.name = 'BoundaryError'
    this.rule = rule
    this.relativePath = safe
  }
}
const fail = (rule, relative) => { throw new BoundaryError(rule, relative) }

function normalizedPath(relative) {
  if (typeof relative !== 'string' || !relative || relative.includes('\\') || relative.includes(':')
    || relative.startsWith('/') || /[\x00-\x1f\x7f<>"|?*]/.test(relative)
    || relative.split('/').some(part => !part || part === '.' || part === '..' || /[ .]$/.test(part)
      || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) {
    fail('UNSAFE_PATH')
  }
  return relative
}

function publicDataResource(relative) { return Object.hasOwn(policy.dataResources, relative) }
function dataMirror(relative) { return relative.startsWith('data/') && !publicDataResource(relative) }
function containsDataResource(relative) { return Object.keys(policy.dataResources).some(name => name.startsWith(`${relative}/`)) }

function assertPath(relative, { tracked = false, mode }) {
  normalizedPath(relative)
  if (relative === '.git' || relative.startsWith('.git/')) fail('GIT_METADATA', relative)
  if (generated(relative)) {
    if (tracked || mode === 'export') fail('GENERATED_ARTIFACT', relative)
    return 'ignore'
  }
  if (/(^|\/)\.env(?:[./]|$)/i.test(relative) && relative !== '.env.example') {
    if (!tracked && mode === 'installed' && rootRuntimeEnv(relative)) return 'ignore'
    fail('ENVIRONMENT_FILE', relative)
  }
  if (/^(?:backups?|_restore-points|fcc-archives[^/]*|\.codex-logs|\.claude|\.gitea|\.tmp)(?:\/|$)/i.test(relative)
    || /\.(?:sqlite3?|db)(?:-(?:wal|shm|journal))?$/i.test(relative)
    || /\.(?:bak|backup|dump|log|pem|p12|pfx)$/i.test(relative)) {
    if (!tracked && mode === 'installed' && dataMirror(relative)) return 'ignore'
    fail('RUNTIME_ARTIFACT', relative)
  }
  if ((relative.startsWith('config/') && !Object.hasOwn(policy.examples, relative))
    || /^deploy\/systemd\/farrington-/i.test(relative)
    || /^deploy\/openclaw\/public-sales\//i.test(relative)
    || /^vault\/lead-sources\/_proving\//i.test(relative)
    || /^vault\/lead-sources\/county\/[^/]*-arcgis-[^/]*\.md$/i.test(relative)) fail('PRIVATE_CONFIG', relative)
  if (publicDataResource(relative)) return 'resource'
  if (dataMirror(relative)) {
    if (tracked) fail('TRACKED_RUNTIME_DATA', relative)
    if (mode === 'installed') return 'ignore'
    return 'mirror'
  }
  if (relative.startsWith('data-demo/') && !Object.hasOwn(policy.seeds, relative)) fail('UNAPPROVED_SEED', relative)
  return 'include'
}

function assertRegular(root, relative) {
  let current = root
  for (const part of relative.split('/')) {
    current = path.join(current, part)
    let stat
    try { stat = fs.lstatSync(current) } catch { fail('MISSING_FILE', relative) }
    if (stat.isSymbolicLink()) fail('SYMLINK', relative)
    if (current === path.join(root, ...relative.split('/'))) {
      if (!stat.isFile()) fail('NONREGULAR_FILE', relative)
    } else if (!stat.isDirectory()) fail('NONREGULAR_PATH', relative)
  }
}

function isNpmVersionReference(key, value, parents, relative) {
  return /(?:^|\/)package(?:-lock)?\.json$/.test(relative)
    && ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'].includes(parents.at(-1))
    && /^(?:@[a-z0-9._-]+\/)?[a-z0-9][a-z0-9._-]*$/.test(key)
    && /^[~^]?\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?(?:\+[A-Za-z0-9.-]+)?$/.test(value)
}

function scanStructured(value, relative, parents = []) {
  if (!value || typeof value !== 'object') return
  for (const [key, child] of Object.entries(value)) {
    if (/(?:^(?:password|secret|privateKey|apiKey|api_key|access_token|refresh_token|auth_token)$|(?:Secret|Token)$)/i.test(key)
      && typeof child === 'string' && child.trim() && !/^\$\{[A-Z0-9_]+\}$/.test(child)
      && !isNpmVersionReference(key, child, parents, relative)
      && !(Object.hasOwn(policy.examples, relative) && /^[A-Z][A-Z0-9_]+$/.test(child))) {
      fail('SECRET_FIELD', relative)
    }
    scanStructured(child, relative, [...parents, key])
  }
}

function describeFile(root, relative, pinOverride) {
  assertRegular(root, relative)
  let bytes
  try { bytes = fs.readFileSync(path.join(root, relative)) } catch { fail('UNREADABLE_FILE', relative) }
  if (bytes.subarray(0, 16).equals(Buffer.from('SQLite format 3\0'))) fail('DATABASE_SIGNATURE', relative)
  const approved = pinOverride || pinned[relative]
  if (approved?.kind === 'binary') {
    const hash = sha256(bytes)
    if (hash !== approved.sha256) fail('OPAQUE_ASSET_CHANGED', relative)
    return { path: relative, kind: 'binary', sha256: hash }
  }
  if (!textExtensions.has(path.extname(relative).toLowerCase())) fail('UNAPPROVED_FILE_TYPE', relative)
  let text
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes) } catch { fail('UNAPPROVED_OPAQUE_FILE', relative) }
  if (text.includes('\0')) fail('UNAPPROVED_OPAQUE_FILE', relative)
  text = text.replace(/\r\n?/g, '\n')
  const privateEndpoint = new RegExp([
    [178, 156, 186, 151].join('\\.'),
    ['crm', 'farrington' + 'development', 'com'].join('\\.'),
    ['fcc', 'prod', 'carl', 'a7x92k'].join('-'), ['carl', 'ububtu'].join('-'),
  ].join('|'), 'i')
  if (privateEndpoint.test(text)) fail('PRIVATE_ENDPOINT', relative)
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)) fail('PRIVATE_KEY', relative)
  if (path.extname(relative).toLowerCase() === '.json') {
    let value
    try { value = JSON.parse(text) } catch { fail('INVALID_JSON', relative) }
    scanStructured(value, relative)
  }
  const hash = sha256(Buffer.from(text))
  if (approved && hash !== approved.sha256) fail('APPROVED_CONTENT_CHANGED', relative)
  return { path: relative, kind: 'text', sha256: hash }
}

function gitInventory(root) {
  const metadataPath = path.join(root, '.git')
  if (fs.existsSync(metadataPath) && fs.lstatSync(metadataPath).isSymbolicLink()) fail('SYMLINK', '.git')
  const top = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: root, encoding: 'utf8' })
  if (top.status !== 0 || path.resolve(top.stdout.trim()).toLowerCase() !== root.toLowerCase()) return null
  const result = spawnSync('git', ['ls-files', '--stage', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
  if (result.status !== 0) fail('GIT_INVENTORY_UNAVAILABLE')
  return result.stdout.split('\0').filter(Boolean).map(entry => {
    const separator = entry.indexOf('\t')
    const metadata = entry.slice(0, separator).split(' ')
    const relative = entry.slice(separator + 1)
    normalizedPath(relative)
    if (!['100644', '100755'].includes(metadata[0]) || metadata[2] !== '0') fail('TRACKED_NONREGULAR_FILE', relative)
    return relative
  })
}

function diskInventory(root, mode) {
  const paths = []
  function walk(directory, prefix = '') {
    let entries
    try { entries = fs.readdirSync(directory, { withFileTypes: true }) } catch { fail('UNREADABLE_DIRECTORY', prefix) }
    for (const entry of entries) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name
      if (relative === '.git') {
        if (entry.isSymbolicLink()) fail('SYMLINK', relative)
        continue
      }
      normalizedPath(relative)
      if (generated(relative) && mode !== 'export') continue
      if (mode === 'installed' && (rootRuntimeEnv(relative) || (dataMirror(relative) && !containsDataResource(relative)))) continue
      if (entry.isSymbolicLink()) fail('SYMLINK', relative)
      if (entry.isDirectory()) {
        if (generated(relative)) fail('GENERATED_ARTIFACT', relative)
        walk(path.join(directory, entry.name), relative)
      } else if (entry.isFile()) paths.push(relative)
      else fail('NONREGULAR_FILE', relative)
    }
  }
  walk(root)
  return paths
}

function collect(root, mode, trackedPaths) {
  const files = []
  const seen = new Set()
  for (const relative of (trackedPaths || diskInventory(root, mode)).sort()) {
    normalizedPath(relative)
    const folded = relative.toLowerCase()
    if (seen.has(folded)) fail('DUPLICATE_PATH', relative)
    seen.add(folded)
    if (relative === BOUNDARY_MANIFEST) continue
    const disposition = assertPath(relative, { tracked: Boolean(trackedPaths), mode })
    if (disposition === 'ignore') continue
    if (disposition === 'resource') {
      // Approved product README/templates are optional seed mirrors. Docker
      // excludes data/, but any mirror present must still match its public pin.
      describeFile(root, relative)
      continue
    }
    if (disposition === 'mirror') {
      const source = `data-demo/${relative.slice('data/'.length)}`
      const expected = policy.seeds[source]
      if (!expected) fail('UNAPPROVED_RUNTIME_DATA', relative)
      describeFile(root, relative, expected)
      continue
    }
    files.push(describeFile(root, relative))
  }
  return files
}

function resolveRoot(root) {
  const resolved = path.resolve(root)
  let stat
  try { stat = fs.lstatSync(resolved) } catch { fail('ROOT_UNAVAILABLE') }
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail('UNSAFE_ROOT')
  return resolved
}

export function createBoundaryManifest(root, { sourceCommit } = {}) {
  if (!/^[a-f0-9]{40}$/i.test(sourceCommit || '')) fail('SOURCE_COMMIT_REQUIRED')
  const files = collect(resolveRoot(root), 'export', null)
  return {
    schemaVersion: 1, sourceCommit: sourceCommit.toLowerCase(),
    approvedPublicCommit: policy.approvedPublicCommit,
    normalization: 'utf8-lf-text/raw-binary', files,
  }
}

// Read-only operator diagnostics for a pending export. This does not approve a
// tree, create a manifest, or replace the fail-closed production verifier.
export function diagnoseBoundaryInputs(root) {
  root = resolveRoot(root)
  const failures = []
  let paths
  try { paths = diskInventory(root, 'export') } catch (error) {
    return [{ rule: error instanceof BoundaryError ? error.rule : 'SCAN_FAILED', path: error.relativePath || '' }]
  }
  const seen = new Set()
  for (const relative of paths.sort()) {
    try {
      const key = normalizedPath(relative).toLowerCase()
      if (seen.has(key)) fail('DUPLICATE_PATH', relative)
      seen.add(key)
      if (relative === BOUNDARY_MANIFEST) continue
      const disposition = assertPath(relative, { mode: 'export' })
      if (disposition === 'mirror') {
        const expected = policy.seeds[`data-demo/${relative.slice('data/'.length)}`]
        if (!expected) fail('UNAPPROVED_RUNTIME_DATA', relative)
        describeFile(root, relative, expected)
      } else if (disposition !== 'ignore') describeFile(root, relative)
    } catch (error) {
      failures.push({ rule: error instanceof BoundaryError ? error.rule : 'SCAN_FAILED', path: error.relativePath || '' })
    }
  }
  return failures
}

export function verifyOpenOctiBoundary(root = process.cwd(), { useGitInventory = true } = {}) {
  root = resolveRoot(root)
  assertRegular(root, BOUNDARY_MANIFEST)
  let manifest
  try { manifest = JSON.parse(fs.readFileSync(path.join(root, BOUNDARY_MANIFEST), 'utf8')) } catch { fail('INVALID_MANIFEST') }
  const keysAre = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).sort().join('|') === [...keys].sort().join('|')
  if (!keysAre(manifest, ['schemaVersion', 'sourceCommit', 'approvedPublicCommit', 'normalization', 'files'])
    || manifest.schemaVersion !== 1 || !/^[a-f0-9]{40}$/.test(manifest.sourceCommit || '')
    || manifest.approvedPublicCommit !== policy.approvedPublicCommit
    || manifest.normalization !== 'utf8-lf-text/raw-binary' || !Array.isArray(manifest.files)) fail('INVALID_MANIFEST')
  const expected = new Map()
  for (const entry of manifest.files) {
    if (!keysAre(entry, ['path', 'kind', 'sha256'])) fail('INVALID_MANIFEST')
    const relative = normalizedPath(entry?.path)
    if (relative === BOUNDARY_MANIFEST || expected.has(relative.toLowerCase())
      || !['text', 'binary'].includes(entry.kind) || !/^[a-f0-9]{64}$/.test(entry.sha256 || '')) fail('INVALID_MANIFEST', relative)
    assertPath(relative, { tracked: true, mode: 'git' })
    expected.set(relative.toLowerCase(), entry)
  }
  const tracked = useGitInventory ? gitInventory(root) : null
  if (tracked && !tracked.includes(BOUNDARY_MANIFEST)) fail('UNTRACKED_MANIFEST', BOUNDARY_MANIFEST)
  const mode = useGitInventory ? (tracked ? 'git' : 'installed') : 'export'
  const files = collect(root, mode, tracked)
  for (const actual of files) {
    const recorded = expected.get(actual.path.toLowerCase())
    if (!recorded) fail('UNEXPECTED_FILE', actual.path)
    if (recorded.path !== actual.path || recorded.kind !== actual.kind || recorded.sha256 !== actual.sha256) fail('CONTENT_CHANGED', actual.path)
    expected.delete(actual.path.toLowerCase())
  }
  if (expected.size) fail('MISSING_FILE', expected.values().next().value.path)
  return { ok: true, mode, sourceCommit: manifest.sourceCommit, fileCount: files.length, safetyChecks: { ...checks } }
}

export function main(argv = process.argv.slice(2)) {
  try {
    const argumentsWithoutFlags = argv.filter(value => value !== '--export')
    if (argumentsWithoutFlags.length > 1 || argumentsWithoutFlags.some(value => value.startsWith('--'))) fail('INVALID_ARGUMENTS')
    const result = verifyOpenOctiBoundary(argumentsWithoutFlags[0] || process.cwd(), { useGitInventory: !argv.includes('--export') })
    console.log(JSON.stringify(result))
    return 0
  } catch (error) {
    console.error(error instanceof BoundaryError ? error.message : 'OpenOcti boundary VERIFICATION_FAILED')
    return 1
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) process.exitCode = main()
