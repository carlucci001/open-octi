'use client'
import ThemedSelect from '../components/ThemedSelect'
import { useState, useEffect, useCallback, useMemo } from 'react'
import PageHeader from '../components/PageHeader'
import { Paginator, usePagination } from '../components/Paginator'
import ViewModeToggle from '../components/ViewModeToggle'
import BulkActionsMenu from '../components/BulkActionsMenu'
import ItemActionsMenu from '../components/ItemActionsMenu'
import {
  BarChart3,
  FileSearch,
  Globe2,
  Mail,
  MapPin,
  Newspaper,
  Play,
  Radar,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
  Workflow,
} from 'lucide-react'
import { AUTOMATION_STUDIO_TEMPLATES, automationStudioTemplateList } from '@/lib/automation-studio-templates'

const TRIGGERS = [
  { id: 'manual', label: 'Manual', hint: 'You run it on demand' },
  { id: 'schedule', label: 'Schedule', hint: 'Runs on a recurring time' },
  { id: 'webhook', label: 'Webhook', hint: 'Runs when an external event hits a URL' },
  { id: 'event', label: 'Event', hint: 'Runs when something happens in the CRM' },
]

const AGENTS = [
  { id: 'deerflow-client-vetting-analyst', name: 'Vera' },
  { id: 'deerflow-lead-research-analyst', name: 'Leo' },
  { id: 'deerflow-market-competitor-analyst', name: 'Mason' },
  { id: 'deerflow-reputation-risk-analyst', name: 'Rowan' },
  { id: 'ContentStudio-promoter', name: 'Mark' },
  { id: 'main', name: 'Maggie' },
  { id: 'communications', name: 'Cameron' },
  { id: 'social-media', name: 'Sasha' },
  { id: 'coding', name: 'Craig' },
]

const SERVICE_TYPES = [
  { id: 'client-deep-dive', label: 'Client deep dive' },
  { id: 'deerflow-lead-enrichment', label: 'Lead enrichment proof pack' },
  { id: 'market-competitor-scan', label: 'Market and competitor scan' },
  { id: 'reputation-risk-scan', label: 'Reputation and risk scan' },
  { id: 'follow-up-builder', label: 'Research-to-follow-up builder' },
  { id: 'custom', label: 'Custom data service' },
  { id: 'email-campaign', label: 'Email campaign' },
  { id: 'press-release', label: 'Press release campaign' },
  { id: 'lead-sourcing', label: 'Lead sourcing' },
  { id: 'competitor-watch', label: 'Competitor watch' },
  { id: 'media-refresh', label: 'Media contact refresh' },
  { id: 'opportunity-scan', label: 'Opportunity scan' },
  { id: 'maps-leads', label: 'Maps lead sweep' },
]

const PROVIDERS = [
  { id: 'deerflow+perplexity', label: 'DeerFlow + Perplexity' },
  { id: 'deerflow+crm', label: 'DeerFlow + CRM' },
  { id: 'crm+research', label: 'CRM + research output' },
  { id: 'apify', label: 'Apify' },
  { id: 'apify-press', label: 'Apify + press list' },
  { id: 'press-contacts', label: 'Curated press list' },
  { id: 'crm', label: 'CRM data' },
  { id: 'manual', label: 'Manual input' },
]

const OUTPUT_FORMATS = [
  { id: 'draft', label: 'Draft for approval' },
  { id: 'email-campaign', label: 'Email campaign' },
  { id: 'email', label: 'Email digest' },
  { id: 'csv', label: 'CSV export' },
  { id: 'crm', label: 'CRM records' },
  { id: 'report', label: 'Client report' },
]

const DELIVERY_CHANNELS = [
  { id: 'email', label: 'Email' },
  { id: 'email-campaign', label: 'Email campaign' },
  { id: 'crm', label: 'CRM' },
  { id: 'csv', label: 'CSV' },
  { id: 'discord', label: 'Discord' },
  { id: 'telegram', label: 'Telegram' },
  { id: 'telegraph', label: 'Telegraph' },
]

const AUTOMATION_TYPE_MARKS = {
  'client-deep-dive': { icon: FileSearch, label: 'Client deep dive', tone: '#2563eb', bg: 'rgba(37, 99, 235, 0.12)' },
  'deerflow-lead-enrichment': { icon: Users, label: 'Lead enrichment proof pack', tone: '#0f766e', bg: 'rgba(15, 118, 110, 0.12)' },
  'market-competitor-scan': { icon: BarChart3, label: 'Market and competitor scan', tone: '#7c3aed', bg: 'rgba(124, 58, 237, 0.12)' },
  'reputation-risk-scan': { icon: ShieldAlert, label: 'Reputation and risk scan', tone: '#dc2626', bg: 'rgba(220, 38, 38, 0.12)' },
  'follow-up-builder': { icon: Send, label: 'Research-to-follow-up builder', tone: '#ea580c', bg: 'rgba(234, 88, 12, 0.12)' },
  custom: { icon: Sparkles, label: 'Custom data service', tone: '#64748b', bg: 'rgba(100, 116, 139, 0.14)' },
  'email-campaign': { icon: Mail, label: 'Email campaign', tone: '#2563eb', bg: 'rgba(37, 99, 235, 0.12)' },
  'press-release': { icon: Newspaper, label: 'Press release campaign', tone: '#b91c1c', bg: 'rgba(185, 28, 28, 0.12)' },
  'lead-sourcing': { icon: Target, label: 'Lead sourcing', tone: '#16a34a', bg: 'rgba(22, 163, 74, 0.12)' },
  'competitor-watch': { icon: Radar, label: 'Competitor watch', tone: '#9333ea', bg: 'rgba(147, 51, 234, 0.12)' },
  'media-refresh': { icon: RefreshCw, label: 'Media contact refresh', tone: '#0891b2', bg: 'rgba(8, 145, 178, 0.12)' },
  'opportunity-scan': { icon: Globe2, label: 'Opportunity scan', tone: '#ca8a04', bg: 'rgba(202, 138, 4, 0.14)' },
  'maps-leads': { icon: MapPin, label: 'Maps lead sweep', tone: '#ea580c', bg: 'rgba(234, 88, 12, 0.12)' },
}

const AUTOMATION_FALLBACK_MARK = { icon: Workflow, label: 'Automation', tone: '#64748b', bg: 'rgba(100, 116, 139, 0.14)' }

const AUTOMATION_PROVIDER_MARKS = {
  'deerflow+perplexity': { label: 'DeerFlow + Perplexity', mark: 'DF', tone: '#0891b2' },
  'deerflow+crm': { label: 'DeerFlow + CRM', mark: 'DF', tone: '#0f766e' },
  'crm+research': { label: 'CRM + research output', mark: 'RS', tone: '#7c3aed' },
  apify: { label: 'Apify', mark: 'AP', tone: '#f97316' },
  'apify-press': { label: 'Apify + press list', mark: 'PR', tone: '#dc2626' },
  'press-contacts': { label: 'Curated press list', mark: 'PC', tone: '#b91c1c' },
  crm: { label: 'CRM data', mark: 'CRM', tone: '#2563eb' },
  manual: { label: 'Manual input', mark: 'MN', tone: '#64748b' },
}

function automationTypeMark(item = {}) {
  const key = item.serviceType || item.type || item.id
  if (key && AUTOMATION_TYPE_MARKS[key]) return AUTOMATION_TYPE_MARKS[key]

  const searchable = [
    item.name,
    item.description,
    item.output?.format,
    item.delivery?.method,
    ...(item.delivery?.channels || []),
  ].filter(Boolean).join(' ').toLowerCase()

  if (searchable.includes('email')) return AUTOMATION_TYPE_MARKS['email-campaign']
  if (searchable.includes('press') || searchable.includes('release')) return AUTOMATION_TYPE_MARKS['press-release']
  if (searchable.includes('lead')) return AUTOMATION_TYPE_MARKS['lead-sourcing']
  if (searchable.includes('competitor')) return AUTOMATION_TYPE_MARKS['competitor-watch']
  if (searchable.includes('media')) return AUTOMATION_TYPE_MARKS['media-refresh']
  if (searchable.includes('map')) return AUTOMATION_TYPE_MARKS['maps-leads']
  if (searchable.includes('risk') || searchable.includes('reputation')) return AUTOMATION_TYPE_MARKS['reputation-risk-scan']
  if (searchable.includes('opportunity')) return AUTOMATION_TYPE_MARKS['opportunity-scan']

  return AUTOMATION_FALLBACK_MARK
}

function automationProviderMark(provider) {
  const key = provider || 'manual'
  if (AUTOMATION_PROVIDER_MARKS[key]) return AUTOMATION_PROVIDER_MARKS[key]
  const label = PROVIDERS.find(p => p.id === key)?.label || String(key)
  return {
    label,
    mark: label.split(/\s|\+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase() || 'AU',
    tone: '#64748b',
  }
}

const SERVICE_TEMPLATES = {
  ...AUTOMATION_STUDIO_TEMPLATES,
  'email-campaign': {
    name: 'Monthly client email campaign',
    description: 'Builds a client-approved outreach campaign from Apify research, segmented recipients, subject lines, follow-up copy, and performance tracking.',
    scope: 'client',
    serviceType: 'email-campaign',
    assignedAgentId: 'communications',
    assignedAgentName: 'Cameron',
    trigger: { type: 'schedule', config: { cadence: 'Monthly' } },
    cadence: 'Monthly',
    dataSource: { provider: 'apify', query: 'client audience, lead source, segment, objections, prior engagement, suppression list', fields: ['name', 'email', 'company', 'segment', 'source', 'personalization', 'notes'] },
    output: { format: 'email-campaign', destination: 'approval queue' },
    approval: { required: true, approver: 'Carl/client' },
    delivery: { method: 'email campaign', channels: ['email-campaign', 'crm'], recipients: [] },
    campaign: { subject: 'Client campaign subject line', senderProfile: 'Client/Carl approved sender', cadence: 'initial send + one follow-up' },
    metrics: ['recipients qualified', 'emails approved', 'opens', 'replies', 'booked calls', 'unsubscribes'],
    steps: [
      { id: 'step_email_segment', label: 'Build and dedupe recipient segments from Apify and CRM data', kind: 'fetch' },
      { id: 'step_email_copy', label: 'Draft subject lines, body copy, and follow-up sequence', kind: 'generate' },
      { id: 'step_email_approval', label: 'Hold campaign for Carl/client approval before sending', kind: 'wait' },
      { id: 'step_email_send', label: 'Send or export the approved campaign package', kind: 'notify' },
      { id: 'step_email_report', label: 'Log metrics and create the next-month improvement brief', kind: 'action' },
    ],
  },
  'press-release': {
    name: 'Monthly press release campaign',
    description: 'Mark prepares a press release, builds the recipient list by beat/market, waits for approval, then delivers the approved campaign package.',
    scope: 'client',
    serviceType: 'press-release',
    assignedAgentId: 'ContentStudio-promoter',
    assignedAgentName: 'Mark',
    trigger: { type: 'schedule', config: { cadence: 'Monthly' } },
    cadence: 'Monthly',
    dataSource: { provider: 'apify-press', query: 'refresh public media contact pages, match local business/community/event beats, exclude do-not-contact outlets', fields: ['name', 'email', 'outlet', 'beat', 'notes', 'sourceUrl', 'lastVerifiedAt'] },
    output: { format: 'draft', destination: 'approval queue' },
    approval: { required: true, approver: 'Carl/client' },
    delivery: { method: 'draft', channels: ['email', 'crm'], recipients: [] },
    metrics: ['contacts matched', 'approved recipients', 'release sent', 'pickup detected', 'reply rate'],
    steps: [
      { id: 'step_press_research', label: 'Refresh media contacts and match outlets by beat/market', kind: 'fetch' },
      { id: 'step_press_draft', label: 'Draft press release and subject lines in client voice', kind: 'generate' },
      { id: 'step_press_approval', label: 'Hold for Carl/client approval before any send', kind: 'wait' },
      { id: 'step_press_deliver', label: 'Send approved release or export recipient package', kind: 'notify' },
      { id: 'step_press_report', label: 'Log outreach and prepare monthly coverage report', kind: 'action' },
    ],
  },
  'lead-sourcing': {
    name: 'Daily client lead sourcing',
    description: 'Finds new leads for a client, enriches and scores them, dedupes against CRM history, then delivers the requested format.',
    scope: 'client',
    serviceType: 'lead-sourcing',
    assignedAgentId: 'main',
    assignedAgentName: 'Maggie',
    trigger: { type: 'schedule', config: { cadence: 'Daily' } },
    cadence: 'Daily',
    dataSource: { provider: 'apify', query: 'target market + industry + buying signals', fields: ['businessName', 'contact', 'email', 'phone', 'website', 'notes'] },
    output: { format: 'email', destination: 'client digest' },
    approval: { required: false, approver: '' },
    delivery: { method: 'email digest', channels: ['email', 'crm'], recipients: [] },
    metrics: ['leads found', 'qualified leads', 'duplicates removed', 'delivery sent', 'client replies'],
    steps: [
      { id: 'step_lead_fetch', label: 'Run Apify research using the client market and criteria', kind: 'fetch' },
      { id: 'step_lead_enrich', label: 'Normalize, enrich, and score each lead', kind: 'action' },
      { id: 'step_lead_dedupe', label: 'Deduplicate against CRM and prior automation runs', kind: 'action' },
      { id: 'step_lead_deliver', label: 'Deliver leads in the client preferred format', kind: 'notify' },
    ],
  },
  'competitor-watch': {
    name: 'Weekly competitor watch',
    description: 'Apify monitors competitor sites, newsletters, social pages, and public updates, then sends a concise change report to the client.',
    scope: 'client',
    serviceType: 'competitor-watch',
    assignedAgentId: 'communications',
    assignedAgentName: 'Cameron',
    trigger: { type: 'schedule', config: { cadence: 'Weekly' } },
    cadence: 'Weekly',
    dataSource: { provider: 'apify', query: 'competitor URLs, pricing pages, blog/news pages, social links, review pages', fields: ['competitor', 'url', 'change', 'evidence', 'impact', 'recommendedAction'] },
    output: { format: 'report', destination: 'client report' },
    approval: { required: false, approver: '' },
    delivery: { method: 'email report', channels: ['email', 'discord'], recipients: [] },
    metrics: ['sources checked', 'changes found', 'high-impact changes', 'recommendations delivered'],
    steps: [
      { id: 'step_comp_fetch', label: 'Run Apify monitors against approved competitor/source URLs', kind: 'fetch' },
      { id: 'step_comp_compare', label: 'Compare against prior run and remove noise', kind: 'action' },
      { id: 'step_comp_report', label: 'Summarize what changed and what the client should do', kind: 'generate' },
      { id: 'step_comp_deliver', label: 'Deliver weekly competitor report', kind: 'notify' },
    ],
  },
  'media-refresh': {
    name: 'Monthly media contact refresh',
    description: 'Apify refreshes a client-specific press list, verifies public contact sources, flags stale contacts, and prepares a clean recipient list for Mark.',
    scope: 'client',
    serviceType: 'media-refresh',
    assignedAgentId: 'ContentStudio-promoter',
    assignedAgentName: 'Mark',
    trigger: { type: 'schedule', config: { cadence: 'Monthly' } },
    cadence: 'Monthly',
    dataSource: { provider: 'apify', query: 'media outlets, staff pages, contact pages, submission guidelines, market + beat filters', fields: ['name', 'email', 'outlet', 'beat', 'notes', 'sourceUrl', 'lastVerifiedAt'] },
    output: { format: 'csv', destination: 'client media list' },
    approval: { required: true, approver: 'Carl/client' },
    delivery: { method: 'CSV + CRM note', channels: ['csv', 'crm'], recipients: [] },
    metrics: ['contacts found', 'contacts verified', 'stale contacts removed', 'new outlets added'],
    steps: [
      { id: 'step_media_fetch', label: 'Scrape public outlet and staff/contact pages with Apify', kind: 'fetch' },
      { id: 'step_media_normalize', label: 'Normalize fields and dedupe by email/outlet', kind: 'action' },
      { id: 'step_media_score', label: 'Score contacts by beat, market, and source confidence', kind: 'action' },
      { id: 'step_media_export', label: 'Export updated press list for Mark/client approval', kind: 'notify' },
    ],
  },
  'opportunity-scan': {
    name: 'Weekly local opportunity scan',
    description: 'Apify checks public sources for permits, openings, grants, RFPs, events, and sponsor opportunities, then packages the best matches.',
    scope: 'client',
    serviceType: 'opportunity-scan',
    assignedAgentId: 'main',
    assignedAgentName: 'Maggie',
    trigger: { type: 'schedule', config: { cadence: 'Weekly' } },
    cadence: 'Weekly',
    dataSource: { provider: 'apify', query: 'city/county sources, chamber pages, event calendars, RFP pages, permit feeds, business openings', fields: ['opportunity', 'source', 'deadline', 'contact', 'fitScore', 'notes'] },
    output: { format: 'email', destination: 'client digest' },
    approval: { required: false, approver: '' },
    delivery: { method: 'email digest', channels: ['email', 'telegram'], recipients: [] },
    metrics: ['sources checked', 'opportunities found', 'qualified opportunities', 'deadlines flagged'],
    steps: [
      { id: 'step_opp_fetch', label: 'Run Apify across approved public opportunity sources', kind: 'fetch' },
      { id: 'step_opp_score', label: 'Score opportunities against the client profile', kind: 'action' },
      { id: 'step_opp_digest', label: 'Create a short action-oriented opportunity digest', kind: 'generate' },
      { id: 'step_opp_deliver', label: 'Deliver digest and create follow-up tasks when needed', kind: 'notify' },
    ],
  },
  'maps-leads': {
    name: 'Daily Google Maps lead sweep',
    description: 'Apify gathers local business leads from maps/search-style sources, enriches contact fields, dedupes, and delivers qualified leads.',
    scope: 'client',
    serviceType: 'maps-leads',
    assignedAgentId: 'main',
    assignedAgentName: 'Maggie',
    trigger: { type: 'schedule', config: { cadence: 'Daily' } },
    cadence: 'Daily',
    dataSource: { provider: 'apify', query: 'business category + city + radius + rating/review filters + missing website/email signals', fields: ['businessName', 'category', 'address', 'phone', 'website', 'email', 'rating', 'notes'] },
    output: { format: 'crm', destination: 'client lead queue' },
    approval: { required: false, approver: '' },
    delivery: { method: 'CRM import + email summary', channels: ['crm', 'email'], recipients: [] },
    metrics: ['leads scraped', 'qualified leads', 'emails found', 'duplicates removed', 'CRM records created'],
    steps: [
      { id: 'step_maps_fetch', label: 'Run Apify local business search for target market/category', kind: 'fetch' },
      { id: 'step_maps_enrich', label: 'Enrich websites, emails, categories, and notes', kind: 'action' },
      { id: 'step_maps_dedupe', label: 'Dedupe against prior runs and CRM records', kind: 'action' },
      { id: 'step_maps_deliver', label: 'Create lead queue entries and send client summary', kind: 'notify' },
    ],
  },
}

const STUDIO_TEMPLATES = automationStudioTemplateList()

async function api(action, payload = {}) {
  const r = await fetch('/api/automations', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload }),
  })
  return r.json()
}

function splitList(value) {
  return String(value || '')
    .split(',')
    .map(v => v.trim())
    .filter(Boolean)
}

function matchesAutomation(automation, query) {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  const fields = [
    automation.name,
    automation.description,
    automation.scope,
    automation.clientName,
    automation.serviceType,
    automation.assignedAgentName,
    automation.cadence,
    automation.dataSource?.provider,
    automation.dataSource?.query,
    automation.output?.format,
    automation.delivery?.method,
    ...(automation.delivery?.channels || []),
    ...(automation.metrics || []),
    ...(automation.steps || []).map(s => s.label),
  ]
  return fields.filter(Boolean).some(value => String(value).toLowerCase().includes(needle))
}

export default function AutomationsManager() {
  const [list, setList] = useState([])
  const [loading, setLoading] = useState(true)
  const [scopeFilter, setScopeFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [viewMode, setViewMode] = useState('list')
  const [runningIds, setRunningIds] = useState([])
  const [editing, setEditing] = useState(null) // null | 'new' | automation object
  const [selectedAutomations, setSelectedAutomations] = useState(new Set())
  const [accounts, setAccounts] = useState([])
  const [toast, setToast] = useState(null)

  const flash = useCallback((msg, kind = 'ok') => {
    setToast({ msg, kind }); setTimeout(() => setToast(null), 3000)
  }, [])

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/automations', { cache: 'no-store' }).then(r => r.json())
      if (!r.ok) throw new Error(r.error || 'Load failed')
      setList(r.automations || [])
    } catch (e) { flash(e.message, 'err') } finally { setLoading(false) }
  }, [flash])

  useEffect(() => { reload() }, [reload])
  useEffect(() => {
    fetch('/api/accounts').then(r => r.json()).then(d => setAccounts(d?.accounts || [])).catch(() => {})
  }, [])
  useEffect(() => {
    const resetFromMainNav = (event) => {
      if (event?.detail?.tab !== 'automations') return
      setViewMode('card')
      setEditing(null)
      setSelectedAutomations(new Set())
    }
    window.addEventListener('fcc:main-nav', resetFromMainNav)
    return () => window.removeEventListener('fcc:main-nav', resetFromMainNav)
  }, [])

  const filtered = useMemo(() => {
    const scoped = scopeFilter === 'all' ? list : list.filter(a => a.scope === scopeFilter)
    return scoped.filter(a => matchesAutomation(a, query))
  }, [list, scopeFilter, query])

  const { page, setPage, pageSize, setPageSize, paginated } = usePagination(filtered, 25)

  useEffect(() => {
    setPage(1)
    setSelectedAutomations(new Set())
  }, [query, scopeFilter, viewMode, pageSize, setPage])

  const counts = useMemo(() => ({
    total: list.length,
    inhouse: list.filter(a => a.scope === 'in-house').length,
    client: list.filter(a => a.scope === 'client').length,
    active: list.filter(a => a.enabled).length,
  }), [list])

  const save = async (draft) => {
    const r = draft.id
      ? await api('update', { id: draft.id, patch: draft })
      : await api('create', { automation: draft })
    if (!r.ok) return flash(r.error || 'Save failed', 'err')
    setEditing(null); await reload(); flash('Saved')
  }
  const toggle = async (a) => {
    const r = await api('toggle', { id: a.id })
    if (!r.ok) return flash(r.error || 'Toggle failed', 'err')
    reload()
  }
  const run = async (a) => {
    setRunningIds(ids => Array.from(new Set([...ids, a.id])))
    const r = await api('run', { id: a.id })
    if (!r.ok) {
      setRunningIds(ids => ids.filter(id => id !== a.id))
      return flash(r.error || 'Run failed', 'err')
    }
    const latest = Array.isArray(r.automation?.runHistory) ? r.automation.runHistory[0] : null
    const verb = latest?.executionMode === 'executed_runner'
      ? 'Executed'
      : latest?.executionMode === 'guarded_preparation'
        ? 'Prepared guarded run'
        : 'Run recorded'
    flash(`${verb}: "${a.name}"`)
    await reload()
    setTimeout(() => setRunningIds(ids => ids.filter(id => id !== a.id)), 12000)
  }
  const clone = async (a) => {
    const r = await api('clone', { id: a.id, patch: { name: `${a.name} copy` } })
    if (!r.ok) return flash(r.error || 'Clone failed', 'err')
    await reload()
    setEditing(r.automation)
    flash('Cloned')
  }
  const createFromTemplate = async (template) => {
    const r = await api('createFromTemplate', { templateId: template.id })
    if (!r.ok) return flash(r.error || 'Template failed', 'err')
    await reload()
    setEditing(r.automation)
    flash('Template added')
  }
  const remove = async (a) => {
    if (!confirm(`Delete "${a.name}"?`)) return
    const r = await api('delete', { id: a.id })
    if (!r.ok) return flash(r.error || 'Delete failed', 'err')
    reload()
  }
  const bulkDelete = async () => {
    if (!selectedAutomations.size) return
    if (!confirm(`Delete ${selectedAutomations.size} selected automation${selectedAutomations.size === 1 ? '' : 's'}?`)) return
    for (const id of selectedAutomations) {
      const r = await api('delete', { id })
      if (!r.ok) return flash(r.error || `Delete failed for ${id}`, 'err')
    }
    setSelectedAutomations(new Set())
    await reload()
    flash('Deleted selected automations')
  }

  if (editing) {
    return (
      <div className="automations-workspace p-4 sm:p-5">
        <button
          type="button"
          onClick={() => setEditing(null)}
          aria-label="Back to automations"
          title="Back to automations"
          className="mb-3 rounded-lg inline-flex items-center gap-2"
          style={{ minHeight: 36, padding: '0 11px', background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', fontSize: 13, fontWeight: 750 }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 18l-6-6 6-6" />
          </svg>
          Automations
        </button>
        <PageHeader className="automations-page-header" icon={<Workflow size={20} />} title={editing === 'new' ? 'New automation' : 'Edit automation'} subtitle="Build it once — run it in-house or hand it to a client's agent." />
        <Toast toast={toast} />
        <AutomationEditor
          initial={editing === 'new' ? null : editing}
          accounts={accounts}
          onCancel={() => setEditing(null)}
          onSave={save}
        />
      </div>
    )
  }

  return (
    <div className="automations-workspace command-workspace p-4 sm:p-5">
      <PageHeader className="automations-page-header" icon={<Workflow size={20} />} title="Automations" subtitle="Productized workflows you can test, sell, and gate before anything touches a client."
        viewToggle={<ViewModeToggle value={viewMode} onChange={setViewMode} modes={['list', 'card']} />} />
      <Toast toast={toast} />

      <StudioBench templates={STUDIO_TEMPLATES} onCreate={createFromTemplate} counts={counts} />

      <div className="automations-toolbar command-toolbar flex items-center justify-between flex-wrap gap-3 mb-4">
        <div className="automations-filter-row flex items-center gap-2 flex-wrap" style={{ flex: '1 1 520px', minWidth: 0 }}>
          <div className="automation-search relative" style={{ flex: '1 1 260px', minWidth: 220 }}>
            <Search size={15} style={{ position: 'absolute', left: 10, top: 12, color: 'var(--text-muted)' }} />
            <input
              aria-label="Search automations"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search automations"
              style={{ ...inp, paddingLeft: 32, minHeight: 40, width: '100%' }}
            />
          </div>
          <ThemedSelect
            aria-label="Filter automations by scope"
            value={scopeFilter}
            onChange={e => setScopeFilter(e.target.value)}
            style={{ ...inp, width: 'auto', minWidth: 170, minHeight: 40 }}
          >
            <option value="all">All scopes ({counts.total})</option>
            <option value="in-house">In-house ({counts.inhouse})</option>
            <option value="client">Client ({counts.client})</option>
          </ThemedSelect>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{filtered.length.toLocaleString()} shown</span>
        </div>
        <div className="automations-action-row flex items-center gap-2 flex-wrap">
          <button className="px-3 rounded-lg text-sm font-semibold" style={{ background: 'var(--accent)', color: 'var(--accent-text)', minHeight: 40 }} onClick={() => setEditing('new')}>New Automation</button>
          <BulkActionsMenu
            selectedCount={selectedAutomations.size}
            totalCount={paginated.length}
            onSelectPage={() => setSelectedAutomations(new Set(paginated.map(automation => automation.id)))}
            onClearSelection={() => setSelectedAutomations(new Set())}
            onDeleteSelected={bulkDelete}
          />
        </div>
      </div>

      {loading ? (
        <div className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <EmptyState onNew={() => setEditing('new')} scopeFilter={scopeFilter} query={query} />
      ) : (
        <>
        {viewMode === 'list' ? (
          <AutomationList
            automations={paginated}
            runningIds={runningIds}
            selectedAutomations={selectedAutomations}
            onCheck={(id) => setSelectedAutomations(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })}
            onToggle={toggle}
            onRun={run}
            onClone={clone}
            onEdit={setEditing}
            onDelete={remove}
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
            {paginated.map(a => (
              <AutomationCard key={a.id} a={a}
                compact={false} running={runningIds.includes(a.id)}
                checked={selectedAutomations.has(a.id)}
                onCheck={() => setSelectedAutomations(s => { const n = new Set(s); n.has(a.id) ? n.delete(a.id) : n.add(a.id); return n })}
                onToggle={() => toggle(a)} onRun={() => run(a)} onClone={() => clone(a)} onEdit={() => setEditing(a)} onDelete={() => remove(a)} />
            ))}
          </div>
        )}
        <Paginator total={filtered.length} page={page} pageSize={pageSize} onPage={setPage} onPageSize={setPageSize} label="automations" />
        </>
      )}
    </div>
  )
}

function EmptyState({ onNew, scopeFilter, query }) {
  return (
    <div className="rounded-xl px-5 py-10 text-center" style={{ background: 'var(--surface)', border: '1px dashed var(--border)' }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>
        {query ? 'No matching automations' : scopeFilter === 'client' ? 'No client automations yet' : scopeFilter === 'in-house' ? 'No in-house automations yet' : 'No automations yet'}
      </div>
      <div className="mt-1 mb-4 text-sm" style={{ color: 'var(--text-muted)' }}>
        Build a workflow — a sequence of steps with a trigger — then run it yourself or assign it to a client's agent to run 24/7.
      </div>
      <button style={btnPrimary} onClick={onNew}>+ Build your first automation</button>
    </div>
  )
}

function StudioBench({ templates, onCreate, counts }) {
  return (
    <div className="automation-studio-bench mb-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <div style={{ fontSize: 14, fontWeight: 850, color: 'var(--text)', lineHeight: 1.2 }}>Automation Studio</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>Start from a guarded, sellable workflow template.</div>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
        <StudioStat label="Built" value={counts.total} />
        <StudioStat label="Active" value={counts.active} />
        <StudioStat label="Client ready" value={counts.client} />
        <StudioStat label="Guarded" value="Approval" />
      </div>
      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}
      >
        {templates.map(template => (
          <button
            key={template.id}
            type="button"
            onClick={() => onCreate(template)}
            className="automation-template-card text-left"
            style={{
              minHeight: 150,
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--text)',
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              alignItems: 'stretch',
              justifyContent: 'space-between',
              textAlign: 'left',
              cursor: 'pointer',
            }}
          >
            <div className="flex items-start gap-3">
              <AutomationTypeIcon item={template} large />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="flex items-start justify-between gap-2">
                  <span
                    style={{
                      fontSize: 14,
                      fontWeight: 850,
                      lineHeight: 1.18,
                      minWidth: 0,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {template.name}
                  </span>
                  {template.approval?.required && <ShieldCheck size={16} style={{ color: 'var(--accent)', flex: '0 0 auto', marginTop: 1 }} />}
                </div>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, marginTop: 6, fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.25 }}>
                  <AutomationProviderMark provider={template.dataSource?.provider} compact />
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{template.assignedAgentName} · {template.dataSource?.provider}</span>
                </span>
              </div>
            </div>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.35, minHeight: 32, textAlign: 'left' }}>
              {template.commercialOffer}
            </span>
            <span style={{ fontSize: 12, fontWeight: 750, color: 'var(--accent)', lineHeight: 1.2 }}>Add to studio</span>
          </button>
        ))}
      </div>
    </div>
  )
}

function StudioStat({ label, value }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0 }}>{label}</div>
      <div style={{ fontSize: 18, color: 'var(--text)', fontWeight: 850, lineHeight: 1.15 }}>{value}</div>
    </div>
  )
}

function AutomationTypeIcon({ item, compact = false, large = false }) {
  const mark = automationTypeMark(item)
  const Icon = mark.icon || Workflow
  const box = large ? 44 : compact ? 36 : 42
  const iconSize = large ? 21 : compact ? 17 : 20
  return (
    <span
      title={mark.label}
      aria-label={mark.label}
      style={{
        width: box,
        height: box,
        borderRadius: 8,
        background: mark.bg,
        color: mark.tone,
        border: `1px solid ${mark.tone}22`,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flex: `0 0 ${box}px`,
      }}
    >
      {mark.assetUrl ? (
        <img src={mark.assetUrl} alt="" style={{ width: iconSize, height: iconSize, objectFit: 'contain' }} />
      ) : (
        <Icon size={iconSize} strokeWidth={2.35} />
      )}
    </span>
  )
}

function AutomationProviderMark({ provider, compact = false }) {
  const mark = automationProviderMark(provider)
  return (
    <span title={mark.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0, maxWidth: '100%' }}>
      <span
        aria-hidden="true"
        style={{
          minWidth: compact ? 22 : 26,
          height: 20,
          padding: compact ? '0 4px' : '0 5px',
          borderRadius: 6,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: `${mark.tone}18`,
          color: mark.tone,
          border: `1px solid ${mark.tone}22`,
          fontSize: 9,
          fontWeight: 850,
          lineHeight: 1,
          letterSpacing: 0,
          flex: '0 0 auto',
        }}
      >
        {mark.mark}
      </span>
      {!compact && (
        <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {mark.label}
        </span>
      )}
    </span>
  )
}

function AutomationList({ automations, runningIds, selectedAutomations, onCheck, onToggle, onRun, onClone, onEdit, onDelete }) {
  return (
    <div className="automation-list-shell" role="region" aria-label="Automation list">
      <div className="automation-list-grid automation-list-head" role="row">
        <div aria-hidden="true" />
        <div>Workflow</div>
        <div>Scope</div>
        <div>Status</div>
        <div>Trigger</div>
        <div>Agent</div>
        <div>Cadence</div>
        <div>Source</div>
        <div>Channels</div>
        <div>Actions</div>
      </div>
      <div className="automation-list-body">
        {automations.map(a => {
          const trig = TRIGGERS.find(t => t.id === a.trigger?.type)
          const channels = a.delivery?.channels?.length ? a.delivery.channels.join(', ') : (a.delivery?.method || 'Not set')
          const running = runningIds.includes(a.id)
          const checked = selectedAutomations.has(a.id)
          return (
            <div key={a.id} className={`automation-list-grid automation-list-row${checked || running ? ' is-active' : ''}`} role="row">
              <div className="automation-list-check">
                <input type="checkbox" checked={checked} onChange={() => onCheck(a.id)} aria-label={`Select ${a.name}`} />
              </div>
              <div className="automation-list-main" style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <AutomationTypeIcon item={a} compact />
                <div style={{ minWidth: 0 }}>
                  <div className="automation-list-title">
                    <button
                      type="button"
                      className="record-title-button"
                      onClick={() => onEdit(a)}
                      aria-label={`Open ${a.name}`}
                    >
                      {a.name}
                    </button>
                    {running && <RunSignal compact />}
                  </div>
                  {a.description && <div className="automation-list-description">{a.description}</div>}
                </div>
              </div>
              <div><span style={a.scope === 'client' ? scopeClient : scopeInhouse}>{a.scope === 'client' ? (a.clientName || 'Client') : 'In-house'}</span></div>
              <div>
                <button onClick={() => onToggle(a)} className="automation-list-status" style={{ color: a.enabled ? 'var(--accent)' : 'var(--text-muted)' }}>
                  <span aria-hidden="true" className={a.enabled ? 'is-enabled' : ''} />
                  {a.enabled ? 'Active' : 'Paused'}
                </button>
              </div>
              <div className="automation-list-cell-muted" title={trig?.hint}>{trig?.label || a.trigger?.type || 'Manual'}</div>
              <div className="automation-list-cell-text">{a.assignedAgentName || a.assignedAgentId || 'Unassigned'}</div>
              <div className="automation-list-cell-text">{a.cadence || a.trigger?.config?.cadence || 'On demand'}</div>
              <div className="automation-list-cell-text"><AutomationProviderMark provider={a.dataSource?.provider || 'manual'} /></div>
              <div className="automation-list-cell-text">{channels}</div>
              <div className="automation-list-actions">
                <ItemActionsMenu
                  label={`Actions for ${a.name}`}
                  actions={[
                    { label: 'Run automation', onClick: () => onRun(a) },
                    { label: 'Clone automation', onClick: () => onClone(a) },
                    { label: 'Edit automation', onClick: () => onEdit(a) },
                    { label: 'Delete automation', tone: 'danger', onClick: () => onDelete(a) },
                  ]}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function AutomationCard({ a, compact = false, running = false, checked = false, onCheck, onToggle, onRun, onClone, onEdit, onDelete }) {
  const trig = TRIGGERS.find(t => t.id === a.trigger?.type)
  const channels = a.delivery?.channels?.length ? a.delivery.channels.join(', ') : (a.delivery?.method || 'Not set')
  const latestRun = Array.isArray(a.runHistory) && a.runHistory.length ? a.runHistory[0] : null
  const latestRunLabel = latestRun?.executionMode === 'executed_runner'
    ? 'Executed'
    : latestRun?.executionMode === 'guarded_preparation'
      ? 'Prepared'
      : 'Last run'
  const latestRunColor = latestRun?.executionMode === 'executed_runner'
    ? 'var(--accent)'
    : latestRun?.executionMode === 'guarded_preparation'
      ? 'var(--amber)'
      : 'var(--text-muted)'
  const actionMenu = (
    <ItemActionsMenu
      label={`Actions for ${a.name}`}
      actions={[
        { label: 'Run automation', onClick: onRun },
        { label: 'Clone automation', onClick: onClone },
        { label: 'Edit automation', onClick: onEdit },
        { label: 'Delete automation', tone: 'danger', onClick: onDelete },
      ]}
    />
  )
  return (
    <div className={`automation-card rounded-xl p-3.5 flex ${compact ? 'flex-col xl:flex-row xl:items-center' : 'flex-col'} gap-2.5`} style={{ background: 'var(--surface)', border: checked || running ? '1px solid var(--accent)' : '1px solid var(--border)', boxShadow: checked || running ? '0 0 0 3px var(--accent-soft)' : 'none' }}>
      <div className={`automation-card-summary flex items-start justify-between gap-2 ${compact ? 'w-full xl:flex-1 min-w-0' : ''}`}>
        {onCheck && <input type="checkbox" checked={checked} onChange={onCheck} onClick={e => e.stopPropagation()} aria-label={`Select ${a.name}`} style={{ marginTop: 3 }} />}
        <AutomationTypeIcon item={a} compact={compact} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2 min-w-0">
            <button
              type="button"
              className="automation-card-title record-title-button font-semibold"
              style={{ color: 'var(--text)', fontSize: 14.5, lineHeight: 1.25, overflowWrap: 'break-word', wordBreak: 'normal', minWidth: 0 }}
              onClick={onEdit}
              aria-label={`Open ${a.name}`}
            >
              {a.name}
            </button>
            {running && <RunSignal compact={compact} />}
          </div>
          {a.description && <div className="automation-card-description text-xs mt-0.5" style={{ color: 'var(--text-muted)', lineHeight: 1.35, overflowWrap: 'break-word', wordBreak: 'normal', minWidth: 0 }}>{a.description}</div>}
        </div>
        <span style={a.scope === 'client' ? scopeClient : scopeInhouse}>{a.scope === 'client' ? (a.clientName || 'Client') : 'In-house'}</span>
        {!compact && <div style={{ flex: '0 0 auto' }}>{actionMenu}</div>}
      </div>

      <div className={`flex items-center gap-3 text-xs flex-wrap ${compact ? 'xl:flex' : ''}`} style={{ color: 'var(--text-muted)' }}>
        <span title={trig?.hint}>⚡ {trig?.label || a.trigger?.type}</span>
        <span>· {a.steps?.length || 0} step{(a.steps?.length || 0) === 1 ? '' : 's'}</span>
        <span>· {a.runCount || 0} run{(a.runCount || 0) === 1 ? '' : 's'}</span>
      </div>

      <div className={`automation-meta-grid grid ${compact ? 'grid-cols-1 sm:grid-cols-2 2xl:grid-cols-4 2xl:w-[520px]' : 'grid-cols-1 sm:grid-cols-2'} gap-2 text-xs w-full`} style={{ color: 'var(--text-muted)' }}>
        <MiniMeta label="Agent" value={a.assignedAgentName || a.assignedAgentId || 'Unassigned'} />
        <MiniMeta label="Cadence" value={a.cadence || a.trigger?.config?.cadence || 'On demand'} />
        <MiniMeta label="Source" value={<AutomationProviderMark provider={a.dataSource?.provider || 'manual'} />} />
        <MiniMeta label="Channels" value={channels} />
      </div>

      {latestRun && (
        <div className="rounded-md px-2.5 py-2" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 10, color: latestRunColor, fontWeight: 750, textTransform: 'uppercase', letterSpacing: 0 }}>{latestRunLabel}</div>
          <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.35 }}>{latestRun.note || latestRun.status}</div>
          {latestRun.executionMode === 'guarded_preparation' && (
            <div style={{ fontSize: 11, color: 'var(--amber)', marginTop: 4 }}>
              Guarded prep only: no external send, CRM write, scheduling, or spend action was executed.
            </div>
          )}
          {latestRun.output?.preparedSections?.length > 0 && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
              {latestRun.output.preparedSections.slice(0, 3).join(' · ')}
            </div>
          )}
        </div>
      )}

      <div className={`automation-card-footer flex items-center justify-between gap-2 ${compact ? '' : 'pt-1'}`} style={{ borderTop: compact ? 'none' : '1px solid var(--border)' }}>
        <button onClick={onToggle} className="flex items-center gap-1.5" style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '6px 0' }}>
          <span style={{ width: 30, height: 17, borderRadius: 9, background: a.enabled ? 'var(--accent)' : 'var(--surface3, var(--border))', position: 'relative', transition: 'background .15s', display: 'inline-block' }}>
            <span style={{ position: 'absolute', top: 2, left: a.enabled ? 15 : 2, width: 13, height: 13, borderRadius: 7, background: '#fff', transition: 'left .15s' }} />
          </span>
          <span style={{ fontSize: 12, fontWeight: 600, color: a.enabled ? 'var(--accent)' : 'var(--text-muted)' }}>{a.enabled ? 'Active' : 'Paused'}</span>
        </button>
        <div className="flex gap-1.5">
          <button type="button" onClick={onRun} title="Run guarded proof" aria-label={`Run ${a.name}`} style={btnIconSm}>
            <Play size={13} />
          </button>
          {compact && actionMenu}
        </div>
      </div>
    </div>
  )
}

function IconButton({ label, icon: Icon, onClick, danger = false }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      style={{ ...btnIconSm, color: danger ? '#b4452e' : 'var(--text-muted)' }}
      onClick={onClick}
    >
      <Icon size={14} />
    </button>
  )
}

function RunSignal({ compact }) {
  return (
    <span className="automation-run-signal" title="Automation running" aria-label="Automation running">
      <Mail size={compact ? 12 : 13} className="automation-run-mail" />
      <Send size={compact ? 12 : 13} className="automation-run-send" />
      <style jsx>{`
        .automation-run-signal {
          position: relative;
          width: ${compact ? 34 : 42}px;
          height: 18px;
          display: inline-block;
          flex: 0 0 auto;
          overflow: hidden;
          border-radius: 999px;
          background: var(--accent-soft);
        }
        .automation-run-mail, .automation-run-send {
          position: absolute;
          top: 3px;
          color: var(--accent);
          animation: driftSend 1.2s ease-in-out infinite;
        }
        .automation-run-mail { left: 5px; opacity: .9; }
        .automation-run-send { left: 18px; animation-delay: .25s; }
        @keyframes driftSend {
          0% { transform: translateX(-3px) translateY(2px); opacity: .25; }
          45% { opacity: 1; }
          100% { transform: translateX(12px) translateY(-2px); opacity: .25; }
        }
      `}</style>
    </span>
  )
}

function MiniMeta({ label, value }) {
  return (
    <div className="min-w-0 rounded-md px-2 py-1.5" style={{ background: 'var(--surface2)' }}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: 0, color: 'var(--text-muted)' }}>{label}</div>
      <div className="automation-mini-meta-value" style={{ fontSize: 12, fontWeight: 650, color: 'var(--text)', lineHeight: 1.25, overflowWrap: 'break-word', wordBreak: 'normal' }}>{value}</div>
    </div>
  )
}

function AutomationEditor({ initial, accounts, onCancel, onSave }) {
  const [name, setName] = useState(initial?.name || '')
  const [description, setDescription] = useState(initial?.description || '')
  const [scope, setScope] = useState(initial?.scope || 'in-house')
  const [tenantId, setTenantId] = useState(initial?.tenantId || '')
  const [serviceType, setServiceType] = useState(initial?.serviceType || 'custom')
  const [assignedAgentId, setAssignedAgentId] = useState(initial?.assignedAgentId || 'ContentStudio-promoter')
  const [cadence, setCadence] = useState(initial?.cadence || initial?.trigger?.config?.cadence || '')
  const [dataProvider, setDataProvider] = useState(initial?.dataSource?.provider || 'apify')
  const [dataQuery, setDataQuery] = useState(initial?.dataSource?.query || '')
  const [dataFields, setDataFields] = useState((initial?.dataSource?.fields || []).join(', '))
  const [outputFormat, setOutputFormat] = useState(initial?.output?.format || 'draft')
  const [deliveryMethod, setDeliveryMethod] = useState(initial?.delivery?.method || 'draft')
  const [deliveryChannels, setDeliveryChannels] = useState(initial?.delivery?.channels || ['email'])
  const [deliveryRecipients, setDeliveryRecipients] = useState((initial?.delivery?.recipients || []).join(', '))
  const [emailSubject, setEmailSubject] = useState(initial?.campaign?.subject || '')
  const [senderProfile, setSenderProfile] = useState(initial?.campaign?.senderProfile || '')
  const [campaignCadence, setCampaignCadence] = useState(initial?.campaign?.cadence || '')
  const [approvalRequired, setApprovalRequired] = useState(initial?.approval?.required ?? true)
  const [approvalApprover, setApprovalApprover] = useState(initial?.approval?.approver || 'Carl')
  const [metricsText, setMetricsText] = useState((initial?.metrics || []).join(', '))
  const [triggerType, setTriggerType] = useState(initial?.trigger?.type || 'manual')
  const [steps, setSteps] = useState(initial?.steps || [])
  const [busy, setBusy] = useState(false)
  // Marketplace listing (client menu): only verified AND priced templates
  // appear in the portal. Verified toggle is gated on >=1 successful run.
  const [mkVerified, setMkVerified] = useState(initial?.verified === true)
  const [mkMonthlyFee, setMkMonthlyFee] = useState(initial?.monthlyFee ?? '')
  const [mkSetupFee, setMkSetupFee] = useState(initial?.setupFee ?? '')
  const [mkIncludedRuns, setMkIncludedRuns] = useState(initial?.includedRuns ?? '')
  const hasSuccessfulRun = !!initial?.lastRunAt

  const addStep = () => setSteps(s => [...s, { id: `step_${Date.now().toString(36)}`, label: '', kind: 'action' }])
  const updateStep = (i, patch) => setSteps(s => s.map((st, idx) => idx === i ? { ...st, ...patch } : st))
  const removeStep = (i) => setSteps(s => s.filter((_, idx) => idx !== i))
  const toggleChannel = (id) => setDeliveryChannels(channels => (
    channels.includes(id) ? channels.filter(ch => ch !== id) : [...channels, id]
  ))

  const submit = async () => {
    if (!name.trim()) return
    setBusy(true)
    const client = accounts.find(a => a.id === tenantId)
    const agent = AGENTS.find(a => a.id === assignedAgentId)
    const draft = {
      ...(initial?.id ? { id: initial.id } : {}),
      name: name.trim(), description: description.trim(), scope,
      tenantId: scope === 'client' ? (tenantId || null) : null,
      clientName: scope === 'client' ? (client?.name || '') : '',
      serviceType,
      assignedAgentId,
      assignedAgentName: agent?.name || '',
      cadence: cadence.trim(),
      dataSource: { provider: dataProvider, query: dataQuery.trim(), fields: splitList(dataFields) },
      output: { format: outputFormat, destination: outputFormat },
      approval: { required: approvalRequired, approver: approvalRequired ? approvalApprover.trim() : '' },
      delivery: { method: deliveryMethod.trim() || outputFormat, channels: deliveryChannels, recipients: splitList(deliveryRecipients) },
      campaign: {
        subject: emailSubject.trim(),
        senderProfile: senderProfile.trim(),
        cadence: campaignCadence.trim(),
      },
      metrics: splitList(metricsText),
      trigger: { type: triggerType, config: { cadence: cadence.trim() } },
      steps: steps.filter(s => s.label.trim()),
      verified: mkVerified === true && hasSuccessfulRun,
      monthlyFee: mkMonthlyFee === '' ? null : Number(mkMonthlyFee),
      setupFee: mkSetupFee === '' ? null : Number(mkSetupFee),
      includedRuns: mkIncludedRuns === '' ? null : Number(mkIncludedRuns),
    }
    try { await onSave(draft) } finally { setBusy(false) }
  }

  const applyTemplate = (type) => {
    const tpl = SERVICE_TEMPLATES[type]
    setServiceType(type)
    if (!tpl) return
    setName(tpl.name)
    setDescription(tpl.description)
    setScope(tpl.scope)
    setAssignedAgentId(tpl.assignedAgentId)
    setCadence(tpl.cadence)
    setTriggerType(tpl.trigger.type)
    setDataProvider(tpl.dataSource.provider)
    setDataQuery(tpl.dataSource.query)
    setDataFields(tpl.dataSource.fields.join(', '))
    setOutputFormat(tpl.output.format)
    setDeliveryMethod(tpl.delivery.method)
    setDeliveryChannels(tpl.delivery.channels || ['email'])
    setDeliveryRecipients((tpl.delivery.recipients || []).join(', '))
    setEmailSubject(tpl.campaign?.subject || '')
    setSenderProfile(tpl.campaign?.senderProfile || '')
    setCampaignCadence(tpl.campaign?.cadence || '')
    setApprovalRequired(tpl.approval.required)
    setApprovalApprover(tpl.approval.approver)
    setMetricsText(tpl.metrics.join(', '))
    setSteps(tpl.steps)
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-4 items-start">
      <div className="rounded-xl p-4 flex flex-col gap-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <Field label="Template">
          <div className="flex items-center gap-2">
            <AutomationTypeIcon item={{ serviceType }} compact />
            <ThemedSelect style={inp} value={serviceType} onChange={e => applyTemplate(e.target.value)}>
              {SERVICE_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </ThemedSelect>
          </div>
        </Field>
        <Field label="Name">
          <input style={inp} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Weekly competitor research digest" />
        </Field>
        <Field label="What does it do?">
          <textarea style={{ ...inp, minHeight: 64, resize: 'vertical' }} value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe the workflow in a sentence or two." />
        </Field>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Data source">
            <ThemedSelect style={inp} value={dataProvider} onChange={e => setDataProvider(e.target.value)}>
              {PROVIDERS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </ThemedSelect>
          </Field>
          <Field label="Output format">
            <ThemedSelect style={inp} value={outputFormat} onChange={e => setOutputFormat(e.target.value)}>
              {OUTPUT_FORMATS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
            </ThemedSelect>
          </Field>
        </div>

        <Field label="Research parameters">
          <textarea style={{ ...inp, minHeight: 72, resize: 'vertical' }} value={dataQuery} onChange={e => setDataQuery(e.target.value)} placeholder="Market, industry, beat, lead criteria, excluded sources, or customer instructions." />
        </Field>

        <Field label="Data fields">
          <input style={inp} value={dataFields} onChange={e => setDataFields(e.target.value)} placeholder="name, email, outlet, beat, notes" />
        </Field>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Delivery method">
            <input style={inp} value={deliveryMethod} onChange={e => setDeliveryMethod(e.target.value)} placeholder="draft, email digest, CSV, CRM import" />
          </Field>
          <Field label="Recipients">
            <input style={inp} value={deliveryRecipients} onChange={e => setDeliveryRecipients(e.target.value)} placeholder="client email, Carl, approval queue" />
          </Field>
        </div>

        <div>
          <span className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>Delivery channels</span>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {DELIVERY_CHANNELS.map(channel => {
              const selected = deliveryChannels.includes(channel.id)
              return (
                <button
                  key={channel.id}
                  type="button"
                  onClick={() => toggleChannel(channel.id)}
                  style={{
                    minHeight: 36, borderRadius: 8, border: selected ? '1px solid var(--accent)' : '1px solid var(--border)',
                    background: selected ? 'var(--accent-soft)' : 'var(--surface2)',
                    color: selected ? 'var(--accent)' : 'var(--text-muted)',
                    fontSize: 12.5, fontWeight: 650, cursor: 'pointer',
                  }}
                >
                  {channel.label}
                </button>
              )
            })}
          </div>
        </div>

        {(serviceType === 'email-campaign' || outputFormat === 'email-campaign' || deliveryChannels.includes('email-campaign')) && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Email subject">
              <input style={inp} value={emailSubject} onChange={e => setEmailSubject(e.target.value)} placeholder="Subject line or campaign theme" />
            </Field>
            <Field label="Sender profile">
              <input style={inp} value={senderProfile} onChange={e => setSenderProfile(e.target.value)} placeholder="Client, Carl, Mark, Cameron" />
            </Field>
            <Field label="Campaign cadence">
              <input style={inp} value={campaignCadence} onChange={e => setCampaignCadence(e.target.value)} placeholder="Initial + follow-up, monthly nurture" />
            </Field>
          </div>
        )}

        <Field label="Success metrics">
          <input style={inp} value={metricsText} onChange={e => setMetricsText(e.target.value)} placeholder="contacts matched, leads delivered, replies, pickups" />
        </Field>

        <div>
          <span className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>Steps</span>
          <div className="flex flex-col gap-2">
            {steps.length === 0 && <div className="text-xs" style={{ color: 'var(--text-muted)' }}>No steps yet — add the actions this workflow performs, in order.</div>}
            {steps.map((st, i) => (
              <div key={st.id} className="flex items-center gap-2">
                <span style={{ fontSize: 12, color: 'var(--text-muted)', width: 18, textAlign: 'right' }}>{i + 1}.</span>
                <input style={{ ...inp, minHeight: 36 }} value={st.label} onChange={e => updateStep(i, { label: e.target.value })} placeholder="Describe this step" />
                <ThemedSelect style={{ ...inp, minHeight: 36, width: 130 }} value={st.kind} onChange={e => updateStep(i, { kind: e.target.value })}>
                  <option value="action">Action</option>
                  <option value="fetch">Fetch / research</option>
                  <option value="generate">Generate content</option>
                  <option value="notify">Send / notify</option>
                  <option value="wait">Wait</option>
                </ThemedSelect>
                <button style={{ ...btnGhostSm, color: '#b4452e' }} onClick={() => removeStep(i)}>×</button>
              </div>
            ))}
            <div><button style={btnGhostSm} onClick={addStep}>+ Add step</button></div>
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <button style={btnPrimary} onClick={submit} disabled={busy || !name.trim()}>{busy ? 'Saving…' : 'Save automation'}</button>
          <button style={btnGhost} onClick={onCancel}>Cancel</button>
        </div>
      </div>

      <div className="rounded-xl p-4 flex flex-col gap-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div>
          <span className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>Who runs it?</span>
          <div className="flex gap-1 p-1 rounded-lg" style={{ background: 'var(--surface2)' }}>
            {[{ id: 'in-house', label: 'In-house' }, { id: 'client', label: 'For a client' }].map(o => (
              <button key={o.id} onClick={() => setScope(o.id)} style={{
                flex: 1, minHeight: 34, fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 7, cursor: 'pointer',
                background: scope === o.id ? 'var(--accent)' : 'transparent', color: scope === o.id ? 'var(--accent-text)' : 'var(--text)',
              }}>{o.label}</button>
            ))}
          </div>
        </div>

        {scope === 'client' && (
          <Field label="Client account">
            <ThemedSelect style={inp} value={tenantId} onChange={e => setTenantId(e.target.value)}>
              <option value="">Select a client…</option>
              {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </ThemedSelect>
          </Field>
        )}

        <div className="rounded-lg p-3 flex flex-col gap-2.5" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
          <span className="block text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Marketplace listing (client menu)</span>
          <label className="flex items-center gap-2 text-sm" style={{ opacity: hasSuccessfulRun ? 1 : 0.55 }}>
            <input type="checkbox" checked={mkVerified} disabled={!hasSuccessfulRun} onChange={e => setMkVerified(e.target.checked)} />
            Verified — show in the client Marketplace
          </label>
          {!hasSuccessfulRun && (
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Run this automation successfully once to enable verification.</div>
          )}
          <div className="flex gap-2">
            <Field label="Monthly $">
              <input style={{ ...inp, minHeight: 36 }} type="number" min="0" value={mkMonthlyFee} onChange={e => setMkMonthlyFee(e.target.value)} placeholder="e.g. 149" />
            </Field>
            <Field label="Setup $">
              <input style={{ ...inp, minHeight: 36 }} type="number" min="0" value={mkSetupFee} onChange={e => setMkSetupFee(e.target.value)} placeholder="0" />
            </Field>
            <Field label="Runs incl.">
              <input style={{ ...inp, minHeight: 36 }} type="number" min="0" value={mkIncludedRuns} onChange={e => setMkIncludedRuns(e.target.value)} placeholder="∞" />
            </Field>
          </div>
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Listed for clients only when verified AND a monthly price is set.</div>
        </div>

        <Field label="Assigned agent">
          <ThemedSelect style={inp} value={assignedAgentId} onChange={e => setAssignedAgentId(e.target.value)}>
            {AGENTS.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </ThemedSelect>
        </Field>

        <Field label="Trigger">
          <ThemedSelect style={inp} value={triggerType} onChange={e => setTriggerType(e.target.value)}>
            {TRIGGERS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </ThemedSelect>
          <span className="block text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{TRIGGERS.find(t => t.id === triggerType)?.hint}</span>
        </Field>

        <Field label="Cadence">
          <input style={inp} value={cadence} onChange={e => setCadence(e.target.value)} placeholder="Daily, weekly, monthly, first Monday" />
        </Field>

        <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text)' }}>
          <input type="checkbox" checked={approvalRequired} onChange={e => setApprovalRequired(e.target.checked)} />
          Require approval before delivery
        </label>

        {approvalRequired && (
          <Field label="Approver">
            <input style={inp} value={approvalApprover} onChange={e => setApprovalApprover(e.target.value)} placeholder="Carl, client, account owner" />
          </Field>
        )}
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>{label}</span>
      {children}
    </label>
  )
}

function Toast({ toast }) {
  if (!toast) return null
  return (
    <div className="fixed top-4 left-1/2 z-50 px-4 py-3 rounded-lg" style={{
      transform: 'translateX(-50%)',
      background: toast.kind === 'err' ? '#b4452e' : 'var(--accent)', color: '#fff',
      fontSize: 14, fontWeight: 600, boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
    }}>{toast.msg}</div>
  )
}

const scopeInhouse = { fontSize: 10.5, fontWeight: 600, padding: '3px 9px', borderRadius: 999, background: 'var(--surface2)', color: 'var(--text-muted)', whiteSpace: 'nowrap' }
const scopeClient = { fontSize: 10.5, fontWeight: 600, padding: '3px 9px', borderRadius: 999, background: 'var(--accent-soft)', color: 'var(--accent)', whiteSpace: 'nowrap' }
const inp = { background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', width: '100%', padding: '9px 12px', borderRadius: 8, fontSize: 14, outline: 'none', minHeight: 40, fontFamily: 'inherit' }
const btnPrimary = { background: 'var(--accent)', color: 'var(--accent-text)', border: 'none', padding: '9px 16px', borderRadius: 8, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', minHeight: 40 }
const btnGhost = { background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', padding: '7px 14px', borderRadius: 8, fontSize: 13, cursor: 'pointer', minHeight: 40 }
const btnGhostSm = { background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)', padding: '5px 10px', borderRadius: 7, fontSize: 12.5, cursor: 'pointer' }
const btnIconSm = { background: 'transparent', border: '1px solid var(--border)', width: 32, height: 30, borderRadius: 7, cursor: 'pointer', display: 'grid', placeItems: 'center' }
