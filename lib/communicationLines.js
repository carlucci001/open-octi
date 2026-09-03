const INTERNAL_LINE_ASSIGNMENTS = Object.freeze([
  Object.freeze({
    id: 'farrington-doreen',
    phoneNumber: '+18287709428',
    tenantId: 'farrington-development',
    company: 'Farrington Development',
    agentId: 'receptionist',
    agent: 'Doreen receptionist',
  }),
  Object.freeze({
    id: 'newsroom-lucci',
    phoneNumber: '+18287709227',
    tenantId: 'ContentHub',
    company: 'ContentHub',
    agentId: 'newsroom-receptionist',
    agent: 'Lucci receptionist',
  }),
  Object.freeze({
    id: 'wnc-jessica',
    phoneNumber: '+18286242408',
    tenantId: 'wnc-times',
    company: 'WNC Times',
    agentId: null,
    agent: 'Jessica receptionist',
  }),
])

export function normalizeCommunicationNumber(value) {
  return String(value || '').replace(/\D/g, '')
}

function e164(value) {
  const digits = normalizeCommunicationNumber(value)
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return ''
}

export function listInternalLineAssignments(agents = {}) {
  return INTERNAL_LINE_ASSIGNMENTS.map(assignment => {
    const agent = assignment.agentId ? agents?.[assignment.agentId] : null
    const storedPhone = e164(agent?.phoneNumber)
    return {
      ...assignment,
      phoneNumber: storedPhone || assignment.phoneNumber,
      assignmentSource: storedPhone ? 'agent' : 'internal',
    }
  })
}

function tenantKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function assignmentMatchesLease(assignment, lease) {
  if (assignment.tenantId === lease?.tenantId) return true
  const leaseKeys = new Set([
    tenantKey(lease?.tenantId),
    tenantKey(lease?.tenantName),
  ].filter(Boolean))
  const assignmentKeys = new Set([
    tenantKey(assignment.tenantId),
    tenantKey(assignment.company),
    ...(assignment.tenantId === 'wnc-times' ? ['wnct-times', 'wnct', 'lease-ac-local-wnct'] : []),
  ])
  return [...leaseKeys].some(key => assignmentKeys.has(key))
}

export function resolveCommunicationLineForLease(lease, { agents = {}, assignments } = {}) {
  if (!lease) return null
  const recordedPhone = e164(lease.twilioPhoneNumber) || String(lease.twilioPhoneNumber || '').trim()
  if (recordedPhone) {
    return {
      id: `lease:${lease.id || lease.tenantId || recordedPhone}`,
      phoneNumber: recordedPhone,
      tenantId: lease.tenantId || null,
      company: lease.tenantName || null,
      agentId: lease.agentId || null,
      agent: lease.agentName || null,
      assignmentSource: 'lease',
    }
  }

  const available = Array.isArray(assignments) ? assignments : listInternalLineAssignments(agents)
  const matches = available.filter(assignment => assignmentMatchesLease(assignment, lease))
  return matches.find(assignment => assignment.agentId && assignment.agentId === lease.agentId)
    || matches[0]
    || null
}

export function internalLineLabel(phoneNumber) {
  const normalized = normalizeCommunicationNumber(phoneNumber)
  return listInternalLineAssignments().find(line => normalizeCommunicationNumber(line.phoneNumber) === normalized) || null
}

export function resolveLineOwnership(line, lease) {
  const fallback = internalLineLabel(line.phone_number || line.phoneNumber)
  return {
    company: lease?.tenantName || fallback?.company || null,
    agent: lease?.agentName || fallback?.agent || null,
    assigned: Boolean(lease || fallback),
    assignmentSource: lease ? 'lease' : fallback ? 'internal' : null,
  }
}
