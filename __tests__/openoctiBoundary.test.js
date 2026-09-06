import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'
import { BOUNDARY_MANIFEST, createBoundaryManifest, diagnoseBoundaryInputs, verifyOpenOctiBoundary } from '../scripts/verify-openocti-boundary.mjs'

const sourceCommit = '1'.repeat(40)
const roots = []
const sourceRoot = process.cwd()
const policy = JSON.parse(fs.readFileSync(path.join(sourceRoot, 'scripts/openocti-boundary-policy.json'), 'utf8'))
const sentinel = ['synthetic', 'private', 'value', 'do-not-echo'].join('-')

function write(root, relative, content) {
  const target = path.join(root, relative)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, content)
}
function fixture({ seed = false, dataResource = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openocti-boundary-test-'))
  roots.push(root)
  write(root, 'README.md', 'Synthetic public fixture\n')
  if (seed) write(root, 'data-demo/agents.json', fs.readFileSync(path.join(sourceRoot, 'data-demo/agents.json')))
  if (dataResource) write(root, 'data/README.md', fs.readFileSync(path.join(sourceRoot, 'data-demo/README.md')))
  seal(root)
  return root
}
function seal(root) {
  write(root, BOUNDARY_MANIFEST, `${JSON.stringify(createBoundaryManifest(root, { sourceCommit }), null, 2)}\n`)
}
function rejects(root, rule) {
  let caught
  try { verifyOpenOctiBoundary(root, { useGitInventory: false }) } catch (error) { caught = error }
  expect(caught, 'Synthetic private artifact must stop verification').toBeTruthy()
  expect(caught.rule).toBe(rule)
  expect(caught.message).not.toContain(sentinel)
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    if (!path.resolve(root).startsWith(`${path.resolve(os.tmpdir())}${path.sep}`)) throw new Error('Unsafe fixture cleanup')
    fs.rmSync(root, { recursive: true, force: true })
  }
})

describe('OpenOcti deterministic public boundary', () => {
  it('verifies canonical LF text without rewriting the recorded manifest', () => {
    const root = fixture()
    const before = fs.readFileSync(path.join(root, BOUNDARY_MANIFEST), 'utf8')
    write(root, 'README.md', 'Synthetic public fixture\r\n')
    expect(verifyOpenOctiBoundary(root, { useGitInventory: false })).toMatchObject({
      ok: true, mode: 'export', sourceCommit, safetyChecks: { exactInventoryAndHashes: 'PASS' },
    })
    expect(fs.readFileSync(path.join(root, BOUNDARY_MANIFEST), 'utf8')).toBe(before)
  })

  it('rejects an unexpected business record even without a recognizable secret', () => {
    const root = fixture()
    write(root, 'customer-notes.json', JSON.stringify({ note: sentinel }))
    rejects(root, 'UNEXPECTED_FILE')
  })

  it('rejects a private credential field without echoing its value', () => {
    const root = fixture()
    write(root, 'connection.json', JSON.stringify({ apiKey: sentinel }))
    rejects(root, 'SECRET_FIELD')
  })

  it('accepts token-named npm version dependencies without exempting credential payloads', () => {
    const root = fixture()
    const lock = { packages: { 'node_modules/example': { dependencies: { gtoken: '^7.1.0', jsonwebtoken: '^9.0.0', '@types/jsonwebtoken': '^9.0.1' } } } }
    write(root, 'package-lock.json', JSON.stringify(lock))
    seal(root)
    expect(verifyOpenOctiBoundary(root, { useGitInventory: false }).ok).toBe(true)
    lock.packages['node_modules/example'].dependencies.gtoken = sentinel
    write(root, 'package-lock.json', JSON.stringify(lock))
    rejects(root, 'SECRET_FIELD')
    expect(diagnoseBoundaryInputs(root)).toEqual([{ rule: 'SECRET_FIELD', path: 'package-lock.json' }])
  })

  it('rejects nested environment files and private monitoring configuration', () => {
    const root = fixture()
    write(root, 'lib/nested/.env.local', `KEY=${sentinel}`)
    rejects(root, 'ENVIRONMENT_FILE')
    fs.unlinkSync(path.join(root, 'lib/nested/.env.local'))
    write(root, 'config/monitoring/customer.json', JSON.stringify({ note: sentinel }))
    rejects(root, 'PRIVATE_CONFIG')
  })

  it('rejects database artifacts by extension and signature under a misleading extension', () => {
    const root = fixture()
    write(root, 'records.sqlite-wal', sentinel)
    rejects(root, 'RUNTIME_ARTIFACT')
    fs.unlinkSync(path.join(root, 'records.sqlite-wal'))
    write(root, 'public/cache.png', Buffer.concat([Buffer.from(['SQLite', 'format', '3'].join(' ') + '\0'), Buffer.from(sentinel)]))
    rejects(root, 'DATABASE_SIGNATURE')
  })

  it('pins approved fixture content, including free-form business text', () => {
    const root = fixture({ seed: true })
    const agents = JSON.parse(fs.readFileSync(path.join(root, 'data-demo/agents.json'), 'utf8'))
    agents.agents.main.instructions = sentinel
    write(root, 'data-demo/agents.json', JSON.stringify(agents))
    rejects(root, 'APPROVED_CONTENT_CHANGED')
    expect(() => createBoundaryManifest(root, { sourceCommit })).toThrow(/APPROVED_CONTENT_CHANGED/)
  })

  it('rejects unknown seed filenames and non-approved opaque assets', () => {
    const root = fixture()
    write(root, 'data-demo/customer-records.json', JSON.stringify({ note: sentinel }))
    rejects(root, 'UNAPPROVED_SEED')
    fs.unlinkSync(path.join(root, 'data-demo/customer-records.json'))
    write(root, 'public/private-image.png', Buffer.from([0, 1, 2, 3]))
    rejects(root, 'UNAPPROVED_FILE_TYPE')
  })

  it('hash-pins approved opaque assets rather than trusting their filenames', () => {
    const root = fixture()
    const asset = Object.keys(policy.opaqueAssets).find(name => name.endsWith('.ico'))
    write(root, asset, fs.readFileSync(path.join(sourceRoot, asset)))
    seal(root)
    write(root, asset, Buffer.from(sentinel))
    rejects(root, 'OPAQUE_ASSET_CHANGED')
  })

  it('rejects outward symlinks without reading the external target', () => {
    const root = fixture()
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'openocti-boundary-test-'))
    roots.push(outside)
    write(outside, 'private.txt', sentinel)
    // Directory junctions work without developer mode on Windows. Linux CI
    // exercises the same lstat guard with an actual symbolic link.
    fs.symlinkSync(outside, path.join(root, 'outside'), process.platform === 'win32' ? 'junction' : 'dir')
    rejects(root, 'SYMLINK')
  })

  it('rejects missing/changed inventory files and unsafe manifest paths', () => {
    const root = fixture()
    write(root, 'README.md', sentinel)
    rejects(root, 'CONTENT_CHANGED')
    fs.unlinkSync(path.join(root, 'README.md'))
    rejects(root, 'MISSING_FILE')
    const manifest = JSON.parse(fs.readFileSync(path.join(root, BOUNDARY_MANIFEST), 'utf8'))
    manifest.files[0].path = '../outside.txt'
    write(root, BOUNDARY_MANIFEST, JSON.stringify(manifest))
    rejects(root, 'UNSAFE_PATH')
  })

  it('rejects private runtime endpoints without printing their contents', () => {
    const root = fixture()
    write(root, 'endpoint.txt', `http://${[178, 156, 186, 151].join('.')}/${sentinel}`)
    rejects(root, 'PRIVATE_ENDPOINT')
  })

  it('rejects hidden manifest payloads and duplicate inventory paths', () => {
    const root = fixture()
    const manifest = JSON.parse(fs.readFileSync(path.join(root, BOUNDARY_MANIFEST), 'utf8'))
    write(root, BOUNDARY_MANIFEST, JSON.stringify({ ...manifest, extra: sentinel }))
    rejects(root, 'INVALID_MANIFEST')
    manifest.files.push({ ...manifest.files[0], path: manifest.files[0].path.toLowerCase() })
    write(root, BOUNDARY_MANIFEST, JSON.stringify(manifest))
    rejects(root, 'INVALID_MANIFEST')
  })

  it('permits only exact public seed mirrors in strict exports and omits them from the manifest', () => {
    const root = fixture({ seed: true })
    write(root, 'data/agents.json', fs.readFileSync(path.join(root, 'data-demo/agents.json')))
    expect(createBoundaryManifest(root, { sourceCommit }).files.some(file => file.path === 'data/agents.json')).toBe(false)
    expect(verifyOpenOctiBoundary(root, { useGitInventory: false }).ok).toBe(true)
    write(root, 'data/agents.json', JSON.stringify({ note: sentinel }))
    rejects(root, 'APPROVED_CONTENT_CHANGED')
  })

  it('permits declared installed runtime files without reading them, while export mode rejects them', () => {
    const root = fixture({ dataResource: true })
    write(root, '.env.local', sentinel)
    write(root, 'data/customer.sqlite', sentinel)
    write(root, 'node_modules/package/private.txt', sentinel)
    expect(verifyOpenOctiBoundary(root)).toMatchObject({ ok: true, mode: 'installed' })
    rejects(root, 'GENERATED_ARTIFACT')
  })

  it('verifies the Docker context without optional data resources and still checks changed tracked resources', () => {
    const root = fixture({ dataResource: true })
    expect(createBoundaryManifest(root, { sourceCommit }).files.some(file => file.path.startsWith('data/'))).toBe(false)
    expect(verifyOpenOctiBoundary(root, { useGitInventory: false }).ok).toBe(true)
    fs.unlinkSync(path.join(root, 'data/README.md'))
    fs.rmdirSync(path.join(root, 'data'))
    expect(verifyOpenOctiBoundary(root, { useGitInventory: false }).ok).toBe(true)
    expect(verifyOpenOctiBoundary(root)).toMatchObject({ ok: true, mode: 'installed' })

    const resources = ['data/README.md', 'data/document-templates/consulting-agreement.md']
    for (const relative of resources) {
      write(root, relative, fs.readFileSync(path.join(sourceRoot, relative.replace(/^data\//, 'data-demo/'))))
    }
    const git = args => {
      const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' })
      expect(result.status, result.stderr).toBe(0)
    }
    git(['init', '--quiet'])
    git(['add', 'README.md', BOUNDARY_MANIFEST, ...resources])
    expect(verifyOpenOctiBoundary(root)).toMatchObject({ ok: true, mode: 'git' })
    for (const relative of resources) {
      const original = fs.readFileSync(path.join(root, relative))
      write(root, relative, sentinel)
      expect(() => verifyOpenOctiBoundary(root)).toThrow(/APPROVED_CONTENT_CHANGED/)
      write(root, relative, original)
    }
  })

  it('rejects tracked runtime files before generated-directory ignores', () => {
    const root = fixture()
    // This repository exists only inside the disposable synthetic fixture.
    const git = args => {
      const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' })
      expect(result.status, result.stderr).toBe(0)
    }
    git(['init', '--quiet'])
    git(['add', 'README.md', BOUNDARY_MANIFEST])
    expect(verifyOpenOctiBoundary(root)).toMatchObject({ ok: true, mode: 'git' })
    write(root, '.env.local', sentinel)
    git(['add', '--force', '.env.local'])
    expect(() => verifyOpenOctiBoundary(root)).toThrow(/ENVIRONMENT_FILE/)
    git(['rm', '--cached', '--quiet', '.env.local'])
    write(root, 'node_modules/private.txt', sentinel)
    git(['add', '--force', 'node_modules/private.txt'])
    expect(() => verifyOpenOctiBoundary(root)).toThrow(/GENERATED_ARTIFACT/)
  })
})
