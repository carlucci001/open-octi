import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { requireAdmin } from '@/lib/auth'
import { listAgents } from '@/lib/agents-store'
import { readData } from '@/lib/dataStore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const API_DIR = path.join(process.cwd(), 'app', 'api')
const TOOL_FILE = path.join(process.cwd(), 'scripts', 'fcc-unified-plugin-index.ts')

function cleanCommand(value) {
  return String(value || '')
    .trim()
    .replace(/^fcc:harness\$\s*/i, '')
    .split(/\s+/)[0]
    .toLowerCase()
}

function walkApi(dir, base = '') {
  const out = []
  if (!fs.existsSync(dir)) return out
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const sub = path.join(dir, ent.name)
    if (ent.isDirectory()) out.push(...walkApi(sub, base + '/' + ent.name))
    else if (/^route\.(js|ts|tsx|mjs)$/.test(ent.name)) {
      const src = fs.readFileSync(sub, 'utf8')
      const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
        .filter(m => new RegExp('export\\s+async\\s+function\\s+' + m + '\\b').test(src))
      out.push({ path: '/api' + base, methods })
    }
  }
  return out.sort((a, b) => a.path.localeCompare(b.path))
}

function parseOpenclawTools() {
  if (!fs.existsSync(TOOL_FILE)) return []
  const lines = fs.readFileSync(TOOL_FILE, 'utf8').split('\n')
  const tools = []
  for (let i = 0; i < lines.length; i++) {
    const name = lines[i].match(/name:\s*["']([a-zA-Z0-9_]+)["']/)?.[1]
    if (!name) continue
    if (!name.startsWith('fcc_') && !name.startsWith('crm_') && !name.startsWith('nylas_')) continue
    let description = ''
    for (let j = i + 1; j < Math.min(i + 30, lines.length); j++) {
      const m = lines[j].match(/description:\s*["']([^"']+)["']/)
      if (m) { description = m[1]; break }
    }
    tools.push({ name, description })
  }
  const seen = new Set()
  return tools.filter(t => {
    if (seen.has(t.name)) return false
    seen.add(t.name)
    return true
  })
}

function lines(title, items) {
  return [title, ''.padEnd(Math.min(title.length, 80), '-'), ...items].join('\n')
}

async function run(command) {
  if (!command || command === 'help') {
    return lines('Harness commands', [
      'help       Show approved commands',
      'status     Check OpenClaw agent registry and CRM route count',
      'agents     List OpenClaw agents available through the CRM bridge',
      'tools      List registered OpenClaw/FCC tools',
      'routes     List important CRM API routes',
      'pricing    Show pricing tier names from the local pricing store',
      'health     Short service-oriented health summary',
      '',
      'This console is intentionally scoped to diagnostics. It does not run arbitrary shell commands.',
    ])
  }

  if (command === 'status' || command === 'health') {
    const [agents, routes, tools] = await Promise.all([
      listAgents().catch(e => ({ ok: false, error: e.message, agents: [] })),
      Promise.resolve(walkApi(API_DIR)),
      Promise.resolve(parseOpenclawTools()),
    ])
    return lines(command === 'health' ? 'Harness health' : 'Harness status', [
      `CRM API routes: ${routes.length}`,
      `OpenClaw bridge: ${agents.ok ? 'reachable' : 'error'}`,
      `OpenClaw agents: ${(agents.agents || []).length}`,
      `OpenClaw/FCC tools: ${tools.length}`,
      `Gateway target: 127.0.0.1:18789 via server-side OpenClaw client`,
      agents.ping?.ms ? `OpenClaw ping: ${agents.ping.ms}ms` : '',
      agents.error ? `Registry error: ${agents.error}` : '',
    ].filter(Boolean))
  }

  if (command === 'agents') {
    const data = await listAgents().catch(e => ({ ok: false, error: e.message, agents: [] }))
    if (!data.ok) return lines('OpenClaw agents', [`Error: ${data.error}`])
    const items = (data.agents || []).slice(0, 40).map(a => {
      const model = a.brain?.modelId || 'model unknown'
      const state = a.enabled === false ? 'disabled' : 'enabled'
      return `${a.id.padEnd(22)} ${state.padEnd(9)} ${model}  ${a.name || ''}`
    })
    return lines(`OpenClaw agents (${data.agents.length})`, items.length ? items : ['No agents returned.'])
  }

  if (command === 'tools') {
    const tools = parseOpenclawTools()
    const items = tools.slice(0, 60).map(t => `${t.name}${t.description ? ' - ' + t.description : ''}`)
    return lines(`OpenClaw/FCC tools (${tools.length})`, items.length ? items : ['No tools detected.'])
  }

  if (command === 'routes') {
    const routes = walkApi(API_DIR)
    const important = routes.filter(r => /openclaw|agent|documents|signatures|pricing|network|credentials|auth/.test(r.path))
    const items = important.slice(0, 80).map(r => `${(r.methods.join(',') || 'GET').padEnd(14)} ${r.path}`)
    return lines(`Important CRM routes (${important.length}/${routes.length})`, items)
  }

  if (command === 'pricing') {
    const pricing = readData('pricing-tiers.json') || {}
    const tiers = pricing.tiers || []
    const items = tiers.map(t => `${t.name || t.id}: ${t.monthlyFee ? '$' + Number(t.monthlyFee).toLocaleString() + '/mo' : 'price not set'}`)
    return lines(`Pricing tiers (${tiers.length})`, items.length ? items : ['No pricing tiers found.'])
  }

  return lines('Command blocked', [
    `"${command}" is not an approved Harness diagnostic command.`,
    'Run "help" for the available list.',
  ])
}

export async function POST(request) {
  const { error } = await requireAdmin(request)
  if (error) return error
  const body = await request.json().catch(() => ({}))
  const command = cleanCommand(body.command)
  try {
    const output = await run(command)
    return NextResponse.json({ ok: true, command: command || 'help', output, ranAt: new Date().toISOString() })
  } catch (e) {
    return NextResponse.json({ ok: false, command, error: e.message }, { status: 500 })
  }
}
