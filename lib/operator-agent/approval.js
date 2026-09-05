import crypto from 'node:crypto'

const APPROVAL_PHRASES = new Set(['go', 'yes, go', 'yes go', 'approve', 'approved'])
const ALL_DAY_PHRASE = 'go for all today'

export function approvalIntent(text = '') {
  const normalized = String(text || '').trim().toLowerCase().replace(/[.!]+$/, '')
  return { approve: APPROVAL_PHRASES.has(normalized) || normalized === ALL_DAY_PHRASE, allToday: normalized === ALL_DAY_PHRASE }
}

export function approvalDay(now = new Date()) {
  return now.toISOString().slice(0, 10)
}

export function createProposal(conversationId, call, tool, now = new Date()) {
  return {
    id: `oa-proposal-${crypto.randomUUID()}`,
    approvalToken: crypto.randomBytes(24).toString('base64url'),
    conversationId,
    tool: tool.name,
    inputs: call.input || {},
    summary: `Run ${tool.name} with the shown inputs`,
    sideEffects: tool.sideEffects,
    cost: tool.costEstimate(call.input || {}),
    createdAt: now.toISOString(),
  }
}

export function conversationGrantActive(state, now = new Date()) {
  return state?.approvalGrant?.scope === 'conversation'
    && state.approvalGrant.day === approvalDay(now)
    && state.approvalGrant.conversationId === state.id
}

export function canExecuteTool({ tool, state, approvalToken, now = new Date() }) {
  if (tool.sideEffects === 'none') return true
  if (conversationGrantActive(state, now)) return true
  const proposal = state?.pendingProposal
  return Boolean(proposal && proposal.tool === tool.name && proposal.approvalToken && proposal.approvalToken === approvalToken)
}

export function grantConversationForToday(state, now = new Date()) {
  return { ...state, approvalGrant: { scope: 'conversation', conversationId: state.id, day: approvalDay(now), grantedAt: now.toISOString() } }
}
