import { NextResponse } from 'next/server'
import { requireCapability } from '@/lib/permissions'
import { listAgents, saveAgent } from '@/lib/agents-store'
import { readData, writeData } from '@/lib/dataStore'
import { logAuditEvent } from '@/lib/auditLog'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PROMOTIONS_FILE = 'ai-lab-promotions.json'
const NEW_AGENT_ID = '__new_frankenstein__'
const BLOCKED_IDS = new Set(['main', 'coding'])
const EXPERIMENT_RX = /\b(lab|labs|sandbox|experiment|experimental|frankenstein|franken|test)\b/i

function cleanText(value, max = 180) {
  return String(value || '').trim().slice(0, max)
}

function slug(value) {
  return cleanText(value, 80)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

function modelName(modelId) {
  return String(modelId || '').split('/').slice(-1)[0] || ''
}

function isExperimentalAgent(agent = {}) {
  if (!agent?.id || BLOCKED_IDS.has(agent.id)) return false
  const tags = Array.isArray(agent.tags) ? agent.tags : []
  const labs = agent.labs && typeof agent.labs === 'object' ? agent.labs : {}
  const searchable = [
    agent.id,
    agent.name,
    agent.title,
    agent.category,
    agent.role,
    agent.description,
    tags.join(' '),
    labs.kind,
    labs.source,
  ].join(' ')

  return Boolean(
    agent.draft === true ||
    labs.experimental === true ||
    labs.sandbox === true ||
    labs.frankenstein === true ||
    EXPERIMENT_RX.test(searchable)
  )
}

function safeTarget(agent) {
  return {
    id: agent.id,
    name: agent.name || agent.id,
    title: agent.title || '',
    category: agent.category || '',
    draft: agent.draft === true,
    enabled: agent.enabled !== false,
    modelId: agent.brain?.modelId || '',
    tags: Array.isArray(agent.tags) ? agent.tags : [],
  }
}

function readPromotions() {
  const data = readData(PROMOTIONS_FILE)
  return Array.isArray(data?.promotions) ? data.promotions : []
}

function writePromotion(item) {
  const promotions = [item, ...readPromotions()].slice(0, 100)
  writeData(PROMOTIONS_FILE, { promotions, lastUpdated: new Date().toISOString() })
  return promotions
}

function promotionPayload({ target, primaryModelId, fallbackModelId, runId, sourceResult, createName }) {
  const existingTags = Array.isArray(target?.tags) ? target.tags : []
  const tags = Array.from(new Set([...existingTags, 'lab', 'experimental', 'frankenstein']))
  const name = createName || target?.name || `Frankenstein ${modelName(primaryModelId) || 'Lab Agent'}`
  const description = `Experimental lab agent promoted from AI Lab run ${runId}. Keep out of in-house production routing until manually approved.`
  return {
    name,
    category: 'labs',
    role: target?.role || 'Experimental Frankenstein agent for lab model promotion and sandbox evaluation.',
    description,
    tags,
    emoji: target?.emoji || 'LAB',
    enabled: target?.enabled !== false,
    modelPrimary: primaryModelId,
    modelFallbacks: fallbackModelId && fallbackModelId !== primaryModelId ? [fallbackModelId] : [],
    labs: {
      ...(target?.labs || {}),
      experimental: true,
      sandbox: true,
      frankenstein: true,
      source: 'ai-lab',
      promotedAt: new Date().toISOString(),
      promotedFromRunId: runId,
      promotedModelId: primaryModelId,
      fallbackModelId: fallbackModelId || '',
      sourceResult: sourceResult ? {
        ok: sourceResult.ok === true,
        latencyMs: sourceResult.latencyMs || null,
        estimatedUsd: sourceResult.cost?.estimatedUsd ?? null,
      } : null,
    },
  }
}

export async function GET(request) {
  const { error } = await requireCapability(request, 'agents:manage')
  if (error) return error
  try {
    const data = await listAgents()
    const targets = (data.agents || []).filter(isExperimentalAgent).map(safeTarget)
    return NextResponse.json({
      ok: true,
      targets,
      newAgentId: NEW_AGENT_ID,
      promotions: readPromotions().slice(0, 12),
    })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || String(e) }, { status: 500 })
  }
}

export async function POST(request) {
  const { user, error } = await requireCapability(request, 'agents:manage')
  if (error) return error

  try {
    const body = await request.json().catch(() => ({}))
    const runId = cleanText(body.runId, 100)
    const primaryModelId = cleanText(body.primaryModelId, 160)
    const fallbackModelId = cleanText(body.fallbackModelId, 160)
    const targetAgentId = cleanText(body.targetAgentId, 100)
    const createName = cleanText(body.createName, 90)
    const sourceResult = body.sourceResult && typeof body.sourceResult === 'object' ? body.sourceResult : null

    if (!runId) throw new Error('Promotion requires a lab run id.')
    if (!primaryModelId) throw new Error('Promotion requires a primary model id.')

    const data = await listAgents()
    const agents = Array.isArray(data.agents) ? data.agents : []

    let id = targetAgentId
    let target = agents.find(agent => agent.id === targetAgentId)
    let created = false

    if (targetAgentId === NEW_AGENT_ID || !targetAgentId) {
      const base = slug(createName) || `frankenstein-${modelName(primaryModelId)}` || 'frankenstein-lab-agent'
      id = `lab-${base}-${Date.now().toString(36)}`
      target = { id, name: createName || `Frankenstein ${modelName(primaryModelId)}`, tags: [], labs: {}, enabled: true }
      created = true
    } else if (!target) {
      throw new Error('Selected agent was not found.')
    } else if (!isExperimentalAgent(target)) {
      throw new Error('Refusing to promote into a non-experimental agent. Choose a lab, sandbox, draft, or Frankenstein agent.')
    }

    const payload = promotionPayload({ target, primaryModelId, fallbackModelId, runId, sourceResult, createName: created ? target.name : '' })
    const result = await saveAgent(id, payload, { reason: `ai-lab-promote:${runId}` })
    const promotion = {
      id: `promo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      createdAt: new Date().toISOString(),
      runId,
      agentId: id,
      agentName: payload.name,
      primaryModelId,
      fallbackModelId: payload.modelFallbacks[0] || '',
      created,
      backup: result.backup || '',
      actor: user?.username || user?.email || user?.id || '',
    }
    writePromotion(promotion)
    logAuditEvent({
      request,
      user,
      action: 'ai_lab_promote_to_experimental_agent',
      area: 'ai-lab',
      severity: 'info',
      targetId: id,
      targetName: payload.name,
      meta: { runId, primaryModelId, fallbackModelId: promotion.fallbackModelId, created },
    })

    return NextResponse.json({ ok: true, promotion, result })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || String(e) }, { status: 400 })
  }
}
