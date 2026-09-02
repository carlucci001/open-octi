import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = file => fs.readFileSync(path.join(root, file), 'utf8')

describe('agent runtime separation', () => {
  it('keeps non-OpenClaw runtime agents out of the OpenClaw patch path', () => {
    const source = read('lib/agents-store.js')

    expect(source).toContain("const localOnlyRuntime = runtimeProvider !== 'openclaw-hetzner'")
    expect(source).toContain("payload.draft === true || runtimeProvider !== 'openclaw-hetzner'")
    expect(source).toContain('Do not push DeerFlow')
  })

  it('tags DeerFlow tools and filters the Agent Manager tool list by runtime', () => {
    const registryRoute = read('app/api/agents/available-tools/route.js')
    const manager = read('app/agents/AgentsManager.js')

    expect(registryRoute).toContain('function runtimeProvidersFor')
    expect(registryRoute).toContain("name === 'deep_research_dossier'")
    expect(registryRoute).toContain("runtimeProviders: ['deerflow-hetzner']")
    expect(manager).toContain('runtimeProvider: editing.runtimeProvider')
    expect(manager).toContain('Showing <strong>{runtimeLabel}</strong> runtime tools')
  })

  it('labels local runtime profile saves separately from OpenClaw sync', () => {
    const manager = read('app/agents/AgentsManager.js')

    expect(manager).toContain('Save ${runtimeLabelFor(editing.runtimeProvider)} Profile')
    expect(manager).toContain('locally without syncing to OpenClaw')
  })

  it('stores avatar metadata through the CRM data store', () => {
    const avatarGen = read('lib/avatar-gen.js')

    expect(avatarGen).toContain("import { readData, writeData } from './dataStore'")
    expect(avatarGen).toContain("readData('avatars.json')")
    expect(avatarGen).toContain("writeData('avatars.json', d)")
  })

  it('returns an explicit unsupported-runtime response instead of falling through to OpenClaw', () => {
    const chatRoute = read('app/api/agent/openclaw-chat/route.js')

    expect(chatRoute).toContain('function isUnsupportedRuntimeOperator')
    expect(chatRoute).toContain("source: 'unsupported-runtime'")
    expect(chatRoute).toContain('I did not route this to OpenClaw')
  })
})
