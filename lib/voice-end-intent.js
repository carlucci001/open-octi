const EXACT_END_INTENTS = new Set([
  'thanks',
  'thank you',
  'stop',
])

const COMPLETE_CLOSURE = /^(?:goodbye|bye(?: for now)?|that is (?:all|good for now|enough for now|it for now)(?: (?:goodbye|bye(?: for now)?))?|that will be all|we are done(?: for now)?|i am done(?: for now)?|i am all set|all done|call it a day|let us stop here|end (?:the|this|our)? ?(?:call|conversation|session)(?: now)?|hang up(?: now)?|disconnect(?: me| now)?|stop (?:listening|the call|this call|our call|the conversation|this conversation|here)(?: now)?|you can stop listening)$/

function normalizeVoiceEndIntent(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/\bthats\b/g, 'that is')
    .replace(/\bwere\b/g, 'we are')
    .replace(/\bim\b/g, 'i am')
    .replace(/\blets\b/g, 'let us')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function isCompleteClosure(value) {
  return COMPLETE_CLOSURE.test(value)
}

export function appendVoiceTranscriptChunk(previous, chunk) {
  const current = String(previous || '')
  const incoming = String(chunk || '')
  if (!incoming) return current
  if (!current) return incoming
  if (incoming.startsWith(current)) return incoming
  if (current.endsWith(incoming)) return current
  if (/\s$/.test(current) || /^\s|^[,.;:!?]/.test(incoming)) return current + incoming
  return `${current} ${incoming}`
}

export function isVoiceEndIntent(transcript, { allowBareStop = true } = {}) {
  let normalized = normalizeVoiceEndIntent(transcript)
  if (!normalized) return false

  // Polite conversational lead-ins are safe only when what follows is itself a
  // complete ending. Anchoring the closure prevents phrases such as
  // "thanks, now create a task" and "stop that research" from disconnecting.
  normalized = normalized.replace(/^(?:(?:ok|okay|all right|alright|well|great|perfect|sounds good)\s+)+/, '')
  if ((EXACT_END_INTENTS.has(normalized) && (allowBareStop || normalized !== 'stop')) || isCompleteClosure(normalized)) return true

  const courtesy = normalized.match(/^(?:thanks|thank you)\s+(.+)$/)
  return !!courtesy && isCompleteClosure(courtesy[1])
}
