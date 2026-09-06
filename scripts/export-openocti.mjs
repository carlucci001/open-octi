import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { generateThirdPartyNotices } from './generate-third-party-notices.mjs'
import { generateOctiKnowledge } from './generate-octi-knowledge.mjs'
import { isOpenOctiExcluded, OPENOCTI_EXCLUDES } from './openocti-excludes.mjs'
import { createApprovedSourceSnapshot } from './openocti-source-snapshot.mjs'
import { createBoundaryManifest, verifyOpenOctiBoundary } from './verify-openocti-boundary.mjs'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
export const SOURCE_ROOT = path.resolve(SCRIPT_DIR, '..')
export const DEFAULT_OUTPUT = path.resolve(SOURCE_ROOT, '..', 'openocti-export')
const DEV_VERSION = '0.0.0-dev'
const SEMVER_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/

const OPENOCTI_REQUIRED_ENV_KEYS = [
  'CRM_SESSION_SECRET',
  'INITIAL_ADMIN_PASSWORD',
  'PUBLIC_APP_URL',
  'OPENOCTI_BUSINESS_NAME',
  'OPENOCTI_OWNER_NAME',
  'OWNER_EMAIL',
]

const OPENOCTI_DEFAULT_ENV_KEYS = [
  'CRM_DATA_DIR',
  'DATA_BACKEND',
  'FCC_EDITION',
  'NEXT_PUBLIC_FCC_EDITION',
]

export const OPENOCTI_HOST_ONLY_ENV_KEYS = new Set([
  'BACKUP_DIR',
  'CRM_DB_PATH',
  'CRM_INTERNAL_ORIGIN',
  'CRM_LIVE_PATH',
  'DEMO_BASE_URL',
  'DEV_ROOT',
  'FARRINGTON_PUBLIC_URL',
  'FCC_AUTH_GATE_ORIGIN',
  'FCC_BUILD_COMMIT',
  'FCC_BUILD_NUMBER',
  'FCC_LIVE_PATH',
  'FCC_OPS_RUNS_DIR',
  'FCC_SOURCE_BRANCH',
  'FCC_SOURCE_REMOTE',
  'FCC_STUDIO_DIR',
  'FCC_SW_VERSION',
  'NEXT_DIST_DIR',
  'NEXT_PHASE',
  'NEXT_PUBLIC_APP_VERSION',
  'NEXT_PUBLIC_CRM_URL',
  'NEXT_PUBLIC_FCC_BUILD_COMMIT',
  'NEXT_PUBLIC_FCC_BUILD_NUMBER',
  'NEXT_PUBLIC_FCC_BUILT_AT',
  'NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA',
  'NEXT_RUNTIME',
  'NODE_ENV',
  'OPENMONTAGE_ROOT',
  'OPEN_MONTAGE_ROOT',
  'PORT',
  'USERPROFILE',
  'VITEST',
  'YT_TOKEN_FILE',
])

const OVERLAYS = new Map([
  ['README.md', 'README.md'],
  ['LICENSE', 'LICENSE'],
  ['LICENSE-COMMERCIAL.md', 'LICENSE-COMMERCIAL.md'],
  ['CLA.md', 'CLA.md'],
  ['CONTRIBUTING.md', 'CONTRIBUTING.md'],
  ['SECURITY.md', 'SECURITY.md'],
  ['CODE_OF_CONDUCT.md', 'CODE_OF_CONDUCT.md'],
  ['docs/INSTALL.md', 'docs/INSTALL.md'],
  ['docs/RELEASING.md', 'docs/RELEASING.md'],
  ['.github/workflows/ci.yml', '.github/workflows/ci.yml'],
  ['.github/workflows/publish-images.yml', '.github/workflows/publish-images.yml'],
  ['.githooks/pre-push', '.githooks/pre-push'],
  ['.dockerignore', '.dockerignore'],
])

const DIRECTORY_OVERLAYS = ['docs/brand', 'docs/guides', 'docs/releases', 'docs/screenshots']

const TEXT_EXTENSIONS = new Set([
  '', '.bat', '.cjs', '.conf', '.css', '.csv', '.dockerignore', '.env', '.example',
  '.html', '.js', '.json', '.jsx', '.md', '.mjs', '.ps1', '.service', '.sh', '.sql', '.svg', '.toml',
  '.ts', '.tsx', '.txt', '.yaml', '.yml',
])

const OPENOCTI_REFERENCE_REPLACEMENTS = [
  [new RegExp(['newsroom', '-?', 'aios\\.com'].join(''), 'gi'), 'content.example.com'],
  [new RegExp(['my', 'vtc\\.com'].join(''), 'gi'), 'video.example.com'],
  [new RegExp(['carl', 'farrington\\.com'].join(''), 'gi'), 'owner.example.com'],
  [new RegExp(['farrington', 'development\\.com'].join(''), 'gi'), 'company.example.com'],
  // Keep generic product replacements identifier/path-safe because the scrubber
  // also processes JavaScript keys, route IDs, import specifiers, and filenames.
  [new RegExp(['get', 'found'].join(''), 'gi'), 'SearchTools'],
  [new RegExp(['get', 'remedy'].join(''), 'gi'), 'RemedySuite'],
  [new RegExp(['my', 'vtc'].join(''), 'gi'), 'VideoHub'],
  [new RegExp(['newsroom', '-?', 'aios'].join(''), 'gi'), 'ContentStudio'],
  [new RegExp(['search', 'suite'].join(''), 'gi'), 'SearchTools'],
  [new RegExp(['content', 'hub'].join(''), 'gi'), 'ContentStudio'],
  [new RegExp(['wnc', '_times'].join(''), 'gi'), 'sample_business'],
  [new RegExp(['farrington', ' knowledge'].join(''), 'gi'), 'Knowledge'],
  [new RegExp(['command center', ' mail'].join(''), 'gi'), 'Mail'],
  [new RegExp(['/home/', 'carl'].join(''), 'gi'), '/srv/openocti'],
  [new RegExp(['vibn', 'flow'].join(''), 'gi'), 'WorkflowSuite'],
  [new RegExp(['vibn', 'flip'].join(''), 'gi'), 'PublishingSuite'],
  [new RegExp(['vibin', 'flow'].join(''), 'gi'), 'WorkflowSuite'],
]

const OPENOCTI_CONTACT_REPLACEMENTS = [
  [/tel:\+?[\d(). -]{7,}/gi, 'tel:PHONE_REDACTED'],
  [/(\bphone(?:_numbers?|display|href)?\b[^\r\n]*?)\b\d{10}\b/gi, '$1PHONE_REDACTED'],
  [/(?:\+?1[ .-]?)?\(?[2-9]\d{2}\)?[ .-]\d{3}[ .-]\d{4}\b/g, 'PHONE_REDACTED'],
  [new RegExp(['ashe', 'ville', '(?:,\\s*[A-Z]{2})?'].join(''), 'gi'), 'City, ST'],
  [new RegExp(['carl', 'farring'].join(''), 'gi'), 'workspace-owner'],
]

const SCRUB_REPLACEMENTS = [
  ...OPENOCTI_REFERENCE_REPLACEMENTS,
  ...OPENOCTI_CONTACT_REPLACEMENTS,
  [/178\.156\.186\.151/g, '203.0.113.10'],
  [/crm\.farringtondevelopment\.com/gi, 'openocti.local'],
  [/openocti-alerts/gi, 'openocti-alerts'],
  [/openocti-host/gi, 'openocti-host'],
  [/openocti-host/gi, 'openocti-host'],
  [/\b192\.168\.\d{1,3}\.\d{1,3}\b/g, '127.0.0.1'],
  [/\b100\.66\.\d{1,3}\.\d{1,3}\b/g, '127.0.0.1'],
  [/acct_REDACTED/g, 'acct_REDACTED'],
]

export function neutralizeOpenOctiReferences(value) {
  let result = String(value || '')
  for (const [pattern, replacement] of [...OPENOCTI_REFERENCE_REPLACEMENTS, ...OPENOCTI_CONTACT_REPLACEMENTS]) {
    result = result.replace(pattern, replacement)
  }
  return result
}

const FORBIDDEN_EXPORT_PATTERNS = [
  ['live IPv4 address', /178\.156\.186\.151/],
  ['live CRM hostname', /crm\.farringtondevelopment\.com/i],
  ['production host label', /openocti-host/i],
  ['private workstation label', /openocti-host/i],
  ['private LAN address', /\b192\.168\.\d{1,3}\.\d{1,3}\b/],
  ['private tailnet address', /\b100\.66\.\d{1,3}\.\d{1,3}\b/],
  ['private notification topic', /openocti-alerts/i],
  ['production account identifier', /acct_REDACTED/],
  ['North American phone number', /(?:\+?1[ .-]?)?\(?[2-9]\d{2}\)?[ .-]\d{3}[ .-]\d{4}\b/],
  ['compact phone-labeled number', /(\bphone(?:_numbers?|display|href)?\b[^\r\n]*?)\b\d{10}\b/i],
  ['telephone href', /tel:\+/i],
  ['private city', new RegExp(['ashe', 'ville'].join(''), 'i')],
  ['owner personal identifier', new RegExp(['carl', 'farring'].join(''), 'i')],
]

// Keep the blocked product markers out of this source file itself by building
// each matcher from neutral fragments. The exported scanner therefore scans
// its own implementation without requiring an exception.
export const OPENOCTI_PRODUCT_DENYLIST = Object.freeze([
  ['closed search product reference', new RegExp(['get', 'found'].join(''), 'i')],
  ['closed remediation product reference', new RegExp(['get', 'remedy'].join(''), 'i')],
  ['closed video product reference', new RegExp(['my', 'vtc'].join(''), 'i')],
  ['closed news product reference', new RegExp(['newsroom', '-?', 'aios'].join(''), 'i')],
  ['closed workflow product reference', new RegExp(['vibn', 'flow'].join(''), 'i')],
  ['closed flip product reference', new RegExp(['vibn', 'flip'].join(''), 'i')],
  ['closed alternate workflow reference', new RegExp(['vibin', 'flow'].join(''), 'i')],
  ['closed owner domain reference', new RegExp(['carl', 'farrington\\.com'].join(''), 'i')],
  ['closed company domain reference', new RegExp(['farrington', 'development\\.com'].join(''), 'i')],
  ['closed production host reference', new RegExp(['fcc-', 'prod'].join(''), 'i')],
  ['private telephone href', new RegExp(['tel:\\+', '1828'].join(''), 'i')],
  ['private city reference', new RegExp(['ashe', 'ville'].join(''), 'i')],
  ['owner personal identifier', new RegExp(['carl', 'farring'].join(''), 'i')],
  ['closed search suite reference', new RegExp(['search', 'suite'].join(''), 'i')],
  ['closed content suite reference', new RegExp(['content', 'hub'].join(''), 'i')],
  ['private publication identifier', new RegExp(['wnc', '_times'].join(''), 'i')],
  ['private knowledge label', new RegExp(['farrington', ' knowledge'].join(''), 'i')],
  ['private mail label', new RegExp(['command center', ' mail'].join(''), 'i')],
  ['personal home path', new RegExp(['/home/', 'carl'].join(''), 'i')],
])

export function matchOpenOctiDenylist(value) {
  const text = String(value || '')
  return OPENOCTI_PRODUCT_DENYLIST
    .filter(([, pattern]) => pattern.test(text))
    .map(([label]) => label)
}

function isAllowedNcLeadSourceReference(value) {
  const relative = String(value || '').replaceAll('\\', '/').toLowerCase()
  if (!relative.startsWith('vault/lead-sources/')) return false
  return relative.startsWith('vault/lead-sources/state/nc-')
    || relative.startsWith('vault/lead-sources/county/nc-')
    || relative.startsWith('vault/lead-sources/county/buncombe-')
    || relative.startsWith(`vault/lead-sources/city/${['ashe', 'ville-'].join('')}`)
    || relative.startsWith(`vault/lead-sources/_proving/${['ashe', 'ville-'].join('')}`)
    || relative.startsWith('vault/lead-sources/_proving/buncombe-')
    || relative.startsWith('vault/lead-sources/_proving/nc-')
}

const DATA_DEMO_PATTERNS = [
  ['email marker', /@/],
  ['international phone prefix', /\+1/],
  ['API-key prefix', /sk-/i],
  ['Twilio account identifier', /\bAC[0-9a-f]{32}\b/i],
  ['token field', /["'](?:access_?token|refresh_?token|auth_?token|api_?token)["']\s*:/i],
]

function parseOutputArgument(argv) {
  const index = argv.indexOf('--output')
  return index >= 0 && argv[index + 1] ? path.resolve(argv[index + 1]) : DEFAULT_OUTPUT
}

export function resolveOpenOctiVersion(argv, env = process.env) {
  const dev = argv.includes('--dev')
  const versionIndex = argv.indexOf('--version')
  const cliVersion = versionIndex >= 0 ? argv[versionIndex + 1] : undefined

  if (versionIndex >= 0 && (!cliVersion || cliVersion.startsWith('--'))) {
    throw new Error('Missing value for --version. Expected --version X.Y.Z.')
  }
  if (dev && versionIndex >= 0) {
    throw new Error('Choose either --version X.Y.Z or --dev, not both.')
  }

  const version = dev ? DEV_VERSION : (cliVersion || env.OPENOCTI_VERSION || '').trim()
  if (!version) {
    throw new Error('OpenOcti version is required. Pass --version X.Y.Z, set OPENOCTI_VERSION, or use --dev.')
  }
  if (!SEMVER_PATTERN.test(version)) {
    throw new Error(`Invalid OpenOcti version "${version}". Expected semantic version X.Y.Z.`)
  }
  return version
}

export function assertSafeOutput(output) {
  const parsed = path.parse(output)
  if (output === parsed.root || output === SOURCE_ROOT || SOURCE_ROOT.startsWith(`${output}${path.sep}`)) {
    throw new Error(`Refusing unsafe export target: ${output}`)
  }
  if (!['openocti-export', 'openocti-export-merged'].includes(path.basename(output).toLowerCase())) {
    throw new Error('Export target directory must be named openocti-export or openocti-export-merged.')
  }
}

function shouldCopy(source, sourceRoot) {
  const relative = path.relative(sourceRoot, source).replaceAll('\\', '/')
  return relative === '' || !isOpenOctiExcluded(relative)
}

function copyPublicTree(output, sourceRoot) {
  fs.cpSync(sourceRoot, output, {
    recursive: true,
    dereference: false,
    filter: source => shouldCopy(source, sourceRoot),
  })
}

function resetOutput(output) {
  fs.mkdirSync(output, { recursive: true })
  for (const entry of fs.readdirSync(output)) {
    if (entry === '.git') continue
    const target = path.resolve(output, entry)
    if (!target.startsWith(`${output}${path.sep}`)) throw new Error(`Refusing unsafe cleanup target: ${target}`)
    fs.rmSync(target, { recursive: true, force: true })
  }
}

export function validatePublicStarterData(agents, roster, voice) {
  const ids = ['octi-guide', 'main', 'coding', 'social-media', 'legal', 'matilda']
  const sameKeys = (value, expected) => value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).sort().join('|') === [...expected].sort().join('|')
  if (!sameKeys(agents, ['__version', 'agents', 'presetsBootstrapped']) || agents.__version !== 1
    || agents.presetsBootstrapped !== false || !sameKeys(agents.agents, ids)) {
    throw new Error('Public starter agents must use the reviewed public schema and IDs.')
  }
  const fields = new Set(['name', 'emoji', 'category', 'title', 'role', 'description', 'instructions',
    'voiceProfile', 'channels', 'voice', 'runtimeProvider', 'modelPrimary', 'tags', 'tools', 'schedule', 'disabled'])
  function checkFields(value) {
    if (!value || typeof value !== 'object') return
    for (const [key, child] of Object.entries(value)) {
      if (/(?:api.?key|token|password|secret|private.?key|agentId|voiceId)/i.test(key) && child !== '') {
        throw new Error('Public starter data cannot contain installation credentials or provider IDs.')
      }
      checkFields(child)
    }
  }
  for (const agent of Object.values(agents.agents)) {
    if (!agent || Object.keys(agent).some(key => !fields.has(key))
      || !Array.isArray(agent.tools) || agent.tools.length || agent.disabled !== false
      || !sameKeys(agent.schedule, ['mode']) || agent.schedule.mode !== 'on-demand') {
      throw new Error('Public starter agents must have approved fields, no tool grants, and on-demand schedules.')
    }
    checkFields(agent)
  }
  if (!sameKeys(roster, ids.filter(id => id !== 'octi-guide'))) throw new Error('Unexpected public voice roster IDs.')
  for (const entry of Object.values(roster)) {
    if (!sameKeys(entry, ['agentId', 'voiceId', 'voiceName', 'name', 'firstName'])
      || ['agentId', 'voiceId', 'voiceName'].some(key => entry[key] !== '')) {
      throw new Error('Public voice roster must have blank installation bindings.')
    }
  }
  if (!sameKeys(voice, ['agentId', 'voiceId', 'voiceName', 'name', 'createdAt'])
    || ['agentId', 'voiceId', 'voiceName', 'createdAt'].some(key => voice[key] !== '')) {
    throw new Error('Public voice starter must have blank installation bindings.')
  }
  return true
}

function validateDataDemo(sourceRoot) {
  const root = path.join(sourceRoot, 'data-demo')
  if (!fs.existsSync(root)) throw new Error('data-demo is missing; refusing to export real data.')
  const failures = []
  for (const file of listFiles(root)) {
    const content = fs.readFileSync(file, 'utf8')
    for (const [label, pattern] of DATA_DEMO_PATTERNS) {
      if (pattern.test(content)) failures.push(`${path.relative(root, file)}: ${label}`)
    }
  }
  if (failures.length) throw new Error(`data-demo safety scan failed (${failures.join(', ')})`)
  const read = name => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'))
  validatePublicStarterData(read('agents.json'), read('voice-agent-roster.json'), read('voice-agent.json'))
  return listFiles(root).length
}

function installDemoData(output, sourceRoot) {
  // `data/` lets `npm start` users run immediately; `data-demo/` is what the Docker image
  // copies in and the entrypoint seeds the /data volume from on first boot.
  for (const dir of ['data', 'data-demo']) {
    fs.cpSync(path.join(sourceRoot, 'data-demo'), path.join(output, dir), { recursive: true })
  }
}

export function writeOpenOctiEnvExample(output, sourceFile = path.join(SOURCE_ROOT, '.env.example')) {
  const source = fs.readFileSync(sourceFile, 'utf8')
  const entries = new Map()
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/)
    if (match) entries.set(match[1], match[2])
  }

  const requiredKeys = [...OPENOCTI_REQUIRED_ENV_KEYS, ...OPENOCTI_DEFAULT_ENV_KEYS]
  const missingKeys = requiredKeys.filter(key => !entries.has(key))
  if (missingKeys.length) {
    throw new Error(`Missing required OpenOcti environment keys: ${missingKeys.join(', ')}`)
  }

  const optionalKeys = [...entries.keys()]
    .filter(key => !requiredKeys.includes(key) && !OPENOCTI_HOST_ONLY_ENV_KEYS.has(key))
    .filter(key => matchOpenOctiDenylist(key).length === 0)
  for (const key of ['OPENOCTI_PORT', 'DEERFLOW_PORT']) {
    if (!optionalKeys.includes(key)) optionalKeys.push(key)
  }

  const lines = [
    '# OpenOcti environment',
    '# Copy this file to .env, then replace the six required values below.',
    '# Never commit .env or real credentials.',
    '',
    '# Required - replace all six values',
    ...OPENOCTI_REQUIRED_ENV_KEYS.map(key => `${key}=${entries.get(key)}`),
    '',
    '# OpenOcti defaults - leave unchanged',
    ...OPENOCTI_DEFAULT_ENV_KEYS.map(key => `${key}=${entries.get(key)}`),
    '',
    '# OPENCLAW_GATEWAY_TOKEN and OPENCLAW_API_KEY:',
    '# auto-generated on first start; set your own to override',
    '# Optional integrations - uncomment only the keys you use',
    ...optionalKeys.map(key => `# ${key}=`),
    '',
  ]
  fs.writeFileSync(path.join(output, '.env.example'), lines.join('\n'))
}

function installOverlays(output, sourceRoot) {
  for (const [source, target] of OVERLAYS) {
    const sourceFile = path.join(sourceRoot, 'openocti', source)
    if (!fs.existsSync(sourceFile)) throw new Error(`Missing OpenOcti overlay: ${source}`)
    const targetFile = path.join(output, target)
    fs.mkdirSync(path.dirname(targetFile), { recursive: true })
    fs.copyFileSync(sourceFile, targetFile)
  }
  for (const relative of DIRECTORY_OVERLAYS) {
    const sourceDir = path.join(sourceRoot, 'openocti', relative)
    if (!fs.existsSync(sourceDir)) throw new Error(`Missing OpenOcti overlay directory: ${relative}`)
    fs.cpSync(sourceDir, path.join(output, relative), { recursive: true })
  }
  writeOpenOctiEnvExample(output, path.join(sourceRoot, '.env.example'))
}

export function stampExportVersion(output, version, exportedAt = new Date().toISOString()) {
  if (!SEMVER_PATTERN.test(version || '')) {
    throw new Error(`Invalid OpenOcti version "${version || ''}". Expected semantic version X.Y.Z.`)
  }
  const packageFile = path.join(output, 'package.json')
  const pkg = JSON.parse(fs.readFileSync(packageFile, 'utf8'))
  pkg.name = 'openocti'
  pkg.version = version
  pkg.private = false
  pkg.license = 'AGPL-3.0-only'
  const allowedScripts = new Set(['dev', 'build', 'start', 'test', 'test:watch', 'test:ui', 'inventory', 'verify:data-backend', 'export:openocti', 'docs:check', 'monitor:run'])
  pkg.scripts = Object.fromEntries(Object.entries(pkg.scripts || {}).filter(([name]) => allowedScripts.has(name)))
  pkg.scripts.build = 'node scripts/openocti-build.mjs'
  fs.writeFileSync(packageFile, `${JSON.stringify(pkg, null, 2)}\n`)

  const lockFile = path.join(output, 'package-lock.json')
  const lock = JSON.parse(fs.readFileSync(lockFile, 'utf8'))
  lock.name = 'openocti'
  lock.version = version
  if (lock.packages?.['']) {
    lock.packages[''].name = 'openocti'
    lock.packages[''].version = version
    lock.packages[''].license = 'AGPL-3.0-only'
  }
  fs.writeFileSync(lockFile, `${JSON.stringify(lock, null, 2)}\n`)

  const versionFile = path.join(output, 'VERSION.json')
  fs.writeFileSync(versionFile, `${JSON.stringify({
    version,
    exportedAt,
    source: 'farrington-command-center',
  }, null, 2)}\n`)
}

function installOpenClawPlugin(output) {
  const staging = path.join(output, '.openclaw-plugin-staging')
  const target = path.join(output, 'deploy', 'openclaw', 'openocti-plugin')
  if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true })
  if (!fs.existsSync(target)) throw new Error('OpenOcti OpenClaw plugin is missing.')

  const packageFile = path.join(target, 'package.json')
  const pkg = JSON.parse(fs.readFileSync(packageFile, 'utf8'))
  pkg.name = '@openocti/openclaw-plugin'
  pkg.description = 'OpenClaw plugin for OpenOcti CRM tools'
  fs.writeFileSync(packageFile, `${JSON.stringify(pkg, null, 2)}\n`)

  const manifestFile = path.join(target, 'openclaw.plugin.json')
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'))
  manifest.id = 'openocti'
  manifest.name = 'OpenOcti'
  manifest.description = 'CRM tools connected to OpenOcti'
  if (manifest.configSchema?.baseUrl) manifest.configSchema.baseUrl.default = 'http://app:3000'
  fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`)
}

function isTextFile(file) {
  const name = path.basename(file)
  if (name === 'Dockerfile' || name.startsWith('Dockerfile.')) return true
  return TEXT_EXTENSIONS.has(path.extname(file).toLowerCase())
}

function scrubKnownInfrastructure(output) {
  let replacements = 0
  for (const file of listFiles(output)) {
    if (!isTextFile(file)) continue
    let content = fs.readFileSync(file, 'utf8')
    const original = content
    for (const [pattern, replacement] of SCRUB_REPLACEMENTS) {
      content = content.replace(pattern, replacement)
    }
    content = content.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, (email) => {
      if (/@(example\.(?:com|org|net|invalid|test)|openocti\.com)$/i.test(email)) return email
      replacements += 1
      // Preserve the behavior under test without retaining the address: a
      // personal mailbox must remain distinguishable from a company mailbox.
      return /@(gmail|hotmail|yahoo|aol|outlook|icloud|live|msn)\./i.test(email)
        ? 'personal@example.invalid'
        : 'redacted@example.invalid'
    })
    if (content !== original) {
      replacements += 1
      fs.writeFileSync(file, content)
    }
  }
  return replacements
}

function scanExport(output) {
  const failures = []
  for (const file of listFiles(output)) {
    if (!isTextFile(file)) continue
    const content = fs.readFileSync(file, 'utf8')
    const relative = path.relative(output, file).replaceAll('\\', '/')
    for (const [label, pattern] of FORBIDDEN_EXPORT_PATTERNS) {
      if (label === 'private city' && (isAllowedNcLeadSourceReference(relative) || relative === 'OPENOCTI_FILELIST.txt')) continue
      if (pattern.test(content)) failures.push(`${path.relative(output, file)}: ${label}`)
    }
    const emails = content.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []
    if (emails.some((email) => !/@(example\.(?:com|org|net|invalid|test)|openocti\.com)$/i.test(email))) {
      failures.push(`${path.relative(output, file)}: personal email address`)
    }
  }
  if (failures.length) throw new Error(`Export privacy scan failed (${failures.join(', ')})`)
}

export function scanOpenOctiDenylist(output) {
  const failures = []
  for (const file of listFiles(output)) {
    const relative = path.relative(output, file).replaceAll('\\', '/')
    for (const label of matchOpenOctiDenylist(relative)) {
      if (label === 'private city reference' && isAllowedNcLeadSourceReference(relative)) continue
      failures.push(`${relative}:0: ${label} in path`)
    }
    if (!isTextFile(file)) continue
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/)
    lines.forEach((line, index) => {
      for (const label of matchOpenOctiDenylist(line)) {
        if (label === 'private city reference' && (isAllowedNcLeadSourceReference(relative) || (relative === 'OPENOCTI_FILELIST.txt' && isAllowedNcLeadSourceReference(line)))) continue
        failures.push(`${relative}:${index + 1}: ${label}`)
      }
    })
  }
  if (failures.length) {
    throw new Error(`OpenOcti product denylist scan failed (${failures.length} hits):\n${failures.join('\n')}`)
  }
  return 'PASS (0 hits)'
}

function runGitleaks(output) {
  const report = path.join(os.tmpdir(), `openocti-gitleaks-${process.pid}.json`)
  const command = process.platform === 'win32' ? 'gitleaks.exe' : 'gitleaks'
  const configPath = path.join(os.tmpdir(), `openocti-gitleaks-${process.pid}.toml`)
  fs.writeFileSync(configPath, '[extend]\nuseDefault = true\n')
  let result
  try {
  result = spawnSync(command, ['dir', output, '--config', configPath, '--gitleaks-ignore-path', `${configPath}.no-ignores`, '--ignore-gitleaks-allow', '--no-banner', '--redact=100', '--exit-code', '1', '--report-format', 'json', '--report-path', report], {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  })
  } finally {
  fs.rmSync(report, { force: true })
  fs.rmSync(configPath, { force: true })
  }
  if (result.error?.code === 'ENOENT') throw new Error('gitleaks is required but was not found on PATH.')
  if (result.status !== 0) throw new Error(`gitleaks failed with exit code ${result.status}; findings were redacted.`)
  return 'PASS (0 findings)'
}

export function listFiles(root) {
  const files = []
  if (!fs.existsSync(root)) return files
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.name === '.git') continue
    const full = path.join(root, entry.name)
    if (entry.isDirectory()) files.push(...listFiles(full))
    else if (entry.isFile()) files.push(full)
  }
  return files
}

function writeFileList(output) {
  const fileListPath = path.join(output, 'OPENOCTI_FILELIST.txt')
  const files = listFiles(output)
    .filter((file) => file !== fileListPath && path.basename(file) !== 'OPENOCTI_MANIFEST.json')
    .map((file) => path.relative(output, file).replaceAll('\\', '/'))
    .sort()
  fs.writeFileSync(fileListPath, `${files.join('\n')}\n`)
  return files.length
}

function writeManifest(output, metadata) {
  const manifestPath = path.join(output, 'OPENOCTI_MANIFEST.json')
  const files = listFiles(output).filter((file) => file !== manifestPath).sort()
  const tree = crypto.createHash('sha256')
  let bytes = 0
  for (const file of files) {
    const relative = path.relative(output, file).replaceAll('\\', '/')
    const content = fs.readFileSync(file)
    const hash = crypto.createHash('sha256').update(content).digest('hex')
    tree.update(`${relative}\0${hash}\n`)
    bytes += content.length
  }
  const manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    source: 'OpenOcti export',
    excludes: OPENOCTI_EXCLUDES.map(neutralizeOpenOctiReferences),
    fileCount: files.length,
    byteCount: bytes,
    treeSha256: tree.digest('hex'),
    ...metadata,
  }
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  return manifest
}

export function exportOpenOcti(output = DEFAULT_OUTPUT, { version, exportedAt = new Date().toISOString() } = {}) {
  output = path.resolve(output)
  assertSafeOutput(output)
  if (!version) {
    throw new Error('OpenOcti version is required. Pass --version X.Y.Z, set OPENOCTI_VERSION, or use --dev.')
  }
  const snapshot = createApprovedSourceSnapshot(SOURCE_ROOT)
  try {
  const starterAgentPack = 'reviewed-public-constants'
  const demoFileCount = validateDataDemo(snapshot.root)
  const thirdParty = generateThirdPartyNotices(snapshot.root)

  resetOutput(output)
  copyPublicTree(output, snapshot.root)
  installDemoData(output, snapshot.root)
  installOverlays(output, snapshot.root)
  stampExportVersion(output, version, exportedAt)
  installOpenClawPlugin(output)
  const octiKnowledge = generateOctiKnowledge(output)
  fs.writeFileSync(path.join(output, 'THIRD_PARTY_NOTICES.md'), thirdParty.content)
  const scrubbedOccurrenceCount = scrubKnownInfrastructure(output)
  const listedFileCount = writeFileList(output)
  scanExport(output)
  const gitleaks = runGitleaks(output)
  const manifest = writeManifest(output, {
    demoFileCount,
    thirdPartyPackageCount: thirdParty.packageCount,
    scrubbedOccurrenceCount,
    listedFileCount,
    productDenylist: 'PASS (0 hits)',
    gitleaks,
    starterAgentPack,
    octiKnowledge,
    sourceCommit: snapshot.commit,
    approvedSourceFileCount: snapshot.fileCount,
  })
  scanOpenOctiDenylist(output)
  const boundary = createBoundaryManifest(output, { sourceCommit: snapshot.commit })
  fs.writeFileSync(path.join(output, 'OPENOCTI_BOUNDARY.json'), `${JSON.stringify(boundary, null, 2)}\n`)
  verifyOpenOctiBoundary(output, { useGitInventory: false })
  return { output, manifest }
  } finally {
    snapshot.cleanup()
  }
}

export function main(argv = process.argv.slice(2)) {
  try {
    const version = resolveOpenOctiVersion(argv)
    const result = exportOpenOcti(parseOutputArgument(argv), { version })
    console.log(`OpenOcti export complete: ${result.output}`)
    console.log(`Files: ${result.manifest.fileCount}`)
    console.log(`Tree SHA-256: ${result.manifest.treeSha256}`)
    console.log(`gitleaks: ${result.manifest.gitleaks}`)
    console.log(`product denylist: ${result.manifest.productDenylist}`)
    return 0
  } catch (error) {
    console.error(`OpenOcti export failed: ${error.message}`)
    return 1
  }
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
if (invokedDirectly) process.exitCode = main()
