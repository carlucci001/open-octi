import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { listAgents } from '@/lib/agents-store'
import { getCred } from '@/lib/agent-creds'
import { openclawChat } from '@/lib/openclaw-client'
import { deepSeekHarnessChat } from '@/lib/deepseek-harness-client'
import { isOwner } from '@/lib/roles'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const DEFAULT_HERMES_API_BASE = process.env.HERMES_API_BASE_URL
  || process.env.HERMES_API_URL
  || 'http://127.0.0.1:8642/v1'

function configuredSecret(value) {
  const v = String(value || '').trim()
  if (!v) return ''
  if (['missing', 'changeme', 'change-me', 'undefined', 'null'].includes(v.toLowerCase())) return ''
  return v
}

function privateHarnessBase(raw, label) {
  const base = String(raw || '').trim().replace(/\/+$/, '')
  if (!base) return ''
  let url
  try { url = new URL(base) } catch { throw new Error(`${label} API base URL is invalid`) }
  const host = url.hostname.toLowerCase()
  const privateHost = host === 'localhost'
    || host === '127.0.0.1'
    || host === '::1'
    || host.startsWith('10.')
    || host.startsWith('192.168.')
    || /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    || /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host)
  if (!privateHost && process.env.HARNESS_ALLOW_PUBLIC_RUNTIME_URLS !== '1') {
    throw new Error(`${label} must stay on localhost/private networking. Set HARNESS_ALLOW_PUBLIC_RUNTIME_URLS=1 only after adding a separate auth gateway.`)
  }
  return base
}

function cleanTask(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 4000)
}

function deepSeekHarnessEnabled() {
  const configured = String(process.env.DEEPSEEK_HARNESS_ENABLED || '').trim().toLowerCase()
  if (configured) return ['1', 'true', 'yes', 'on'].includes(configured)
  return process.env.NODE_ENV !== 'production'
}

function summarizeAgent(agent) {
  return {
    id: agent?.id || '',
    name: agent?.name || agent?.id || 'Agent',
    role: agent?.role || '',
    category: agent?.category || '',
    model: agent?.brain?.modelId || '',
    tools: Array.isArray(agent?.tools) ? agent.tools.slice(0, 80) : [],
    prompt: String(agent?.jobDescription || '').slice(0, 12000),
  }
}

function comparisonPrompt({ agent, task, mode }) {
  const safeAgent = summarizeAgent(agent)
  const dryRun = mode !== 'approved-live'
  return [
    '[Harness Comparison Task]',
    `Agent id: ${safeAgent.id}`,
    `Agent name: ${safeAgent.name}`,
    `Agent role: ${safeAgent.role || 'not set'}`,
    `Agent model: ${safeAgent.model || 'runtime default'}`,
    `Agent tools visible in CRM: ${safeAgent.tools.join(', ') || 'none listed'}`,
    '',
    '[Agent Prompt Snapshot]',
    safeAgent.prompt || 'No CRM prompt snapshot is available for this agent.',
    '',
    '[Safety Mode]',
    dryRun
      ? 'Dry run. Do not spend credits, send messages, create records, delete records, or call paid/external tools. If a tool would be used, write the exact intended tool call as JSON in a "tool_plan" section instead.'
      : 'Approved live action mode. Only call paid/external/destructive tools when the user task clearly includes approval. Report exactly what tool succeeded or failed.',
    '',
    '[Required Output]',
    'Return a concise result with these labels: answer, tool_plan, risks, next_step.',
    'If the request is creative, produce a usable creative direction rather than generic advice.',
    '',
    '[Carl Task]',
    task,
  ].join('\n')
}

async function runOpenClaw({ agent, task, mode }) {
  const started = Date.now()
  const cred = getCred('open claw') || getCred('openclaw')
  const token = cred?.key
  const prompt = comparisonPrompt({ agent, task, mode })
  const sessionKey = `agent:${agent?.id || 'main'}:harness-compare-${Date.now()}`
  const result = await openclawChat({
    message: prompt,
    sessionKey,
    token,
    firstChunkMs: 45000,
    betweenChunksMs: 8000,
    maxMs: 180000,
  })
  return {
    id: 'openclaw-hetzner',
    label: 'OpenClaw',
    ok: true,
    ms: Date.now() - started,
    sessionKey,
    runId: result.runId || '',
    output: result.text || '',
    promptSource: 'crm-agent-snapshot-injected',
  }
}

async function runHermesApi({ agent, task, mode }) {
  const started = Date.now()
  const base = privateHarnessBase(DEFAULT_HERMES_API_BASE, 'Hermes')
  const key = configuredSecret(process.env.HERMES_API_SERVER_KEY)
    || configuredSecret(process.env.API_SERVER_KEY)
    || configuredSecret(process.env.HERMES_API_KEY)

  if (!base) {
    return {
      id: 'hermes-hetzner',
      label: 'Hermes',
      ok: false,
      ms: Date.now() - started,
      output: '',
      error: 'Hermes API base URL is not configured.',
      setup: 'Enable Hermes API Server and set HERMES_API_BASE_URL plus HERMES_API_SERVER_KEY.',
      promptSource: 'not-run',
    }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 120000)
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(key ? { Authorization: `Bearer ${key}` } : {}),
      },
      body: JSON.stringify({
        model: process.env.HERMES_API_MODEL || 'hermes-agent',
        stream: false,
        messages: [
          {
            role: 'system',
            content: 'You are running inside Farrington Command Center Harness Lab. Use the injected CRM agent prompt snapshot as the active agent identity for this one comparison task.',
          },
          { role: 'user', content: comparisonPrompt({ agent, task, mode }) },
        ],
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return {
        id: 'hermes-hetzner',
        label: 'Hermes',
        ok: false,
        status: res.status,
        ms: Date.now() - started,
        output: '',
        error: data?.error?.message || data?.error || `Hermes API HTTP ${res.status}`,
        setup: 'Hermes API Server must be enabled on the Hetzner sidecar for comparable task runs.',
        promptSource: 'crm-agent-snapshot-injected',
      }
    }
    return {
      id: 'hermes-hetzner',
      label: 'Hermes',
      ok: true,
      status: res.status,
      ms: Date.now() - started,
      output: data?.choices?.[0]?.message?.content || '',
      usage: data?.usage || null,
      promptSource: 'crm-agent-snapshot-injected',
    }
  } catch (e) {
    return {
      id: 'hermes-hetzner',
      label: 'Hermes',
      ok: false,
      ms: Date.now() - started,
      output: '',
      error: e?.name === 'AbortError' ? 'Hermes API timed out.' : e.message,
      setup: 'Enable Hermes API Server. Official Hermes docs expose comparable chat at /v1/chat/completions.',
      promptSource: 'not-run',
    }
  } finally {
    clearTimeout(timer)
  }
}

async function runDeerFlowApi({ agent, task, mode }) {
  const started = Date.now()
  const base = privateHarnessBase(process.env.DEERFLOW_API_BASE_URL || process.env.DEER_FLOW_API_BASE_URL || '', 'DeerFlow')
  const key = configuredSecret(process.env.DEERFLOW_API_KEY) || configuredSecret(process.env.DEER_FLOW_API_KEY)

  if (!base) {
    return {
      id: 'deerflow-hetzner',
      label: 'DeerFlow',
      ok: false,
      ms: Date.now() - started,
      output: '',
      error: 'DeerFlow API base URL is not configured.',
      setup: 'Install DeerFlow as a private sidecar and set DEERFLOW_API_BASE_URL.',
      promptSource: 'not-run',
    }
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 120000)
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(key ? { Authorization: `Bearer ${key}` } : {}),
      },
      body: JSON.stringify({
        model: process.env.DEERFLOW_API_MODEL || process.env.DEER_FLOW_API_MODEL || 'deerflow-agent',
        stream: false,
        messages: [
          { role: 'system', content: 'You are running inside Farrington Command Center Harness Lab. Use the injected CRM agent prompt snapshot as the active agent identity for this one comparison task.' },
          { role: 'user', content: comparisonPrompt({ agent, task, mode }) },
        ],
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      return {
        id: 'deerflow-hetzner',
        label: 'DeerFlow',
        ok: false,
        status: res.status,
        ms: Date.now() - started,
        output: '',
        error: data?.error?.message || data?.error || `DeerFlow API HTTP ${res.status}`,
        setup: 'DeerFlow API Server must be enabled on the Hetzner sidecar for comparable task runs.',
        promptSource: 'crm-agent-snapshot-injected',
      }
    }
    return {
      id: 'deerflow-hetzner',
      label: 'DeerFlow',
      ok: true,
      status: res.status,
      ms: Date.now() - started,
      output: data?.choices?.[0]?.message?.content || '',
      usage: data?.usage || null,
      promptSource: 'crm-agent-snapshot-injected',
    }
  } catch (e) {
    return {
      id: 'deerflow-hetzner',
      label: 'DeerFlow',
      ok: false,
      ms: Date.now() - started,
      output: '',
      error: e?.name === 'AbortError' ? 'DeerFlow API timed out.' : e.message,
      setup: 'Install DeerFlow as a private sidecar and expose an internal chat/completions API.',
      promptSource: 'not-run',
    }
  } finally {
    clearTimeout(timer)
  }
}

async function runDeepSeekHarness({ agent, task, mode, user }) {
  const started = Date.now()
  const base = {
    id: 'deepseek-harness',
    label: 'DeepSeek Harness',
    promptSource: 'CRM agent prompt snapshot + comparison task',
  }
  if (!deepSeekHarnessEnabled()) {
    return { ...base, ok: false, error: 'DeepSeek Harness is disabled by its production feature flag.' }
  }
  if (!isOwner(user)) {
    return { ...base, ok: false, error: 'DeepSeek Harness experiments are restricted to the Command Center owner.' }
  }

  try {
    const result = await deepSeekHarnessChat({
      messages: [{ role: 'user', content: comparisonPrompt({ agent, task, mode }) }],
      agent: {
        ...agent,
        label: agent?.name || agent?.id || 'Dax',
        tools: [],
      },
    })
    return {
      ...base,
      ok: true,
      ms: Date.now() - started,
      output: result.text,
      model: result.model,
      profile: result.profile,
      requestId: result.requestId,
    }
  } catch (e) {
    return { ...base, ok: false, ms: Date.now() - started, error: e.message }
  }
}

export async function POST(request) {
  const { user, error } = await requireAdmin(request)
  if (error) return error

  const body = await request.json().catch(() => ({}))
  const agentId = String(body.agentId || 'main').trim()
  const task = cleanTask(body.task)
  const mode = body.mode === 'approved-live' ? 'approved-live' : 'dry-run'
  const requested = Array.isArray(body.harnesses) && body.harnesses.length
    ? body.harnesses.map(String)
    : ['openclaw-hetzner', 'hermes-hetzner', 'deerflow-hetzner']

  if (!task) {
    return NextResponse.json({ ok: false, error: 'Task prompt is required.' }, { status: 400 })
  }

  const registry = await listAgents().catch(e => ({ ok: false, error: e.message, agents: [] }))
  const agent = (registry.agents || []).find(a => a.id === agentId)
    || (registry.agents || []).find(a => a.name === agentId)
    || (registry.agents || [])[0]
  if (!agent) return NextResponse.json({ ok: false, error: 'No agent registry is available.' }, { status: 503 })

  const results = []
  for (const harnessId of requested) {
    try {
      if (harnessId === 'openclaw-hetzner') results.push(await runOpenClaw({ agent, task, mode }))
      else if (harnessId === 'hermes-hetzner') results.push(await runHermesApi({ agent, task, mode }))
      else if (harnessId === 'deerflow-hetzner') results.push(await runDeerFlowApi({ agent, task, mode }))
      else if (harnessId === 'deepseek-harness') results.push(await runDeepSeekHarness({ agent, task, mode, user }))
      else results.push({ id: harnessId, label: harnessId, ok: false, error: 'Unknown harness.' })
    } catch (e) {
      results.push({
        id: harnessId,
        label: harnessId === 'openclaw-hetzner' ? 'OpenClaw' : harnessId === 'hermes-hetzner' ? 'Hermes' : harnessId === 'deerflow-hetzner' ? 'DeerFlow' : harnessId === 'deepseek-harness' ? 'DeepSeek Harness' : harnessId,
        ok: false,
        error: e.message,
      })
    }
  }

  return NextResponse.json({
    ok: true,
    ranAt: new Date().toISOString(),
    mode,
    agent: summarizeAgent(agent),
    task,
    results,
  })
}
