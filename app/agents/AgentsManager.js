'use client'
import ThemedSelect from '../components/ThemedSelect'
import PageHeader, { LabHeaderButton } from '../components/PageHeader'
import ViewModeToggle from '../components/ViewModeToggle'
import { Paginator, usePagination } from '../components/Paginator'
import BulkActionsMenu from '../components/BulkActionsMenu'
import OrcaHandoffPanel from './OrcaHandoffPanel'
import ItemActionsMenu from '../components/ItemActionsMenu'
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { OPENAI_REALTIME_VOICES, GEMINI_VOICES, GEMINI_VOICE_MODELS } from '@/lib/realtime-voice-tools'
import { AGENT_CHANNEL_OPTIONS } from '@/lib/agent-channels'
import { IMAGE_GENERATION_PROVIDER_OPTIONS, imageGenerationProviderOption, normalizeImageGenerationPreference } from '@/lib/image-generation-preferences'
import { Bot, FlaskConical, Globe2, Hash, Link2, Mail, MessageSquare, Mic2, Phone, Plus, RefreshCw, Search, Send, Wrench } from 'lucide-react'

const STORAGE_KEY = 'farrington.agents.viewState.v1'
const DEFAULT_VIEW_MODE = 'list'
const VOICE_LAB_RESULTS_KEY = 'fcc-voice-lab-results-v1'
const RUNTIME_FILTERS = [
  { id: 'openclaw-hetzner', label: 'OpenClaw' },
  { id: 'deerflow-hetzner', label: 'DeerFlow' },
  { id: 'hermes-hetzner', label: 'Hermes' },
  { id: 'deepseek-harness-local', label: 'DeepSeek Harness' },
]

function runtimeLabelFor(runtimeProvider) {
  return RUNTIME_FILTERS.find(runtime => runtime.id === runtimeProvider)?.label || 'OpenClaw'
}

const CHIRP3_MODEL = 'chirp3-hd'
const CHIRP3_VOICES = [
  'en-US-Chirp3-HD-Achernar',
  'en-US-Chirp3-HD-Achird',
  'en-US-Chirp3-HD-Algenib',
  'en-US-Chirp3-HD-Algieba',
  'en-US-Chirp3-HD-Alnilam',
  'en-US-Chirp3-HD-Aoede',
  'en-US-Chirp3-HD-Autonoe',
  'en-US-Chirp3-HD-Callirrhoe',
  'en-US-Chirp3-HD-Charon',
  'en-US-Chirp3-HD-Despina',
  'en-US-Chirp3-HD-Enceladus',
  'en-US-Chirp3-HD-Erinome',
  'en-US-Chirp3-HD-Fenrir',
  'en-US-Chirp3-HD-Gacrux',
  'en-US-Chirp3-HD-Iapetus',
  'en-US-Chirp3-HD-Kore',
  'en-US-Chirp3-HD-Laomedeia',
  'en-US-Chirp3-HD-Leda',
  'en-US-Chirp3-HD-Orus',
  'en-US-Chirp3-HD-Puck',
  'en-US-Chirp3-HD-Pulcherrima',
  'en-US-Chirp3-HD-Rasalgethi',
  'en-US-Chirp3-HD-Sadachbia',
  'en-US-Chirp3-HD-Sadaltager',
  'en-US-Chirp3-HD-Schedar',
  'en-US-Chirp3-HD-Sulafat',
  'en-US-Chirp3-HD-Umbriel',
  'en-US-Chirp3-HD-Vindemiatrix',
  'en-US-Chirp3-HD-Zephyr',
  'en-US-Chirp3-HD-Zubenelgenubi',
]
const CHIRP3_VOICE_GENDER = {
  Achernar: 'Female',
  Achird: 'Male',
  Algenib: 'Male',
  Algieba: 'Male',
  Alnilam: 'Male',
  Aoede: 'Female',
  Autonoe: 'Female',
  Callirrhoe: 'Female',
  Charon: 'Male',
  Despina: 'Female',
  Enceladus: 'Male',
  Erinome: 'Female',
  Fenrir: 'Male',
  Gacrux: 'Female',
  Iapetus: 'Male',
  Kore: 'Female',
  Laomedeia: 'Female',
  Leda: 'Female',
  Orus: 'Male',
  Puck: 'Male',
  Pulcherrima: 'Female',
  Rasalgethi: 'Male',
  Sadachbia: 'Male',
  Sadaltager: 'Male',
  Schedar: 'Male',
  Sulafat: 'Female',
  Umbriel: 'Male',
  Vindemiatrix: 'Female',
  Zephyr: 'Female',
  Zubenelgenubi: 'Male',
}

function voiceProviderLabel(provider) {
  if (provider === 'openai') return 'OpenAI Realtime'
  if (provider === 'gemini') return 'Gemini Voice'
  if (provider === 'chirp3') return 'Google Chirp 3 HD'
  if (provider === 'vibevoice') return 'VibeVoice'
  if (provider === 'chatterbox') return 'Chatterbox'
  return 'ElevenLabs'
}

function voiceModelLabel(voice = {}, fallback = '') {
  if (voice.provider === 'openai') return voice.openaiModel || 'gpt-realtime'
  if (voice.provider === 'gemini') return voice.geminiModel || GEMINI_VOICE_MODELS[0]
  if (voice.provider === 'chirp3') return voice.chirp3Model || CHIRP3_MODEL
  return fallback || 'not set'
}

function voiceNameLabel(voice = {}, fallback = '') {
  if (voice.provider === 'none') return 'Not configured'
  if (voice.provider === 'openai') return voice.openaiVoice || 'marin'
  if (voice.provider === 'gemini') return voice.geminiVoice || 'Kore'
  if (voice.provider === 'chirp3') return voice.chirp3Voice || CHIRP3_VOICES[0]
  return fallback || 'ElevenLabs'
}

function chirpShortName(voice = '') {
  return String(voice || '').replace('en-US-Chirp3-HD-', '')
}

function chirpGender(voice = '') {
  return CHIRP3_VOICE_GENDER[chirpShortName(voice)] || ''
}

function chirpOptionLabel(voice = '') {
  const name = chirpShortName(voice)
  const gender = chirpGender(voice)
  return gender ? `${name} - ${gender}` : name
}

function chirpVoicesByGender(gender = 'all') {
  if (gender === 'all') return CHIRP3_VOICES
  return CHIRP3_VOICES.filter(voice => chirpGender(voice).toLowerCase() === gender)
}

function normalizeVoiceProvider(provider) {
  return ['none', 'openai', 'gemini', 'chirp3', 'vibevoice', 'chatterbox'].includes(provider) ? provider : 'elevenlabs'
}

function isProductionVoiceLocked(agent = {}) {
  return ['main', 'coding'].includes(agent.id)
}

function getVoiceRuntimeStatus(agent = {}, elSyncStatus = null) {
  const voice = agent.voice || { provider: 'elevenlabs' }
  const provider = normalizeVoiceProvider(voice.provider)
  const hasElevenBinding = !!elSyncStatus?.hasBinding
  const productionLocked = isProductionVoiceLocked(agent)
  const selectedVoice = voiceNameLabel(voice, elSyncStatus?.voiceName || agent.voiceProfile || 'ElevenLabs')
  const selectedModel = voiceModelLabel(voice, agent.brain?.modelId || 'not set')
  const lockedReason = productionLocked
    ? 'Protected production agent'
    : hasElevenBinding
      ? 'ElevenLabs ConvAI binding protects phone flows'
      : ''

  if (provider === 'none') {
    return {
      provider,
      providerLabel: 'No voice',
      selectedModel,
      selectedVoice,
      tone: 'info',
      summary: 'Voice not configured',
      livePhone: 'No phone provider assigned',
      sandbox: 'Voice testing is disabled for this starter',
      assignable: 'Choose a provider before enabling voice',
      locked: false,
      lockReason: '',
    }
  }

  if (provider === 'elevenlabs') {
    return {
      provider,
      providerLabel: 'ElevenLabs',
      selectedModel,
      selectedVoice,
      tone: hasElevenBinding ? 'ok' : 'warn',
      summary: hasElevenBinding ? 'Live phone ready' : 'Needs ElevenLabs binding',
      livePhone: hasElevenBinding ? 'Live via ElevenLabs ConvAI' : 'Not wired to phone yet',
      sandbox: hasElevenBinding ? 'Voice test uses the ElevenLabs binding' : 'Voice test blocked until binding exists',
      assignable: hasElevenBinding ? 'Already assigned' : 'Assignable after binding',
      locked: false,
      lockReason: '',
    }
  }

  if (provider === 'chirp3') {
    return {
      provider,
      providerLabel: 'Google Chirp 3 HD',
      selectedModel,
      selectedVoice,
      tone: productionLocked || hasElevenBinding ? 'warn' : 'info',
      summary: productionLocked || hasElevenBinding ? 'Sandbox only on this agent' : 'Sandbox/TTS ready',
      livePhone: 'Not a live phone runtime yet',
      sandbox: 'Works for CRM sandbox and generated spoken replies',
      assignable: productionLocked || hasElevenBinding ? 'Use a separate experiment agent' : 'Safe to assign for experiments',
      locked: productionLocked || hasElevenBinding,
      lockReason: lockedReason,
    }
  }

  if (provider === 'openai') {
    return {
      provider,
      providerLabel: 'OpenAI Realtime',
      selectedModel,
      selectedVoice,
      tone: productionLocked || hasElevenBinding ? 'warn' : 'info',
      summary: productionLocked || hasElevenBinding ? 'Experiment blocked here' : 'Mic test ready',
      livePhone: 'Not bound to ElevenLabs phone flow',
      sandbox: 'Works in the CRM realtime voice test path',
      assignable: productionLocked || hasElevenBinding ? 'Use a separate experiment agent' : 'Safe to assign for experiments',
      locked: productionLocked || hasElevenBinding,
      lockReason: lockedReason,
    }
  }

  if (provider === 'gemini') {
    return {
      provider,
      providerLabel: 'Gemini Voice',
      selectedModel,
      selectedVoice,
      tone: productionLocked || hasElevenBinding ? 'warn' : 'info',
      summary: productionLocked || hasElevenBinding ? 'Sandbox only on this agent' : 'Sandbox voice ready',
      livePhone: 'Not bound to ElevenLabs phone flow',
      sandbox: 'Works in the CRM voice sandbox path',
      assignable: productionLocked || hasElevenBinding ? 'Use a separate experiment agent' : 'Safe to assign for experiments',
      locked: productionLocked || hasElevenBinding,
      lockReason: lockedReason,
    }
  }

  return {
    provider,
    providerLabel: voiceProviderLabel(provider),
    selectedModel,
    selectedVoice,
    tone: 'warn',
    summary: 'Provider needs setup',
    livePhone: 'Not verified',
    sandbox: 'Not wired on Ubuntu yet',
    assignable: 'Hold for lab setup',
    locked: true,
    lockReason: 'Provider runtime is not installed',
  }
}

const CHANNEL_OPTIONS = AGENT_CHANNEL_OPTIONS
const CHANNEL_LABELS = Object.fromEntries(CHANNEL_OPTIONS.map(channel => [channel.id, channel.shortLabel || channel.label]))
const CHANNEL_ICONS = {
  phone: Phone,
  sms: MessageSquare,
  email: Mail,
  web: Globe2,
  voice: Mic2,
  telegram: Send,
  discord: Hash,
  internal: Wrench,
}

const DEFAULT_LABS = {
  languageModel: '',
  fallbackModels: '',
  imageModel: 'gpt-image-1',
  videoModel: '',
  workflowRecipe: '',
  pluginNotes: '',
  automationNotes: '',
  gptNotes: '',
  routingStrategy: 'balanced',
  latencyTargetMs: '1200',
  maxCostPerDemo: '',
  loadBalancingNotes: '',
  fallbackPolicy: 'Try primary first, then fall back on timeout, rate limit, quota, or provider outage.',
  evalChecklist: '',
  successMetrics: '',
  embedStyle: 'floating',
  embedTheme: 'light',
  embedAllowedDomain: '',
  mindstudioFlows: [],
  notes: '',
  capabilities: [],
}

const CAPABILITY_TEMPLATES = [
  {
    id: 'email-intake',
    name: 'Email intake and routing',
    trigger: 'New inbound email',
    channels: ['email', 'internal'],
    tools: ['fcc_call', 'fcc_create_task', 'fcc_log_activity', 'fcc_send_email'],
    actions: ['Classify the request', 'Create a CRM task or activity', 'Draft or send the approved response', 'Escalate urgent work'],
    guardrails: ['Do not send customer-facing email without an approval rule', 'Log every routed request to the CRM timeline'],
  },
  {
    id: 'lead-capture',
    name: 'Lead capture and qualification',
    trigger: 'Website form, webhook, or chat handoff',
    channels: ['web', 'email', 'sms'],
    tools: ['fcc_call', 'fcc_search', 'fcc_create_task', 'fcc_send_email'],
    actions: ['Create or update the lead', 'Ask missing qualifying questions', 'Schedule or assign follow-up', 'Notify the owner'],
    guardrails: ['Never invent budget, timeline, or contact details', 'Keep a human approval step before quotes or contracts'],
  },
  {
    id: 'scheduled-ops',
    name: 'Scheduled operations check',
    trigger: 'Daily, weekly, or custom schedule',
    channels: ['internal'],
    tools: ['fcc_call', 'fcc_create_task', 'fcc_log_activity'],
    actions: ['Run the assigned check', 'Summarize what changed', 'Create tasks for exceptions', 'Alert only when thresholds are met'],
    guardrails: ['Avoid noisy alerts', 'Include timestamps and source records in summaries'],
  },
  {
    id: 'billing-event',
    name: 'Billing or payment event',
    trigger: 'Stripe/payment webhook or finance review',
    channels: ['email', 'internal'],
    tools: ['fcc_call', 'fcc_create_invoice', 'fcc_send_invoice_via_stripe', 'fcc_create_task', 'fcc_log_activity'],
    actions: ['Match the client or license', 'Prepare the invoice/payment follow-up', 'Create an owner task for exceptions', 'Log the event'],
    guardrails: ['Do not move money without explicit approval', 'Treat failed payments, refunds, and disputes as high-risk'],
  },
]

const CONNECTOR_POOL = [
  {
    id: 'mcp',
    name: 'MCP Connector',
    publisher: 'Model Context Protocol',
    fit: 'Best for agent-native tools and fast connector discovery.',
    mark: 'MCP',
    accent: '#2563eb',
  },
  {
    id: 'composio',
    name: 'Composio',
    publisher: 'Composio',
    fit: 'Best for many SaaS tools behind one agent tool layer.',
    mark: 'CO',
    accent: '#111827',
  },
  {
    id: 'pipedream',
    name: 'Pipedream Connect',
    publisher: 'Pipedream',
    fit: 'Best for embedded customer-authenticated app integrations.',
    mark: 'PD',
    accent: '#1c64f2',
  },
  {
    id: 'nylas',
    name: 'Nylas',
    publisher: 'Nylas',
    fit: 'Best for email, calendar, contacts, scheduling, and inbox workflows.',
    mark: 'NY',
    accent: '#111827',
  },
  {
    id: 'zapier',
    name: 'Zapier',
    publisher: 'Zapier',
    fit: 'Best for quick workflow bridges and webhook handoffs.',
    logoUrl: 'https://cdn.simpleicons.org/zapier/ff4f00',
    mark: 'ZA',
    accent: '#ff4f00',
  },
  {
    id: 'make',
    name: 'Make',
    publisher: 'Make',
    fit: 'Best for visual automation scenarios and customer workflow demos.',
    logoUrl: 'https://cdn.simpleicons.org/make/6d00cc',
    mark: 'MK',
    accent: '#6d00cc',
  },
  {
    id: 'n8n',
    name: 'n8n',
    publisher: 'n8n',
    fit: 'Best for self-hosted workflow automation and private operations.',
    logoUrl: 'https://cdn.simpleicons.org/n8n/ea4b71',
    mark: 'n8n',
    accent: '#ea4b71',
  },
  {
    id: 'direct-api',
    name: 'Direct API',
    publisher: 'Internal / vendor API',
    fit: 'Best when the service is strategic, high-volume, or needs strict control.',
    mark: 'API',
    accent: '#0f766e',
  },
]

const QUICK_CONNECTORS = [
  { id: 'gmail', name: 'Gmail', logoUrl: 'https://cdn.simpleicons.org/gmail/ea4335', mark: 'GM', accent: '#ea4335' },
  { id: 'google-calendar', name: 'Google Calendar', logoUrl: 'https://cdn.simpleicons.org/googlecalendar/4285f4', mark: 'GC', accent: '#4285f4' },
  { id: 'google-drive', name: 'Google Drive', logoUrl: 'https://cdn.simpleicons.org/googledrive/34a853', mark: 'GD', accent: '#34a853' },
  { id: 'github', name: 'GitHub', logoUrl: 'https://cdn.simpleicons.org/github/181717', mark: 'GH', accent: '#181717' },
  { id: 'stripe', name: 'Stripe', logoUrl: 'https://cdn.simpleicons.org/stripe/635bff', mark: 'ST', accent: '#635bff' },
  { id: 'supabase', name: 'Supabase', logoUrl: 'https://cdn.simpleicons.org/supabase/3ecf8e', mark: 'SB', accent: '#3ecf8e' },
  { id: 'vercel', name: 'Vercel', logoUrl: 'https://cdn.simpleicons.org/vercel/000000', mark: 'VC', accent: '#111827' },
  { id: 'huggingface', name: 'Hugging Face', logoUrl: 'https://cdn.simpleicons.org/huggingface/ff9d00', mark: 'HF', accent: '#ff9d00' },
  { id: 'canva', name: 'Canva', mark: 'CV', accent: '#00c4cc' },
  { id: 'openai', name: 'OpenAI', mark: 'AI', accent: '#111827' },
  { id: 'elevenlabs', name: 'ElevenLabs', logoUrl: 'https://cdn.simpleicons.org/elevenlabs/111827', mark: '11', accent: '#111827' },
  { id: 'firebase', name: 'Firebase', logoUrl: 'https://cdn.simpleicons.org/firebase/dd2c00', mark: 'FB', accent: '#dd2c00' },
  { id: 'cloudflare', name: 'Cloudflare', logoUrl: 'https://cdn.simpleicons.org/cloudflare/f38020', mark: 'CF', accent: '#f38020' },
  { id: 'resend', name: 'Resend', logoUrl: 'https://cdn.simpleicons.org/resend/111827', mark: 'RS', accent: '#111827' },
  { id: 'twilio', name: 'Twilio', mark: 'TW', accent: '#f22f46' },
]

function newCapability(seed = {}) {
  const id = seed.id || `cap-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
  return {
    id,
    name: seed.name || 'New capability',
    status: seed.status || 'draft',
    trigger: seed.trigger || 'On demand',
    integration: seed.integration || '',
    channels: Array.isArray(seed.channels) ? seed.channels : [],
    tools: Array.isArray(seed.tools) ? seed.tools : [],
    actions: Array.isArray(seed.actions) ? seed.actions : [],
    guardrails: Array.isArray(seed.guardrails) ? seed.guardrails : [],
    approval: seed.approval || 'manual',
    review: seed.review || {
      status: 'unreviewed',
      risk: 'medium',
      source: '',
      docsUrl: '',
      authModel: '',
      scopes: '',
      notes: '',
    },
    notes: seed.notes || '',
    lastUpdated: new Date().toISOString(),
  }
}

const PROMPT_SYNC_LABELS = {
  NOT_IMPORTED: 'Not imported',
  SYNCED: 'Synced',
  WORKSHOP_EDITED: 'Workshop edited',
  LIVE_CHANGED: 'Live changed',
  CONFLICT: 'Conflict',
}

const PROMPT_SYNC_COLORS = {
  NOT_IMPORTED: '#64748b',
  SYNCED: '#16a34a',
  WORKSHOP_EDITED: '#d97706',
  LIVE_CHANGED: '#0284c7',
  CONFLICT: '#dc2626',
}

function asLabAgent(agent) {
  return {
    ...agent,
    voice: {
      provider: 'openai',
      openaiModel: 'gpt-realtime',
      openaiVoice: 'marin',
      demoMode: true,
      ...(agent.voice || {}),
    },
    labs: {
      ...DEFAULT_LABS,
      ...(agent.labs || {}),
    },
  }
}

function labSnapshot(agent) {
  if (!agent) return ''
  return JSON.stringify({
    id: agent.id,
    name: agent.name || '',
    role: agent.role || '',
    description: agent.description || '',
    brain: agent.brain || {},
    voice: agent.voice || {},
    labs: agent.labs || {},
    tools: agent.tools || [],
    channels: agent.channels || [],
  })
}

function loadView() {
  if (typeof window === 'undefined') return {}
  try { return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}') } catch { return {} }
}
function normalizeViewMode(mode) {
  return mode === 'card' ? 'card' : DEFAULT_VIEW_MODE
}
function saveView(v) {
  if (typeof window === 'undefined') return
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(v)) } catch {}
}

export default function AgentsManager({ labMode = false }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selected, setSelected] = useState(null)
  const [selectedAgents, setSelectedAgents] = useState(new Set())
  const [editing, setEditing] = useState(null)
  const [talking, setTalking] = useState(null)
  const [activeTab, setActiveTab] = useState('identity')
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState(null)

  const initial = loadView()
  const [filterCat, setFilterCat] = useState(initial.filterCat || 'all')
  const [filterStatus, setFilterStatus] = useState(initial.filterStatus || 'all')
  const [filterRuntime, setFilterRuntime] = useState(initial.filterRuntime || 'all')
  const [selectedTenantId, setSelectedTenantId] = useState(initial.selectedTenantId || 'all')
  const [query, setQuery] = useState(initial.query || '')
  const [viewMode, setViewMode] = useState(() => normalizeViewMode(initial.viewMode))

  useEffect(() => { saveView({ filterCat, filterStatus, filterRuntime, selectedTenantId, query, viewMode }) }, [filterCat, filterStatus, filterRuntime, selectedTenantId, query, viewMode])
  useEffect(() => {
    const resetFromMainNav = (event) => {
      if (event?.detail?.tab !== 'agents') return
      setViewMode(DEFAULT_VIEW_MODE)
      setSelectedAgents(new Set())
      setSelected(null)
      setEditing(null)
      setTalking(null)
    }
    window.addEventListener('fcc:main-nav', resetFromMainNav)
    return () => window.removeEventListener('fcc:main-nav', resetFromMainNav)
  }, [])

  // Per-agent ElevenLabs sync status (last-synced timestamp, has-binding, etc.).
  // Read-only — refetched after every reload so the panel reflects current state.
  const [elSyncStatus, setElSyncStatus] = useState({})
  const [promptSyncStatus, setPromptSyncStatus] = useState({})
  // Real ElevenLabs usage per agent — calls, minutes, last activity. Cached server-side for 5min.
  const [usage, setUsage] = useState({})
  // Voice handoff latency — how long switching the active agent takes (mic/signed-url/provider). Cached 60s.
  const [handoff, setHandoff] = useState(null)
  // Tenants list (in-house brands + active leases). Drives the tenant dropdown.
  const [tenants, setTenants] = useState([])

  useEffect(() => {
    if (!tenants.length || !selectedTenantId || selectedTenantId === 'all') return
    if (!tenants.some(t => t.id === selectedTenantId)) {
      setSelectedTenantId('all')
    }
  }, [tenants, selectedTenantId])

  const reload = useCallback(async () => {
    setLoading(true); setError(null)
    let loadElevenLabsMetrics = true
    if (process.env.NEXT_PUBLIC_FCC_EDITION === 'openocti') {
      loadElevenLabsMetrics = false
      try {
        const capabilitiesResponse = await fetch('/api/platform-admin/v1/capabilities', { cache: 'no-store' })
        const capabilities = await capabilitiesResponse.json()
        loadElevenLabsMetrics = capabilities.capabilities?.some(
          capability => capability.id === 'elevenlabs' && capability.status === 'configured'
        ) === true
      } catch {}
    }
    try {
      const r = await fetch('/api/openclaw/agents', { cache: 'no-store' })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || 'Load failed')
      setData(j)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
    // Refresh the sync-status table — independent of the OpenClaw load
    if (loadElevenLabsMetrics) {
      try {
        const sr = await fetch('/api/elevenlabs/agent-sync', { cache: 'no-store' })
        const sj = await sr.json()
        if (sj.ok) {
          const map = {}
          for (const a of (sj.agents || [])) map[a.id] = a
          setElSyncStatus(map)
        }
      } catch {}
    } else {
      setElSyncStatus({})
    }
    try {
      const pr = await fetch('/api/notes?action=promptSync', { cache: 'no-store' })
      const pj = await pr.json()
      if (pj.ok) {
        const map = {}
        for (const row of (pj.rows || [])) map[row.agentId] = row
        setPromptSyncStatus(map)
      }
    } catch {}
    // Tenants — used by the dropdown and to determine each agent's home
    try {
      const tr = await fetch('/api/tenants', { cache: 'no-store' })
      const tj = await tr.json()
      if (tj.ok) setTenants(tj.tenants || [])
    } catch {}
    // Usage — real ElevenLabs counts/minutes per agent. Slightly slow on first call.
    if (loadElevenLabsMetrics) {
      try {
        const ur = await fetch('/api/elevenlabs/agent-usage', { cache: 'no-store' })
        const uj = await ur.json()
        if (uj.ok) {
          const map = {}
          for (const a of (uj.agents || [])) map[a.id] = a
          setUsage(map)
        }
      } catch {}
      // Handoff latency — voice agent switch timing from the transfer log.
      try {
        const hr = await fetch('/api/elevenlabs/handoff-latency', { cache: 'no-store' })
        const hj = await hr.json()
        if (hj.ok) setHandoff(hj)
      } catch {}
    } else {
      setUsage({})
      setHandoff(null)
    }
  }, [])

  useEffect(() => { reload() }, [reload])

  const flash = (msg, kind = 'ok') => {
    setToast({ msg, kind })
    setTimeout(() => setToast(null), 4000)
  }

  const filtered = useMemo(() => {
    if (!data?.agents) return []
    return data.agents.filter(a => {
      const t = a.tenantId || 'farrington-development'
      const runtime = a.runtimeProvider || 'openclaw-hetzner'
      if (selectedTenantId && selectedTenantId !== 'all' && t !== selectedTenantId) return false
      if (filterCat !== 'all' && a.category !== filterCat) return false
      if (filterStatus === 'active' && !a.enabled) return false
      if (filterStatus === 'draft' && !a.draft) return false
      if (filterStatus === 'disabled' && a.enabled) return false
      if (filterRuntime !== 'all' && runtime !== filterRuntime) return false
      const q = query.trim().toLowerCase()
      if (q) {
        const haystack = [
          a.name, a.title, a.role, a.description, a.category, a.id,
          runtime,
          ...(a.tags || []),
          ...(a.channels || []),
        ].filter(Boolean).join(' ').toLowerCase()
        if (!haystack.includes(q)) return false
      }
      return true
    })
  }, [data, filterCat, filterStatus, filterRuntime, selectedTenantId, query])
  const { page, setPage, pageSize, setPageSize, paginated } = usePagination(filtered, 25)
  useEffect(() => {
    setPage(1)
    setSelectedAgents(new Set())
  }, [filterCat, filterStatus, filterRuntime, selectedTenantId, query, viewMode, pageSize, setPage])

  const startEdit = (agent, tab = null) => {
    setTalking(null)
    setSelected(agent.id)
    setEditing(JSON.parse(JSON.stringify(agent)))
    setActiveTab(tab || 'identity')
  }
  const startLabEdit = (agent) => {
    const labAgent = asLabAgent(agent)
    setTalking(null)
    setSelected(labAgent.id)
    setEditing(JSON.parse(JSON.stringify(labAgent)))
    setActiveTab('labs')
  }
  const startTalk = (agent) => {
    setEditing(null)
    setSelected(agent.id)
    setTalking(agent)
  }
  const stopTalk = () => { setTalking(null); setSelected(null) }

  const startNew = () => {
    const id = `agent-${Date.now().toString(36)}`
    const blank = {
      id,
      name: labMode ? 'New Lab Agent' : 'New Agent',
      emoji: '🤖',
      category: 'custom',
      role: labMode ? 'Experimental agent configuration for model, voice, media, workflow, and automation testing' : '',
      description: labMode ? 'Use this lab record to test the configuration before cloning, leasing, or making it customer-facing.' : '',
      enabled: true,
      draft: true,
      brain: { key: labMode ? 'premium' : 'standard', modelId: labMode ? 'openai/gpt-realtime' : '', fallbacks: [] },
      tools: [],
      channels: [],
      voice: labMode ? { provider: 'openai', openaiModel: 'gpt-realtime', openaiVoice: 'marin', demoMode: true } : { provider: 'elevenlabs' },
      labs: { ...DEFAULT_LABS },
      jobDescription: '',
      schedule: { mode: 'on-demand' },
      isPreset: false,
      _new: true,
    }
    setSelected(id)
    setEditing(blank)
    setActiveTab(labMode ? 'labs' : 'identity')
  }

  const cancelEdit = () => { setEditing(null); setSelected(null) }

  // Unified save — agents.json is the source of truth. Saving pushes to both
  // downstream deployment targets (OpenClaw runtime + ElevenLabs voice agent) so
  // drift is impossible. One button. Two systems updated atomically.
  const save = async ({ asDraft = false } = {}) => {
    if (!editing) return
    setBusy(true)
    try {
      const payload = {
        name: editing.name,
        title: editing.title,
        voiceProfile: editing.voiceProfile,
        avatarPrompt: editing.avatarPrompt,
        emoji: editing.emoji,
        category: editing.category,
        role: editing.role,
        description: editing.description,
        tags: editing.tags || [],
        channels: editing.channels || [],
        voice: editing.voice || { provider: 'elevenlabs' },
        labs: editing.labs || {},
        imageGeneration: normalizeImageGenerationPreference(editing.imageGeneration || {}),
        runtimeProvider: editing.runtimeProvider || 'openclaw-hetzner',
        schedule: editing.schedule || { mode: 'on-demand' },
        brainKey: editing.brain?.key !== 'custom' ? editing.brain?.key : undefined,
        modelPrimary: editing.brain?.key === 'custom' ? editing.brain?.modelId : undefined,
        modelFallbacks: editing.brain?.fallbacks,
        tools: editing.tools || [],
        jobDescription: editing.jobDescription || '',
        enabled: editing.enabled !== false,
        identity: { name: editing.name, emoji: editing.emoji },
        draft: asDraft,
      }
      const r = await fetch('/api/openclaw/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save', id: editing.id, payload, reason: editing._new ? 'agent-create' : 'agent-edit' }),
      })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || 'Save failed')

      // If this isn't a draft AND the agent has an ElevenLabs binding, push to ElevenLabs too.
      // Don't fail the whole save if the voice push fails — surface it in the toast instead.
      let voiceSyncResult = null
      let voiceSyncError = null
      if (!asDraft && elSyncStatus[editing.id]?.hasBinding) {
        try {
          const er = await fetch('/api/elevenlabs/agent-sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ agentId: editing.id }),
          })
          const ej = await er.json()
          if (!ej.ok) voiceSyncError = ej.error || 'voice push failed'
          else voiceSyncResult = ej
        } catch (e) {
          voiceSyncError = e.message
        }
      }

      if (asDraft) {
        flash('Saved as draft (not pushed live)')
      } else if (voiceSyncError) {
        flash(`Saved to OpenClaw — but voice push failed: ${voiceSyncError}`, 'err')
      } else if (voiceSyncResult) {
        flash(`Saved — pushed to OpenClaw + ElevenLabs (voice ${voiceSyncResult.voiceId?.slice(0,8) || 'updated'})`)
      } else {
        flash(`Saved to OpenClaw (no voice binding to update)`)
      }

      if (labMode) {
        const keepEditing = JSON.parse(JSON.stringify({ ...editing, _new: false, draft: asDraft }))
        await reload()
        setSelected(keepEditing.id)
        setEditing(keepEditing)
        setActiveTab('labs')
      } else {
        cancelEdit()
        await reload()
      }
      return true
    } catch (e) {
      flash(`Save failed: ${e.message}`, 'err')
      return false
    }
    finally { setBusy(false) }
  }

  const remove = async () => {
    if (!editing) return
    if (editing.id === 'main') return flash('Cannot delete the main agent', 'err')
    if (!confirm(`Delete agent "${editing.name}"? This will be backed up first.`)) return
    setBusy(true)
    try {
      const r = await fetch('/api/openclaw/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', id: editing.id }),
      })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || 'Delete failed')
      flash(`Deleted — backup ${j.backup?.split('/').pop() || 'created'}`)
      cancelEdit()
      await reload()
    } catch (e) { flash(`Delete failed: ${e.message}`, 'err') }
    finally { setBusy(false) }
  }

  const batchDeleteAgents = async () => {
    const ids = [...selectedAgents].filter(id => id !== 'main')
    if (!ids.length) return flash('Main agent cannot be bulk deleted', 'err')
    if (!confirm(`Delete ${ids.length} selected agent${ids.length === 1 ? '' : 's'}? Backups will be created by the agent service.`)) return
    setBusy(true)
    try {
      for (const id of ids) {
        const r = await fetch('/api/openclaw/agents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'delete', id }),
        })
        const j = await r.json()
        if (!j.ok) throw new Error(j.error || `Delete failed for ${id}`)
      }
      setSelectedAgents(new Set())
      flash(`Deleted ${ids.length} agent${ids.length === 1 ? '' : 's'} with backups`)
      await reload()
    } catch (e) {
      flash(`Batch delete failed: ${e.message}`, 'err')
    } finally {
      setBusy(false)
    }
  }

  const clone = async (sourceAgent = editing) => {
    if (!sourceAgent) return
    const newId = prompt('New agent id (lowercase, no spaces):', `${sourceAgent.id}-copy`)
    if (!newId) return
    const newName = prompt('Display name for the clone:', `${sourceAgent.name} (clone)`) || `${sourceAgent.name} (clone)`
    setBusy(true)
    try {
      const r = await fetch('/api/openclaw/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clone', sourceId: sourceAgent.id, newId, name: newName }),
      })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || 'Clone failed')
      // Surface voice-clone status — was a parallel ElevenLabs agent created?
      if (j.voiceClone?.elevenAgentId) {
        flash(`Cloned to ${newId} — and provisioned ElevenLabs voice (${j.voiceClone.elevenAgentId.slice(0, 22)}…). Ready to lease.`)
      } else if (j.voiceCloneError) {
        flash(`Cloned to ${newId} — but voice clone failed: ${j.voiceCloneError}`, 'err')
      } else {
        flash(`Cloned to ${newId} (no voice — source had no ElevenLabs binding)`)
      }
      if (editing?.id === sourceAgent.id) cancelEdit()
      await reload()
    } catch (e) { flash(`Clone failed: ${e.message}`, 'err') }
    finally { setBusy(false) }
  }

  // ElevenLabs sync — dry-run-first flow. Click button → fetch current vs proposed,
  // show modal. Modal has Confirm button which actually pushes.
  const [elSyncPreview, setElSyncPreview] = useState(null) // { agentId, current, proposed, diffs, busy?, error? }
  const startElSync = async (agentId) => {
    setElSyncPreview({ agentId, loading: true })
    try {
      const r = await fetch('/api/elevenlabs/agent-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, dryRun: true }),
      })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || 'Preview failed')
      setElSyncPreview({ ...j, loading: false })
    } catch (e) {
      setElSyncPreview({ agentId, loading: false, error: e.message })
    }
  }
  const confirmElSync = async () => {
    if (!elSyncPreview?.agentId) return
    setElSyncPreview(prev => ({ ...prev, pushing: true }))
    try {
      const r = await fetch('/api/elevenlabs/agent-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: elSyncPreview.agentId }),
      })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || 'Push failed')
      flash(`Synced to ElevenLabs — voice + prompt now live for ${elSyncPreview.agentId}`)
      setElSyncPreview(null)
      await reload()
    } catch (e) {
      setElSyncPreview(prev => ({ ...prev, pushing: false, error: e.message }))
    }
  }

  const enablePreset = async (presetId) => {
    setBusy(true)
    try {
      const r = await fetch('/api/openclaw/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'enable_preset', presetId }),
      })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || 'Enable failed')
      flash(`Enabled preset: ${presetId}`)
      await reload()
    } catch (e) { flash(`Enable failed: ${e.message}`, 'err') }
    finally { setBusy(false) }
  }

  // Accounts list — needed by the lease form to pick a client
  const [accounts, setAccounts] = useState([])
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/accounts', { cache: 'no-store' })
        const j = await r.json()
        const list = j.accounts || j || []
        setAccounts(Array.isArray(list) ? list : [])
      } catch {}
    })()
  }, [])

  const leaseAgent = async ({ agentId, clientAccountId, tierId, tierName, monthlyFee, startDate, notes, addons }) => {
    setBusy(true)
    try {
      const r = await fetch('/api/leases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, clientAccountId, tierId, tierName, monthlyFee, startDate, notes, addons }),
      })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || 'Lease failed')
      flash(`Leased ${agentId} to ${j.lease.tenantName} for $${j.lease.monthlyFee}/mo`)
      await reload()
      // Switch the dropdown to the new tenant so the user sees the result
      setSelectedTenantId(j.tenantId)
      cancelEdit()
    } catch (e) {
      flash(`Lease failed: ${e.message}`, 'err')
    } finally { setBusy(false) }
  }

  const cancelLease = async (leaseId) => {
    setBusy(true)
    try {
      const r = await fetch(`/api/leases?id=${encodeURIComponent(leaseId)}`, { method: 'DELETE' })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || 'Cancel failed')
      flash('Lease cancelled — agent returned to in-house')
      await reload()
      setSelectedTenantId('farrington-development')
      cancelEdit()
    } catch (e) {
      flash(`Cancel failed: ${e.message}`, 'err')
    } finally { setBusy(false) }
  }

  const showAgentLoading = loading && !data
  const labAgents = useMemo(() => {
    const agents = data?.agents || []
    return agents.map(asLabAgent)
  }, [data?.agents])

  useEffect(() => {
    if (!labMode || editing || loading) return
    const first = labAgents[0]
    if (first) startLabEdit(first)
  }, [labMode, editing, loading, labAgents])

  if (showAgentLoading) {
    return (
      <Shell>
        <Header ping={null} onAdd={startNew} labMode={labMode} presets={[]} onEnablePreset={() => {}} onRefresh={reload} busy unknownKeys={0} />
        <Spinner label="Loading agents from OpenClaw..." />
      </Shell>
    )
  }
  if (error && !data) {
    return (
      <Shell>
        <Header ping={null} onAdd={startNew} labMode={labMode} presets={[]} onEnablePreset={() => {}} onRefresh={reload} busy={busy} unknownKeys={0} />
        <ConnectError msg={error} onRetry={reload} />
      </Shell>
    )
  }

  // A preset is "available" only if there's no agent with that id ANYWHERE — not in OpenClaw remote
  // and not in the local CRM cache. Previously only checked remote, which led to the same preset
  // re-appearing if a local-only enable didn't fully sync to OpenClaw.
  const presetsAvailable = (data?.presets || []).filter(p => {
    const inRemote = (data.agents || []).some(a => a.id === p.id)
    const inLocal = (data.localAgentIds || []).includes(p.id)
    return !inRemote && !inLocal
  })

  return (
    <Shell>
      <Header
        ping={data?.ping}
        onAdd={startNew}
        labMode={labMode}
        presets={presetsAvailable}
        onEnablePreset={enablePreset}
        onRefresh={reload}
        busy={busy}
        unknownKeys={data?.schemaUnknownKeys?.length || 0}
        viewMode={viewMode}
        setViewMode={setViewMode}
        tenants={tenants}
        selectedTenantId={selectedTenantId}
        onTenantChange={setSelectedTenantId}
      />

      <Toast toast={toast} />

      {labMode ? (
        <>
          <LabWorkbench
            agents={labAgents}
            selected={selected}
            editing={editing}
            setEditing={setEditing}
            categories={data?.categories || []}
            onSelect={startLabEdit}
            onNew={startNew}
            onTalk={startTalk}
            onSave={() => save()}
            onSaveDraft={() => save({ asDraft: true })}
            onCancel={cancelEdit}
            busy={busy}
            elSyncStatus={editing ? (elSyncStatus[editing.id] || null) : null}
          />

          {talking && (
            <EditAgentModal agentName={talking.name} eyebrow="Agent chat" onClose={stopTalk}>
              <TalkPanel agent={talking} categories={data?.categories || []} onClose={stopTalk} />
            </EditAgentModal>
          )}

          {elSyncPreview && (
            <ElSyncModal
              preview={elSyncPreview}
              onClose={() => setElSyncPreview(null)}
              onConfirm={confirmElSync}
            />
          )}
        </>
      ) : (
        <>

          <Filters
            categories={data?.categories || []}
            agents={data?.agents || []}
            filterCat={filterCat} setFilterCat={setFilterCat}
            filterStatus={filterStatus} setFilterStatus={setFilterStatus}
            filterRuntime={filterRuntime} setFilterRuntime={setFilterRuntime}
            query={query} setQuery={setQuery}
            viewMode={viewMode} setViewMode={setViewMode}
            filteredCount={filtered.length}
            onAdd={startNew}
            tenants={tenants}
            selectedTenantId={selectedTenantId}
            setSelectedTenantId={setSelectedTenantId}
            paginated={paginated}
            selectedCount={selectedAgents.size}
            onSelectPage={() => setSelectedAgents(new Set(paginated.map(a => a.id)))}
            onClearSelection={() => setSelectedAgents(new Set())}
            onBatchDelete={batchDeleteAgents}
            busy={busy}
          />

          <HandoffLatencyPanel data={handoff} />
          <OrcaHandoffPanel agents={data?.agents || []} />

          <div style={viewMode === 'list'
            ? { display: 'flex', flexDirection: 'column', gap: 10 }
            : { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
            {paginated.map(a => (
              <AgentCard
                key={a.id}
                agent={a}
                categories={data.categories}
                selected={selected === a.id}
                checked={selectedAgents.has(a.id)}
                onCheck={() => setSelectedAgents(s => { const n = new Set(s); n.has(a.id) ? n.delete(a.id) : n.add(a.id); return n })}
                compact={viewMode === 'list'}
                onEdit={() => startEdit(a)}
                onClone={() => clone(a)}
                onTalk={() => startTalk(a)}
                elSyncStatus={elSyncStatus[a.id] || null}
                onElSync={() => startElSync(a.id)}
                usage={usage[a.id] || null}
              />
            ))}
            {!filtered.length && (
              <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)', border: '1px dashed var(--border)', borderRadius: 12, gridColumn: '1 / -1' }}>
                No agents match this filter.
              </div>
            )}
          </div>
          {filtered.length > 0 && (
            <Paginator total={filtered.length} page={page} pageSize={pageSize} onPage={setPage} onPageSize={setPageSize} label="agents" />
          )}

          {talking && (
            <EditAgentModal agentName={talking.name} eyebrow="Agent chat" onClose={stopTalk}>
              <TalkPanel agent={talking} categories={data?.categories || []} onClose={stopTalk} />
            </EditAgentModal>
          )}

          {editing && (
            <EditAgentModal agentName={editing.name} onClose={cancelEdit}>
              <div>
                <DetailPanel
                  editing={editing}
                  setEditing={setEditing}
                  activeTab={activeTab}
                  setActiveTab={setActiveTab}
                  categories={data?.categories || []}
                  brains={data?.brains || {}}
                  modelCatalog={data?.modelCatalog || []}
                  modelProviders={data?.modelProviders || {}}
                  modelTiers={data?.modelTiers || {}}
                  channelOptions={data?.channelOptions || CHANNEL_OPTIONS}
                  channelStatus={data?.channelStatus || {}}
                  onSave={() => save()}
                  onSaveDraft={() => save({ asDraft: true })}
                  onCancel={cancelEdit}
                  onClone={clone}
                  onDelete={remove}
                  busy={busy}
                  elSyncStatus={elSyncStatus[editing.id] || null}
                  promptSyncStatus={promptSyncStatus[editing.id] || null}
                  onElSync={() => startElSync(editing.id)}
                  usage={usage[editing.id] || null}
                  tenants={tenants}
                  accounts={accounts}
                  onLease={leaseAgent}
                  onCancelLease={cancelLease}
                />
              </div>
            </EditAgentModal>
          )}

          {elSyncPreview && (
            <ElSyncModal
              preview={elSyncPreview}
              onClose={() => setElSyncPreview(null)}
              onConfirm={confirmElSync}
            />
          )}
        </>
      )}
    </Shell>
  )
}

function LabWorkbench({ agents, selected, editing, setEditing, categories, onSelect, onNew, onTalk, onSave, onSaveDraft, onCancel, busy, elSyncStatus }) {
  const [voiceGuardOpen, setVoiceGuardOpen] = useState(false)
  const [voiceRuns, setVoiceRuns] = useState([])
  const savedAgent = useMemo(() => agents.find(a => a.id === editing?.id) || null, [agents, editing?.id])
  const hasUnsavedChanges = !!editing && labSnapshot(asLabAgent(editing)) !== labSnapshot(savedAgent)
  const runtimeProvider = editing?.runtimeProvider || 'openclaw-hetzner'
  const isLocalOnlyRuntime = runtimeProvider !== 'openclaw-hetzner'
  const runtimeLabel = runtimeLabelFor(runtimeProvider)
  const latestVoiceRun = useMemo(() => {
    if (!editing?.id) return voiceRuns[0] || null
    return voiceRuns.find(run => run.agentId === editing.id) || voiceRuns[0] || null
  }, [editing?.id, voiceRuns])
  useEffect(() => {
    const readRuns = () => {
      try {
        const runs = JSON.parse(localStorage.getItem(VOICE_LAB_RESULTS_KEY) || '[]')
        if (Array.isArray(runs)) setVoiceRuns(runs)
      } catch {}
    }
    readRuns()
    const onRun = (event) => {
      const run = event.detail
      if (!run?.runId) return readRuns()
      setVoiceRuns(current => [run, ...current.filter(item => item.runId !== run.runId)].slice(0, 16))
    }
    window.addEventListener('fcc:voice-lab-test', onRun)
    window.addEventListener('storage', readRuns)
    return () => {
      window.removeEventListener('fcc:voice-lab-test', onRun)
      window.removeEventListener('storage', readRuns)
    }
  }, [])
  const dispatchVoiceTest = () => {
    if (typeof window === 'undefined' || !editing?.id) return
    window.dispatchEvent(new CustomEvent('fcc:start-voice-agent', {
      detail: { agentId: editing.id, name: editing.name },
    }))
  }
  const openTranscription = () => {
    if (typeof window === 'undefined') return
    window.dispatchEvent(new CustomEvent('fcc:navigate', {
      detail: { tab: 'meeting-capture' },
    }))
  }
  const startVoiceTest = () => {
    if (hasUnsavedChanges) {
      setVoiceGuardOpen(true)
      return
    }
    dispatchVoiceTest()
  }
  const saveThenVoice = async () => {
    setVoiceGuardOpen(false)
    const ok = await onSaveDraft?.()
    if (ok) setTimeout(dispatchVoiceTest, 500)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
      <aside style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface, #fff)', padding: 14, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800 }}>Lab Agents</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{agents.length} experiment-ready</div>
          </div>
          <button onClick={onNew} disabled={busy} title="Create a new experiment agent" style={{ ...btnStyle('primary'), width: 40, minWidth: 40, height: 40, padding: 0, borderRadius: 8 }}>+</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
          {agents.map(agent => {
            const cat = categories.find(c => c.id === agent.category)
            const active = selected === agent.id
            return (
              <button
                key={agent.id}
                onClick={() => onSelect(agent)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  width: '100%',
                  textAlign: 'left',
                  padding: 10,
                  borderRadius: 10,
                  border: '1px solid ' + (active ? (cat?.accent || 'var(--accent, #3b82f6)') : 'var(--border)'),
                  background: active ? 'var(--accent-soft, #dbeafe)' : 'var(--surface2, #f8fafc)',
                  color: 'var(--text)',
                  cursor: 'pointer',
                  minHeight: 64,
                  minWidth: 0,
                }}
              >
                <Avatar agent={agent} size={42} accent={cat?.accent} accentText={cat?.text} />
                <span style={{ minWidth: 0, flex: 1 }}>
                  <span style={{ display: 'block', fontSize: 13.5, fontWeight: 750, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{agent.name}</span>
                  <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {voiceProviderLabel(agent.voice?.provider)} · {agent.labs?.routingStrategy || 'balanced'}
                  </span>
                </span>
              </button>
            )
          })}
          {!agents.length && (
            <div style={{ padding: 18, textAlign: 'center', color: 'var(--text-muted)', border: '1px dashed var(--border)', borderRadius: 10, fontSize: 13 }}>
              No lab agents yet.
            </div>
          )}
        </div>
      </aside>

      <main style={{ minWidth: 0, width: '100%' }}>
        {!editing ? (
          <div style={{ padding: 32, border: '1px dashed var(--border)', borderRadius: 12, background: 'var(--surface, #fff)', textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Create your first lab agent</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 14, marginBottom: 16 }}>This page is for model, voice, media, workflow, automation, and embed experiments before an agent becomes clonable or leasable.</div>
            <button onClick={onNew} disabled={busy} style={btnStyle('primary')}>+ New Lab Agent</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ padding: 18, border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface, #fff)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 260, flex: 1 }}>
                  <Avatar agent={editing} size={58} accent={categories.find(c => c.id === editing.category)?.accent} accentText={categories.find(c => c.id === editing.category)?.text} />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <input
                      style={{ ...inputStyle, fontSize: 20, fontWeight: 800, minHeight: 46, marginBottom: 8 }}
                      value={editing.name || ''}
                      onChange={e => setEditing({ ...editing, name: e.target.value })}
                      placeholder="Lab agent name"
                    />
                    <input
                      style={{ ...inputStyle, minHeight: 40 }}
                      value={editing.role || ''}
                      onChange={e => setEditing({ ...editing, role: e.target.value })}
                      placeholder="Demo role or buyer-facing job"
                    />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(120px, 1fr))', gap: 8, minWidth: 260 }}>
                  <button onClick={startVoiceTest} disabled={busy} title="Start a live voice test" style={btnStyle('primary')}>Voice</button>
                  <button onClick={() => onTalk?.(editing)} disabled={busy} style={btnStyle('secondary')}>Chat</button>
                  <button onClick={openTranscription} disabled={busy} title="Open Maggie transcription capture" style={btnStyle('secondary')}>Transcribe</button>
                  {!isLocalOnlyRuntime && <button onClick={onSaveDraft} disabled={busy} title="Save as draft" style={btnStyle('ghost')}>Draft</button>}
                  <button onClick={onSave} disabled={busy} title={isLocalOnlyRuntime ? `Save this ${runtimeLabel} profile locally without syncing to OpenClaw` : 'Save lab configuration'} style={btnStyle('primary')}>{busy ? 'Saving...' : (isLocalOnlyRuntime ? `Save ${runtimeLabel} Profile` : 'Save')}</button>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                <span style={badge(['openai', 'gemini', 'chirp3'].includes(editing.voice?.provider) ? 'blue' : 'grey')}>{voiceProviderLabel(editing.voice?.provider)}</span>
                <span style={badge('grey')}>Model: {voiceModelLabel(editing.voice, editing.brain?.modelId || 'not set')}</span>
                <span style={badge('grey')}>Voice: {voiceNameLabel(editing.voice, editing.voiceProfile || 'ElevenLabs')}</span>
              </div>
            </div>

            <VoiceRunPanel run={latestVoiceRun} />

            <div style={{ padding: 18, border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface, #fff)' }}>
              <LabsTab editing={editing} setEditing={setEditing} elSyncStatus={elSyncStatus} onStartVoiceTest={startVoiceTest} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={onCancel} disabled={busy} style={btnStyle('ghost')}>Close</button>
              {!isLocalOnlyRuntime && <button onClick={onSaveDraft} disabled={busy} title="Save as draft" style={btnStyle('secondary')}>Draft</button>}
              <button onClick={onSave} disabled={busy} title={isLocalOnlyRuntime ? `Save this ${runtimeLabel} profile locally without syncing to OpenClaw` : 'Save lab configuration'} style={btnStyle('primary')}>{busy ? 'Saving...' : (isLocalOnlyRuntime ? `Save ${runtimeLabel} Profile` : 'Save')}</button>
            </div>
          </div>
        )}
      </main>
      {voiceGuardOpen && (
        <VoiceSaveGuard
          agentName={editing?.name}
          provider={editing?.voice?.provider}
          busy={busy}
          onSave={saveThenVoice}
          onClose={() => setVoiceGuardOpen(false)}
        />
      )}
    </div>
  )
}

function VoiceRunPanel({ run }) {
  if (!run) {
    return (
      <div style={{ padding: 14, border: '1px dashed var(--border)', borderRadius: 10, background: 'var(--surface2, #f8fafc)', color: 'var(--text-muted)', fontSize: 13 }}>
        No voice lab result yet. Start a live voice test and the provider, model, voice, transcript, and handoff will appear here.
      </div>
    )
  }
  const messages = Array.isArray(run.messages) ? run.messages.slice(-4) : []
  const events = Array.isArray(run.events) ? run.events.slice(-5) : []
  const statusColor = run.status === 'error' ? 'var(--red)' : run.status === 'ended' ? 'var(--text-muted)' : 'var(--green)'
  return (
    <section style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface, #fff)', overflow: 'hidden' }}>
      <div style={{ padding: 14, borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 850, color: 'var(--text)' }}>Last voice test</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
            {run.agentName || run.agentId || 'Agent'} · {run.provider || 'provider pending'}
          </div>
        </div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 28, padding: '4px 9px', borderRadius: 999, border: '1px solid var(--border)', color: statusColor, background: 'var(--surface2)', fontSize: 12, fontWeight: 800 }}>
          <span style={{ width: 7, height: 7, borderRadius: 999, background: statusColor, boxShadow: run.status === 'running' || run.status === 'connected' ? `0 0 10px ${statusColor}` : 'none' }} />
          {run.status || 'recorded'}
        </span>
      </div>
      <div style={{ padding: 14, display: 'grid', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
          <VoiceRunMetric label="Model" value={run.model || 'Not reported'} />
          <VoiceRunMetric label="Voice" value={run.voiceName || 'Not reported'} />
          <VoiceRunMetric label="Started" value={run.startedAt ? new Date(run.startedAt).toLocaleTimeString() : 'Unknown'} />
          <VoiceRunMetric label="Handoff" value={run.handoff?.tab ? `${run.handoff.tab}${run.handoff.subtab ? ` / ${run.handoff.subtab}` : ''}` : 'No handoff'} />
        </div>
        {run.error && <div style={{ padding: 10, borderRadius: 8, background: 'var(--red-soft)', color: 'var(--red)', fontSize: 12.5 }}>{run.error}</div>}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div style={voiceRunLabelStyle}>Transcript</div>
            <div style={{ display: 'grid', gap: 7 }}>
              {messages.length ? messages.map((message, index) => (
                <div key={`${message.at}-${index}`} style={{ padding: 9, borderRadius: 8, background: message.role === 'user' ? 'var(--accent-soft)' : 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 12.5, lineHeight: 1.45 }}>
                  <strong>{message.role === 'user' ? 'You' : 'Agent'}:</strong> {message.text}
                </div>
              )) : <div style={{ color: 'var(--text-muted)', fontSize: 12.5 }}>No transcript captured yet.</div>}
            </div>
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={voiceRunLabelStyle}>Events</div>
            <div style={{ display: 'grid', gap: 6 }}>
              {events.map((event, index) => (
                <div key={`${event.at}-${index}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11.5, color: 'var(--text-muted)' }}>
                  <span style={{ color: 'var(--text)', fontWeight: 750 }}>{event.stage}</span>
                  <span>{event.at ? new Date(event.at).toLocaleTimeString() : ''}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function VoiceRunMetric({ label, value }) {
  return (
    <div style={{ padding: 10, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', minWidth: 0 }}>
      <div style={voiceRunLabelStyle}>{label}</div>
      <div style={{ color: 'var(--text)', fontSize: 12.5, fontWeight: 750, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{value}</div>
    </div>
  )
}

const voiceRunLabelStyle = { fontSize: 10.5, fontWeight: 850, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4 }

function VoiceSaveGuard({ agentName, provider, busy, onSave, onClose }) {
  const providerName = voiceProviderLabel(provider)
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 220, background: 'rgba(15, 23, 42, 0.48)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    }}>
      <div style={{
        width: 'min(440px, 100%)', background: 'var(--surface, #fff)', color: 'var(--text)',
        border: '1px solid var(--border)', borderRadius: 12, padding: 20,
        boxShadow: '0 24px 70px rgba(15, 23, 42, 0.28)',
      }}>
        <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 8 }}>Save before testing</div>
        <div style={{ fontSize: 14, lineHeight: 1.5, color: 'var(--text-muted)', marginBottom: 16 }}>
          {agentName || 'This agent'} has unsaved lab changes. Voice tests use the saved roster, so save the {providerName} setting first, then the test will start with that provider.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <button onClick={onClose} disabled={busy} style={btnStyle('ghost')}>Cancel</button>
          <button onClick={onSave} disabled={busy} style={btnStyle('primary')}>{busy ? 'Saving...' : 'Save'}</button>
        </div>
      </div>
    </div>
  )
}

function ElSyncModal({ preview, onClose, onConfirm }) {
  const { loading, error, pushing, current, proposed, diffs, agentId, elevenLabsAgentId } = preview
  const anyDiff = diffs && (diffs.firstMessage || diffs.prompt || diffs.voice)
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 200,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }} onClick={pushing ? undefined : onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--surface, #fff)', borderRadius: 16, padding: 24, maxWidth: 880, width: '100%',
        maxHeight: '88vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        border: '2px solid var(--accent, #3b82f6)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>Sync to ElevenLabs</h2>
          <button onClick={onClose} disabled={pushing} style={btnStyle('ghost')}>✕</button>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
          Pushes the CRM persona (job description, voice, greeting) to the ConvAI agent record.
          {elevenLabsAgentId && <> • ElevenLabs id: <code style={{ fontSize: 12 }}>{elevenLabsAgentId}</code></>}
        </div>

        {loading && <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>Reading current ElevenLabs config…</div>}
        {error && (
          <div style={{ padding: 16, borderRadius: 10, background: '#fef2f2', border: '1px solid #ef4444', color: '#7f1d1d', marginBottom: 12 }}>
            {error}
          </div>
        )}

        {!loading && !error && diffs && (
          <>
            {!anyDiff && (
              <div style={{ padding: 14, borderRadius: 10, background: '#dcfce7', border: '1px solid #10b981', color: '#064e3b', marginBottom: 16, fontSize: 14 }}>
                Already in sync — no changes to push.
              </div>
            )}
            <DiffRow label="First message" changed={diffs.firstMessage} cur={current.firstMessage} prop={proposed.firstMessage} />
            <DiffRow label="Voice id" changed={diffs.voice} cur={current.voiceId} prop={proposed.voiceId} />
            <DiffRow label="System prompt" changed={diffs.prompt} cur={current.prompt} prop={proposed.prompt} multiline />
          </>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          <button onClick={onClose} disabled={pushing} style={btnStyle('ghost')}>Cancel</button>
          <button
            onClick={onConfirm}
            disabled={loading || pushing || error || !anyDiff}
            style={btnStyle('primary')}
          >{pushing ? 'Pushing…' : 'Confirm & push to ElevenLabs'}</button>
        </div>
      </div>
    </div>
  )
}

function DiffRow({ label, changed, cur, prop, multiline }) {
  const [expanded, setExpanded] = useState(!multiline)
  const cellStyle = {
    padding: 12, borderRadius: 8, fontSize: 13, lineHeight: 1.5,
    whiteSpace: multiline ? 'pre-wrap' : 'normal',
    fontFamily: multiline ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : 'inherit',
    maxHeight: expanded ? 360 : 80, overflow: 'auto',
    border: '1px solid var(--border)',
  }
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>
          {label} {changed
            ? <span style={{ marginLeft: 8, padding: '2px 8px', borderRadius: 6, background: '#fef3c7', color: '#92400e', fontSize: 11, fontWeight: 600 }}>WILL CHANGE</span>
            : <span style={{ marginLeft: 8, padding: '2px 8px', borderRadius: 6, background: '#dcfce7', color: '#064e3b', fontSize: 11, fontWeight: 600 }}>same</span>}
        </div>
        {multiline && (
          <button onClick={() => setExpanded(e => !e)} style={{ ...btnStyle('ghost'), padding: '4px 10px', minHeight: 28, fontSize: 12 }}>
            {expanded ? 'Collapse' : 'Expand'}
          </button>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Current (ElevenLabs)</div>
          <div style={{ ...cellStyle, background: changed ? '#fef2f2' : 'var(--surface2)', color: changed ? '#7f1d1d' : 'var(--text)' }}>{cur || <em style={{ color: 'var(--text-muted)' }}>(empty)</em>}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>Proposed (CRM)</div>
          <div style={{ ...cellStyle, background: changed ? '#dcfce7' : 'var(--surface2)', color: changed ? '#064e3b' : 'var(--text)' }}>{prop || <em style={{ color: 'var(--text-muted)' }}>(empty)</em>}</div>
        </div>
      </div>
    </div>
  )
}

function Shell({ children }) {
  return (
    <div className="command-workspace p-6" style={{ color: 'var(--text)' }}>
      {children}
    </div>
  )
}

function Spinner({ label }) {
  return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 16 }}>{label || 'Loading…'}</div>
}

function ConnectError({ msg, onRetry }) {
  return (
    <div style={{ padding: 24, border: '1px solid var(--red, #ef4444)', borderRadius: 12, background: 'var(--red-soft, #fef2f2)' }}>
      <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Can't reach OpenClaw</div>
      <div style={{ marginBottom: 12, color: 'var(--text-muted)', fontSize: 14 }}>{msg}</div>
      <button onClick={onRetry} style={btnStyle('primary')}>Retry</button>
    </div>
  )
}

function Header({ ping, onAdd, labMode, presets, onEnablePreset, onRefresh, busy, unknownKeys, viewMode, setViewMode }) {
  const ok = ping?.ok
  const [presetMenuOpen, setPresetMenuOpen] = useState(false)
  const openLabs = () => {
    if (typeof window === 'undefined') return
    window.dispatchEvent(new CustomEvent('fcc:set-tab', { detail: 'agent-labs' }))
  }
  const HeadingIcon = labMode ? FlaskConical : Bot
  const subtitle = labMode
    ? 'Model, voice, media, workflow, and automation testing.'
    : ok
      ? `Connected to OpenClaw (${ping.host})`
      : `Offline: ${ping?.error || 'unreachable'}`

  return (
    <PageHeader
      icon={<HeadingIcon size={20} />}
      title={labMode ? 'Agent Lab' : 'Agents'}
      subtitle={subtitle}
      actions={(
        <div style={{ display: 'flex', gap: 8, position: 'relative', flexWrap: 'wrap' }}>
          {!labMode && (
            <LabHeaderButton
              onClick={openLabs}
              disabled={busy}
              label="Open agent lab"
              style={{ opacity: busy ? 0.55 : 1 }}
            />
          )}
          <button type="button" onClick={onRefresh} disabled={busy} aria-label="Refresh agents" data-tooltip="Refresh agents" data-tooltip-side="bottom" style={{ ...iconBtnStyle, opacity: busy ? 0.55 : 1 }}>
            <RefreshCw size={16} />
          </button>
          <div style={{ position: 'relative' }}>
            <button type="button" onClick={() => setPresetMenuOpen(o => !o)} disabled={busy || !presets?.length} aria-label="Enable preset agent" data-tooltip={presets?.length ? `Enable preset (${presets.length})` : 'No presets available'} data-tooltip-side="bottom" style={{ ...iconBtnStyle, opacity: busy || !presets?.length ? 0.45 : 1 }}>
              <Bot size={16} />
            </button>
            {presetMenuOpen && presets?.length > 0 && (
              <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', background: 'var(--surface, #fff)', border: '1px solid var(--border)', borderRadius: 12, width: 'min(320px, calc(100vw - 32px))', padding: 8, zIndex: 50, boxShadow: 'var(--shadow-lg, 0 10px 30px rgba(0,0,0,0.15))' }}>
                {presets.map(p => (
                  <button key={p.id}
                          onClick={() => { setPresetMenuOpen(false); onEnablePreset(p.id) }}
                          style={{ display: 'block', width: '100%', textAlign: 'left', padding: '12px 14px', background: 'transparent', border: 'none', borderRadius: 8, cursor: 'pointer', minHeight: 56 }}
                          onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2, #f1f5f9)'}
                          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>{p.emoji} {p.name}</div>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>{p.role}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
          {labMode && (
            <button type="button" onClick={onAdd} disabled={busy} aria-label="New lab agent" data-tooltip="New lab agent" data-tooltip-side="bottom" style={{ ...iconBtnStyle, background: 'var(--accent)', color: 'var(--accent-text)', borderColor: 'var(--accent)', opacity: busy ? 0.55 : 1 }}>
              <Plus size={17} />
            </button>
          )}
        </div>
      )}
      viewToggle={setViewMode ? <ViewModeToggle value={viewMode} onChange={setViewMode} modes={['list', 'card']} /> : null}
    >
      {unknownKeys > 0 && (
        <span title="Some agents have fields the manager does not know about - they are preserved on save"
              style={{ display: 'inline-flex', padding: '2px 8px', borderRadius: 8, background: 'var(--amber-soft, #fef3c7)', color: '#92400e', fontSize: 12 }}>
          {unknownKeys} agent(s) with unrecognized fields (preserved)
        </span>
      )}
    </PageHeader>
  )
}

function Toast({ toast }) {
  if (!toast) return null
  const colors = toast.kind === 'err'
    ? { bg: '#fef2f2', border: '#ef4444', text: '#7f1d1d' }
    : { bg: '#dcfce7', border: '#10b981', text: '#064e3b' }
  return (
    <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 100, padding: '12px 20px', background: colors.bg, border: `2px solid ${colors.border}`, color: colors.text, borderRadius: 12, fontSize: 15, fontWeight: 500, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxWidth: 480 }}>
      {toast.msg}
    </div>
  )
}

function Filters({ categories, agents, filterCat, setFilterCat, filterStatus, setFilterStatus, filterRuntime, setFilterRuntime, query, setQuery, viewMode, setViewMode, filteredCount, onAdd, tenants = [], selectedTenantId, setSelectedTenantId, paginated = [], selectedCount = 0, onSelectPage, onClearSelection, onBatchDelete, busy }) {
  const counts = useMemo(() => {
    const c = { all: agents.length }
    for (const cat of categories) c[cat.id] = 0
    for (const a of agents) if (c[a.category] !== undefined) c[a.category]++
    return c
  }, [agents, categories])
  const runtimeCounts = useMemo(() => {
    const c = { all: agents.length }
    for (const r of RUNTIME_FILTERS) c[r.id] = 0
    for (const a of agents) {
      const runtime = a.runtimeProvider || 'openclaw-hetzner'
      c[runtime] = (c[runtime] || 0) + 1
    }
    return c
  }, [agents])
  const control = {
    minHeight: 40,
    border: '1px solid var(--border)',
    borderRadius: 8,
    background: 'var(--surface)',
    color: 'var(--text)',
    fontSize: 13,
    outline: 'none',
  }
  return (
    <div
      className="flex items-center justify-between flex-wrap gap-3 mb-4"
      style={{ padding: 12, border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface2)' }}
    >
      <div className="flex items-center gap-2 flex-wrap" style={{ flex: '1 1 520px', minWidth: 0 }}>
        <div className="relative" style={{ flex: '1 1 260px', minWidth: 220 }}>
          <Search size={15} style={{ position: 'absolute', left: 10, top: 12, color: 'var(--text-muted)' }} />
          <input
            aria-label="Search agents"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search agents, roles, channels, tags"
            style={{ ...control, width: '100%', padding: '8px 12px 8px 32px' }}
          />
        </div>
        <ThemedSelect
          aria-label="Filter by tenant"
          value={selectedTenantId || 'all'}
          onChange={e => setSelectedTenantId(e.target.value)}
          style={{ ...control, padding: '8px 10px', minWidth: 180 }}
        >
          <option value="all">All agents</option>
          {tenants.map(t => <option key={t.id} value={t.id}>{t.name} ({t.agentCount || 0})</option>)}
        </ThemedSelect>
        <ThemedSelect
          aria-label="Filter by category"
          value={filterCat}
          onChange={e => setFilterCat(e.target.value)}
          style={{ ...control, padding: '8px 10px', minWidth: 170 }}
        >
          <option value="all">All categories ({counts.all})</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.label} ({counts[c.id] || 0})</option>)}
        </ThemedSelect>
        <ThemedSelect
          aria-label="Filter by runtime"
          value={filterRuntime}
          onChange={e => setFilterRuntime(e.target.value)}
          style={{ ...control, padding: '8px 10px', minWidth: 155 }}
        >
          <option value="all">All runtimes ({runtimeCounts.all})</option>
          {RUNTIME_FILTERS.map(r => (
            <option key={r.id} value={r.id}>{r.label} ({runtimeCounts[r.id] || 0})</option>
          ))}
        </ThemedSelect>
        <ThemedSelect
          aria-label="Filter by status"
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          style={{ ...control, padding: '8px 10px', minWidth: 140 }}
        >
          <option value="all">Any status</option>
          <option value="active">Active</option>
          <option value="draft">Draft</option>
          <option value="disabled">Disabled</option>
        </ThemedSelect>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
          {filteredCount.toLocaleString()} shown
        </span>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <button type="button" onClick={onAdd} style={{ ...control, padding: '8px 12px', background: 'var(--accent)', color: 'var(--accent-text)', fontWeight: 700, cursor: 'pointer' }}>New Agent</button>
        <BulkActionsMenu
          selectedCount={selectedCount}
          totalCount={paginated.length}
          onSelectPage={onSelectPage}
          onClearSelection={onClearSelection}
          onDeleteSelected={onBatchDelete}
          disabled={busy}
        />
      </div>
    </div>
  )
}

function Pill({ active, onClick, accent, accentText, children }) {
  return (
    <button onClick={onClick} style={{
      padding: '10px 16px',
      borderRadius: 999,
      border: '1px solid ' + (active ? (accent || 'var(--accent, #3b82f6)') : 'var(--border)'),
      background: active ? (accent || 'var(--accent, #3b82f6)') : 'transparent',
      color: active ? (accentText || 'var(--accent-text, #fff)') : 'var(--text)',
      fontSize: 14, fontWeight: 500, cursor: 'pointer', minHeight: 40,
    }}>{children}</button>
  )
}

// Voice handoff latency — how long it takes to switch the active voice agent.
// Reads /api/elevenlabs/handoff-latency (CRM-side switch timing + ElevenLabs in-call transfers).
function HandoffLatencyPanel({ data }) {
  const [open, setOpen] = useState(false)
  if (!data || !data.crm) return null
  const { crm, elevenlabs } = data
  const ms = v => (v == null ? '—' : v >= 1000 ? (v / 1000).toFixed(1) + 's' : Math.round(v) + 'ms')
  const win = crm.last7d || crm.overall
  const stageLabels = {
    'mic-granted': 'Mic grant',
    'signed-url-ready': 'Signed URL (our backend)',
    'provider-started': 'Provider connect (ElevenLabs)',
    'fast-start': 'Fast start',
    'lab-live-started': 'Lab live',
    'start-finished': 'Full start',
  }
  const stageRows = Object.entries(crm.byStage || {})
    .filter(([, s]) => s && s.p50 > 0)
    .sort((a, b) => (b[1].p50 || 0) - (a[1].p50 || 0))
  const agentRows = Object.entries(crm.byAgent || {}).sort((a, b) => (b[1]?.n || 0) - (a[1]?.n || 0))

  const Stat = ({ label, value, hint }) => (
    <div style={{ minWidth: 110 }}>
      <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700 }}>{value}</div>
      {hint && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{hint}</div>}
    </div>
  )

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 12, marginBottom: 12, background: 'var(--surface, transparent)', overflow: 'hidden' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        style={{
          width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
          minHeight: 48, padding: '0 20px', background: 'transparent', border: 'none',
          cursor: 'pointer', font: 'inherit', color: 'inherit', textAlign: 'left',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <strong style={{ fontSize: 16 }}>Voice handoff speed</strong>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            {win ? `median ${ms(win.p50)} · ${win.n} handoffs, last 7 days` : 'no recent handoffs'}
          </span>
        </span>
        <span style={{ fontSize: 18, color: 'var(--text-muted)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>⌄</span>
      </button>

      {open && (
      <div style={{ padding: '0 20px 20px' }}>
      {win ? (
        <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', marginTop: 14 }}>
          <Stat label="Typical (median)" value={ms(win.p50)} />
          <Stat label="Slow tail (p90)" value={ms(win.p90)} />
          <Stat label="Worst" value={ms(win.max)} />
          <Stat label="Errors / slow" value={crm.errorsLast7d ?? 0} hint="last 7 days" />
        </div>
      ) : (
        <div style={{ marginTop: 12, color: 'var(--text-muted)', fontSize: 15 }}>No handoffs in the last 7 days.</div>
      )}

      {stageRows.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6 }}>Where the time goes (median per step)</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {stageRows.map(([k, s]) => {
              const maxP50 = Math.max(...stageRows.map(([, x]) => x.p50))
              return (
                <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
                  <span style={{ width: 200, color: 'var(--text-muted)' }}>{stageLabels[k] || k}</span>
                  <div style={{ flex: 1, background: 'var(--border)', borderRadius: 4, height: 14, overflow: 'hidden' }}>
                    <div style={{ width: `${Math.max(4, (s.p50 / maxP50) * 100)}%`, height: '100%', background: 'var(--accent, #c96442)' }} />
                  </div>
                  <span style={{ width: 60, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{ms(s.p50)}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {agentRows.length > 0 && (
        <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {agentRows.map(([name, s]) => (
            <span key={name} style={{ fontSize: 13, border: '1px solid var(--border)', borderRadius: 999, padding: '4px 12px' }}>
              {name}: <strong>{ms(s?.p50)}</strong> <span style={{ color: 'var(--text-muted)' }}>({s?.n})</span>
            </span>
          ))}
        </div>
      )}

      <div style={{ marginTop: 16, paddingTop: 12, borderTop: '1px dashed var(--border)', fontSize: 14, color: 'var(--text-muted)' }}>
        <strong style={{ color: 'var(--text)' }}>In-call transfers (ElevenLabs):</strong>{' '}
        {elevenlabs?.ok
          ? (elevenlabs.transferConversations > 0
              ? `${elevenlabs.transferConversations} of ${elevenlabs.scanned} recent calls used an agent-to-agent transfer.`
              : elevenlabs.note || 'None recorded yet.')
          : `unavailable (${elevenlabs?.error || elevenlabs?.status || 'no data'})`}
      </div>
      </div>
      )}
    </div>
  )
}

function AgentCard({ agent, categories, selected, checked = false, onCheck, compact = false, onEdit, onClone, onTalk, elSyncStatus, onElSync, usage }) {
  const cat = categories.find(c => c.id === agent.category)
  const voiceStatus = getVoiceRuntimeStatus(agent, elSyncStatus)
  const toolCount = (() => {
    const tools = agent.tools
    if (Array.isArray(tools)) return tools.length
    if (tools && typeof tools === 'object') return (tools.alsoAllow || []).length
    return 0
  })()
  const channelLabel = agent.channels?.length > 0 ? agent.channels.map(c => CHANNEL_LABELS[c] || c).join(', ') : 'No channels'
  const statusBadges = []
  if (agent.draft && (!agent.runtimeProvider || agent.runtimeProvider === 'openclaw-hetzner')) statusBadges.push(<span key="draft" style={badge('amber')}>Draft</span>)
  else if (agent.draft) statusBadges.push(<span key="ready" style={badge('green')}>Ready</span>)
  else if (!agent.enabled) statusBadges.push(<span key="disabled" style={badge('grey')}>Disabled</span>)
  else statusBadges.push(<span key="active" style={badge('green')}>Active</span>)
  if (agent.runtimeProvider === 'deerflow-hetzner') statusBadges.push(<span key="deerflow" style={badge('blue')}>DeerFlow</span>)
  if (agent.runtimeProvider === 'hermes-hetzner') statusBadges.push(<span key="hermes" style={badge('grey')}>Hermes</span>)
  if (agent.runtimeProvider === 'deepseek-harness-local') statusBadges.push(<span key="deepseek-harness" style={badge('blue')}>DeepSeek Harness</span>)
  if (agent.id === 'main') statusBadges.push(<span key="main" style={badge('blue')}>Main</span>)
  if (elSyncStatus?.hasBinding) {
    statusBadges.push(
      <ElSyncPill
        key="el-sync"
        synced={!!elSyncStatus.lastSyncedAt}
        lastSyncedAt={elSyncStatus.lastSyncedAt}
        voiceName={elSyncStatus.voiceName}
        onClick={(e) => { e.stopPropagation(); onElSync?.() }}
      />
    )
  }
  const metaChipStyle = {
    minWidth: 0,
    padding: compact ? '4px 0' : '7px 8px',
    borderRadius: compact ? 0 : 8,
    background: compact ? 'transparent' : 'rgba(8, 23, 42, 0.44)',
    border: compact ? '0' : '1px solid rgba(168, 186, 211, 0.12)',
    display: 'grid',
    gap: 2,
  }
  const metaLabelStyle = { fontSize: 10, fontWeight: 700, color: 'var(--text-mute-strong)', textTransform: 'uppercase' }
  const metaValueStyle = { fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
  const startVoiceTest = () => {
    if (typeof window === 'undefined') return
    window.dispatchEvent(new CustomEvent('fcc:start-voice-agent', {
      detail: { agentId: agent.id, name: agent.name },
    }))
  }
  const openTranscription = () => {
    if (typeof window === 'undefined') return
    window.dispatchEvent(new CustomEvent('fcc:navigate', {
      detail: { tab: 'meeting-capture' },
    }))
  }
  const actionMenu = (
    <ItemActionsMenu
      label={`Actions for ${agent.name}`}
      actions={[
        { label: 'Start voice test', onClick: startVoiceTest },
        { label: 'Open chat', onClick: onTalk },
        { label: 'Open transcription', onClick: openTranscription },
        { label: 'Edit agent', onClick: onEdit },
        agent.id !== 'main' && { label: 'Clone agent', onClick: onClone },
      ]}
    />
  )
  return (
    <div className={`agent-card ${compact ? 'agent-card-list' : 'agent-card-grid'}`} style={{
      padding: compact ? 12 : 16, borderRadius: compact ? 10 : 10, border: '1px solid ' + (checked || selected ? (cat?.accent || 'var(--accent, #3b82f6)') : 'rgba(168, 186, 211, 0.14)'),
      background: compact ? 'var(--surface, #06101f)' : 'rgba(4, 11, 22, 0.9)', display: 'flex', flexDirection: compact ? 'row' : 'column', gap: compact ? 12 : 12,
      alignItems: compact ? 'center' : 'stretch',
      boxShadow: compact ? 'none' : 'inset 0 1px 0 rgba(255, 255, 255, 0.03)',
      transition: 'border-color 0.15s, background 0.15s',
      height: compact ? 'auto' : '100%',
    }}>
      <div className="agent-card-head" style={{ display: 'flex', alignItems: compact ? 'center' : 'flex-start', gap: compact ? 10 : 14, minWidth: 0, flex: compact ? '1 1 320px' : '0 0 auto' }}>
        {onCheck && <input type="checkbox" checked={checked} onChange={onCheck} onClick={e => e.stopPropagation()} aria-label={`Select ${agent.name}`} style={{ alignSelf: compact ? 'center' : 'flex-start', marginTop: compact ? 0 : 4 }} />}
        <Avatar agent={agent} size={compact ? 46 : 64} accent={cat?.accent} accentText={cat?.text} />
        <div style={{ flex: 1, minWidth: 0, display: 'grid', gap: compact ? 4 : 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <button
              type="button"
              className="agent-card-name record-title-button"
              style={{ fontSize: compact ? 16 : 18, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: compact ? 'nowrap' : 'normal', lineHeight: 1.2, textAlign: 'left' }}
              onClick={onEdit}
              aria-label={`Open ${agent.name}`}
            >
              {agent.name}
            </button>
          </div>
          <div className="agent-card-status-row" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', minHeight: compact ? 0 : 26 }}>
            {statusBadges}
          </div>
          {!compact && (
            <div style={{ minHeight: 36, display: 'grid', gap: 3, alignContent: 'start' }}>
              <div style={{ fontSize: 13, color: agent.title ? 'var(--text-muted)' : 'var(--text-mute-strong)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{agent.title || 'No title set'}</div>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: cat ? cat.accent : 'var(--text-mute-strong)', fontWeight: 600, minWidth: 0 }}>
                <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 999, background: cat?.accent || 'var(--text-mute-strong)', flex: '0 0 auto' }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat?.label || 'Uncategorized'}</span>
              </div>
            </div>
          )}
        </div>
        {!compact && <div style={{ marginLeft: 'auto', flex: '0 0 auto' }}>{actionMenu}</div>}
      </div>
      {!compact && <div style={{ minHeight: 42, fontSize: 13, color: agent.role ? 'var(--text-muted)' : 'var(--text-mute-strong)', lineHeight: 1.45, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{agent.role || 'No role summary set'}</div>}
      <VoiceRuntimeMini status={voiceStatus} compact={compact} />
      <div className="agent-card-meta" style={{ display: 'grid', gridTemplateColumns: compact ? 'repeat(3, minmax(70px, 1fr))' : 'repeat(3, minmax(0, 1fr))', gap: 6, minHeight: compact ? 0 : 54, flex: compact ? '0 1 300px' : '0 0 auto', marginTop: compact ? 0 : 'auto' }}>
        <span style={metaChipStyle}>
          <span style={metaLabelStyle}>Brain</span>
          <span style={metaValueStyle}>{agent.brain?.key || 'standard'}</span>
        </span>
        <span style={metaChipStyle} title="Per-agent tools attached. Every agent also gets the top-level base allowlist on top.">
          <span style={metaLabelStyle}>Tools</span>
          <span style={metaValueStyle}>{toolCount} attached</span>
        </span>
        <span style={metaChipStyle}>
          <span style={metaLabelStyle}>Channels</span>
          <span style={metaValueStyle}>{channelLabel}</span>
        </span>
      </div>
      {!compact && (
        <div style={{ minHeight: 38, display: 'flex', alignItems: 'center', gap: 12, fontSize: 12, padding: '8px 10px', background: 'rgba(8, 23, 42, 0.34)', borderRadius: 8, border: '1px solid rgba(168, 186, 211, 0.12)', color: usage?.hasBinding ? 'var(--text-muted)' : 'var(--text-mute-strong)' }}>
          {usage?.hasBinding ? (
            <>
              <span title="Conversations on ElevenLabs (last 100)"><strong>{usage.conversationsCount}</strong> {usage.conversationsCount === 1 ? 'call' : 'calls'}</span>
              <span style={{ color: 'var(--text-mute-strong)' }}>•</span>
              <span title="Total ElevenLabs voice minutes"><strong>{usage.totalMinutes}</strong> min</span>
              {usage.lastConversationAt && (
                <>
                  <span style={{ color: 'var(--text-mute-strong)' }}>•</span>
                  <span title={usage.lastConversationAt}>
                    last: {new Date(usage.lastConversationAt).toLocaleDateString()}
                  </span>
                </>
              )}
            </>
          ) : (
            <span>No voice usage yet</span>
          )}
        </div>
      )}
      {/* Footer pinned to the bottom — voice + text are both first-class test paths. */}
      {compact && (
        <div className="agent-card-actions" style={{ marginLeft: 'auto', display: 'flex', justifyContent: 'flex-end', minWidth: 44 }}>
          {actionMenu}
        </div>
      )}
    </div>
  )
}

// Small clickable pill — sits in the agent-name row alongside Draft/Disabled/Main badges.
// Doubles as a status indicator AND the entry point to the sync diff modal.
function VoiceRuntimeMini({ status, compact = false }) {
  if (!status) return null
  const providerTone = status.tone === 'ok' ? 'green' : status.tone === 'warn' ? 'amber' : 'blue'
  return (
    <div
      title={`${status.providerLabel}: ${status.summary}. Live phone: ${status.livePhone}. Sandbox: ${status.sandbox}.`}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 6,
        alignItems: 'center',
        minWidth: 0,
        flex: compact ? '0 1 320px' : '0 0 auto',
      }}
    >
      <span style={badge(providerTone)}>{status.providerLabel}</span>
      <span style={badge(status.tone === 'warn' ? 'amber' : 'grey')}>{status.summary}</span>
      {!compact && <span style={badge('grey')}>Voice: {shortVoiceName(status.selectedVoice)}</span>}
    </div>
  )
}

function shortVoiceName(name = '') {
  const raw = String(name || '')
  if (raw.includes('Chirp3-HD-')) return chirpOptionLabel(raw).slice(0, 42)
  return raw.replace('en-US-Chirp3-HD-', '').slice(0, 42) || 'not set'
}

function ElSyncPill({ synced, lastSyncedAt, voiceName, onClick }) {
  const tone = synced
    ? { bg: 'rgba(34, 197, 94, 0.11)', border: 'rgba(34, 197, 94, 0.28)', text: 'var(--green)' }
    : { bg: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.3)', text: 'var(--amber)' }
  const ago = lastSyncedAt ? new Date(lastSyncedAt).toLocaleString() : 'never'
  return (
    <button
      onClick={onClick}
      title={`ElevenLabs voice: ${voiceName || '—'} • last synced ${ago}\nClick to preview and push CRM persona.`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '4px 10px', borderRadius: 999,
        background: tone.bg, border: `1px solid ${tone.border}`, color: tone.text,
        fontSize: 11, fontWeight: 600, cursor: 'pointer', minHeight: 26,
      }}
    >
      <Link2 size={12} strokeWidth={2.25} aria-hidden="true" />
      <span>{synced ? 'Synced' : 'Sync needed'}</span>
    </button>
  )
}

function EditAgentModal({ agentName, eyebrow = 'Editing agent', onClose, children }) {
  const panelRef = useRef(null)

  useEffect(() => {
    if (typeof document === 'undefined') return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [])

  useEffect(() => {
    panelRef.current?.scrollTo?.({ top: 0, left: 0, behavior: 'auto' })
  }, [agentName, eyebrow])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Edit ${agentName || 'agent'}`}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(15, 23, 42, 0.55)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'stretch',
        padding: '18px',
      }}
    >
      <div
        ref={panelRef}
        style={{
          width: 'min(1480px, 100%)',
          maxHeight: 'calc(100vh - 36px)',
          overflow: 'auto',
          borderRadius: 12,
          background: 'var(--surface, #fff)',
          border: '1px solid var(--border)',
          boxShadow: '0 24px 80px rgba(0,0,0,0.28)',
        }}
      >
        <div
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 3,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '12px 16px',
            background: 'var(--surface, #fff)',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>{eyebrow}</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{agentName || 'Agent'}</div>
          </div>
          <button
            onClick={onClose}
            title="Close editor"
            style={{
              ...btnStyle('ghost'),
              minWidth: 42,
              width: 42,
              height: 42,
              padding: 0,
              borderRadius: 8,
              fontSize: 20,
              lineHeight: 1,
            }}
          >
            x
          </button>
        </div>
        <div style={{ padding: '0 18px 18px' }}>
          {children}
        </div>
      </div>
    </div>
  )
}

function DetailPanel({ editing, setEditing, activeTab, setActiveTab, categories, brains, modelCatalog, modelProviders, modelTiers, channelOptions, channelStatus, onSave, onSaveDraft, onCancel, onClone, onDelete, busy, elSyncStatus, promptSyncStatus, onElSync, usage, tenants, accounts, onLease, onCancelLease }) {
  const [leaseFormOpen, setLeaseFormOpen] = useState(false)
  const [activeInspector, setActiveInspector] = useState(null)
  const isLeased = !!editing.leaseId
  const leasedTenant = isLeased && tenants?.find(t => t.lease?.id === editing.leaseId)
  const tabs = [
    { id: 'identity', label: '🪪 Identity' },
    { id: 'brain', label: '🧠 Brain' },
    { id: 'job', label: '📋 Job Description' },
    { id: 'capabilities', label: 'Capabilities' },
    { id: 'tools', label: '🔧 Tools' },
    { id: 'channels', label: '📡 Channels' },
    { id: 'schedule', label: '⏰ Schedule' },
    { id: 'experiments', label: 'Demo Experiments' },
    { id: 'advanced', label: '⚙️ Advanced' },
  ]
  return (
    <div style={{ marginTop: 24, padding: 24, borderRadius: 16, border: '2px solid var(--accent, #3b82f6)', background: 'var(--surface, #fff)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Avatar agent={editing} size={64} accent={categories.find(c => c.id === editing.category)?.accent} accentText={categories.find(c => c.id === editing.category)?.text} />
          <div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{editing.name}</div>
            {editing.title && <div style={{ fontSize: 14, color: 'var(--text-muted)', fontWeight: 500 }}>{editing.title}</div>}
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              id: {editing.id}
              {editing.draft && editing.runtimeProvider && editing.runtimeProvider !== 'openclaw-hetzner' && ` • ${runtimeLabelFor(editing.runtimeProvider)} ready`}
              {editing.draft && (!editing.runtimeProvider || editing.runtimeProvider === 'openclaw-hetzner') && ' • DRAFT (not live)'}
            </div>
            <ElevenLabsSyncStatus status={elSyncStatus} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <HeaderStatusLink
            active={activeInspector === 'availability'}
            label="Availability"
            onClick={() => setActiveInspector(activeInspector === 'availability' ? null : 'availability')}
          />
          <HeaderStatusLink
            active={activeInspector === 'truth'}
            label="Source truth"
            onClick={() => setActiveInspector(activeInspector === 'truth' ? null : 'truth')}
          />
          {!editing._new && editing.id !== 'main' && <button onClick={onClone} disabled={busy} style={btnStyle('ghost')}>Clone</button>}
          {!editing._new && editing.id !== 'main' && <button onClick={onDelete} disabled={busy} style={btnStyle('danger')}>Delete</button>}
          <button onClick={onCancel} disabled={busy} style={btnStyle('ghost')}>Cancel</button>
          {(!editing.runtimeProvider || editing.runtimeProvider === 'openclaw-hetzner') && <button onClick={onSaveDraft} disabled={busy} style={btnStyle('secondary')}>Save Draft</button>}
          <button
            onClick={onSave}
            disabled={busy}
            title={editing.runtimeProvider && editing.runtimeProvider !== 'openclaw-hetzner'
              ? `Save this ${runtimeLabelFor(editing.runtimeProvider)} profile locally without syncing to OpenClaw`
              : elSyncStatus?.hasBinding
              ? 'Save to CRM and push to OpenClaw + ElevenLabs in one shot'
              : 'Save to CRM and push to OpenClaw'}
            style={btnStyle('primary')}
          >
            {busy ? 'Saving…' : editing.runtimeProvider && editing.runtimeProvider !== 'openclaw-hetzner'
              ? `Save ${runtimeLabelFor(editing.runtimeProvider)} Profile`
              : (elSyncStatus?.hasBinding ? 'Save & Sync (everywhere)' : 'Save & Sync to OpenClaw')}
          </button>
          {elSyncStatus?.hasBinding && (
            <button
              onClick={onElSync}
              disabled={busy}
              title="Open the diff preview before pushing — useful when you want to see exactly what will change on ElevenLabs"
              style={{ ...btnStyle('ghost'), fontSize: 13, padding: '8px 12px', minHeight: 38 }}
            >Preview voice diff</button>
          )}
          {!editing._new && !isLeased && (
            <button
              onClick={() => setLeaseFormOpen(o => !o)}
              disabled={busy}
              title="Lease this agent to a client account for a monthly fee"
              style={{ ...btnStyle('secondary'), background: '#059669', color: '#fff', borderColor: '#059669' }}
            >🏢 {leaseFormOpen ? 'Close' : 'Lease to Client'}</button>
          )}
          {isLeased && leasedTenant && (
            <>
              {!leasedTenant.lease?.twilioPhoneNumber && (
                <button
                  onClick={async () => {
                    if (!confirm(`Buy a Twilio phone number for ${leasedTenant.name} and bind to this agent?\n\nThis will charge your Twilio account ~$1.15/mo + per-minute usage.`)) return
                    try {
                      const r = await fetch('/api/twilio/provision-number', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ leaseId: editing.leaseId, areaCode: '828' }),
                      })
                      const j = await r.json()
                      if (!j.ok) throw new Error(j.error || 'Provision failed')
                      alert(j.message || 'Phone provisioned.')
                      window.location.reload()
                    } catch (e) {
                      alert('Failed: ' + e.message)
                    }
                  }}
                  disabled={busy}
                  title="Buy a Twilio number AND bind to this agent — one click"
                  style={{ ...btnStyle('secondary'), background: '#0891b2', color: '#fff', borderColor: '#0891b2' }}
                >📞 Provision Phone</button>
              )}
              {leasedTenant.lease?.twilioPhoneNumber && (
                <span style={{ padding: '8px 12px', borderRadius: 8, background: 'var(--surface2)', color: 'var(--text)', fontSize: 13, border: '1px solid var(--border)', alignSelf: 'center' }}>
                  📞 {leasedTenant.lease.twilioPhoneNumber}
                  {leasedTenant.lease.elevenLabsImportStatus === 'pending-manual' && <span style={{ marginLeft: 6, color: '#f59e0b', fontSize: 11, fontWeight: 600 }}>EL pending</span>}
                </span>
              )}
              <button
                onClick={() => onCancelLease?.(editing.leaseId)}
                disabled={busy}
                title={`Cancel lease — return agent to in-house. Currently leased to ${leasedTenant.name} for $${leasedTenant.lease?.monthlyFee || 0}/mo`}
                style={{ ...btnStyle('danger') }}
              >End Lease ({leasedTenant.name})</button>
            </>
          )}
        </div>
      </div>

      {leaseFormOpen && !isLeased && (
        <LeaseForm
          agent={editing}
          accounts={accounts || []}
          busy={busy}
          onSubmit={async (payload) => {
            await onLease?.({ agentId: editing.id, ...payload })
            setLeaseFormOpen(false)
          }}
          onClose={() => setLeaseFormOpen(false)}
        />
      )}

      {usage?.hasBinding && (
        <div style={{ marginBottom: 16, padding: '12px 16px', background: 'var(--surface2, #f8fafc)', borderRadius: 10, border: '1px solid var(--border)', display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 13 }}>
          <div><span style={{ color: 'var(--text-muted)' }}>Calls:</span> <strong>{usage.conversationsCount}</strong></div>
          <div><span style={{ color: 'var(--text-muted)' }}>Total minutes:</span> <strong>{usage.totalMinutes}</strong></div>
          {usage.lastConversationAt && (
            <div><span style={{ color: 'var(--text-muted)' }}>Last activity:</span> <strong>{new Date(usage.lastConversationAt).toLocaleString()}</strong></div>
          )}
          <div style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: 12 }}>real ElevenLabs data</div>
        </div>
      )}

      {activeInspector && (
        <div style={{ marginBottom: 16, position: 'relative' }}>
          <button
            type="button"
            onClick={() => setActiveInspector(null)}
            aria-label="Close status details"
            style={{ position: 'absolute', top: 10, right: 10, zIndex: 2, ...btnStyle('ghost'), width: 34, minWidth: 34, height: 34, padding: 0 }}
          >
            x
          </button>
          {activeInspector === 'availability' && <VoiceRuntimeStatusPanel agent={editing} elSyncStatus={elSyncStatus} />}
          {activeInspector === 'truth' && (
            <AgentTruthPanel
              editing={editing}
              elSyncStatus={elSyncStatus}
              promptSyncStatus={promptSyncStatus}
              usage={usage}
            />
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
            padding: '10px 16px', minHeight: 44, fontSize: 14, fontWeight: 600,
            border: 'none', borderRadius: 8, cursor: 'pointer',
            background: activeTab === t.id ? 'var(--accent, #3b82f6)' : 'transparent',
            color: activeTab === t.id ? 'var(--accent-text, #fff)' : 'var(--text)',
          }}>{t.label}</button>
        ))}
      </div>

      {activeTab === 'identity' && <IdentityTab editing={editing} setEditing={setEditing} categories={categories} />}
      {activeTab === 'brain' && <BrainTab editing={editing} setEditing={setEditing} brains={brains} catalog={modelCatalog} providers={modelProviders} tiers={modelTiers} />}
      {activeTab === 'job' && <JobTab editing={editing} setEditing={setEditing} promptSyncStatus={promptSyncStatus} />}
      {activeTab === 'capabilities' && <CapabilitiesTab editing={editing} setEditing={setEditing} />}
      {activeTab === 'tools' && <ToolsTab editing={editing} setEditing={setEditing} />}
      {activeTab === 'experiments' && <LabsTab editing={editing} setEditing={setEditing} elSyncStatus={elSyncStatus} />}
      {activeTab === 'channels' && <ChannelsTab editing={editing} setEditing={setEditing} channelOptions={channelOptions} channelStatus={channelStatus} />}
      {activeTab === 'schedule' && <ScheduleTab editing={editing} setEditing={setEditing} />}
      {activeTab === 'advanced' && <AdvancedTab editing={editing} />}
    </div>
  )
}

// Read-only at-a-glance ElevenLabs sync status. No write actions yet — that's the next
// increment. Shows: has-binding, last-sync time, and a hint about prompt readiness.
function HeaderStatusLink({ active, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        minHeight: 34,
        padding: '7px 10px',
        borderRadius: 8,
        border: '1px solid var(--border)',
        background: active ? 'var(--accent-soft)' : 'var(--surface2)',
        color: active ? 'var(--accent)' : 'var(--text-muted)',
        fontSize: 12.5,
        fontWeight: 800,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  )
}

function ElevenLabsSyncStatus({ status }) {
  if (!status) return null
  if (!status.hasBinding) {
    return (
      <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 4, letterSpacing: 0.04 }}>
        🔌 No ElevenLabs binding — voice/phone are not wired for this agent
      </div>
    )
  }
  const synced = status.lastSyncedAt
  const fmt = synced ? new Date(synced).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : null
  const promptOk = (status.promptLength || 0) > 50
  return (
    <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 4, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
      <span title="ElevenLabs ConvAI binding">🔗 {status.voiceName || 'voice bound'}</span>
      <span style={{ color: 'var(--border)' }}>·</span>
      <span title={synced ? 'Last time prompt + voice were synced from this CRM to ElevenLabs' : 'Never synced from this CRM — live agent may differ from what you see here'}>
        {synced ? `synced ${fmt}` : '⚠ never synced from CRM'}
      </span>
      {!promptOk && (
        <>
          <span style={{ color: 'var(--border)' }}>·</span>
          <span style={{ color: '#92400e' }} title="No (or very short) jobDescription on file">⚠ no prompt</span>
        </>
      )}
    </div>
  )
}

function VoiceRuntimeStatusPanel({ agent, elSyncStatus }) {
  const status = getVoiceRuntimeStatus(agent, elSyncStatus)
  const rows = [
    ['Selected provider', status.providerLabel, status.tone],
    ['Selected voice', shortVoiceName(status.selectedVoice), 'neutral'],
    ['Live phone', status.livePhone, status.tone === 'ok' ? 'ok' : 'warn'],
    ['Sandbox/test', status.sandbox, status.provider === 'elevenlabs' && !elSyncStatus?.hasBinding ? 'warn' : 'ok'],
    ['Assignment guidance', status.assignable, status.locked ? 'warn' : 'ok'],
  ]
  return (
    <section style={{ marginBottom: 16, padding: 14, borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface, #fff)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 850 }}>Voice availability</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 2 }}>
            Shows what can actually run for this agent: phone, sandbox, and safe experiment assignment.
          </div>
        </div>
        <span style={badge(status.tone === 'ok' ? 'green' : status.tone === 'warn' ? 'amber' : 'blue')}>{status.summary}</span>
      </div>
      {status.lockReason && (
        <div style={{ marginBottom: 10, padding: '9px 10px', borderRadius: 8, border: '1px solid #f59e0b', background: 'rgba(245, 158, 11, 0.12)', color: 'var(--text)', fontSize: 12.5, lineHeight: 1.45 }}>
          {status.lockReason}. Use a separate experiment agent before changing this voice runtime.
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 8 }}>
        {rows.map(([label, value, tone]) => (
          <div key={label} style={{ padding: 10, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2, #f8fafc)', minHeight: 68 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</span>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: truthToneColor(tone), flex: '0 0 auto' }} />
            </div>
            <div style={{ marginTop: 6, fontSize: 13, fontWeight: 650, color: 'var(--text)', overflowWrap: 'anywhere' }}>{value}</div>
          </div>
        ))}
      </div>
    </section>
  )
}

function AgentTruthPanel({ editing, elSyncStatus, promptSyncStatus, usage }) {
  if (!editing) return null
  const voice = editing.voice || { provider: 'elevenlabs' }
  const labs = editing.labs || {}
  const hasElevenBinding = !!elSyncStatus?.hasBinding
  const voiceStatus = getVoiceRuntimeStatus(editing, elSyncStatus)
  const promptLabel = promptSyncStatus?.status ? (PROMPT_SYNC_LABELS[promptSyncStatus.status] || promptSyncStatus.status) : 'Not checked'
  const promptTone = promptSyncStatus?.status === 'SYNCED' ? 'ok' : promptSyncStatus?.status === 'CONFLICT' ? 'danger' : 'warn'
  const flowCount = Array.isArray(labs.mindstudioFlows) ? labs.mindstudioFlows.length : 0
  const hasAgentPrompt = (editing.jobDescription || '').trim().length > 50
  const hasRuntimeModel = !!editing.brain?.modelId
  const hasTools = (editing.tools || []).length > 0
  const hasVoiceRuntime = voiceStatus.provider === 'elevenlabs' ? hasElevenBinding : !voiceStatus.locked
  const hasImportedConvAi = !!labs.elevenLabsSnapshot?.importedAt
  const leaseReady = hasRuntimeModel && hasAgentPrompt && hasVoiceRuntime && hasTools && (!hasElevenBinding || hasImportedConvAi)
  const rows = [
    ['Brain', hasRuntimeModel ? editing.brain.modelId : 'No runtime model selected', hasRuntimeModel ? 'ok' : 'danger'],
    ['Fallbacks', `${editing.brain?.fallbacks?.length || 0} configured`, (editing.brain?.fallbacks?.length || 0) > 0 ? 'ok' : 'warn'],
    ['Voice runtime', `${voiceStatus.providerLabel}: ${voiceStatus.summary}`, hasVoiceRuntime ? 'ok' : 'warn'],
    ['ElevenLabs binding', hasElevenBinding ? `Present${elSyncStatus?.voiceName ? `: ${elSyncStatus.voiceName}` : ''}` : 'Missing', hasElevenBinding ? 'ok' : 'warn'],
    ['Prompt source', hasAgentPrompt ? 'CRM job description present' : 'Prompt missing or too short', hasAgentPrompt ? 'ok' : 'danger'],
    ['Prompt sync', promptLabel, promptTone],
    ['Flows/actions/events', hasImportedConvAi ? `ElevenLabs snapshot imported ${new Date(labs.elevenLabsSnapshot.importedAt).toLocaleString()}` : `Not imported${flowCount ? `; ${flowCount} local flow note${flowCount === 1 ? '' : 's'}` : ''}`, hasImportedConvAi ? 'ok' : hasElevenBinding ? 'warn' : 'neutral'],
    ['Tools', hasTools ? `${editing.tools.length} allowed` : 'No tools allowed', hasTools ? 'ok' : 'warn'],
    ['Action policy', 'Protected: money, sends, calls, purchases, destructive edits, and paid generation require explicit approval', 'ok'],
    ['Usage', usage?.hasBinding ? `${usage.conversationsCount || 0} calls, ${usage.totalMinutes || 0} min` : 'No ElevenLabs usage loaded', usage?.hasBinding ? 'ok' : 'neutral'],
    ['Lease readiness', leaseReady ? 'Ready for controlled packaging' : 'Not ready; needs missing checks above', leaseReady ? 'ok' : 'warn'],
  ]
  return (
    <div style={{ marginBottom: 16, padding: 14, borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface2, #f8fafc)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 850 }}>Source of truth</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 2 }}>Read-only status before changing this agent.</div>
        </div>
        <span style={badge(leaseReady ? 'blue' : 'amber')}>{leaseReady ? 'Lease ready' : 'Needs review'}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 8 }}>
        {rows.map(([label, value, tone]) => (
          <div key={label} style={{ padding: 10, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface, #fff)', minHeight: 70 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</span>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: truthToneColor(tone), flex: '0 0 auto' }} />
            </div>
            <div style={{ marginTop: 6, fontSize: 13, fontWeight: 650, color: 'var(--text)', overflowWrap: 'anywhere' }}>{value}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function truthToneColor(tone) {
  if (tone === 'ok') return '#16a34a'
  if (tone === 'danger') return '#dc2626'
  if (tone === 'warn') return '#d97706'
  return '#64748b'
}

function FieldLabel({ children, hint }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <label style={{ fontSize: 14, fontWeight: 600, display: 'block' }}>{children}</label>
      {hint && <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 2 }}>{hint}</div>}
    </div>
  )
}

const inputStyle = { width: '100%', padding: '12px 14px', fontSize: 15, border: '1px solid var(--border)', borderRadius: 10, background: 'var(--surface2, #f8fafc)', color: 'var(--text)', minHeight: 48, fontFamily: 'inherit' }

function IdentityTab({ editing, setEditing, categories }) {
  const cat = categories.find(c => c.id === editing.category)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <AvatarSection editing={editing} setEditing={setEditing} accent={cat?.accent} accentText={cat?.text} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        <div>
          <FieldLabel hint="The first name you'd call them in conversation. Will route 'Hey John' to this agent.">Persona Name</FieldLabel>
          <input style={inputStyle} value={editing.name || ''} onChange={e => setEditing({ ...editing, name: e.target.value })} placeholder="e.g. John" />
        </div>
        <div>
          <FieldLabel hint="Their job title — what they do, not what you call them.">Title</FieldLabel>
          <input style={inputStyle} value={editing.title || ''} onChange={e => setEditing({ ...editing, title: e.target.value })} placeholder="e.g. Receptionist" />
        </div>
        <div>
          <FieldLabel hint="Determines where they show up in the dashboard.">Department</FieldLabel>
          <ThemedSelect style={inputStyle} value={editing.category || 'custom'} onChange={e => setEditing({ ...editing, category: e.target.value })}>
            {categories.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>)}
          </ThemedSelect>
        </div>
        <div>
          <FieldLabel hint="Fallback icon when no avatar photo is set.">Fallback Emoji</FieldLabel>
          <input style={{ ...inputStyle, fontSize: 24 }} value={editing.emoji || ''} onChange={e => setEditing({ ...editing, emoji: e.target.value })} />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <FieldLabel hint="One-line role description that shows on the card.">Role tagline</FieldLabel>
          <input style={inputStyle} value={editing.role || ''} onChange={e => setEditing({ ...editing, role: e.target.value })} />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <FieldLabel hint="How they should sound — used for TTS voice and personality cues in the system prompt.">Voice & personality</FieldLabel>
          <input style={inputStyle} value={editing.voiceProfile || ''} onChange={e => setEditing({ ...editing, voiceProfile: e.target.value })} placeholder="e.g. Warm professional male, calm pace" />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <FieldLabel hint="Longer description for your reference.">Description</FieldLabel>
          <textarea style={{ ...inputStyle, minHeight: 100, resize: 'vertical' }} value={editing.description || ''} onChange={e => setEditing({ ...editing, description: e.target.value })} />
        </div>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, background: 'var(--surface2, #f8fafc)', borderRadius: 10, cursor: 'pointer', minHeight: 56 }}>
        <input type="checkbox" checked={editing.enabled !== false} onChange={e => setEditing({ ...editing, enabled: e.target.checked })} style={{ width: 22, height: 22 }} />
        <span style={{ fontSize: 15, fontWeight: 500 }}>Agent is active</span>
      </label>
    </div>
  )
}

function Avatar({ agent, size = 56, accent, accentText, onImageError }) {
  const url = agent.avatar?.url
  const [failedUrl, setFailedUrl] = useState('')
  useEffect(() => {
    if (url && failedUrl && failedUrl !== url) setFailedUrl('')
  }, [url, failedUrl])
  if (url && failedUrl !== url) {
    return (
      <img src={url} alt={agent.name}
           onError={() => {
             setFailedUrl(url)
             onImageError?.(url)
           }}
           style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--border)', flexShrink: 0, background: 'var(--surface2, #f8fafc)' }} />
    )
  }
  const initial = (agent.name || '?').trim().charAt(0).toUpperCase()
  const bg = accent || 'var(--accent, #3b82f6)'
  const fg = accentText || 'var(--accent-text, #fff)'
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: bg, color: fg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.45, fontWeight: 700, flexShrink: 0,
      border: '2px solid var(--border)',
    }}>{initial}</div>
  )
}

function AvatarSection({ editing, setEditing, accent, accentText }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const fileInputRef = useRef(null)
  const verifyImageUrl = (url) => new Promise((resolve, reject) => {
    if (!url || typeof window === 'undefined') return resolve()
    const img = new Image()
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('Avatar was generated, but the image file did not load in the browser.'))
    img.src = `${url}${url.includes('?') ? '&' : '?'}v=${Date.now()}`
  })

  const generate = async () => {
    if (!editing.id) return
    const prompt = editing.avatarPrompt?.trim()
    if (!prompt) {
      setErr('Add an avatar prompt below first — describe what they look like.')
      return
    }
    setBusy(true); setErr(null)
    try {
      const r = await fetch('/api/openclaw/agents/avatar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate', id: editing.id, prompt }),
      })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || 'Generation failed')
      await verifyImageUrl(j.avatar?.url)
      setEditing({ ...editing, avatar: j.avatar })
    } catch (e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  const onFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !editing.id) return
    setBusy(true); setErr(null)
    try {
      const reader = new FileReader()
      const dataUrl = await new Promise((res, rej) => { reader.onload = () => res(reader.result); reader.onerror = rej; reader.readAsDataURL(file) })
      const r = await fetch('/api/openclaw/agents/avatar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'upload', id: editing.id, dataUrl }),
      })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || 'Upload failed')
      await verifyImageUrl(j.avatar?.url)
      setEditing({ ...editing, avatar: j.avatar })
    } catch (e) { setErr(e.message) }
    finally { setBusy(false); if (fileInputRef.current) fileInputRef.current.value = '' }
  }

  const clear = async () => {
    if (!confirm('Remove avatar photo?')) return
    setBusy(true); setErr(null)
    try {
      await fetch('/api/openclaw/agents/avatar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear', id: editing.id }),
      })
      setEditing({ ...editing, avatar: null })
    } catch (e) { setErr(e.message) }
    finally { setBusy(false) }
  }

  return (
    <div style={{ padding: 18, background: 'var(--surface2, #f8fafc)', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
      <Avatar
        agent={editing}
        size={96}
        accent={accent}
        accentText={accentText}
        onImageError={() => {
          setErr('That avatar image could not be loaded, so the preview fell back to initials. Regenerate or upload a different image.')
          setEditing({ ...editing, avatar: null })
        }}
      />
      <div style={{ flex: 1, minWidth: 240 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Avatar Photo</div>
        <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 10 }}>
          Real photographic face — generate one from the description, or upload your own.
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={generate} disabled={busy} style={btnStyle('primary')}>{busy ? 'Working…' : (editing.avatar ? '↻ Regenerate' : '✨ Generate Photo')}</button>
          <button onClick={() => fileInputRef.current?.click()} disabled={busy} style={btnStyle('secondary')}>📤 Upload</button>
          {editing.avatar && <button onClick={clear} disabled={busy} style={btnStyle('ghost')}>Remove</button>}
          <input ref={fileInputRef} type="file" accept="image/*" onChange={onFile} style={{ display: 'none' }} />
        </div>
        <div style={{ marginTop: 12 }}>
          <FieldLabel hint="Describe what this person looks like. Avoid 'iconic' or 'stock photo' phrasing.">Avatar prompt</FieldLabel>
          <textarea style={{ ...inputStyle, minHeight: 70, resize: 'vertical', fontSize: 13.5 }}
                    value={editing.avatarPrompt || ''}
                    onChange={e => setEditing({ ...editing, avatarPrompt: e.target.value })}
                    placeholder="e.g. Photorealistic candid headshot of a woman in her 40s, focused expression, glasses, soft window light" />
        </div>
        {err && <div style={{ marginTop: 10, padding: 10, background: '#fef2f2', color: '#7f1d1d', borderRadius: 8, fontSize: 13 }}>⚠️ {err}</div>}
      </div>
    </div>
  )
}

function BrainTab({ editing, setEditing, brains, catalog, providers, tiers }) {
  const [showAll, setShowAll] = useState(false)
  const [tierFilter, setTierFilter] = useState('all')
  const [providerFilter, setProviderFilter] = useState('all')
  const [hideUnavailable, setHideUnavailable] = useState(true)

  const currentModelId = editing.brain?.modelId || ''
  const currentEntry = catalog.find(m => m.id === currentModelId)
  const savedBrainKey = editing.brain?.key || 'standard'
  const effectiveTier = currentEntry?.tier || (brains[savedBrainKey] ? savedBrainKey : 'custom')
  const currentTierMeta = effectiveTier !== 'custom' ? (tiers[effectiveTier] || {}) : null

  const pickModel = (m) => {
    setEditing({
      ...editing,
      brain: { ...editing.brain, key: m.tier, modelId: m.id, fallbacks: editing.brain?.fallbacks || [] },
    })
  }

  const pickModelId = (modelId) => {
    const selected = catalog.find(m => m.id === modelId)
    if (selected) return pickModel(selected)
    setEditing({ ...editing, brain: { ...editing.brain, key: 'custom', modelId } })
  }

  const filtered = (catalog || []).filter(m => {
    if (hideUnavailable && !m.available) return false
    if (tierFilter !== 'all' && m.tier !== tierFilter) return false
    if (providerFilter !== 'all' && m.provider !== providerFilter) return false
    return true
  })

  const grouped = {}
  for (const m of filtered) {
    if (!grouped[m.provider]) grouped[m.provider] = []
    grouped[m.provider].push(m)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <FieldLabel hint="Pick a tier to apply a sensible default — or browse the catalog to pick a specific model.">
        Brain Tier
      </FieldLabel>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
        {Object.entries(brains).map(([k, v]) => {
          const active = effectiveTier === k
          const exactDefault = currentModelId === v.primary
          const tierMeta = tiers[k] || {}
          return (
            <button key={k} onClick={() => setEditing({ ...editing, brain: { ...editing.brain, key: k, modelId: v.primary, fallbacks: v.fallbacks } })}
                    style={{
                      position: 'relative',
                      padding: 16, borderRadius: 12, border: '2px solid ' + (active ? 'var(--accent, #3b82f6)' : 'var(--border)'),
                      background: active ? 'var(--accent-soft, #dbeafe)' : 'var(--surface, #fff)',
                      color: 'var(--text)',
                      cursor: 'pointer', textAlign: 'left', minHeight: 118,
                      boxShadow: active ? '0 0 0 3px color-mix(in srgb, var(--accent, #3b82f6) 20%, transparent), inset 4px 0 0 var(--accent, #3b82f6)' : 'none',
                    }}>
              {active && (
                <span style={{ position: 'absolute', top: 10, right: 10, fontSize: 11, fontWeight: 800, color: 'var(--accent)', background: 'var(--surface)', border: '1px solid var(--accent)', borderRadius: 999, padding: '3px 8px' }}>
                  {exactDefault ? 'ACTIVE' : 'CURRENT TIER'}
                </span>
              )}
              <div style={{ fontSize: 16, fontWeight: 700 }}>{tierMeta.emoji || ''} {v.label}</div>
              <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 4 }}>{tierMeta.desc || ''}</div>
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 6, fontFamily: 'monospace' }}>{v.primary}</div>
              {active && !exactDefault && currentModelId && (
                <div style={{ fontSize: 11.5, color: 'var(--accent)', marginTop: 8, fontWeight: 700 }}>
                  Current model in this tier: {currentEntry?.name || currentModelId}
                </div>
              )}
            </button>
          )
        })}
      </div>

      <div style={{ marginTop: 8, padding: 14, background: 'var(--surface2, #f8fafc)', borderRadius: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Currently selected</div>
        <div style={{ fontSize: 14, fontFamily: 'monospace' }}>
          {currentModelId || <em style={{ color: 'var(--text-muted)' }}>No model picked yet — pick a tier above or browse below</em>}
        </div>
        {currentEntry && (
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 4 }}>
            {currentEntry.name} • {currentEntry.bestFor} • ${currentEntry.costIn}/M in, ${currentEntry.costOut}/M out
            {!currentEntry.available && <span style={{ color: '#92400e', fontWeight: 600 }}> • ⚠️ {providers[currentEntry.provider]?.label} credentials not detected</span>}
          </div>
        )}
        {!currentEntry && currentModelId && (
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 4 }}>
            Custom model id. It is not in the catalog, so it is shown as Custom.
          </div>
        )}
        {currentEntry && currentTierMeta && (
          <div style={{ fontSize: 12.5, color: 'var(--accent)', marginTop: 6, fontWeight: 700 }}>
            Active tier: {currentTierMeta.emoji} {currentTierMeta.label}
          </div>
        )}
      </div>

      <div>
        <FieldLabel hint="This always shows the exact live model selected for this agent.">Active model</FieldLabel>
        <ThemedSelect
          style={{ ...inputStyle, minHeight: 48, fontFamily: 'monospace' }}
          value={currentModelId}
          onChange={e => pickModelId(e.target.value)}
        >
          <option value="">Select a model...</option>
          {currentModelId && !catalog.find(m => m.id === currentModelId) && (
            <option value={currentModelId}>Custom: {currentModelId}</option>
          )}
          {catalog.map(m => (
            <option key={m.id} value={m.id}>
              {m.id} - {tiers[m.tier]?.label || m.tier}{m.available ? '' : ' - credentials missing'}
            </option>
          ))}
        </ThemedSelect>
      </div>

      <button onClick={() => setShowAll(s => !s)} style={btnStyle('ghost')}>
        {showAll ? '▴ Hide' : '▾ Browse all'} {catalog.length} models across {Object.keys(providers).length} providers
      </button>

      {showAll && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, marginRight: 4 }}>TIER</span>
            <Pill active={tierFilter === 'all'} onClick={() => setTierFilter('all')}>Any</Pill>
            {Object.entries(tiers).map(([k, t]) => <Pill key={k} active={tierFilter === k} onClick={() => setTierFilter(k)}>{t.emoji} {t.label}</Pill>)}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, marginRight: 4 }}>PROVIDER</span>
            <Pill active={providerFilter === 'all'} onClick={() => setProviderFilter('all')}>Any</Pill>
            {Object.entries(providers).map(([k, p]) => <Pill key={k} active={providerFilter === k} onClick={() => setProviderFilter(k)}>{p.emoji} {p.label}</Pill>)}
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13.5, padding: 10, background: 'var(--surface, #fff)', borderRadius: 8, cursor: 'pointer', minHeight: 44 }}>
            <input type="checkbox" checked={hideUnavailable} onChange={e => setHideUnavailable(e.target.checked)} style={{ width: 18, height: 18 }} />
            Hide models without detected credentials
          </label>

          {Object.entries(grouped).map(([prov, models]) => (
            <div key={prov}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {providers[prov]?.emoji} {providers[prov]?.label || prov}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 10 }}>
                {models.map(m => {
                  const selected = currentModelId === m.id
                  return (
                    <button key={m.id} onClick={() => pickModel(m)} style={{
                      padding: 14, borderRadius: 12,
                      border: '2px solid ' + (selected ? 'var(--accent, #3b82f6)' : 'var(--border)'),
                      background: selected ? 'var(--accent-soft, #dbeafe)' : 'var(--surface, #fff)',
                      textAlign: 'left', cursor: 'pointer', minHeight: 110, display: 'flex', flexDirection: 'column', gap: 4,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <div style={{ fontSize: 15, fontWeight: 700 }}>{m.name}</div>
                        <span style={badge(m.available ? 'blue' : 'amber')}>{m.available ? '✓ Ready' : '🔑 Add key'}</span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{m.id}</div>
                      <div style={{ fontSize: 12.5, color: 'var(--text)', marginTop: 2 }}>{m.bestFor}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 4 }}>
                        {tiers[m.tier]?.emoji} {tiers[m.tier]?.label} • ctx {m.ctx ? (m.ctx >= 1000000 ? '1M' : `${Math.round(m.ctx/1000)}k`) : '—'} • ${m.costIn}/M in • ${m.costOut}/M out
                      </div>
                      {m.notes && <div style={{ fontSize: 11.5, color: 'var(--text-muted)', fontStyle: 'italic', marginTop: 2 }}>{m.notes}</div>}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
          {!filtered.length && <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', border: '1px dashed var(--border)', borderRadius: 8 }}>No models match these filters.</div>}
        </div>
      )}

      <div>
        <FieldLabel hint="Override with any model id you want — useful for models not yet in our catalog.">Custom model id</FieldLabel>
        <input style={{ ...inputStyle, fontFamily: 'monospace' }}
               placeholder="e.g. anthropic/claude-sonnet-4-6"
               value={editing.brain?.modelId && !catalog.find(m => m.id === editing.brain.modelId) ? editing.brain.modelId : ''}
               onChange={e => setEditing({ ...editing, brain: { ...editing.brain, key: 'custom', modelId: e.target.value } })} />
      </div>
    </div>
  )
}

function PromptSyncBadge({ status }) {
  if (!status) {
    return (
      <div style={{ padding: 12, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface2, #f8fafc)', color: 'var(--text-muted)', fontSize: 13, marginBottom: 12 }}>
        Prompt Workshop sync status is loading or unavailable.
      </div>
    )
  }
  const color = PROMPT_SYNC_COLORS[status.status] || '#64748b'
  const label = PROMPT_SYNC_LABELS[status.status] || status.status || 'Unknown'
  return (
    <div style={{ padding: 12, borderRadius: 10, border: `1px solid ${color}66`, background: `${color}14`, color: 'var(--text)', fontSize: 13, marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <strong>Prompt Workshop:</strong>
        <span style={{ color, fontWeight: 800 }}>{label}</span>
        {status.hasSource && <span style={{ color: 'var(--text-muted)' }}>Source: {status.sourcePath}</span>}
      </div>
      <div style={{ color: 'var(--text-muted)', marginTop: 4 }}>
        Direct edits here change the live agent prompt. Prompt Workshop tracks whether the managed source still matches.
      </div>
    </div>
  )
}

function JobTab({ editing, setEditing, promptSyncStatus }) {
  return (
    <div>
      <PromptSyncBadge status={promptSyncStatus} />
      <FieldLabel hint="The instructions this agent reads at the start of every conversation. Plain English — describe what they do, how they should act, what they must always do or never do.">
        Job Description
      </FieldLabel>
      <textarea style={{ ...inputStyle, minHeight: 280, resize: 'vertical', fontFamily: 'inherit' }}
                value={editing.jobDescription || ''}
                onChange={e => setEditing({ ...editing, jobDescription: e.target.value })} />
    </div>
  )
}

function listFromText(value) {
  return String(value || '').split('\n').map(v => v.trim()).filter(Boolean)
}

function textFromList(value) {
  return Array.isArray(value) ? value.join('\n') : ''
}

function inferCapabilityFromBrief(brief) {
  const text = String(brief || '').toLowerCase()
  let template = CAPABILITY_TEMPLATES[2]
  if (/gmail|email|inbox|forward|reply|message|mail/.test(text)) template = CAPABILITY_TEMPLATES[0]
  else if (/lead|form|website|webhook|zillow|facebook|quote|demo|prospect/.test(text)) template = CAPABILITY_TEMPLATES[1]
  else if (/stripe|payment|invoice|billing|subscription|failed/.test(text)) template = CAPABILITY_TEMPLATES[3]
  const cleaned = String(brief || '').trim().replace(/\s+/g, ' ')
  const name = cleaned
    ? cleaned.slice(0, 72).replace(/[.!?]+$/, '')
    : template.name
  return newCapability({
    ...template,
    id: undefined,
    name: name.charAt(0).toUpperCase() + name.slice(1),
    notes: cleaned ? `Drafted from wizard brief: ${cleaned}` : template.notes,
  })
}

function CapabilitiesTab({ editing, setEditing }) {
  const labs = editing.labs || {}
  const capabilities = Array.isArray(labs.capabilities) ? labs.capabilities : []
  const [selectedId, setSelectedId] = useState(capabilities[0]?.id || '')
  const [wizardBrief, setWizardBrief] = useState('')
  const [requestState, setRequestState] = useState(null)
  const [registry, setRegistry] = useState(null)

  useEffect(() => {
    fetch('/api/agents/available-tools').then(r => r.json()).then(j => {
      if (j.ok) setRegistry(j)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (selectedId && capabilities.some(c => c.id === selectedId)) return
    setSelectedId(capabilities[0]?.id || '')
  }, [capabilities, selectedId])

  const setLabs = patch => setEditing({ ...editing, labs: { ...labs, ...patch } })
  const saveCapabilities = next => setLabs({ capabilities: next.map(c => ({ ...c, lastUpdated: new Date().toISOString() })) })
  const selected = capabilities.find(c => c.id === selectedId) || capabilities[0] || null
  const selectedTools = new Set(editing.tools || [])
  const selectedChannels = new Set(editing.channels || [])
  const allTools = registry?.flat || []
  const callableTools = allTools.filter(t => t.callable !== false)

  const addCapability = (cap) => {
    const next = [...capabilities, cap]
    saveCapabilities(next)
    setSelectedId(cap.id)
  }
  const addFromTemplate = template => addCapability(newCapability(template))
  const draftFromWizard = () => {
    const cap = inferCapabilityFromBrief(wizardBrief)
    addCapability(cap)
    setWizardBrief('')
  }
  const updateCapability = (id, patch) => {
    saveCapabilities(capabilities.map(c => c.id === id ? { ...c, ...patch } : c))
  }
  const removeCapability = (id) => {
    if (!confirm('Remove this capability from the agent?')) return
    const next = capabilities.filter(c => c.id !== id)
    saveCapabilities(next)
    setSelectedId(next[0]?.id || '')
  }
  const applyCapability = (cap) => {
    const tools = Array.from(new Set([...(editing.tools || []), ...(cap.tools || [])]))
    const channels = Array.from(new Set([...(editing.channels || []), ...(cap.channels || [])]))
    let schedule = editing.schedule || { mode: 'on-demand' }
    if (/schedule|daily|weekly|cron|morning|night/i.test(cap.trigger || '')) {
      schedule = schedule?.mode === 'cron' ? schedule : { mode: 'cron', cron: '0 8 * * 1-5' }
    }
    setEditing({ ...editing, tools, channels, schedule })
  }
  const requestIntegration = async () => {
    if (!selected) return
    setRequestState({ loading: true })
    try {
      const r = await fetch('/api/agent/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'create_plugin_change_request',
          args: {
            title: `Wire capability: ${selected.name}`,
            scope: `Agent capability for ${editing.name || editing.id}`,
            target: selected.integration || 'OpenClaw/FCC integration',
            details: [
              `Capability: ${selected.name}`,
              `Trigger: ${selected.trigger || 'not set'}`,
              `Actions: ${(selected.actions || []).join('; ') || 'not set'}`,
              `Tools requested: ${(selected.tools || []).join(', ') || 'not set'}`,
              `Integration review: ${selected.review?.status || 'unreviewed'} / ${selected.review?.risk || 'medium'} risk`,
              `Source: ${selected.review?.source || 'not set'}`,
              `Docs: ${selected.review?.docsUrl || 'not set'}`,
              `Scopes: ${selected.review?.scopes || 'not set'}`,
              selected.notes || '',
            ].filter(Boolean).join('\n'),
            likelyFiles: ['app/api/agent/execute/route.js', 'scripts/fcc-unified-plugin-index.ts', 'app/api/agents/available-tools/route.js'],
            acceptanceCriteria: [
              'Capability appears in the agent editor',
              'Required tools are discoverable in the tool registry',
              'Connector provenance, docs, auth model, scopes, and risk are reviewed before live use',
              'A test run can prove the trigger/action path without exposing secrets',
            ],
            risks: selected.guardrails || [],
            priority: 'high',
          },
        }),
      })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || 'Request failed')
      setRequestState({ ok: true, message: j.result?.message || 'Integration request captured.' })
    } catch (e) {
      setRequestState({ ok: false, message: e.message })
    }
  }

  const selectedCapabilityTools = selected ? (selected.tools || []) : []
  const selectedCapabilityChannels = selected ? (selected.channels || []) : []
  const review = selected?.review || {}
  const updateReview = patch => {
    if (!selected) return
    updateCapability(selected.id, { review: { ...review, ...patch } })
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 360px) minmax(0, 1fr)', gap: 16, alignItems: 'start' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ padding: 14, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface2, #f8fafc)' }}>
          <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>Capability wizard</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 10 }}>
            Describe the workflow. The wizard drafts a capability, then you can apply its tools and channels to the agent.
          </div>
          <textarea
            style={{ ...inputStyle, minHeight: 104, resize: 'vertical', fontSize: 13.5 }}
            value={wizardBrief}
            onChange={e => setWizardBrief(e.target.value)}
            placeholder="Example: When an email comes in from a client, classify it, create a task, and draft a reply for approval."
          />
          <button onClick={draftFromWizard} disabled={!wizardBrief.trim()} style={{ ...btnStyle('primary'), width: '100%', marginTop: 10 }}>
            Draft capability
          </button>
        </div>

        <div style={{ display: 'grid', gap: 8 }}>
          {capabilities.map(cap => (
            <button
              key={cap.id}
              onClick={() => setSelectedId(cap.id)}
              style={{
                padding: 12,
                borderRadius: 8,
                border: '1px solid ' + (selected?.id === cap.id ? 'var(--accent, #3b82f6)' : 'var(--border)'),
                background: selected?.id === cap.id ? 'var(--accent-soft, #dbeafe)' : 'var(--surface, #fff)',
                color: 'var(--text)',
                textAlign: 'left',
                cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 800 }}>{cap.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>{cap.trigger || 'No trigger'} · {cap.status || 'draft'}</div>
            </button>
          ))}
          {!capabilities.length && (
            <div style={{ padding: 18, borderRadius: 10, border: '1px dashed var(--border)', color: 'var(--text-muted)', textAlign: 'center', fontSize: 13 }}>
              No capabilities yet. Use the wizard or a template.
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ padding: 14, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface, #fff)' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, fontSize: 13 }}>
            <CapabilityMetric label="Capabilities" value={capabilities.length} />
            <CapabilityMetric label="Agent tools" value={(editing.tools || []).length} />
            <CapabilityMetric label="Channels" value={(editing.channels || []).length} />
            <CapabilityMetric label="Schedule" value={editing.schedule?.mode || 'on-demand'} />
          </div>
        </div>

        <div>
          <FieldLabel hint="These are common capability shapes. They create editable drafts and do not change OpenClaw until you save the agent.">Templates</FieldLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10 }}>
            {CAPABILITY_TEMPLATES.map(t => (
              <button key={t.id} onClick={() => addFromTemplate(t)} style={{ padding: 12, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface, #fff)', color: 'var(--text)', textAlign: 'left', cursor: 'pointer', minHeight: 92 }}>
                <div style={{ fontSize: 14, fontWeight: 800 }}>{t.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>{t.trigger}</div>
              </button>
            ))}
          </div>
        </div>

        {selected ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(240px, 320px)', gap: 14, alignItems: 'start' }}>
            <div style={{ padding: 16, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface, #fff)', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ fontSize: 18, fontWeight: 800 }}>Capability details</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button onClick={() => applyCapability(selected)} style={btnStyle('primary')}>Apply to agent</button>
                  <button onClick={requestIntegration} style={btnStyle('secondary')}>Request connector</button>
                  <button onClick={() => removeCapability(selected.id)} style={btnStyle('danger')}>Remove</button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                <div>
                  <FieldLabel>Name</FieldLabel>
                  <input style={inputStyle} value={selected.name || ''} onChange={e => updateCapability(selected.id, { name: e.target.value })} />
                </div>
                <div>
                  <FieldLabel>Status</FieldLabel>
                  <ThemedSelect style={inputStyle} value={selected.status || 'draft'} onChange={e => updateCapability(selected.id, { status: e.target.value })}>
                    <option value="draft">Draft</option>
                    <option value="ready">Ready</option>
                    <option value="live">Live</option>
                    <option value="needs-plugin">Needs connector</option>
                  </ThemedSelect>
                </div>
                <div>
                  <FieldLabel>Trigger</FieldLabel>
                  <input style={inputStyle} value={selected.trigger || ''} onChange={e => updateCapability(selected.id, { trigger: e.target.value })} placeholder="New email, webhook, schedule, button..." />
                </div>
                <div>
                  <FieldLabel>Integration</FieldLabel>
                  <input style={inputStyle} value={selected.integration || ''} onChange={e => updateCapability(selected.id, { integration: e.target.value })} placeholder="Gmail, Stripe, Pipedream, MCP..." />
                </div>
              </div>

              <div>
                <FieldLabel hint="One action per line. This becomes the operational checklist for the capability.">Actions</FieldLabel>
                <textarea style={{ ...inputStyle, minHeight: 110, resize: 'vertical' }} value={textFromList(selected.actions)} onChange={e => updateCapability(selected.id, { actions: listFromText(e.target.value) })} />
              </div>
              <div>
                <FieldLabel hint="One guardrail per line. Use these for approvals, safety limits, and customer-facing restrictions.">Guardrails</FieldLabel>
                <textarea style={{ ...inputStyle, minHeight: 90, resize: 'vertical' }} value={textFromList(selected.guardrails)} onChange={e => updateCapability(selected.id, { guardrails: listFromText(e.target.value) })} />
              </div>

              <div style={{ padding: 14, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface2, #f8fafc)' }}>
                <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 10 }}>Integration review</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10 }}>
                  <div>
                    <FieldLabel>Review status</FieldLabel>
                    <ThemedSelect style={inputStyle} value={review.status || 'unreviewed'} onChange={e => updateReview({ status: e.target.value })}>
                      <option value="unreviewed">Unreviewed</option>
                      <option value="researching">Researching</option>
                      <option value="approved">Approved</option>
                      <option value="restricted">Restricted</option>
                      <option value="rejected">Rejected</option>
                    </ThemedSelect>
                  </div>
                  <div>
                    <FieldLabel>Risk</FieldLabel>
                    <ThemedSelect style={inputStyle} value={review.risk || 'medium'} onChange={e => updateReview({ risk: e.target.value })}>
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="critical">Critical</option>
                    </ThemedSelect>
                  </div>
                  <div>
                    <FieldLabel>Source / publisher</FieldLabel>
                    <input style={inputStyle} value={review.source || ''} onChange={e => updateReview({ source: e.target.value })} placeholder="Official vendor, trusted registry, internal..." />
                  </div>
                  <div>
                    <FieldLabel>Docs URL</FieldLabel>
                    <input style={inputStyle} value={review.docsUrl || ''} onChange={e => updateReview({ docsUrl: e.target.value })} placeholder="https://..." />
                  </div>
                  <div>
                    <FieldLabel>Auth model</FieldLabel>
                    <input style={inputStyle} value={review.authModel || ''} onChange={e => updateReview({ authModel: e.target.value })} placeholder="OAuth, API key, service account..." />
                  </div>
                  <div>
                    <FieldLabel>Scopes / data access</FieldLabel>
                    <input style={inputStyle} value={review.scopes || ''} onChange={e => updateReview({ scopes: e.target.value })} placeholder="Read inbox, send email, read calendar..." />
                  </div>
                </div>
                <textarea
                  style={{ ...inputStyle, minHeight: 78, resize: 'vertical', marginTop: 10 }}
                  value={review.notes || ''}
                  onChange={e => updateReview({ notes: e.target.value })}
                  placeholder="Reputation notes, maintenance history, security concerns, approval limits, or why this connector is trusted."
                />
              </div>

              <div>
                <FieldLabel>Notes</FieldLabel>
                <textarea style={{ ...inputStyle, minHeight: 90, resize: 'vertical' }} value={selected.notes || ''} onChange={e => updateCapability(selected.id, { notes: e.target.value })} />
              </div>

              {requestState && (
                <div style={{ padding: 10, borderRadius: 8, border: '1px solid var(--border)', background: requestState.ok ? 'var(--green-soft, #ecfdf5)' : 'var(--amber-soft, #fef3c7)', fontSize: 13 }}>
                  {requestState.loading ? 'Capturing integration request...' : requestState.message}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ padding: 14, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface2, #f8fafc)' }}>
                <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 10 }}>Association map</div>
                <AssociationRow label="Trigger" value={selected.trigger || 'On demand'} />
                <AssociationRow label="Integration" value={selected.integration || 'Not selected'} />
                <AssociationRow label="Agent" value={editing.name || editing.id} />
                <AssociationRow label="Approval" value={selected.approval || 'manual'} />
                <AssociationRow label="Review" value={`${review.status || 'unreviewed'} / ${review.risk || 'medium'} risk`} />
                <AssociationRow label="Tools" value={`${selectedCapabilityTools.length} capability / ${selectedTools.size} agent`} />
              </div>

              <CapabilityPicker
                title="Channels"
                values={CHANNEL_OPTIONS.map(c => ({ name: c.id, label: c.label }))}
                selected={new Set(selected.channels || [])}
                inherited={selectedChannels}
                onToggle={name => {
                  const next = new Set(selected.channels || [])
                  next.has(name) ? next.delete(name) : next.add(name)
                  updateCapability(selected.id, { channels: Array.from(next) })
                }}
              />

              <CapabilityPicker
                title="Tools"
                values={callableTools.map(t => ({ name: t.name, label: t.name, title: t.description || '' })).slice(0, 120)}
                selected={new Set(selected.tools || [])}
                inherited={selectedTools}
                onToggle={name => {
                  const next = new Set(selected.tools || [])
                  next.has(name) ? next.delete(name) : next.add(name)
                  updateCapability(selected.id, { tools: Array.from(next) })
                }}
              />

              <div style={{ padding: 14, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface, #fff)' }}>
                <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 8 }}>Integration pool</div>
                <div style={{ display: 'grid', gap: 8 }}>
                  {CONNECTOR_POOL.map(p => (
                    <button
                      key={p.id}
                      onClick={() => updateCapability(selected.id, { integration: p.name, review: { ...review, source: p.publisher || p.name, status: 'researching', notes: p.fit } })}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '34px minmax(0, 1fr)',
                        gap: 10,
                        alignItems: 'center',
                        padding: 10,
                        minHeight: 66,
                        borderRadius: 8,
                        border: '1px solid ' + (selected.integration === p.name ? 'var(--accent, #3b82f6)' : 'var(--border)'),
                        background: selected.integration === p.name ? 'var(--accent-soft, #dbeafe)' : 'var(--surface2, #f8fafc)',
                        color: 'var(--text)',
                        textAlign: 'left',
                        cursor: 'pointer',
                      }}
                    >
                      <ConnectorMark connector={p} size={34} />
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 13, fontWeight: 800 }}>{p.name}</span>
                        <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{p.publisher}</span>
                        <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-muted)', marginTop: 3, lineHeight: 1.35 }}>{p.fit}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ padding: 14, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface, #fff)' }}>
                <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>Quick connector logos</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.4 }}>
                  Common services get their brand mark when available, with initials as the fallback.
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(74px, 1fr))', gap: 8 }}>
                  {QUICK_CONNECTORS.map(connector => (
                    <button
                      key={connector.id}
                      onClick={() => updateCapability(selected.id, {
                        integration: connector.name,
                        review: { ...review, source: connector.name, status: 'researching', notes: `Connector requested for ${connector.name}. Verify official docs, auth model, scopes, and lab behavior before live use.` },
                      })}
                      title={`Use ${connector.name}`}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        minHeight: 76,
                        padding: 8,
                        borderRadius: 8,
                        border: '1px solid ' + (selected.integration === connector.name ? 'var(--accent, #3b82f6)' : 'var(--border)'),
                        background: selected.integration === connector.name ? 'var(--accent-soft, #dbeafe)' : 'var(--surface2, #f8fafc)',
                        color: 'var(--text)',
                        cursor: 'pointer',
                      }}
                    >
                      <ConnectorMark connector={connector} size={30} />
                      <span style={{ fontSize: 10.5, fontWeight: 700, lineHeight: 1.15, textAlign: 'center' }}>{connector.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ padding: 14, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface, #fff)' }}>
                <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 8 }}>Connector acceptance</div>
                {[
                  'Prefer official vendor MCP server or documented vendor API.',
                  'Verify publisher, repository, docs, license, and maintenance activity.',
                  'Use least-privilege OAuth scopes and store secrets outside prompts.',
                  'Test in the lab before live customer data.',
                  'Log every automated action and require approval for destructive/customer-facing work.',
                ].map(item => (
                  <div key={item} style={{ display: 'flex', gap: 8, fontSize: 12.5, color: 'var(--text)', marginBottom: 6 }}>
                    <span style={{ color: 'var(--green, #16a34a)', fontWeight: 800 }}>check</span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function ConnectorMark({ connector, size = 32 }) {
  const [logoFailed, setLogoFailed] = useState(false)
  const accent = connector.accent || '#2563eb'
  const showLogo = connector.logoUrl && !logoFailed

  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        minWidth: size,
        borderRadius: 8,
        border: '1px solid var(--border)',
        background: showLogo ? '#fff' : `${accent}1A`,
        color: accent,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        fontSize: Math.max(9, Math.floor(size * 0.32)),
        fontWeight: 800,
        lineHeight: 1,
      }}
    >
      {showLogo ? (
        <img
          src={connector.logoUrl}
          alt=""
          loading="lazy"
          onError={() => setLogoFailed(true)}
          style={{ width: Math.floor(size * 0.68), height: Math.floor(size * 0.68), objectFit: 'contain' }}
        />
      ) : (
        <span>{connector.mark || connector.name?.slice(0, 2).toUpperCase()}</span>
      )}
    </span>
  )
}

function CapabilityMetric({ label, value }) {
  return (
    <div style={{ padding: 10, borderRadius: 8, background: 'var(--surface2, #f8fafc)', border: '1px solid var(--border)' }}>
      <div style={{ fontSize: 11.5, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 800, marginTop: 2 }}>{value}</div>
    </div>
  )
}

function AssociationRow({ label, value }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '82px 1fr', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ fontSize: 11.5, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, overflowWrap: 'anywhere' }}>{value}</div>
    </div>
  )
}

function CapabilityPicker({ title, values, selected, inherited, onToggle }) {
  const [q, setQ] = useState('')
  const filtered = values.filter(v => {
    const text = `${v.name} ${v.label || ''} ${v.title || ''}`.toLowerCase()
    return !q.trim() || text.includes(q.trim().toLowerCase())
  })
  return (
    <div style={{ padding: 14, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface, #fff)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 800 }}>{title}</div>
        <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{selected.size} selected</div>
      </div>
      {values.length > 10 && (
        <input style={{ ...inputStyle, minHeight: 36, padding: '7px 9px', fontSize: 12.5, marginBottom: 8 }} value={q} onChange={e => setQ(e.target.value)} placeholder={`Find ${title.toLowerCase()}...`} />
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: title === 'Tools' ? 250 : 'none', overflow: 'auto' }}>
        {filtered.map(v => {
          const active = selected.has(v.name)
          const alreadyOnAgent = inherited.has(v.name)
          return (
            <button
              key={v.name}
              onClick={() => onToggle(v.name)}
              title={v.title || v.label || v.name}
              style={{
                padding: '7px 9px',
                borderRadius: 8,
                border: '1px solid ' + (active ? 'var(--accent, #3b82f6)' : alreadyOnAgent ? 'var(--green, #22c55e)' : 'var(--border)'),
                background: active ? 'var(--accent, #3b82f6)' : alreadyOnAgent ? 'var(--green-soft, #ecfdf5)' : 'var(--surface2, #f8fafc)',
                color: active ? 'var(--accent-text, #fff)' : 'var(--text)',
                cursor: 'pointer',
                fontSize: 12,
                fontFamily: title === 'Tools' ? 'monospace' : 'inherit',
              }}
            >
              {active ? 'selected ' : alreadyOnAgent ? 'agent ' : ''}{v.label || v.name}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function ToolsTabOld({ editing, setEditing }) {
  const sel = new Set(editing.tools || [])
  const toggle = (t) => {
    const next = new Set(sel)
    if (next.has(t)) next.delete(t); else next.add(t)
    setEditing({ ...editing, tools: Array.from(next) })
  }
  const [registry, setRegistry] = useState(null)
  const [regError, setRegError] = useState(null)
  useEffect(() => {
    fetch('/api/agents/available-tools').then(r => r.json()).then(j => {
      if (j.ok) setRegistry(j); else setRegError(j.error || 'Failed to load tool registry')
    }).catch(e => setRegError(e.message))
  }, [])

  if (regError) {
    return <div style={{ padding: 20, color: 'var(--red)', fontSize: 14 }}>Could not load tool registry: {regError}</div>
  }
  if (!registry) {
    return <div style={{ padding: 20, color: 'var(--text-muted)', fontSize: 14 }}>Loading live tool registry…</div>
  }

  const ocOk = registry.sources?.openclaw?.ok
  const ocReason = registry.sources?.openclaw?.reason
  const knownNames = new Set(registry.flat.map(t => t.name))
  const stale = (editing.tools || []).filter(t => !knownNames.has(t))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <FieldLabel hint="Toggle a tool to grant or revoke it. Every tool below is REAL — toggling on/off actually gates the function at runtime via OpenClaw's allowlist.">What this agent can do</FieldLabel>

      {/* Source-availability banner — honesty about what we could see */}
      <div style={{
        padding: '10px 14px', borderRadius: 10, fontSize: 12, lineHeight: 1.5,
        background: ocOk ? 'var(--green-soft, #ecfdf5)' : 'var(--amber-soft, #fef3c7)',
        color: 'var(--text)', border: '1px solid ' + (ocOk ? 'var(--green, #22c55e)' : 'var(--amber, #f59e0b)'),
      }}>
        <strong>{registry.counts.callable}</strong> callable tools{registry.counts.vocabulary ? <> + <strong>{registry.counts.vocabulary}</strong> fcc_call sub-tools</> : null}.{' '}
        {ocOk
          ? 'Global OpenClaw tool registry reachable (live). This does not override a DeerFlow-only agent runtime.'
          : <>OpenClaw config <strong>unreachable</strong> — only FCC plugin shown.{ocReason ? ' (' + ocReason + ')' : ''}</>}
      </div>

      {Object.entries(registry.groups).map(([category, tools]) => (
        <div key={category}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>{category}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {tools.map(t => (
              <button key={t.name} onClick={() => toggle(t.name)}
                title={(t.description ? t.description + '\n' : '') + 'Source: ' + t.sources.join(', ')}
                style={{
                  padding: '8px 12px', borderRadius: 8, border: '1px solid ' + (sel.has(t.name) ? 'var(--accent, #3b82f6)' : 'var(--border)'),
                  background: sel.has(t.name) ? 'var(--accent, #3b82f6)' : 'var(--surface, #fff)',
                  color: sel.has(t.name) ? 'var(--accent-text, #fff)' : 'var(--text)',
                  fontSize: 13, fontFamily: 'monospace', cursor: 'pointer', minHeight: 36,
                }}>{sel.has(t.name) ? '✓ ' : ''}{t.name}</button>
            ))}
          </div>
        </div>
      ))}

      {/* Vocabulary section — names usable as fcc_call({ tool: ... }), not toggleable */}
      {registry.vocabulary && registry.vocabulary.length > 0 && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            fcc_call sub-tools — vocabulary, not toggleable
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
            These names are passed as the <code>tool</code> argument to <code>fcc_call</code>. The agent only needs <code>fcc_call</code> enabled above — gating happens at the <code>fcc_call</code> level. Listed here so you can mention them in the prompt.
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {registry.vocabulary.map(t => (
              <span key={t.name}
                title={t.description || ''}
                style={{
                  padding: '6px 10px', borderRadius: 8, border: '1px dashed var(--border)',
                  background: 'transparent', color: 'var(--text-muted)',
                  fontSize: 12, fontFamily: 'monospace',
                }}>{t.name}</span>
            ))}
          </div>
        </div>
      )}

      {/* Stale entries — agent has them but no source backs them */}
      {stale.length > 0 && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              ⚠ Not in any registry — won't work at runtime ({stale.length})
            </div>
            <button
              onClick={() => {
                if (!confirm(`Remove all ${stale.length} stale tool entries from this agent?`)) return
                const cleaned = (editing.tools || []).filter(t => knownNames.has(t))
                setEditing({ ...editing, tools: cleaned })
              }}
              title="Strips every tool that isn't registered anywhere. You still need to click Save to commit."
              style={{
                padding: '6px 12px', borderRadius: 8, border: '1px solid var(--red)',
                background: 'var(--red-soft, #fee2e2)', color: 'var(--red)', fontSize: 12, fontWeight: 600,
                cursor: 'pointer', minHeight: 32,
              }}>🧹 Clean up all stale</button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {stale.map(t => (
              <button key={t} onClick={() => toggle(t)}
                title="This tool name isn't registered in OpenClaw, the FCC plugin, or any CRM route. Click to remove."
                style={{
                  padding: '8px 12px', borderRadius: 8, border: '1px dashed var(--red)',
                  background: 'var(--red-soft, #fee2e2)', color: 'var(--red)', fontSize: 13, fontFamily: 'monospace',
                  cursor: 'pointer', minHeight: 36,
                }}>✕ {t}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ToolsTab({ editing, setEditing }) {
  const sel = new Set(editing.tools || [])
  const [registry, setRegistry] = useState(null)
  const [regError, setRegError] = useState(null)
  const [filters, setFilters] = useState({
    q: '',
    category: 'all',
    department: 'all',
    source: 'all',
    type: 'callable',
    stale: 'hide',
  })

  useEffect(() => {
    fetch('/api/agents/available-tools').then(r => r.json()).then(j => {
      if (j.ok) setRegistry(j)
      else setRegError(j.error || 'Failed to load tool registry')
    }).catch(e => setRegError(e.message))
  }, [])

  const toggle = (name) => {
    const next = new Set(sel)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    setEditing({ ...editing, tools: Array.from(next) })
  }
  const patchFilter = patch => setFilters(f => ({ ...f, ...patch }))
  const departmentFor = (tool) => {
    const n = tool.name || ''
    if (/mindstudio|workflow|automation/i.test(n)) return 'AI Workflow'
    if (/account|contact|client|lead|opportunit|pipeline|search/i.test(n)) return 'Sales CRM'
    if (/email|calendar|nylas|task|note|activity/i.test(n)) return 'Comms'
    if (/invoice|payment|billing|price|subscription|license|product/i.test(n)) return 'Billing'
    if (/domain|credential|security|repo|deploy|openclaw|plugin/i.test(n)) return 'Ops'
    if (/voice|call|tts|stt|sms|phone/i.test(n)) return 'Voice'
    if (/document|signature|media|image/i.test(n)) return 'Creative'
    return 'General'
  }

  if (regError) return <div style={{ padding: 20, color: 'var(--red)', fontSize: 14 }}>Could not load tool registry: {regError}</div>
  if (!registry) return <div style={{ padding: 20, color: 'var(--text-muted)', fontSize: 14 }}>Loading live tool registry...</div>

  const runtimeProvider = editing.runtimeProvider || 'openclaw-hetzner'
  const runtimeLabel = runtimeProvider === 'deerflow-hetzner'
    ? 'DeerFlow'
    : runtimeProvider === 'hermes-hetzner'
      ? 'Hermes'
      : runtimeProvider === 'deepseek-harness-local'
        ? 'DeepSeek Harness'
        : 'OpenClaw'
  const toolMatchesRuntime = (tool) => {
    if (tool.stale) return true
    const runtimes = Array.isArray(tool.runtimeProviders) && tool.runtimeProviders.length
      ? tool.runtimeProviders
      : [tool.source === 'deerflow-readonly' || /^deerflow_/.test(tool.name || '') ? 'deerflow-hetzner' : 'openclaw-hetzner']
    return runtimes.includes(runtimeProvider)
  }
  const knownNames = new Set((registry.flat || []).map(t => t.name))
  const staleNames = (editing.tools || []).filter(t => !knownNames.has(t))
  const rows = [
    ...(registry.flat || []).map(t => ({ ...t, stale: false, department: departmentFor(t), sources: t.sources || [t.source].filter(Boolean) })),
    ...staleNames.map(name => ({ name, description: '', source: 'stale', sources: ['stale'], callable: false, category: 'Stale', department: 'Unknown', stale: true })),
  ].filter(toolMatchesRuntime)
  const filteredRows = rows.filter(t => {
    const q = filters.q.trim().toLowerCase()
    if (filters.stale === 'hide' && t.stale) return false
    if (filters.stale === 'only' && !t.stale) return false
    if (filters.category !== 'all' && t.category !== filters.category) return false
    if (filters.department !== 'all' && t.department !== filters.department) return false
    if (filters.source !== 'all' && !(t.sources || []).includes(filters.source)) return false
    if (filters.type === 'callable' && t.callable === false) return false
    if (filters.type === 'vocabulary' && t.callable !== false) return false
    if (q && !`${t.name} ${t.description || ''} ${t.department || ''} ${t.category || ''}`.toLowerCase().includes(q)) return false
    return true
  })
  const callableRows = filteredRows.filter(t => t.callable !== false && !t.stale)
  const vocabularyRows = filteredRows.filter(t => t.callable === false && !t.stale)
  const staleRows = filteredRows.filter(t => t.stale)
  const grouped = callableRows.reduce((acc, t) => {
    const key = t.category || 'Other / Plugin'
    if (!acc[key]) acc[key] = []
    acc[key].push(t)
    return acc
  }, {})
  const options = {
    categories: Array.from(new Set(rows.map(t => t.category).filter(Boolean))).sort(),
    departments: Array.from(new Set(rows.map(t => t.department).filter(Boolean))).sort(),
    sources: Array.from(new Set(rows.flatMap(t => t.sources || []).filter(Boolean))).sort(),
  }
  const ocOk = registry.sources?.openclaw?.ok
  const ocReason = registry.sources?.openclaw?.reason

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <FieldLabel hint="Toggle a tool to grant or revoke it. The filters keep the profile usable as the tool list grows.">What this agent can do</FieldLabel>
      <div style={{
        padding: '10px 14px', borderRadius: 10, fontSize: 12, lineHeight: 1.5,
        background: ocOk ? 'var(--green-soft, #ecfdf5)' : 'var(--amber-soft, #fef3c7)',
        color: 'var(--text)', border: '1px solid ' + (ocOk ? 'var(--green, #22c55e)' : 'var(--amber, #f59e0b)'),
      }}>
        <strong>{registry.counts.callable}</strong> callable tools{registry.counts.vocabulary ? <> + <strong>{registry.counts.vocabulary}</strong> fcc_call sub-tools</> : null}.{' '}
        Showing <strong>{runtimeLabel}</strong> runtime tools for this agent.{' '}
        {ocOk ? 'Global OpenClaw tool registry reachable (live). This does not override a DeerFlow-only agent runtime.' : <>OpenClaw config <strong>unreachable</strong>{ocReason ? ' (' + ocReason + ')' : ''}</>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, padding: 12, borderRadius: 10, background: 'var(--surface2, #f8fafc)', border: '1px solid var(--border)' }}>
        <div style={{ minWidth: 220 }}>
          <FieldLabel hint="Search name, description, department, or category.">Search</FieldLabel>
          <input style={{ ...inputStyle, minHeight: 40, padding: '8px 10px', fontSize: 13 }} value={filters.q} onChange={e => patchFilter({ q: e.target.value })} placeholder="find a tool..." />
        </div>
        <ToolFilterSelect label="Category" value={filters.category} onChange={v => patchFilter({ category: v })} options={options.categories} allLabel="All categories" />
        <ToolFilterSelect label="Department" value={filters.department} onChange={v => patchFilter({ department: v })} options={options.departments} allLabel="All departments" />
        <ToolFilterSelect label="Source" value={filters.source} onChange={v => patchFilter({ source: v })} options={options.sources} allLabel="All sources" />
        <div>
          <FieldLabel hint="Callable tools can be toggled. Vocabulary tools are used through fcc_call.">Type</FieldLabel>
          <ThemedSelect style={{ ...inputStyle, minHeight: 40, padding: '8px 10px', fontSize: 13 }} value={filters.type} onChange={e => patchFilter({ type: e.target.value })}>
            <option value="callable">Callable</option>
            <option value="vocabulary">Vocabulary</option>
            <option value="all">All types</option>
          </ThemedSelect>
        </div>
        <div>
          <FieldLabel hint="Stale tools are selected on the agent but missing from every registry.">Stale</FieldLabel>
          <ThemedSelect style={{ ...inputStyle, minHeight: 40, padding: '8px 10px', fontSize: 13 }} value={filters.stale} onChange={e => patchFilter({ stale: e.target.value })}>
            <option value="hide">Hide stale</option>
            <option value="include">Include stale</option>
            <option value="only">Only stale</option>
          </ThemedSelect>
        </div>
        <div style={{ gridColumn: '1 / -1', fontSize: 12, color: 'var(--text-muted)' }}>
          Showing <strong>{filteredRows.length}</strong> tools. Selected on this agent: <strong>{sel.size}</strong>.
        </div>
      </div>

      {runtimeProvider === 'hermes-hetzner' && callableRows.length === 0 && (
        <div style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text-muted)', fontSize: 13 }}>
          Hermes is visible for agent planning, but no Hermes chat/tools are wired yet.
        </div>
      )}

      {Object.entries(grouped).map(([category, tools]) => (
        <div key={category}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>{category}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {tools.map(t => (
              <button key={t.name} onClick={() => toggle(t.name)}
                title={(t.description ? t.description + '\n' : '') + 'Department: ' + t.department + '\nSource: ' + (t.sources || []).join(', ')}
                style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid ' + (sel.has(t.name) ? 'var(--accent, #3b82f6)' : 'var(--border)'), background: sel.has(t.name) ? 'var(--accent, #3b82f6)' : 'var(--surface, #fff)', color: sel.has(t.name) ? 'var(--accent-text, #fff)' : 'var(--text)', fontSize: 13, fontFamily: 'monospace', cursor: 'pointer', minHeight: 36 }}>
                {sel.has(t.name) ? 'selected ' : ''}{t.name}
              </button>
            ))}
          </div>
        </div>
      ))}

      {vocabularyRows.length > 0 && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>fcc_call sub-tools</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>These are vocabulary for fcc_call, not direct toggles.</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {vocabularyRows.map(t => <span key={t.name} title={t.description || ''} style={{ padding: '6px 10px', borderRadius: 8, border: '1px dashed var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: 12, fontFamily: 'monospace' }}>{t.name}</span>)}
          </div>
        </div>
      )}

      {staleRows.length > 0 && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--red)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Not in any registry ({staleRows.length})</div>
            <button onClick={() => { if (confirm(`Remove all ${staleNames.length} stale tool entries from this agent?`)) setEditing({ ...editing, tools: (editing.tools || []).filter(t => knownNames.has(t)) }) }} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--red)', background: 'var(--red-soft, #fee2e2)', color: 'var(--red)', fontSize: 12, fontWeight: 600, cursor: 'pointer', minHeight: 32 }}>Clean up all stale</button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {staleRows.map(t => <button key={t.name} onClick={() => toggle(t.name)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px dashed var(--red)', background: 'var(--red-soft, #fee2e2)', color: 'var(--red)', fontSize: 13, fontFamily: 'monospace', cursor: 'pointer', minHeight: 36 }}>remove {t.name}</button>)}
          </div>
        </div>
      )}

      {filteredRows.length === 0 && <div style={{ padding: 18, textAlign: 'center', border: '1px dashed var(--border)', borderRadius: 10, color: 'var(--text-muted)', fontSize: 13 }}>No tools match the current filters.</div>}
    </div>
  )
}

function ToolFilterSelect({ label, value, onChange, options, allLabel }) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <ThemedSelect style={{ ...inputStyle, minHeight: 40, padding: '8px 10px', fontSize: 13 }} value={value} onChange={e => onChange(e.target.value)}>
        <option value="all">{allLabel}</option>
        {options.map(v => <option key={v} value={v}>{v}</option>)}
      </ThemedSelect>
    </div>
  )
}

function LabsTab({ editing, setEditing, elSyncStatus, onStartVoiceTest }) {
  const voice = editing.voice || { provider: 'elevenlabs' }
  const labs = editing.labs || {}
  const imageGeneration = normalizeImageGenerationPreference(editing.imageGeneration || {})
  const imageProvider = imageGenerationProviderOption(imageGeneration.provider)
  const [chirpGenderFilter, setChirpGenderFilter] = useState('all')
  const productionVoiceLocked = ['main', 'coding'].includes(editing.id)
  const deerFlowRuntime = editing.runtimeProvider === 'deerflow-hetzner'
  const setVoice = patch => setEditing({ ...editing, voice: { ...voice, ...patch } })
  const setLabs = patch => setEditing({ ...editing, labs: { ...labs, ...patch } })
  const setImageGeneration = patch => setEditing({ ...editing, imageGeneration: normalizeImageGenerationPreference({ ...imageGeneration, ...patch }) })
  const openAiReady = voice.provider === 'openai'
  const geminiReady = voice.provider === 'gemini'
  const chirpReady = voice.provider === 'chirp3'
  const chirpVoiceOptions = chirpVoicesByGender(chirpGenderFilter)
  useEffect(() => {
    if (!deerFlowRuntime || voice.provider === 'chirp3') return
    setVoice({
      provider: 'chirp3',
      chirp3Model: CHIRP3_MODEL,
      chirp3Voice: voice.chirp3Voice || CHIRP3_VOICES[0],
      chirp3VoiceAlias: voice.chirp3VoiceAlias || chirpShortName(voice.chirp3Voice || CHIRP3_VOICES[0]),
    })
  }, [deerFlowRuntime, voice.provider])
  useEffect(() => {
    if (!chirpReady) return
    if (chirpVoiceOptions.length && !chirpVoiceOptions.includes(voice.chirp3Voice || CHIRP3_VOICES[0])) {
      setVoice({ chirp3Voice: chirpVoiceOptions[0], chirp3VoiceAlias: chirpShortName(chirpVoiceOptions[0]) })
    }
  }, [chirpReady, chirpGenderFilter])
  const elevenReady = !openAiReady && !geminiReady && !chirpReady
  const elevenBound = !!elSyncStatus?.hasBinding
  const voiceRuntimeLocked = productionVoiceLocked || elevenBound
  const voiceRuntimeLockReason = productionVoiceLocked
    ? 'Production phone agents keep their ElevenLabs voice binding.'
    : elevenBound
      ? 'This agent has an ElevenLabs ConvAI binding. OpenAI, Gemini, or Chirp voice experiments need a separate experimental profile so ConvAI prompt, flows, actions, and events are not confused with the production voice agent.'
      : ''
  const publicBase = 'https://crm.company.example.com'
  const agentId = encodeURIComponent(editing.id || 'agent')
  const widgetUrl = `${publicBase}/agent-widget?agent=${agentId}&theme=${encodeURIComponent(labs.embedTheme || 'light')}`
  const scriptSnippet = `<script async src="${publicBase}/api/agent-widget.js?agent=${agentId}" data-agent="${editing.id || 'agent'}" data-theme="${labs.embedTheme || 'light'}" data-style="${labs.embedStyle || 'floating'}"></script>`
  const iframeSnippet = `<iframe src="${widgetUrl}" title="${editing.name || 'AI Agent'}" style="width:100%;height:660px;border:0;border-radius:18px;overflow:hidden"></iframe>`
  const buttonSnippet = `<a href="${widgetUrl}" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;gap:8px;padding:12px 16px;border-radius:10px;background:#111827;color:#fff;text-decoration:none;font-weight:700">Talk to ${editing.name || 'our AI agent'}</a>`
  const selectedSnippet = labs.embedStyle === 'iframe' ? iframeSnippet : labs.embedStyle === 'button' ? buttonSnippet : scriptSnippet
  const startVoiceTest = () => {
    if (typeof onStartVoiceTest === 'function') return onStartVoiceTest()
    if (typeof window === 'undefined') return
    window.dispatchEvent(new CustomEvent('fcc:start-voice-agent', {
      detail: { agentId: editing.id, name: editing.name },
    }))
  }
  const [mindStudioTest, setMindStudioTest] = useState(null)
  const mindstudioFlows = Array.isArray(labs.mindstudioFlows) ? labs.mindstudioFlows : []
  const saveMindStudioFlow = (index, patch) => {
    const flows = [...mindstudioFlows]
    const current = flows[index] || { id: '', name: '', appId: '', workflow: '', description: '', variablesJson: '{}' }
    const next = { ...current, ...patch }
    if (!next.id && next.name) {
      next.id = next.name.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80)
    }
    flows[index] = next
    setLabs({ mindstudioFlows: flows })
  }
  const addMindStudioFlow = () => {
    setLabs({
      mindstudioFlows: [
        ...mindstudioFlows,
        {
          id: `mindstudio-${Date.now().toString(36)}`,
          name: 'New MindStudio Flow',
          appId: '',
          workflow: '',
          description: '',
          variablesJson: '{\n  "topic": "demo"\n}',
        },
      ],
    })
  }
  const removeMindStudioFlow = (index) => {
    setLabs({ mindstudioFlows: mindstudioFlows.filter((_, i) => i !== index) })
  }
  const runMindStudioTest = async (flow) => {
    setMindStudioTest({ flowId: flow.id, loading: true })
    try {
      const r = await fetch('/api/mindstudio/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: editing.id, flowId: flow.id, includeBillingCost: true }),
      })
      const j = await r.json()
      if (!r.ok || j.ok === false) throw new Error(j.error || 'MindStudio run failed')
      setMindStudioTest({ flowId: flow.id, ok: true, message: JSON.stringify(j.result ?? j, null, 2).slice(0, 900) })
    } catch (e) {
      setMindStudioTest({ flowId: flow.id, ok: false, message: e.message })
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ padding: 14, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface2, #f8fafc)', color: 'var(--text)' }}>
        <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 4 }}>Agent-specific demo experiments</div>
        <div style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          These settings travel with this agent as notes and demo preferences. Use the top-level Agent Lab for broader one-off experiments and comparisons.
        </div>
      </div>

      <div style={{
        padding: 18,
        borderRadius: 12,
        border: '1px solid var(--border)',
        background: 'var(--surface, #fff)',
        color: 'var(--text)',
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, alignItems: 'end' }}>
          <div>
            <FieldLabel hint="Used when this agent calls generate_image without naming a provider.">
              Image provider
            </FieldLabel>
            <ThemedSelect
              style={inputStyle}
              value={imageGeneration.provider}
              onChange={e => {
                const provider = e.target.value
                const option = imageGenerationProviderOption(provider)
                setImageGeneration({ provider, model: option.model })
              }}
            >
              {IMAGE_GENERATION_PROVIDER_OPTIONS.map(option => (
                <option key={option.id} value={option.id}>{option.label}</option>
              ))}
            </ThemedSelect>
          </div>
          <div>
            <FieldLabel hint="Provider model recorded with the agent profile.">
              Image model
            </FieldLabel>
            <input
              style={inputStyle}
              value={imageGeneration.model || imageProvider.model}
              onChange={e => setImageGeneration({ model: e.target.value })}
              placeholder={imageProvider.model}
            />
          </div>
        </div>
        <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.45 }}>
          {imageProvider.detail}
        </div>
      </div>

      <div style={{
        padding: 18,
        borderRadius: 12,
        border: '2px solid var(--accent, #3b82f6)',
        background: 'var(--accent-soft, #dbeafe)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 14,
        flexWrap: 'wrap',
      }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>Live voice test</div>
          <div style={{ fontSize: 13.5, color: 'var(--text-muted)', marginTop: 4 }}>
            Starts a real microphone session with {editing.name || 'this agent'} using the selected voice engine.
          </div>
        </div>
        <button
          onClick={startVoiceTest}
          style={{ ...btnStyle('primary'), minHeight: 48, padding: '0 18px', fontSize: 15 }}
          title={`Start live voice session with ${editing.name || 'this agent'}`}
        >
          Start
        </button>
      </div>

      <div>
        <FieldLabel hint="Labs is for demo experiments: compare voice engines and model capabilities without disturbing production phone agents.">
          Voice engine
        </FieldLabel>
        {elevenBound && (
          <div style={{ padding: 12, borderRadius: 10, border: '1px solid #f59e0b', background: 'rgba(245, 158, 11, 0.12)', color: 'var(--text)', marginBottom: 10 }}>
            <div style={{ fontSize: 13.5, fontWeight: 800 }}>ElevenLabs ConvAI binding detected</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 4 }}>
              This voice agent may carry vendor-side prompt, flow, action, event, and transfer behavior. The current save path protects that binding; create a separate experimental voice profile before testing another live voice runtime.
            </div>
          </div>
        )}
        {deerFlowRuntime && (
          <div style={{ padding: 12, borderRadius: 10, border: '1px solid var(--accent)', background: 'var(--accent-soft)', color: 'var(--text)', marginBottom: 10 }}>
            <div style={{ fontSize: 13.5, fontWeight: 800 }}>DeerFlow voice rule</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.45, marginTop: 4 }}>
              DeerFlow agents use Google Chirp 3 HD in the Command Center voice interface. Wake phrases like "Hey Nadia" route through DeerFlow, then speak the answer with Chirp.
            </div>
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10 }}>
          <button
            onClick={() => { if (!deerFlowRuntime) setVoice({ provider: 'elevenlabs' }) }}
            disabled={deerFlowRuntime}
            style={{
              padding: 16,
              borderRadius: 12,
              border: '2px solid ' + (elevenReady ? 'var(--accent, #3b82f6)' : 'var(--border)'),
              background: elevenReady ? 'var(--accent-soft, #dbeafe)' : 'var(--surface, #fff)',
              color: 'var(--text)',
              cursor: deerFlowRuntime ? 'not-allowed' : 'pointer',
              textAlign: 'left',
              minHeight: 104,
            }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>ElevenLabs</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 4 }}>
              Current production-quality phone and ConvAI path. {elevenBound ? `Binding present${elSyncStatus?.voiceName ? `: ${elSyncStatus.voiceName}` : ''}.` : 'No binding yet.'}
            </div>
          </button>
          <button
            onClick={() => {
              if (voiceRuntimeLocked || deerFlowRuntime) return
              setVoice({ provider: 'openai', openaiModel: voice.openaiModel || 'gpt-realtime', openaiVoice: voice.openaiVoice || 'marin', demoMode: true })
            }}
            disabled={voiceRuntimeLocked || deerFlowRuntime}
            style={{
              padding: 16,
              borderRadius: 12,
              border: '2px solid ' + (openAiReady ? 'var(--accent, #3b82f6)' : 'var(--border)'),
              background: voiceRuntimeLocked ? 'var(--surface2, #f8fafc)' : (openAiReady ? 'var(--accent-soft, #dbeafe)' : 'var(--surface, #fff)'),
              color: voiceRuntimeLocked ? 'var(--text-muted)' : 'var(--text)',
              cursor: voiceRuntimeLocked ? 'not-allowed' : 'pointer',
              textAlign: 'left',
              minHeight: 104,
              opacity: voiceRuntimeLocked ? 0.72 : 1,
            }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>OpenAI Realtime</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 4 }}>
              {voiceRuntimeLocked
                ? voiceRuntimeLockReason
                : 'Browser speech-to-speech demo path with live CRM tool calls. Best for side-by-side quality demos.'}
            </div>
          </button>
          <button
            onClick={() => {
              if (voiceRuntimeLocked || deerFlowRuntime) return
              setVoice({ provider: 'gemini', geminiModel: voice.geminiModel || GEMINI_VOICE_MODELS[0], geminiVoice: voice.geminiVoice || 'Puck' })
            }}
            disabled={voiceRuntimeLocked || deerFlowRuntime}
            style={{
              padding: 16,
              borderRadius: 12,
              border: '2px solid ' + (geminiReady ? 'var(--accent, #3b82f6)' : 'var(--border)'),
              background: voiceRuntimeLocked ? 'var(--surface2, #f8fafc)' : (geminiReady ? 'var(--accent-soft, #dbeafe)' : 'var(--surface, #fff)'),
              color: voiceRuntimeLocked ? 'var(--text-muted)' : 'var(--text)',
              cursor: voiceRuntimeLocked ? 'not-allowed' : 'pointer',
              textAlign: 'left',
              minHeight: 104,
              opacity: voiceRuntimeLocked ? 0.72 : 1,
            }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Gemini Voice</div>
            {voiceRuntimeLocked && (
              <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 4 }}>
                {voiceRuntimeLockReason}
              </div>
            )}
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 4, display: voiceRuntimeLocked ? 'none' : 'block' }}>
              Google Gemini TTS / Live voices — 30 prebuilt characters. Available for any agent.
            </div>
          </button>
          <button
            onClick={() => {
              if (voiceRuntimeLocked) return
              setVoice({ provider: 'chirp3', chirp3Model: CHIRP3_MODEL, chirp3Voice: voice.chirp3Voice || CHIRP3_VOICES[0], chirp3VoiceAlias: voice.chirp3VoiceAlias || 'Chirp 3 HD' })
            }}
            disabled={voiceRuntimeLocked}
            style={{
              padding: 16,
              borderRadius: 12,
              border: '2px solid ' + (chirpReady ? 'var(--accent, #3b82f6)' : 'var(--border)'),
              background: voiceRuntimeLocked ? 'var(--surface2, #f8fafc)' : (chirpReady ? 'var(--accent-soft, #dbeafe)' : 'var(--surface, #fff)'),
              color: voiceRuntimeLocked ? 'var(--text-muted)' : 'var(--text)',
              cursor: voiceRuntimeLocked ? 'not-allowed' : 'pointer',
              textAlign: 'left',
              minHeight: 104,
              opacity: voiceRuntimeLocked ? 0.72 : 1,
            }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Google Chirp 3 HD</div>
            {voiceRuntimeLocked && (
              <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 4 }}>
                {voiceRuntimeLockReason}
              </div>
            )}
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 4, display: voiceRuntimeLocked ? 'none' : 'block' }}>
              Google Cloud Text-to-Speech voices for sample playback and sandbox testing.
            </div>
          </button>
        </div>
      </div>

      {openAiReady && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
          <div>
            <FieldLabel hint="Realtime model used when this agent is launched from the CRM voice button.">
              OpenAI realtime model
            </FieldLabel>
            <input
              style={{ ...inputStyle, fontFamily: 'monospace' }}
              value={voice.openaiModel || 'gpt-realtime'}
              onChange={e => setVoice({ openaiModel: e.target.value })}
              placeholder="gpt-realtime"
            />
          </div>
          <div>
            <FieldLabel hint="Try these during demos to compare voice character. Marin is the default quality pick.">
              OpenAI voice
            </FieldLabel>
            <ThemedSelect
              style={inputStyle}
              value={voice.openaiVoice || 'marin'}
              onChange={e => setVoice({ openaiVoice: e.target.value })}
            >
              {OPENAI_REALTIME_VOICES.map(v => <option key={v} value={v}>{v}</option>)}
            </ThemedSelect>
          </div>
        </div>
      )}

      {geminiReady && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
          <div>
            <FieldLabel hint="Gemini voice model. The -tts models are for spoken output; the live model is for real-time speech-to-speech.">
              Gemini voice model
            </FieldLabel>
            <ThemedSelect
              style={inputStyle}
              value={voice.geminiModel || GEMINI_VOICE_MODELS[0]}
              onChange={e => setVoice({ geminiModel: e.target.value })}
            >
              {GEMINI_VOICE_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
            </ThemedSelect>
          </div>
          <div>
            <FieldLabel hint="Pick any of Gemini's 30 prebuilt voices. The note describes its character.">
              Gemini voice
            </FieldLabel>
            <ThemedSelect
              style={inputStyle}
              value={voice.geminiVoice || 'Puck'}
              onChange={e => setVoice({ geminiVoice: e.target.value })}
            >
              {GEMINI_VOICES.map(v => <option key={v.id} value={v.id}>{v.id} — {v.style}</option>)}
            </ThemedSelect>
          </div>
        </div>
      )}

      {chirpReady && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'end' }}>
          <div style={{ flex: '0 1 160px', minWidth: 130 }}>
            <FieldLabel hint="DeerFlow Chirp uses Gemini TTS with Chirp-style voices. It is turn-based voice, not a full-duplex microphone runtime yet.">
              Chirp model
            </FieldLabel>
            <ThemedSelect
              style={inputStyle}
              value={voice.chirp3Model || CHIRP3_MODEL}
              onChange={e => setVoice({ chirp3Model: e.target.value || CHIRP3_MODEL })}
            >
              <option value={CHIRP3_MODEL}>Chirp 3 HD</option>
            </ThemedSelect>
          </div>
          <div style={{ flex: '0 1 150px', minWidth: 120 }}>
            <FieldLabel hint="Filter Chirp voices by Google's published gender metadata.">
              Gender
            </FieldLabel>
            <ThemedSelect
              style={inputStyle}
              value={chirpGenderFilter}
              onChange={e => setChirpGenderFilter(e.target.value)}
            >
              <option value="all">All</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </ThemedSelect>
          </div>
          <div style={{ flex: '1 1 280px', minWidth: 220 }}>
            <FieldLabel hint="Pick one of the available English Chirp 3 HD voices.">
              Chirp voice
            </FieldLabel>
            <ThemedSelect
              style={inputStyle}
              value={voice.chirp3Voice || CHIRP3_VOICES[0]}
              onChange={e => setVoice({ chirp3Voice: e.target.value, chirp3VoiceAlias: chirpShortName(e.target.value) })}
            >
              {chirpVoiceOptions.map(v => <option key={v} value={v}>{chirpOptionLabel(v)}</option>)}
            </ThemedSelect>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
        <div>
          <FieldLabel hint="The experimental language model stack you want to try before making this agent clonable or leasable.">
            Language model
          </FieldLabel>
          <input
            style={{ ...inputStyle, fontFamily: 'monospace' }}
            value={labs.languageModel || editing.brain?.modelId || ''}
            onChange={e => setLabs({ languageModel: e.target.value })}
            placeholder="e.g. openai/gpt-5 or anthropic/claude-sonnet-4-6"
          />
        </div>
        <div>
          <FieldLabel hint="Comma-separated fallback models to test for speed, quality, or cost.">
            Fallback models
          </FieldLabel>
          <input
            style={{ ...inputStyle, fontFamily: 'monospace' }}
            value={labs.fallbackModels || ''}
            onChange={e => setLabs({ fallbackModels: e.target.value })}
            placeholder="model-a, model-b, model-c"
          />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        <div>
          <FieldLabel hint="How this lab should choose between model quality, speed, and cost during a demo.">
            Routing strategy
          </FieldLabel>
          <ThemedSelect
            style={inputStyle}
            value={labs.routingStrategy || 'balanced'}
            onChange={e => setLabs({ routingStrategy: e.target.value })}
          >
            <option value="balanced">Balanced</option>
            <option value="lowest-latency">Lowest latency</option>
            <option value="highest-quality">Highest quality</option>
            <option value="lowest-cost">Lowest cost</option>
            <option value="failover-only">Failover only</option>
            <option value="ab-test">A/B test</option>
          </ThemedSelect>
        </div>
        <div>
          <FieldLabel hint="Target first-response latency for live demos. Voice agents feel best when this stays tight.">
            Latency target ms
          </FieldLabel>
          <input
            style={inputStyle}
            type="number"
            min="100"
            step="100"
            value={labs.latencyTargetMs || '1200'}
            onChange={e => setLabs({ latencyTargetMs: e.target.value })}
          />
        </div>
        <div>
          <FieldLabel hint="Optional cost guardrail for a single sales demo run.">
            Max cost per demo
          </FieldLabel>
          <input
            style={inputStyle}
            value={labs.maxCostPerDemo || ''}
            onChange={e => setLabs({ maxCostPerDemo: e.target.value })}
            placeholder="e.g. $2.00"
          />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
        <div>
          <FieldLabel hint="Define when to switch providers or models: timeout, rate limit, quality failure, or cost ceiling.">
            Fallback policy
          </FieldLabel>
          <textarea
            style={{ ...inputStyle, minHeight: 95, resize: 'vertical' }}
            value={labs.fallbackPolicy || ''}
            onChange={e => setLabs({ fallbackPolicy: e.target.value })}
            placeholder="Example: If first response exceeds 1.5s, route next turn to faster model."
          />
        </div>
        <div>
          <FieldLabel hint="Notes for splitting traffic across providers or comparing variants during demos.">
            Load balancing
          </FieldLabel>
          <textarea
            style={{ ...inputStyle, minHeight: 95, resize: 'vertical' }}
            value={labs.loadBalancingNotes || ''}
            onChange={e => setLabs({ loadBalancingNotes: e.target.value })}
            placeholder="Example: 70% premium OpenAI voice, 30% low-cost fallback for routine CRM reads."
          />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
        <div>
          <FieldLabel hint="Used by media/image experiments and by agents that generate visuals during a demo.">
            Image model
          </FieldLabel>
          <input
            style={{ ...inputStyle, fontFamily: 'monospace' }}
            value={labs.imageModel || 'gpt-image-1'}
            onChange={e => setLabs({ imageModel: e.target.value })}
            placeholder="gpt-image-1"
          />
        </div>
        <div>
          <FieldLabel hint="Reserved for OpenAI video generation demos as that path is wired into this CRM.">
            Video model
          </FieldLabel>
          <input
            style={{ ...inputStyle, fontFamily: 'monospace' }}
            value={labs.videoModel || ''}
            onChange={e => setLabs({ videoModel: e.target.value })}
            placeholder="e.g. video model id"
          />
        </div>
      </div>

      <div style={{ padding: 16, borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface2, #f8fafc)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
          <FieldLabel hint="Saved MindStudio app/workflow definitions this agent can run through the fcc_run_mindstudio_flow OpenClaw tool.">
            MindStudio flows
          </FieldLabel>
          <button type="button" onClick={addMindStudioFlow} style={{ ...btnStyle('secondary'), minHeight: 36, padding: '6px 12px', fontSize: 13 }}>Add flow</button>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.45 }}>
          Grant this agent <code>fcc_run_mindstudio_flow</code> in Tools, then reference the flow id/name in its job description. The API key stays server-side.
        </div>
        {mindstudioFlows.length === 0 && (
          <div style={{ padding: 14, borderRadius: 10, border: '1px dashed var(--border)', color: 'var(--text-muted)', fontSize: 13 }}>
            No MindStudio flows saved for this agent yet.
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {mindstudioFlows.map((flow, index) => (
            <div key={flow.id || index} style={{ padding: 12, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface, #fff)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
                <div>
                  <FieldLabel hint="Short display name for this flow.">Name</FieldLabel>
                  <input style={{ ...inputStyle, minHeight: 40, padding: '8px 10px', fontSize: 13 }} value={flow.name || ''} onChange={e => saveMindStudioFlow(index, { name: e.target.value })} placeholder="Proposal Generator" />
                </div>
                <div>
                  <FieldLabel hint="Stable id agents can reference.">Flow id</FieldLabel>
                  <input style={{ ...inputStyle, minHeight: 40, padding: '8px 10px', fontSize: 13, fontFamily: 'monospace' }} value={flow.id || ''} onChange={e => saveMindStudioFlow(index, { id: e.target.value })} placeholder="proposal-generator" />
                </div>
                <div>
                  <FieldLabel hint="MindStudio published app id.">App id</FieldLabel>
                  <input style={{ ...inputStyle, minHeight: 40, padding: '8px 10px', fontSize: 13, fontFamily: 'monospace' }} value={flow.appId || ''} onChange={e => saveMindStudioFlow(index, { appId: e.target.value })} placeholder="46f2e54b-..." />
                </div>
                <div>
                  <FieldLabel hint="Optional workflow name without .flow extension.">Workflow</FieldLabel>
                  <input style={{ ...inputStyle, minHeight: 40, padding: '8px 10px', fontSize: 13, fontFamily: 'monospace' }} value={flow.workflow || ''} onChange={e => saveMindStudioFlow(index, { workflow: e.target.value })} placeholder="optional-workflow-name" />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 10, marginTop: 10 }}>
                <div>
                  <FieldLabel hint="What the flow is for so the agent knows when to use it.">Description</FieldLabel>
                  <textarea style={{ ...inputStyle, minHeight: 88, resize: 'vertical', fontSize: 13 }} value={flow.description || ''} onChange={e => saveMindStudioFlow(index, { description: e.target.value })} placeholder="Use when Carl asks for a polished buyer-ready proposal..." />
                </div>
                <div>
                  <FieldLabel hint="Default launch variables as JSON. Agent-supplied variables override these at runtime.">Variables JSON</FieldLabel>
                  <textarea style={{ ...inputStyle, minHeight: 88, resize: 'vertical', fontSize: 13, fontFamily: 'monospace' }} value={flow.variablesJson || '{}'} onChange={e => saveMindStudioFlow(index, { variablesJson: e.target.value })} />
                </div>
              </div>
              {mindStudioTest?.flowId === flow.id && (
                <div style={{ marginTop: 10, padding: 10, borderRadius: 8, fontSize: 12, whiteSpace: 'pre-wrap', background: mindStudioTest.loading ? 'var(--surface2)' : (mindStudioTest.ok ? 'var(--green-soft, #ecfdf5)' : 'var(--red-soft, #fee2e2)'), color: mindStudioTest.ok ? 'var(--green)' : (mindStudioTest.loading ? 'var(--text-muted)' : 'var(--red)') }}>
                  {mindStudioTest.loading ? 'Running MindStudio flow...' : mindStudioTest.message}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
                <button type="button" onClick={() => runMindStudioTest(flow)} disabled={!flow.appId} style={{ ...btnStyle('ghost'), minHeight: 36, padding: '6px 12px', fontSize: 13, opacity: flow.appId ? 1 : 0.55 }}>Test run</button>
                <button type="button" onClick={() => removeMindStudioFlow(index)} style={{ ...btnStyle('ghost'), minHeight: 36, padding: '6px 12px', fontSize: 13, color: 'var(--red)' }}>Remove</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: 16, borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface2, #f8fafc)' }}>
        <FieldLabel hint="Generate install code for a customer website. The floating launcher now follows the Doreen-style public concierge pattern.">
          Website agent embed
        </FieldLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 12 }}>
          <div>
            <FieldLabel hint="Choose what kind of paste-in code to generate.">
              Embed type
            </FieldLabel>
            <ThemedSelect
              style={inputStyle}
              value={labs.embedStyle || 'floating'}
              onChange={e => setLabs({ embedStyle: e.target.value })}
            >
              <option value="floating">Floating JavaScript launcher</option>
              <option value="iframe">Embedded iframe panel</option>
              <option value="button">Plain link button</option>
            </ThemedSelect>
          </div>
          <div>
            <FieldLabel hint="Theme hint passed to the widget.">
              Theme
            </FieldLabel>
            <ThemedSelect
              style={inputStyle}
              value={labs.embedTheme || 'light'}
              onChange={e => setLabs({ embedTheme: e.target.value })}
            >
              <option value="light">Light</option>
              <option value="dark">Dark</option>
              <option value="brand">Brand</option>
            </ThemedSelect>
          </div>
          <div>
            <FieldLabel hint="Optional note for the domain this embed is intended for. Enforcement comes when the public widget endpoint is hardened.">
              Intended domain
            </FieldLabel>
            <input
              style={inputStyle}
              value={labs.embedAllowedDomain || ''}
              onChange={e => setLabs({ embedAllowedDomain: e.target.value })}
              placeholder="example.com"
            />
          </div>
        </div>
        <textarea
          readOnly
          style={{ ...inputStyle, minHeight: 130, resize: 'vertical', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 13 }}
          value={selectedSnippet}
          onFocus={e => e.target.select()}
        />
        <div style={{ marginTop: 8, fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.45 }}>
          Current test URL: <code>{widgetUrl}</code>. Paste the snippet into a test page to see this configured agent appear like the Doreen website concierge.
        </div>
      </div>

      <div>
        <FieldLabel hint="Describe the workflow you want to test: trigger, steps, required tools, approval points, and success condition.">
          Workflow recipe
        </FieldLabel>
        <textarea
          style={{ ...inputStyle, minHeight: 110, resize: 'vertical' }}
          value={labs.workflowRecipe || ''}
          onChange={e => setLabs({ workflowRecipe: e.target.value })}
          placeholder="Example: Lead comes in -> agent qualifies -> opens account -> drafts follow-up -> creates task -> asks Carl before sending."
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
        <div>
          <FieldLabel hint="Notes about ChatGPT GPTs, Apps, MCP connectors, or plugins this agent might use later.">
            GPTs / plugins
          </FieldLabel>
          <textarea
            style={{ ...inputStyle, minHeight: 100, resize: 'vertical' }}
            value={labs.pluginNotes || ''}
            onChange={e => setLabs({ pluginNotes: e.target.value })}
            placeholder="Example: Test whether this maps to a custom GPT, ChatGPT App, or CRM MCP connector."
          />
        </div>
        <div>
          <FieldLabel hint="Notes for scheduled, event-driven, or follow-up automations this agent could run.">
            Automations
          </FieldLabel>
          <textarea
            style={{ ...inputStyle, minHeight: 100, resize: 'vertical' }}
            value={labs.automationNotes || ''}
            onChange={e => setLabs({ automationNotes: e.target.value })}
            placeholder="Example: Run every weekday at 8am, watch stale leads, draft but never send without approval."
          />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
        <div>
          <FieldLabel hint="A repeatable test script: questions, tasks, expected behavior, and what counts as a pass.">
            Evaluation checklist
          </FieldLabel>
          <textarea
            style={{ ...inputStyle, minHeight: 110, resize: 'vertical' }}
            value={labs.evalChecklist || ''}
            onChange={e => setLabs({ evalChecklist: e.target.value })}
            placeholder="Example: 1. Open account. 2. Summarize pipeline. 3. Create task. 4. Generate image. 5. Explain ROI in one sentence."
          />
        </div>
        <div>
          <FieldLabel hint="What proves this configuration is demo-ready: speed, accuracy, buyer reaction, tool success rate, or cost.">
            Success metrics
          </FieldLabel>
          <textarea
            style={{ ...inputStyle, minHeight: 110, resize: 'vertical' }}
            value={labs.successMetrics || ''}
            onChange={e => setLabs({ successMetrics: e.target.value })}
            placeholder="Example: Under 1.2s first reply, 90% tool success, clear buyer wow moment within 60 seconds."
          />
        </div>
      </div>

      <div>
        <FieldLabel hint="Internal notes for what to test or compare during a buyer demo.">
          Lab notes
        </FieldLabel>
        <textarea
          style={{ ...inputStyle, minHeight: 90, resize: 'vertical' }}
          value={labs.notes || ''}
          onChange={e => setLabs({ notes: e.target.value })}
          placeholder="Example: Compare ElevenLabs Doreen against OpenAI marin for consultative sales demo."
        />
      </div>
    </div>
  )
}

function ChannelsTab({ editing, setEditing, channelOptions = CHANNEL_OPTIONS, channelStatus = {} }) {
  const sel = new Set(editing.channels || [])
  const toggle = (c) => {
    const next = new Set(sel)
    if (next.has(c)) next.delete(c); else next.add(c)
    setEditing({ ...editing, channels: Array.from(next) })
  }
  return (
    <div>
      <FieldLabel hint="Which inputs this agent should respond to.">Where they work</FieldLabel>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
        {(channelOptions || CHANNEL_OPTIONS).map(c => {
          const Icon = CHANNEL_ICONS[c.id] || Bot
          const selected = sel.has(c.id)
          const status = channelStatus?.[c.id] || {}
          const configured = status.configured || status.active
          const statusText = c.statusKind === 'openclaw'
            ? configured ? 'Configured' : 'Review'
            : 'CRM'
          return (
            <button
              key={c.id}
              onClick={() => toggle(c.id)}
              title={status.detail || c.description || c.label}
              style={{
                display: 'grid',
                gridTemplateColumns: '24px 1fr',
                gap: 10,
                alignItems: 'center',
                textAlign: 'left',
                padding: 12,
                borderRadius: 8,
                border: '1px solid ' + (selected ? 'var(--accent, #3b82f6)' : 'var(--border)'),
                background: selected ? 'var(--accent-soft, #dbeafe)' : 'var(--surface, #fff)',
                color: 'var(--text)',
                cursor: 'pointer',
                minHeight: 72,
                fontSize: 14,
                fontWeight: 700,
              }}
            >
              <Icon size={20} aria-hidden="true" />
              <span style={{ display: 'grid', gap: 4, minWidth: 0 }}>
                <span>{c.label}</span>
                <span style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', fontSize: 11, fontWeight: 800, color: configured ? 'var(--green, #047857)' : 'var(--amber, #b45309)' }}>
                  {selected && <span style={badge('blue')}>Active</span>}
                  <span>{statusText}</span>
                  {Number.isFinite(status.targetCount) && status.targetCount > 0 && <span>{status.targetCount} target{status.targetCount === 1 ? '' : 's'}</span>}
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function ScheduleTab({ editing, setEditing }) {
  const sched = editing.schedule || { mode: 'on-demand' }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <FieldLabel hint="Most agents run on-demand (when something arrives). Some run on a schedule (the morning brief).">When this agent runs</FieldLabel>
      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={() => setEditing({ ...editing, schedule: { mode: 'on-demand' } })}
                style={{ flex: 1, padding: 16, borderRadius: 12, border: '2px solid ' + (sched.mode === 'on-demand' ? 'var(--accent, #3b82f6)' : 'var(--border)'),
                         background: sched.mode === 'on-demand' ? 'var(--accent-soft, #dbeafe)' : 'var(--surface, #fff)',
                         cursor: 'pointer', minHeight: 64, fontSize: 16, fontWeight: 500 }}>
          On demand
        </button>
        <button onClick={() => setEditing({ ...editing, schedule: { mode: 'cron', cron: sched.cron || '0 9 * * 1-5' } })}
                style={{ flex: 1, padding: 16, borderRadius: 12, border: '2px solid ' + (sched.mode === 'cron' ? 'var(--accent, #3b82f6)' : 'var(--border)'),
                         background: sched.mode === 'cron' ? 'var(--accent-soft, #dbeafe)' : 'var(--surface, #fff)',
                         cursor: 'pointer', minHeight: 64, fontSize: 16, fontWeight: 500 }}>
          On a schedule
        </button>
      </div>
      {sched.mode === 'cron' && (
        <div>
          <FieldLabel hint="Cron expression. Example: '30 7 * * 1-5' = 7:30am on weekdays.">Schedule (cron)</FieldLabel>
          <input style={{ ...inputStyle, fontFamily: 'monospace' }} value={sched.cron || ''} onChange={e => setEditing({ ...editing, schedule: { ...sched, cron: e.target.value } })} />
        </div>
      )}
    </div>
  )
}

function AdvancedTab({ editing }) {
  return (
    <div>
      <FieldLabel hint="The full raw OpenClaw record. Read-only — edit through the other tabs.">Raw OpenClaw config</FieldLabel>
      {editing.schemaUnknownKeys?.length > 0 && (
        <div style={{ marginBottom: 10, padding: 12, background: 'var(--amber-soft, #fef3c7)', borderRadius: 8, fontSize: 13, color: '#92400e' }}>
          ⚠️ This agent has fields the manager doesn't recognize: <strong>{editing.schemaUnknownKeys.join(', ')}</strong>. They will be preserved when you save.
        </div>
      )}
      <pre style={{ background: 'var(--surface2, #f8fafc)', padding: 16, borderRadius: 10, fontSize: 12, overflow: 'auto', maxHeight: 400 }}>
        {JSON.stringify(editing._raw || editing, null, 2)}
      </pre>
    </div>
  )
}

function firstName(s) { return String(s || '').trim().split(/\s+/)[0] || 'them' }

function TalkPanel({ agent, categories, onClose }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [err, setErr] = useState(null)
  const scrollRef = useRef(null)
  const inputRef = useRef(null)
  const cat = categories.find(c => c.id === agent.category)

  useEffect(() => {
    setMessages([])
    setErr(null)
    setTimeout(() => inputRef.current?.focus(), 100)
  }, [agent.id])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, sending])

  const send = async () => {
    const text = input.trim()
    if (!text || sending) return
    const next = [...messages, { role: 'user', content: text }]
    setMessages(next)
    setInput('')
    setSending(true)
    setErr(null)
    // Reserve an empty assistant slot so streaming chunks can render in place
    setMessages([...next, { role: 'assistant', content: '' }])
    try {
      const r = await fetch('/api/agent/openclaw-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: next,
          sessionKey: `agent:${agent.id}:agent-manager`,
          section: 'agent-manager',
          operatorContext: {
            tab: 'agents',
            recordType: 'agent',
            recordId: agent.id,
            recordName: agent.name,
          },
          operatorTool: {
            label: agent.name,
            role: agent.role || agent.title || 'Agent',
            description: agent.description || '',
            jobDescription: agent.jobDescription || '',
            runtimeProvider: agent.runtimeProvider || 'openclaw-hetzner',
            tools: agent.tools || [],
            agentId: agent.id,
          },
        }),
      })
      if (!r.ok) {
        const errText = await r.text().catch(() => '')
        throw new Error(`HTTP ${r.status}${errText ? ': ' + errText.slice(0, 200) : ''}`)
      }
      // Parse Server-Sent Events stream
      const reader = r.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      let fullText = ''
      let streamErr = null
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const blocks = buf.split('\n\n')
        buf = blocks.pop() || ''
        for (const block of blocks) {
          const line = block.split('\n').find(l => l.startsWith('data: '))
          if (!line) continue
          try {
            const obj = JSON.parse(line.slice(6))
            if (obj.error) { streamErr = obj.error; continue }
            if (typeof obj.text === 'string') {
              fullText = obj.text
              setMessages([...next, { role: 'assistant', content: fullText }])
            }
          } catch { /* ignore malformed chunk */ }
        }
      }
      if (streamErr) throw new Error(streamErr)
      if (!fullText) throw new Error('Empty response from agent')
    } catch (e) {
      setErr(e.message)
      // Drop the empty assistant placeholder so the failure is honest
      setMessages(prev => prev.filter(m => !(m.role === 'assistant' && !m.content)))
    } finally {
      setSending(false)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  const onKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  return (
    <div style={{ marginTop: 24, padding: 24, borderRadius: 16, border: '2px solid ' + (cat?.accent || 'var(--accent, #3b82f6)'), background: 'var(--surface, #fff)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Avatar agent={agent} size={56} accent={cat?.accent} accentText={cat?.text} />
          <div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>Talking to {agent.name}</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{agent.title || agent.role || 'Agent'} • model: <span style={{ fontFamily: 'monospace' }}>{agent.brain?.modelId || '—'}</span></div>
          </div>
        </div>
        <button onClick={onClose} style={btnStyle('ghost')}>✕ Close</button>
      </div>

      <div ref={scrollRef} style={{
        background: 'var(--surface2, #f8fafc)', borderRadius: 12, padding: 16,
        minHeight: 280, maxHeight: 480, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 14,
      }}>
        {messages.length === 0 && !sending && (
          <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40, fontSize: 14 }}>
            Say hi to {firstName(agent.name)}. Try things like:<br />
            <span style={{ display: 'block', marginTop: 12, fontStyle: 'italic', fontSize: 13 }}>
              "Hey {firstName(agent.name)}, what's on the schedule today?"<br />
              "Draft me a follow-up email for the Smith lead."<br />
              "Summarize what's in the pipeline this week."
            </span>
          </div>
        )}
        {messages.map((m, i) => (
          <ChatBubble key={i} message={m} agent={agent} accent={cat?.accent} accentText={cat?.text} />
        ))}
        {sending && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-muted)', fontSize: 13 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: cat?.accent || 'var(--accent, #3b82f6)', animation: 'pulse 1.4s infinite' }} />
            {firstName(agent.name)} is thinking…
          </div>
        )}
      </div>

      {err && (
        <div style={{ marginBottom: 10, padding: 10, background: '#fef2f2', color: '#7f1d1d', borderRadius: 8, fontSize: 13 }}>
          ⚠️ {err}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKey}
          placeholder={`Message ${firstName(agent.name)} — Enter to send, Shift+Enter for new line`}
          rows={2}
          style={{ ...inputStyle, resize: 'vertical', minHeight: 56, fontSize: 15, flex: 1 }}
          disabled={sending}
        />
        <button onClick={send} disabled={sending || !input.trim()} style={{ ...btnStyle('primary'), minHeight: 56, padding: '0 20px', fontSize: 16 }}>
          {sending ? '…' : 'Send'}
        </button>
      </div>
    </div>
  )
}

function ChatBubble({ message, agent, accent, accentText }) {
  const isUser = message.role === 'user'
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexDirection: isUser ? 'row-reverse' : 'row' }}>
      {!isUser && <Avatar agent={agent} size={36} accent={accent} accentText={accentText} />}
      <div style={{
        padding: '10px 14px', borderRadius: 14,
        background: isUser ? (accent || 'var(--accent, #3b82f6)') : 'var(--surface, #fff)',
        color: isUser ? (accentText || 'var(--accent-text, #fff)') : 'var(--text)',
        border: isUser ? 'none' : '1px solid var(--border)',
        maxWidth: '78%', whiteSpace: 'pre-wrap', lineHeight: 1.5, fontSize: 14.5,
      }}>{message.content}</div>
    </div>
  )
}

// Inline lease form — appears inside the DetailPanel when the user clicks "Lease to Client".
// Picks an account from the existing CRM accounts, sets monthly fee + start date.
// Writes a real lease record via POST /api/leases. No mock data.
function LeaseForm({ agent, accounts, busy, onSubmit, onClose }) {
  const [clientAccountId, setClientAccountId] = useState('')
  const [tierId, setTierId] = useState('')
  const [tiers, setTiers] = useState([])
  const [addons, setAddons] = useState({ tools: [], specialties: [], premiumModels: [] })
  const [pickedTools, setPickedTools] = useState([])
  const [pickedSpecialties, setPickedSpecialties] = useState([])
  const [pickedModels, setPickedModels] = useState([])
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')

  // Load real pricing tiers + addons
  useEffect(() => {
    fetch('/api/pricing', { cache: 'no-store' })
      .then(r => r.json())
      .then(j => {
        if (!j.ok) return
        setTiers(j.tiers || [])
        // The pricing endpoint nests addons under the tiers file root — refetch raw
      })
      .catch(() => {})
    fetch('/api/pricing?addons=1', { cache: 'no-store' })
      .then(r => r.json())
      .then(j => { if (j.addons) setAddons(j.addons) })
      .catch(() => {})
  }, [])

  const toggle = (list, setter, id) => {
    if (list.includes(id)) setter(list.filter(x => x !== id))
    else setter([...list, id])
  }

  const selectedTier = tiers.find(t => t.id === tierId)
  const tierFee = selectedTier?.monthlyFee || 0
  const toolsFee = (addons.tools || []).filter(t => pickedTools.includes(t.id)).reduce((s, t) => s + t.monthlyFee, 0)
  const specFee = (addons.specialties || []).filter(t => pickedSpecialties.includes(t.id)).reduce((s, t) => s + t.monthlyFee, 0)
  const modelFee = (addons.premiumModels || []).filter(t => pickedModels.includes(t.id)).reduce((s, t) => s + t.monthlyFee, 0)
  const monthlyFee = tierFee + toolsFee + specFee + modelFee
  const valid = clientAccountId && tierId && monthlyFee > 0
  const account = (accounts || []).find(a => a.id === clientAccountId)
  return (
    <div style={{
      padding: 20, marginBottom: 18, borderRadius: 12,
      background: 'var(--surface)',
      border: '2px solid #10b981', color: 'var(--text)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>🏢 Lease "{agent.name}" to a client</h3>
        <button onClick={onClose} disabled={busy} style={btnStyle('ghost')}>✕</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 14 }}>
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Client account *</label>
          <ThemedSelect
            value={clientAccountId}
            onChange={e => setClientAccountId(e.target.value)}
            style={{ width: '100%', padding: '10px 12px', minHeight: 44, fontSize: 15, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)' }}
          >
            <option value="">— Pick a client —</option>
            {(accounts || []).map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </ThemedSelect>
          {(!accounts || accounts.length === 0) && (
            <div style={{ fontSize: 12, marginTop: 6, color: '#92400e' }}>No accounts loaded — add one in the Accounts page first.</div>
          )}
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Pricing tier *</label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 8 }}>
            {tiers.map(t => (
              <button
                key={t.id}
                onClick={() => setTierId(t.id)}
                style={{
                  textAlign: 'left', padding: '10px 12px', borderRadius: 10,
                  background: tierId === t.id ? t.color : 'var(--surface, #fff)',
                  color: tierId === t.id ? '#fff' : 'var(--text)',
                  border: '2px solid ' + (tierId === t.id ? t.color : 'var(--border)'),
                  cursor: 'pointer', minHeight: 70,
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 700 }}>{t.name}</div>
                <div style={{ fontSize: 18, fontWeight: 800, marginTop: 2 }}>${t.monthlyFee}<span style={{ fontSize: 11, fontWeight: 500, opacity: 0.85 }}>/mo</span></div>
                <div style={{ fontSize: 11, marginTop: 2, opacity: 0.85, lineHeight: 1.3 }}>{t.tagline}</div>
              </button>
            ))}
          </div>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Start date</label>
          <input
            type="date"
            value={startDate}
            onChange={e => setStartDate(e.target.value)}
            style={{ width: '100%', padding: '10px 12px', minHeight: 44, fontSize: 15, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)' }}
          />
        </div>
      </div>

      {selectedTier && (
        <div style={{ padding: 12, marginBottom: 14, background: 'var(--surface2)', color: 'var(--text)', borderRadius: 10, border: '1px solid var(--border)', fontSize: 13 }}>
          <div style={{ fontWeight: 700, color: selectedTier.color, marginBottom: 6 }}>{selectedTier.name} — ${selectedTier.monthlyFee}/mo</div>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Includes per month:</div>
          <ul style={{ margin: '0 0 8px 16px', padding: 0, fontSize: 12, lineHeight: 1.6 }}>
            {Object.entries(selectedTier.included || {}).filter(([_,v]) => v > 0).map(([k, v]) => (
              <li key={k}>{v.toLocaleString()} {k.replace(/([A-Z])/g, ' $1').toLowerCase()}</li>
            ))}
          </ul>
        </div>
      )}

      {selectedTier && (
        <div style={{ marginBottom: 14 }}>
          <AddonGroup
            label="Specialty vertical (replaces standard prompt with industry-aware variant)"
            items={addons.specialties || []}
            picked={pickedSpecialties}
            onToggle={id => toggle(pickedSpecialties, setPickedSpecialties, id)}
            color="#7c3aed"
          />
          <AddonGroup
            label="Tool / plugin add-ons"
            items={addons.tools || []}
            picked={pickedTools}
            onToggle={id => toggle(pickedTools, setPickedTools, id)}
            color="#0891b2"
          />
          <AddonGroup
            label="Premium AI brain"
            items={addons.premiumModels || []}
            picked={pickedModels}
            onToggle={id => toggle(pickedModels, setPickedModels, id)}
            color="#dc2626"
          />
        </div>
      )}

      {valid && (
        <div style={{ padding: 14, marginBottom: 14, background: '#dcfce7', borderRadius: 10, border: '2px solid #10b981', fontSize: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, color: '#065f46', textTransform: 'uppercase', letterSpacing: 0.5 }}>Monthly total</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#065f46' }}>${monthlyFee}<span style={{ fontSize: 14, fontWeight: 500 }}>/mo</span></div>
          <div style={{ fontSize: 12, marginTop: 6, color: '#065f46', lineHeight: 1.5 }}>
            {selectedTier.name} ${tierFee}{toolsFee > 0 && ` + tools $${toolsFee}`}{specFee > 0 && ` + specialty $${specFee}`}{modelFee > 0 && ` + model $${modelFee}`}
          </div>
        </div>
      )}
      <div style={{ marginBottom: 14 }}>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Notes (optional)</label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Anything specific about this lease — included channels, capabilities, custom branding…"
          rows={2}
          style={{ width: '100%', padding: '10px 12px', fontSize: 14, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', color: 'var(--text)', fontFamily: 'inherit', resize: 'vertical' }}
        />
      </div>
      {valid && account && (
        <div style={{ padding: 10, marginBottom: 14, background: 'var(--surface)', color: 'var(--text)', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }}>
          About to lease <strong>{agent.name}</strong> to <strong>{account.name}</strong> for <strong>${monthlyFee}/mo</strong> starting <strong>{startDate}</strong>.
          The agent will move into a new tenant view named after {account.name}, and the dropdown will switch to show it.
        </div>
      )}
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
        <button onClick={onClose} disabled={busy} style={btnStyle('ghost')}>Cancel</button>
        <button
          onClick={() => onSubmit?.({
            clientAccountId,
            tierId,
            tierName: selectedTier?.name,
            monthlyFee: Number(monthlyFee),
            startDate,
            notes,
            addons: {
              tools: pickedTools,
              specialties: pickedSpecialties,
              premiumModels: pickedModels,
            },
          })}
          disabled={!valid || busy}
          style={btnStyle('primary')}
        >{busy ? 'Leasing…' : 'Lease this agent'}</button>
      </div>
    </div>
  )
}

// Surfaces real per-lease usage + projected bill + phone status. Carl glances at this
// when he switches the tenant dropdown to a leased tenant. Polls every 10s.
function LeaseSummaryStrip({ lease }) {
  const [data, setData] = useState(null)
  useEffect(() => {
    let cancelled = false
    const fetchIt = () => {
      fetch(`/api/leases/${lease.id}/activities`, { cache: 'no-store' })
        .then(r => r.json())
        .then(j => { if (!cancelled && j.ok) setData(j) })
        .catch(() => {})
    }
    fetchIt()
    const i = setInterval(fetchIt, 10000)
    return () => { cancelled = true; clearInterval(i) }
  }, [lease.id])

  const usage = data?.usage
  const phone = lease.twilioPhoneNumber
  const phoneStatus = lease.elevenLabsImportStatus

  return (
    <div style={{
      marginTop: 8, padding: '12px 16px', borderRadius: 10,
      background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)',
      display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', fontSize: 13,
    }}>
      <div style={{ fontWeight: 700 }}>🏢 {lease.tenantName}</div>
      <span style={{ color: 'var(--text-muted)' }}>·</span>
      <div><strong>{lease.tierName || 'Custom'}</strong> · ${lease.monthlyFee}/mo</div>
      <span style={{ color: 'var(--text-muted)' }}>·</span>
      <div title="Phone status">
        {phone
          ? <>📞 {phone}{phoneStatus === 'pending-manual' && <span style={{ marginLeft: 6, fontSize: 11, color: '#f59e0b', fontWeight: 600 }}>(EL pending)</span>}</>
          : <span style={{ color: '#dc2626' }}>📞 No phone yet — provision in agent panel</span>}
      </div>
      {usage && (
        <>
          <span style={{ color: 'var(--text-muted)' }}>·</span>
          <div>{usage.totalActivities} activit{usage.totalActivities === 1 ? 'y' : 'ies'}</div>
          {usage.timeTrackedSeconds > 0 && <><span style={{ color: 'var(--text-muted)' }}>·</span><div>{usage.timeTrackedHumanReadable} tracked</div></>}
          {usage.emailsSent > 0 && <><span style={{ color: 'var(--text-muted)' }}>·</span><div>{usage.emailsSent} emails</div></>}
          {usage.imagesGenerated > 0 && <><span style={{ color: 'var(--text-muted)' }}>·</span><div>{usage.imagesGenerated} images</div></>}
        </>
      )}
      <span style={{ color: 'var(--text-muted)' }}>·</span>
      <div style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: 12 }}>started {lease.startDate}</div>
    </div>
  )
}

function AddonGroup({ label, items, picked, onToggle, color }) {
  if (!items || items.length === 0) return null
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-muted)' }}>{label}</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 6 }}>
        {items.map(t => {
          const active = picked.includes(t.id)
          const fee = t.monthlyFee
          const sign = fee >= 0 ? '+' : '−'
          const abs = Math.abs(fee)
          return (
            <button
              key={t.id}
              onClick={() => onToggle(t.id)}
              title={t.description}
              style={{
                textAlign: 'left', padding: '8px 10px', borderRadius: 8,
                background: active ? color : 'var(--surface, #fff)',
                color: active ? '#fff' : 'var(--text)',
                border: '1px solid ' + (active ? color : 'var(--border)'),
                cursor: 'pointer', fontSize: 12, lineHeight: 1.3, minHeight: 50,
              }}
            >
              <div style={{ fontWeight: 600 }}>{t.name}</div>
              <div style={{ fontSize: 11, marginTop: 1, opacity: active ? 0.95 : 0.7, fontWeight: 600 }}>{sign}${abs}/mo</div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function btnStyle(kind) {
  const base = { padding: '10px 18px', minHeight: 44, fontSize: 15, fontWeight: 600, borderRadius: 10, border: 'none', cursor: 'pointer', fontFamily: 'inherit' }
  if (kind === 'primary') return { ...base, background: 'var(--accent, #3b82f6)', color: 'var(--accent-text, #fff)' }
  if (kind === 'secondary') return { ...base, background: 'var(--surface2, #e2e8f0)', color: 'var(--text)' }
  if (kind === 'ghost') return { ...base, background: 'transparent', color: 'var(--text)', border: '1px solid var(--border)' }
  if (kind === 'danger') return { ...base, background: '#ef4444', color: '#ffffff' }
  return base
}

const iconBtnStyle = {
  width: 40,
  height: 40,
  minWidth: 40,
  display: 'grid',
  placeItems: 'center',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--surface2)',
  color: 'var(--text)',
  cursor: 'pointer',
}

function badge(color) {
  const map = {
    amber: { bg: '#fef3c7', text: '#92400e' },
    grey: { bg: '#e5e7eb', text: '#374151' },
    blue: { bg: '#dbeafe', text: '#1e40af' },
    green: { bg: '#dcfce7', text: '#166534' },
    red: { bg: '#fee2e2', text: '#991b1b' },
  }
  const c = map[color] || map.grey
  return { padding: '2px 8px', fontSize: 11, fontWeight: 600, borderRadius: 6, background: c.bg, color: c.text }
}
