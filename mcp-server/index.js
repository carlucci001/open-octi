#!/usr/bin/env node
// Farrington Command Center MCP server (v1) — a thin, read-mostly proxy over the
// CRM's HTTP API. Talks stdio to the MCP client (Claude Desktop / Claude Code).
//
// Auth: the CRM's OpenClaw bridge (app/api/openclaw/*) accepts a static API key
// via the `x-api-key` header, checked against the server's OPENCLAW_API_KEY env
// var (see lib/apiAuth.js). This server sends the same header, named FCC_API_KEY
// on this side so it's not confused with the CRM process's own env var.
//
// Some CRM endpoints (campaign-studio, postiz channels) are gated by browser
// session cookies only (lib/permissions.js -> lib/auth.js getCurrentUser) and
// have no API-key path. Tools that hit those endpoints will get a 401/403 from
// the CRM; this server turns that into a clear, actionable error instead of a
// raw HTTP failure. See README.md "Known Gaps".

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

const BASE_URL = (process.env.FCC_BASE_URL || 'http://localhost:3000').replace(/\/$/, '')
const API_KEY = process.env.FCC_API_KEY || ''

const SESSION_AUTH_GAP =
  'This CRM endpoint only accepts a logged-in browser session cookie today — ' +
  'there is no API-key path for it yet (see lib/permissions.js -> getCurrentUser). ' +
  'It needs a server-side change to accept FCC_API_KEY before this tool can work. ' +
  'Not fixed here per v1 scope (no API route edits).'

function text(payload) {
  const body = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2)
  return { content: [{ type: 'text', text: body }] }
}

function errorText(message) {
  return { content: [{ type: 'text', text: message }], isError: true }
}

// Low-level HTTP call against the CRM. Returns { ok, status, body, networkError }.
async function callFcc(path, { method = 'GET', body } = {}) {
  if (!API_KEY) {
    return {
      ok: false,
      networkError: true,
      message:
        'FCC_API_KEY is not set. Set it to the same value as the CRM\'s OPENCLAW_API_KEY ' +
        'environment variable (see lib/apiAuth.js) and restart this MCP server.',
    }
  }

  const url = `${BASE_URL}${path}`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)

  try {
    const res = await fetch(url, {
      method,
      headers: {
        'x-api-key': API_KEY,
        'content-type': 'application/json',
        'user-agent': 'fcc-mcp-server/1.0',
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    })
    clearTimeout(timeout)

    const raw = await res.text()
    let parsed = null
    try { parsed = raw ? JSON.parse(raw) : null } catch { /* leave null, fall back to raw text */ }

    return { ok: res.ok, status: res.status, body: parsed ?? raw }
  } catch (e) {
    clearTimeout(timeout)
    const aborted = e?.name === 'AbortError'
    return {
      ok: false,
      networkError: true,
      message: aborted
        ? `Timed out reaching the CRM at ${BASE_URL}. Is it running? Check FCC_BASE_URL.`
        : `Could not reach the CRM at ${BASE_URL} (${e?.message || e}). Is it running? Check FCC_BASE_URL.`,
    }
  }
}

// Wraps callFcc for endpoints known to be session-cookie-only (no API-key path
// exists server-side yet). Turns a 401/403 into the documented gap message
// instead of a confusing raw auth failure.
async function callFccSessionGated(path, opts) {
  const result = await callFcc(path, opts)
  if (result.networkError) return result
  if (!result.ok && (result.status === 401 || result.status === 403)) {
    return { ok: false, sessionGap: true, message: SESSION_AUTH_GAP }
  }
  return result
}

function summarizeClient(c) {
  return {
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    projectCount: Array.isArray(c.projects) ? c.projects.length : 0,
  }
}

function summarizeLead(l) {
  return {
    id: l.id,
    name: l.name,
    email: l.email,
    projectName: l.projectName,
    status: l.status,
    rating: l.rating,
    createdAt: l.createdAt,
  }
}

function summarizeCampaign(c) {
  return {
    id: c.id,
    name: c.name,
    status: c.status,
    kind: c.kind,
    objective: c.objective,
    createdAt: c.createdAt,
    postCount: Array.isArray(c.posts) ? c.posts.length : 0,
  }
}

const server = new McpServer({
  name: 'fcc-crm',
  version: '1.0.0',
})

// ---------------------------------------------------------------------------
// 1. list_clients
// ---------------------------------------------------------------------------
server.tool(
  'list_clients',
  'List CRM clients, optionally filtered by a free-text search across name/email/notes. Read-only.',
  {
    q: z.string().optional().describe('Free-text search across client name, email, and notes'),
    limit: z.number().int().positive().max(200).optional().describe('Max clients to return (default: all matches)'),
  },
  async ({ q, limit }) => {
    const params = new URLSearchParams()
    if (q) params.set('q', q)
    if (limit) params.set('limit', String(limit))
    const qs = params.toString() ? `?${params.toString()}` : ''
    const result = await callFcc(`/api/openclaw/clients${qs}`)
    if (result.networkError) return errorText(result.message)
    if (!result.ok) return errorText(`CRM returned ${result.status}: ${JSON.stringify(result.body)}`)
    const clients = (result.body?.clients || []).map(summarizeClient)
    return text({ total: result.body?.total ?? clients.length, clients })
  }
)

// ---------------------------------------------------------------------------
// 2. get_client
// ---------------------------------------------------------------------------
server.tool(
  'get_client',
  'Get full details for a single CRM client by id, including its projects. Read-only.',
  {
    id: z.string().min(1).describe('Client id'),
  },
  async ({ id }) => {
    const result = await callFcc(`/api/openclaw/clients?${new URLSearchParams({ id })}`)
    if (result.networkError) return errorText(result.message)
    if (!result.ok) return errorText(`CRM returned ${result.status}: ${JSON.stringify(result.body)}`)
    const client = (result.body?.clients || [])[0]
    if (!client) return errorText(`No client found with id "${id}".`)
    return text(client)
  }
)

// ---------------------------------------------------------------------------
// 3. list_campaigns
// ---------------------------------------------------------------------------
server.tool(
  'list_campaigns',
  'List campaigns from Campaign Studio, optionally filtered by status (e.g. draft, active, scheduled). Read-only. ' +
  'Known gap: this CRM endpoint currently requires a browser session and has no API-key auth path — see error text if it fails.',
  {
    status: z.string().optional().describe('Filter to campaigns with this status (e.g. "draft", "active")'),
  },
  async ({ status }) => {
    const result = await callFccSessionGated('/api/campaign-studio')
    if (result.networkError) return errorText(result.message)
    if (result.sessionGap) return errorText(result.message)
    if (!result.ok) return errorText(`CRM returned ${result.status}: ${JSON.stringify(result.body)}`)
    let campaigns = result.body?.campaigns || []
    if (status) campaigns = campaigns.filter(c => c.status === status)
    return text({ total: campaigns.length, campaigns: campaigns.map(summarizeCampaign) })
  }
)

// ---------------------------------------------------------------------------
// 4. get_campaign
// ---------------------------------------------------------------------------
server.tool(
  'get_campaign',
  'Get full details for a single campaign by id, including its posts. Read-only. ' +
  'Known gap: this CRM endpoint currently requires a browser session and has no API-key auth path — see error text if it fails.',
  {
    id: z.string().min(1).describe('Campaign id'),
  },
  async ({ id }) => {
    const result = await callFccSessionGated('/api/campaign-studio')
    if (result.networkError) return errorText(result.message)
    if (result.sessionGap) return errorText(result.message)
    if (!result.ok) return errorText(`CRM returned ${result.status}: ${JSON.stringify(result.body)}`)
    const campaign = (result.body?.campaigns || []).find(c => c.id === id)
    if (!campaign) return errorText(`No campaign found with id "${id}".`)
    return text(campaign)
  }
)

// ---------------------------------------------------------------------------
// 5. list_channels
// ---------------------------------------------------------------------------
server.tool(
  'list_channels',
  'List connected Postiz social channels, optionally filtered by tenantId. Read-only. ' +
  'Known gap: this CRM endpoint currently requires a browser session and has no API-key auth path — see error text if it fails.',
  {
    tenantId: z.string().optional().describe('Filter to channels mapped to this tenant id'),
  },
  async ({ tenantId }) => {
    const params = new URLSearchParams()
    if (tenantId) params.set('tenantId', tenantId)
    const qs = params.toString() ? `?${params.toString()}` : ''
    const result = await callFccSessionGated(`/api/postiz/channels${qs}`)
    if (result.networkError) return errorText(result.message)
    if (result.sessionGap) return errorText(result.message)
    if (!result.ok) return errorText(`CRM returned ${result.status}: ${JSON.stringify(result.body)}`)
    return text(result.body)
  }
)

// ---------------------------------------------------------------------------
// 6. delivery_schedule
// ---------------------------------------------------------------------------
server.tool(
  'delivery_schedule',
  'List upcoming scheduled social posts across all campaigns, sorted soonest-first, within a day window. Read-only. ' +
  'Known gap: this CRM endpoint currently requires a browser session and has no API-key auth path — see error text if it fails.',
  {
    days: z.number().int().positive().max(90).optional().describe('Look-ahead window in days (default 14)'),
  },
  async ({ days = 14 }) => {
    const result = await callFccSessionGated('/api/campaign-studio')
    if (result.networkError) return errorText(result.message)
    if (result.sessionGap) return errorText(result.message)
    if (!result.ok) return errorText(`CRM returned ${result.status}: ${JSON.stringify(result.body)}`)

    const now = Date.now()
    const horizon = now + days * 24 * 60 * 60 * 1000
    const campaigns = result.body?.campaigns || []
    const scheduled = []
    for (const c of campaigns) {
      for (const p of c.posts || []) {
        const when = p.scheduledFor ? Date.parse(p.scheduledFor) : NaN
        if (!Number.isFinite(when)) continue
        if (when < now || when > horizon) continue
        scheduled.push({
          campaignId: c.id,
          campaignName: c.name,
          postId: p.id,
          platform: p.platform,
          status: p.status,
          scheduledFor: p.scheduledFor,
          hook: p.hook,
        })
      }
    }
    scheduled.sort((a, b) => Date.parse(a.scheduledFor) - Date.parse(b.scheduledFor))
    return text({ windowDays: days, total: scheduled.length, scheduled })
  }
)

// ---------------------------------------------------------------------------
// 7. list_recent_leads
// ---------------------------------------------------------------------------
server.tool(
  'list_recent_leads',
  'List the most recently created leads, newest first. Read-only.',
  {
    limit: z.number().int().positive().max(100).optional().describe('Max leads to return (default 20)'),
    status: z.string().optional().describe('Filter to a single lead status (e.g. "discovery", "converted")'),
  },
  async ({ limit = 20, status }) => {
    const params = new URLSearchParams()
    if (status) params.set('status', status)
    const qs = params.toString() ? `?${params.toString()}` : ''
    const result = await callFcc(`/api/openclaw/leads${qs}`)
    if (result.networkError) return errorText(result.message)
    if (!result.ok) return errorText(`CRM returned ${result.status}: ${JSON.stringify(result.body)}`)
    const leads = (result.body?.leads || [])
      .slice()
      .sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0))
      .slice(0, limit)
      .map(summarizeLead)
    return text({ total: leads.length, leads })
  }
)

// ---------------------------------------------------------------------------
// 8. create_campaign_brief (the one write tool — draft only, never publishes)
// ---------------------------------------------------------------------------
server.tool(
  'create_campaign_brief',
  'Create a DRAFT campaign brief in Campaign Studio. This ONLY creates a draft — it never publishes, ' +
  'schedules, or sends anything to social channels. A human must review and approve it in the CRM before ' +
  'any post goes out. Known gap: this CRM endpoint currently requires a browser session and has no API-key ' +
  'auth path — see error text if it fails.',
  {
    name: z.string().min(1).describe('Campaign name'),
    objective: z.string().optional().describe('What this campaign is trying to achieve'),
    audience: z.string().optional().describe('Target audience description'),
    market: z.string().optional().describe('Target market / region'),
    clientId: z.string().optional().describe('CRM client id this campaign is for, if applicable'),
  },
  async ({ name, objective, audience, market, clientId }) => {
    const campaign = { name, objective, audience, market, clientId }
    Object.keys(campaign).forEach(k => campaign[k] === undefined && delete campaign[k])

    const result = await callFccSessionGated('/api/campaign-studio', {
      method: 'POST',
      body: { action: 'create_campaign', campaign },
    })
    if (result.networkError) return errorText(result.message)
    if (result.sessionGap) return errorText(result.message)
    if (!result.ok) return errorText(`CRM returned ${result.status}: ${JSON.stringify(result.body)}`)
    return text({
      created: true,
      note: 'Draft only — nothing was published or scheduled.',
      campaign: result.body?.campaign,
    })
  }
)

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error(`fcc-mcp-server v1.0.0 connected over stdio (base: ${BASE_URL}, api key: ${API_KEY ? 'set' : 'NOT SET'})`)
}

main().catch(err => {
  console.error('fcc-mcp-server failed to start:', err)
  process.exit(1)
})
