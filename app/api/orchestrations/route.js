import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { readData, writeData } from '@/lib/dataStore'
import { requireCrmRead, requireCrmWrite } from '@/lib/permissions'
import { readOpenclawAgents } from '@/lib/openclaw-config'
import { createRun as createOrcaRun, executeRun as executeOrcaRun } from '@/lib/orca-handoff'
import { advanceRun, answerGate, cancelRun, getRun, listRuns, startRun } from '@/lib/orchestration-engine'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const FILE = 'orchestrations.json'
const ACTION_KINDS = new Set(['agent', 'tasks', 'document', 'api_call', 'mcp_call'])
// The seed flow is read at runtime, never bundled: `data/` is user data (and is excluded from the
// Docker build context), so a static import would bake a data file into the build and fail in the image.
function loadSeedFlow() {
  for (const dir of ['data', 'data-demo']) {
    try {
      const raw = fs.readFileSync(path.join(process.cwd(), dir, 'orchestrations.json'), 'utf8')
      const parsed = JSON.parse(raw)
      const first = Array.isArray(parsed?.orchestrations) ? parsed.orchestrations[0] : null
      if (first) return first
    } catch {}
  }
  return null
}
const SEED_FLOW = loadSeedFlow()

function deepCopy(value) {
  return JSON.parse(JSON.stringify(value))
}

function genId(prefix = 'orc') {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}

function slugify(value) {
  return String(value || 'flow')
    .toLowerCase()
    .trim()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'flow'
}

function uniqueSlug(data, preferred, excludeId = null) {
  const base = slugify(preferred)
  const used = new Set(data.orchestrations.filter(flow => flow.id !== excludeId).map(flow => flow.slug).filter(Boolean))
  if (!used.has(base)) return base
  let suffix = 2
  while (used.has(`${base}-${suffix}`)) suffix += 1
  return `${base}-${suffix}`
}

function save(data) {
  data.lastUpdated = new Date().toISOString()
  writeData(FILE, data)
}

function load() {
  const wrap = readData(FILE) || { orchestrations: [], lastUpdated: null }
  const data = Array.isArray(wrap) ? { orchestrations: wrap, lastUpdated: null } : wrap
  data.orchestrations = Array.isArray(data.orchestrations) ? data.orchestrations : []
  if (SEED_FLOW && !data.orchestrations.some(flow => flow.id === SEED_FLOW.id || flow.slug === SEED_FLOW.slug)) {
    data.orchestrations.push(deepCopy(SEED_FLOW))
    save(data)
  }
  return data
}

function rawAgentMap() {
  const file = readData('agents.json') || { agents: {} }
  return file.agents || {}
}

// Pull the real roster so the designer never invents agents.
function agentRoster() {
  return Object.entries(rawAgentMap())
    .filter(([, agent]) => agent && !agent.disabled)
    .map(([id, agent]) => ({
      id,
      name: agent.name || id,
      role: agent.role || agent.title || agent.jobDescription || '',
      emoji: agent.emoji || '',
      runtimeProvider: agent.runtimeProvider || 'openclaw',
    }))
}

function agentMap() {
  return Object.fromEntries(agentRoster().map(agent => [agent.id, agent]))
}

function cleanCapture(capture) {
  const field = String(capture?.field || '').trim()
  if (!field) return null
  const prompt = String(capture?.prompt || '').trim()
  return { field, ...(prompt ? { prompt } : {}) }
}

function cleanStep(step, index) {
  const id = String(step?.id || `step_${index + 1}`).trim()
  const name = String(step?.name || '').trim()
  const next = step?.next === undefined || step?.next === null ? '' : step.next
  if (step?.type === 'gate') {
    return {
      id,
      type: 'gate',
      question: String(step.question || '').trim(),
      options: (Array.isArray(step.options) ? step.options : [])
        .map(option => ({
          label: String(option?.label || '').trim(),
          next: option?.next ?? '',
          capture: cleanCapture(option?.capture),
        }))
        .filter(option => option.label),
    }
  }

  const kind = ACTION_KINDS.has(step?.kind) ? step.kind : 'agent'
  const requiredTools = Array.isArray(step?.requiredTools)
    ? [...new Set(step.requiredTools.map(tool => String(tool || '').trim()).filter(Boolean))]
    : []
  const headers = step?.headers && typeof step.headers === 'object' && !Array.isArray(step.headers)
    ? Object.fromEntries(Object.entries(step.headers).map(([key, value]) => [String(key), String(value)]))
    : {}
  return {
    id,
    type: 'action',
    kind,
    name,
    agentId: String(step?.agentId || '').trim(),
    instruction: String(step?.instruction || '').trim(),
    ...(next !== '' ? { next } : {}),
    ...(step?.method ? { method: String(step.method).toUpperCase() } : {}),
    ...(step?.url ? { url: String(step.url).trim() } : {}),
    ...(Object.keys(headers).length ? { headers } : {}),
    ...(step?.bodyTemplate ? { bodyTemplate: String(step.bodyTemplate) } : {}),
    ...(step?.credRef ? { credRef: String(step.credRef).trim() } : {}),
    ...(step?.captureAs ? { captureAs: String(step.captureAs).trim() } : {}),
    ...(step?.mcpTool ? { mcpTool: String(step.mcpTool).trim() } : {}),
    ...(step?.tool ? { tool: String(step.tool).trim() } : {}),
    ...(step?.footerNote ? { footerNote: String(step.footerNote).trim() } : {}),
    ...(requiredTools.length ? { requiredTools } : {}),
  }
}

function cleanFlow(input = {}) {
  const nodes = Array.isArray(input.nodes)
    ? [...new Set(input.nodes.map(id => String(id || '').trim()).filter(Boolean))]
    : []
  const nodeSet = new Set(nodes)
  const edges = Array.isArray(input.edges)
    ? input.edges
      .map(edge => ({
        from: String(edge?.from || '').trim(),
        to: String(edge?.to || '').trim(),
        when: String(edge?.when || '').trim(),
        ...(edge?.condition && typeof edge.condition === 'object' ? { condition: deepCopy(edge.condition) } : {}),
      }))
      .filter(edge => edge.from && edge.to && nodeSet.has(edge.from) && nodeSet.has(edge.to))
    : []
  const steps = Array.isArray(input.steps)
    ? input.steps.filter(step => step && (step.type === 'gate' || step.type === 'action')).map(cleanStep)
    : []
  const inputs = Array.isArray(input.inputs)
    ? input.inputs.map(item => ({
      id: String(item?.id || '').trim(),
      label: String(item?.label || item?.id || '').trim(),
      required: Boolean(item?.required),
    })).filter(item => item.id)
    : []

  return {
    name: String(input.name || 'Untitled flow').trim() || 'Untitled flow',
    description: String(input.description || '').trim(),
    inputs,
    enabled: Boolean(input.enabled),
    entryAgentId: String(input.entryAgentId || '').trim(),
    nodes,
    edges,
    steps,
    allowedHosts: Array.isArray(input.allowedHosts) ? input.allowedHosts.map(host => String(host).trim()).filter(Boolean) : [],
    tags: Array.isArray(input.tags) ? [...new Set(input.tags.map(tag => String(tag).trim()).filter(Boolean))] : [],
    clonedFrom: input.clonedFrom || null,
    status: input.status || 'ready',
  }
}

function validateRunnable(flow, agentsById) {
  const errors = []
  const warnings = []
  const steps = Array.isArray(flow.steps) ? flow.steps : []
  const stepIds = new Set(steps.map(step => step.id))
  if (!flow.name?.trim()) errors.push('Flow name is required')
  if (!steps.length) {
    if (!flow.entryAgentId) errors.push('Entry agent is required')
    if (!flow.nodes?.length) errors.push('At least one agent node is required')
  }
  if (flow.entryAgentId && flow.nodes?.length && !flow.nodes.includes(flow.entryAgentId)) errors.push('Entry agent must be in this flow')

  for (const step of steps) {
    if (step.type === 'gate') {
      if (!step.question) errors.push(`Gate ${step.id} needs a question`)
      if (!(step.options || []).length) errors.push(`Gate “${step.question || step.id}” has no answer options`)
      for (const option of step.options || []) {
        if (option.next && option.next !== 'end' && !stepIds.has(option.next)) errors.push(`Gate ${step.id} points to missing step ${option.next}`)
      }
    }
    if (step.type === 'action') {
      if (!ACTION_KINDS.has(step.kind)) errors.push(`Step ${step.id} has unknown action kind ${step.kind}`)
      if (step.next && step.next !== 'end' && !stepIds.has(step.next)) errors.push(`Action ${step.id} points to missing step ${step.next}`)
      if (['agent', 'document', 'mcp_call'].includes(step.kind)) {
        if (!step.agentId) warnings.push(`Step “${step.name || step.id}” has no assigned agent`)
        else if (!agentsById[step.agentId]) errors.push(`Step “${step.name || step.id}” points at agent ${step.agentId}, not in the live roster`)
      }
    }
  }

  for (const nodeId of flow.nodes || []) {
    if (!agentsById[nodeId]) errors.push(`Agent ${nodeId} is not in the live roster`)
  }
  for (const edge of flow.edges || []) {
    if (!flow.nodes.includes(edge.from)) errors.push(`Handoff source ${edge.from} is not in this flow`)
    if (!flow.nodes.includes(edge.to)) errors.push(`Handoff target ${edge.to} is not in this flow`)
  }
  return { errors, warnings }
}

function requiredToolsFor(flow, agentId) {
  const tools = []
  for (const step of flow.steps || []) {
    if (step.agentId !== agentId) continue
    tools.push(...(step.requiredTools || []))
    if (step.kind === 'mcp_call' && (step.mcpTool || step.tool)) tools.push(step.mcpTool || step.tool)
  }
  return [...new Set(tools.filter(Boolean))]
}

function configToolAllowlist(agentConfig, defaults = {}) {
  const values = []
  for (const source of [defaults?.tools, agentConfig?.tools]) {
    if (Array.isArray(source)) values.push(...source)
    if (Array.isArray(source?.allow)) values.push(...source.allow)
    if (Array.isArray(source?.alsoAllow)) values.push(...source.alsoAllow)
  }
  return [...new Set(values.map(value => String(value)))]
}

async function validateTargetHarness(flow, targetAgentId) {
  const errors = []
  const warnings = []
  const rosterAgent = rawAgentMap()[targetAgentId]
  if (!rosterAgent || rosterAgent.disabled) errors.push(`Target agent ${targetAgentId} is disabled or missing from the CRM roster`)

  // Windows development normally makes lib/openclaw-config fall back to SSH.
  // Entry H Phase 1 is deliberately no-SSH: validate the target's saved CRM
  // configuration locally and leave the live OpenClaw check to Linux, where
  // the same reader uses the host-local config file. Nothing mutates config.
  if (process.platform === 'win32') {
    const requiredTools = requiredToolsFor(flow, targetAgentId)
    const allowedTools = configToolAllowlist(rosterAgent || {}, {})
    for (const tool of requiredTools) {
      if (!allowedTools.includes(tool) && !allowedTools.includes('*')) warnings.push(`Target agent ${targetAgentId} is missing required tool ${tool}`)
    }
    if (requiredTools.length && !allowedTools.length) warnings.push(`Target agent ${targetAgentId} has no explicit tool allowlist in its local CRM config`)
    return {
      errors,
      warnings,
      harness: {
        checkedAgentId: targetAgentId,
        configFound: Boolean(rosterAgent),
        configRead: Boolean(rosterAgent),
        configSource: 'crm-roster-no-ssh',
        disabled: !rosterAgent || rosterAgent.disabled === true || rosterAgent.enabled === false,
        requiredTools,
        missingTools: requiredTools.filter(tool => !allowedTools.includes(tool) && !allowedTools.includes('*')),
      },
    }
  }

  let config
  try {
    config = await readOpenclawAgents()
  } catch (error) {
    warnings.push(`Could not read the target agent harness config: ${error.message}`)
    return { errors, warnings, harness: { checkedAgentId: targetAgentId, configFound: false, configRead: false } }
  }

  const target = (config.list || []).find(agent => agent?.id === targetAgentId)
  if (!target) {
    warnings.push(`Target agent ${targetAgentId} is not present in openclaw.json; verify its runtime config before Phase 2 execution`)
    return { errors, warnings, harness: { checkedAgentId: targetAgentId, configFound: false, configRead: true } }
  }
  if (target.disabled === true || target.enabled === false) errors.push(`Target agent ${targetAgentId} is disabled in its harness config`)

  const requiredTools = requiredToolsFor(flow, targetAgentId)
  const allowedTools = configToolAllowlist(target, config.defaults)
  for (const tool of requiredTools) {
    if (!allowedTools.includes(tool) && !allowedTools.includes('*')) warnings.push(`Target agent ${targetAgentId} is missing required tool ${tool}`)
  }
  if (requiredTools.length && !allowedTools.length) warnings.push(`Target agent ${targetAgentId} has no explicit tool allowlist in its harness config`)
  return {
    errors,
    warnings,
    harness: {
      checkedAgentId: targetAgentId,
      configFound: true,
      configRead: true,
      disabled: target.disabled === true || target.enabled === false,
      requiredTools,
      missingTools: requiredTools.filter(tool => !allowedTools.includes(tool) && !allowedTools.includes('*')),
    },
  }
}

function reassignCopy(source, fromAgentId, toAgentId) {
  const flow = deepCopy(source)
  let moved = 0
  flow.nodes = (flow.nodes || []).map(nodeId => {
    if (nodeId !== fromAgentId) return nodeId
    moved += 1
    return toAgentId
  })
  flow.nodes = [...new Set(flow.nodes)]
  flow.edges = (flow.edges || []).map(edge => ({
    ...edge,
    from: edge.from === fromAgentId ? toAgentId : edge.from,
    to: edge.to === fromAgentId ? toAgentId : edge.to,
  }))
  if (flow.entryAgentId === fromAgentId) {
    flow.entryAgentId = toAgentId
    moved += 1
  }
  flow.steps = (flow.steps || []).map(step => {
    if (step.agentId !== fromAgentId) return step
    moved += 1
    return { ...step, agentId: toAgentId }
  })
  return { flow, moved }
}

async function reassignValidation(flow, targetAgentId) {
  const runnable = validateRunnable(flow, agentMap())
  const harness = await validateTargetHarness(flow, targetAgentId)
  return {
    errors: [...runnable.errors, ...harness.errors],
    warnings: [...runnable.warnings, ...harness.warnings],
    harness: harness.harness,
  }
}

function flowOutline(flow) {
  return (flow.steps || []).map((step, index) => {
    if (step.type === 'gate') return `${index + 1}. Ask: ${step.question}. Options: ${(step.options || []).map(option => option.label).join(', ')}.`
    return `${index + 1}. ${step.kind} capability: ${step.name || step.instruction || step.id} (Phase 1 records this as deferred).`
  }).join('\n')
}

function fallbackSummary(flow) {
  const gates = (flow.steps || []).filter(step => step.type === 'gate').length
  const actions = (flow.steps || []).filter(step => step.type === 'action').length
  if (flow.steps?.length) return `This flow asks ${gates} operator question${gates === 1 ? '' : 's'} and records ${actions} action${actions === 1 ? '' : 's'} that Phase 2 would perform.`
  return flow.description || `This flow validates handoffs across ${(flow.nodes || []).length} agent${flow.nodes?.length === 1 ? '' : 's'}.`
}

async function summarizeFlow(flow) {
  const generatedAt = new Date().toISOString()
  try {
    const summaryRun = createOrcaRun({
      fromAgentId: 'orchestration-designer',
      task: 'Write one plain-English sentence describing what this saved flow can do. Use present/future tense. Do not claim any action already happened. Mention that Phase 1 action nodes are deferred when relevant.',
      context: `Flow name: ${flow.name}\nDescription: ${flow.description || '(none)'}\n${flowOutline(flow)}`,
      complexity: 'light',
      outputFormat: 'text',
      maxTokens: 180,
    })
    const result = await executeOrcaRun(summaryRun.id)
    if (result?.status === 'done' && String(result.result || '').trim()) {
      return {
        text: String(result.result).trim().slice(0, 800),
        flowVersion: flow.version,
        source: 'orca',
        complexity: 'light',
        generatedAt,
        runId: summaryRun.id,
      }
    }
  } catch {}
  return {
    text: fallbackSummary(flow),
    flowVersion: flow.version,
    source: 'deterministic-fallback',
    complexity: 'light',
    generatedAt,
  }
}

function buildValidation(orchestration, options = {}) {
  const agentsById = agentMap()
  const { errors, warnings } = validateRunnable(orchestration, agentsById)
  if (errors.length) {
    const error = new Error(errors.join('; '))
    error.status = 400
    throw error
  }
  const startedAt = new Date().toISOString()
  if ((orchestration.steps || []).length && !(orchestration.nodes || []).length) {
    const gates = orchestration.steps.filter(step => step.type === 'gate').length
    const actions = orchestration.steps.filter(step => step.type === 'action').length
    return {
      id: genId('oval'),
      mode: 'static-validation',
      executed: false,
      note: 'Static validation of the interview nodes. No agents were invoked.',
      status: warnings.length ? 'valid_with_warnings' : 'valid',
      warnings,
      startedAt,
      finishedAt: new Date().toISOString(),
      summary: `${orchestration.steps.length} nodes valid (${gates} gate${gates === 1 ? '' : 's'}, ${actions} action${actions === 1 ? '' : 's'}). No agents were invoked.`,
      metrics: { steps: orchestration.steps.length, gates, actions },
      input: options.input ? String(options.input).slice(0, 500) : '',
      events: orchestration.steps.map(step => ({
        type: 'node',
        status: 'valid',
        detail: step.type === 'gate' ? `Gate: ${step.question}` : `Action (${step.kind}): ${step.name || step.id}`,
        at: startedAt,
      })),
    }
  }

  const reached = new Set([orchestration.entryAgentId])
  const events = [{
    type: 'entry',
    status: 'entry_point',
    agentId: orchestration.entryAgentId,
    agentName: agentsById[orchestration.entryAgentId]?.name || orchestration.entryAgentId,
    detail: options.input ? `Entry point for: ${String(options.input).slice(0, 180)}` : 'Entry point — this agent would take the first message.',
    at: startedAt,
  }]
  const remaining = [...(orchestration.edges || [])]
  let progressed = true
  while (remaining.length && progressed) {
    progressed = false
    for (let index = 0; index < remaining.length; index += 1) {
      const edge = remaining[index]
      if (!reached.has(edge.from)) continue
      reached.add(edge.to)
      events.push({
        type: 'handoff',
        status: 'resolves',
        from: edge.from,
        fromName: agentsById[edge.from]?.name || edge.from,
        to: edge.to,
        toName: agentsById[edge.to]?.name || edge.to,
        when: edge.when || 'manual handoff rule',
        detail: `${agentsById[edge.from]?.name || edge.from} would hand off to ${agentsById[edge.to]?.name || edge.to}.`,
        at: new Date().toISOString(),
      })
      remaining.splice(index, 1)
      index -= 1
      progressed = true
    }
  }
  const unreached = (orchestration.nodes || []).filter(nodeId => !reached.has(nodeId))
  for (const nodeId of unreached) {
    events.push({ type: 'not_reached', status: 'unreachable', agentId: nodeId, agentName: agentsById[nodeId]?.name || nodeId, detail: 'Unreachable — no handoff path leads to this agent from the entry point.', at: new Date().toISOString() })
  }
  const handoffsResolved = events.filter(event => event.type === 'handoff').length
  return {
    id: genId('oval'),
    mode: 'static-validation',
    executed: false,
    note: 'Static validation of the flow graph. No agents were invoked.',
    status: unreached.length || warnings.length ? 'valid_with_gaps' : 'valid',
    warnings,
    startedAt,
    finishedAt: new Date().toISOString(),
    summary: `${reached.size}/${orchestration.nodes.length} agents reachable, ${handoffsResolved} handoff${handoffsResolved === 1 ? '' : 's'} resolve. No agents were invoked.`,
    metrics: { agentsInFlow: orchestration.nodes.length, agentsReachable: reached.size, handoffsResolved, unreachedAgents: unreached.length },
    input: options.input ? String(options.input).slice(0, 500) : '',
    events,
  }
}

export async function GET(request) {
  const { error } = await requireCrmRead(request)
  if (error) return error
  return NextResponse.json({ ...load(), agents: agentRoster() })
}

export async function POST(request) {
  const { error } = await requireCrmWrite(request)
  if (error) return error
  try {
    const body = await request.json()
    const data = load()

    if (body.action === 'create') {
      const clean = cleanFlow(body)
      const now = new Date().toISOString()
      const flow = {
        id: genId(),
        slug: uniqueSlug(data, body.slug || clean.name),
        ...clean,
        version: 1,
        runCount: 0,
        lastRunAt: null,
        latestRun: null,
        validationCount: 0,
        latestValidation: null,
        validationHistory: [],
        createdAt: now,
        updatedAt: now,
      }
      flow.whatThisFlowDoes = await summarizeFlow(flow)
      data.orchestrations.push(flow)
      save(data)
      return NextResponse.json({ ok: true, orchestration: flow })
    }

    if (body.action === 'update') {
      const index = data.orchestrations.findIndex(flow => flow.id === body.id)
      if (index < 0) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
      const existing = data.orchestrations[index]
      const clean = cleanFlow({ ...existing, ...(body.patch || {}) })
      const updated = {
        ...existing,
        ...clean,
        slug: uniqueSlug(data, body.patch?.slug || existing.slug || clean.name, existing.id),
        version: Number(existing.version || 0) + 1,
        updatedAt: new Date().toISOString(),
      }
      updated.whatThisFlowDoes = await summarizeFlow(updated)
      data.orchestrations[index] = updated
      save(data)
      return NextResponse.json({ ok: true, orchestration: updated })
    }

    // Back compatibility: old clients still send action:'run'. It remains
    // static validation and never creates an orchestration run.
    if (body.action === 'validate' || body.action === 'run') {
      const index = data.orchestrations.findIndex(flow => flow.id === body.id)
      if (index < 0) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
      const validation = buildValidation(data.orchestrations[index], { input: body.input })
      data.orchestrations[index] = {
        ...data.orchestrations[index],
        validationCount: (data.orchestrations[index].validationCount || 0) + 1,
        lastValidatedAt: validation.finishedAt,
        latestValidation: validation,
        validationHistory: [validation, ...(data.orchestrations[index].validationHistory || [])].slice(0, 25),
        updatedAt: new Date().toISOString(),
      }
      save(data)
      return NextResponse.json({ ok: true, orchestration: data.orchestrations[index], validation })
    }

    if (body.action === 'clone') {
      const source = data.orchestrations.find(flow => flow.id === body.id)
      if (!source) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
      const now = new Date().toISOString()
      const clone = deepCopy(source)
      clone.id = genId()
      clone.slug = uniqueSlug(data, `${source.slug || slugify(source.name)}-copy`)
      clone.name = `${source.name} (copy)`
      clone.enabled = false
      clone.clonedFrom = source.id
      clone.version = 1
      clone.runCount = 0
      clone.lastRunAt = null
      clone.latestRun = null
      clone.validationCount = 0
      clone.lastValidatedAt = null
      clone.latestValidation = null
      clone.validationHistory = []
      clone.createdAt = now
      clone.updatedAt = now
      clone.whatThisFlowDoes = {
        ...(source.whatThisFlowDoes || { text: fallbackSummary(source) }),
        flowVersion: 1,
        source: 'clone-cache',
        complexity: 'light',
        generatedAt: now,
      }
      data.orchestrations.push(clone)
      save(data)
      return NextResponse.json({ ok: true, orchestration: clone })
    }

    if (body.action === 'reassign_preview' || body.action === 'reassign') {
      const index = data.orchestrations.findIndex(flow => flow.id === body.id)
      if (index < 0) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
      const fromAgentId = String(body.fromAgentId || '')
      const toAgentId = String(body.toAgentId || '')
      if (!fromAgentId || !toAgentId) return NextResponse.json({ ok: false, error: 'fromAgentId and toAgentId required' }, { status: 400 })
      if (fromAgentId === toAgentId) return NextResponse.json({ ok: false, error: 'Choose a different target agent' }, { status: 400 })
      const { flow, moved } = reassignCopy(data.orchestrations[index], fromAgentId, toAgentId)
      if (!moved) return NextResponse.json({ ok: false, error: `No nodes are assigned to ${fromAgentId}` }, { status: 400 })
      const validation = await reassignValidation(flow, toAgentId)
      if (validation.errors.length) return NextResponse.json({ ok: false, error: validation.errors.join('; '), validation, moved }, { status: 400 })
      if (body.action === 'reassign_preview') {
        return NextResponse.json({ ok: true, preview: true, moved, validation, orchestration: flow })
      }
      flow.version = Number(flow.version || 0) + 1
      flow.updatedAt = new Date().toISOString()
      flow.whatThisFlowDoes = await summarizeFlow(flow)
      data.orchestrations[index] = flow
      save(data)
      return NextResponse.json({ ok: true, preview: false, moved, validation, orchestration: flow })
    }

    if (body.action === 'import') {
      if (!body.flow || typeof body.flow !== 'object' || Array.isArray(body.flow)) return NextResponse.json({ ok: false, error: 'Import must contain one JSON flow object' }, { status: 400 })
      const clean = cleanFlow({ ...body.flow, enabled: false, clonedFrom: body.flow.clonedFrom || body.flow.id || null })
      const now = new Date().toISOString()
      const flow = {
        id: genId(),
        slug: uniqueSlug(data, clean.name),
        ...clean,
        enabled: false,
        version: 1,
        runCount: 0,
        lastRunAt: null,
        latestRun: null,
        validationCount: 0,
        latestValidation: null,
        validationHistory: [],
        createdAt: now,
        updatedAt: now,
      }
      flow.whatThisFlowDoes = await summarizeFlow(flow)
      data.orchestrations.push(flow)
      save(data)
      return NextResponse.json({ ok: true, orchestration: flow })
    }

    if (body.action === 'start') {
      const index = data.orchestrations.findIndex(flow => flow.id === body.id)
      if (index < 0) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
      const flow = data.orchestrations[index]
      const validation = validateRunnable(flow, agentMap())
      if (validation.errors.length) {
        const startError = new Error(validation.errors.join('; '))
        startError.status = 400
        throw startError
      }
      const pending = startRun(flow, { input: body.input || '', startedBy: 'operator' })
      const run = await advanceRun(pending.id, flow)
      data.orchestrations[index] = {
        ...flow,
        runCount: (flow.runCount || 0) + 1,
        lastRunAt: pending.createdAt,
        latestRun: { id: run.id, status: run.status, state: run.state, startedAt: run.createdAt, finishedAt: run.finishedAt },
        updatedAt: new Date().toISOString(),
      }
      save(data)
      return NextResponse.json({ ok: true, runId: run.id, run })
    }

    if (body.action === 'answer') {
      const existingRun = getRun(body.runId)
      if (!existingRun) return NextResponse.json({ ok: false, error: 'run not found' }, { status: 404 })
      const flow = data.orchestrations.find(candidate => candidate.id === existingRun.flowId)
      if (!flow) return NextResponse.json({ ok: false, error: 'flow no longer exists' }, { status: 404 })
      const run = await answerGate(body.runId, flow, { gateId: body.gateId, choice: body.choice, capturedValue: body.capturedValue })
      const index = data.orchestrations.findIndex(candidate => candidate.id === flow.id)
      data.orchestrations[index] = {
        ...data.orchestrations[index],
        latestRun: { id: run.id, status: run.status, state: run.state, startedAt: run.createdAt, finishedAt: run.finishedAt },
        updatedAt: new Date().toISOString(),
      }
      save(data)
      return NextResponse.json({ ok: true, runId: run.id, run })
    }

    if (body.action === 'status' || body.action === 'run_status') {
      const run = getRun(body.runId)
      if (!run) return NextResponse.json({ ok: false, error: 'run not found' }, { status: 404 })
      return NextResponse.json({ ok: true, runId: run.id, run })
    }

    if (body.action === 'runs') return NextResponse.json({ ok: true, runs: listRuns(body.flowId || null).slice(0, 25) })

    if (body.action === 'cancel' || body.action === 'cancel_run') {
      const run = cancelRun(body.runId)
      return NextResponse.json({ ok: true, runId: run.id, run })
    }

    if (body.action === 'delete') {
      data.orchestrations = data.orchestrations.filter(flow => flow.id !== body.id)
      save(data)
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ ok: false, error: 'unknown action' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: error.status || 500 })
  }
}
