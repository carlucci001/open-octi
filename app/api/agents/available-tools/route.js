// Live registry of agent-callable tools. NO hardcoded list — every entry is derived
// from a real source in the running system. Each tool is tagged with its `source`
// AND a `callable` flag indicating whether OpenClaw can actually invoke it.
//
// Callability rules:
//   - callable=true  → toggle in alsoAllow ACTUALLY gates this function on/off
//   - callable=false → vocabulary for fcc_call({ tool, args }), not a direct tool
//
// Sources (priority order, first match wins for `source`):
//   - 'openclaw-base'   — top-level c.tools.alsoAllow on the Ubuntu box (every agent gets these)
//   - 'fcc-plugin'      — fcc_* tools defined in scripts/fcc-unified-plugin-index.ts
//   - 'openclaw-agent'  — names appearing in any agent's tools.alsoAllow in openclaw.json
//   - 'fcc-call-sub'    — dispatcher tools reachable via fcc_call({ tool: ... })
//
// We never invent tools. If openclaw.json can't be reached, we say so honestly.
import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { readOpenclawConfig } from '@/lib/openclaw-config'
import { requireAdmin } from '@/lib/auth'
import { DEERFLOW_READONLY_TOOL_DEFS } from '@/lib/deerflow-tools'
import { NEWSROOM_DIRECTOR_TOOLS } from '@/lib/newsroom-director'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function classify(name) {
  if (/^(voice_call|tts|stt|hangup|dial|call_)/i.test(name)) return 'Voice & Phone'
  if (/^nylas_/i.test(name)) return 'Email & Calendar (Nylas)'
  if (/^crm_/i.test(name)) return 'CRM (legacy)'
  if (/mindstudio/i.test(name)) return 'AI Workflow / MindStudio'
  if (name === 'deerflow_studio_produce') return 'DeerFlow Studio (produces files)'
  if (/^deerflow_/i.test(name)) return 'DeerFlow Read-Only'
  if (name === 'deep_research_dossier') return 'DeerFlow Read-Only'
  if (/^fcc_/i.test(name)) return 'CRM (FCC plugin)'
  if (/^leads_|investigative-news/i.test(name)) return 'Outreach & Research'
  return 'Other / Plugin'
}

function runtimeProvidersFor(entry) {
  const name = String(entry?.name || '')
  const source = String(entry?.source || '')
  if (name === 'deep_research_dossier' || /^deerflow_/.test(name) || source === 'deerflow-readonly') {
    return ['deerflow-hetzner']
  }
  return ['openclaw-hetzner']
}

function parseFccPluginTools() {
  const f = path.join(process.cwd(), 'scripts', 'fcc-unified-plugin-index.ts')
  if (!fs.existsSync(f)) return []
  const lines = fs.readFileSync(f, 'utf8').split('\n')
  const tools = []
  const seen = new Set()
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/name:\s*["']([a-zA-Z0-9_]+)["']/)
    if (!m) continue
    const name = m[1]
    if (!/^(fcc|crm|nylas)_/.test(name)) continue
    if (seen.has(name)) continue
    seen.add(name)
    let description = ''
    for (let j = i + 1; j < Math.min(i + 30, lines.length); j++) {
      const dm = lines[j].match(/description:\s*["']([^"']+)["']/)
      if (dm) { description = dm[1]; break }
    }
    tools.push({ name, description, source: 'fcc-plugin', callable: true, runtimeProviders: ['openclaw-hetzner'] })
  }
  return tools
}

// Parse the TOOLS = { name: { description, run } } dispatcher in /api/agent/execute/route.js
// so individual tool names like "get_account", "find_client", "scan_security" register too.
function parseExecuteDispatcherTools() {
  const f = path.join(process.cwd(), 'app', 'api', 'agent', 'execute', 'route.js')
  if (!fs.existsSync(f)) return []
  const txt = fs.readFileSync(f, 'utf8')
  const start = txt.indexOf('const TOOLS = {')
  if (start < 0) return []
  // Find matching closing brace by depth
  let depth = 0, end = -1
  for (let i = start; i < txt.length; i++) {
    if (txt[i] === '{') depth++
    else if (txt[i] === '}') { depth--; if (depth === 0) { end = i; break } }
  }
  if (end < 0) return []
  const block = txt.slice(start, end)
  const out = []
  const seen = new Set()
  // Match top-level keys followed by ': {' then 'description: '...'
  const re = /^\s{2}([a-z_][a-z_0-9]*)\s*:\s*\{[\s\S]*?description:\s*['"]([^'"]+)['"]/gm
  let m
  while ((m = re.exec(block))) {
    if (seen.has(m[1])) continue
    seen.add(m[1])
    const entry = { name: m[1], description: m[2], source: 'fcc-call-sub', callable: false }
    out.push({ ...entry, runtimeProviders: runtimeProvidersFor(entry) })
  }
  return out
}

function extractFromOpenclawConfig(cfg) {
  const tools = []
  const seen = new Set()
  const push = (name, opts = {}) => {
    if (!name || typeof name !== 'string' || seen.has(name)) return
    seen.add(name)
    tools.push({
      name,
      description: opts.description || '',
      source: opts.source || 'openclaw-base',
      callable: opts.callable !== false,
      runtimeProviders: ['openclaw-hetzner'],
    })
  }

  // Top-level allowlist — every agent gets these. Toggle in alsoAllow gates real function.
  const baseAllow = cfg?.tools?.alsoAllow
  if (Array.isArray(baseAllow)) {
    for (const name of baseAllow) {
      push(name, { source: 'openclaw-base', description: 'Granted to every agent (top-level allowlist).', callable: true })
    }
  }

  // Per-agent tools — names referenced by some agent's alsoAllow. These are tracked
  // but only callable if also registered as a real plugin tool.
  const agents = Array.isArray(cfg?.agents?.list) ? cfg.agents.list : []
  for (const a of agents) {
    const t = a?.tools
    let names = []
    if (Array.isArray(t)) names = t.filter(x => typeof x === 'string')
    else if (Array.isArray(t?.alsoAllow)) names = t.alsoAllow
    for (const name of names) {
      if (!seen.has(name)) {
        push(name, {
          source: 'openclaw-agent',
          description: `Referenced by agent: ${a?.id || a?.name || '(unknown)'}`,
          callable: /^(fcc_|nylas_|crm_|leads_|clients_|payments_|domains_|credentials_|voice_call$)/.test(name),
        })
      }
    }
  }

  return tools
}

export async function GET(request) {
  const { error } = await requireAdmin(request)
  if (error) return error
  const sources = { openclaw: { ok: false, reason: '' }, fcc: { ok: false }, crm: { ok: false }, deerflow: { ok: true, reason: 'fixed read-only allowlist' }, deepseekHarness: { ok: true, reason: 'conversation-only profile; no tools enabled' } }
  const merged = new Map() // name -> { name, description, source, sources: [...], runtimeProviders: [...] }

  const add = (entry) => {
    const runtimes = Array.isArray(entry.runtimeProviders) && entry.runtimeProviders.length
      ? entry.runtimeProviders
      : runtimeProvidersFor(entry)
    const existing = merged.get(entry.name)
    if (existing) {
      if (!existing.sources.includes(entry.source)) existing.sources.push(entry.source)
      for (const runtimeProvider of runtimes) {
        if (!existing.runtimeProviders.includes(runtimeProvider)) existing.runtimeProviders.push(runtimeProvider)
      }
      if (!existing.description && entry.description) existing.description = entry.description
      existing.callable = Boolean(existing.callable || entry.callable)
    } else {
      merged.set(entry.name, { ...entry, runtimeProviders: runtimes, sources: [entry.source] })
    }
  }

  // 1. OpenClaw live config
  try {
    const cfg = await readOpenclawConfig()
    sources.openclaw.ok = true
    extractFromOpenclawConfig(cfg).forEach(add)
  } catch (e) {
    sources.openclaw.reason = e.message
  }

  // 2. FCC unified plugin index (always-readable, local file)
  try {
    parseFccPluginTools().forEach(add)
    sources.fcc.ok = true
  } catch (e) {
    sources.fcc.reason = e.message
  }

  // 3. fcc_call sub-tools — vocabulary the agent can pass as the `tool` arg.
  //    Marked callable=false because they're NOT directly callable; gating happens
  //    at fcc_call level. Surfaced so the UI can document them, not toggle them.
  try {
    parseExecuteDispatcherTools().forEach(add)
    Object.entries(NEWSROOM_DIRECTOR_TOOLS).forEach(([name, definition]) => add({
      name,
      description: definition.description,
      source: 'fcc-plugin',
      callable: true,
      runtimeProviders: ['openclaw-hetzner'],
    }))
    sources.crm.ok = true
  } catch (e) {
    sources.crm.reason = e.message
  }

  // 4. DeerFlow read-only CRM bridge tools. These are fixed GET-only wrappers;
  //    mutating DeerFlow endpoints are intentionally not exposed here.
  DEERFLOW_READONLY_TOOL_DEFS.forEach(def => add({
    name: def.name,
    description: def.description,
    source: 'deerflow-readonly',
    callable: true,
    runtimeProviders: ['deerflow-hetzner'],
  }))

  // Split: callable (toggles really gate function) vs vocabulary (fcc_call sub-tools).
  const all = Array.from(merged.values()).map(t => ({ ...t, category: classify(t.name) }))
  const callable = all.filter(t => t.callable !== false)
  const vocabulary = all.filter(t => t.callable === false)

  const groups = {}
  for (const t of callable) {
    if (!groups[t.category]) groups[t.category] = []
    groups[t.category].push(t)
  }
  for (const cat of Object.keys(groups)) groups[cat].sort((a, b) => a.name.localeCompare(b.name))
  vocabulary.sort((a, b) => a.name.localeCompare(b.name))

  return NextResponse.json({
    ok: true,
    sources,
    counts: {
      total: all.length,
      callable: callable.length,
      vocabulary: vocabulary.length,
      byCategory: Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, v.length])),
    },
    groups,        // toggleable tools, grouped by category — these REALLY gate function
    vocabulary,    // fcc_call sub-tools — for prompt vocabulary, not toggling
    flat: all,
    generatedAt: new Date().toISOString(),
  })
}
