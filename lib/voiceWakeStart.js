export function buildWakeStartOptions({ initialText = '' } = {}) {
  return {
    initialText: String(initialText || '').trim(),
    silent: false,
  }
}

export function matchIntentionalAgentWake(transcript, agents = []) {
  const heard = String(transcript || '').trim()
  for (const agent of agents) {
    for (const name of agent.names || []) {
      const safeName = String(name).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')
      if (!safeName) continue
      const pattern = '\\b(?:(?:hey|hay)\\s+' + safeName + '\\b|' + safeName + '\\s+(?:go\\s+live|wake\\s+up)\\b)\\s*'
      const match = new RegExp(pattern, 'i').exec(heard)
      if (match) return { ...agent, initialText: heard.slice(match.index + match[0].length).trim() }
    }
  }
  return null
}
