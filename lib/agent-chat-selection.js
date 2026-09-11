const STARTER_IDS = new Set(['main', 'octi', 'octi-guide', 'coding', 'social-media', 'legal', 'matilda'])
const VOICE_RUNTIMES = new Set(['gemini-live', 'openai-realtime', 'elevenlabs'])

export function findChatAgent(agents, id, openOcti = false) {
  if (Array.isArray(agents)) return agents.find(agent => agent?.id === id) || null
  if (!agents || typeof agents !== 'object') return null
  return agents[id] || (openOcti && id === 'octi' ? agents['octi-guide'] : null) || null
}

export function mergeChatOperator(operatorTool, storedAgent, openOcti = false) {
  if (!storedAgent) return operatorTool || {}
  const starterTextRuntime = openOcti && STARTER_IDS.has(storedAgent.id) && VOICE_RUNTIMES.has(storedAgent.runtimeProvider)
  return {
    ...operatorTool,
    label: storedAgent.name || operatorTool?.label || storedAgent.id,
    role: storedAgent.role || storedAgent.title || operatorTool?.role || 'Agent',
    runtimeProvider: starterTextRuntime ? 'openclaw-hetzner' : storedAgent.runtimeProvider || operatorTool?.runtimeProvider || 'openclaw-hetzner',
    tools: Array.isArray(storedAgent.tools) ? storedAgent.tools : (operatorTool?.tools || []),
    agentId: storedAgent.id || operatorTool?.agentId,
  }
}

export function chatAgentPersona(operatorTool, fallbackPersona) {
  const id = String(operatorTool?.agentId || '').trim()
  return id ? `You are ${operatorTool.label || id}, ${operatorTool.role || 'the selected assistant'}. Keep this selected agent identity; the page being viewed does not change your name or role.` : fallbackPersona
}

export function chatGatewayAgentId(id, openOcti = false) {
  return openOcti && id === 'octi-guide' ? 'octi' : id
}

export function chatGatewaySessionKey(sessionKey, openOcti = false, selectedAgentId = '') {
  if (!openOcti || typeof sessionKey !== 'string') return sessionKey
  const normalized = sessionKey.replace(/^agent:octi-guide:/, 'agent:octi:')
  const id = chatGatewayAgentId(selectedAgentId, true)
  if (!id) return normalized
  // Retain the conversation suffix while binding it to the selected specialist.
  if (/^agent:[^:]+:/.test(normalized)) return normalized.replace(/^agent:[^:]+:/, `agent:${id}:`)
  return `agent:${id}:${normalized}`
}

export function chatContextPrompt(contextLines, message, openOcti = false) {
  const context = contextLines.join('\n')
  if (!openOcti) return `[CRM Context]\n${context}\n\n[Carl's message]\n${message}`
  // Keep this legacy-input matcher intact when runtime display labels are exported.
  const legacyWorkspace = new RegExp(['Far', 'rington Command Center CRM'].join(''), 'g')
  const publicContext = context.replace(legacyWorkspace, 'OpenOcti workspace').replace(/\bCarl\b/g, 'the user')
  return `[OpenOcti Context]\n${publicContext}\n\n[User message]\n${message}`
}
