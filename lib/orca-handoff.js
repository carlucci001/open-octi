// Orca — the catch-all handoff agent.
// Other agents delegate LLM-only work (reports, drafts, summaries, analysis)
// here. Orca grades complexity and runs the job on OrcaRouter, free tier first.
// Provider plumbing lives in lib/ai-lab.js (vault key `orcarouter`, headers).
import { readData, writeData } from './dataStore'
import { runAiModel } from './ai-lab'

export const ORCA_AGENT_ID = 'orca'
export const HANDOFF_FILE = 'agent-handoffs.json'
export const MAX_RUNS = 500

export const TIER_MODELS = {
  free: 'orcarouter/orcarouter/free',
  cheap: 'orcarouter/orcarouter/auto',
  quality: 'orcarouter/orcarouter/fcc-quality', // named router (dashboard); falls back to auto
}

export const ORCA_SYSTEM_PROMPT = `You are Orca, the handoff agent on the Command Center team. Other agents delegate work to you: reports, drafts, summaries, analysis, rewrites, structured extraction.
Rules:
- Return the finished deliverable only. No preamble, no chatter, no questions back.
- Client-facing text says "Command Center" — never "Farrington".
- Never invent CRM facts. Use only the context you were given; if something is missing, say so in one line at the end under "Gaps:".
- Match the requested output format exactly (markdown, json, or plain text).`

export function paidFallbackEnabled(env = process.env) {
  return String(env.ORCA_PAID_FALLBACK || '').toLowerCase() === 'true'
}

export function tiersFor(complexity, { paid = paidFallbackEnabled() } = {}) {
  const c = String(complexity || 'standard').toLowerCase()
  if (c === 'light') return ['free']
  if (c === 'heavy') return paid ? ['cheap', 'quality'] : ['free']
  return paid ? ['free', 'cheap'] : ['free']
}

export function classifyError(err) {
  const msg = String(err?.message || err || '')
  if (/429/.test(msg) && /retry-after/i.test(msg)) return 'rate_limited'
  if (/429/.test(msg)) return 'free_cap'
  if (/404|unknown model|not found/i.test(msg)) return 'no_model'
  if (/401|403|api key|credential/i.test(msg)) return 'auth'
  return 'error'
}

function buildPrompt({ task, context, outputFormat }) {
  const fmt = outputFormat || 'markdown'
  return `${task}\n\nOutput format: ${fmt}.`
}

// Per-agent switch: which agents may hand work to Orca. Office agents on,
// phone/demo agents off. Toggle from the Orca panel (Agents page) or the API.
export const DEFAULT_ENABLED_AGENTS = ['main', 'coding', 'ContentStudio-promoter', 'social-media', 'legal', 'communications', 'finance-manager', 'quote-drafter', 'call-recap', 'follow-up-watchdog', 'matilda']

// Master switch: 'all' = every agent may hand off (try Orca everywhere),
// 'per-agent' = honor the per-agent list, 'off' = nobody hands off (agents work as before).
export const MODES = ['all', 'per-agent', 'off']

function loadFile() {
  const data = readData(HANDOFF_FILE) || {}
  return {
    runs: Array.isArray(data.runs) ? data.runs : [],
    settings: {
      mode: MODES.includes(data.settings?.mode) ? data.settings.mode : 'per-agent',
      enabledAgents: Array.isArray(data.settings?.enabledAgents) ? data.settings.enabledAgents : [...DEFAULT_ENABLED_AGENTS],
    },
  }
}

export function setMode(mode) {
  if (!MODES.includes(mode)) throw new Error(`mode must be one of ${MODES.join(', ')}`)
  const { runs, settings } = loadFile()
  const next = { ...settings, mode }
  writeData(HANDOFF_FILE, { lastUpdated: new Date().toISOString(), settings: next, runs })
  return next
}

export function loadRuns() {
  return loadFile().runs
}

function saveRuns(runs) {
  const { settings } = loadFile()
  writeData(HANDOFF_FILE, { lastUpdated: new Date().toISOString(), settings, runs: runs.slice(0, MAX_RUNS) })
}

export function getHandoffSettings() {
  return loadFile().settings
}

export function isAgentEnabled(agentId) {
  const id = String(agentId || '').toLowerCase()
  if (!id) return false
  const s = getHandoffSettings()
  if (s.mode === 'off') return false
  if (s.mode === 'all') return true
  return s.enabledAgents.includes(id)
}

export function setAgentEnabled(agentId, enabled) {
  const id = String(agentId || '').toLowerCase()
  if (!id) throw new Error('agentId required')
  const { runs, settings } = loadFile()
  const set = new Set(settings.enabledAgents)
  if (enabled) set.add(id); else set.delete(id)
  const next = { ...settings, enabledAgents: [...set] }
  writeData(HANDOFF_FILE, { lastUpdated: new Date().toISOString(), settings: next, runs })
  return next
}

export function getRun(id) {
  return loadRuns().find(r => r.id === id) || null
}

function patchRun(id, patch) {
  const runs = loadRuns()
  const i = runs.findIndex(r => r.id === id)
  if (i === -1) return null
  runs[i] = { ...runs[i], ...patch, updatedAt: new Date().toISOString() }
  saveRuns(runs)
  return runs[i]
}

export function createRun(input) {
  const now = new Date().toISOString()
  const run = {
    id: 'oh_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
    status: 'queued',
    fromAgentId: input.fromAgentId || 'unknown',
    clientId: input.clientId || input.accountId || null,
    productId: input.productId || null,
    requestId: input.requestId || null,
    task: String(input.task || '').slice(0, 20000),
    context: String(input.context || '').slice(0, 60000),
    complexity: input.complexity || null,
    outputFormat: input.outputFormat || 'markdown',
    maxTokens: Number(input.maxTokens) > 0 ? Math.min(16000, Number(input.maxTokens)) : 6000,
    tier: null,
    resolvedModel: null,
    router: null,
    attempts: [],
    result: null,
    error: null,
    downgraded: false,
    createdAt: now,
    updatedAt: now,
    startedAt: null,
    finishedAt: null,
  }
  const runs = loadRuns()
  runs.unshift(run)
  saveRuns(runs)
  return run
}

export function ensureOrcaAgent() {
  const data = readData('agents.json') || { agents: {} }
  if (!data.agents) data.agents = {}
  if (data.agents[ORCA_AGENT_ID]) return false
  data.agents[ORCA_AGENT_ID] = {
    name: 'Orca',
    title: 'Handoff Agent',
    emoji: '🐋',
    category: 'internal',
    role: 'Handoff agent — takes delegated reports, drafts, summaries and analysis from other agents and runs them on the cheapest model that can do the job (OrcaRouter, free tier first).',
    description: 'Agent-to-agent catch-all. Any teammate can hand Orca LLM-only work; Orca grades the complexity and routes it through OrcaRouter, logging which model actually answered.',
    tags: ['internal', 'handoff', 'orcarouter'],
    channels: [],
    schedule: { mode: 'on-demand' },
    runtimeProvider: 'orcarouter',
    draft: true,
    disabled: false,
    jobDescription: ORCA_SYSTEM_PROMPT,
    tenantId: 'farrington-development',
    syncedAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
  }
  data.lastUpdated = new Date().toISOString()
  writeData('agents.json', data)
  return true
}

// One tiny free-tier call to grade complexity when the caller didn't say.
export async function classifyComplexity(task, { run = runAiModel, usageContext = {} } = {}) {
  try {
    const r = await run({
      modelId: TIER_MODELS.free,
      prompt: `Grade the difficulty of this task for a language model. Reply with exactly one word: light, standard, or heavy.\n\nTask:\n${String(task).slice(0, 2000)}`,
      agent: { id: ORCA_AGENT_ID, name: 'Orca', jobDescription: ORCA_SYSTEM_PROMPT },
      usageContext: { ...usageContext, source: 'orca' },
    })
    const word = String(r?.text || '').toLowerCase().match(/light|standard|heavy/)?.[0]
    return word || 'standard'
  } catch {
    return 'standard'
  }
}

// Execute a run. `run` is injectable for tests.
export async function executeRun(runId, { run = runAiModel, paid = paidFallbackEnabled() } = {}) {
  const rec = getRun(runId)
  if (!rec) throw new Error(`handoff run ${runId} not found`)
  patchRun(runId, { status: 'running', startedAt: new Date().toISOString() })

  const usageContext = {
    agentId: rec.fromAgentId,
    clientId: rec.clientId,
    productId: rec.productId,
    requestId: rec.requestId,
    runId: rec.id,
    source: 'orca',
  }
  const complexity = rec.complexity || await classifyComplexity(rec.task, { run, usageContext })
  const tiers = tiersFor(complexity, { paid })
  const downgraded = String(complexity) === 'heavy' && !paid
  const prompt = buildPrompt(rec)
  const attempts = []

  for (const tier of tiers) {
    let modelId = TIER_MODELS[tier]
    for (let pass = 0; pass < 2; pass++) {
      try {
        const r = await run({ modelId, prompt, context: rec.context, maxTokens: rec.maxTokens || 6000, agent: { id: ORCA_AGENT_ID, name: 'Orca', jobDescription: ORCA_SYSTEM_PROMPT }, usageContext })
        const resolved = r?.route?.resolvedModel || r?.model || modelId
        attempts.push({ tier, modelId, ok: true, resolvedModel: resolved })
        return patchRun(runId, {
          status: 'done', complexity, tier, resolvedModel: resolved, router: r?.route?.router || null,
          usage: r?.usage || null, cost: r?.cost ?? null, latencyMs: r?.latencyMs ?? null,
          attempts, downgraded, result: r?.text || '', finishedAt: new Date().toISOString(),
        })
      } catch (e) {
        const reason = classifyError(e)
        attempts.push({ tier, modelId, ok: false, reason, message: String(e?.message || e).slice(0, 300) })
        if (reason === 'no_model' && tier === 'quality' && pass === 0) { modelId = TIER_MODELS.cheap; continue }
        if (reason === 'auth') return patchRun(runId, { status: 'failed', complexity, attempts, error: 'OrcaRouter credential problem', finishedAt: new Date().toISOString() })
        break // next tier (free never retries on free_cap — retrying unchanged fails forever)
      }
    }
  }
  const last = attempts[attempts.length - 1]
  return patchRun(runId, {
    status: 'failed', complexity, attempts, downgraded,
    error: last?.reason === 'free_cap' ? 'free_cap: prompt exceeds the free-tier cap and paid fallback is off' : (last?.message || 'no tier succeeded'),
    finishedAt: new Date().toISOString(),
  })
}

export function publicRun(r) {
  if (!r) return null
  const { context, ...rest } = r
  return rest
}
