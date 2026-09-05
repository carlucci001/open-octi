/**
 * Agents store — bridges CRM-side metadata with live OpenClaw runtime config.
 *
 * Two storage layers:
 *   1. Local: data/agents.json (CRM metadata: category, role, description,
 *      friendly name, tags, status). Survives across OpenClaw upgrades.
 *   2. Remote: openclaw.json agents.list[] (runtime: model, tools,
 *      identity). Modified through openclaw-config.js.
 *
 * The merged "agent" object exposed to the UI combines both layers.
 * Writes are split: friendly fields → local, runtime fields → remote.
 */
import { dataStoreInfo, readData, writeData } from './dataStore'
import { CATEGORIES, BRAIN_PROFILES, brainKeyForModel, PRESETS, PRESET_BY_ID } from './agent-presets'
import { AGENT_CHANNEL_OPTIONS, buildAgentChannelStatus } from './agent-channels'
import { readOpenclawAgents, readOpenclawConfig, patchOpenclawAgents, pingOpenclaw, listAgentBackups } from './openclaw-config'
import { getAvatarMeta } from './avatar-gen'
import { MODEL_CATALOG, PROVIDERS, TIER_LABEL } from './model-catalog'
import { isOpenOcti } from './edition'
import { normalizeImageGenerationPreference } from './image-generation-preferences'

function detectKeysCombined(openclawCfg) {
  const out = new Set()
  const providers = openclawCfg?.models?.providers || {}
  for (const [id, p] of Object.entries(providers)) if (p?.apiKey) out.add(id)
  const ocEnv = openclawCfg?.env || {}
  for (const [pid, pmeta] of Object.entries(PROVIDERS)) {
    if (ocEnv[pmeta.envKey] || process.env[pmeta.envKey]) out.add(pid)
  }
  return out
}

const STORE_FILE = 'agents.json'
const STORE_VERSION = 1
const PRODUCTION_VOICE_LOCKED_IDS = new Set(['main', 'coding'])

// An agent is pinned to ElevenLabs if it actually has an ElevenLabs binding —
// the hardcoded phone pair, the default Matilda voice, or any agent present in
// the voice roster (Doreen/receptionist, Frank, legal, etc.). Unbound agents
// (e.g. Brian) are free to use any engine.
function isElevenBound(id) {
  if (!id) return false
  if (PRODUCTION_VOICE_LOCKED_IDS.has(id) || id === 'matilda') return true
  try {
    const roster = readData('voice-agent-roster.json') || {}
    if (roster[id]?.agentId) return true
  } catch {}
  return false
}

function normalizeVoiceForSave(id, voice, draft) {
  if (!voice) return voice
  if (isElevenBound(id)) {
    return { provider: 'elevenlabs', locked: true }
  }
  return voice
}

function loadLocal() {
  const data = readData(STORE_FILE)
  if (data && data.__version) return data
  return { __version: STORE_VERSION, agents: {}, presetsBootstrapped: false }
}

function saveLocal(data) {
  data.__version = STORE_VERSION
  data.lastUpdated = new Date().toISOString()
  writeData(STORE_FILE, data)
}

function classifyAgentFromRemote(remote) {
  const id = remote.id || ''
  if (id === 'main') return { category: 'operations', role: 'Primary command-center agent — handles email, calendar, CRM, voice' }
  if (id === 'coding') return { category: 'engineering', role: 'Software engineering helper' }
  if (id.includes('promoter') || id.includes('marketing')) return { category: 'marketing', role: 'Marketing & content' }
  if (PRESET_BY_ID[id]) {
    const p = PRESET_BY_ID[id]
    return { category: p.category, role: p.role }
  }
  return { category: 'custom', role: '' }
}

function mergeAgentView(remoteAgent, localMeta) {
  const id = remoteAgent.id
  const auto = classifyAgentFromRemote(remoteAgent)
  const meta = localMeta || {}

  const modelId = typeof remoteAgent.model === 'string'
    ? remoteAgent.model
    : remoteAgent.model?.primary || ''
  const fallbacks = (typeof remoteAgent.model === 'object' && Array.isArray(remoteAgent.model?.fallbacks))
    ? remoteAgent.model.fallbacks
    : []

  const tools = Array.isArray(remoteAgent.tools?.allow)
    ? remoteAgent.tools.allow
    : Array.isArray(remoteAgent.tools?.alsoAllow)
      ? remoteAgent.tools.alsoAllow
      : Array.isArray(meta.tools) ? meta.tools : []

  const identity = remoteAgent.identity || {}

  const preset = PRESET_BY_ID[id]
  const avatar = getAvatarMeta(id)

  return {
    id,
    name: meta.name || identity.name || preset?.name || id,
    title: meta.title || preset?.title || '',
    voiceProfile: meta.voiceProfile || preset?.voiceProfile || '',
    avatar: avatar || null,
    avatarPrompt: meta.avatarPrompt || preset?.avatarPrompt || '',
    emoji: meta.emoji || identity.emoji || preset?.emoji || '🤖',
    category: meta.category || auto.category,
    role: meta.role || auto.role,
    description: meta.description || preset?.description || '',
    tags: meta.tags || [],
    enabled: remoteAgent.enabled !== false && meta.disabled !== true,
    brain: {
      key: brainKeyForModel(modelId),
      modelId,
      fallbacks,
    },
    tools,
    channels: meta.channels || [],
    voice: meta.voice || (meta.voiceProvider ? { provider: meta.voiceProvider } : { provider: 'elevenlabs' }),
    labs: meta.labs || {},
    imageGeneration: normalizeImageGenerationPreference(meta.imageGeneration || preset?.imageGeneration || {}),
    runtimeProvider: meta.runtimeProvider || 'openclaw-hetzner',
    jobDescription: meta.jobDescription || remoteAgent.instructions || remoteAgent.system || '',
    schedule: meta.schedule || (PRESET_BY_ID[id]?.schedule) || { mode: 'on-demand' },
    isPreset: !!PRESET_BY_ID[id],
    presetSource: meta.presetSource || (PRESET_BY_ID[id] ? id : null),
    syncedAt: meta.syncedAt || null,
    tenantId: meta.tenantId || 'farrington-development',
    leaseId: meta.leaseId || null,
    schemaUnknownKeys: [], // populated by listAgents
    _raw: remoteAgent,
  }
}

export async function listAgents() {
  const local = loadLocal()
  let remote, fullCfg
  try {
    fullCfg = await readOpenclawConfig()
    remote = {
      defaults: fullCfg.agents?.defaults || {},
      list: Array.isArray(fullCfg.agents?.list) ? fullCfg.agents.list : [],
      schemaUnknownKeys: [],
    }
    const KNOWN = new Set(['id','name','workspace','agentDir','identity','model','tools','channels','instructions','system','systemPrompt','memory','compaction','heartbeat','schedule','enabled'])
    for (const a of remote.list) {
      const u = Object.keys(a || {}).filter(k => !KNOWN.has(k))
      if (u.length) remote.schemaUnknownKeys.push({ id: a?.id, keys: u })
    }
  } catch (e) {
    const availableProviders = detectKeysCombined(null)
    const directProviderReady = ['openai', 'anthropic', 'google', 'openrouter'].some(provider => availableProviders.has(provider))
    const fallbackAgents = []
    const seen = new Set()
    for (const [id, meta] of Object.entries(local.agents || {})) {
      const preset = PRESET_BY_ID[id] || {}
      const brainKey = meta.brain || preset.brain || brainKeyForModel(preset.modelPrimary) || 'standard'
      const brainProfile = BRAIN_PROFILES[brainKey] || BRAIN_PROFILES.standard
      seen.add(id)
      fallbackAgents.push({
        id,
        name: meta.name || preset.name || id,
        title: meta.title || preset.title || '',
        voiceProfile: meta.voiceProfile || preset.voiceProfile || '',
        avatar: getAvatarMeta(id) || null,
        avatarPrompt: meta.avatarPrompt || preset.avatarPrompt || '',
        emoji: meta.emoji || preset.emoji || '🤖',
        category: meta.category || preset.category || 'custom',
        role: meta.role || preset.role || '',
        description: meta.description || preset.description || '',
        tags: meta.tags || [],
        enabled: meta.disabled !== true && directProviderReady,
        brain: {
          key: brainKey,
          modelId: meta.modelPrimary || preset.modelPrimary || brainProfile.primary || '',
          fallbacks: meta.modelFallbacks || preset.modelFallbacks || brainProfile.fallbacks || [],
        },
        tools: meta.tools || preset.tools || [],
        channels: meta.channels || preset.channels || [],
        voice: meta.voice || preset.voice || (meta.voiceProvider ? { provider: meta.voiceProvider } : { provider: 'elevenlabs' }),
        labs: meta.labs || preset.labs || {},
        runtimeProvider: meta.runtimeProvider || preset.runtimeProvider || 'openclaw-hetzner',
        jobDescription: meta.jobDescription || preset.jobDescription || '',
        schedule: meta.schedule || preset.schedule || { mode: 'on-demand' },
        isPreset: !!PRESET_BY_ID[id],
        presetSource: meta.presetSource || (PRESET_BY_ID[id] ? id : null),
        syncedAt: meta.syncedAt || null,
        tenantId: meta.tenantId || 'farrington-development',
        leaseId: meta.leaseId || null,
        schemaUnknownKeys: [],
        offlineRuntime: true,
        runtimeStatus: 'runtime_not_reachable',
        runtimeMessage: 'OpenClaw runtime not reachable',
        directProviderReady,
      })
    }
    for (const preset of PRESETS) {
      if (!preset?.id || seen.has(preset.id)) continue
      const runtimeProvider = preset.runtimeProvider || 'openclaw-hetzner'
      const localOnlyRuntime = runtimeProvider !== 'openclaw-hetzner'
      const brainKey = preset.brain || brainKeyForModel(preset.modelPrimary) || 'standard'
      const brainProfile = BRAIN_PROFILES[brainKey] || BRAIN_PROFILES.standard
      fallbackAgents.push({
        id: preset.id,
        name: preset.name || preset.id,
        title: preset.title || '',
        voiceProfile: preset.voiceProfile || '',
        avatar: getAvatarMeta(preset.id) || null,
        avatarPrompt: preset.avatarPrompt || '',
        emoji: preset.emoji || '🤖',
        category: preset.category || 'preset',
        role: preset.role || '',
        description: preset.description || '',
        tags: [],
        enabled: localOnlyRuntime || directProviderReady,
        draft: true,
        brain: {
          key: brainKey,
          modelId: preset.modelPrimary || brainProfile.primary || '',
          fallbacks: preset.modelFallbacks || brainProfile.fallbacks || [],
        },
        tools: preset.tools || [],
        channels: preset.channels || [],
        voice: preset.voice || { provider: 'elevenlabs' },
        labs: preset.labs || {},
        runtimeProvider,
        jobDescription: preset.jobDescription || '',
        schedule: preset.schedule || { mode: 'on-demand' },
        isPreset: true,
        presetSource: preset.id,
        preparedRuntimePreset: localOnlyRuntime,
        offlineRuntime: true,
        runtimeStatus: 'runtime_not_reachable',
        runtimeMessage: 'OpenClaw runtime not reachable',
        directProviderReady,
      })
    }
    return {
      ok: true,
      degraded: true,
      error: e.message,
      agents: fallbackAgents,
      localAgentIds: Object.keys(local.agents || {}),
      categories: CATEGORIES,
      presets: PRESETS,
      brains: BRAIN_PROFILES,
      channelOptions: AGENT_CHANNEL_OPTIONS,
      channelStatus: buildAgentChannelStatus(),
      modelCatalog: MODEL_CATALOG.map(m => ({ ...m, available: availableProviders.has(m.provider) })),
      modelProviders: PROVIDERS,
      modelTiers: TIER_LABEL,
      availableProviders: Array.from(availableProviders),
      dataSource: dataStoreInfo(['agents.json', 'voice-agent-roster.json']),
      ping: { ok: false, error: e.message },
      schemaUnknownKeys: [],
    }
  }
  const ping = await pingOpenclaw()
  const availableProviders = detectKeysCombined(fullCfg)
  const modelCatalog = MODEL_CATALOG.map(m => ({ ...m, available: availableProviders.has(m.provider) }))
  const channelStatus = buildAgentChannelStatus(fullCfg)

  const seenIds = new Set()
  const agents = []
  for (const r of remote.list) {
    if (!r || !r.id) continue
    seenIds.add(r.id)
    const view = mergeAgentView(r, local.agents[r.id])
    const unknownEntry = remote.schemaUnknownKeys.find(u => u.id === r.id)
    if (unknownEntry) view.schemaUnknownKeys = unknownEntry.keys
    agents.push(view)
  }

  // Surface CRM-only runtime agents. OpenClaw agents come from openclaw.json;
  // DeerFlow/Hermes live in CRM metadata until those runtimes get provider sync.
  for (const [id, m] of Object.entries(local.agents)) {
    const runtimeProvider = m.runtimeProvider || 'openclaw-hetzner'
    const localOnlyRuntime = runtimeProvider !== 'openclaw-hetzner'
    if (seenIds.has(id) || (!m.draft && !localOnlyRuntime)) continue
    const fakeRemote = {
      id,
      model: { primary: BRAIN_PROFILES[m.brain || 'standard']?.primary || '' },
      tools: { alsoAllow: Array.isArray(m.tools) ? m.tools : [] },
    }
    const view = mergeAgentView(fakeRemote, m)
    view.enabled = m.disabled !== true
    view.draft = m.draft === true || localOnlyRuntime
    agents.push(view)
    seenIds.add(id)
  }

  // Prepared non-OpenClaw bench agents should be visible immediately under
  // their runtime filter without assigning any existing OpenClaw agents.
  for (const preset of PRESETS) {
    if (!preset?.id || seenIds.has(preset.id)) continue
    if ((preset.runtimeProvider || 'openclaw-hetzner') === 'openclaw-hetzner') continue
    const fakeRemote = {
      id: preset.id,
      model: { primary: BRAIN_PROFILES[preset.brain || 'standard']?.primary || '' },
      tools: { alsoAllow: Array.isArray(preset.tools) ? preset.tools : [] },
    }
    const view = mergeAgentView(fakeRemote, {
      ...preset,
      presetSource: preset.id,
      draft: true,
    })
    view.enabled = true
    view.draft = true
    view.preparedRuntimePreset = true
    agents.push(view)
    seenIds.add(preset.id)
  }

  return {
    ok: true,
    agents,
    localAgentIds: Object.keys(local.agents || {}),
    categories: CATEGORIES,
    presets: PRESETS,
    brains: BRAIN_PROFILES,
    channelOptions: AGENT_CHANNEL_OPTIONS,
    channelStatus,
    modelCatalog,
    modelProviders: PROVIDERS,
    modelTiers: TIER_LABEL,
    availableProviders: Array.from(availableProviders),
    dataSource: dataStoreInfo(['agents.json', 'voice-agent-roster.json']),
    ping,
    schemaUnknownKeys: remote.schemaUnknownKeys,
  }
}

/**
 * Save an agent. Splits the payload:
 *   - runtime fields → openclaw.json via patchOpenclawAgents (deep merge)
 *   - metadata fields → data/agents.json
 */
export async function saveAgent(id, payload, { reason = 'agent-manager-save' } = {}) {
  if (!id) throw new Error('saveAgent requires id')

  const local = loadLocal()
  const meta = local.agents[id] || {}
  const next = { ...meta }

  // CRM metadata
  for (const k of ['name', 'title', 'voiceProfile', 'avatarPrompt', 'category', 'role', 'description', 'tags', 'channels', 'schedule', 'voice', 'labs', 'imageGeneration', 'emoji', 'disabled', 'presetSource', 'draft', 'runtimeProvider', 'tools']) {
    if (payload[k] !== undefined) next[k] = payload[k]
  }
  if (payload.voice !== undefined) {
    next.voice = normalizeVoiceForSave(id, payload.voice, payload.draft === true || next.draft === true)
  }
  if (payload.imageGeneration !== undefined) {
    next.imageGeneration = normalizeImageGenerationPreference(payload.imageGeneration)
  }

  // Build remote patch from runtime fields.
  // NOTE on schema discipline: OpenClaw's agents.list[] schema is strict
  // (4.23 rejects unknown keys outright). We only write keys we know are
  // valid: id, name, model, tools, identity. Everything else (job
  // description, enabled flag, channels, schedule) lives CRM-side in
  // data/agents.json so our edits never poison openclaw.json.
  const patch = {}
  if (payload.brainKey && BRAIN_PROFILES[payload.brainKey]) {
    const p = BRAIN_PROFILES[payload.brainKey]
    patch.model = { primary: p.primary, fallbacks: p.fallbacks }
  } else if (payload.modelPrimary) {
    patch.model = { primary: payload.modelPrimary, fallbacks: payload.modelFallbacks || [] }
  }
  if (Array.isArray(payload.tools)) {
    patch.tools = isOpenOcti()
      ? { profile: 'full', allow: payload.tools }
      : { alsoAllow: payload.tools }
  }
  if (payload.identity) patch.identity = payload.identity
  if (payload.name) patch.name = payload.name

  // Job description, enabled flag → CRM metadata only
  if (typeof payload.jobDescription === 'string') next.jobDescription = payload.jobDescription
  if (typeof payload.enabled === 'boolean') next.disabled = !payload.enabled

  const runtimeProvider = next.runtimeProvider || payload.runtimeProvider || 'openclaw-hetzner'

  // Drafts and non-OpenClaw runtime agents are CRM-local. Do not push DeerFlow
  // or Hermes profiles into openclaw.json.
  if (payload.draft === true || runtimeProvider !== 'openclaw-hetzner') {
    next.runtimeProvider = runtimeProvider
    next.draft = payload.draft === true || runtimeProvider !== 'openclaw-hetzner'
    next.syncedAt = new Date().toISOString()
    local.agents[id] = next
    saveLocal(local)
    return { ok: true, draft: next.draft, agent: id, runtimeProvider }
  }

  // Push to OpenClaw with deep merge
  const result = await patchOpenclawAgents([{ op: 'upsert', id, patch }], { reason })

  next.syncedAt = new Date().toISOString()
  next.draft = false
  local.agents[id] = next
  saveLocal(local)

  return { ok: true, agent: id, backup: result.backup }
}

export async function deleteAgent(id) {
  if (!id) throw new Error('deleteAgent requires id')
  if (id === 'main') throw new Error('Refusing to delete the main agent')

  const local = loadLocal()
  const wasDraft = local.agents[id]?.draft === true
  delete local.agents[id]
  saveLocal(local)

  if (wasDraft) return { ok: true, removedFromOpenclaw: false }

  const result = await patchOpenclawAgents([{ op: 'delete', id }], { reason: 'agent-manager-delete' })
  return { ok: true, removedFromOpenclaw: true, backup: result.backup }
}

export async function cloneAgent(sourceId, newId, displayName) {
  if (!sourceId || !newId) throw new Error('cloneAgent requires sourceId + newId')

  const remote = await readOpenclawAgents()
  const source = remote.list.find(a => a.id === sourceId)
  if (!source) throw new Error(`Source agent not found: ${sourceId}`)

  // Deep clone, retag id, preserve everything else
  const cloned = JSON.parse(JSON.stringify(source))
  cloned.id = newId
  if (displayName) cloned.name = displayName

  const result = await patchOpenclawAgents([{ op: 'upsert', id: newId, patch: cloned }], { reason: 'agent-manager-clone' })

  const local = loadLocal()
  const sourceMeta = local.agents[sourceId] || {}
  local.agents[newId] = {
    ...sourceMeta,
    name: displayName || `${sourceMeta.name || sourceId} (copy)`,
    syncedAt: new Date().toISOString(),
  }
  saveLocal(local)

  // Voice clone — if the source has an ElevenLabs binding, create a parallel
  // ElevenLabs agent for the clone so the new agent can take calls on its own
  // (independent prompt edits, independent usage). If the source has no voice
  // binding (e.g. it's an internal-only agent), skip silently.
  let voiceClone = null
  let voiceCloneError = null
  try {
    const { cloneElevenLabsAgent, writeRosterBinding, readRosterBinding } = await import('./elevenlabs-clone.js')
    const sourceBinding = readRosterBinding(sourceId)
    if (sourceBinding?.agentId) {
      const cloneName = displayName || `${sourceBinding.name || sourceId} (clone)`
      const result2 = await cloneElevenLabsAgent(sourceBinding.agentId, cloneName)
      writeRosterBinding(newId, {
        agentId: result2.elevenAgentId,
        voiceId: result2.voiceId || sourceBinding.voiceId,
        voiceName: sourceBinding.voiceName,
        name: cloneName,
        firstName: (cloneName.split(/\s+/)[0]) || sourceBinding.firstName,
      })
      voiceClone = { elevenAgentId: result2.elevenAgentId, voiceId: result2.voiceId }
    }
  } catch (e) {
    voiceCloneError = e.message
  }

  return { ok: true, agent: newId, backup: result.backup, voiceClone, voiceCloneError }
}

export async function enablePreset(presetId, { customId } = {}) {
  const preset = PRESET_BY_ID[presetId]
  if (!preset) throw new Error(`Unknown preset: ${presetId}`)
  const id = customId || presetId

  const brain = BRAIN_PROFILES[preset.brain] || BRAIN_PROFILES.standard
  const primary = preset.modelPrimary || brain.primary
  const fallbacks = Array.isArray(preset.modelFallbacks) ? preset.modelFallbacks : brain.fallbacks
  const patch = {
    name: preset.name,
    identity: { name: preset.name, emoji: preset.emoji },
    model: { primary, fallbacks },
    tools: isOpenOcti()
      ? { profile: 'full', allow: preset.tools }
      : { alsoAllow: preset.tools },
  }

  const runtimeProvider = preset.runtimeProvider || 'openclaw-hetzner'
  const localOnlyRuntime = runtimeProvider !== 'openclaw-hetzner'
  const result = localOnlyRuntime
    ? { backup: null }
    : await patchOpenclawAgents([{ op: 'upsert', id, patch }], { reason: `preset-${presetId}` })

  const local = loadLocal()
  local.agents[id] = {
    name: preset.name,
    title: preset.title || '',
    voiceProfile: preset.voiceProfile || '',
    avatarPrompt: preset.avatarPrompt || '',
    emoji: preset.emoji,
    category: preset.category,
    role: preset.role,
    description: preset.description,
    tags: preset.tags || [],
    channels: preset.channels,
    voice: preset.voice || { provider: 'elevenlabs' },
    labs: preset.labs || {},
    imageGeneration: normalizeImageGenerationPreference(preset.imageGeneration || {}),
    runtimeProvider,
    tools: preset.tools || [],
    jobDescription: preset.jobDescription || '',
    schedule: preset.schedule,
    presetSource: presetId,
    syncedAt: new Date().toISOString(),
    draft: localOnlyRuntime,
  }
  saveLocal(local)

  return { ok: true, agent: id, backup: result.backup }
}

export async function getBackups() {
  return await listAgentBackups()
}
