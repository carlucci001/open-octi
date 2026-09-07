// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { ensureStarterVault } from '@/deploy/starter-vault.mjs'
import { seedAgentKnowledge } from '@/deploy/openclaw/seed-knowledge.mjs'
import { KNOWLEDGE_AGENT_IDS, readOpenOctiAgentKnowledge } from '@/lib/openocti-knowledge'
import { replaceProfileTokens } from '@/deploy/openclaw/configure-seed.mjs'

const temporary = []
function directory() { const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openocti-knowledge-test-')); temporary.push(root); return root }
afterEach(() => temporary.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })))

it('creates a populated Markdown vault and preserves owner edits on the next boot', () => {
  const dataDir = directory()
  const vault = ensureStarterVault({ dataDir, vaultRoot: path.join(dataDir, 'vaults') })
  expect(fs.readFileSync(path.join(vault, 'Welcome.md'), 'utf8')).toContain('Command Vault')
  for (const id of KNOWLEDGE_AGENT_IDS) expect(fs.existsSync(path.join(vault, 'Agents', id + '.md'))).toBe(true)
  const custom = path.join(vault, 'Agents', 'coding.md')
  fs.writeFileSync(custom, '# My additions')
  ensureStarterVault({ dataDir, vaultRoot: path.join(dataDir, 'vaults') })
  expect(fs.readFileSync(custom, 'utf8')).toBe('# My additions')
})

it('loads each original knowledge base into its own OpenClaw bootstrap, including existing workspaces', () => {
  const stateDir = directory()
  const root = path.join(process.cwd(), 'knowledge', 'agents')
  for (const id of KNOWLEDGE_AGENT_IDS) {
    fs.mkdirSync(path.join(stateDir, 'workspace', id), { recursive: true })
    fs.writeFileSync(path.join(stateDir, 'workspace', id, 'AGENTS.md'), '# Existing owner instructions')
  }
  seedAgentKnowledge(stateDir, root)
  seedAgentKnowledge(stateDir, root)
  for (const id of KNOWLEDGE_AGENT_IDS) {
    const instructions = fs.readFileSync(path.join(stateDir, 'workspace', id, 'AGENTS.md'), 'utf8')
    expect(instructions).toContain('# Existing owner instructions')
    expect(instructions).toContain(readOpenOctiAgentKnowledge(id))
    expect(instructions.match(/<!-- OPENOCTI AUTHORED KNOWLEDGE -->/g)).toHaveLength(1)
    expect(instructions.length).toBeLessThan(20000)
  }
})

it('does not allow a requested agent id to read another file', () => {
  expect(readOpenOctiAgentKnowledge('../../.env')).toBe('')
})

it('does not leave organization tokens in a fresh agent identity', () => {
  expect(replaceProfileTokens('I help {{owner_name}} at {{business_name}}.', {})).toBe('I help the workspace owner at your organization.')
})
