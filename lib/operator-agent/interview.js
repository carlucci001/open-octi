export const LEAD_PLAN_SLOTS = Object.freeze([
  { id: 'vertical', question: 'What kind of work do you do, and which services make you the most money?' },
  { id: 'serviceArea', question: 'What ZIP codes or counties do you want the leads to come from?' },
  { id: 'idealJob', question: 'What is the ideal job, and about what is the typical ticket size?' },
  { id: 'currentSources', question: 'Where do leads come from today, and what has actually worked?' },
  { id: 'offer', question: 'Why should a customer choose you, and what offer can we lead with?' },
  { id: 'capacity', question: 'How many new jobs can you realistically take each week or month?' },
])

export function isLeadInterviewRequest(text = '') {
  return /\binterview me (?:like|as)\b|\bact as (?:a|the)\b/i.test(String(text))
}

export function accountNameFromRequest(text = '') {
  return String(text).match(/\bI have\s+([^,.]+?)(?:,|\s+-|\s+who\s+is)/i)?.[1]?.trim() || ''
}

function seedFromText(text, profile = {}) {
  const value = String(text || '')
  const role = value.match(/(?:he(?:'s| is)|she(?:'s| is)|as (?:a|the))\s+an?\s+([a-z][a-z -]{2,40})/i)?.[1]?.trim()
  const area = value.match(/\bin\s+([A-Z][A-Za-z .'-]+(?:,\s*[A-Z]{2})?)(?=[.!?,]|\s+what|$)/)?.[1]?.trim()
  const custom = profile.leadGenProfile || profile.leadProfile || {}
  return {
    vertical: custom.vertical || profile.industry || role || '',
    serviceArea: custom.serviceArea || custom.zips || custom.counties || profile.serviceArea || area || '',
    idealJob: custom.idealJob || custom.ticketSize || profile.idealJob || '',
    currentSources: custom.currentSources || profile.currentLeadSources || '',
    offer: custom.offer || profile.differentiator || '',
    capacity: custom.capacity || profile.capacity || '',
  }
}

function nextMissing(slots) {
  return LEAD_PLAN_SLOTS.find(item => !String(slots[item.id] || '').trim()) || null
}

export function beginLeadInterview({ text, profile = {}, accountId = '', accountName = '' } = {}) {
  const slots = seedFromText(text, profile)
  const next = nextMissing(slots)
  return {
    kind: 'lead-plan', status: next ? 'questions' : 'complete', accountId: accountId || profile.id || '',
    accountName: accountName || profile.name || accountNameFromRequest(text), slots, waitingFor: next?.id || null,
    questionsAsked: next ? 1 : 0, question: next?.question || '', startedAt: new Date().toISOString(),
  }
}

export function answerLeadInterview(interview, answer = '') {
  if (!interview?.waitingFor) return interview
  const slots = { ...interview.slots, [interview.waitingFor]: String(answer || '').trim() }
  const next = nextMissing(slots)
  const questionsAsked = Number(interview.questionsAsked || 0) + (next ? 1 : 0)
  return { ...interview, slots, waitingFor: next?.id || null, questionsAsked, question: next?.question || '', status: next ? 'questions' : 'complete', completedAt: next ? null : new Date().toISOString() }
}

export function leadPlanDocumentInput(interview, { sourceRecommendations = [], listNames = [], buildRun = {}, campaign = {} } = {}) {
  const s = interview.slots || {}
  const sources = sourceRecommendations.length
    ? sourceRecommendations.map(item => `- ${item.name || item.id}: ${item.why || item.reason || 'proven fit'}`).join('\n')
    : '- Maggie will select only sources marked PROVEN for the service area before a build can run.'
  const lists = listNames.length ? listNames.map(name => `- ${name}`).join('\n') : `- ${interview.accountName || s.vertical || 'Account'} lead list`
  return {
    title: `${interview.accountName || 'Account'} - Lead Plan`,
    accountId: interview.accountId || '', accountName: interview.accountName || '', documentType: 'lead-plan',
    body: `# Lead Plan\n\n## Business fit\n\n- Trade / vertical: ${s.vertical}\n- Service area: ${s.serviceArea}\n- Ideal job / ticket: ${s.idealJob}\n- Current sources: ${s.currentSources}\n- Offer / differentiator: ${s.offer}\n- Capacity: ${s.capacity}\n\n## Proven source fit\n\n${sources}\n\n## Lists to build\n\n${lists}\n\n## First build-run proposal\n\n${JSON.stringify(buildRun, null, 2)}\n\n## First campaign draft\n\n${JSON.stringify(campaign, null, 2)}\n`,
  }
}

export async function writeLeadPlan(interview, options, executeTool) {
  return executeTool('doc.write', leadPlanDocumentInput(interview, options))
}
