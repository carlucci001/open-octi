export function normalizeAgentLookup(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .replace(/\b(agent|assistant|department|team|person|guy|lady)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function hasWordSequence(haystack, needle) {
  const target = normalizeAgentLookup(needle)
  if (!target) return false
  return new RegExp(`(^|\\s)${escapeRegExp(target)}(?=\\s|$)`).test(normalizeAgentLookup(haystack))
}

function agentLookupFields(agent) {
  if (!agent) return []
  return [
    agent.id,
    agent.firstName,
    agent.name,
    agent.role,
    agent.category,
    agent.voiceName,
    agent.id === 'finance-manager' ? 'frankie' : '',
  ].map(normalizeAgentLookup).filter(Boolean)
}

function agentMentionNames(agent) {
  if (!agent) return []
  return [
    agent.firstName,
    agent.name,
    agent.id,
    agent.id === 'finance-manager' ? 'frankie' : '',
  ].map(normalizeAgentLookup).filter(Boolean)
}

export function findRosterAgent(roster, value) {
  const target = normalizeAgentLookup(value)
  if (!target) return null
  const terms = target.split(/\s+/).filter(Boolean)
  return (roster || []).find(agent => {
    const fields = agentLookupFields(agent)
    return fields.some(field =>
      field === target ||
      hasWordSequence(field, target) ||
      hasWordSequence(target, field) ||
      terms.some(term => field === term || hasWordSequence(field, term))
    )
  }) || null
}

export function findAgentMentionInTranscript(roster, transcript, { excludeAgentId = '' } = {}) {
  const matches = (roster || []).filter(agent => {
    if (excludeAgentId && agent?.id === excludeAgentId) return false
    return agentMentionNames(agent).some(name => hasWordSequence(transcript, name))
  })
  return matches[0] || null
}

export function isDirectTransferPhrase(value) {
  const text = normalizeAgentLookup(value)
  return /\b(transfer|send|connect|route|switch|handoff|hand off|get me|take me|put me|bring|let me talk|talk to|speak to)\b/.test(text)
}

export function isWakeTransferPhrase(value, agent) {
  const text = normalizeAgentLookup(value)
  return agentMentionNames(agent).some(name => new RegExp(`\\b(?:hey|hay)\\s+${escapeRegExp(name)}\\b`).test(text))
}

function targetTextAfterTransferCue(value) {
  const text = normalizeAgentLookup(value)
  const cue = /\b(?:transfer|send|connect|route|switch|handoff|hand off|take|get|put|bring|move)\s+(?:me\s+)?(?:over\s+)?(?:to|with|back to)?\s+(.+)$/.exec(text)
    || /\b(?:let me\s+)?(?:talk|speak)\s+(?:to|with)\s+(.+)$/.exec(text)
  if (!cue?.[1]) return ''
  return cue[1]
    .replace(/\b(please|now|next|instead|for me|would you|can you|could you)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function resolveTransferTarget(roster, transcript, { activeAgentId = '' } = {}) {
  const targetText = targetTextAfterTransferCue(transcript)
  const cued = targetText ? findRosterAgent(roster, targetText) : null
  if (cued && cued.id !== activeAgentId) return cued
  return findAgentMentionInTranscript(roster, transcript, { excludeAgentId: activeAgentId })
}
