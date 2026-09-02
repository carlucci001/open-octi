import { parseCrmActionArgs, rankCrmCapabilities } from '../lib/crm-operator-tools'
import { OPENAI_REALTIME_TOOLS, toGeminiFunctionDeclarations } from '../lib/realtime-voice-tools'
import fs from 'fs'
import path from 'path'

describe('CRM operator tool discovery', () => {
  const tools = [
    { name: 'list_press_contacts', description: 'List press contacts with name, email, outlet, beat, notes, and source URL. Args: { topic?, limit? }.' },
    { name: 'list_contacts', description: 'List CRM contacts. Args: { q?, accountId? }.' },
    { name: 'create_document', description: 'Create a document draft.' },
  ]

  test('ranks the real press-contact tool first for a press outreach request', () => {
    const matches = rankCrmCapabilities(tools, { component: 'Press', task: 'Give me the top 10 press contacts with contact information' })
    expect(matches[0]?.name).toBe('list_press_contacts')
    expect(matches[0]?.description).toContain('email')
  })

  test('preserves the tool Args contract for conversational form completion', () => {
    const matches = rankCrmCapabilities(tools, { component: 'Contacts', task: 'list contacts for an account' })
    expect(matches.some(tool => tool.name === 'list_contacts' && tool.description.includes('accountId'))).toBe(true)
  })
})

describe('CRM operator action arguments', () => {
  test('accepts a JSON object string', () => {
    expect(parseCrmActionArgs('{\"topic\":\"technology\",\"limit\":10}')).toEqual({ topic: 'technology', limit: 10 })
  })

  test('accepts an object and rejects arrays or malformed JSON', () => {
    expect(parseCrmActionArgs({ limit: 10 })).toEqual({ limit: 10 })
    expect(() => parseCrmActionArgs('[]')).toThrow('JSON object')
    expect(() => parseCrmActionArgs('{bad')).toThrow('valid JSON object')
  })
})

describe('CRM operator runtime wiring', () => {
  test('advertises discovery and execution to OpenAI Realtime and Gemini Live', () => {
    const realtimeNames = OPENAI_REALTIME_TOOLS.map(tool => tool.name)
    const geminiNames = toGeminiFunctionDeclarations().map(tool => tool.name)
    expect(realtimeNames).toEqual(expect.arrayContaining(['crm_capabilities', 'crm_action']))
    expect(geminiNames).toEqual(expect.arrayContaining(['crm_capabilities', 'crm_action']))
  })

  test('wires both client handlers and preserves the legacy ElevenLabs rollback registration', () => {
    const voice = fs.readFileSync(path.join(process.cwd(), 'app/components/VoiceSession.js'), 'utf8')
    const registration = fs.readFileSync(path.join(process.cwd(), 'scripts/register-matilda-tools.js'), 'utf8')
    expect(voice).toContain('crm_capabilities: discoverCrmCapabilities')
    expect(voice).toContain('crm_action: runCrmAction')
    expect(registration).toContain("name: 'crm_capabilities'")
    expect(registration).toContain("name: 'crm_action'")
    expect(registration).toContain('preservedIds')
    expect(registration).toContain('tool_ids: [...preservedIds, ...newIds]')
  })
})
