// Phase 1 orchestration run engine.
//
// The interview itself runs: gates pause for the operator, answers branch,
// and captured values persist. Action nodes are deliberately deferred until
// Phase 2. This file does not import an agent runtime, task/document writer,
// vault, HTTP client, or MCP client. Nothing outside the run transcript is
// changed by an action node.
import { readData, writeData } from './dataStore'

export const RUNS_FILE = 'orchestration-runs.json'
export const RUN_STATUSES = [
  'pending',
  'awaiting_answer',
  'awaiting_harness_approval',
  'executing',
  'completed',
  'failed',
  'cancelled',
]

const MAX_RUNS_KEPT = 100
const MAX_STEPS_PER_RUN = 100
const TERMINAL = new Set(['completed', 'failed', 'cancelled'])

function nowIso() { return new Date().toISOString() }

export function genRunId() {
  return `orun_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

function loadRuns() {
  const wrap = readData(RUNS_FILE) || {}
  return Array.isArray(wrap.runs) ? wrap.runs : []
}

function saveRuns(runs) {
  writeData(RUNS_FILE, { lastUpdated: nowIso(), runs: runs.slice(0, MAX_RUNS_KEPT) })
}

export function getRun(runId) {
  return loadRuns().find(run => run.id === runId) || null
}

export function listRuns(flowId) {
  const runs = loadRuns()
  return flowId ? runs.filter(run => run.flowId === flowId) : runs
}

function persistRun(run) {
  const runs = loadRuns()
  const index = runs.findIndex(candidate => candidate.id === run.id)
  run.updatedAt = nowIso()
  if (index === -1) runs.unshift(run)
  else runs[index] = run
  saveRuns(runs)
  return run
}

function stateFor(status, nodeId = '') {
  if (status === 'awaiting_answer' || status === 'awaiting_harness_approval' || status === 'executing') {
    return `${status}(${nodeId})`
  }
  return status
}

function setState(run, status, nodeId = '') {
  if (!RUN_STATUSES.includes(status)) throw new Error(`Unknown orchestration run status: ${status}`)
  run.status = status
  run.state = stateFor(status, nodeId)
  run.currentNodeId = nodeId || null
}

function interpolate(text, context = {}) {
  return String(text || '').replace(/\{([a-zA-Z0-9_.]+)\}/g, (match, key) => {
    const value = context[key]
    return value === undefined || value === null ? match : String(value)
  })
}

function logEvent(run, event) {
  run.transcript.push({ at: nowIso(), ...event })
}

function agentName(agentId) {
  const store = readData('agents.json') || { agents: {} }
  return store.agents?.[agentId]?.name || agentId || 'the selected agent'
}

function safeActionRequest(step, run) {
  const name = interpolate(step.name || step.mcpTool || step.tool || step.kind || step.id, run.context)
  const instruction = interpolate(step.instruction || '', run.context).slice(0, 1000)
  switch (step.kind) {
    case 'agent':
      return {
        detail: `Pending real agent execution (Phase 2): ${agentName(step.agentId)} would receive “${instruction || name}”.`,
        requestSummary: `${agentName(step.agentId)} would receive the ${name} instruction.`,
      }
    case 'tasks':
      return {
        detail: `Pending real task execution (Phase 2): would create ${name}.`,
        requestSummary: instruction || name,
      }
    case 'document': {
      const footer = interpolate(step.footerNote || '', run.context)
      return {
        detail: `Pending real document execution (Phase 2): would draft ${name}.${footer ? ` Footer note required: ${footer}` : ''}`,
        requestSummary: instruction || name,
      }
    }
    case 'api_call':
      return {
        detail: `would call ${name}`,
        requestSummary: `${String(step.method || 'GET').toUpperCase()} ${interpolate(step.url || name, run.context)}`.slice(0, 1000),
      }
    case 'mcp_call':
      return {
        detail: `would call ${name}`,
        requestSummary: `MCP ${step.mcpTool || step.tool || name}`.slice(0, 1000),
      }
    default:
      throw new Error(`Unknown action kind: ${step.kind}`)
  }
}

export function startRun(flow, { input = '', startedBy = '', context = {} } = {}) {
  const steps = Array.isArray(flow.steps) ? flow.steps : []
  if (!steps.length) throw new Error('This flow has no interview steps — add gates or actions in the designer')
  const run = {
    id: genRunId(),
    flowId: flow.id,
    flowSlug: flow.slug || null,
    flowName: flow.name,
    flowVersion: flow.version || 1,
    flowSummary: flow.whatThisFlowDoes?.text || flow.description || '',
    status: 'pending',
    state: 'pending',
    executed: false,
    stepIndex: 0,
    stepsTotal: steps.length,
    deferredActionCount: 0,
    context: { input, client: input, ...context },
    currentNodeId: null,
    currentGate: null,
    pendingHarnessApproval: null,
    transcript: [],
    outputs: [],
    startedBy,
    createdAt: nowIso(),
    updatedAt: null,
    finishedAt: null,
  }
  logEvent(run, {
    type: 'run_started',
    status: 'pending',
    detail: input ? `Interview input recorded: ${String(input).slice(0, 300)}` : 'Interview run started.',
  })
  return persistRun(run)
}

function findStepIndex(steps, idOrIndex, fallback) {
  if (idOrIndex === 'end') return steps.length
  if (typeof idOrIndex === 'number') return idOrIndex
  const index = steps.findIndex(step => step.id === idOrIndex)
  return index === -1 ? fallback : index
}

function failRun(run, detail, step = null) {
  setState(run, 'failed')
  run.currentGate = null
  logEvent(run, {
    type: 'run_failed',
    stepId: step?.id || null,
    kind: step?.kind || null,
    status: 'failed',
    detail,
  })
  run.finishedAt = nowIso()
  return persistRun(run)
}

export async function advanceRun(runId, flow) {
  const run = getRun(runId)
  if (!run) throw new Error(`Run ${runId} not found`)
  if (TERMINAL.has(run.status)) return run
  const steps = Array.isArray(flow.steps) ? flow.steps : []
  let guard = 0

  while (run.stepIndex < steps.length) {
    if (++guard > MAX_STEPS_PER_RUN) return failRun(run, `Step limit (${MAX_STEPS_PER_RUN}) exceeded — likely a gate loop.`)
    const step = steps[run.stepIndex]
    if (!step?.id) return failRun(run, `Step ${run.stepIndex + 1} has no id.`)

    if (step.type === 'gate') {
      setState(run, 'awaiting_answer', step.id)
      run.currentGate = {
        gateId: step.id,
        stepId: step.id,
        question: interpolate(step.question, run.context),
        options: (step.options || []).map(option => ({
          label: option.label,
          capture: option.capture || null,
        })),
      }
      logEvent(run, {
        type: 'gate_asked',
        gateId: step.id,
        stepId: step.id,
        status: 'awaiting_answer',
        question: run.currentGate.question,
      })
      return persistRun(run)
    }

    if (step.type !== 'action') return failRun(run, `Unknown node type: ${step.type}`, step)
    setState(run, 'executing', step.id)
    persistRun(run)
    try {
      const deferred = safeActionRequest(step, run)
      run.deferredActionCount += 1
      logEvent(run, {
        type: 'action_deferred',
        nodeId: step.id,
        stepId: step.id,
        kind: step.kind,
        name: interpolate(step.name || step.kind, run.context),
        status: 'pending_phase_2',
        detail: deferred.detail,
        requestSummary: deferred.requestSummary,
        responseStatus: 'not_executed_phase_1',
      })
    } catch (error) {
      return failRun(run, error.message || String(error), step)
    }
    run.stepIndex = step.next ? findStepIndex(steps, step.next, run.stepIndex + 1) : run.stepIndex + 1
    persistRun(run)
  }

  setState(run, 'completed')
  run.currentGate = null
  logEvent(run, {
    type: 'run_completed',
    status: 'completed',
    detail: `Flow interview completed. 0 actions executed; ${run.deferredActionCount} action${run.deferredActionCount === 1 ? '' : 's'} deferred to Phase 2.`,
  })
  run.finishedAt = nowIso()
  return persistRun(run)
}

export async function answerGate(runId, flow, { gateId, choice, capturedValue } = {}) {
  const run = getRun(runId)
  if (!run) throw new Error(`Run ${runId} not found`)
  if (run.status !== 'awaiting_answer' || !run.currentGate) throw new Error('This run is not waiting on a question')
  if (gateId && gateId !== run.currentGate.gateId) {
    const error = new Error(`Run is waiting on gate ${run.currentGate.gateId}, not ${gateId}`)
    error.status = 409
    throw error
  }

  const steps = Array.isArray(flow.steps) ? flow.steps : []
  const stepIndex = steps.findIndex(step => step.id === run.currentGate.gateId)
  const step = steps[stepIndex]
  if (!step) throw new Error('Gate step no longer exists in this flow')
  const options = step.options || []
  const normalized = String(choice || '').trim().toLowerCase()
  const option = options.find(candidate => String(candidate.label || '').toLowerCase() === normalized)
    || options[Number(choice)]
    || options.find(candidate => String(candidate.label || '').toLowerCase().startsWith(normalized))
  if (!option) throw new Error(`“${choice}” does not match an option. Choices: ${options.map(candidate => candidate.label).join(', ')}`)

  let captured = null
  if (option.capture?.field) {
    const value = String(capturedValue ?? '').trim()
    if (!value) {
      const error = new Error(option.capture.prompt || `${option.capture.field} is required for this answer`)
      error.status = 400
      throw error
    }
    run.context[option.capture.field] = value
    captured = { [option.capture.field]: value }
  }
  logEvent(run, {
    type: 'gate_answered',
    gateId: step.id,
    stepId: step.id,
    status: 'answered',
    question: run.currentGate.question,
    answer: option.label,
    captured,
  })
  run.currentGate = null
  run.stepIndex = option.next !== undefined && option.next !== null && option.next !== ''
    ? findStepIndex(steps, option.next, stepIndex + 1)
    : stepIndex + 1
  setState(run, 'executing', step.id)
  persistRun(run)
  return advanceRun(runId, flow)
}

// Reserved for Phase 2's real harness bridge. Phase 1 never calls this and
// never approves it. Keeping the persisted state contract now makes future
// resumes additive instead of a run-schema migration.
export function parkForHarnessApproval(runId, nodeId, requestSummary = '') {
  const run = getRun(runId)
  if (!run) throw new Error(`Run ${runId} not found`)
  setState(run, 'awaiting_harness_approval', nodeId)
  run.pendingHarnessApproval = { nodeId, requestSummary: String(requestSummary).slice(0, 1000), requestedAt: nowIso() }
  logEvent(run, {
    type: 'harness_approval_required',
    nodeId,
    status: 'awaiting_harness_approval',
    detail: 'Harness approval is waiting for the operator. The engine did not approve it.',
  })
  return persistRun(run)
}

export function cancelRun(runId) {
  const run = getRun(runId)
  if (!run) throw new Error(`Run ${runId} not found`)
  if (TERMINAL.has(run.status)) return run
  setState(run, 'cancelled')
  run.currentGate = null
  run.pendingHarnessApproval = null
  logEvent(run, { type: 'run_cancelled', status: 'cancelled', detail: 'Run cancelled by the operator.' })
  run.finishedAt = nowIso()
  return persistRun(run)
}
