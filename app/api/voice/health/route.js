import { NextResponse } from 'next/server'
import { getCred } from '@/lib/agent-creds'
import { readData } from '@/lib/dataStore'
import { requireCapability } from '@/lib/permissions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const RELIABILITY_MARKER = 'VOICE RELIABILITY CONTRACT v2026-06-25'
const DEFAULT_MIN_PROMPT_CHARS = 2500
const ROLE_REQUIRED_TOOLS = {
  main: ['find_contact', 'send_email', 'book_demo', 'command_center_action'],
  coding: ['find_contact', 'send_email', 'book_demo', 'create_plugin_change_request'],
  legal: ['find_contact', 'send_email', 'book_demo', 'send_signature_document'],
}
const ROLE_MIN_PROMPT_CHARS = {
  main: 8000,
  coding: 7000,
  legal: 7000,
}

function summarizeTool(tool = {}) {
  const config = tool.tool_config || tool
  const api = config.api_schema || config.webhook || {}
  return {
    name: config.name || config.tool_name || config.id || config.type || '',
    type: config.type || '',
    method: api.method || '',
    hasApiUrl: Boolean(api.url),
  }
}

function getPromptText(agent = {}) {
  const prompt = agent.prompt || {}
  return String(prompt.prompt || prompt.text || '')
}

function countBy(items = []) {
  return items.reduce((acc, item) => {
    const key = String(item || '').trim()
    if (!key) return acc
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})
}

async function fetchElevenLabsAgent(apiKey, agentId) {
  const response = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${encodeURIComponent(agentId)}`, {
    headers: { 'xi-api-key': apiKey },
    signal: AbortSignal.timeout(15000),
  })
  const body = await response.json().catch(() => ({}))
  return { response, body }
}

function specsFromRoster(roster = {}) {
  return Object.entries(roster)
    .filter(([, binding]) => binding?.agentId)
    .map(([id, binding]) => ({
      id,
      name: binding.name || id,
      requiredTools: [...new Set(['transfer_to_agent', ...(ROLE_REQUIRED_TOOLS[id] || [])])],
      minPromptChars: ROLE_MIN_PROMPT_CHARS[id] || DEFAULT_MIN_PROMPT_CHARS,
    }))
}

async function checkAgent(apiKey, roster, spec) {
  const binding = roster?.[spec.id] || null
  const issues = []
  const warnings = []
  if (!binding?.agentId) {
    issues.push('missing ElevenLabs agent binding')
    return { id: spec.id, name: spec.name, ok: false, issues, warnings }
  }

  let response
  let body
  try {
    const result = await fetchElevenLabsAgent(apiKey, binding.agentId)
    response = result.response
    body = result.body
  } catch (error) {
    issues.push(`ElevenLabs fetch failed: ${error?.message || 'unknown error'}`)
    return { id: spec.id, name: spec.name, agentId: binding.agentId, ok: false, issues, warnings }
  }

  if (!response.ok) issues.push(`ElevenLabs returned HTTP ${response.status}`)

  const agent = body?.conversation_config?.agent || {}
  const prompt = agent.prompt || {}
  const promptText = getPromptText(agent)
  const firstMessage = String(agent.first_message || body?.conversation_config?.first_message || '')
  const tools = Array.isArray(prompt.tools) ? prompt.tools.map(summarizeTool) : []
  const toolNames = tools.map(tool => tool.name).filter(Boolean)
  const toolCounts = countBy(toolNames)
  const duplicateTools = Object.entries(toolCounts).filter(([, count]) => count > 1).map(([name]) => name)
  const missingTools = spec.requiredTools.filter(name => !toolCounts[name])
  const webhookToolsWithoutUrl = tools.filter(tool => tool.type === 'webhook' && !tool.hasApiUrl).map(tool => tool.name)
  const builtInTransferEnabled = Boolean(prompt.built_in_tools?.transfer_to_agent)
  const hasReliabilityMarker = promptText.includes(RELIABILITY_MARKER)

  if (promptText.length < spec.minPromptChars) issues.push(`prompt too short: ${promptText.length} chars`)
  if (firstMessage.length < 4) issues.push('first message missing or too short')
  if (!hasReliabilityMarker) issues.push('missing voice reliability contract')
  if (missingTools.length) issues.push(`missing tools: ${missingTools.join(', ')}`)
  if (webhookToolsWithoutUrl.length) issues.push(`webhook tools missing URL: ${webhookToolsWithoutUrl.join(', ')}`)
  if (duplicateTools.length) issues.push(`duplicate tool names: ${duplicateTools.join(', ')}`)
  if (builtInTransferEnabled) issues.push('built-in transfer_to_agent is enabled alongside CRM transfer tool')

  return {
    id: spec.id,
    name: binding.name || spec.name,
    ok: issues.length === 0,
    agentId: binding.agentId,
    httpStatus: response.status,
    promptChars: promptText.length,
    firstMessageChars: firstMessage.length,
    toolsCount: tools.length,
    hasReliabilityMarker,
    builtInTransferEnabled,
    requiredTools: spec.requiredTools,
    missingTools,
    duplicateTools,
    webhookTools: tools.filter(tool => tool.type === 'webhook').map(tool => tool.name),
    clientTools: tools.filter(tool => tool.type === 'client').map(tool => tool.name),
    issues,
    warnings,
  }
}

export async function GET(request) {
  const { error } = await requireCapability(request, 'voice:use')
  if (error) return error

  const cred = getCred('elevenlabs') || getCred('eleven')
  if (!cred?.key) {
    return NextResponse.json({ ok: false, error: 'No ElevenLabs API key in vault' }, { status: 500 })
  }

  const roster = readData('voice-agent-roster.json') || {}
  const specs = specsFromRoster(roster)
  if (!specs.length) {
    return NextResponse.json({ ok: false, error: 'No ElevenLabs agents are bound in the voice roster' }, { status: 503 })
  }

  const checks = await Promise.all(specs.map(spec => checkAgent(cred.key, roster, spec)))
  const ok = checks.every(check => check.ok)
  return NextResponse.json({
    ok,
    checkedAt: new Date().toISOString(),
    checkedAgents: specs.map(agent => agent.id),
    checks,
  }, { status: ok ? 200 : 503 })
}
