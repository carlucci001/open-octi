import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { configureSeed, selectProviderModel } from '../deploy/openclaw/configure-seed.mjs'
import { applyOpenOctiProfile, normalizeOpenOctiProfile } from '../lib/openocti-profile'

const temporaryDirs = []
const root = process.cwd()

afterEach(() => {
  for (const dir of temporaryDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

describe('OpenOcti OpenClaw starter runtime', () => {
  it.each([
    [{ ANTHROPIC_API_KEY: 'test' }, 'anthropic', 'anthropic/'],
    [{ OPENAI_API_KEY: 'test' }, 'openai', 'openai/'],
    [{ GEMINI_API_KEY: 'test' }, 'google', 'google/'],
    [{ OPENROUTER_API_KEY: 'test' }, 'openrouter', 'openrouter/'],
  ])('selects a model from the single configured provider key', (env, provider, prefix) => {
    expect(selectProviderModel(env)).toMatchObject({ provider })
    expect(selectProviderModel(env).model.startsWith(prefix)).toBe(true)
  })

  it('configures all five agents and fills the first-run business profile', () => {
    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openocti-runtime-'))
    temporaryDirs.push(stateDir)
    fs.cpSync(path.join(root, 'deploy/openclaw/seed'), stateDir, { recursive: true })

    configureSeed(stateDir, {
      OPENAI_API_KEY: 'test-only',
      OPENOCTI_BUSINESS_NAME: 'Example Workshop',
      OPENOCTI_OWNER_NAME: 'Example Owner',
    })

    const config = JSON.parse(fs.readFileSync(path.join(stateDir, 'openclaw.json'), 'utf8'))
    expect(config.agents.list.map(agent => agent.id)).toEqual(['main', 'coding', 'social-media', 'legal', 'matilda'])
    expect(config.agents.list.every(agent => agent.model.primary === 'openai/gpt-4.1')).toBe(true)
    const workspaces = fs.readdirSync(path.join(stateDir, 'workspace'), { recursive: true })
      .filter(file => String(file).endsWith('.md'))
      .map(file => fs.readFileSync(path.join(stateDir, 'workspace', file), 'utf8'))
      .join('\n')
    expect(workspaces).toContain('Example Workshop')
    expect(workspaces).toContain('Example Owner')
    expect(workspaces).not.toMatch(/\{\{(?:business_name|owner_name)\}\}/)
  })

  it('contains no private markers and references only tools registered by the shipped plugin', () => {
    const seedRoot = path.join(root, 'deploy/openclaw/seed')
    const files = []
    const walk = directory => fs.readdirSync(directory, { withFileTypes: true }).forEach(entry => {
      const file = path.join(directory, entry.name)
      if (entry.isDirectory()) walk(file)
      else files.push(file)
    })
    walk(seedRoot)
    const content = files.map(file => fs.readFileSync(file, 'utf8')).join('\n')
    const forbidden = [
      /farrington/i, /\bcarl\b/i, /wnct/i, /newsroom/i, /myvtc/i, /hetzner/i, /gitea/i,
      /https?:\/\//i, /\b(?:\d{1,3}\.){3}\d{1,3}\b/, /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/,
      /\+?1\D*\d{3}\D*\d{3}\D*\d{4}/, /<<REMOVED>>/i, /\b(?:sk|pk|rk)-[A-Za-z0-9_-]{12,}\b/,
    ]
    for (const pattern of forbidden) expect(content).not.toMatch(pattern)

    const config = JSON.parse(fs.readFileSync(path.join(seedRoot, 'openclaw.json'), 'utf8'))
    const plugin = fs.readFileSync(path.join(root, 'deploy/openclaw/openocti-plugin/index.ts'), 'utf8')
    const registered = new Set([...plugin.matchAll(/^\s{2}(fcc_[a-z0-9_]+):/gm)].map(match => match[1]))
    const referenced = config.agents.list.flatMap(agent => agent.tools?.alsoAllow || [])
    expect([...new Set(referenced)].filter(tool => !registered.has(tool))).toEqual([])
  })

  it('copies the seed only when no OpenClaw config exists', () => {
    const entrypoint = fs.readFileSync(path.join(root, 'deploy/openclaw/entrypoint.sh'), 'utf8')
    expect(entrypoint).toContain('if [ ! -f "$config_file" ]')
    expect(entrypoint).toContain('cp /opt/openocti-seed/openclaw.json "$config_file"')
  })

  it('fills an existing starter workspace from first-run setup without changing its config', () => {
    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openocti-profile-'))
    temporaryDirs.push(stateDir)
    fs.mkdirSync(path.join(stateDir, 'workspace/main'), { recursive: true })
    const configPath = path.join(stateDir, 'openclaw.json')
    fs.writeFileSync(configPath, '{"existing":true}\n')
    fs.writeFileSync(path.join(stateDir, 'workspace/main/IDENTITY.md'), '{{business_name}} belongs to {{owner_name}}.\n')
    expect(normalizeOpenOctiProfile({ businessName: '  Example Shop  ', ownerName: ' Example Owner ' })).toEqual({ businessName: 'Example Shop', ownerName: 'Example Owner' })
    expect(applyOpenOctiProfile(stateDir, { businessName: 'Example Shop', ownerName: 'Example Owner' })).toBe(1)
    expect(fs.readFileSync(path.join(stateDir, 'workspace/main/IDENTITY.md'), 'utf8')).toBe('Example Shop belongs to Example Owner.\n')
    expect(fs.readFileSync(configPath, 'utf8')).toBe('{"existing":true}\n')
  })
})
