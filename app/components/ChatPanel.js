'use client'
import { useState, useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import { getSectionAgent, resolveWizardAgentSection } from '../../lib/section-agents'
import { brandAssetsFor } from '@/lib/brand-assets'
const VoiceSession = dynamic(() => import('./VoiceSession'), { ssr: false, loading: () => null })

const STORAGE_KEY = 'fcc-chat-history'
const STORAGE_VERSION_KEY = 'fcc-chat-history-version'
const STORAGE_VERSION = 'section-aware-wizard-v1'
const MODEL_KEY = 'fcc-chat-model'
const AUTO_OPEN_KEY = 'fcc-ai-wizard-auto-open'
const BRAND_ASSETS = brandAssetsFor()
const OPENOCTI_AVATAR = BRAND_ASSETS.openOcti ? BRAND_ASSETS.faviconPng : ''
const CURATED_AGENT_AVATARS = {
  main: OPENOCTI_AVATAR || '/avatars/main-1777248993872.png',
  coding: OPENOCTI_AVATAR || '/avatars/coding-1777251118838.png',
  communications: OPENOCTI_AVATAR || '/avatars/communications-1777476569009.jpg',
  legal: OPENOCTI_AVATAR || '/avatars/legal-1777476559880.jpg',
  promoter: OPENOCTI_AVATAR || '/avatars/ContentHub-promoter-1777251395979.png',
  social: OPENOCTI_AVATAR || '/avatars/social-media-1777476538091.jpg',
  morningBrief: OPENOCTI_AVATAR || '/avatars/morning-brief-1777509881964.png',
  finance: OPENOCTI_AVATAR || '/avatars/finance-manager-local.svg',
}

const MAGGIE_AVATAR = CURATED_AGENT_AVATARS.main
const FINANCE_AVATAR = CURATED_AGENT_AVATARS.finance
const WELCOME = "Ask me anything about this workspace. I can use the current CRM context, call tools when available, and turn the visible screen into next actions."

// Per-section agent + quick prompts now live in lib/section-agents.js (single
// source of truth shared with the AI Wizard API). Avatars resolve via the
// entry's avatarKey into CURATED_AGENT_AVATARS below.

function cleanChatText(value) {
  return String(value || '')
    .replace(/\[object Object\]/g, '')
    .replace(/\bNO_REPLY\b/g, '')
    .replace(/Understood\. Runtime context for the previous user message received and processed\.\s*/gi, '')
    .split('\n')
    .filter(line => {
      const trimmed = line.trim()
      return trimmed !== '[object Object]' && trimmed !== 'NO_REPLY'
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function normalizeChatContent(value) {
  if (typeof value === 'string') return cleanChatText(value)
  if (value == null) return ''
  if (typeof value === 'object') {
    if (typeof value.text === 'string') return cleanChatText(value.text)
    if (typeof value.message === 'string') return cleanChatText(value.message)
    if (typeof value.error === 'string') return cleanChatText(`Error: ${value.error}`)
    return 'The CRM returned structured data instead of a chat message. No visible action was confirmed.'
  }
  return cleanChatText(value)
}

function isBootstrapSetupContent(value) {
  const text = normalizeChatContent(value).toLowerCase()
  return text.includes('who am i? who are you?')
    || text.includes('what should i be called?')
    || text.includes('what sort of creature am i')
    || text.includes('runtime context for the previous user message')
}

function sanitizeMessages(list) {
  if (!Array.isArray(list)) return []
  return list
    .map(m => ({ ...m, content: normalizeChatContent(m?.content) }))
    .filter(m => m?.role === 'user' || (m?.content && !isBootstrapSetupContent(m.content)))
}

const MODELS = [
  { id: 'openclaw',     label: 'OpenClaw',     cost: 'agent tools' },
]

const DEAD_CONFIRMATION_RE = /^(done|done\.|opened|opened\.|updated|updated\.|logged|logged\.|sent|sent\.|booked|booked\.)$/i

function isDeadConfirmation(text) {
  return DEAD_CONFIRMATION_RE.test(String(text || '').trim())
}

function describeUiAction(action) {
  if (!action) return null
  if (action.kind === 'tab' && action.tabId) {
    const label = String(action.label || action.tabId).replace(/[-_]+/g, ' ')
    return `Opened ${label}.`
  }
  if (action.kind === 'record' && action.record) {
    const type = action.record.type || 'record'
    const name = action.record.name || action.record.email || action.record.id || 'selected record'
    const subTab = action.record.subTab ? ` on ${action.record.subTab}` : ''
    return `Opened ${type} ${name}${subTab}.`
  }
  return null
}

function buildActionReceipt(actions) {
  const lines = (actions || []).map(describeUiAction).filter(Boolean)
  if (!lines.length) return ''
  return `CRM action receipt:\n${lines.map(line => `- ${line}`).join('\n')}`
}

async function fetchActionReceipt(since) {
  try {
    const res = await fetch(`/api/agent/ui-actions?since=${since}`, { cache: 'no-store' })
    const json = await res.json()
    if (!res.ok || !json?.ok) return ''
    return buildActionReceipt(json.actions || [])
  } catch {
    return ''
  }
}

function mergeAssistantResult(text, receipt) {
  const clean = String(text || '').trim()
  if (receipt) {
    if (!clean || isDeadConfirmation(clean)) return receipt
    return `${clean}\n\n${receipt}`
  }
  if (isDeadConfirmation(clean)) {
    return 'OpenClaw answered with a bare confirmation, but the CRM did not report a matching screen action back. I did not detect a visible change.'
  }
  return clean || 'OpenClaw returned an empty response.'
}

function ThinkingDots({ agentName = 'Maggie' }) {
  return (
    <span className="ai-wizard-thinking-dots" aria-label={`${agentName} is working`}>
      <span />
      <span />
      <span />
    </span>
  )
}

const NAV_TARGETS = [
  ['dashboard', ['dashboard', 'command center', 'home']],
  ['feed', ['feed', 'activity feed', 'messages']],
  ['leads', ['leads', 'lead board', 'sponsors']],
  ['accounts', ['accounts', 'account list', 'clients', 'client list']],
  ['contacts', ['contacts', 'people']],
  ['pipelines', ['pipelines', 'pipeline', 'deals', 'opportunities']],
  ['projects', ['projects', 'project board']],
  ['tasks', ['tasks', 'todos', 'to dos']],
  ['finance', ['finance']],
  ['documents', ['documents', 'docs', 'contracts']],
  ['products', ['products', 'product catalog', 'catalog']],
  ['switchboard', ['switchboard']],
  ['agents', ['agents']],
  ['agent-labs', ['agent lab', 'agent labs']],
  ['voice-labs', ['voice labs', 'voice lab', 'voice sandbox', 'voice library', 'tts lab', 'gemini voice lab']],
  ['ops', ['ops', 'ops lab']],
  ['repository', ['repository', 'repo', 'gitea', 'source control', 'git']],
  ['media', ['media', 'images', 'graphics']],
  ['calendar', ['calendar']],
  ['notes', ['notes']],
  ['network', ['network']],
  ['settings', ['settings']],
]

const RECORD_TYPE_ALIASES = [
  ['account', ['account', 'client', 'customer']],
  ['contact', ['contact', 'person']],
  ['lead', ['lead', 'prospect']],
  ['project', ['project']],
  ['opportunity', ['opportunity', 'deal']],
  ['domain', ['domain']],
]

const ACCOUNT_SUBTABS = {
  overview: ['overview', 'summary', 'details', 'detail'],
  contacts: ['contacts', 'contact', 'people'],
  deals: ['deals', 'deal', 'opportunities', 'opportunity'],
  projects: ['projects', 'project', 'work'],
  tasks: ['tasks', 'task', 'todos', 'todo', 'to dos'],
  activity: ['activity', 'activities', 'history', 'log'],
  notes: ['notes', 'note', 'memos', 'memo', 'reminders', 'reminder'],
  documents: ['documents', 'document', 'docs', 'doc', 'contracts', 'files'],
  invoices: ['invoices', 'invoice', 'bills'],
  payments: ['payments', 'payment', 'paid'],
  media: ['media', 'images', 'photos', 'graphics', 'pictures', 'assets'],
}

function commandText(value) {
  return String(value || '').toLowerCase().replace(/[^\w\s-]/g, ' ').replace(/\s+/g, ' ').trim()
}

function parseUiCommand(value) {
  let text = commandText(value)
  text = text
    .replace(/^(hey\s+)?maggie\s+/, '')
    .replace(/^please\s+maggie\s+/, '')
    .replace(/^maggie\s+please\s+/, '')
    .replace(/^please\s+/, '')
    .replace(/^(can|could|would)\s+you\s+(please\s+)?/, '')
    .replace(/^(i\s+need\s+you\s+to|i\s+want\s+you\s+to|i\s+need\s+to|help\s+me)\s+/, '')
    .replace(/^please\s+/, '')

  const apiMeterTarget = '(api spend|api spending|api cost|api usage|api balance|api meter|spend meter|usage meter|cost meter)'
  const apiMeterAction = text.match(new RegExp(`^(open|show|expand|close|collapse|minimize|hide|dismiss|unpin)\\s+(the\\s+)?${apiMeterTarget}(\\s+(for me|on my screen))?$`))
  if (apiMeterAction) {
    const verb = apiMeterAction[1]
    return { kind: 'api-meter', action: ['dismiss', 'unpin', 'hide'].includes(verb) ? 'hide' : verb }
  }
  if (/^(open|show|take me to|go to)\s+(the\s+)?api\s+(spend|spending|cost|usage)\s+(control\s+)?panel$/.test(text)) {
    return { kind: 'api-spend-panel' }
  }

  const match = text.match(/^(find and open|show me|open up|open|show|pull up|bring up|go to|take me to|navigate to|transfer me to|transfer to|send me to|connect me to|route me to|display|find|load|launch|get)\s+(.+)$/)
  if (!match) return null

  const target = match[2]
    .replace(/^up\s+/, '')
    .replace(/\s+(for me|on my screen|on the screen|inside the crm|in the crm)$/, '')
    .trim()
  for (const [tabId, terms] of NAV_TARGETS) {
    if (terms.some(term => target === term || target === `the ${term}`)) {
      return { kind: 'tab', tabId, label: terms[0] }
    }
  }

  let type = ''
  for (const [candidate, aliases] of RECORD_TYPE_ALIASES) {
    if (aliases.some(alias => new RegExp(`\\b${alias}\\b`).test(target))) {
      type = candidate
      break
    }
  }

  let subTab = ''
  for (const [candidate, aliases] of Object.entries(ACCOUNT_SUBTABS)) {
    if (aliases.some(alias => new RegExp(`\\b${alias.replace(/\s+/g, '\\s+')}\\b`).test(target))) {
      subTab = candidate
      break
    }
  }

  let query = target
    .replace(/\b(record|screen|page|tab|section|crm|called|named)\b/g, ' ')
    .replace(/\b(for|of|about|on|in|the|a|an|my|your|our)\b/g, ' ')
  for (const [, aliases] of RECORD_TYPE_ALIASES) {
    for (const alias of aliases) query = query.replace(new RegExp(`\\b${alias}\\b`, 'g'), ' ')
  }
  for (const aliases of Object.values(ACCOUNT_SUBTABS)) {
    for (const alias of aliases) query = query.replace(new RegExp(`\\b${alias.replace(/\s+/g, '\\s+')}\\b`, 'g'), ' ')
  }
  query = query.replace(/\s+/g, ' ').trim()

  if (!query && type) {
    const tabId = type === 'opportunity' ? 'pipelines' : `${type}s`
    return { kind: 'tab', tabId, label: tabId }
  }
  if (!query && subTab) return { kind: 'tab', tabId: subTab === 'deals' ? 'pipelines' : subTab, label: subTab }
  if (!query) return null
  return { kind: 'record', type: type || (subTab ? 'account' : ''), query, subTab }
}

// Pull the {"draftLead": {...}} object out of an assistant message.
// Maggie is instructed to emit this JSON block at the end of any lead-harvest
// reply. We use brace-counting (regex can't handle nested objects safely).
function extractDraftLead(content) {
  if (!content) return null
  const marker = '"draftLead"'
  const start = content.lastIndexOf(marker)
  if (start === -1) return null
  let i = content.indexOf(':', start)
  if (i === -1) return null
  while (i < content.length && content[i] !== '{') i++
  if (i >= content.length) return null
  let depth = 0, end = i
  for (; end < content.length; end++) {
    if (content[end] === '{') depth++
    else if (content[end] === '}') { depth--; if (depth === 0) { end++; break } }
  }
  if (depth !== 0) return null  // still streaming or malformed
  try { return JSON.parse(content.slice(i, end)) } catch { return null }
}

// Hide the raw JSON block from the displayed message — keep Maggie's prose only.
function stripDraftLead(content) {
  if (!content) return content
  let out = content
  // strip ```json ... ``` fenced blocks containing draftLead
  out = out.replace(/```(?:json)?\s*\{[\s\S]*?"draftLead"[\s\S]*?\}\s*```/g, '').trim()
  // strip bare {...draftLead...} object
  const start = out.indexOf('{')
  if (start !== -1 && out.includes('"draftLead"')) {
    let depth = 0, end = start
    for (; end < out.length; end++) {
      if (out[end] === '{') depth++
      else if (out[end] === '}') { depth--; if (depth === 0) { end++; break } }
    }
    if (depth === 0 && out.slice(start, end).includes('"draftLead"')) {
      out = (out.slice(0, start) + out.slice(end)).trim()
    }
  }
  return out
}

export default function ChatPanel() {
  const [open, setOpen] = useState(false)
  const [guideMode, setGuideMode] = useState(false)
  const [openedByHover, setOpenedByHover] = useState(false)
  const [messages, setMessages] = useState([])
  // Track which assistant messages we've already saved as leads.
  // Keyed by message index → { savingState: 'idle'|'saving'|'saved'|'error', leadId, error }
  const [savedLeads, setSavedLeads] = useState({})

  const saveDraftLead = async (msgIndex, draft) => {
    setSavedLeads(prev => ({ ...prev, [msgIndex]: { savingState: 'saving' } }))
    try {
      const r = await fetch('/api/leads/save-from-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draftLead: draft }),
      })
      const j = await r.json()
      if (!r.ok || !j.ok) {
        setSavedLeads(prev => ({ ...prev, [msgIndex]: { savingState: 'error', error: j.error || 'failed' } }))
        return
      }
      setSavedLeads(prev => ({ ...prev, [msgIndex]: { savingState: 'saved', leadId: j.lead.id } }))
    } catch (e) {
      setSavedLeads(prev => ({ ...prev, [msgIndex]: { savingState: 'error', error: e.message } }))
    }
  }
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [model, setModel] = useState('openclaw')
  const [activeContext, setActiveContext] = useState(null)
  const [operatorContext, setOperatorContext] = useState({})
  const [useContext, setUseContext] = useState(true)
  const [activeSection, setActiveSection] = useState('dashboard')
  const [wizardSectionOverride, setWizardSectionOverride] = useState(null)
  const [voiceActive, setVoiceActive] = useState(false)
  const [voiceStarting, setVoiceStarting] = useState(false)
  const [voiceError, setVoiceError] = useState('')
  const [autoOpen, setAutoOpen] = useState(true)
  const [activity, setActivity] = useState('')
  const scrollRef = useRef(null)
  const wizardSection = wizardSectionOverride || activeSection
  const sectionAgent = getSectionAgent(wizardSection)
  const section = { label: sectionAgent.label, prompts: sectionAgent.prompts }
  const sectionLabel = section?.label || activeSection || 'Dashboard'
  const activeAgent = guideMode ? {
    id: 'octi',
    name: 'Octi',
    role: 'OpenOcti onboarding guide',
    avatar: OPENOCTI_AVATAR,
    intro: "I'm Octi. Ask me how this package works.",
  } : {
    id: sectionAgent.agentId,
    name: sectionAgent.name,
    role: sectionAgent.role,
    avatar: CURATED_AGENT_AVATARS[sectionAgent.avatarKey] || MAGGIE_AVATAR,
    intro: sectionAgent.intro,
  }
  const activeAgentName = activeAgent.name
  const selectedModel = MODELS.find(m => m.id === model) || MODELS[0]
  const liveProviderLabel = activeAgent.id === 'finance-manager' ? 'OpenAI Realtime' : 'ElevenLabs ConvAI'
  const liveModelLabel = activeAgent.id === 'finance-manager'
    ? `${activeAgent.openaiModel || 'gpt-realtime'} / ${activeAgent.voiceName || 'ash'}`
    : `${activeAgentName} voice agent`

  // Open requests come from the in-header AI icons via a custom event.
  // Menu launches should be section-aware so the drawer opens with the current
  // workspace prompts instead of falling back to stale/default chat context.
  useEffect(() => {
    const handler = (event) => {
      const detail = event.detail || {}
      setGuideMode(detail.agentId === 'octi')
      const requestedSection = typeof detail === 'string'
        ? detail
        : detail.section || detail.tab || window.__fccActiveSection || activeSection
      if (requestedSection) {
        setWizardSectionOverride(requestedSection !== activeSection ? requestedSection : null)
      }
      if (detail.reset === true) {
        setMessages([])
        setSavedLeads({})
      }
      if (typeof detail.open === 'boolean') setOpen(detail.open)
      else setOpen(o => !o)
    }
    window.addEventListener('fcc:toggle-ai', handler)
    return () => window.removeEventListener('fcc:toggle-ai', handler)
  }, [activeSection])

  useEffect(() => {
    const handler = event => {
      const prompt = String(event.detail?.prompt || '')
      setGuideMode(true)
      setWizardSectionOverride('settings')
      setOpen(true)
      setMessages([{ role: 'assistant', content: "Hi — I'm Octi. I can guide you through this OpenOcti package." }])
      if (prompt) setInput(prompt)
    }
    window.addEventListener('openocti:ask', handler)
    return () => window.removeEventListener('openocti:ask', handler)
  }, [])

  // Expose voice-live state to header icons
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('fcc:voice-state', { detail: { voiceActive, voiceStarting, voiceError } }))
  }, [voiceActive, voiceStarting, voiceError])

  // Which agent is actually connected (for the live badge avatar)
  const [connectedAgent, setConnectedAgent] = useState(null)
  useEffect(() => {
    const onAgent = (e) => setConnectedAgent(e.detail || null)
    window.addEventListener('fcc:voice-agent', onAgent)
    if (typeof window !== 'undefined' && window.__fccVoiceAgent) setConnectedAgent(window.__fccVoiceAgent)
    return () => window.removeEventListener('fcc:voice-agent', onAgent)
  }, [])

  // Listening = ear open via Go Live, even with no agent connected yet.
  const [listening, setListening] = useState(false)
  useEffect(() => {
    const onListening = (e) => setListening(!!e.detail)
    window.addEventListener('fcc:voice-listening', onListening)
    if (typeof window !== 'undefined') setListening(!!window.__fccVoiceListening)
    return () => window.removeEventListener('fcc:voice-listening', onListening)
  }, [])

  // Expose chat-open state so the ambient voice glow only shows when chat is closed.
  useEffect(() => {
    window.__fccChatOpen = open
    window.dispatchEvent(new CustomEvent('fcc:chat-open', { detail: open }))
    window.dispatchEvent(new CustomEvent('fcc:ai-wizard-open', { detail: open }))
  }, [open])

  // Listen for voice-live events from VoiceSession so closed AI tab can show status
  useEffect(() => {
    const handler = (e) => {
      const active = !!e.detail
      setVoiceActive(active)
      if (active) {
        setVoiceStarting(false)
        setVoiceError('')
      }
    }
    window.addEventListener('fcc:voice-active', handler)
    if (typeof window !== 'undefined' && window.__fccVoiceActive) setVoiceActive(true)
    return () => window.removeEventListener('fcc:voice-active', handler)
  }, [])

  useEffect(() => {
    const onStarting = (e) => {
      const starting = !!e.detail?.starting
      setVoiceStarting(starting)
      if (starting) setVoiceError('')
    }
    const onError = (e) => {
      setVoiceStarting(false)
      setVoiceActive(false)
      setVoiceError(e.detail?.message || 'Voice could not start')
    }
    window.addEventListener('fcc:voice-starting', onStarting)
    window.addEventListener('fcc:voice-error', onError)
    return () => {
      window.removeEventListener('fcc:voice-starting', onStarting)
      window.removeEventListener('fcc:voice-error', onError)
    }
  }, [])

  // Listen for active-record broadcasts (leads, clients, domains, credentials, voicemails, etc.)
  useEffect(() => {
    const handler = (e) => setActiveContext(e.detail || null)
    window.addEventListener('fcc:active-record', handler)
    // Back-compat with legacy lead event
    const legacyHandler = (e) => setActiveContext(e.detail ? { type: 'lead', ...e.detail } : null)
    window.addEventListener('fcc:active-lead', legacyHandler)
    if (window.__fccActiveRecord) setActiveContext(window.__fccActiveRecord)
    else if (window.__fccActiveLead) setActiveContext({ type: 'lead', ...window.__fccActiveLead })
    return () => {
      window.removeEventListener('fcc:active-record', handler)
      window.removeEventListener('fcc:active-lead', legacyHandler)
    }
  }, [])

  // Listen for active-section broadcasts from main nav
  useEffect(() => {
    const handler = (e) => setActiveSection(e.detail || 'dashboard')
    window.addEventListener('fcc:active-section', handler)
    if (window.__fccActiveSection) setActiveSection(window.__fccActiveSection)
    return () => window.removeEventListener('fcc:active-section', handler)
  }, [])

  useEffect(() => {
    setWizardSectionOverride(null)
  }, [activeSection])

  useEffect(() => {
    const handler = (e) => setOperatorContext(e.detail || {})
    window.addEventListener('fcc:operator-context', handler)
    if (window.__fccOperatorContext) setOperatorContext(window.__fccOperatorContext)
    return () => window.removeEventListener('fcc:operator-context', handler)
  }, [])

  useEffect(() => {
    try {
      const savedVersion = localStorage.getItem(STORAGE_VERSION_KEY)
      if (savedVersion !== STORAGE_VERSION) {
        localStorage.removeItem(STORAGE_KEY)
        localStorage.setItem(STORAGE_VERSION_KEY, STORAGE_VERSION)
      } else {
        const saved = localStorage.getItem(STORAGE_KEY)
        if (saved) setMessages(sanitizeMessages(JSON.parse(saved)))
      }
      const savedModel = localStorage.getItem(MODEL_KEY)
      if (savedModel && MODELS.some(m => m.id === savedModel)) setModel(savedModel)
      else setModel('openclaw')
      const savedAutoOpen = localStorage.getItem(AUTO_OPEN_KEY)
      if (savedAutoOpen === '0' || savedAutoOpen === '1') setAutoOpen(savedAutoOpen === '1')
    } catch {}
  }, [])

  useEffect(() => { localStorage.setItem(MODEL_KEY, model) }, [model])

  useEffect(() => {
    try { localStorage.setItem(AUTO_OPEN_KEY, autoOpen ? '1' : '0') } catch {}
    // Sidebar handle + avatar menu follow the same switch (useHeaderHoverMode).
    try { window.dispatchEvent(new Event('fcc:ai-wizard-auto-open')) } catch {}
  }, [autoOpen])

  useEffect(() => {
    const cleanMessages = sanitizeMessages(messages)
    if (cleanMessages.length > 0) localStorage.setItem(STORAGE_KEY, JSON.stringify(cleanMessages.slice(-50)))
    else localStorage.removeItem(STORAGE_KEY)
  }, [messages])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, loading])

  const runUiCommand = async (text) => {
    const command = parseUiCommand(text)
    if (!command) return null

    if (command.kind === 'api-meter') {
      window.dispatchEvent(new CustomEvent('fcc:api-spend-command', { detail: { action: command.action } }))
      setOpen(false)
      return command.action === 'hide' ? `The API meter is hidden.` : `The API meter is ${command.action === 'open' || command.action === 'expand' ? 'open' : 'closed'}.`
    }

    if (command.kind === 'api-spend-panel') {
      window.dispatchEvent(new CustomEvent('fcc:navigate', { detail: { tab: 'finance', subtab: 'api-spend' } }))
      setOpen(false)
      return `Opening the API spend control panel.`
    }

    if (command.kind === 'tab') {
      window.dispatchEvent(new CustomEvent('fcc:set-tab', { detail: command.tabId }))
      setOpen(false)
      return `Taking you there now.`
    }

    const params = new URLSearchParams({ q: command.query })
    if (command.type) params.set('type', command.type)
    const res = await fetch(`/api/agent/search?${params.toString()}`, { cache: 'no-store' })
    const json = await res.json()
    if (res.status === 401) return 'I need your CRM session refreshed before I can open that record.'
    if (res.status === 403) return 'Your current CRM user does not have permission to open that record.'
    if (!res.ok) throw new Error(json.error || 'Search failed')

    const matches = Array.isArray(json.matches) ? json.matches : []
    const best = matches[0]
    if (!best) return `I could not find a matching ${command.type || 'record'} for "${command.query}".`

    window.dispatchEvent(new CustomEvent('fcc:open-record', {
      detail: {
        ...best,
        tabId: best.tabId,
        subTab: command.subTab || undefined,
      },
    }))
    setOpen(false)
    return command.subTab
      ? `Taking you to ${best.name || best.id} on ${command.subTab} now.`
      : `Taking you to ${best.name || best.id} now.`
  }

  const send = async (overrideText, options = {}) => {
    const text = String(overrideText ?? input).trim()
    if (!text || loading) return
    const operatorTool = options.operatorTool || (guideMode ? { agentId: 'octi', role: 'OpenOcti onboarding guide', runtimeProvider: 'openclaw-hetzner' } : null)
    const requestSection = options.section || resolveWizardAgentSection(activeSection, text)
    setWizardSectionOverride(requestSection !== activeSection ? requestSection : null)
    const requestOperatorContext = options.operatorContext || operatorContext
    const next = [...messages, { role: 'user', content: text }]
    setMessages(next)
    setInput('')
    setLoading(true)
    setActivity(operatorTool?.role ? `Routing to ${operatorTool.role}...` : 'Checking OpenClaw and Command Center tools...')
    try {
      const uiResult = await runUiCommand(text)
      if (uiResult) {
        setMessages([...next, { role: 'assistant', content: uiResult }])
        setLoading(false)
        setActivity('')
        return
      }

      setActivity('Checking CRM invoice command...')
      const invoiceRes = await fetch('/api/agent/invoice-command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, messages: next, section: requestSection }),
      })
      const invoiceJson = await invoiceRes.json().catch(() => ({}))
      if (invoiceJson?.handled) {
        setMessages([...next, { role: 'assistant', content: normalizeChatContent(invoiceJson.text || invoiceJson.error || 'Invoice command finished.') }])
        setLoading(false)
        setActivity('')
        return
      }
      if (!invoiceRes.ok) {
        setMessages([...next, { role: 'assistant', content: normalizeChatContent(invoiceJson.error || 'Invoice command failed before OpenClaw could run.') }])
        setLoading(false)
        setActivity('')
        return
      }

      // One Maggie. Always route through OpenClaw so she has her real tools (fcc_*, nylas_*, voice_call).
      // The legacy /api/agent/chat path is text-only with no tools — using it makes Maggie pretend to act.
      const endpoint = '/api/agent/openclaw-chat'
      const actionSince = Date.now() - 1000
      let assistantText = ''
      let assistantError = ''
      // Add placeholder assistant message we'll fill incrementally
      setMessages([...next, { role: 'assistant', content: '' }])
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next, model, leadContext: useContext ? activeContext : null, section: requestSection, operatorContext: requestOperatorContext, operatorTool }),
      })
      const contentType = res.headers.get('content-type') || ''
      if (contentType.includes('text/event-stream') && res.body) {
        // Streaming path
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buf = ''
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })
          const parts = buf.split('\n\n')
          buf = parts.pop() || ''
          for (const part of parts) {
            const line = part.split('\n').find(l => l.startsWith('data: '))
            if (!line) continue
            try {
              const data = JSON.parse(line.slice(6))
              if (data.error) assistantError = data.error
              if (data.error) setMessages(prev => [...prev.slice(0, -1), { role: 'assistant', content: '⚠ ' + data.error }])
              else if (data.text !== undefined) {
                assistantText = normalizeChatContent(data.text)
                setActivity(data.done ? 'Checking CRM action receipt...' : 'Reading OpenClaw response...')
                setMessages(prev => [...prev.slice(0, -1), { role: 'assistant', content: assistantText }])
              }
            } catch {}
          }
        }
      } else {
        // JSON fallback (non-streaming providers)
        const json = await res.json()
        if (json.error) assistantError = json.error
        if (json.error) setMessages(prev => [...prev.slice(0, -1), { role: 'assistant', content: '⚠ ' + json.error }])
        else {
          assistantText = normalizeChatContent(json.text || '')
          setMessages(prev => [...prev.slice(0, -1), { role: 'assistant', content: assistantText }])
        }
      }
      if (!assistantError) {
        setActivity('Checking CRM action receipt...')
        const receipt = await fetchActionReceipt(actionSince)
        const finalText = mergeAssistantResult(assistantText, receipt)
        setMessages(prev => [...prev.slice(0, -1), { role: 'assistant', content: finalText }])
      }
    } catch (e) {
      setMessages(prev => [...prev.slice(0, -1), { role: 'assistant', content: '⚠ Network error: ' + e.message }])
    }
    setLoading(false)
    setActivity('')
  }

  useEffect(() => {
    const handler = (e) => {
      const prompt = typeof e.detail === 'string' ? e.detail : e.detail?.prompt
      const autoSend = !!e.detail?.autoSend
      if (e.detail?.section) {
        setWizardSectionOverride(e.detail.section !== activeSection ? e.detail.section : null)
      }
      if (prompt) {
        setInput(prompt)
        if (autoSend) send(prompt, {
          operatorTool: e.detail?.operatorTool || null,
          section: e.detail?.section || null,
          operatorContext: e.detail?.operatorContext || null,
        })
      }
      if (e.detail?.open !== false) setOpen(true)
    }
    window.addEventListener('fcc:ai-prompt', handler)
    return () => window.removeEventListener('fcc:ai-prompt', handler)
  })

  const clearChat = () => {
    if (confirm('Clear chat history?')) {
      setMessages([])
      setSavedLeads({})
      setInput('')
      localStorage.removeItem(STORAGE_KEY)
    }
  }

  const toggleLiveMode = () => {
    // Already live or listening -> stop everything.
    if (voiceActive || voiceStarting || listening) {
      setVoiceStarting(false)
      window.dispatchEvent(new CustomEvent('fcc:voice-stop'))
      return
    }
    if (!window.navigator?.mediaDevices?.getUserMedia) {
      setVoiceError('Microphone is blocked in this preview browser.')
      return
    }
    setVoiceError('')
    // Go Live = open the ear only. No agent connects or talks until you summon one
    // ("hey <name>" or tap the equalizer avatar) — and then silently.
    window.dispatchEvent(new CustomEvent('fcc:voice-listen'))
    setOpen(false)
  }
  const voiceSignalOn = voiceActive || voiceStarting || listening
  const voiceStatusLabel = voiceActive ? 'Live' : voiceStarting ? 'Starting' : voiceError ? 'Voice blocked' : 'Ready'

  return (
    <>
      <button
        type="button"
        className={`ai-wizard-top-tab${open ? ' is-open' : ''}`}
        onMouseEnter={() => {
          if (!autoOpen) return
          setOpenedByHover(true)
          setOpen(true)
        }}
        onClick={() => {
          setOpenedByHover(false)
          setOpen(o => !o)
        }}
        aria-label={open ? 'Close AI Wizard' : `Open AI Wizard for ${sectionLabel}`}
        aria-expanded={open}
        aria-controls="ai-wizard-drawer"
        style={{ display: voiceSignalOn ? 'none' : undefined }}
      >
        <span className="ai-wizard-top-tab-icon" data-live={voiceSignalOn ? 'true' : 'false'} aria-hidden="true">
          {voiceSignalOn && connectedAgent?.avatar ? (
            <img src={connectedAgent.avatar} alt="" style={{ width: 20, height: 20, borderRadius: '50%', objectFit: 'cover', display: 'block' }} />
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 3l1.4 3.8L15.5 8l-3.6 1.2-1.4 3.8-1.4-3.8L5.5 8l3.6-1.2L10.5 3z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.5 11l.9 2.4 2.1.8-2.1.8-.9 2.4-.9-2.4-2.1-.8 2.1-.8.9-2.4z" />
            </svg>
          )}
          <span className="ai-wizard-tab-eq" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </span>
        {voiceSignalOn ? (
          <span>{connectedAgent?.name || 'Live'}</span>
        ) : (
          <>
            <span>AI Wizard</span>
            <span className="ai-wizard-top-tab-section">{sectionLabel}</span>
          </>
        )}
      </button>

      {/* Top drawer — always mounted so voice survives closing; shown/hidden with transform */}
      <div id="ai-wizard-drawer" className="ai-wizard-panel flex flex-col overflow-hidden"
        data-ai-panel
        onMouseLeave={() => {
          if (!autoOpen || !openedByHover) return
          setOpenedByHover(false)
          setOpen(false)
        }}
        style={{
          background: 'var(--surface)',
          boxShadow: 'var(--shadow-lg)',
          opacity: open ? 1 : 0,
          visibility: open ? 'visible' : 'hidden',
          pointerEvents: open ? 'auto' : 'none',
          transition: 'opacity 160ms ease-out, transform 220ms cubic-bezier(0.22, 1, 0.36, 1), visibility 160ms ease-out',
          transform: open ? 'translateY(0)' : 'translateY(calc(-100% - 42px))',
        }}>
        {/* Header */}
        <div className="ai-wizard-header" style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
          <div className="ai-wizard-title-row">
            <div className="flex items-center gap-3 min-w-0">
              <div className="ai-wizard-avatar">
                <img src={activeAgent.avatar} alt={activeAgentName} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <h2 className="ai-wizard-title">{activeAgentName}</h2>
                  <span className="ai-wizard-section-badge">Section: {sectionLabel}</span>
                  <span className="ai-wizard-status"
                    style={{ background: voiceSignalOn ? 'var(--red-soft, #fee2e2)' : 'var(--surface2)', color: voiceSignalOn ? 'var(--red, #dc2626)' : 'var(--text-muted)', border: `1px solid ${voiceSignalOn ? 'var(--red, #dc2626)' : 'var(--border)'}` }}>
                    <span className="ai-wizard-status-dot" style={{ background: voiceSignalOn ? 'var(--red, #dc2626)' : 'var(--text-muted)' }} />
                    {voiceStatusLabel}
                  </span>
                </div>
                <div className="ai-wizard-subtitle">{activeAgent.intro}</div>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="ai-wizard-close" data-tooltip="Close" aria-label="Close AI Wizard">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>

          <div className="ai-wizard-control-row">
            <div className="ai-wizard-voice-runtime" aria-hidden="true">
              <VoiceSession activeContext={activeContext} activeSection={activeSection} />
            </div>
            <button
              type="button"
              className={`ai-wizard-auto-toggle ${autoOpen ? 'is-on' : ''}`}
              onClick={() => setAutoOpen(v => !v)}
              aria-pressed={autoOpen}
              title={autoOpen ? 'Hover or click opens the AI Wizard.' : 'Click only opens the AI Wizard.'}
            >
              <span className="ai-wizard-control-label">Auto</span>
              <span className="ai-wizard-switch-track" aria-hidden="true">
                <span className="ai-wizard-switch-thumb" />
              </span>
              <strong>{autoOpen ? 'Hover' : 'Click'}</strong>
            </button>
            <button type="button" onClick={toggleLiveMode} className={`ai-wizard-live ${voiceSignalOn ? 'is-live' : ''}${voiceError ? ' is-error' : ''}`}>
              <span className="ai-wizard-status-dot" />
              {voiceActive ? 'Live' : voiceStarting ? 'Starting…' : voiceError ? 'Retry' : 'Go Live'}
            </button>
            {voiceError && <span className="ai-wizard-voice-error">{voiceError}</span>}
            <div className="ai-wizard-brain-pill" title={`Text chat model route: ${selectedModel.label}.`}>
              <span className="ai-wizard-control-label">Text Brain</span>
              <strong>{selectedModel.label}</strong>
            </div>
            <div className="ai-wizard-brain-pill" title={`Live voice provider/model: ${liveProviderLabel} - ${liveModelLabel}.`}>
              <span className="ai-wizard-control-label">Live Voice</span>
              <strong>{liveProviderLabel}</strong>
            </div>
            <button
              onClick={clearChat}
              className="ai-wizard-clear"
              data-tooltip="Clear chat content"
            >
              Clear chat
            </button>
          </div>

          <div className="ai-wizard-prompt-row" aria-label={`Quick prompts for ${section.label}`}>
            {section.prompts.slice(0, 4).map(s => (
              <button
                key={s}
                type="button"
                onClick={() => send(s, { section: wizardSection })}
                disabled={loading}
                title={s}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto no-scrollbar px-5 py-4 space-y-3">
          {messages.length === 0 && (() => {
            return (
              <div className="text-sm py-6" style={{ color: 'var(--text-muted)' }}>
                <div className="mb-4">{WELCOME}</div>
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider font-semibold mb-2">
                  <span style={{ color: 'var(--text-muted)' }}>Relevant for</span>
                  <span className="px-2 py-0.5 rounded-full" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>{section.label}</span>
                </div>
                <div className="space-y-1.5">
                  {section.prompts.map(s => (
                    <button key={s} onClick={() => send(s)} className="block text-left text-xs px-3 py-2 rounded-lg w-full"
                      style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )
          })()}
          {messages.map((m, i) => {
            const isLast = i === messages.length - 1
            const isStreaming = loading && isLast && m.role === 'assistant'
            const content = normalizeChatContent(m.content)
            const draft = m.role === 'assistant' && !isStreaming ? extractDraftLead(content) : null
            const displayedContent = draft ? stripDraftLead(content) : content
            const saveState = savedLeads[i] || { savingState: 'idle' }
            if (m.role === 'user' && !displayedContent) return null
            if (m.role === 'assistant' && !isStreaming && !displayedContent && !draft) return null
            if (m.role === 'user') {
              return (
                <div key={i} className="ai-wizard-user-echo">
                  <div className="ai-wizard-user-label">You asked</div>
                  <div className="ai-wizard-user-text">{displayedContent}</div>
                </div>
              )
            }
            return (
              <div key={i} className="flex flex-col items-start">
                <div className="max-w-[85%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap"
                  style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', borderBottomLeftRadius: 4 }}>
                  {m.role === 'assistant' && (
                    <div className="flex items-center gap-2 mb-1.5" style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 700 }}>
                      <span className="ai-wizard-avatar" style={{ width: 22, height: 22, minWidth: 22 }}>
                        <img src={activeAgent.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      </span>
                      <span>{activeAgentName}</span>
                      {isStreaming && <ThinkingDots agentName={activeAgentName} />}
                    </div>
                  )}
                  {displayedContent}
                </div>
                {draft && (
                  <div className="mt-2 max-w-[85%] rounded-xl p-3"
                    style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                      Draft Lead
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>
                      {draft.name && <div><b>{draft.name}</b>{draft.businessName ? ` — ${draft.businessName}` : ''}</div>}
                      {!draft.name && draft.businessName && <div><b>{draft.businessName}</b></div>}
                      {draft.email && <div style={{ color: 'var(--text-muted)' }}>{draft.email}</div>}
                      {draft.phone && <div style={{ color: 'var(--text-muted)' }}>{draft.phone}</div>}
                      {draft.suggestedPipelineId && <div style={{ color: 'var(--text-muted)' }}>→ {draft.suggestedPipelineId}</div>}
                      {draft.notes && <div style={{ color: 'var(--text-muted)', marginTop: 4, fontSize: 12 }}>{draft.notes}</div>}
                    </div>
                    <div className="mt-3">
                      {saveState.savingState === 'idle' && (
                        <button
                          onClick={() => saveDraftLead(i, draft)}
                          style={{
                            padding: '10px 20px',
                            minHeight: 48,
                            fontSize: 15,
                            fontWeight: 600,
                            borderRadius: 10,
                            border: 'none',
                            cursor: 'pointer',
                            background: 'rgb(34, 197, 94)',
                            color: 'white',
                            width: '100%',
                          }}
                        >
                          Save lead
                        </button>
                      )}
                      {saveState.savingState === 'saving' && (
                        <div style={{ padding: 12, fontSize: 14, color: 'var(--text-muted)', textAlign: 'center' }}>Saving…</div>
                      )}
                      {saveState.savingState === 'saved' && (
                        <div style={{ padding: 12, fontSize: 14, fontWeight: 600, color: 'rgb(34, 197, 94)', textAlign: 'center' }}>
                          ✓ Saved — {saveState.leadId}
                        </div>
                      )}
                      {saveState.savingState === 'error' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <div style={{ padding: 8, fontSize: 13, color: 'rgb(239, 68, 68)' }}>⚠ {saveState.error}</div>
                          <button
                            onClick={() => saveDraftLead(i, draft)}
                            style={{ padding: '10px 20px', minHeight: 48, fontSize: 15, fontWeight: 600, borderRadius: 10, border: 'none', cursor: 'pointer', background: 'rgb(34, 197, 94)', color: 'white' }}
                          >
                            Retry save
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
          {loading && (messages.length === 0 || messages[messages.length - 1].role !== 'assistant') && (
            <div className="flex justify-start">
              <div className="px-3 py-2 rounded-2xl text-sm" style={{ background: 'var(--surface2)', color: 'var(--text-muted)', border: '1px solid var(--border)', borderBottomLeftRadius: 4 }}>
                <div className="flex items-center gap-2 mb-1" style={{ fontSize: 11, fontWeight: 700 }}>
                  <span className="ai-wizard-avatar" style={{ width: 22, height: 22, minWidth: 22 }}>
                    <img src={activeAgent.avatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                  </span>
                  <span>{activeAgentName}</span>
                  <ThinkingDots agentName={activeAgentName} />
                </div>
              </div>
            </div>
          )}
          {loading && messages.length > 0 && messages[messages.length - 1].role === 'assistant' && messages[messages.length - 1].content && (
            <div className="flex justify-start">
              <div className="text-[10px] flex items-center gap-1.5 pl-3" style={{ color: 'var(--text-muted)' }}>
                <span>{activeAgentName}</span>
                <ThinkingDots agentName={activeAgentName} />
              </div>
            </div>
          )}
        </div>

        {/* Active context chip */}
        {activeContext && (() => {
          const type = activeContext.type || 'record'
          const name = activeContext.name || activeContext.bn || activeContext.domain || activeContext.title || activeContext.email || 'Selected ' + type
          const typeLabel = { lead: 'Lead', client: 'Client', domain: 'Domain', credential: 'Credential', voicemail: 'Voicemail', payment: 'Payment' }[type] || 'Record'
          return (
            <div className="px-4 py-2 flex items-center gap-2" style={{ borderTop: '1px solid var(--border)', background: useContext ? 'var(--accent-soft)' : 'var(--surface2)' }}>
              <label className="flex items-center gap-1.5 text-xs cursor-pointer flex-1 min-w-0">
                <input type="checkbox" checked={useContext} onChange={e => setUseContext(e.target.checked)} />
                <span style={{ color: 'var(--text-muted)' }}>{typeLabel}:</span>
                <span className="font-semibold truncate" style={{ color: 'var(--accent)' }}>{name}</span>
              </label>
              <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--surface)', color: 'var(--text-muted)' }}>AI knows this {type}</span>
            </div>
          )
        })()}

        {/* Input */}
        <div className="ai-wizard-composer">
          <div className="flex gap-2 items-end">
            <textarea
              value={input}
              onChange={e => {
                setInput(e.target.value)
                // Auto-grow with content
                e.target.style.height = 'auto'
                e.target.style.height = Math.min(e.target.scrollHeight, 240) + 'px'
              }}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              placeholder="Ask anything about your CRM..."
              rows={1}
              className="ai-wizard-textarea flex-1 px-3 py-2.5 rounded-lg text-sm resize-none leading-relaxed"
              style={{ maxHeight: 120, minHeight: 44, fontFamily: 'inherit' }}
            />
            <button onClick={send} disabled={!input.trim() || loading}
              className="ai-wizard-send px-4 py-2 rounded-lg text-sm font-semibold"
              style={{ opacity: (!input.trim() || loading) ? 0.4 : 1 }}>
              Send
            </button>
          </div>
          <div className="text-[9px] mt-1.5" style={{ color: 'var(--text-muted)' }}>Enter to send · Shift+Enter for new line</div>
        </div>
      </div>
    </>
  )
}
