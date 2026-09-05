import crypto from 'node:crypto'
import { requireAdmin } from '@/lib/auth'
import { runOperatorTurn } from '@/lib/operator-agent/run'
import { persistentConversationStore } from '@/lib/operator-agent/state'
import { callRoute } from '@/lib/operator-agent/tools/common'
import { scriptedOperatorProofModel } from '@/lib/operator-agent/proof-model'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function eventStream(events) {
  const encoder = new TextEncoder()
  return new Response(new ReadableStream({
    start(controller) {
      for (const event of events) controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      controller.close()
    },
  }), { headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache, no-transform' } })
}

function transcriptBody(messages, result) {
  const lines = (messages || []).map(item => `## ${item.role === 'assistant' ? 'Maggie' : 'Operator'}\n\n${String(item.content || '')}`)
  if (result.text) lines.push(`## Maggie\n\n${result.text}`)
  if (result.events?.length) {
    lines.push('## Tool activity\n\n' + result.events.map(event => `- ${event.type}: ${event.tool || event.proposal?.tool || ''} ${event.summary || event.error || ''}`.trim()).join('\n'))
  }
  return lines.join('\n\n')
}

async function syncTranscript(request, conversationId, messages, result, operatorContext) {
  try {
    const { POST } = await import('@/app/api/documents/route')
    const current = persistentConversationStore.load(conversationId)
    const body = transcriptBody(messages, result)
    if (current.transcriptDocumentId) {
      await callRoute(POST, request, { pathname: '/api/documents', method: 'POST', body: { action: 'update', document: { id: current.transcriptDocumentId, title: `Maggie Operator Transcript - ${conversationId.slice(-8)}`, body, clientId: operatorContext.accountId || operatorContext.recordId || '', clientName: operatorContext.accountName || operatorContext.recordName || '', values: { operatorAgent: true, conversationId, documentType: 'operator-transcript' } } } })
      return current.transcriptDocumentId
    }
    const saved = await callRoute(POST, request, { pathname: '/api/documents', method: 'POST', body: { action: 'save', title: `Maggie Operator Transcript - ${conversationId.slice(-8)}`, body, clientId: operatorContext.accountId || operatorContext.recordId || '', clientName: operatorContext.accountName || operatorContext.recordName || '', status: 'draft', values: { operatorAgent: true, conversationId, documentType: 'operator-transcript' } } })
    if (saved.document?.id) persistentConversationStore.save({ ...current, transcriptDocumentId: saved.document.id })
    return saved.document?.id || null
  } catch (error) {
    console.warn('[operator-agent] transcript sync failed:', String(error?.message || error).slice(0, 180))
    return null
  }
}

export async function POST(request) {
  const { user, error } = await requireAdmin(request)
  if (error) return error
  const body = await request.json().catch(() => null)
  if (!body || !Array.isArray(body.messages)) return Response.json({ ok: false, error: 'messages are required' }, { status: 400 })
  const conversationId = String(body.conversationId || `operator-${crypto.randomUUID()}`).replace(/[^a-zA-Z0-9_.:-]/g, '').slice(0, 120)
  try {
    const scriptedProof = process.env.NODE_ENV !== 'production' && process.env.OPERATOR_AGENT_SCRIPTED_PROOF === '1'
    const result = await runOperatorTurn({
      request, conversationId, messages: body.messages.slice(-80), operatorContext: { ...(body.operatorContext || {}), user },
      requestedModel: body.model, approvalToken: body.approvalToken,
      ...(scriptedProof ? { modelCaller: scriptedOperatorProofModel, laneSelector: () => ({ provider: 'mock', model: 'operator-agent-scripted-proof', key: 'local-proof' }) } : {}),
    })
    const transcriptDocumentId = await syncTranscript(request, conversationId, body.messages, result, body.operatorContext || {})
    const events = [
      ...(result.events || []).map(event => ({ ...event, conversationId })),
      ...(result.proposal ? [{ type: 'proposal', proposal: result.proposal, conversationId }] : []),
      ...(result.text ? [{ type: 'message', text: result.text, conversationId }] : []),
      { type: 'done', state: result.state, conversationId, transcriptDocumentId, provider: result.provider, model: result.model, usage: result.usage },
    ]
    return eventStream(events)
  } catch (runError) {
    return eventStream([{ type: 'error', error: runError.message || 'Operator run failed', code: runError.code || 'operator_error', conversationId }, { type: 'done', state: 'error', conversationId }])
  }
}
