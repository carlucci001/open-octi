import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const temporaryDirs = []

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
  for (const dir of temporaryDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

describe('OpenOcti demo seed', () => {
  it('contains synthetic records for every core CRM lane', () => {
    const seedDir = path.join(process.cwd(), 'data-demo')
    const expected = {
      'leads.json': 'leads',
      'pipelines.json': 'pipelines',
      'accounts.json': 'accounts',
      'contacts.json': 'contacts',
      'projects.json': 'projects',
      'tasks.json': 'tasks',
      'documents.json': 'documents',
    }

    for (const [file, key] of Object.entries(expected)) {
      const data = JSON.parse(fs.readFileSync(path.join(seedDir, file), 'utf8'))
      expect(data[key], `${file} should contain starter records`).toBeInstanceOf(Array)
      expect(data[key].length, `${file} should not be empty`).toBeGreaterThan(0)
    }
  })

  it('falls back to the seed when the writable OpenOcti data directory is empty', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openocti-seed-'))
    temporaryDirs.push(dataDir)
    vi.stubEnv('FCC_EDITION', 'openocti')
    vi.stubEnv('CRM_DATA_DIR', dataDir)
    vi.stubEnv('DATA_BACKEND', 'json')
    vi.resetModules()

    const { readData } = await import('../lib/dataStore')
    expect(readData('leads.json')?.leads?.[0]?.id).toBe('ld_demo_inquiry')
    expect(readData('agents.json')?.agents?.['octi-guide']?.name).toBe('Octi Guide')
  })

  it('contains no obvious credentials, email addresses, or phone numbers', () => {
    const seedDir = path.join(process.cwd(), 'data-demo')
    const content = fs.readdirSync(seedDir)
      .filter(file => file.endsWith('.json'))
      .map(file => fs.readFileSync(path.join(seedDir, file), 'utf8'))
      .join('\n')

    expect(content).not.toMatch(/\bsk-[A-Za-z0-9_-]+/)
    expect(content).not.toMatch(/\bAC[0-9a-f]{32}\b/i)
    expect(content).not.toMatch(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/)
    expect(content).not.toMatch(/\+1\D*\d{3}\D*\d{3}\D*\d{4}/)
  })

  it('seeds a generic first administrator instead of a private identity', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openocti-admin-'))
    temporaryDirs.push(dataDir)
    vi.stubEnv('FCC_EDITION', 'openocti')
    vi.stubEnv('CRM_DATA_DIR', dataDir)
    vi.stubEnv('DATA_BACKEND', 'json')
    vi.stubEnv('INITIAL_ADMIN_PASSWORD', 'OpenOctiTestOnly123!')
    vi.stubEnv('CRM_SESSION_SECRET', 'openocti-test-only-session-secret')
    vi.resetModules()

    const { seedInitialAdminIfEmpty } = await import('../lib/auth')
    const user = await seedInitialAdminIfEmpty()
    expect(user).toMatchObject({ username: 'admin', displayName: 'OpenOcti Admin', email: '' })
  })

  it('marks seeded agents direct-provider ready when OpenClaw is unreachable', async () => {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openocti-agents-'))
    temporaryDirs.push(dataDir)
    vi.stubEnv('FCC_EDITION', 'openocti')
    vi.stubEnv('CRM_DATA_DIR', dataDir)
    vi.stubEnv('DATA_BACKEND', 'json')
    vi.stubEnv('OPENCLAW_CONFIG_PATH', path.join(dataDir, 'missing-openclaw.json'))
    vi.stubEnv('OPENAI_API_KEY', 'test-model-key')
    vi.resetModules()

    const { listAgents } = await import('../lib/agents-store')
    const result = await listAgents()
    const seeded = result.agents.find(agent => agent.id === 'octi-guide')
    expect(result.degraded).toBe(true)
    expect(result.availableProviders).toContain('openai')
    expect(seeded).toMatchObject({
      enabled: true,
      offlineRuntime: true,
      runtimeStatus: 'runtime_not_reachable',
      directProviderReady: true,
    })
  })
})
