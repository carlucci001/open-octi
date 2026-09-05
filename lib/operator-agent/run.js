import { approvalIntent, canExecuteTool, createProposal, grantConversationForToday } from './approval.js'
import { callFrontierModel, selectFrontierLane } from './model.js'
import { buildOperatorSystemPrompt } from './prompt.js'
import { persistentConversationStore } from './state.js'
import { OPERATOR_TOOLS } from './tools/registry.js'
import { answerLeadInterview, beginLeadInterview, isLeadInterviewRequest } from './interview.js'

export const MAX_TOOL_CALLS = 12
export const TOOL_TIMEOUT_MS = 60_000

export async function withToolTimeout(work, timeoutMs = TOOL_TIMEOUT_MS) {
  let timer
  try {
    return await Promise.race([
      Promise.resolve().then(work),
      new Promise((_resolve, reject) => { timer = setTimeout(() => { const error = new Error(`Tool timed out after ${timeoutMs} ms`); error.code = 'tool_timeout'; reject(error) }, timeoutMs) }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

function summary(value) {
  if (value == null) return 'No result'
  if (Array.isArray(value)) return `${value.length} items`
  if (typeof value !== 'object') return String(value).slice(0, 180)
  for (const key of ['account', 'contact', 'opportunity', 'leadList', 'document', 'invoice', 'run']) {
    if (value[key]) return `${key}: ${value[key].name || value[key].title || value[key].number || value[key].id || 'created'}`
  }
  const collection = ['accounts', 'contacts', 'leads', 'sources'].find(key => Array.isArray(value[key]))
  if (collection) return `${value[collection].length} ${collection}`
  return value.ok === false ? String(value.error || 'Failed') : 'Completed'
}

async function defaultLogger(event) {
  try {
    const { logActivity } = await import('@/lib/entityStore')
    logActivity({ type: 'operator_agent', subject: `${event.tool} ${event.status}`, body: event.summary || '', linkedTo: {}, agentId: 'operator-agent', meta: { actor: 'operator-agent', conversationId: event.conversationId, tool: event.tool, status: event.status } })
  } catch {}
}

export async function runOperatorTurn({
  request, conversationId, messages = [], operatorContext = {}, requestedModel, approvalToken,
  tools = OPERATOR_TOOLS, store = persistentConversationStore, modelCaller = callFrontierModel,
  laneSelector = selectFrontierLane, logger = defaultLogger, timeoutMs = TOOL_TIMEOUT_MS, now = new Date(),
} = {}) {
  if (!conversationId) throw new Error('conversationId is required')
  let state = store.load(conversationId)
  const lastUserText = [...messages].reverse().find(item => item.role === 'user')?.content || ''
  const intent = approvalIntent(lastUserText)
  const events = []
  let callsUsed = 0
  let pendingApprovedCall = null

  if (!state.pendingProposal && !state.interview && isLeadInterviewRequest(lastUserText)) {
    const interview = beginLeadInterview({ text: lastUserText, profile: operatorContext.account || operatorContext.profile || {}, accountId: operatorContext.accountId || operatorContext.recordId || '', accountName: operatorContext.accountName || operatorContext.recordName || '' })
    state = store.save({ ...state, interview, messages })
    if (interview.status === 'questions') return { state: 'interview', text: interview.question, interview, events, conversation: state }
  } else if (!state.pendingProposal && state.interview?.status === 'questions') {
    const interview = answerLeadInterview(state.interview, lastUserText)
    state = store.save({ ...state, interview, messages })
    if (interview.status === 'questions') return { state: 'interview', text: interview.question, interview, events, conversation: state }
    messages = [...messages, { role: 'assistant', content: `Lead interview complete. Use these verified slots to write a Lead Plan Document, propose a proven-source build into the account lead list, and create a campaign draft without sending: ${JSON.stringify(interview)}` }]
  }

  if (state.pendingProposal) {
    if (intent.approve || approvalToken === state.pendingProposal.approvalToken) {
      if (intent.allToday) state = grantConversationForToday(state, now)
      pendingApprovedCall = { name: state.pendingProposal.tool, input: state.pendingProposal.inputs, id: state.pendingProposal.id }
      approvalToken = state.pendingProposal.approvalToken
    } else if (/^skip\b/i.test(String(lastUserText).trim())) {
      events.push({ type: 'proposal_skipped', proposal: state.pendingProposal })
      state = { ...state, pendingProposal: null }
    } else if (!/^edit\b/i.test(String(lastUserText).trim())) {
      return { state: 'waiting-approval', text: 'I still need your Go, Edit, or Skip on the pending proposal.', proposal: state.pendingProposal, events, conversation: store.save(state) }
    }
  }

  const byName = new Map(tools.map(item => [item.name, item]))
  const execute = async call => {
    const selected = byName.get(call.name)
    if (!selected) throw new Error(`Unknown operator tool: ${call.name}`)
    if (!canExecuteTool({ tool: selected, state, approvalToken, now })) {
      const proposal = createProposal(conversationId, call, selected, now)
      state = { ...state, pendingProposal: proposal }
      store.save(state)
      events.push({ type: 'proposal', proposal })
      return { proposed: true, proposal }
    }
    if (callsUsed >= MAX_TOOL_CALLS) { const error = new Error(`Tool-call limit reached (${MAX_TOOL_CALLS})`); error.code = 'tool_limit'; throw error }
    callsUsed += 1
    const started = { type: 'tool_start', tool: call.name, inputs: call.input || {} }
    events.push(started)
    await logger({ tool: call.name, status: 'started', summary: JSON.stringify(call.input || {}).slice(0, 300), conversationId })
    try {
      const result = await withToolTimeout(() => selected.execute(call.input || {}, { request, conversationId, user: operatorContext.user }), timeoutMs)
      const event = { type: 'tool_result', tool: call.name, inputs: call.input || {}, result, summary: summary(result) }
      events.push(event)
      await logger({ tool: call.name, status: 'completed', summary: event.summary, conversationId })
      state = { ...state, pendingProposal: null, toolEvents: [...(state.toolEvents || []), started, event].slice(-100) }
      store.save(state)
      return { result, event }
    } catch (error) {
      const event = { type: 'tool_error', tool: call.name, inputs: call.input || {}, error: error.message, code: error.code || 'tool_error' }
      events.push(event)
      await logger({ tool: call.name, status: 'failed', summary: error.message, conversationId })
      throw error
    }
  }

  if (pendingApprovedCall) {
    const approved = await execute(pendingApprovedCall)
    if (approved.proposed) return { state: 'waiting-approval', proposal: approved.proposal, events, conversation: state }
    messages = [...messages, { role: 'assistant', content: `Approved tool result for ${pendingApprovedCall.name}: ${JSON.stringify(approved.result)}` }]
  }

  const lane = laneSelector({ requestedModel })
  if (lane?.state === 'needs-key') return { state: 'needs-key', text: 'Maggie needs an Anthropic or Google key in the existing credential resolver.', needs: lane.needs, events, conversation: store.save({ ...state, messages }) }
  const system = buildOperatorSystemPrompt({ operatorContext })

  while (callsUsed < MAX_TOOL_CALLS) {
    const model = await modelCaller({ lane, system, messages, tools })
    if (model?.state === 'needs-key') return { ...model, events, conversation: store.save({ ...state, messages }) }
    if (!model.toolCalls?.length) {
      const text = model.text || 'Done.'
      state = store.save({ ...state, messages: [...messages, { role: 'assistant', content: text }], pendingProposal: null })
      return { state: 'complete', text, events, usage: model.usage, provider: model.provider || lane.provider, model: model.model || lane.model, conversation: state }
    }
    for (const call of model.toolCalls) {
      const outcome = await execute(call)
      if (outcome.proposed) return { state: 'waiting-approval', text: model.text || `I'm about to run ${call.name}. Go?`, proposal: outcome.proposal, events, provider: model.provider || lane.provider, model: model.model || lane.model, conversation: state }
      messages = [...messages, { role: 'assistant', content: `Tool ${call.name} result: ${JSON.stringify(outcome.result)}` }]
    }
  }
  const error = new Error(`Tool-call limit reached (${MAX_TOOL_CALLS})`)
  error.code = 'tool_limit'
  throw error
}
