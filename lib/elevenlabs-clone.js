// Clone an ElevenLabs ConvAI agent — used when cloning a CRM agent so the clone
// has its own voice presence (independent prompt edits, separate usage tracking,
// independent override allowlist).
//
// Flow:
//   1. GET source agent's full config
//   2. POST a new agent with the same conversation_config + platform_settings,
//      adjusting the name so it's identifiable in the ElevenLabs dashboard
//   3. Return the new agentId
//
// Tools and voice id are preserved as-is. The override allowlist is preserved.
// First_message is preserved (caller can re-brand later via /api/elevenlabs/agent-sync).

import { readData, writeData } from './dataStore.js'

function getElevenKey() {
  const creds = readData('credentials.json') || { credentials: [] }
  const entry = (creds.credentials || []).find(c => /eleven/i.test(c.name || ''))
  if (!entry) return null
  const f = (entry.fields || []).find(x => /key|token/i.test(x.label || ''))
  return f?.value?.trim() || null
}

async function elFetch(method, path, body) {
  const apiKey = getElevenKey()
  if (!apiKey) throw new Error('ElevenLabs API key not in vault')
  const r = await fetch(`https://api.elevenlabs.io${path}`, {
    method,
    headers: {
      'xi-api-key': apiKey,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const text = await r.text()
  let data
  try { data = JSON.parse(text) } catch { data = { raw: text } }
  if (!r.ok) {
    const msg = data?.detail?.message || data?.detail || data?.error || text.slice(0, 200)
    throw new Error(`ElevenLabs ${method} ${path} → ${r.status}: ${msg}`)
  }
  return data
}

function conversationConfigForCreate(sourceConfig) {
  const cc = JSON.parse(JSON.stringify(sourceConfig || {}))
  const prompt = cc.agent?.prompt

  if (
    prompt &&
    Array.isArray(prompt.tool_ids) &&
    prompt.tool_ids.length > 0 &&
    Array.isArray(prompt.tools) &&
    prompt.tools.length > 0
  ) {
    // ElevenLabs create accepts either registered tool IDs or inline tools, not both.
    delete prompt.tools
  }

  return cc
}

/**
 * Clone an ElevenLabs ConvAI agent.
 * @param {string} sourceElevenAgentId - id of the source agent (e.g. agent_9401kqcyv...)
 * @param {string} newName - human-readable name for the new agent (shows in ElevenLabs dashboard)
 * @returns {Promise<{ elevenAgentId: string, voiceId: string|null }>}
 */
export async function cloneElevenLabsAgent(sourceElevenAgentId, newName) {
  if (!sourceElevenAgentId) throw new Error('sourceElevenAgentId required')

  // 1. Get the source's full config
  const source = await elFetch('GET', `/v1/convai/agents/${sourceElevenAgentId}`)
  const cc = source.conversation_config || {}
  const ps = source.platform_settings || {}
  const createConfig = conversationConfigForCreate(cc)

  // 2. POST new agent with the same config + a clearly-derived name
  // ElevenLabs's create endpoint takes { name, conversation_config, platform_settings }
  const created = await elFetch('POST', `/v1/convai/agents/create`, {
    name: newName || `${source.name || 'Agent'} (clone)`,
    conversation_config: createConfig,
    platform_settings: ps,
  })

  const newId = created.agent_id || created.id
  if (!newId) throw new Error('ElevenLabs did not return an agent_id on create')

  return {
    elevenAgentId: newId,
    voiceId: cc.tts?.voice_id || null,
  }
}

/**
 * Add (or overwrite) a roster binding for a CRM agent id.
 * @param {string} crmAgentId - the local CRM slug (e.g. 'social-media-atlas')
 * @param {object} binding - { agentId, voiceId, voiceName?, name?, firstName? }
 */
export function writeRosterBinding(crmAgentId, binding) {
  if (!crmAgentId) throw new Error('crmAgentId required')
  if (!binding?.agentId) throw new Error('binding.agentId required')
  const roster = readData('voice-agent-roster.json') || {}
  roster[crmAgentId] = {
    ...roster[crmAgentId],
    ...binding,
  }
  writeData('voice-agent-roster.json', roster)
  return roster[crmAgentId]
}

/**
 * Read a roster binding for a CRM agent id.
 */
export function readRosterBinding(crmAgentId) {
  const roster = readData('voice-agent-roster.json') || {}
  return roster[crmAgentId] || null
}
