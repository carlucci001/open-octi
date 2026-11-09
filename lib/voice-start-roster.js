
// The authenticated roster decides the voice provider. The displayed roster is a
// local display fallback: it is not authoritative and must never select a paid
// provider. When a caller supplies a roster request, wait for it and fail closed
// if the agent's real configuration cannot be loaded.
export async function resolveVoiceStartRoster({ agentId, displayedRoster, rosterRequest }) {
  if (rosterRequest === null || rosterRequest === undefined) return displayedRoster
  const loaded = await rosterRequest
  if (!Array.isArray(loaded) || !loaded.some(agent => agent && agent.id === agentId)) {
    const shown = Array.isArray(displayedRoster) ? displayedRoster.find(agent => agent && agent.id === agentId) : null
    const agentName = String(shown?.firstName || shown?.name || '').trim() || 'The agent'
    throw new Error(`${agentName}’s voice settings could not be loaded. No voice session was started.`)
  }
  const byId = new Map((Array.isArray(displayedRoster) ? displayedRoster : []).map(agent => [agent.id, agent]))
  for (const agent of loaded) byId.set(agent.id, { ...(byId.get(agent.id) || {}), ...agent })
  return Array.from(byId.values())
}
