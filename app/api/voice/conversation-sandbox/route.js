import { NextResponse } from 'next/server'
import { getCred } from '@/lib/agent-creds'
import { readData, writeData } from '@/lib/dataStore'
import { requireCapability } from '@/lib/permissions'
import { openclawChat } from '@/lib/openclaw-client'
import { buildVoiceUsageEvent, logVoiceUsage } from '@/lib/voiceUsage'
import { generateVibeVoiceSpeech, VIBEVOICE_MODELS } from '@/lib/vibevoice'
import { PRESET_BY_ID } from '@/lib/agent-presets'
import { CHIRP3_VOICES } from '@/lib/chirp3-tts'
import { isOpenOcti } from '@/lib/edition'
import { resolveProviderKey } from '@/lib/openocti-keys'
import { runDeepResearchDossier } from '@/lib/deep-research'
import { latestUnfiledDossier, fileDossierToAccount, resolveAccountByPhrase } from '@/lib/research-dossiers'
import { resolveDeerFlowResearchTarget } from '@/lib/deerflow-voice-turn'
import { runDeerFlowStudioTask } from '@/lib/deerflow-studio'
import {
  canProduce,
  parseStudioRequest,
  isStudioCancel,
  isStudioStatusQuestion,
  KIND_COST_HINT,
} from '@/lib/deerflow-studio-voice'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const GEMINI_MODELS = ['gemini-2.5-pro-preview-tts', 'gemini-3.1-flash-tts-preview', 'gemini-2.5-flash-preview-tts']
const GEMINI_CHIRP_TTS_MODEL = 'gemini-2.5-flash-preview-tts'
const GEMINI_VOICES = ['Kore', 'Charon', 'Puck', 'Orus', 'Algenib', 'Gacrux', 'Schedar', 'Sulafat', 'Achird', 'Vindemiatrix', 'Zephyr', 'Aoede', 'Algieba', 'Despina', 'Rasalgethi']
const ELEVEN_MODELS = ['eleven_multilingual_v2', 'eleven_turbo_v2_5']
const VIBEVOICE_VOICES = ['default', 'internal-test']
const PROVIDERS = ['gemini', 'chirp3', 'elevenlabs', 'vibevoice', 'chatterbox']

function geminiVoiceFromChirp3(voiceName) {
  const shortName = String(voiceName || '').split('-').pop()
  return GEMINI_VOICES.includes(shortName) ? shortName : 'Aoede'
}

function cleanText(value, max = 5000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function jsonError(message, status = 400, extra = {}) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status })
}

function getGeminiKey() {
  if (isOpenOcti()) return resolveProviderKey('gemini').key
  return getCred('gemini')?.key || getCred('google gemini')?.key || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || ''
}

function getElevenKey() {
  if (isOpenOcti()) return resolveProviderKey('elevenlabs').key
  return getCred('elevenlabs')?.key || getCred('eleven')?.key || process.env.ELEVENLABS_API_KEY || ''
}

function getOpenClawToken() {
  return getCred('open claw')?.key || getCred('openclaw')?.key || ''
}

function wavFromPcm(pcm, { channels = 1, sampleRate = 24000, bitsPerSample = 16 } = {}) {
  const byteRate = sampleRate * channels * bitsPerSample / 8
  const blockAlign = channels * bitsPerSample / 8
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + pcm.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(channels, 22)
  header.writeUInt32LE(sampleRate, 24)
  header.writeUInt32LE(byteRate, 28)
  header.writeUInt16LE(blockAlign, 32)
  header.writeUInt16LE(bitsPerSample, 34)
  header.write('data', 36)
  header.writeUInt32LE(pcm.length, 40)
  return Buffer.concat([header, pcm])
}

function pcmDurationSeconds(pcm, { channels = 1, sampleRate = 24000, bitsPerSample = 16 } = {}) {
  const bytesPerSecond = sampleRate * channels * bitsPerSample / 8
  return bytesPerSecond ? pcm.length / bytesPerSecond : 0
}

function resolveAgent(agentId) {
  const agentsFile = readData('agents.json') || { agents: {} }
  const agent = agentsFile.agents?.[agentId] || null
  if (agent) return { id: agentId, ...agent }
  const preset = PRESET_BY_ID[agentId] || null
  if (preset) return { id: agentId, ...preset, firstName: preset.firstName || String(preset.name || agentId).split(/\s+/)[0] }
  if (agentId === 'matilda') return { id: 'matilda', name: 'Matilda', firstName: 'Matilda', title: 'Default voice assistant' }
  return { id: agentId || 'voice-lab', name: agentId || 'Voice Lab Agent', firstName: agentId || 'Agent' }
}

function agentPrompt(agent, userText, messages = []) {
  const recent = messages
    .slice(-6)
    .map(m => `${m.role === 'assistant' ? agent.firstName || agent.name || 'Agent' : 'Carl'}: ${cleanText(m.content, 900)}`)
    .join('\n')
  return [
    `You are ${agent.name || agent.firstName || 'a Farrington Command Center agent'}.`,
    agent.title ? `Title: ${agent.title}.` : '',
    agent.voiceProfile ? `Voice profile: ${agent.voiceProfile}.` : '',
    agent.description ? `Role context: ${agent.description}` : '',
    'This is the Voice Conversation Sandbox. Carl is testing live voice feel: phrasing, pace, politeness, pauses, and professional nuance.',
    'Answer conversationally in 1-3 short paragraphs. Do not claim that you performed CRM mutations in this sandbox. If an action would need a real tool, say what would happen in production.',
    recent ? `Recent sandbox turns:\n${recent}` : '',
    `Carl: ${userText}`,
  ].filter(Boolean).join('\n\n')
}

function fallbackReply(agent, userText) {
  const name = agent.firstName || agent.name || 'I'
  return `${name} here. I heard: "${cleanText(userText, 220)}" In this sandbox I can answer in character and speak the reply, but I won't mutate CRM records from this test lane.`
}

function isCapabilitiesQuestion(text) {
  return /\b(tool|tools|ability|abilities|capabilit|what can you do|help me with)\b/i.test(String(text || ''))
}

// "research powerdispatcher.com and place in account chad lamothe" —
// split the filing instruction off the research target so it never
// pollutes the target name, and remember where to auto-file on completion.
function splitInlineFiling(cleaned) {
  const m = cleaned.match(/[\s,]+(?:and\s+)?(?:then\s+)?(?:file|put|store|save|place)\s+(?:it|this|that)?\s*(?:in|into|to|under|on)?\s*(?:the)?\s*(.+)$/i)
  if (!m) return { target: cleaned, accountPhrase: '' }
  const phrase = String(m[1] || '')
    .replace(/\b(account'?s?|documents?|document folder|doc folder|folder|files?)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const target = cleaned.slice(0, m.index).trim()
  if (!target) return { target: cleaned, accountPhrase: '' }
  return { target, accountPhrase: phrase }
}

const RESEARCH_JOBS_FILE = 'voice-research-jobs.json'

function readResearchJobs() {
  const data = readData(RESEARCH_JOBS_FILE)
  return Array.isArray(data?.jobs) ? data.jobs : []
}

function saveResearchJob(job) {
  try {
    const jobs = readResearchJobs().filter(j => j.id !== job.id)
    jobs.push(job)
    writeData(RESEARCH_JOBS_FILE, { jobs: jobs.slice(-20), lastUpdated: new Date().toISOString() })
  } catch (e) {
    console.warn('[voice-research] job save failed', e?.message || e)
  }
}

function spokenDossierSummary(result, target) {
  const d = result?.dossier || {}
  const positives = (Array.isArray(d.positiveSignals) && d.positiveSignals.length) ? d.positiveSignals
    : (Array.isArray(d.reputationSignals) ? d.reputationSignals : [])
  const nextSteps = (Array.isArray(d.recommendedNextSteps) && d.recommendedNextSteps.length) ? d.recommendedNextSteps
    : (Array.isArray(d.nextSteps) ? d.nextSteps : [])
  return cleanText([
    d.executiveSummary || d.summary || `Deep research completed for ${target}.`,
    d.riskLevel ? `Risk level: ${d.riskLevel}.` : '',
    d.confidence ? `Confidence: ${d.confidence}.` : '',
    Array.isArray(d.redFlags) && d.redFlags.length ? `Main red flags: ${d.redFlags.slice(0, 3).join('; ')}.` : '',
    positives.length ? `Positive signals: ${positives.slice(0, 3).join('; ')}.` : '',
    nextSteps.length ? `Next steps: ${nextSteps.slice(0, 3).join('; ')}.` : '',
  ].filter(Boolean).join(' '), 1800)
}

function startBackgroundResearch({ target, label, role, fileToPhrase = '', agentId = 'deep-research-analyst', clientId = '', requestId = '' }) {
  const job = {
    id: `vrj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    target,
    status: 'running',
    startedAt: new Date().toISOString(),
    finishedAt: '',
    spokenSummary: '',
    error: '',
    fileToPhrase,
    filedNote: '',
  }
  saveResearchJob(job)
  runDeepResearchDossier({
    target,
    context: `Requested by Carl through the Chirp voice interface as ${label} (${role}).`,
    subjectType: 'person_or_company',
    usePerplexity: true,
    source: 'voice',
    agentId,
    clientId,
    accountId: clientId,
    productId: 'research',
    requestId,
  }).then(result => {
    const current = readResearchJobs().find(j => j.id === job.id)
    if (current?.status === 'cancelled') return
    let filedNote = ''
    if (fileToPhrase) {
      try {
        const pending = latestUnfiledDossier()
        if (pending && pending.target === target) {
          const res = fileDossierToAccount({ dossierId: pending.id, accountPhrase: fileToPhrase })
          filedNote = res.ok
            ? `Already filed to ${res.account.name}'s documents.`
            : `I couldn't match an account named "${fileToPhrase}" — the dossier is on the Research page, unfiled.`
        }
      } catch (e) {
        filedNote = `Auto-filing failed (${cleanText(e?.message || String(e), 120)}) — the dossier is on the Research page, unfiled.`
      }
    }
    saveResearchJob({ ...job, status: 'done', finishedAt: new Date().toISOString(), spokenSummary: spokenDossierSummary(result, target), filedNote })
  }).catch(e => {
    const current = readResearchJobs().find(j => j.id === job.id)
    if (current?.status === 'cancelled') return
    saveResearchJob({ ...job, status: 'failed', finishedAt: new Date().toISOString(), error: cleanText(e?.message || String(e), 300) })
  })
  return job
}

function isResearchStatusQuestion(text) {
  return /\b(any update|update|status|progress|done yet|finished|ready|how('?s| is) it (going|coming)|what did you find|results?)\b/i.test(String(text || ''))
}

// "put it in the Truk.ai account documents" / "file that under Dave Miller" /
// "leave it unfiled". Returns null when the utterance isn't a filing command.
function parseFilingCommand(text) {
  const raw = String(text || '').trim()
  if (/\b(leave (it|this|that)?\s*unfiled|don'?t file (it|this|that)?|no filing)\b/i.test(raw)) return { unfiled: true }
  const m = raw.match(/\b(?:file|put|store|save|place)\s+(?:it|this|that|the dossier|the report|the research|the results?)?\s*(?:in|into|to|under|on|at)?\s*(?:the)?\s*(.*)$/i)
  if (!m) return null
  let phrase = String(m[1] || '')
    .replace(/\b(account'?s?|documents?|document folder|doc folder|folder|files?)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return { phrase }
}

function filingReply(label, userText) {
  const cmd = parseFilingCommand(userText)
  if (!cmd) return null
  const pending = latestUnfiledDossier()
  if (!pending) return `${label} here. There is no unfiled dossier right now. Ask me to research a target first.`
  if (cmd.unfiled) return `Okay — the ${pending.target} dossier stays in the research archive, unfiled. You can file it anytime.`
  if (!cmd.phrase) return `Which account should I file the ${pending.target} dossier in?`
  const res = fileDossierToAccount({ dossierId: pending.id, accountPhrase: cmd.phrase })
  if (!res.ok) return `I couldn't find an account matching "${cmd.phrase}". Say the account name again, or say leave it unfiled.`
  return `Filed. The ${pending.target} dossier is now in ${res.account.name}'s documents as "${res.document.title}".`
}

function researchStatusReply(label) {
  const jobs = readResearchJobs().slice().reverse()
  const latest = jobs.find(j => j.status !== 'cancelled')
  if (!latest) return `${label} here. No research is running right now. Give me a target and I will start a deep dive.`
  if (latest.status === 'running') {
    const mins = Math.max(1, Math.round((Date.now() - new Date(latest.startedAt).getTime()) / 60000))
    return `Still working on ${latest.target} — about ${mins} minute${mins === 1 ? '' : 's'} in. I will have it shortly; ask me again in a bit.`
  }
  if (latest.status === 'failed') {
    return `The deep dive on ${latest.target} failed: ${latest.error || 'unknown error'}. Say the request again and I will retry.`
  }
  if (latest.filedNote) {
    return `Done. Here is what I found on ${latest.target}. ${latest.spokenSummary} ${latest.filedNote}`
  }
  return `Done. Here is what I found on ${latest.target}. ${latest.spokenSummary} Where do you want this dossier filed? Name an account, or say leave it unfiled.`
}

// ─── Studio production by voice (Iris / Wes only) ────────────────────────────
// Everything below is reachable ONLY through the canProduce() gate inside
// getDeerFlowReply, which requires runtimeProvider === 'deerflow-hetzner' AND
// the deerflow_studio_produce tool. OpenClaw / ElevenLabs agents — Maggie,
// Craig, Matilda — never enter this code. Do not lift these helpers out of that
// gate. Mirrors the background-research job pattern above deliberately: a voice
// turn must answer in seconds, and a render takes minutes.

const STUDIO_JOBS_FILE = 'voice-studio-jobs.json'

function readStudioJobs() {
  const data = readData(STUDIO_JOBS_FILE)
  return Array.isArray(data?.jobs) ? data.jobs : []
}

function saveStudioJob(job) {
  try {
    const jobs = readStudioJobs().filter(j => j.id !== job.id)
    writeData(STUDIO_JOBS_FILE, { jobs: [...jobs, job].slice(-20), lastUpdated: new Date().toISOString() })
  } catch (e) {
    console.warn('[voice-studio] job save failed', e?.message || e)
  }
}

function startBackgroundStudioJob({ kind, brief, label }) {
  const job = {
    id: `vsj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    kind,
    brief,
    status: 'running',
    startedAt: new Date().toISOString(),
    finishedAt: '',
    files: [],
    summary: '',
    assumptions: [],
    error: '',
  }
  saveStudioJob(job)
  runDeerFlowStudioTask({ kind, brief, context: `Requested by Carl by voice through ${label}.` })
    .then(result => {
      const current = readStudioJobs().find(j => j.id === job.id)
      if (current?.status === 'cancelled') return
      saveStudioJob({
        ...job,
        status: result?.ok ? 'done' : 'failed',
        finishedAt: new Date().toISOString(),
        files: (result?.files || []).map(f => ({ filename: f.filename, url: f.url, caption: f.caption })),
        summary: cleanText(result?.summary || '', 600),
        assumptions: Array.isArray(result?.assumptions) ? result.assumptions.slice(0, 3) : [],
        error: result?.ok ? '' : cleanText(result?.note || 'No files were produced.', 300),
      })
    })
    .catch(e => {
      const current = readStudioJobs().find(j => j.id === job.id)
      if (current?.status === 'cancelled') return
      saveStudioJob({ ...job, status: 'failed', finishedAt: new Date().toISOString(), error: cleanText(e?.message || String(e), 300) })
    })
  return job
}

function studioStatusReply(label) {
  const latest = readStudioJobs().slice().reverse().find(j => j.status !== 'cancelled')
  if (!latest) return `${label} here. Nothing is rendering right now. Tell me what you want made.`
  if (latest.status === 'running') {
    const mins = Math.max(1, Math.round((Date.now() - new Date(latest.startedAt).getTime()) / 60000))
    return `Still rendering the ${latest.kind} — about ${mins} minute${mins === 1 ? '' : 's'} in. Ask me again shortly.`
  }
  if (latest.status === 'failed') {
    return `The ${latest.kind} failed: ${latest.error || 'unknown error'}. Say it again and I will retry.`
  }
  const count = latest.files.length
  const assumption = latest.assumptions[0] ? ` One call I made: ${latest.assumptions[0]}` : ''
  if (!count) return `The ${latest.kind} finished but produced no file. Say it again and I will retry.`
  return `Done. The ${latest.kind} is ready — ${count === 1 ? latest.files[0].filename : `${count} files`}, on the studio page. ${latest.summary}${assumption}`
}

/**
 * Returns a spoken reply for a production turn, or null to fall through to the
 * existing research behaviour untouched.
 */
function studioVoiceReply({ agent, userText, label }) {
  // resolveAgent prefers the stored agents.json entry over the preset, and the
  // stored entry may not carry the tools array. Fall back to the preset's tools
  // so enabling Iris in Agent Manager doesn't silently disable her voice path.
  // runtimeProvider is still checked inside canProduce, so this cannot admit an
  // OpenClaw agent.
  const tools = Array.isArray(agent?.tools) && agent.tools.length
    ? agent.tools
    : (PRESET_BY_ID[agent?.id]?.tools || [])
  if (!canProduce({ ...agent, tools })) return null

  if (isStudioCancel(userText)) {
    const running = readStudioJobs().slice().reverse().find(j => j.status === 'running')
    if (!running) return null // let the research cancel branch answer
    saveStudioJob({ ...running, status: 'cancelled', finishedAt: new Date().toISOString() })
    return { text: `Cancelled the ${running.kind}. Nothing further will be charged for it.`, source: 'studio-cancelled' }
  }

  const request = parseStudioRequest(userText)
  if (!request) {
    const jobs = readStudioJobs().filter(j => j.status !== 'cancelled')
    const running = jobs.slice().reverse().find(j => j.status === 'running')

    // A render in flight owns the conversation. Carl asked "where do you plan on
    // putting my deliverables" and "are you really doing the jobs that I gave"
    // while a job was running, and both fell through to "tell me who or what you
    // want researched" — she looked like she had forgotten the task she was in
    // the middle of. While something is rendering, anything that is not a new
    // production request gets the status, not the research prompt.
    if (running) return { text: studioStatusReply(label), source: 'studio-status-running' }

    if (isStudioStatusQuestion(userText) && jobs.length) {
      return { text: studioStatusReply(label), source: 'studio-status' }
    }

    // Nothing running. A producer should still be able to research out loud, so
    // only take the turn when the utterance carries no research intent — that
    // way Wes can research before he builds, but Iris never asks Carl for a
    // research target he never wanted to give.
    const wantsResearch = /\b(research|deep dive|diligence|vet|investigate|look into|check out|analy[sz]e)\b/i.test(String(userText || ''))
    if (!wantsResearch) {
      const last = jobs.at(-1)
      const tail = last
        ? ` The last thing I made was the ${last.kind}${last.files?.[0] ? `, ${last.files[0].filename}` : ''}.`
        : ''
      return {
        text: `${label} here. Tell me what you want made — a clip, an image, a track, a deck, a chart.${tail}`,
        source: 'studio-ready',
      }
    }
    return null
  }

  startBackgroundStudioJob({ kind: request.kind, brief: request.brief, label })
  const cost = KIND_COST_HINT[request.kind]
  const costLine = cost ? ` That runs ${cost}.` : ''
  return {
    text: `On it. Starting the ${request.kind}.${costLine} Say cancel if that is not what you meant.`,
    source: 'studio-ack',
  }
}

async function getDeerFlowReply({ agent, userText, messages, usageContext = {} }) {
  const started = Date.now()
  const label = agent.name || agent.firstName || 'DeerFlow Research Analyst'
  const role = agent.role || agent.title || 'public-source research analyst'
  if (/just greeted you/i.test(String(userText || ''))) {
    return { text: `${label} here. How can I help?`, brainMs: Date.now() - started, source: 'deerflow-greeting' }
  }
  // Producers (Iris, Wes) get a shot at the turn first. Returns null for every
  // non-production utterance and for every agent that is not a producer, so the
  // research agents' behaviour below is unchanged.
  const studio = studioVoiceReply({ agent, userText, label })
  if (studio) return { ...studio, brainMs: Date.now() - started }
  // Cancel takes priority over everything — "cancel that last request you're
  // running a deep dive..." must cancel, never launch a new deep dive.
  if (/^\s*(?:no+[\s,]+)*(?:cancel|abort|stop that|never ?mind|scratch that|forget (?:it|that))\b/i.test(String(userText || ''))) {
    const running = readResearchJobs().slice().reverse().find(j => j.status === 'running')
    if (running) {
      saveResearchJob({ ...running, status: 'cancelled', finishedAt: new Date().toISOString() })
      return { text: `Cancelled the deep dive on ${running.target}. Give me the correct target whenever you're ready.`, brainMs: Date.now() - started, source: 'deerflow-cancelled' }
    }
    return { text: `Nothing is running right now, so there's nothing to cancel. Give me a target when you're ready.`, brainMs: Date.now() - started, source: 'deerflow-cancel-noop' }
  }
  // Filing commands take priority — "put it in the Truk.ai account documents"
  // must never be misread as a status question or a new research request.
  const filed = filingReply(label, userText)
  if (filed) {
    return { text: filed, brainMs: Date.now() - started, source: 'deerflow-filing' }
  }
  if (isCapabilitiesQuestion(userText)) {
    return {
      text: `${label}. I can run DeerFlow public-source research on people, companies, leads, markets, competitors, partners, projects, and websites. Ask me to research or vet a target and I will return credibility signals, risks, open questions, and next steps.`,
      brainMs: Date.now() - started,
      source: 'deerflow-capabilities',
    }
  }
  const rawTarget = resolveDeerFlowResearchTarget(userText, messages)
  if (!rawTarget) {
    if (isResearchStatusQuestion(userText)) {
      return { text: researchStatusReply(label), brainMs: Date.now() - started, source: 'deerflow-status' }
    }
    if (/\b(research|deep dive|diligence|vet|investigate)\b/i.test(String(userText || ''))) {
      return { text: 'Who or what should I research?', brainMs: Date.now() - started, source: 'deerflow-needs-target' }
    }
    return {
      text: 'Tell me who or what you want researched.',
      brainMs: Date.now() - started,
      source: 'deerflow-ready',
    }
  }
  const { target, accountPhrase } = splitInlineFiling(rawTarget)
  const destAccount = accountPhrase ? resolveAccountByPhrase(accountPhrase) : null
  startBackgroundResearch({ target, label, role, fileToPhrase: accountPhrase, agentId: agent.id, clientId: usageContext.clientId, requestId: usageContext.requestId })
  const filingLine = accountPhrase
    ? (destAccount ? ` I will file it in ${destAccount.name}.` : ` I will try to file it in ${accountPhrase}.`)
    : ''
  return {
    text: `Got it. Starting the deep dive on ${target}.${filingLine}`,
    brainMs: Date.now() - started,
    source: 'deerflow-ack',
  }
}

async function getBrainReply({ agent, userText, messages, sessionId, usageContext = {} }) {
  const started = Date.now()
  if (agent.runtimeProvider === 'deerflow-hetzner') {
    return getDeerFlowReply({ agent, userText, messages, usageContext })
  }
  try {
    const result = await openclawChat({
      message: agentPrompt(agent, userText, messages),
      sessionKey: `voice-sandbox:${agent.id}:${sessionId || 'default'}`,
      token: getOpenClawToken(),
      firstChunkMs: 12000,
      betweenChunksMs: 3500,
      maxMs: 45000,
    })
    const text = cleanText(result.text, 1800) || fallbackReply(agent, userText)
    return { text, brainMs: Date.now() - started, source: result.text ? 'openclaw' : 'fallback' }
  } catch (e) {
    return { text: fallbackReply(agent, userText), brainMs: Date.now() - started, source: 'fallback', warning: e.message }
  }
}

async function synthGemini({ text, model, voiceName, agentId, usageProvider = 'gemini', displayVoiceName = voiceName }) {
  const apiKey = getGeminiKey()
  if (!apiKey) throw new Error('No Gemini API key in vault or environment')
  const upstream = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName } } },
      },
      model,
    }),
  })
  const raw = await upstream.text()
  let data
  try { data = JSON.parse(raw) } catch { data = null }
  if (!upstream.ok) throw new Error(data?.error?.message || raw.slice(0, 240) || `Gemini TTS HTTP ${upstream.status}`)
  const inline = data?.candidates?.[0]?.content?.parts?.find(part => part.inlineData || part.inline_data)
  const b64 = inline?.inlineData?.data || inline?.inline_data?.data
  if (!b64) throw new Error('Gemini TTS returned no audio data')
  const pcm = Buffer.from(b64, 'base64')
  const audio = wavFromPcm(pcm)
  const usage = buildVoiceUsageEvent({ provider: usageProvider, model, voiceName: displayVoiceName, agentId, textChars: text.length, durationSeconds: pcmDurationSeconds(pcm), area: 'voice-sandbox' })
  logVoiceUsage({ provider: usageProvider, model, voiceName: displayVoiceName, agentId, textChars: text.length, durationSeconds: usage.durationSeconds, area: 'voice-sandbox' })
  return { audio, contentType: 'audio/wav', usage }
}

function resolveElevenVoice(agentId) {
  const roster = readData('voice-agent-roster.json') || {}
  const defaultCfg = readData('voice-agent.json') || {}
  if (!agentId || agentId === 'matilda') return { voiceId: defaultCfg.voiceId, voiceName: defaultCfg.voiceName || 'Matilda' }
  const binding = roster[agentId]
  return { voiceId: binding?.voiceId, voiceName: binding?.voiceName || binding?.firstName || binding?.name || agentId }
}

async function synthEleven({ text, model, agentId }) {
  const apiKey = getElevenKey()
  if (!apiKey) throw new Error('No ElevenLabs API key in vault or environment')
  const { voiceId, voiceName } = resolveElevenVoice(agentId)
  if (!voiceId) throw new Error('Selected agent does not have an ElevenLabs voice binding')
  const upstream = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: model, voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
  })
  const audio = Buffer.from(await upstream.arrayBuffer())
  if (!upstream.ok) {
    let message = audio.toString('utf8').slice(0, 240)
    try { message = JSON.parse(message)?.detail?.message || message } catch {}
    throw new Error(message || `ElevenLabs TTS HTTP ${upstream.status}`)
  }
  const usage = buildVoiceUsageEvent({ provider: 'elevenlabs', model, voiceName, agentId, textChars: text.length, durationSeconds: Math.max(1, text.length / 15), area: 'voice-sandbox' })
  logVoiceUsage({ provider: 'elevenlabs', model, voiceName, agentId, textChars: text.length, durationSeconds: usage.durationSeconds, area: 'voice-sandbox' })
  return { audio, contentType: 'audio/mpeg', usage }
}

async function synthVibeVoice({ text, model, voiceName, agentId }) {
  const result = await generateVibeVoiceSpeech({ text, model, voiceName })
  const usage = buildVoiceUsageEvent({ provider: 'vibevoice', model, voiceName: result.voiceName, agentId, textChars: text.length, durationSeconds: Math.max(1, text.length / 15), area: 'voice-sandbox' })
  logVoiceUsage({ provider: 'vibevoice', model, voiceName: result.voiceName, agentId, textChars: text.length, durationSeconds: usage.durationSeconds, area: 'voice-sandbox' })
  return { audio: result.audio, contentType: result.contentType, usage }
}

async function synthChirp3({ text, voiceName, agentId }) {
  const speech = await synthGemini({
    text,
    model: GEMINI_CHIRP_TTS_MODEL,
    voiceName: geminiVoiceFromChirp3(voiceName),
    agentId,
    usageProvider: 'chirp3',
    displayVoiceName: voiceName,
  })
  return speech
}

async function synthesize({ provider, text, model, voiceName, agentId }) {
  if (provider === 'gemini') {
    return synthGemini({
      text,
      model: GEMINI_MODELS.includes(model) ? model : GEMINI_MODELS[0],
      voiceName: GEMINI_VOICES.includes(voiceName) ? voiceName : 'Kore',
      agentId,
    })
  }
  if (provider === 'elevenlabs') {
    return synthEleven({
      text,
      model: ELEVEN_MODELS.includes(model) ? model : ELEVEN_MODELS[0],
      agentId,
    })
  }
  if (provider === 'chirp3') {
    return synthChirp3({
      text,
      voiceName: CHIRP3_VOICES.includes(voiceName) ? voiceName : CHIRP3_VOICES[0],
      agentId,
    })
  }
  if (provider === 'vibevoice') {
    return synthVibeVoice({
      text,
      model: VIBEVOICE_MODELS.includes(model) ? model : VIBEVOICE_MODELS[0],
      voiceName: VIBEVOICE_VOICES.includes(voiceName) ? voiceName : 'default',
      agentId,
    })
  }
  throw new Error(provider === 'chatterbox' ? 'Chatterbox server rendering is not installed on Ubuntu yet.' : `Unknown provider: ${provider}`)
}

function sanitizeProvider(provider) {
  return PROVIDERS.includes(provider) ? provider : 'gemini'
}

export async function POST(request) {
  const { error } = await requireCapability(request, 'voice:use')
  if (error) return error
  let body
  try { body = await request.json() } catch { return jsonError('Bad JSON body', 400) }

  const userText = cleanText(body.text || body.message)
  if (!userText) return jsonError('message is required', 400)

  const agentId = cleanText(body.agentId || 'finance-manager', 80)
  const provider = sanitizeProvider(cleanText(body.provider || 'gemini', 30))
  const agent = resolveAgent(agentId)
  const requestStarted = Date.now()
  const reply = await getBrainReply({
    agent,
    userText,
    messages: Array.isArray(body.messages) ? body.messages : [],
    sessionId: cleanText(body.sessionId || 'default', 80),
    usageContext: {
      clientId: cleanText(body.clientId || body.accountId || '', 120),
      requestId: cleanText(body.requestId || '', 120),
    },
  })
  const ttsStarted = Date.now()
  let speech
  try {
    speech = await synthesize({
      provider,
      text: reply.text,
      model: cleanText(body.model || ''),
      voiceName: cleanText(body.voiceName || ''),
      agentId,
    })
  } catch (e) {
    return jsonError(`TTS failed: ${e.message}`, 502, {
      reply: reply.text,
      brainMs: reply.brainMs,
      brainSource: reply.source,
      warning: reply.warning,
    })
  }
  const ttsMs = Date.now() - ttsStarted
  const totalMs = Date.now() - requestStarted
  logVoiceUsage({
    provider,
    model: body.model || '',
    voiceName: body.voiceName || '',
    agentId,
    textChars: reply.text.length,
    durationSeconds: speech.usage?.durationSeconds || 0,
    area: 'voice-scoreboard',
    status: 'metric',
    brainMs: reply.brainMs,
    ttsMs,
    totalMs,
  })

  return NextResponse.json({
    ok: true,
    agent: { id: agentId, name: agent.name || agent.firstName || agentId },
    provider,
    model: body.model || '',
    voiceName: body.voiceName || '',
    reply: reply.text,
    audio: speech.audio.toString('base64'),
    contentType: speech.contentType,
    metrics: {
      brainMs: reply.brainMs,
      ttsMs,
      totalMs,
      brainSource: reply.source,
      warning: reply.warning || null,
      usage: speech.usage,
    },
  })
}

export async function PATCH(request) {
  const { error } = await requireCapability(request, 'voice:use')
  if (error) return error
  let body
  try { body = await request.json() } catch { return jsonError('Bad JSON body', 400) }
  const agentId = cleanText(body.agentId || '', 80)
  if (!agentId) return jsonError('agentId required', 400)
  const agentsFile = readData('agents.json') || { agents: {} }
  const preset = PRESET_BY_ID[agentId] || {}
  const agent = agentsFile.agents?.[agentId] || (PRESET_BY_ID[agentId] ? {
    id: agentId,
    name: preset.name,
    firstName: preset.firstName || String(preset.name || agentId).split(/\s+/)[0],
    title: preset.title,
    role: preset.role,
    voiceProfile: preset.voiceProfile,
    description: preset.description,
    jobDescription: preset.jobDescription,
    category: preset.category,
    emoji: preset.emoji,
    presetSource: true,
  } : null)
  if (!agent) return jsonError(`Agent ${agentId} not found`, 404)
  const provider = sanitizeProvider(cleanText(body.provider || 'gemini', 30))
  agent.voice = {
    ...(agent.voice || {}),
    provider,
    model: cleanText(body.model || '', 120),
    voiceName: cleanText(body.voiceName || '', 80),
    voiceAlias: cleanText(body.voiceAlias || '', 80),
    geminiModel: provider === 'gemini' ? cleanText(body.model || '', 120) : agent.voice?.geminiModel,
    geminiVoice: provider === 'gemini' ? cleanText(body.voiceName || '', 80) : agent.voice?.geminiVoice,
    geminiVoiceAlias: provider === 'gemini' ? cleanText(body.voiceAlias || '', 80) : agent.voice?.geminiVoiceAlias,
    chirp3Model: provider === 'chirp3' ? CHIRP3_MODEL : agent.voice?.chirp3Model,
    chirp3Voice: provider === 'chirp3' ? cleanText(body.voiceName || '', 120) : agent.voice?.chirp3Voice,
    chirp3VoiceAlias: provider === 'chirp3' ? cleanText(body.voiceAlias || '', 80) : agent.voice?.chirp3VoiceAlias,
    labConfiguredAt: new Date().toISOString(),
  }
  agentsFile.agents[agentId] = agent
  agentsFile.lastUpdated = new Date().toISOString()
  writeData('agents.json', agentsFile)
  return NextResponse.json({ ok: true, agentId, voice: agent.voice })
}
