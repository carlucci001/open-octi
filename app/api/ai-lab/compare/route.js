import { NextResponse } from 'next/server'
import { requireCapability } from '@/lib/permissions'
import { readData, writeData } from '@/lib/dataStore'
import { logAuditEvent } from '@/lib/auditLog'
import { AI_LAB_PRESETS, availableProviderSummary, labCatalog, labPlanningCatalog, runModelComparison, summarizeLabRuns } from '@/lib/ai-lab'
import { listBenchEntries, mutateBenchState, normalizeBenchState } from '@/lib/ai-lab-bench'
import { listAgents } from '@/lib/agents-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const RUNS_FILE = 'ai-lab-runs.json'
const BENCH_FILE = 'ai-lab-bench.json'
const MAX_RUNS = 50

function readRuns() {
  const data = readData(RUNS_FILE)
  return Array.isArray(data?.runs) ? data.runs : []
}

function saveRun(run) {
  const runs = [run, ...readRuns()].slice(0, MAX_RUNS)
  writeData(RUNS_FILE, { runs, lastUpdated: new Date().toISOString() })
  return runs
}

function readBenchState() {
  return normalizeBenchState(readData(BENCH_FILE))
}

function benchPayload() {
  const models = labCatalog()
  return {
    models,
    benchEntries: listBenchEntries(models, readBenchState()),
  }
}

async function resolveLabAgent(agentId) {
  const id = String(agentId || '').trim()
  if (!id) return null
  try {
    const data = await listAgents()
    const agent = Array.isArray(data?.agents) ? data.agents.find(item => item.id === id) : null
    if (!agent) return { id, name: id }
    return {
      id: agent.id,
      name: agent.name || agent.id,
      role: agent.role || agent.title || agent.category || '',
      description: agent.description || '',
      jobDescription: agent.jobDescription || '',
      brain: agent.brain || null,
      tools: Array.isArray(agent.tools) ? agent.tools.slice(0, 24) : [],
      channels: Array.isArray(agent.channels) ? agent.channels.slice(0, 12) : [],
    }
  } catch {
    return { id, name: id }
  }
}

export async function GET(request) {
  const { error } = await requireCapability(request, 'system:manage')
  if (error) return error
  const runs = readRuns()
  const bench = benchPayload()
  return NextResponse.json({
    ok: true,
    presets: AI_LAB_PRESETS,
    providers: availableProviderSummary(),
    models: bench.models,
    benchEntries: bench.benchEntries,
    planning: labPlanningCatalog(),
    instrumentation: summarizeLabRuns(runs),
    runs: runs.slice(0, 12),
    apify: {
      status: 'planned',
      description: 'Apify will provide research/context packets that can be replayed through the same model comparison harness.',
    },
  })
}

export async function POST(request) {
  const { user, error } = await requireCapability(request, 'system:manage')
  if (error) return error
  const body = await request.json().catch(() => ({}))

  try {
    if (String(body.action || '').startsWith('bench-')) {
      const action = String(body.action).slice('bench-'.length)
      const models = labCatalog()
      const state = mutateBenchState(readBenchState(), models, action, body.entry || {})
      writeData(BENCH_FILE, { ...state, lastUpdated: new Date().toISOString() })
      logAuditEvent({
        request,
        user,
        action: `ai_lab_bench_${action}`,
        area: 'ai-lab',
        severity: action === 'delete' ? 'warn' : 'info',
        targetId: String(body.entry?.id || body.entry?.modelId || ''),
        meta: { modelId: String(body.entry?.modelId || '') },
      })
      return NextResponse.json({ ok: true, benchEntries: listBenchEntries(models, state) })
    }
    const agent = await resolveLabAgent(body.agentId)
    const run = await runModelComparison({
      modelIds: body.modelIds,
      prompt: String(body.prompt || '').slice(0, 12000),
      context: String(body.context || '').slice(0, 24000),
      presetId: String(body.presetId || '').slice(0, 80),
      useCaseId: String(body.useCaseId || '').slice(0, 80),
      budgetId: String(body.budgetId || '').slice(0, 80),
      clientBudgetMonthly: Number(body.clientBudgetMonthly || 0),
      agent,
    })
    const runs = saveRun(run)
    logAuditEvent({
      request,
      user,
      action: 'ai_lab_compare_run',
      area: 'ai-lab',
      severity: run.summary.failed ? 'warn' : 'info',
      targetId: run.id,
      meta: {
        modelIds: run.modelIds,
        successful: run.summary.successful,
        failed: run.summary.failed,
        totalEstimatedUsd: run.summary.totalEstimatedUsd,
        agentId: run.agent?.id || '',
      },
    })
    return NextResponse.json({ ok: true, run, runs: runs.slice(0, 12), instrumentation: summarizeLabRuns(runs) })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || String(e) }, { status: 400 })
  }
}
