import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { configureSeed, selectProviderModel } from '../deploy/openclaw/configure-seed.mjs'
import { agentIdentityFiles, publicFeatureManifest } from '../scripts/generate-octi-knowledge.mjs'
import { applyOpenOctiProfile, normalizeOpenOctiProfile } from '../lib/openocti-profile'
import { resolveEmailSignatureBrand, signatureHtml } from '../lib/emailSignature'

const temporaryDirs = []
const root = process.cwd()

afterEach(() => {
  for (const dir of temporaryDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true })
})

describe('OpenOcti OpenClaw starter runtime', () => {
  it('removes closed capabilities from Octi generated knowledge', () => {
    const manifest = publicFeatureManifest(`
      definition('anthropic', 'Anthropic', [['ANTHROPIC_API_KEY']]),
      definition('SearchTools3', 'SearchTools3', [['SearchTools3_API_KEY']]),
      definition('newsroom', 'Newsroom AIOS', [['NEWSROOM_API_KEY']]),
    `)

    expect(manifest).toContain("definition('anthropic'")
    expect(manifest).not.toMatch(/SearchTools|newsroom/i)
  })

  it('ships deterministic first-run sources for Octi import and roster answers', () => {
    const guide = fs.readFileSync(path.join(root, 'docs/guides/import-center.md'), 'utf8')
    const rules = fs.readFileSync(path.join(root, 'deploy/openclaw/seed/workspace/octi/AGENTS.md'), 'utf8')

    expect(guide).toContain('/settings/import')
    expect(guide).toContain('Undo import')
    expect(rules).toContain('knowledge/AGENT-ROSTER.md')
    expect(rules).toContain('docs/guides/import-center.md')
  })

  it('includes Octi alongside the five specialist identities in generated roster knowledge', () => {
    const workspace = path.join(root, 'deploy/openclaw/seed/workspace')
    const identities = agentIdentityFiles(workspace).map(file => path.basename(path.dirname(file)))

    expect(identities).toContain('octi')
    expect(identities).toEqual(expect.arrayContaining(['main', 'coding', 'social-media', 'legal', 'matilda']))
  })

  it.each([
    [{ ANTHROPIC_API_KEY: 'test' }, 'anthropic', 'anthropic/'],
    [{ OPENAI_API_KEY: 'test' }, 'openai', 'openai/'],
    [{ GEMINI_API_KEY: 'test' }, 'google', 'google/'],
    [{ OPENROUTER_API_KEY: 'test' }, 'openrouter', 'openrouter/'],
  ])('selects a model from the single configured provider key', (env, provider, prefix) => {
    expect(selectProviderModel(env)).toMatchObject({ provider })
    expect(selectProviderModel(env).model.startsWith(prefix)).toBe(true)
  })

  it('configures all seven agents and fills the first-run business profile', () => {
    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openocti-runtime-'))
    temporaryDirs.push(stateDir)
    fs.cpSync(path.join(root, 'deploy/openclaw/seed'), stateDir, { recursive: true })

    configureSeed(stateDir, {
      OPENAI_API_KEY: 'test-only',
      OPENOCTI_BUSINESS_NAME: 'Example Workshop',
      OPENOCTI_OWNER_NAME: 'Example Owner',
    })

    const config = JSON.parse(fs.readFileSync(path.join(stateDir, 'openclaw.json'), 'utf8'))
    expect(config.agents.list.map(agent => agent.id)).toEqual(['main', 'octi', 'coding', 'social-media', 'legal', 'matilda', 'press-release-agent'])
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
      else if (!file.includes(`${path.sep}knowledge${path.sep}`)) files.push(file)
    })
    walk(seedRoot)
    const content = files.map(file => fs.readFileSync(file, 'utf8')).join('\n')
    const forbidden = [
      /farrington/i, /\bcarl\b/i, /wnct/i, /newsroom/i, /VideoHub/i, /hetzner/i, /gitea/i,
      /https?:\/\//i, /\b(?:\d{1,3}\.){3}\d{1,3}\b/, /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/,
      /\+?1\D*\d{3}\D*\d{3}\D*\d{4}/, /<<REMOVED>>/i, /\b(?:sk|pk|rk)-[A-Za-z0-9_-]{12,}\b/,
    ]
    for (const pattern of forbidden) expect(content).not.toMatch(pattern)

    const config = JSON.parse(fs.readFileSync(path.join(seedRoot, 'openclaw.json'), 'utf8'))
    const plugin = fs.readFileSync(path.join(root, 'deploy/openclaw/openocti-plugin/index.ts'), 'utf8')
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'deploy/openclaw/openocti-plugin/openclaw.plugin.json'), 'utf8'))
    const registered = new Set([...plugin.matchAll(/^\s{2}(fcc_[a-z0-9_]+):/gm)].map(match => match[1]))
    const contracted = new Set(manifest.contracts?.tools || [])
    const referenced = config.agents.list.flatMap(agent => agent.tools?.alsoAllow || [])
    expect([...new Set(referenced)].filter(tool => !registered.has(tool))).toEqual([])
    expect([...registered].filter(tool => !contracted.has(tool))).toEqual([])
  })

  it('ships Octi as a documented, actionable onboarding guide', () => {
    const seedRoot = path.join(root, 'deploy/openclaw/seed')
    const config = JSON.parse(fs.readFileSync(path.join(seedRoot, 'openclaw.json'), 'utf8'))
    const octi = config.agents.list.find(agent => agent.id === 'octi')
    expect(octi.name).toBe('Octi')
    expect(octi.tools.alsoAllow).toEqual(expect.arrayContaining(['fcc_capability_status', 'fcc_list_agents', 'fcc_open_page', 'fcc_import_start', 'fcc_import_commit']))
    expect(fs.readFileSync(path.join(seedRoot, 'workspace/octi/SOUL.md'), 'utf8')).toContain('Never guess')
    const generator = fs.readFileSync(path.join(root, 'scripts/generate-octi-knowledge.mjs'), 'utf8')
    expect(generator).toContain("'docs/INSTALL.md'")
    expect(generator).toContain("'docs/RELEASING.md'")
    expect(generator).toContain("'FEATURE-MANIFEST.md'")
    expect(generator).toContain("'DATA-MODEL.md'")
  })

  it('copies the seed only when no OpenClaw config exists', () => {
    const entrypoint = fs.readFileSync(path.join(root, 'deploy/openclaw/entrypoint.sh'), 'utf8')
    expect(entrypoint).toContain('if [ ! -f "$config_file" ]')
    expect(entrypoint).toContain('cp /opt/openocti-seed/openclaw.json "$config_file"')
  })

  it('runs OpenClaw as the shared data volume owner', () => {
    const dockerfile = fs.readFileSync(path.join(root, 'deploy/openclaw/Dockerfile'), 'utf8').replace(/\r\n/g, '\n')
    expect(dockerfile).toContain('RUN mkdir -p /data && chown node:node /data')
    expect(dockerfile).toMatch(/\r?\nUSER node\r?\n/)
  })

  it('fills an existing starter workspace from first-run setup without changing its config', () => {
    const examplePhone = ['202', '555', '0147'].join('-')
    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openocti-profile-'))
    temporaryDirs.push(stateDir)
    fs.mkdirSync(path.join(stateDir, 'workspace/main'), { recursive: true })
    const configPath = path.join(stateDir, 'openclaw.json')
    fs.writeFileSync(configPath, '{"existing":true}\n')
    fs.writeFileSync(path.join(stateDir, 'workspace/main/IDENTITY.md'), '{{business_name}} belongs to {{owner_name}}.\n')
    expect(normalizeOpenOctiProfile({
      businessName: '  Example Shop  ',
      ownerName: ' Example Owner ',
      phone: ` ${examplePhone} `,
      website: ' example.test ',
    })).toEqual({
      businessName: 'Example Shop',
      ownerName: 'Example Owner',
      phone: examplePhone,
      website: 'example.test',
      firstLoginCompletedAt: '',
      firstRunDismissed: false,
      firstRunVisitedAgentsAt: '',
      firstRunImportOpenedAt: '',
    })
    expect(applyOpenOctiProfile(stateDir, { businessName: 'Example Shop', ownerName: 'Example Owner' })).toBe(1)
    expect(fs.readFileSync(path.join(stateDir, 'workspace/main/IDENTITY.md'), 'utf8')).toBe('Example Shop belongs to Example Owner.\n')
    expect(fs.readFileSync(configPath, 'utf8')).toBe('{"existing":true}\n')
  })

  it('uses optional workspace contact values for OpenOcti email signatures', () => {
    const examplePhone = ['202', '555', '0147'].join('-')
    const env = { FCC_EDITION: 'openocti' }
    const workspaceProfile = {
      businessName: 'Example Shop',
      ownerName: 'Example Owner',
      phone: examplePhone,
      website: 'example.test',
    }
    const brand = resolveEmailSignatureBrand('farrington', { env, workspaceProfile })

    expect(brand).toMatchObject({
      name: 'Example Shop',
      person: 'Example Owner',
      phoneDisplay: examplePhone,
      phoneHref: `tel:${examplePhone.replaceAll('-', '')}`,
      website: 'example.test',
      websiteUrl: 'https://example.test',
      email: '',
      location: '',
    })
    expect(signatureHtml('farrington', { env, workspaceProfile })).toContain('Example Owner')
  })

  it('omits missing OpenOcti signature fields instead of rendering placeholders', () => {
    const html = signatureHtml('farrington', {
      env: { FCC_EDITION: 'openocti' },
      workspaceProfile: { businessName: 'Example Shop', ownerName: 'Example Owner' },
    })

    expect(html).not.toContain('PHONE_REDACTED')
    expect(html).not.toContain('City, ST')
    expect(html).not.toContain('mailto:')
    expect(html).not.toContain('tel:')
  })
})
