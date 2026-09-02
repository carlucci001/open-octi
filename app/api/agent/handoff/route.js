// Orca handoff API — agent-to-agent delegation of LLM-only work.
// POST {action:'start', fromAgentId, task, context?, complexity?, outputFormat?} -> { runId }
// GET  ?runId=...  -> run status/result      GET (no runId) -> recent runs
import { NextResponse } from 'next/server'
import { requireCrmRead, requireCrmWrite } from '@/lib/permissions'
import { createRun, executeRun, getRun, loadRuns, publicRun, ensureOrcaAgent, getHandoffSettings, setAgentEnabled, setMode, isAgentEnabled, paidFallbackEnabled, ORCA_AGENT_ID } from '@/lib/orca-handoff'
import { availableProviderSummary } from '@/lib/ai-lab'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const inflight = new Map()

async function waitFor(runId, ms) {
  const deadline = Date.now() + ms
  while (Date.now() < deadline) {
    const r = getRun(runId)
    if (r && (r.status === 'done' || r.status === 'failed')) return r
    await new Promise(res => setTimeout(res, 1000))
  }
  return getRun(runId)
}

export async function GET(request) {
  const { error } = await requireCrmRead(request)
  if (error) return error
  const { searchParams } = new URL(request.url)
  const runId = searchParams.get('runId')
  if (runId) {
    const r = getRun(runId)
    if (!r) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
    return NextResponse.json({ ok: true, run: publicRun(r) })
  }
  const limit = Math.min(100, Number(searchParams.get('limit') || 20))
  const orcaConfigured = availableProviderSummary().some(provider => provider.id === 'orcarouter' && provider.configured)
  return NextResponse.json({ ok: true, agent: ORCA_AGENT_ID, settings: getHandoffSettings(), paidFallback: paidFallbackEnabled(), orcaConfigured, runs: loadRuns().slice(0, limit).map(publicRun) })
}

export async function POST(request) {
  const { error } = await requireCrmWrite(request)
  if (error) return error
  let body
  try { body = await request.json() } catch { return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 }) }
  const action = body.action || 'start'

  if (action === 'set_mode') {
    try { return NextResponse.json({ ok: true, settings: setMode(body.mode) }) }
    catch (e) { return NextResponse.json({ ok: false, error: e.message }, { status: 400 }) }
  }

  if (action === 'set_agent_enabled') {
    if (!body.agentId) return NextResponse.json({ ok: false, error: 'agentId required' }, { status: 400 })
    const settings = setAgentEnabled(body.agentId, body.enabled !== false)
    return NextResponse.json({ ok: true, settings })
  }

  if (action === 'start') {
    if (!String(body.task || '').trim()) return NextResponse.json({ ok: false, error: 'task is required' }, { status: 400 })
    if (body.enforceSwitch && !isAgentEnabled(body.fromAgentId)) {
      return NextResponse.json({ ok: false, error: `handoff to Orca is switched off for agent ${body.fromAgentId || '(unknown)'}` }, { status: 403 })
    }
    const complexity = ['light', 'standard', 'heavy'].includes(body.complexity) ? body.complexity : null
    try { ensureOrcaAgent() } catch (e) { console.warn('[orca] ensureOrcaAgent failed:', e.message) }
    const run = createRun({ ...body, complexity })
    const p = executeRun(run.id).catch(e => console.error('[orca] run failed', run.id, e)).finally(() => inflight.delete(run.id))
    inflight.set(run.id, p)
    // Optional synchronous wait (tool callers that can't poll): wait=<seconds>, max 120.
    const wait = Math.min(120, Number(body.wait || 0))
    if (wait > 0) {
      const r = await waitFor(run.id, wait * 1000)
      return NextResponse.json({ ok: true, runId: run.id, run: publicRun(r) })
    }
    return NextResponse.json({ ok: true, runId: run.id, status: run.status })
  }

  return NextResponse.json({ ok: false, error: `unknown action ${action}` }, { status: 400 })
}
