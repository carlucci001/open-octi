// A voice tool is declared in three places that nothing forced to agree:
//
//   1. the ElevenLabs agent      (scripts/register-*-tools.js)
//   2. CLIENT_TOOL_NAMES         (app/components/VoiceSession.js)
//   3. the handler itself        (inside start() in the same file)
//
// When they drift, the agent still offers the capability out loud, the call
// falls into the missing-handler branch, and the model narrates the error
// string as success. Nothing throws, nothing alerts, and the operator finds
// out weeks later that a purchase never happened. That is exactly how
// `register_domain` sat live-but-dead: declared on Craig, absent from both
// other places, for as long as git history goes back.
//
// These tests close both directions of that gap.
import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

const root = process.cwd()
const read = file => fs.readFileSync(path.join(root, file), 'utf8')

const VOICE_SESSION = 'app/components/VoiceSession.js'

// Tool names declared on agents but deliberately handled somewhere other than
// the browser client-tool map. Add here ONLY with a reason, never to silence.
const NOT_BROWSER_HANDLED = new Set([])

function clientToolNames(source) {
  const block = source.match(/const CLIENT_TOOL_NAMES = \[([\s\S]*?)\n\]/)
  if (!block) throw new Error('CLIENT_TOOL_NAMES not found in ' + VOICE_SESSION)
  return [...block[1].matchAll(/'([a-z0-9_]+)'/g)].map(m => m[1])
}

// A name counts as implemented when, outside the CLIENT_TOOL_NAMES literal,
// it appears either as an object key (`name: async (...)`, or an alias like
// `end_call: endVoiceSession`) or as a later assignment onto the handler map
// (`clientTools.fcc_open_record = ...`).
function implementedNames(source) {
  const withoutList = source.replace(/const CLIENT_TOOL_NAMES = \[[\s\S]*?\n\]/, '')
  const keys = [...withoutList.matchAll(/^\s{2,}([a-z0-9_]+):\s/gm)].map(m => m[1])
  const assigned = [...withoutList.matchAll(/\bclientTools\.([a-z0-9_]+)\s*=/g)].map(m => m[1])
  return new Set([...keys, ...assigned])
}

function declaredAgentTools() {
  const dir = path.join(root, 'scripts')
  const files = fs.readdirSync(dir).filter(f => /^(register-.*-tools|add-.*-tool)\.js$/.test(f))
  const declared = new Map()
  for (const file of files) {
    const source = fs.readFileSync(path.join(dir, file), 'utf8')
    for (const match of source.matchAll(/\bname:\s*'([a-z][a-z0-9_]*)'/g)) {
      if (!declared.has(match[1])) declared.set(match[1], new Set())
      declared.get(match[1]).add(file)
    }
  }
  return declared
}

describe('voice tool contract', () => {
  it('every tool declared on an agent is one the browser can actually handle', () => {
    const known = new Set(clientToolNames(read(VOICE_SESSION)))
    const orphans = []
    for (const [name, files] of declaredAgentTools()) {
      if (known.has(name) || NOT_BROWSER_HANDLED.has(name)) continue
      orphans.push(`${name} (declared in ${[...files].join(', ')})`)
    }
    expect(
      orphans,
      `These tools are offered to agents but Command Center has no handler for them. The agent will announce the capability, the call will fail silently, and the model will narrate the failure as success. Either implement the handler and add the name to CLIENT_TOOL_NAMES, or stop declaring the tool:\n  ${orphans.join('\n  ')}`,
    ).toEqual([])
  })

  it('every name in CLIENT_TOOL_NAMES has a real implementation', () => {
    const source = read(VOICE_SESSION)
    const implemented = implementedNames(source)
    const missing = clientToolNames(source).filter(name => !implemented.has(name))
    expect(
      missing,
      `Listed in CLIENT_TOOL_NAMES but never implemented, so calls hit the "Tool X not ready." branch:\n  ${missing.join('\n  ')}`,
    ).toEqual([])
  })

  it('every Command Center live session requires attached tools and immediate named transfers', () => {
    const source = read(VOICE_SESSION)
    const sharedConduct = read('lib/agentOfficeConduct.js')
    const geminiRoute = read('app/api/voice/gemini-live-token/route.js')
    const openAiRoute = read('app/api/voice/openai/session/route.js')
    expect(source).toContain('COMMAND_CENTER_LIVE_VOICE_RULES')
    expect(sharedConduct).toContain('call transfer_to_agent immediately')
    expect(sharedConduct).toContain('Never say you cannot transfer when transfer_to_agent is attached')
    expect(sharedConduct).toContain('call that exact tool before answering')
    expect(sharedConduct).toContain('unless the matching tool returned success')
    expect(source).toContain("identityLine, '', COMMAND_CENTER_LIVE_VOICE_RULES")
    expect(geminiRoute).toContain('COMMAND_CENTER_LIVE_VOICE_RULES')
    expect(openAiRoute).toContain('COMMAND_CENTER_LIVE_VOICE_RULES')
  })

  it('buying a domain stays a two-step, price-bound purchase', () => {
    const source = read(VOICE_SESSION)
    expect(source).toContain('register_domain:')
    expect(source).toContain("fetch('/api/domains/register'")
    // The quote phase must never auto-buy without a confirmToken.
    expect(source).toContain("j.phase === 'quote'")

    const route = read('app/api/domains/register/route.js')
    expect(route).toContain('requireCrmWrite')
    expect(route).toContain('timingSafeEqual')
    // The quoted price is signed into the token and re-checked before charging.
    expect(route).toContain('Math.abs(recheck.price - Number(claim.p))')
  })

  it('never promises a price the availability tool cannot produce', () => {
    // The old tool description advertised a price from a pure RDAP lookup,
    // which is what let an agent invent one. Availability and price now come
    // from separate sources and a null price is stated as a null.
    const availability = read('app/api/tools/domain-availability/route.js')
    expect(availability).toContain('price: null')
    expect(availability).toContain('pricing_error')
    expect(read(VOICE_SESSION)).toContain('do not guess one')
  })

  it('the detector itself still catches a declared-but-unhandled tool', () => {
    // Without this, the guard can rot into a no-op that passes forever. A
    // fixture shaped like the real file, with one tool listed and no handler,
    // must read as missing.
    const fixture = [
      'const CLIENT_TOOL_NAMES = [',
      "  'ghost_tool', 'real_tool',",
      ']',
      'const clientTools = {',
      "  real_tool: async () => 'ok',",
      '}',
    ].join('\n')
    expect(clientToolNames(fixture)).toEqual(['ghost_tool', 'real_tool'])
    const implemented = implementedNames(fixture)
    expect(implemented.has('real_tool')).toBe(true)
    expect(implemented.has('ghost_tool')).toBe(false)
  })
})
