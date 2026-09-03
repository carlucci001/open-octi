import { getCred } from '@/lib/agent-creds'
import { COMMAND_CENTER_MENU_GUIDE, isCommandCenterNavigationPhrase } from '@/lib/commandCenterNavigation'
import { resolveCommandCenterTab } from '@/lib/commandCenterNavigation'
import { OFFICE_AGENT_CONDUCT } from '@/lib/agentOfficeConduct'
import { hermesChat } from '@/lib/hermes-client'
import { deepSeekHarnessChat } from '@/lib/deepseek-harness-client'
import { openclawChat } from '@/lib/openclaw-client'
import { directProviderChat, resolveDirectProvider } from '@/lib/direct-provider-chat'
import { requireCapability } from '@/lib/permissions'
import { isOwner } from '@/lib/roles'
import { loadAll } from '@/lib/entityStore'
import { readData, writeData } from '@/lib/dataStore'
import { getSectionAgent, resolveWizardAgentSection, sectionPersonaLine } from '@/lib/section-agents'
import { runDeepResearchDossier } from '@/lib/deep-research'
import { DEERFLOW_READONLY_TOOL_DEFS } from '@/lib/deerflow-tools'
import { isOpenOcti, openclawRuntimeLogLabel } from '@/lib/edition'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SECTION_LABELS = {
  dashboard: 'Command Center dashboard',
  feed: 'Feed',
  leads: 'Leads',
  pipelines: 'Pipelines',
  accounts: 'Accounts',
  contacts: 'Contacts',
  projects: 'Projects',
  tasks: 'Tasks',
  finance: 'Finance',
  domains: 'Domains (GoDaddy inventory, expiration dates, SSL status, hosting)',
  credentials: 'Credentials (API keys, usage, billing)',
  documents: 'Documents',
  products: 'Products',
  switchboard: 'Switchboard',
  agents: 'Agents',
  repository: 'Repository / Gitea',
  media: 'Media',
  calendar: 'Calendar',
  notes: 'Notes',
  phone: 'Phone',
  conference: 'Conference',
  network: 'Network',
  settings: 'Settings',
  'agent-labs': 'Agent Lab',
  'nvidia-labs': 'AI Lab',
  ops: 'Ops Lab',
  harness: 'Harness',
  'voice-guide': 'Help & Guides',
}

function configuredSecret(value) {
  const v = String(value || '').trim()
  if (!v) return null
  if (['missing', 'changeme', 'change-me', 'undefined', 'null'].includes(v.toLowerCase())) return null
  return v
}

function internalAgentHeaders() {
  const key = configuredSecret(process.env.AGENT_API_KEY) || configuredSecret(process.env.OPENCLAW_API_KEY)
  return {
    'Content-Type': 'application/json',
    ...(key ? { 'x-agent-key': key } : {}),
  }
}

function sseDone(payload, status = 200) {
  return new Response(`data: ${JSON.stringify({ ...payload, done: true })}\n\n`, {
    status,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}

function parseInvoiceIntent(text, section, invoiceContext = false) {
  const raw = String(text || '').trim()
  const lc = raw.toLowerCase()
  const hasInvoiceWord = /\binvoice\b/.test(lc)
  if (!hasInvoiceWord && section !== 'finance' && !invoiceContext) return null
  if (section !== 'finance' && !invoiceContext && !/\b(send|email|mail|create|draft)\b/.test(lc)) return null
  const amountMatch = raw.match(/\$\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)|\b([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*(?:dollars?|usd)\b/i)
  const amount = Number(String(amountMatch?.[1] || amountMatch?.[2] || '').replace(/,/g, ''))
  if (!Number.isFinite(amount) || amount <= 0) return null

  let accounts = []
  try { accounts = loadAll('accounts') || [] } catch {}
  const haystack = lc.replace(/[^\w\s.'-]/g, ' ')
  const account = accounts
    .filter(a => a?.type === 'client' && a?.name)
    .sort((a, b) => String(b.name).length - String(a.name).length)
    .find(a => haystack.includes(String(a.name).toLowerCase()))

  let clientName = account?.name || ''
  if (!clientName) {
    const nameMatch = raw.match(/\b(?:to|for|client|customer)\s+([a-z][a-z .'-]{2,80}?)(?=\s+(?:for\s+\$|and\s+email|email|mail|via|with|miscellaneous|services|send)\b|$)/i)
    clientName = String(nameMatch?.[1] || '').trim()
  }

  let description = 'Miscellaneous services'
  const amountText = amountMatch?.[0] || ''
  const amountIdx = amountMatch?.index ?? -1
  if (amountIdx >= 0) {
    const after = raw.slice(amountIdx + amountText.length)
      .replace(/\b(and\s+)?(send|email|mail|invoice|to|for|client|customer)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    const cleaned = after.replace(/[.?!]+$/, '').trim()
    const accountName = String(account?.name || clientName || '').toLowerCase()
    if (
      cleaned
      && !/^(it|her|him|them|and)$/i.test(cleaned)
      && !(accountName && cleaned.toLowerCase().includes(accountName))
    ) {
      description = cleaned.replace(/\band$/i, '').trim().slice(0, 120) || description
    }
  }

  return {
    amount,
    account,
    clientName,
    description,
    shouldSend: /\b(send|email|mail)\b/.test(lc),
  }
}

function isInvoiceStarterIntent(text, section) {
  const lc = String(text || '').toLowerCase()
  if (section !== 'finance' && !/\binvoice\b/.test(lc)) return false
  return /\b(invoice|payment request)\b/.test(lc)
    && /\b(draft|create|start|help|prepare|write|new)\b/.test(lc)
}

function hasRecentInvoiceDraftContext(messages = []) {
  return messages
    .slice(-6, -1)
    .some(m => {
      const text = String(m?.content || '').toLowerCase()
      return text.includes('i can draft the invoice')
        || text.includes('help me draft a clean invoice')
        || text.includes('draft invoice')
        || text.includes('payment request')
    })
}

function agentForSection(section, text) {
  return getSectionAgent(resolveWizardAgentSection(section, text)).agentId || 'main'
}

function reconnectFallbackText(section, agentId, operatorTool) {
  const location = SECTION_LABELS[section] ? ` You are in ${SECTION_LABELS[section]}.` : ''
  const operatorName = String(operatorTool?.label || '').trim()
  const operatorRole = String(operatorTool?.role || '').trim()
  const selectedName = operatorName || (agentId === 'finance-manager' ? 'Frank' : 'This agent')
  const selectedIsFinance = agentId === 'finance-manager' || /\bfinance\b/i.test(`${operatorName} ${operatorRole}`)
  if (agentId === 'finance-manager') {
    return `OpenClaw is reconnecting, but the CRM is still online. Frank can still handle finance invoice commands and section navigation from here.${location}`.trim()
  }
  if (selectedIsFinance) {
    return `OpenClaw is reconnecting, but the CRM is still online. ${selectedName} can still handle finance invoice commands and section navigation from here.${location}`.trim()
  }
  return `OpenClaw is reconnecting, but the CRM is still online. ${selectedName} can still help with section navigation from here. Finance invoice commands route to Frank.${location}`.trim()
}

function agentIdFromSessionKey(sessionKey) {
  const m = String(sessionKey || '').match(/^agent:([^:]+):/)
  return m?.[1] || ''
}

function getStoredAgent(id) {
  const agentId = String(id || '').trim()
  if (!agentId) return null
  const store = readData('agents.json')
  const agents = store?.agents || store
  if (Array.isArray(agents)) return agents.find(a => a?.id === agentId) || null
  if (agents && typeof agents === 'object') return agents[agentId] || null
  return null
}

function resolveOperatorAgent({ operatorTool, operatorContext, sessionKey }) {
  const candidates = [
    operatorTool?.agentId,
    operatorContext?.recordType === 'agent' ? operatorContext.recordId : '',
    agentIdFromSessionKey(sessionKey),
  ].filter(Boolean)
  for (const id of candidates) {
    const agent = getStoredAgent(id)
    if (agent) return { id, ...agent }
  }
  return null
}

function mergeOperatorTool(operatorTool, storedAgent) {
  if (!storedAgent) return operatorTool || {}
  return {
    ...operatorTool,
    label: storedAgent.name || operatorTool?.label || storedAgent.id,
    role: storedAgent.role || storedAgent.title || operatorTool?.role || 'Agent',
    runtimeProvider: storedAgent.runtimeProvider || operatorTool?.runtimeProvider || 'openclaw-hetzner',
    tools: Array.isArray(storedAgent.tools) ? storedAgent.tools : (operatorTool?.tools || []),
    agentId: storedAgent.id || operatorTool?.agentId,
  }
}

function isDeerFlowOperator(operatorTool) {
  const id = String(operatorTool?.agentId || '').trim()
  const runtimeProvider = String(operatorTool?.runtimeProvider || '').trim()
  const labelRole = `${operatorTool?.label || ''} ${operatorTool?.role || ''}`
  return runtimeProvider === 'deerflow-hetzner'
    || id === 'deep-research-analyst'
    || /\bdeerflow\b/i.test(labelRole)
}

function isHermesOperator(operatorTool) {
  return String(operatorTool?.runtimeProvider || '').trim() === 'hermes-hetzner'
}

function isDeepSeekHarnessOperator(operatorTool) {
  return String(operatorTool?.runtimeProvider || '').trim() === 'deepseek-harness-local'
}

function isDeepSeekHarnessEnabled() {
  const configured = String(process.env.DEEPSEEK_HARNESS_ENABLED || '').trim().toLowerCase()
  if (configured) return ['1', 'true', 'yes', 'on'].includes(configured)
  return process.env.NODE_ENV !== 'production'
}

function unsupportedRuntimeText(operatorTool) {
  const runtimeProvider = String(operatorTool?.runtimeProvider || 'openclaw-hetzner').trim()
  return `${runtimeProvider || 'This runtime'} is not wired for chat/tools yet. I did not route this to OpenClaw.`
}

function isUnsupportedRuntimeOperator(operatorTool) {
  const runtimeProvider = String(operatorTool?.runtimeProvider || 'openclaw-hetzner').trim()
  return runtimeProvider !== 'openclaw-hetzner' && runtimeProvider !== 'deerflow-hetzner'
}

function isCapabilitiesQuestion(text) {
  return /\b(tool|tools|ability|abilities|capabilit|what can you do|offer me|help me with)\b/i.test(String(text || ''))
}

function deepResearchCapabilitiesText(operatorTool) {
  const assignedTools = new Set(Array.isArray(operatorTool?.tools) ? operatorTool.tools : [])
  const deerflowTools = DEERFLOW_READONLY_TOOL_DEFS
    .filter(t => assignedTools.size === 0 || assignedTools.has(t.name))
    .map(t => `- ${t.name}: ${t.description}`)
  const label = String(operatorTool?.label || 'DeerFlow Research Analyst').trim()
  const role = String(operatorTool?.role || 'public-source research analyst').trim()
  return [
    `I am ${label}, a DeerFlow-only ${role}.`,
    '',
    'What I can do for you:',
    '- Run public-source research on a person, company, client, partner, lead, market, competitor, or project.',
    '- Summarize credibility, business fit, reputation, public/social footprint, positive signals, red flags, open questions, and recommended next steps.',
    '- Use Perplexity when enabled for public-source evidence, then DeerFlow for the research analysis.',
    '- Keep guardrails: public/business-relevant information only; no private personal data, doxxing, protected-class guesses, or unsupported accusations as fact.',
    '',
    'Tools currently attached:',
    '- deep_research_dossier: DeerFlow-only public-source due diligence dossier.',
    ...deerflowTools,
  ].join('\n')
}

// A question ABOUT a dossier ("where can I find this research?", "did that
// finish?") must never become a new research target. Without this guard a
// follow-up question burns a Perplexity call plus a full multi-minute DeerFlow
// run researching the literal sentence Carl typed — which is exactly what
// happened on 2026-08-05 at 12:44:30 UTC.
function isResearchFollowUpQuestion(text) {
  const raw = String(text || '').trim()
  if (!raw) return false
  const lc = raw.toLowerCase()
  const interrogative = /^(where|when|what|which|who|how|did|does|do|is|are|was|were|can|could|will|would|should|show|send|give)\b/.test(lc)
    || lc.endsWith('?')
  if (!interrogative) return false
  // Only bail when the object of the sentence is the research itself. A
  // question that still names a concrete subject ("can you research Riverside
  // Logistics?") is a real request and must still run.
  const aboutTheResearch = /\b(this|that|the|my|its|it|those|these|last|previous|earlier)\s+(deep\s+)?(dive|research|dossier|report|analysis|results?|findings?)\b/
  const whereIsIt = /\b(find|get|see|read|view|open|download|access|locate|saved?|stored?|filed?|sent?|posted?)\b[\s\S]*\b(research|dossier|report|results?|findings?|deep dive)\b/
  const didItRun = /\b(did|has|have|is|was)\b[\s\S]*\b(finish|complete|done|work|run|running|ready|happen)\w*\b/
  return aboutTheResearch.test(lc) || whereIsIt.test(lc) || didItRun.test(lc)
}

function whereToFindDossiersText() {
  return [
    'Every completed dossier is saved server-side the moment it finishes — it is never chat-only, even if this window times out or you close it.',
    '',
    'Find them in Command Center under Research (the Research Dossiers screen). Each entry lands as unfiled until you file it to an account, and carries the target, risk level, confidence, sources, and the full report.',
    '',
    'Say "show me the last dossier" and name the target if you want it pulled up here.',
  ].join('\n')
}

function extractDeepResearchTarget(text) {
  const raw = String(text || '').trim()
  if (isResearchFollowUpQuestion(raw)) return ''
  if (!/\b(research|deep dive|diligence|vet|check out|investigate|look into|analyze)\b/i.test(raw)) return ''
  const cleaned = raw
    .replace(/^(please\s+)?(do|run|perform|make|give me|can you|could you)?\s*(a\s+)?(deep\s+)?(research|dive|diligence|vetting|analysis|investigation)\s*(on|for|about|into)?\s*/i, '')
    .trim()
  if (!cleaned || cleaned.length < 3 || isCapabilitiesQuestion(cleaned)) return ''
  return cleaned.slice(0, 220)
}

function dossierLine(value) {
  if (value == null) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value !== 'object') return String(value)
  const head = value.signal || value.title || value.name || value.item || value.question || value.step || ''
  const body = value.details || value.detail || value.description || value.note || value.text || ''
  const src = value.source || value.url || ''
  const main = [head, body].filter(Boolean).join(' - ')
  if (!main) return ''
  return src && !/^user-provided/i.test(String(src)) ? `${main} (${src})` : main
}

function dossierBullets(label, arr) {
  const list = (Array.isArray(arr) ? arr : []).map(dossierLine).filter(Boolean)
  if (!list.length) return ''
  return `${label}:\n- ${list.join('\n- ')}`
}

function dossierSources(d) {
  const list = (Array.isArray(d?.sources) ? d.sources : [])
    .map(s => (typeof s === 'string' ? s : (s?.url || s?.source || '')))
    .filter(Boolean)
  if (!list.length) return ''
  const shown = list.slice(0, 10)
  const more = list.length - shown.length
  return `Sources:\n- ${shown.join('\n- ')}${more > 0 ? `\n- (+${more} more in the saved dossier)` : ''}`
}

function renderDossierSummary(d, target) {
  const summary = String(d?.executiveSummary || d?.summary || '').trim()
  if (!summary) return `Deep research completed for ${target}, but DeerFlow returned no written summary. The raw run is saved under Research.`
  return `Summary: ${summary}`
}

async function handleDeerFlowOperatorChat(text, operatorTool) {
  if (isResearchFollowUpQuestion(text)) {
    return whereToFindDossiersText()
  }
  if (isCapabilitiesQuestion(text)) {
    return deepResearchCapabilitiesText(operatorTool)
  }
  const target = extractDeepResearchTarget(text)
  if (target) {
    const label = String(operatorTool?.label || 'DeerFlow Research Analyst').trim()
    const role = String(operatorTool?.role || 'public-source research analyst').trim()
    const result = await runDeepResearchDossier({
      target,
      context: `Requested from Agent Manager ${label} (${role}) chat.`,
      subjectType: 'person_or_company',
      usePerplexity: true,
    })
    const d = result?.dossier || {}
    // lib/deep-research.js emits executiveSummary / recommendedNextSteps and
    // returns signal arrays as objects ({signal, details, source}), not strings.
    // Reading d.summary / d.nextSteps / .join() silently threw the whole
    // dossier away and left Carl with three empty lines. Read both shapes.
    return [
      renderDossierSummary(d, target),
      d.riskLevel ? `Risk level: ${d.riskLevel}` : '',
      d.confidence ? `Confidence: ${d.confidence}` : '',
      dossierBullets('Identity and business fit', d.identityAndBusinessFit),
      dossierBullets('Positive signals', d.positiveSignals),
      dossierBullets('Red flags', d.redFlags),
      dossierBullets('Reputation signals', d.reputationSignals),
      dossierBullets('Open questions', d.openQuestions),
      dossierBullets('Next steps', d.recommendedNextSteps || d.nextSteps),
      dossierSources(d),
      `Saved to Research Dossiers${result?.ms ? ` in ${Math.round(result.ms / 1000)}s` : ''} — target: ${target}. It is unfiled until you file it to an account.`,
    ].filter(Boolean).join('\n\n')
  }
  const label = String(operatorTool?.label || 'DeerFlow Research Analyst').trim()
  const role = String(operatorTool?.role || 'public-source research analyst').trim()
  return [
    `I am ${label}, a DeerFlow-only ${role}.`,
    'Give me a person, company, lead, market, competitor, partner, project, or website and ask for research. I will use public/business-relevant sources only and return credibility signals, risks, open questions, and next steps.',
    '',
    'You can also ask: "tell me your tools" to see the exact DeerFlow read-only tools attached to me.',
  ].join('\n')
}

async function runDirectInvoiceIntent(intent, requestId) {
  if (!intent.clientName && !intent.account) {
    throw new Error('I could not identify the client for that invoice.')
  }
  const body = {
    action: 'create',
    clientId: intent.account?.id || '',
    clientName: intent.account?.name || intent.clientName,
    items: [{ description: intent.description, qty: 1, rate: intent.amount }],
    notes: 'Created from AI Wizard finance command.',
  }
  console.log(`[ai-wizard] direct_invoice create requestId=${requestId} amount=${intent.amount.toFixed(2)} client=${String(body.clientName || 'unknown').slice(0, 80)}`)
  const createRes = await fetch('http://localhost:3000/api/invoices', {
    method: 'POST',
    headers: internalAgentHeaders(),
    body: JSON.stringify(body),
  })
  const created = await createRes.json().catch(() => ({}))
  if (!createRes.ok || created.error) throw new Error(created.error || `Invoice create failed (${createRes.status})`)

  const invoice = created.invoice
  if (!intent.shouldSend) {
    return `Draft invoice ${invoice.number || invoice.id} created for ${invoice.clientName || body.clientName} for $${(Number(invoice.amount) || intent.amount).toFixed(2)}.`
  }

  const sendRes = await fetch('http://localhost:3000/api/invoices', {
    method: 'POST',
    headers: internalAgentHeaders(),
    body: JSON.stringify({ action: 'send', id: invoice.id }),
  })
  const sent = await sendRes.json().catch(() => ({}))
  if (!sendRes.ok || sent.error) {
    return `Draft invoice ${invoice.number || invoice.id} was created for ${invoice.clientName || body.clientName} for $${(Number(invoice.amount) || intent.amount).toFixed(2)}, but email sending failed: ${sent.error || `send failed (${sendRes.status})`}.`
  }
  const sentInvoice = sent.invoice || invoice
  return `Invoice ${sentInvoice.number || sentInvoice.id} was created and emailed to ${sent.sentTo || intent.account?.email || 'the client'} for $${(Number(sentInvoice.amount) || intent.amount).toFixed(2)}.`
}

function isScreenControlRequest(value) {
  const text = String(value || '').toLowerCase()
  return /\b(open|show|pull up|bring up|go to|navigate|transfer|send me to|connect me to|route me to|display|load|launch|get)\b/.test(text)
    && (
      /\b(screen|account|client|contact|lead|opportunity|project|record|page|tab|section|menu|submenu|products?|catalog|switchboard|agents?|settings|calendar|crm|repository|repo|gitea|git|source control|documents?|contracts?|finance|payments?|invoices?|media|phone|conference|notes|network|domains|credentials|ops|harness|nvidia|nim|gpu)\b/.test(text)
      || isCommandCenterNavigationPhrase(text)
    )
}

function pushUiAction(action) {
  const data = readData('ui-actions.json') || { actions: [] }
  const now = Date.now()
  const actions = Array.isArray(data.actions) ? data.actions : []
  const next = {
    id: `uia_${now.toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    createdAt: now,
    ...action,
  }
  actions.push(next)
  writeData('ui-actions.json', { actions: actions.slice(-100) })
  return next
}

function runLocalScreenFallback(text) {
  const tabId = resolveCommandCenterTab(text)
  if (!tabId) return null
  pushUiAction({ type: 'set-tab', tabId, source: 'ai-wizard-local-fallback' })
  return `Taking you to ${tabId.replace(/-/g, ' ')} now.`
}

export async function POST(request) {
  const { user, error } = await requireCapability(request, 'agents:use')
  if (error) return error

  const { messages, leadContext, sessionKey, section, operatorContext, operatorTool } = await request.json()
  const storedOperatorAgent = resolveOperatorAgent({ operatorTool, operatorContext, sessionKey })
  const activeOperatorTool = mergeOperatorTool(operatorTool, storedOperatorAgent)
  const requestId = `aiw_${Date.now().toString(36)}`
  const cred = getCred('open claw') || getCred('openclaw')
  const token = cred?.key

  const last = (messages || []).filter(m => m.role === 'user').slice(-1)[0]
  if (!last) return new Response('data: {"error":"No user message"}\n\n', { status: 400, headers: { 'Content-Type': 'text/event-stream' } })

  let prompt = last.content
  const invoiceContext = hasRecentInvoiceDraftContext(messages || [])
  console.log(`[ai-wizard] request requestId=${requestId} section=${String(section || 'unknown').replace(/[^a-z0-9_-]/gi, '') || 'unknown'} runtime=${openclawRuntimeLogLabel(activeOperatorTool?.runtimeProvider).replace(/[^a-z0-9_-]/gi, '') || 'unknown'} agent=${String(activeOperatorTool?.agentId || 'none').replace(/[^a-z0-9_-]/gi, '') || 'none'} invoiceContext=${invoiceContext} chars=${String(last.content || '').length}`)
  if (isHermesOperator(activeOperatorTool)) {
    const profile = String(activeOperatorTool?.agentId || '').trim().toLowerCase()
    try {
      // CRM chat is conversation-only. Any tools used by these profiles run inside Hermes.
      const result = await hermesChat({ profile, messages })
      console.log(`[ai-wizard] hermes done requestId=${requestId} profile=${profile.replace(/[^a-z0-9_-]/gi, '')} chars=${String(result.text || '').length}`)
      return sseDone({
        text: result.text,
        source: 'hermes-runtime',
        profile: result.profile,
        model: result.model,
      })
    } catch (e) {
      const message = String(e?.message || e || 'Hermes request failed').slice(0, 240)
      console.warn(`[ai-wizard] hermes error requestId=${requestId} profile=${profile.replace(/[^a-z0-9_-]/gi, '')} message=${message}`)
      return sseDone({ text: message, source: 'hermes-runtime-error', profile })
    }
  }
  if (isDeepSeekHarnessOperator(activeOperatorTool)) {
    if (!isDeepSeekHarnessEnabled()) {
      return sseDone({
        text: 'Dax is installed as a production experiment, but its Harness runtime is disabled.',
        source: 'deepseek-harness-runtime-disabled',
      }, 503)
    }
    if (!isOwner(user)) {
      return sseDone({
        text: 'Dax production experiments are restricted to the Command Center owner.',
        source: 'deepseek-harness-runtime-forbidden',
      }, 403)
    }
    try {
      // The Harness owns model execution inside the isolated sidecar. Command
      // Center supplies only bounded agent context and conversation; the
      // provider key is delivered to the sidecar as a systemd credential.
      const result = await deepSeekHarnessChat({ messages, agent: activeOperatorTool })
      console.log(`[ai-wizard] deepseek-harness done requestId=${requestId} agent=${String(activeOperatorTool?.agentId || 'none').replace(/[^a-z0-9_-]/gi, '')} chars=${String(result.text || '').length}`)
      return sseDone({
        text: result.text,
        source: 'deepseek-harness-runtime',
        profile: result.profile,
        model: result.model,
      })
    } catch (e) {
      const eventId = `dax_${Date.now().toString(36)}`
      console.warn(`[ai-wizard] deepseek-harness error requestId=${requestId} eventId=${eventId} type=${String(e?.constructor?.name || 'Error').replace(/[^a-z0-9_-]/gi, '')}`)
      return sseDone({
        text: `Dax's experimental runtime is unavailable. Reference ${eventId}.`,
        source: 'deepseek-harness-runtime-error',
        eventId,
      })
    }
  }
  const directInvoice = parseInvoiceIntent(last.content, section, invoiceContext)
  if (directInvoice) {
    try {
      const text = await runDirectInvoiceIntent(directInvoice, requestId)
      return sseDone({ text })
    } catch (e) {
      console.warn(`[ai-wizard] direct_invoice error requestId=${requestId} message=${String(e.message || e).slice(0, 180)}`)
      return sseDone({ error: e.message || 'Invoice command failed' }, 400)
    }
  }
  if (isInvoiceStarterIntent(last.content, section)) {
    console.log(`[ai-wizard] invoice_starter requestId=${requestId}`)
    return sseDone({
      text: 'I can draft the invoice. Tell me the client name, amount, what the charge is for, due date if you want one, and whether to email it now or leave it as a draft.',
    })
  }
  if (isDeerFlowOperator(activeOperatorTool)) {
    // A dossier run takes 60-200s (Perplexity + a DeerFlow run + status polls).
    // This used to await the whole thing and send one packet at the end, so the
    // chat sat blank with the composer disabled and no way to tell a slow run
    // from a dead one -- and anything past Cloudflare's 100s edge timeout was
    // killed outright. Stream instead: immediate ack, heartbeat every 10s to
    // keep bytes flowing through the edge, dossier at the end.
    const deerEncoder = new TextEncoder()
    const deerStarted = Date.now()
    const deerTarget = extractDeepResearchTarget(last.content)
    const deerStream = new ReadableStream({
      async start(controller) {
        let heartbeat = null
        const write = (obj) => {
          try { controller.enqueue(deerEncoder.encode(`data: ${JSON.stringify(obj)}\n\n`)) } catch {}
        }
        const ack = deerTarget
          ? `Starting the deep dive on ${deerTarget}. This normally takes one to three minutes -- the dossier is saved server-side the moment it finishes, so it survives even if this window drops.`
          : ''
        try {
          console.log(`[ai-wizard] deerflow_operator start requestId=${requestId} target=${String(deerTarget || 'none').slice(0, 100)}`)
          if (ack) {
            write({ text: ack })
            heartbeat = setInterval(() => {
              write({ text: `${ack}\n\nStill working -- ${Math.round((Date.now() - deerStarted) / 1000)}s elapsed.` })
            }, 10000)
          }
          const text = await handleDeerFlowOperatorChat(last.content, activeOperatorTool)
          if (heartbeat) clearInterval(heartbeat)
          console.log(`[ai-wizard] deerflow_operator done requestId=${requestId} ms=${Date.now() - deerStarted} chars=${String(text || '').length}`)
          write({ text, done: true, source: 'deerflow-runtime' })
        } catch (e) {
          if (heartbeat) clearInterval(heartbeat)
          const message = String(e?.message || e || 'unknown error').slice(0, 200)
          console.warn(`[ai-wizard] deerflow_operator error requestId=${requestId} ms=${Date.now() - deerStarted} message=${message}`)
          write({
            text: `The deep dive did not finish. ${message}${deerTarget ? ` (target: ${deerTarget})` : ''} Nothing was saved for this run -- ask again and I will retry. Request id ${requestId}.`,
            done: true,
            source: 'deerflow-runtime',
          })
        } finally {
          if (heartbeat) clearInterval(heartbeat)
          try { controller.close() } catch {}
        }
      },
    })
    return new Response(deerStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    })
  }
  if (isUnsupportedRuntimeOperator(activeOperatorTool)) {
    return sseDone({ text: unsupportedRuntimeText(activeOperatorTool), source: 'unsupported-runtime' })
  }
  const screenControl = isScreenControlRequest(last.content)
  const effectiveSection = resolveWizardAgentSection(section, last.content)
  const selectedAgentId = String(activeOperatorTool?.agentId || '').trim()
  const agentId = selectedAgentId || agentForSection(section, last.content)
  const contextLines = []
  contextLines.push(
    OFFICE_AGENT_CONDUCT,
    'Authoritative current capability: screen control is available now. If Carl asks to open, show, pull up, transfer to, route to, connect to, or navigate to a Command Center screen/menu/submenu, use fcc_navigate_to. If Carl asks to open, show, or pull up an account/client/contact/lead/opportunity/project on his screen, use fcc_open_record. Any earlier statement that screen control is unavailable is stale and wrong. Do not say you are not wired for screen control.',
    'For transfer or navigation requests, confirm with direct language like "Taking you there now", "Sending you there now", or "Transferring now." Never say "let me see if they are available", never imply a hold queue, and never close that turn with "let me know if I can help with anything else".',
    'In the text AI Wizard, never answer only "Done." or only "Opened." Name the visible result or say no action was taken.',
    `Authoritative Command Center menu map:\n${COMMAND_CENTER_MENU_GUIDE}`,
    'Repository is its own top-level menu item. If Carl says repository, repo, Gitea, Git, source control, source code, or code repository, call fcc_navigate_to with tabId "repository". Do not open Documents, Products, Product Lab, or Ops Lab for repository requests.'
  )
  if (screenControl) {
    contextLines.push(
      'This is a live screen-control request. Use the screen-control tool instead of explaining limitations. If Carl gives a record type without a name, open the matching list screen with fcc_navigate_to.'
    )
  }
  if (section && SECTION_LABELS[section]) {
    contextLines.push(`Carl is currently viewing the ${SECTION_LABELS[section]} section of his Farrington Command Center CRM. Tailor your answer to this section.`)
  }
  const personaLine = sectionPersonaLine(effectiveSection)
  if (personaLine) contextLines.push(personaLine)
  if (operatorContext && typeof operatorContext === 'object') {
    const safeContext = {
      tab: operatorContext.tab || section || '',
      subtab: operatorContext.subtab || '',
      mode: operatorContext.mode || '',
      recordType: operatorContext.recordType || '',
      recordId: operatorContext.recordId || '',
      recordName: operatorContext.recordName || '',
    }
    contextLines.push(`Current operator context: ${JSON.stringify(safeContext)}`)
  }
  if (activeOperatorTool && typeof activeOperatorTool === 'object') {
    contextLines.push(`Selected operator tool: ${JSON.stringify({ label: activeOperatorTool.label || '', role: activeOperatorTool.role || '', runtimeProvider: activeOperatorTool.runtimeProvider || 'openclaw-hetzner' })}. Answer as that specialist, use available Command Center tools when the request is actionable, and do not repeat generic sidebar guidance.`)
  }
  if (leadContext) {
    contextLines.push(`Currently selected CRM context: ${JSON.stringify(leadContext)}`)
  }
  if (contextLines.length > 0) {
    prompt = `[CRM Context]\n${contextLines.join('\n')}\n\n[Carl's message]\n${prompt}`
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const write = (obj) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`)) } catch {}
      }
      try {
        console.log(`[ai-wizard] start requestId=${requestId} section=${String(section || 'unknown').replace(/[^a-z0-9_-]/gi, '') || 'unknown'} screenControl=${screenControl} chars=${String(last.content || '').length}`)
        const r = await openclawChat({
          message: prompt,
          sessionKey: screenControl ? `agent:main:screen-control-live-${Date.now()}` : (sessionKey || `agent:${agentId}:ai-wizard-${Date.now()}`),
          token,
          firstChunkMs: isOpenOcti() ? 120000 : undefined,
          onChunk: (text) => write({ text }),
        })
        console.log(`[ai-wizard] done requestId=${requestId} runId=${r.runId || 'none'} chars=${String(r.text || '').length}`)
        // Final text (in case the last chunk had more than what onChunk captured)
        write({ text: r.text, done: true, runId: r.runId })
      } catch (e) {
        console.warn(`[ai-wizard] error requestId=${requestId} message=${String(e.message || e).slice(0, 180)}`)
        if (screenControl) {
          const text = runLocalScreenFallback(last.content)
          if (text) {
            write({ text, done: true, source: 'local-fallback' })
            return
          }
        }
        if (resolveDirectProvider()) {
          try {
            const direct = await directProviderChat({
              message: prompt,
              system: 'You are the OpenOcti CRM assistant. Be concise, truthful, and do not claim tool actions were completed because direct-provider fallback has no CRM tools.',
            })
            write({ text: direct.text, done: true, source: `direct-${direct.provider}`, model: direct.model })
            return
          } catch (directError) {
            console.warn(`[ai-wizard] direct-provider error requestId=${requestId} message=${String(directError?.message || directError).slice(0, 180)}`)
          }
        }
        write({
          text: reconnectFallbackText(section, agentId, activeOperatorTool),
          done: true,
          source: 'local-fallback',
        })
      } finally {
        try { controller.close() } catch {}
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
