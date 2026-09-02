// Enumerate the three API surfaces in the stack:
//  1. CRM endpoints — every Next.js route under app/api/ (HTTP methods auto-detected).
//  2. OpenClaw tools — what Matilda can call, parsed from scripts/fcc-unified-plugin-index.ts.
//  3. External SDKs — third-party packages from package.json that the CRM/OpenClaw call out to.
import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { requireAdmin } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// --- 1. CRM endpoints ---
function walkApi(dir, base = '') {
  const out = []
  if (!fs.existsSync(dir)) return out
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const sub = path.join(dir, ent.name)
    if (ent.isDirectory()) {
      out.push(...walkApi(sub, base + '/' + ent.name))
    } else if (/^route\.(js|ts|tsx|mjs)$/.test(ent.name)) {
      const src = fs.readFileSync(sub, 'utf8')
      const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
        .filter(m => new RegExp('export\\s+async\\s+function\\s+' + m + '\\b').test(src))
      out.push({ path: '/api' + base, methods, file: 'app/api' + base + '/' + ent.name })
    }
  }
  return out
}

// --- 2. OpenClaw tools ---
function parseOpenclawTools() {
  const f = path.join(process.cwd(), 'scripts', 'fcc-unified-plugin-index.ts')
  if (!fs.existsSync(f)) return []
  const src = fs.readFileSync(f, 'utf8')
  const tools = []
  // Match the start of each tool object in the tools array. We pair name + description
  // by scanning forward up to ~30 lines from each `name: "fcc_..."`.
  const lines = src.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/name:\s*["']([a-zA-Z0-9_]+)["']/)
    if (!m) continue
    if (m[1] === 'Farrington CC — Unified Command Center Tools') continue // top-level plugin name, not a tool
    let description = ''
    for (let j = i + 1; j < Math.min(i + 30, lines.length); j++) {
      const dm = lines[j].match(/description:\s*["']([^"']+)["']/)
      if (dm) { description = dm[1]; break }
    }
    tools.push({ name: m[1], description })
  }
  // Dedupe by name (in case a name appears as a parameter description too)
  const seen = new Set()
  return tools.filter(t => {
    if (!t.name.startsWith('fcc_') && !t.name.startsWith('crm_') && !t.name.startsWith('nylas_')) return false
    if (seen.has(t.name)) return false
    seen.add(t.name)
    return true
  })
}

// --- 3. External SDKs ---
function externalSdks() {
  const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'))
  const all = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) }
  // Group SDKs by which "node" they belong to (usefulness matters more than precision).
  const groups = {
    'CRM (Next.js)': ['next', 'react', 'react-dom', 'tailwindcss'],
    'AI / Voice': ['@anthropic-ai/sdk', '@elevenlabs/react', '@elevenlabs/elevenlabs-js', 'openai'],
    'Email / Calendar': ['resend', 'nylas', '@nylas/nylas-js'],
    'Telephony / Video': ['twilio', '@twilio/voice-sdk', '@daily-co/daily-js'],
    'Payments': ['stripe', '@stripe/stripe-js', '@stripe/react-stripe-js'],
    'Cloud / Storage': ['firebase', 'firebase-admin', 'googleapis', '@google-cloud/storage'],
    'OpenClaw Bridge': ['ws'],
  }
  const out = {}
  for (const [group, names] of Object.entries(groups)) {
    const present = names.filter(n => all[n])
    if (present.length) out[group] = present.map(n => ({ name: n, version: all[n] }))
  }
  // Catch-all: any other prominent runtime deps not in groups
  const claimed = new Set(Object.values(groups).flat())
  const other = Object.entries(all).filter(([n]) => !claimed.has(n) && !n.startsWith('@types/') && !/^(eslint|postcss|autoprefixer|typescript|tsx|prettier)/.test(n))
  if (other.length) out['Other Runtime'] = other.slice(0, 20).map(([n, v]) => ({ name: n, version: v }))
  return out
}

export async function GET(request) {
  const { error: __adminError } = await requireAdmin(request); if (__adminError) return __adminError
  try {
    const apiDir = path.join(process.cwd(), 'app', 'api')
    const crm = walkApi(apiDir).sort((a, b) => a.path.localeCompare(b.path))
    const tools = parseOpenclawTools()
    const sdks = externalSdks()
    return NextResponse.json({
      ok: true,
      counts: { crm: crm.length, openclaw: tools.length, sdkGroups: Object.keys(sdks).length },
      crmRoutes: crm,
      openclawTools: tools,
      externalSdks: sdks,
      generatedAt: new Date().toISOString(),
    })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
