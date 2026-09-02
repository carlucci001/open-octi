import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { generateThirdPartyNotices } from './generate-third-party-notices.mjs'
import { isOpenOctiExcluded, OPENOCTI_EXCLUDES } from './openocti-excludes.mjs'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
export const SOURCE_ROOT = path.resolve(SCRIPT_DIR, '..')
export const DEFAULT_OUTPUT = path.resolve(SOURCE_ROOT, '..', 'openocti-export')

const OVERLAYS = new Map([
  ['README.md', 'README.md'],
  ['LICENSE', 'LICENSE'],
  ['LICENSE-COMMERCIAL.md', 'LICENSE-COMMERCIAL.md'],
  ['CLA.md', 'CLA.md'],
  ['CONTRIBUTING.md', 'CONTRIBUTING.md'],
  ['SECURITY.md', 'SECURITY.md'],
  ['CODE_OF_CONDUCT.md', 'CODE_OF_CONDUCT.md'],
  ['docs/INSTALL.md', 'docs/INSTALL.md'],
  ['.github/workflows/ci.yml', '.github/workflows/ci.yml'],
])

const DIRECTORY_OVERLAYS = ['docs/brand', 'docs/guides', 'docs/screenshots']

const TEXT_EXTENSIONS = new Set([
  '', '.bat', '.cjs', '.conf', '.css', '.csv', '.dockerignore', '.env', '.example',
  '.html', '.js', '.json', '.jsx', '.md', '.mjs', '.ps1', '.sh', '.sql', '.svg',
  '.ts', '.tsx', '.txt', '.yaml', '.yml',
])

const SCRUB_REPLACEMENTS = [
  [/178\.156\.186\.151/g, '203.0.113.10'],
  [/crm\.farringtondevelopment\.com/gi, 'openocti.local'],
  [/openocti-alerts/gi, 'openocti-alerts'],
  [/openocti-host/gi, 'openocti-host'],
  [/openocti-host/gi, 'openocti-host'],
  [/\b192\.168\.\d{1,3}\.\d{1,3}\b/g, '127.0.0.1'],
  [/\b100\.66\.\d{1,3}\.\d{1,3}\b/g, '127.0.0.1'],
  [/acct_REDACTED/g, 'acct_REDACTED'],
]

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
]

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

function assertSafeOutput(output) {
  const parsed = path.parse(output)
  if (output === parsed.root || output === SOURCE_ROOT || SOURCE_ROOT.startsWith(`${output}${path.sep}`)) {
    throw new Error(`Refusing unsafe export target: ${output}`)
  }
  if (path.basename(output).toLowerCase() !== 'openocti-export') {
    throw new Error('Export target directory must be named openocti-export.')
  }
}

function shouldCopy(source) {
  const relative = path.relative(SOURCE_ROOT, source).replaceAll('\\', '/')
  return relative === '' || !isOpenOctiExcluded(relative)
}

function copyPublicTree(output) {
  fs.cpSync(SOURCE_ROOT, output, {
    recursive: true,
    dereference: false,
    filter: shouldCopy,
  })
}

function refreshStarterAgentPack() {
  const script = path.join(SCRIPT_DIR, 'export-agent-pack.mjs')
  if (!fs.existsSync(script)) return 'prebuilt'
  const result = spawnSync(process.execPath, [script], {
    cwd: SOURCE_ROOT,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  })
  if (result.status !== 0) throw new Error(`Starter agent pack refresh failed with exit code ${result.status ?? 'unknown'}.`)
  return 'refreshed'
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

function validateDataDemo() {
  const root = path.join(SOURCE_ROOT, 'data-demo')
  if (!fs.existsSync(root)) throw new Error('data-demo is missing; refusing to export real data.')
  const failures = []
  for (const file of listFiles(root)) {
    const content = fs.readFileSync(file, 'utf8')
    for (const [label, pattern] of DATA_DEMO_PATTERNS) {
      if (pattern.test(content)) failures.push(`${path.relative(root, file)}: ${label}`)
    }
  }
  if (failures.length) throw new Error(`data-demo safety scan failed (${failures.join(', ')})`)
  return listFiles(root).length
}

function installDemoData(output) {
  // `data/` lets `npm start` users run immediately; `data-demo/` is what the Docker image
  // copies in and the entrypoint seeds the /data volume from on first boot.
  for (const dir of ['data', 'data-demo']) {
    fs.cpSync(path.join(SOURCE_ROOT, 'data-demo'), path.join(output, dir), { recursive: true })
  }
}

function installOverlays(output) {
  for (const [source, target] of OVERLAYS) {
    const sourceFile = path.join(SOURCE_ROOT, 'openocti', source)
    if (!fs.existsSync(sourceFile)) throw new Error(`Missing OpenOcti overlay: ${source}`)
    const targetFile = path.join(output, target)
    fs.mkdirSync(path.dirname(targetFile), { recursive: true })
    fs.copyFileSync(sourceFile, targetFile)
  }
  for (const relative of DIRECTORY_OVERLAYS) {
    const sourceDir = path.join(SOURCE_ROOT, 'openocti', relative)
    if (!fs.existsSync(sourceDir)) throw new Error(`Missing OpenOcti overlay directory: ${relative}`)
    fs.cpSync(sourceDir, path.join(output, relative), { recursive: true })
  }
  fs.copyFileSync(path.join(SOURCE_ROOT, '.env.example'), path.join(output, '.env.example'))
}

function rewritePackage(output) {
  const packageFile = path.join(output, 'package.json')
  const pkg = JSON.parse(fs.readFileSync(packageFile, 'utf8'))
  pkg.name = 'openocti'
  pkg.private = false
  pkg.license = 'AGPL-3.0-only'
  const allowedScripts = new Set(['dev', 'build', 'start', 'test', 'test:watch', 'test:ui', 'inventory', 'verify:data-backend', 'export:openocti'])
  pkg.scripts = Object.fromEntries(Object.entries(pkg.scripts || {}).filter(([name]) => allowedScripts.has(name)))
  fs.writeFileSync(packageFile, `${JSON.stringify(pkg, null, 2)}\n`)

  const lockFile = path.join(output, 'package-lock.json')
  const lock = JSON.parse(fs.readFileSync(lockFile, 'utf8'))
  lock.name = 'openocti'
  if (lock.packages?.['']) {
    lock.packages[''].name = 'openocti'
    lock.packages[''].license = 'AGPL-3.0-only'
  }
  fs.writeFileSync(lockFile, `${JSON.stringify(lock, null, 2)}\n`)
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
      if (/@(example\.(?:com|org|net|invalid)|openocti\.com)$/i.test(email)) return email
      replacements += 1
      return 'redacted@example.invalid'
    })
    content = content.replace(/(?:\+?1[ .-]?)?\(?[2-9]\d{2}\)?[ .-]\d{3}[ .-]\d{4}\b/g, () => {
      replacements += 1
      return 'PHONE_REDACTED'
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
    for (const [label, pattern] of FORBIDDEN_EXPORT_PATTERNS) {
      if (pattern.test(content)) failures.push(`${path.relative(output, file)}: ${label}`)
    }
    const emails = content.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []
    if (emails.some((email) => !/@(example\.(?:com|org|net|invalid)|openocti\.com)$/i.test(email))) {
      failures.push(`${path.relative(output, file)}: personal email address`)
    }
  }
  if (failures.length) throw new Error(`Export privacy scan failed (${failures.join(', ')})`)
}

function runGitleaks(output) {
  const report = path.join(os.tmpdir(), `openocti-gitleaks-${process.pid}.json`)
  const command = process.platform === 'win32' ? 'gitleaks.exe' : 'gitleaks'
  const configPath = path.join(output, '.gitleaks.toml')
  const configArgs = fs.existsSync(configPath) ? ['--config', configPath] : []
  const result = spawnSync(command, ['dir', output, ...configArgs, '--no-banner', '--redact', '--exit-code', '1', '--report-format', 'json', '--report-path', report], {
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  })
  fs.rmSync(report, { force: true })
  if (result.error?.code === 'ENOENT') throw new Error('gitleaks is required but was not found on PATH.')
  if (result.status !== 0) throw new Error(`gitleaks failed with exit code ${result.status}; findings were redacted.`)
  return 'PASS (0 findings)'
}

function listFiles(root) {
  const files = []
  if (!fs.existsSync(root)) return files
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
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
    excludes: OPENOCTI_EXCLUDES,
    fileCount: files.length,
    byteCount: bytes,
    treeSha256: tree.digest('hex'),
    ...metadata,
  }
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  return manifest
}

export function exportOpenOcti(output = DEFAULT_OUTPUT) {
  output = path.resolve(output)
  assertSafeOutput(output)
  const starterAgentPack = refreshStarterAgentPack()
  const demoFileCount = validateDataDemo()
  const thirdParty = generateThirdPartyNotices(SOURCE_ROOT)

  resetOutput(output)
  copyPublicTree(output)
  installDemoData(output)
  installOverlays(output)
  rewritePackage(output)
  installOpenClawPlugin(output)
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
    gitleaks,
    starterAgentPack,
  })
  return { output, manifest }
}

export function main(argv = process.argv.slice(2)) {
  try {
    const result = exportOpenOcti(parseOutputArgument(argv))
    console.log(`OpenOcti export complete: ${result.output}`)
    console.log(`Files: ${result.manifest.fileCount}`)
    console.log(`Tree SHA-256: ${result.manifest.treeSha256}`)
    console.log(`gitleaks: ${result.manifest.gitleaks}`)
    return 0
  } catch (error) {
    console.error(`OpenOcti export failed: ${error.message}`)
    return 1
  }
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
if (invokedDirectly) process.exitCode = main()
