import { readData } from './dataStore'

const API_BASE = 'https://api.mindstudio.ai'

function fieldValue(cred, labelRx) {
  const field = (cred.fields || []).find(f => labelRx.test(f.label || ''))
  return String(field?.value || '').trim()
}

export function getMindStudioApiKey() {
  if (process.env.MINDSTUDIO_API_KEY) return process.env.MINDSTUDIO_API_KEY.trim()
  const data = readData('credentials.json') || { credentials: [] }
  const cred = (data.credentials || []).find(c => /mind\s*studio|mindstudio/i.test(c.name || ''))
  return cred ? fieldValue(cred, /api|key|token/i) : ''
}

export function normalizeMindStudioVariables(value) {
  if (!value) return {}
  if (typeof value === 'object' && !Array.isArray(value)) return value
  if (typeof value !== 'string') return {}
  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

export function sanitizeMindStudioFlow(flow = {}) {
  const id = String(flow.id || flow.name || '').trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
  return {
    id: id || `flow-${Date.now().toString(36)}`,
    name: String(flow.name || flow.id || 'MindStudio Flow').trim().slice(0, 120),
    appId: String(flow.appId || '').trim(),
    workflow: String(flow.workflow || '').trim(),
    description: String(flow.description || '').trim().slice(0, 500),
    variablesJson: typeof flow.variablesJson === 'string'
      ? flow.variablesJson
      : JSON.stringify(normalizeMindStudioVariables(flow.variables || {}), null, 2),
  }
}

export function findAgentMindStudioFlow(agentId, flowRef) {
  if (!agentId || !flowRef) return null
  const data = readData('agents.json') || { agents: {} }
  const agent = data.agents?.[agentId]
  const flows = Array.isArray(agent?.labs?.mindstudioFlows) ? agent.labs.mindstudioFlows : []
  const ref = String(flowRef || '').toLowerCase().trim()
  return flows.find(flow =>
    String(flow.id || '').toLowerCase() === ref ||
    String(flow.name || '').toLowerCase() === ref
  ) || null
}

export async function runMindStudioFlow(options = {}) {
  const key = getMindStudioApiKey()
  if (!key) throw new Error('MINDSTUDIO_API_KEY is not configured')

  let flow = null
  if (options.agentId && (options.flowId || options.flowName)) {
    flow = findAgentMindStudioFlow(options.agentId, options.flowId || options.flowName)
    if (!flow) throw new Error(`MindStudio flow not found on agent ${options.agentId}`)
  }

  const appId = String(options.appId || flow?.appId || '').trim()
  if (!appId) throw new Error('MindStudio appId required')

  const workflow = String(options.workflow || flow?.workflow || '').trim()
  const baseVariables = normalizeMindStudioVariables(flow?.variablesJson || flow?.variables)
  const variables = {
    ...baseVariables,
    ...normalizeMindStudioVariables(options.variables),
  }

  const response = await fetch(`${API_BASE}/developer/v2/apps/run`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      appId,
      ...(workflow ? { workflow } : {}),
      variables,
      ...(options.callbackUrl ? { callbackUrl: String(options.callbackUrl) } : {}),
      ...(options.includeBillingCost === true ? { includeBillingCost: true } : {}),
    }),
    signal: AbortSignal.timeout(Number(options.timeoutMs) || 45000),
  })
  const text = await response.text()
  let body
  try { body = JSON.parse(text) } catch { body = { raw: text } }
  if (!response.ok) {
    const detail = body?.error || body?.message || body?.detail || text.slice(0, 300)
    throw new Error(`MindStudio ${response.status}: ${detail}`)
  }
  return {
    ok: true,
    appId,
    workflow,
    flowId: flow?.id || options.flowId || '',
    flowName: flow?.name || options.flowName || '',
    variables,
    result: body?.result ?? body,
    billingCost: body?.billingCost ?? body?.billing_cost ?? null,
  }
}
