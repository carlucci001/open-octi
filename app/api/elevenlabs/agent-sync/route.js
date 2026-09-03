// Sync a CRM agent's persona to its ElevenLabs ConvAI agent record.
// Reads:
//   data/agents.json[agentId]                 → jobDescription (prompt), name, voiceProfile
//   data/voice-agent-roster.json[agentId]     → ElevenLabs agentId + voiceId
//   data/credentials.json (Eleven Labs entry) → API key
//
// Pushes to ElevenLabs:
//   conversation_config.agent.prompt.prompt   ← jobDescription
//   conversation_config.agent.first_message   ← computed greeting
//   conversation_config.tts.voice_id          ← roster voiceId
//
// Does NOT touch:
//   - LLM model (separate button — model selection is its own concern)
//   - Tool list (separate flow — tools are wired by sysadmin, not persona-tweakers)
//   - Override allowlist (system-level config)
//
// Auth: requires the agent to already have an ElevenLabs binding in voice-agent-roster.json.
// If it doesn't, returns 404 with an explicit "binding missing" message — does NOT auto-create.

import { NextResponse } from 'next/server'
import { readData, writeData } from '@/lib/dataStore'
import { COMMAND_CENTER_MENU_GUIDE } from '@/lib/commandCenterNavigation'
import { OFFICE_AGENT_CONDUCT } from '@/lib/agentOfficeConduct'
import { requireCapability } from '@/lib/permissions'
import { WNC_TIMES_AGENT_ID, WNC_TIMES_FIRST_MESSAGE } from '@/lib/wnc-times-agent'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function getElevenKey() {
  const creds = readData('credentials.json') || { credentials: [] }
  const entry = creds.credentials.find(c => (c.name || '').toLowerCase().includes('eleven'))
  if (!entry) return null
  const f = (entry.fields || []).find(x => /key|token/i.test(x.label || ''))
  return f?.value?.trim() || null
}

function buildFirstMessage(agent, agentId) {
  if (agentId === WNC_TIMES_AGENT_ID) return WNC_TIMES_FIRST_MESSAGE
  // Phone receptionist agents → formal company greeting (callers expect it).
  // Other agents → minimal in-CRM greeting (Carl shouldn't hear bot-speak when he opens her).
  const isReceptionist = agent.category === 'customer-facing'
    && (agent.channels || []).includes('phone')
  if (isReceptionist) {
    const company = agentId === 'newsroom-receptionist' ? 'ContentHub' : 'Farrington Development'
    return `${company}, this is ${agent.name}.`
  }
  return 'Okay Carl.'  // brief pickup for Command Center voice; live sessions may override with a varied pickup.
}

function buildElevenLabsPrompt(agent, agentId) {
  const base = (agent.jobDescription || '').trim()
  if (agentId === WNC_TIMES_AGENT_ID || agent.publicWidget?.enabled === true) return base
  const wakePickup = !/COMMAND CENTER VOICE PICKUP|MAGGIE VOICE PICKUP/i.test(base) ? `

COMMAND CENTER VOICE PICKUP:
- When the live voice session starts from a wake phrase and Carl has not given a task yet, answer with one brief natural pickup, then wait.
- Vary the pickup. Good examples: "Okay Carl.", "Right on it.", "I'm here.", "Go ahead.", "Yep.", "With you."
- Do not say "yeah, what do you need", "how can I help", or any generic assistant greeting as the pickup line.
- After Carl gives the actual task, stay brief, direct, and use the available tools when needed.` : ''
  const officeConduct = base.includes('OFFICE OPERATING STYLE - QUIET MODE') ? '' : `\n${OFFICE_AGENT_CONDUCT}`
  const handoffs = `

ELEVENLABS TEAM HANDOFFS:
- Frank is the Finance Manager. He handles invoices, payments, billing, cash flow, receivables, overdue items, subscriptions, provider spend, Stripe/payment-link workflows, and finance risk.
- If Carl says "Frank", "Hey Frank", "Frankie", "finance manager", "billing", "invoice", "payment", "cash flow", "receivables", or asks to transfer/connect/route/send him to Frank, call transfer_to_agent with agentName "Frank" immediately.
- Other teammate handoffs: Maggie for office management, Matilda for primary Command Center voice, Craig for code/engineering, Sasha for media/social, Linda for legal/contracts, Cameron for communications, Mark for marketing, Doreen for phone reception, Diane for morning brief.
- If Carl asks to transfer/connect/route/send him to any named teammate, call transfer_to_agent immediately with agentName set to that teammate. The reason is optional. Never ask Carl to provide a reason, availability, or extra context before transferring. Do not say a teammate is unavailable unless the transfer tool returns that result.`
  const screenControl = `

ELEVENLABS COMMAND CENTER SCREEN CONTROL:
- For voice sessions, use navigate_to to open Command Center sections for Carl.
- Use open_record to open a specific account, client, contact, lead, opportunity, project, or domain.
- Use navigate_to with section "repository" when Carl asks for the repo, source control, Git, or Gitea workspace.
- If Carl says "open an account" or gives a record type without a name, call navigate_to with section "accounts".
- Do not say you are not wired for screen control when these tools are attached.
- After opening a screen or record, keep the spoken response minimal: "Opened." or "Opening it now." No follow-up offers.
- When Carl says he is done, goodbye, bye, have a good day, end the call, hang up, disconnect, stop listening, or anything similar, say one short natural goodbye and call end_session or end_call. Never say only Carl can end the call.

AUTHORITATIVE COMMAND CENTER MENU MAP:
${COMMAND_CENTER_MENU_GUIDE}

REPOSITORY RULE:
Repository is its own top-level menu item. If Carl says repository, repo, Gitea, Git, source control, source code, or code repository, call navigate_to with section "repository". Do not open Documents, Products, Product Lab, or Ops Lab for repository requests.`
  return `${base}${wakePickup}${officeConduct}${base.includes('ELEVENLABS TEAM HANDOFFS') ? '' : handoffs}${base.includes('ELEVENLABS COMMAND CENTER SCREEN CONTROL') || base.includes('ELEVENLABS IN-CRM SCREEN CONTROL') ? '' : screenControl}`
}

export async function POST(request) {
  const { error } = await requireCapability(request, 'agents:manage')
  if (error) return error

  let body; try { body = await request.json() } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }) }
  const agentId = String(body?.agentId || '').trim()
  const dryRun = !!body?.dryRun
  if (!agentId) return NextResponse.json({ error: 'agentId required' }, { status: 400 })

  const apiKey = getElevenKey()
  if (!apiKey) return NextResponse.json({ error: 'ElevenLabs API key not in vault' }, { status: 503 })

  const agentsFile = readData('agents.json') || { agents: {} }
  const agent = agentsFile.agents?.[agentId]
  if (!agent) return NextResponse.json({ error: `Agent ${agentId} not found in agents.json` }, { status: 404 })

  const roster = readData('voice-agent-roster.json') || {}
  const binding = roster[agentId]
  if (!binding?.agentId) {
    return NextResponse.json({
      error: `${agent.name} (${agentId}) has no ElevenLabs binding in voice-agent-roster.json. Add one first via the agent-creation flow, then sync.`,
      needsBinding: true,
    }, { status: 404 })
  }

  const prompt = buildElevenLabsPrompt(agent, agentId)
  const firstMessage = buildFirstMessage(agent, agentId)
  const voiceId = binding.voiceId

  if (!prompt) return NextResponse.json({ error: `${agent.name} has no jobDescription — fill it in the agent manager first` }, { status: 400 })

  // Build the proposed PATCH body
  const patch = {
    conversation_config: {
      agent: {
        first_message: firstMessage,
        prompt: { prompt },
      },
      ...(voiceId ? { tts: { voice_id: voiceId } } : {}),
    },
  }

  // DRY RUN — fetch current state, return diff payload, NO PATCH
  if (dryRun) {
    try {
      const r = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${binding.agentId}`, {
        headers: { 'xi-api-key': apiKey },
      })
      if (!r.ok) {
        const t = await r.text()
        return NextResponse.json({ error: `ElevenLabs read ${r.status}: ${t.slice(0, 200)}` }, { status: 502 })
      }
      const j = await r.json()
      const cur = j.conversation_config || {}
      return NextResponse.json({
        ok: true,
        dryRun: true,
        agentId,
        elevenLabsAgentId: binding.agentId,
        current: {
          firstMessage: cur.agent?.first_message || '',
          prompt: cur.agent?.prompt?.prompt || '',
          voiceId: cur.tts?.voice_id || '',
        },
        proposed: {
          firstMessage,
          prompt,
          voiceId: voiceId || '',
        },
        diffs: {
          firstMessage: (cur.agent?.first_message || '') !== firstMessage,
          prompt: (cur.agent?.prompt?.prompt || '') !== prompt,
          voice: (cur.tts?.voice_id || '') !== (voiceId || cur.tts?.voice_id || ''),
        },
      })
    } catch (e) {
      return NextResponse.json({ error: 'Dry-run read failed: ' + e.message }, { status: 500 })
    }
  }

  // EXECUTE — actually push the PATCH
  try {
    const r = await fetch(`https://api.elevenlabs.io/v1/convai/agents/${binding.agentId}`, {
      method: 'PATCH',
      headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    const text = await r.text()
    let data; try { data = JSON.parse(text) } catch { data = { raw: text } }
    if (!r.ok) {
      return NextResponse.json({ error: `ElevenLabs ${r.status}: ${data?.detail?.message || data?.detail || 'unknown'}` }, { status: 502 })
    }

    agent.lastSyncedToElevenLabs = new Date().toISOString()
    agentsFile.agents[agentId] = agent
    agentsFile.lastUpdated = new Date().toISOString()
    writeData('agents.json', agentsFile)

    return NextResponse.json({
      ok: true,
      agentId,
      elevenLabsAgentId: binding.agentId,
      voiceId,
      promptLength: prompt.length,
      firstMessage,
      syncedAt: agent.lastSyncedToElevenLabs,
    })
  } catch (e) {
    return NextResponse.json({ error: 'Sync failed: ' + e.message }, { status: 500 })
  }
}

export async function GET(request) {
  const { error } = await requireCapability(request, 'agents:use')
  if (error) return error

  // Read-only — show whether each agent is in sync (has been synced + has binding)
  const agentsFile = readData('agents.json') || { agents: {} }
  const roster = readData('voice-agent-roster.json') || {}
  const out = []
  for (const [id, a] of Object.entries(agentsFile.agents || {})) {
    const binding = roster[id]
    out.push({
      id,
      name: a.name,
      hasBinding: !!binding?.agentId,
      voiceName: binding?.voiceName || null,
      lastSyncedAt: a.lastSyncedToElevenLabs || null,
      promptLength: (a.jobDescription || '').length,
    })
  }
  return NextResponse.json({
    ok: true,
    agents: out,
  })
}
