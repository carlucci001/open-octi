const CALL_SID = /^CA[0-9a-f]{32}$/i
const CONFERENCE_SID = /^CF[0-9a-f]{32}$/i
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function safeEndpoint(value) {
  const endpoint = text(value)
  if (!endpoint || endpoint.startsWith('client:')) return endpoint
  const digits = endpoint.replace(/\D/g, '')
  if (digits.length >= 4) return `***${digits.slice(-4)}`
  return endpoint
}

function validCallSid(value) {
  return CALL_SID.test(text(value))
}

function validConferenceSid(value) {
  return CONFERENCE_SID.test(text(value))
}

function validConferenceName(value) {
  const name = text(value)
  return !!name && name.length <= 128 && !CONTROL_CHARACTERS.test(name)
}

export function normalizeHangupTarget(input = {}) {
  const conferenceSid = text(input.conferenceSid)
  const conferenceName = text(input.conferenceName || input.conf)
  const callSid = text(input.callSid)

  if (conferenceSid) {
    if (!validConferenceSid(conferenceSid)) throw new Error('A valid conferenceSid is required')
    return { kind: 'conference', conferenceSid }
  }
  if (conferenceName) {
    if (!validConferenceName(conferenceName)) throw new Error('A valid conferenceName is required')
    return { kind: 'conference-name', conferenceName }
  }
  if (callSid) {
    if (!validCallSid(callSid)) throw new Error('A valid callSid is required')
    return { kind: 'call', callSid }
  }

  throw new Error('Hang-up target required: provide callSid, conferenceSid, or conferenceName')
}

function connectionCallSid(connection) {
  const candidates = [
    connection?.parameters?.CallSid,
    connection?.parameters?.callSid,
    connection?.customParameters?.get?.('CallSid'),
  ]
  return candidates.map(text).find(validCallSid) || ''
}

function connectionStatus(connection) {
  try {
    return text(typeof connection?.status === 'function' ? connection.status() : '')
  } catch {
    return ''
  }
}

function hintTarget(hint) {
  if (validConferenceSid(hint?.conferenceSid)) return { conferenceSid: hint.conferenceSid }
  if (validConferenceName(hint?.conferenceName)) return { conferenceName: hint.conferenceName }
  if (validCallSid(hint?.callSid)) return { callSid: hint.callSid }
  return null
}

export function createActiveCallHint(detail = {}, now = Date.now()) {
  const conferenceSid = validConferenceSid(detail.conferenceSid) ? text(detail.conferenceSid) : ''
  const conferenceName = validConferenceName(detail.conferenceName || detail.conf)
    ? text(detail.conferenceName || detail.conf)
    : ''
  const callSid = validCallSid(detail.callSid)
    ? text(detail.callSid)
    : connectionCallSid(detail.connection)

  let id = ''
  if (conferenceSid) id = `conference:${conferenceSid}`
  else if (conferenceName) id = `conference-name:${conferenceName}`
  else if (callSid) id = `call:${callSid}`
  if (!id) return null

  const name = text(detail.name)
  const number = safeEndpoint(detail.number)
  return {
    id,
    conferenceSid,
    conferenceName,
    callSid,
    name,
    number,
    label: name || number || 'Phone call',
    status: text(detail.status) || connectionStatus(detail.connection) || 'connecting',
    startedAt: Number.isFinite(now) ? now : Date.now(),
    connection: detail.connection || null,
  }
}

function parseTime(value) {
  if (Number.isFinite(value)) return value
  const parsed = value ? Date.parse(value) : NaN
  return Number.isFinite(parsed) ? parsed : null
}

function phoneEndpoint(call = {}) {
  const from = safeEndpoint(call.from)
  const to = safeEndpoint(call.to)
  if (from.startsWith('client:')) return to || from
  if (to.startsWith('client:')) return from || to
  return to || from || ''
}

function callPartyLabel(call = {}) {
  const from = safeEndpoint(call.from)
  const to = safeEndpoint(call.to)
  if (from && to && from !== to) return `${from} → ${to}`
  return from || to || ''
}

function conferencePartyLabel(participants = []) {
  const parties = []
  for (const participant of participants) {
    for (const value of [participant?.from, participant?.to]) {
      const endpoint = safeEndpoint(value)
      if (endpoint && !parties.includes(endpoint)) parties.push(endpoint)
    }
  }
  return parties.join(' ↔ ')
}

function conferenceHeld(participants = []) {
  const remoteParticipants = participants.filter(participant => !participant?.isClient)
  const candidates = remoteParticipants.length ? remoteParticipants : participants
  return candidates.some(participant => !!participant?.hold)
}

function hintPartyLabel(hint = {}) {
  const number = safeEndpoint(hint.number)
  return number ? `client:carl → ${number}` : ''
}

function participantEndpoint(participants = []) {
  for (const participant of participants) {
    if (participant?.isClient) continue
    const endpoint = phoneEndpoint(participant)
    if (endpoint) return endpoint
  }
  for (const participant of participants) {
    const endpoint = phoneEndpoint(participant)
    if (endpoint && !endpoint.startsWith('client:')) return endpoint
  }
  return ''
}

export function buildActiveCallEntries(payload = {}, localHints = []) {
  const calls = Array.isArray(payload.calls) ? payload.calls : []
  const conferences = Array.isArray(payload.conferences) ? payload.conferences : []
  const hints = (Array.isArray(localHints) ? localHints : []).filter(hint => hintTarget(hint))
  const participantCallSids = new Set()
  const representedHints = new Set()
  const entries = []

  for (const conference of conferences) {
    const sid = text(conference?.sid)
    if (!validConferenceSid(sid)) continue
    const friendlyName = text(conference?.friendlyName || conference?.friendly_name)
    const participants = Array.isArray(conference?.participants) ? conference.participants : []
    participants.forEach(participant => {
      const participantSid = text(participant?.callSid || participant?.call_sid)
      if (validCallSid(participantSid)) participantCallSids.add(participantSid)
    })
    const hint = hints.find(candidate => (
      candidate.conferenceSid === sid
      || (!!friendlyName && candidate.conferenceName === friendlyName)
    ))
    if (hint) representedHints.add(hint.id)
    entries.push({
      id: `conference:${sid}`,
      label: hint?.label || hint?.name || hint?.number || participantEndpoint(participants) || friendlyName || 'Phone conference',
      number: safeEndpoint(hint?.number) || participantEndpoint(participants),
      partyLabel: conferencePartyLabel(participants) || hintPartyLabel(hint),
      conferenceName: friendlyName || hint?.conferenceName || '',
      held: conferenceHeld(participants),
      status: text(conference?.status) || hint?.status || 'in-progress',
      startedAt: parseTime(conference?.dateCreated || conference?.date_created) ?? hint?.startedAt ?? null,
      target: { conferenceSid: sid },
      connection: hint?.connection || null,
    })
  }

  for (const call of calls) {
    const sid = text(call?.sid)
    if (!validCallSid(sid) || participantCallSids.has(sid)) continue
    const hint = hints.find(candidate => candidate.callSid === sid)
    if (hint) representedHints.add(hint.id)
    entries.push({
      id: hint?.id || `call:${sid}`,
      label: hint?.label || phoneEndpoint(call) || 'Phone call',
      number: safeEndpoint(hint?.number) || phoneEndpoint(call),
      partyLabel: callPartyLabel(call) || hintPartyLabel(hint),
      conferenceName: hint?.conferenceName || '',
      held: false,
      status: text(call?.status) || hint?.status || 'in-progress',
      startedAt: parseTime(call?.start || call?.startTime || call?.start_time) ?? hint?.startedAt ?? null,
      target: hintTarget(hint) || { callSid: sid },
      connection: hint?.connection || null,
    })
  }

  for (const hint of hints) {
    if (representedHints.has(hint.id)) continue
    entries.push({
      id: hint.id,
      label: hint.label || hint.name || hint.number || 'Phone call',
      number: safeEndpoint(hint.number),
      partyLabel: hintPartyLabel(hint),
      conferenceName: hint.conferenceName || '',
      held: false,
      status: hint.status || 'connecting',
      startedAt: hint.startedAt ?? null,
      target: hintTarget(hint),
      connection: hint.connection || null,
    })
  }

  return entries
}

export function formatCallDuration(startedAt, now = Date.now()) {
  const start = parseTime(startedAt)
  if (start === null || !Number.isFinite(now) || now < start) return ''
  const totalSeconds = Math.floor((now - start) / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}
