import { createHash } from 'node:crypto'

export function chatHistoryScope(user) {
  if (!user?.id) return null
  return createHash('sha256').update(JSON.stringify([
    String(user.id), String(user.tenantId || ''), String(user.accountId || ''),
  ])).digest('hex').slice(0, 32)
}

export function isChatConversationId(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export function wizardConversationSessionKey({ conversationId, user, agentId }) {
  const scope = chatHistoryScope(user)
  if (!scope || !isChatConversationId(conversationId)) throw new Error('Invalid chat conversation')
  return `agent:${agentId}:ai-wizard-${scope}-${conversationId.toLowerCase()}`
}
