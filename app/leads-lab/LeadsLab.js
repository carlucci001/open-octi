'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { startTrackedLeadRun } from '@/lib/lead-run-client'
import { formatVerticalSweepResult } from '@/lib/lead-sweep-outcome'
import { DEFAULT_APOLLO_PAID_SEARCHES, buildLeadVendorRequest, normalizeApolloPaidSearches, paidSearchLimitFromConfig } from '@/lib/lead-paid-search-limit'
import PageHeader from '../components/PageHeader'
import ThemedSelect from '../components/ThemedSelect'
import { FlaskConical } from 'lucide-react'
import { buildFarringtonLeadQuery, FARRINGTON_LEAD_VERTICALS } from '@/lib/farrington-lead-verticals'
import { useCachedData } from '@/lib/useCachedData'
import { defaultLeadListForDestination, leadListBelongsToDestination } from '@/lib/lead-list-routing'
import LeadSourcesPanel from './LeadSourcesPanel'
import CampaignSignalsPanel from './CampaignSignalsPanel'
import { isOpenOcti } from '@/lib/edition'

const OPENOCTI = isOpenOcti()

function describeRun(run) {
  const params = run?.params || {}
  const what = run?.kind === 'organization'
    ? (params.campaign || 'Organization campaign')
    : (params.category || 'Lead sweep')
  const where = params.area || params.location || ''
  return `${params.limit || '?'} x ${what}${where ? ` — ${where}` : ''}`
}

function runOutcome(run) {
  const when = run?.createdAt ? new Date(run.createdAt).toLocaleString() : ''
  if (run?.status === 'running') return `Running — ${run.phaseLabel || 'working'}`
  if (run?.status === 'failed') return `Failed — ${run.error || 'unknown error'}${when ? ` · ${when}` : ''}`
  const created = run?.result?.created ?? 0
  return `${created} created${when ? ` · ${when}` : ''}`
}

const VERTICAL_SOURCE_TOOLS = [
  { id: 'apify-google-search', label: 'Apify Web Search', status: 'active' },
  { id: 'apify-google-maps', label: 'Apify Maps / Places', status: 'queued' },
  { id: 'industry-directories', label: 'Industry directories', status: 'queued' },
  { id: 'public-records', label: 'Public records', status: 'queued' },
  { id: 'manual-import', label: 'Manual / CSV import', status: 'active' },
  { id: 'crm-suppression', label: 'CRM suppression list', status: 'active' },
]

const ORGANIZATION_SOURCE_TOOLS = [
  { id: 'web-research', label: 'Web research', status: 'active' },
  { id: 'organization-directories', label: 'Organization directories', status: 'active' },
  { id: 'crm-suppression', label: 'CRM suppression list', status: 'active' },
]

const COMMAND_CENTER_DESTINATIONS = [
  { id: 'farrington_dev', label: 'Farrington Development' },
  { id: 'ContentStudio', label: 'ContentStudio' },
  { id: 'sample_business', label: 'WNC Times' },
  { id: 'client_automation', label: 'Client automation product' },
  { id: 'client_command_center', label: 'Client Command Center' },
  { id: 'review_only', label: 'Review only / do not promote' },
]

const OPENOCTI_DESTINATIONS = [
  { id: 'your_business', label: 'Your business' },
  { id: 'client_a', label: 'Client A' },
  { id: 'review_only', label: 'Review only / do not promote' },
]

const DESTINATIONS = OPENOCTI ? OPENOCTI_DESTINATIONS : COMMAND_CENTER_DESTINATIONS
const CRM_DESTINATION_BRANDS = new Set(OPENOCTI ? ['your_business', 'client_a'] : ['farrington_dev', 'ContentStudio', 'sample_business'])
const FARRINGTON_SERVICE_LINES = new Set(['web-development', 'ai-automation', 'crm-command-center', 'custom-software', 'app-build', 'workflow-integration', 'api-data-integration', 'ecommerce', 'seo-marketing-automation', 'hosting-maintenance', 'consulting-scope'])

const CAMPAIGN_MODES = [
  { id: 'organization', label: 'Organization campaign' },
  { id: 'vertical', label: 'Vertical sweep' },
]

const ORGANIZATION_SCOPES = [
  { id: 'national', label: 'National' },
  { id: 'region', label: 'Region' },
  { id: 'state', label: 'State' },
  { id: 'metro', label: 'Metro' },
  { id: 'county', label: 'County' },
]

const COMMAND_CENTER_ORGANIZATION_CAMPAIGNS = [
  {
    id: 'ContentStudio-tda',
    label: 'ContentStudio - Tourist Development Authorities',
    destination: 'ContentStudio',
    brandContext: 'ContentStudio',
    serviceLine: 'tourism-authority',
    campaign: 'ContentStudio-tda',
    campaignType: 'ContentStudio_demo',
    organizationType: 'Tourist Development Authority / CVB / DMO',
    tag: 'tda',
    offer: 'ContentStudio local publisher and destination storytelling platform',
    fit: 'Prioritize tourism offices, convention and visitor bureaus, destination marketing organizations, and chambers with active tourism programs.',
    query: '"tourist development authority" OR "convention and visitors bureau" OR "destination marketing organization" OR "tourism board"',
    mustHave: 'tourism, visitor, destination, contact, staff',
    exclude: 'jobs, careers, agenda, minutes, grant application',
    notes: 'Prioritize organizations that publish visitor news, events, grants, destination guides, or partner/sponsor content.',
  },
  {
    id: 'ContentStudio-chambers',
    label: 'ContentStudio - Chambers and regional business groups',
    destination: 'ContentStudio',
    brandContext: 'ContentStudio',
    serviceLine: 'publisher-onboarding',
    campaign: 'ContentStudio-chambers',
    campaignType: 'ContentStudio_demo',
    organizationType: 'Chamber / regional business association',
    tag: 'chamber',
    offer: 'ContentStudio community publishing and sponsor workflow',
    fit: 'Prioritize chambers and business associations with member news, events, sponsors, newsletters, and public directories.',
    query: '"chamber of commerce" OR "business association" OR "economic development partnership"',
    mustHave: 'members, events, sponsors, newsletter, contact',
    exclude: 'jobs, careers, login, board minutes',
    notes: 'Look for groups that already publish member stories or event calendars and could sell sponsor placements.',
  },
  {
    id: 'command-center-associations',
    label: 'Command Center - Associations with chapters',
    destination: 'farrington_dev',
    brandContext: 'farrington_dev',
    serviceLine: 'crm-command-center',
    campaign: 'fd-association-chapters',
    campaignType: 'farrington_dev',
    organizationType: 'National association / chapter network',
    tag: 'chapter-network',
    offer: 'CRM command center for chapter follow-up, member intake, and operations',
    fit: 'Prioritize organizations with many chapters, messy contact routing, member inquiries, and manual follow-up.',
    query: '"chapters" "association" "contact" "directory"',
    mustHave: 'chapters, directory, contact, members',
    exclude: 'jobs, bylaws, login, pdf only',
    notes: 'Good fit when national and local chapter contacts are both visible.',
  },
]

const OPENOCTI_ORGANIZATION_CAMPAIGNS = [
  {
    id: 'client-a-tda',
    label: 'Client A - Tourist Development Authorities',
    destination: 'client_a',
    brandContext: 'client_a',
    serviceLine: 'tourism-authority',
    campaign: 'client-a-tda',
    campaignType: 'client_demo',
    organizationType: 'Tourist Development Authority / CVB / DMO',
    tag: 'tda',
    offer: 'Local publishing and destination storytelling platform',
    fit: 'Prioritize tourism offices, convention and visitor bureaus, destination marketing organizations, and chambers with active tourism programs.',
    query: '"tourist development authority" OR "convention and visitors bureau" OR "destination marketing organization" OR "tourism board"',
    mustHave: 'tourism, visitor, destination, contact, staff',
    exclude: 'jobs, careers, agenda, minutes, grant application',
    notes: 'Prioritize organizations that publish visitor news, events, grants, destination guides, or partner content.',
  },
  {
    id: 'client-a-chambers',
    label: 'Client A - Chambers and regional business groups',
    destination: 'client_a',
    brandContext: 'client_a',
    serviceLine: 'publisher-onboarding',
    campaign: 'client-a-chambers',
    campaignType: 'client_demo',
    organizationType: 'Chamber / regional business association',
    tag: 'chamber',
    offer: 'Community publishing and sponsor workflow',
    fit: 'Prioritize chambers and business associations with member news, events, sponsors, newsletters, and public directories.',
    query: '"chamber of commerce" OR "business association" OR "economic development partnership"',
    mustHave: 'members, events, sponsors, newsletter, contact',
    exclude: 'jobs, careers, login, board minutes',
    notes: 'Look for groups that already publish member stories or event calendars and could use repeatable sponsor workflows.',
  },
  {
    id: 'your-business-associations',
    label: 'Your business - Associations with chapters',
    destination: 'your_business',
    brandContext: 'your_business',
    serviceLine: 'crm-command-center',
    campaign: 'your-business-association-chapters',
    campaignType: 'your_business',
    organizationType: 'National association / chapter network',
    tag: 'chapter-network',
    offer: 'CRM workspace for chapter follow-up, member intake, and operations',
    fit: 'Prioritize organizations with many chapters, complex contact routing, member inquiries, and manual follow-up.',
    query: '"chapters" "association" "contact" "directory"',
    mustHave: 'chapters, directory, contact, members',
    exclude: 'jobs, bylaws, login, pdf only',
    notes: 'Good fit when national and local chapter contacts are both visible.',
  },
]

const ORGANIZATION_CAMPAIGNS = OPENOCTI ? OPENOCTI_ORGANIZATION_CAMPAIGNS : COMMAND_CENTER_ORGANIZATION_CAMPAIGNS

function splitTerms(value = '') {
  return String(value || '').split(',').map(v => v.trim()).filter(Boolean)
}

function slugify(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

const NEW_CATEGORY_ID = '__new_category__'

// Turns a saved (or in-progress) custom lead type into the same shape as a
// built-in vertical so every downstream consumer keeps working unchanged.
function customVerticalFrom(input = {}) {
  const label = String(input.label || '').trim() || 'Custom category'
  const terms = String(input.query || '').trim()
  const query = terms
    ? (terms.includes('{location}') ? terms : `{location} ${terms}`)
    : `{location} ${label} owner phone website`
  return {
    id: String(input.id || '').trim() || slugify(label) || 'custom-category',
    rank: 99,
    label,
    custom: true,
    serviceLine: 'ai-automation',
    offer: String(input.offer || '').trim() || `${label} lead development`,
    caveat: String(input.caveat || '').trim() || 'Custom lead type you added in Leads Lab. Tune must-have and exclude terms to sharpen it.',
    leadWith: String(input.leadWith || '').trim() || 'AI intake, CRM follow-up, website cleanup, and speed-to-lead automation.',
    query,
  }
}

function buildQualityQuery({ vertical, location, mustHave, exclude }) {
  const base = buildFarringtonLeadQuery(vertical, location || 'United States')
  const required = splitTerms(mustHave).join(' ')
  const excluded = splitTerms(exclude).map(term => `-${JSON.stringify(term)}`).join(' ')
  return [base, required, excluded].filter(Boolean).join(' ')
}

function buildOrganizationQuery({ campaign, scope, location, mustHave, exclude }) {
  const area = scope === 'national' ? 'United States' : location || 'United States'
  const required = splitTerms(mustHave).join(' ')
  const excluded = splitTerms(exclude).map(term => `-${JSON.stringify(term)}`).join(' ')
  return [area, campaign.query, required, excluded].filter(Boolean).join(' ')
}

function campaignTypeForDestination(brandContext, fallback) {
  if (OPENOCTI) return fallback
  if (brandContext === 'ContentStudio') return 'ContentStudio_demo'
  if (brandContext === 'sample_business') return 'sample_business'
  if (brandContext === 'farrington_dev') return 'farrington_dev'
  return fallback
}

function serviceLineForDestination(campaign, brandContext) {
  if (OPENOCTI) return campaign.serviceLine
  if (brandContext === 'sample_business') return campaign.tag === 'tda' ? 'tda' : 'partnership'
  if (brandContext === 'farrington_dev' && !FARRINGTON_SERVICE_LINES.has(campaign.serviceLine)) return 'crm-command-center'
  return campaign.serviceLine
}

function findMatchingLeadList(campaign, leadLists = []) {
  const termsByCampaign = {
    'ContentStudio-chambers': ['chamber'],
    'ContentStudio-tda': ['tourism', 'tourist', 'visitor', 'destination', 'tda', 'cvb'],
    'command-center-associations': ['association', 'chapter'],
  }
  const terms = termsByCampaign[campaign?.id] || [campaign?.tag, campaign?.organizationType]
  return leadLists.find(list => {
    const text = `${list.id || ''} ${list.name || ''}`.toLowerCase()
    return terms.filter(Boolean).some(term => text.includes(String(term).toLowerCase()))
  }) || null
}

export default function LeadsLab({ onNavigate }) {
  const leadListsQ = useCachedData('/api/lead-lists', { extract: j => j?.leadLists || [] })
  const usersQ = useCachedData('/api/users', { extract: j => j?.users || [] })
  const leadCategoriesQ = useCachedData('/api/lead-categories', { extract: j => j?.leadCategories || [] })
  const presetsQ = useCachedData('/api/lead-run-presets', { extract: j => j || {} })
  const sourcesQ = useCachedData('/api/lead-signals/sources', { extract: j => j?.sources || [] })
  const leadLists = leadListsQ.data || []
  const users = usersQ.data || []
  const customCategories = leadCategoriesQ.data || []
  const [mode, setMode] = useState('organization')
  const [category, setCategory] = useState(FARRINGTON_LEAD_VERTICALS[0]?.id || 'home-services')
  const [count, setCount] = useState(10)
  const [location, setLocation] = useState('United States')
  const [destination, setDestination] = useState(DESTINATIONS[0].id)
  const [selectedLeadListId, setSelectedLeadListId] = useState('')
  const [sourceTool, setSourceTool] = useState('web-research')
  // Which kind of lead comes back. 'apify' walks Google Maps and returns
  // businesses (no person, no title, no work email). 'apollo' returns named
  // decision-makers with work emails. Default stays on the old behaviour.
  const [leadSource, setLeadSource] = useState('apify')
  const [maxPaidBatches, setMaxPaidBatches] = useState(DEFAULT_APOLLO_PAID_SEARCHES)
  const [organizationPreset, setOrganizationPreset] = useState(ORGANIZATION_CAMPAIGNS[0].id)
  const [organizationScope, setOrganizationScope] = useState('national')
  const [mustHave, setMustHave] = useState('owner, phone, website')
  const [exclude, setExclude] = useState('jobs, hiring, directory')
  const [notes, setNotes] = useState('')
  const [running, setRunning] = useState(false)
  const [assigningLeadList, setAssigningLeadList] = useState(false)
  const [newListName, setNewListName] = useState('')
  const [creatingList, setCreatingList] = useState(false)
  const [draftCategoryLabel, setDraftCategoryLabel] = useState('')
  const [draftCategoryTerms, setDraftCategoryTerms] = useState('')
  const [savingCategory, setSavingCategory] = useState(false)
  const [result, setResult] = useState(null)
  const [activeRunId, setActiveRunId] = useState(null)
  const [selectedPresetId, setSelectedPresetId] = useState('')
  const [presetName, setPresetName] = useState('')
  const [savingPreset, setSavingPreset] = useState(false)
  const [recentRuns, setRecentRuns] = useState([])
  const [workspaceTab, setWorkspaceTab] = useState('build')

  // These guard the two effects below that overwrite form fields on change.
  // Value-based rather than time-based: each holds the exact value we are about
  // to apply, so restoring a saved setup survives, and a genuine switch made
  // afterwards still gets its defaults.
  const suppressDefaultsFor = useRef(null)
  const suppressCategorySeedFor = useRef(null)
  const hydratedRef = useRef(false)

  const savedPresets = presetsQ.data?.leadRunPresets || []

  const isNewCategory = category === NEW_CATEGORY_ID
  const savedCategory = customCategories.find(c => c.id === category) || null
  const builtInVertical = FARRINGTON_LEAD_VERTICALS.find(v => v.id === category) || null
  const trimmedDraftLabel = draftCategoryLabel.trim()
  const vertical = useMemo(() => {
    if (isNewCategory || savedCategory) {
      return customVerticalFrom({
        id: savedCategory?.id || '',
        label: trimmedDraftLabel || savedCategory?.label || '',
        query: draftCategoryTerms,
      })
    }
    return builtInVertical || FARRINGTON_LEAD_VERTICALS[0]
  }, [isNewCategory, savedCategory, builtInVertical, trimmedDraftLabel, draftCategoryTerms])
  const resolvedSourcesQ = useCachedData(`/api/lead-signals/resolve?type=${encodeURIComponent(vertical.id || vertical.label || '')}&location=${encodeURIComponent(location)}`, { extract: j => j || { sources: [] } })
  const organizationCampaign = ORGANIZATION_CAMPAIGNS.find(c => c.id === organizationPreset) || ORGANIZATION_CAMPAIGNS[0]
  const requestedLeadCount = Math.max(1, Number(count) || 10)
  const hasProvenPublicRecords = (sourcesQ.data || []).some(source => source.proving?.status === 'proven')
  const activeSourceTools = mode === 'organization' ? ORGANIZATION_SOURCE_TOOLS : VERTICAL_SOURCE_TOOLS.map(tool => tool.id === 'public-records' ? { ...tool, status: hasProvenPublicRecords ? 'active' : 'queued' } : tool)
  const selectedDestination = DESTINATIONS.find(d => d.id === destination) || DESTINATIONS[0]
  const destinationBrandContext = CRM_DESTINATION_BRANDS.has(destination) ? destination : organizationCampaign.brandContext
  const destinationCampaignType = campaignTypeForDestination(destinationBrandContext, organizationCampaign.campaignType)
  const destinationServiceLine = serviceLineForDestination(organizationCampaign, destinationBrandContext)
  const selectedLeadList = leadLists.find(list => list.id === selectedLeadListId) || null
  const selectedLeadListAssignee = selectedLeadList?.visibleToAll
    ? ''
    : selectedLeadList?.assignedUserIds?.[0] || selectedLeadList?.ownerUserId || ''
  const query = useMemo(() => {
    if (mode === 'organization') return buildOrganizationQuery({ campaign: organizationCampaign, scope: organizationScope, location, mustHave, exclude })
    return buildQualityQuery({ vertical, location, mustHave, exclude })
  }, [mode, organizationCampaign, organizationScope, vertical, location, mustHave, exclude])

  useEffect(() => {
    const pair = `${mode}|${organizationCampaign.id}`
    if (suppressDefaultsFor.current === pair) {
      suppressDefaultsFor.current = null
      return
    }
    suppressDefaultsFor.current = null
    if (mode === 'organization') {
      setSourceTool('web-research')
      setDestination(organizationCampaign.destination)
      setMustHave(organizationCampaign.mustHave)
      setExclude(organizationCampaign.exclude)
      setNotes(organizationCampaign.notes)
    } else {
      setSourceTool('apify-google-search')
      setDestination(DESTINATIONS[0].id)
      setMustHave('owner, phone, website')
      setExclude('jobs, hiring, directory')
      setNotes('')
    }
  }, [mode, organizationCampaign])

  // Seed the custom-category editor from whatever the category select points at.
  // Keyed on `category` only so a background refresh never clobbers typing.
  useEffect(() => {
    if (suppressCategorySeedFor.current === category) {
      suppressCategorySeedFor.current = null
      return
    }
    suppressCategorySeedFor.current = null
    if (category === NEW_CATEGORY_ID) {
      setDraftCategoryLabel('')
      setDraftCategoryTerms('')
      return
    }
    const saved = customCategories.find(c => c.id === category)
    setDraftCategoryLabel(saved?.label || '')
    setDraftCategoryTerms(saved?.query || '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category])

  useEffect(() => {
    if (!leadLists.length) return
    const selected = leadLists.find(list => list.id === selectedLeadListId) || null
    const destinationDefault = defaultLeadListForDestination(leadLists, destination)
    const campaignMatch = mode === 'organization' ? findMatchingLeadList(organizationCampaign, leadLists) : null
    const selectedIsValid = selected && leadListBelongsToDestination(selected, destination)
      && (mode !== 'organization' || !campaignMatch || selected.id === campaignMatch.id)
    if (!selectedIsValid) setSelectedLeadListId((campaignMatch || destinationDefault)?.id || '')
  }, [mode, destination, organizationCampaign, leadLists, selectedLeadListId])

  const currentConfig = useMemo(() => ({
    mode, category, count: Number(count) || 10, location, destination,
    selectedLeadListId, sourceTool, leadSource, maxPaidBatches, organizationPreset, organizationScope,
    mustHave, exclude, notes, draftCategoryLabel, draftCategoryTerms,
  }), [mode, category, count, location, destination, selectedLeadListId, sourceTool, leadSource, maxPaidBatches,
    organizationPreset, organizationScope, mustHave, exclude, notes,
    draftCategoryLabel, draftCategoryTerms])

  const applyConfig = useCallback(config => {
    if (!config) return
    // Arm both guards before the state updates land, so neither the campaign
    // defaults nor the category seeder overwrites what we are restoring.
    suppressDefaultsFor.current = `${config.mode || 'organization'}|${config.organizationPreset || ORGANIZATION_CAMPAIGNS[0].id}`
    if (config.category) suppressCategorySeedFor.current = config.category
    if (config.mode) setMode(config.mode)
    if (config.organizationPreset) setOrganizationPreset(config.organizationPreset)
    if (config.category) setCategory(config.category)
    if (config.count !== undefined) setCount(Number(config.count) || 10)
    if (config.location !== undefined) setLocation(config.location)
    if (config.destination) setDestination(config.destination)
    if (config.selectedLeadListId !== undefined) setSelectedLeadListId(config.selectedLeadListId)
    if (config.sourceTool) setSourceTool(config.sourceTool)
    if (config.leadSource) setLeadSource(config.leadSource)
    setMaxPaidBatches(paidSearchLimitFromConfig(config))
    if (config.organizationScope) setOrganizationScope(config.organizationScope)
    if (config.mustHave !== undefined) setMustHave(config.mustHave)
    if (config.exclude !== undefined) setExclude(config.exclude)
    if (config.notes !== undefined) setNotes(config.notes)
    if (config.draftCategoryLabel !== undefined) setDraftCategoryLabel(config.draftCategoryLabel)
    if (config.draftCategoryTerms !== undefined) setDraftCategoryTerms(config.draftCategoryTerms)
  }, [])

  // Best effort, never awaited: losing this must not affect the run.
  const rememberConfig = useCallback(config => {
    fetch('/api/lead-run-presets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'remember', config }),
    }).catch(() => {})
  }, [])

  const loadRecentRuns = useCallback(async () => {
    try {
      const response = await fetch('/api/leads/sweep-runs?limit=12')
      const data = await response.json()
      const runs = Array.isArray(data?.runs) ? data.runs : []
      setRecentRuns(runs)
      return runs
    } catch {
      return []
    }
  }, [])

  // Restore the last setup exactly once. Never again -- a background cache
  // refresh must not yank the form out from under someone mid-edit.
  useEffect(() => {
    if (hydratedRef.current) return
    const payload = presetsQ.data
    if (!payload || !Object.keys(payload).length) return
    hydratedRef.current = true
    if (payload.lastUsed) applyConfig(payload.lastUsed)
  }, [presetsQ.data, applyConfig])

  function choosePreset(id) {
    setSelectedPresetId(id)
    const preset = savedPresets.find(entry => entry.id === id)
    if (!preset) {
      setPresetName('')
      return
    }
    setPresetName(preset.name || '')
    applyConfig(preset.config)
    setResult({ kind: 'success', text: `Loaded "${preset.name}".` })
  }

  async function savePreset() {
    const name = presetName.trim()
    if (!name) {
      setResult({ kind: 'error', text: 'Give the setup a name first.' })
      return
    }
    setSavingPreset(true)
    try {
      const response = await fetch('/api/lead-run-presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save', id: selectedPresetId || undefined, name, config: currentConfig }),
      })
      const data = await response.json().catch(() => ({}))
      if (response.status === 404) {
        // Deleted elsewhere. Drop the stale selection so pressing Save again
        // creates it fresh instead of failing forever.
        setSelectedPresetId('')
        await presetsQ.refresh()
        throw new Error('That saved setup no longer exists — press Save again to recreate it.')
      }
      if (!response.ok || data.ok === false) throw new Error(data.error || `HTTP ${response.status}`)
      await presetsQ.refresh()
      setSelectedPresetId(data.leadRunPreset?.id || '')
      setResult({ kind: 'success', text: data.updated ? `Updated "${name}".` : `Saved "${name}".` })
    } catch (error) {
      setResult({ kind: 'error', text: error.message || 'Could not save the setup' })
    } finally {
      setSavingPreset(false)
    }
  }

  async function deletePreset() {
    if (!selectedPresetId) return
    setSavingPreset(true)
    try {
      const response = await fetch('/api/lead-run-presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove', id: selectedPresetId }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || data.ok === false) throw new Error(data.error || `HTTP ${response.status}`)
      await presetsQ.refresh()
      setSelectedPresetId('')
      setPresetName('')
      setResult({ kind: 'success', text: 'Saved setup deleted.' })
    } catch (error) {
      setResult({ kind: 'error', text: error.message || 'Could not delete the setup' })
    } finally {
      setSavingPreset(false)
    }
  }

  async function runOrganizationCampaign() {
    if (!selectedLeadList) {
      setResult({ kind: 'error', text: 'Choose a lead list before generating leads.' })
      return
    }
    setRunning(true)
    setResult({ kind: 'working', text: `Generating ${requestedLeadCount} ${organizationCampaign.organizationType} lead${requestedLeadCount === 1 ? '' : 's'} for ${selectedLeadList.name || selectedLeadList.id}...` })
    try {
      const data = await startTrackedLeadRun({
        url: '/api/leads/organization-campaign',
        payload: {
          limit: requestedLeadCount,
          leadListId: selectedLeadList.id,
          campaignId: organizationCampaign.id,
          campaignLabel: organizationCampaign.label,
          campaignTag: organizationCampaign.tag,
          organizationType: organizationCampaign.organizationType,
          query,
          scope: organizationScope,
          area: location || 'United States',
          notes,
          offer: organizationCampaign.offer,
          destination,
          destinationLabel: selectedDestination.label,
          brandContext: destinationBrandContext,
          serviceLine: destinationServiceLine,
          campaignType: destinationCampaignType,
          form: currentConfig,
        },
        onRetry: ({ nextAttempt }) => setResult({ kind: 'working', text: `The server did not acknowledge the request. Retrying safely (${nextAttempt} of 3)...` }),
      })
      // Background run started. The poller owns `running` from here.
      setResult({ kind: 'working', text: data.run.phaseLabel || 'Starting run...', runId: data.run.id })
      setActiveRunId(data.run.id)
      rememberConfig(currentConfig)
    } catch (error) {
      setResult({ kind: 'error', text: error.message || 'Organization lead generation failed' })
      setRunning(false)
    }
  }

  async function assignSelectedLeadList(userId) {
    if (!selectedLeadList) return
    setAssigningLeadList(true)
    try {
      const visibleToAll = !userId
      const leadList = {
        ...selectedLeadList,
        ownerUserId: userId || '',
        assignedUserIds: userId ? [userId] : [],
        visibleToAll,
      }
      const action = selectedLeadList.source === 'legacy_pipeline' || selectedLeadList.system ? 'materialize_legacy' : 'update'
      const response = await fetch('/api/lead-lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, leadList }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || data.ok === false) throw new Error(data.error || `HTTP ${response.status}`)
      await leadListsQ.refresh()
      setResult({ kind: 'success', text: visibleToAll ? `Lead list "${selectedLeadList.name}" is visible to everyone with CRM access.` : `Lead list "${selectedLeadList.name}" is assigned to ${users.find(u => u.id === userId)?.displayName || users.find(u => u.id === userId)?.username || 'selected user'}.` })
    } catch (error) {
      setResult({ kind: 'error', text: error.message || 'Lead list assignment failed' })
    } finally {
      setAssigningLeadList(false)
    }
  }

  async function createLeadList() {
    const name = newListName.trim()
    if (!name || creatingList) return
    setCreatingList(true)
    try {
      const response = await fetch('/api/lead-lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add', leadList: { name } }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || data.ok === false) throw new Error(data.error || `HTTP ${response.status}`)
      await leadListsQ.refresh()
      if (data.leadList?.id) setSelectedLeadListId(data.leadList.id)
      setNewListName('')
      setResult({ kind: 'success', text: `Lead list "${data.leadList?.name || name}" created and selected.` })
    } catch (error) {
      setResult({ kind: 'error', text: error.message || 'Lead list creation failed' })
    } finally {
      setCreatingList(false)
    }
  }

  // Saves the in-progress lead type so it shows up in the category list forever.
  // Returns the persisted record (or null) so runSweep can auto-save silently.
  async function persistCategory({ silent = false } = {}) {
    const label = trimmedDraftLabel
    if (!label) {
      if (!silent) setResult({ kind: 'error', text: 'Type a lead type first, for example "Computer stores".' })
      return null
    }
    setSavingCategory(true)
    try {
      const editingSaved = Boolean(savedCategory)
      const response = await fetch('/api/lead-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: editingSaved ? 'update' : 'add',
          leadCategory: {
            id: editingSaved ? savedCategory.id : undefined,
            label,
            query: draftCategoryTerms.trim(),
          },
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || data.ok === false) throw new Error(data.error || `HTTP ${response.status}`)
      await leadCategoriesQ.refresh()
      const saved = data.leadCategory || null
      if (saved?.id && saved.id !== category) setCategory(saved.id)
      if (!silent) {
        setResult({
          kind: 'success',
          text: editingSaved
            ? `Updated "${saved?.label || label}".`
            : `Saved "${saved?.label || label}" as a lead type. It stays in the category list from now on.`,
        })
      }
      return saved
    } catch (error) {
      setResult({ kind: 'error', text: error.message || 'Could not save lead type' })
      return null
    } finally {
      setSavingCategory(false)
    }
  }

  async function deleteCategory() {
    if (!savedCategory || savingCategory) return
    setSavingCategory(true)
    try {
      const response = await fetch('/api/lead-categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'remove', id: savedCategory.id }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || data.ok === false) throw new Error(data.error || `HTTP ${response.status}`)
      const removedLabel = savedCategory.label
      await leadCategoriesQ.refresh()
      setCategory(FARRINGTON_LEAD_VERTICALS[0]?.id || 'home-services')
      setResult({ kind: 'success', text: `Removed "${removedLabel}" from your lead types.` })
    } catch (error) {
      setResult({ kind: 'error', text: error.message || 'Could not remove lead type' })
    } finally {
      setSavingCategory(false)
    }
  }

  // The sweep takes minutes on the server. The browser holds no connection
  // open for it — it asks for the run record until the run finishes. This is
  // what removes the gateway timeout that used to surface as a red "HTTP 5xx".
  useEffect(() => {
    if (!activeRunId) return undefined
    let cancelled = false

    async function poll() {
      try {
        const response = await fetch(`/api/leads/sweep-runs?id=${encodeURIComponent(activeRunId)}`)
        const data = await response.json().catch(() => ({}))
        if (cancelled) return
        const run = data?.run
        if (!run) {
          // Keep polling through a blip; only a missing record is fatal.
          if (response.status === 404) throw new Error('The server lost track of this run.')
          return
        }
        if (run.status === 'running') {
          const step = run.stepsTotal ? ` (step ${run.step || 0} of ${run.stepsTotal})` : ''
          setResult({ kind: 'working', text: `${run.phaseLabel || 'Working...'}${step}`, runId: run.id })
          return
        }
        if (run.status === 'completed' && run.kind === 'organization') {
          const summary = run.result || {}
          const requested = Number(summary.requested ?? run.params?.limit ?? 0)
          const filled = Number(summary.fulfilled ?? summary.created ?? 0)
          const shortfall = filled < requested
            ? ` Provider filled ${filled} of ${requested}; provider attempts returned ${summary.found || 0} unique usable candidate${summary.found === 1 ? '' : 's'}.`
            : ''
          setResult({
            kind: filled > 0 ? 'success' : 'error',
            text: `Requested ${requested}; filled ${filled} in ${summary.leadList?.name || run.params?.leadListName || 'the lead list'}; created ${summary.created || 0}; assigned existing ${summary.assigned || 0}; already there ${summary.alreadyInPipeline || 0}; skipped ${summary.skipped || 0}; rejected ${summary.rejected || 0}.${shortfall}`,
            runId: run.id,
          })
        } else if (run.status === 'completed') {
          const summary = run.result || {}
          const outcome = formatVerticalSweepResult(summary, run.params?.limit)
          setResult({
            ...outcome,
            runId: summary.runId || run.id,
          })
        } else {
          setResult({ kind: 'error', text: run.error || 'Lead sweep failed', runId: run.id })
        }
        setActiveRunId(null)
        setRunning(false)
        loadRecentRuns()
      } catch (error) {
        if (cancelled) return
        setResult({ kind: 'error', text: error.message || 'Lost contact with the run.' })
        setActiveRunId(null)
        setRunning(false)
      }
    }

    poll()
    const timer = setInterval(poll, 2500)
    return () => { cancelled = true; clearInterval(timer) }
  }, [activeRunId])

  // A sweep outlives the tab that started it. If the operator navigated away
  // and came back, pick the live run back up instead of showing a blank panel.
  useEffect(() => {
    let cancelled = false
    loadRecentRuns().then(runs => {
      if (cancelled) return
      const live = runs.find(entry => entry.status === 'running')
      if (!live) return
      setActiveRunId(live.id)
      setRunning(true)
      setResult({ kind: 'working', text: live.phaseLabel || 'Resuming run...', runId: live.id })
    })
    return () => { cancelled = true }
  }, [loadRecentRuns])

  async function runSweep() {
    if (mode === 'organization') {
      await runOrganizationCampaign()
      return
    }
    if (!vertical || running) return
    if (vertical.custom && !trimmedDraftLabel) {
      setResult({ kind: 'error', text: 'Type a lead type first, for example "Computer stores".' })
      return
    }
    // Remember any freshly typed lead type so it is in the list next time.
    if (isNewCategory) await persistCategory({ silent: true })
    setRunning(true)
    setResult({ kind: 'working', text: `Getting ${count} ${vertical.label} leads for ${DESTINATIONS.find(d => d.id === destination)?.label || destination}...` })
    try {
      const data = await startTrackedLeadRun({
        url: '/api/leads/farrington-sweep',
        payload: {
          category: vertical.custom ? vertical.label : vertical.id,
          limit: Number(count) || 10,
          location: location || 'United States',
          query,
          campaign: !OPENOCTI && destination === 'farrington_dev' ? `fd-cold-${vertical.id}` : `${destination}-${vertical.id}`,
          leadListId: selectedLeadList?.id || undefined,
          vendor: buildLeadVendorRequest(leadSource, maxPaidBatches),
          spec: {
            destination,
            sourceTool,
            mustHave: splitTerms(mustHave),
            exclude: splitTerms(exclude),
            notes,
          },
          form: currentConfig,
        },
        onRetry: ({ nextAttempt }) => setResult({ kind: 'working', text: `The server did not acknowledge the request. Retrying safely (${nextAttempt} of 3)...` }),
      })
      // Background run started. The poller owns `running` from here.
      setResult({ kind: 'working', text: data.run.phaseLabel || 'Starting run...', runId: data.run.id })
      setActiveRunId(data.run.id)
      rememberConfig(currentConfig)
    } catch (error) {
      setResult({ kind: 'error', text: error.message || 'Lead sweep failed' })
      setRunning(false)
    }
  }

  const fieldStyle = {
    width: '100%',
    background: 'var(--surface2)',
    border: '1px solid var(--border)',
    color: 'var(--text)',
    borderRadius: 8,
    padding: '9px 11px',
    fontSize: 13,
    outline: 'none',
  }
  const runSummary = mode === 'organization'
    ? `${requestedLeadCount} requested | ${selectedLeadList?.name || 'No lead list'} | ${organizationCampaign.label} | ${organizationScope}`
    : `${count} leads | ${selectedLeadList?.name || 'No lead list'} | ${vertical.label} | ${location} | ${DESTINATIONS.find(d => d.id === destination)?.label}${leadSource === 'apollo' ? ` | up to ${maxPaidBatches} paid ${maxPaidBatches === 1 ? 'search' : 'searches'}` : ''}`
  const runDisabled = running
    || (mode === 'organization' && !selectedLeadList)
    || (mode === 'vertical' && vertical.custom && !trimmedDraftLabel)

  return (
    <div className="command-workspace p-6">
      <PageHeader
        icon={<FlaskConical size={20} />}
        title="Leads Lab"
        subtitle="Build lead specs, test categories, control quality rules, and promote winners into the right lead workflows."
        actions={<button className="px-4 py-2 rounded-lg text-sm font-semibold" style={{ background: 'var(--surface2)', color: 'var(--accent)', border: '1px solid var(--border)' }} onClick={() => onNavigate?.('leads')}>Open Leads</button>}
      />

      <div className="flex gap-2 mb-4" role="tablist" aria-label="Leads Lab workspace">
        {[['build', 'Build run'], ['sources', 'Sources']].map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={workspaceTab === id} onClick={() => setWorkspaceTab(id)} className="rounded-lg px-3 py-2 text-xs font-semibold" style={{ background: workspaceTab === id ? 'var(--accent-soft)' : 'var(--surface2)', border: `1px solid ${workspaceTab === id ? 'var(--accent)' : 'var(--border)'}`, color: workspaceTab === id ? 'var(--accent)' : 'var(--text-muted)' }}>{label}</button>)}
      </div>

      {workspaceTab === 'sources' && <LeadSourcesPanel query={sourcesQ} onRefresh={sourcesQ.refresh} initialZip={presetsQ.data?.lastUsed?.sourceDiscoveryZip} />}
      <div style={{ display: workspaceTab === 'build' ? 'block' : 'none' }}>

      <section className="rounded-lg p-4 mb-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="flex flex-wrap gap-2 mb-3" role="tablist" aria-label="Lead lab mode">
          {CAMPAIGN_MODES.map(option => (
            <button key={option.id} type="button" aria-pressed={mode === option.id} onClick={() => setMode(option.id)}
              className="rounded-lg px-3 py-2 text-xs font-semibold"
              style={{ background: mode === option.id ? 'var(--accent-soft)' : 'var(--surface2)', color: mode === option.id ? 'var(--accent)' : 'var(--text-muted)', border: `1px solid ${mode === option.id ? 'var(--accent)' : 'var(--border)'}` }}>
              {option.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-6 gap-3">
          <label className={`text-xs font-semibold ${mode === 'vertical' ? 'lg:col-span-2' : ''}`} style={{ color: 'var(--text-muted)' }}>
            {mode === 'organization' ? 'Campaign' : 'Category'}
            {mode === 'organization' ? (
              <ThemedSelect style={{ ...fieldStyle, marginTop: 6 }} value={organizationPreset} onChange={e => setOrganizationPreset(e.target.value)}>
                {ORGANIZATION_CAMPAIGNS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </ThemedSelect>
            ) : (
              <ThemedSelect style={{ ...fieldStyle, marginTop: 6 }} value={category} onChange={e => setCategory(e.target.value)}>
                <optgroup label="Top 10 categories">
                  {FARRINGTON_LEAD_VERTICALS.map(v => <option key={v.id} value={v.id}>{v.rank}. {v.label}</option>)}
                </optgroup>
                {customCategories.length > 0 && (
                  <optgroup label="My lead types">
                    {customCategories.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </optgroup>
                )}
                <optgroup label="Freewheel">
                  <option value={NEW_CATEGORY_ID}>+ Other / add my own lead type…</option>
                </optgroup>
              </ThemedSelect>
            )}
          </label>
          <label className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>{mode === 'organization' ? 'Lead Count' : 'Count'}
            <ThemedSelect style={{ ...fieldStyle, marginTop: 6 }} value={count} onChange={e => setCount(Number(e.target.value))}>
              {[5, 10, 15, 25].map(value => <option key={value} value={value}>{value}</option>)}
            </ThemedSelect>
          </label>
          {mode === 'organization' && (
            <label className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Scope
              <ThemedSelect style={{ ...fieldStyle, marginTop: 6 }} value={organizationScope} onChange={e => setOrganizationScope(e.target.value)}>
                {ORGANIZATION_SCOPES.map(scope => <option key={scope.id} value={scope.id}>{scope.label}</option>)}
              </ThemedSelect>
            </label>
          )}
          <label className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>{mode === 'organization' ? 'Area' : 'Geography'}
            <input style={{ ...fieldStyle, marginTop: 6 }} value={location} onChange={e => setLocation(e.target.value)} placeholder={mode === 'organization' ? 'Southeast, North Carolina, or United States' : 'United States'} />
            {mode === 'vertical' && leadSource === 'apollo' && (
              <span className="block mt-1 font-normal">City + state usually keeps this to one paid search.</span>
            )}
          </label>
          {mode === 'vertical' && (
            <label className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>What comes back
              <ThemedSelect style={{ ...fieldStyle, marginTop: 6 }} value={leadSource} onChange={e => setLeadSource(e.target.value)}>
                <option value="apify">Businesses — Google Maps (no owner name or email)</option>
                <option value="apollo">Decision-makers — name, title, work email</option>
              </ThemedSelect>
            </label>
          )}
          {mode === 'vertical' && leadSource === 'apollo' && (
            <label className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Maximum paid searches
              <ThemedSelect style={{ ...fieldStyle, marginTop: 6 }} value={maxPaidBatches} onChange={e => setMaxPaidBatches(normalizeApolloPaidSearches(e.target.value))}>
                <option value={1}>1 — lowest cost</option>
                <option value={2}>2 — recommended</option>
                <option value={6}>6 — maximum coverage</option>
              </ThemedSelect>
              <span className="block mt-1 font-normal">Stops early when enough usable leads are found.</span>
            </label>
          )}
          {mode === 'vertical' && (
            <label className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Destination
              <ThemedSelect style={{ ...fieldStyle, marginTop: 6 }} value={destination} onChange={e => setDestination(e.target.value)}>
                {DESTINATIONS.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}
              </ThemedSelect>
            </label>
          )}
          {mode === 'organization' && (
            <label className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Lead List
              <ThemedSelect style={{ ...fieldStyle, marginTop: 6 }} value={selectedLeadListId} onChange={e => setSelectedLeadListId(e.target.value)} disabled={!leadLists.length}>
                {!leadLists.length && <option value="">Loading lead lists...</option>}
                {leadLists.map(list => <option key={list.id} value={list.id}>{list.name || list.id}</option>)}
              </ThemedSelect>
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <input style={{ ...fieldStyle, flex: 1, marginTop: 0 }} placeholder="New list name (e.g. Boy Scouts)" value={newListName} onChange={e => setNewListName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); createLeadList() } }} />
                <button type="button" onClick={createLeadList} disabled={creatingList || !newListName.trim()} style={{ ...fieldStyle, width: 'auto', marginTop: 0, cursor: 'pointer', fontWeight: 700, color: 'var(--accent)' }}>{creatingList ? '…' : '+ Create'}</button>
              </div>
            </label>
          )}
          {mode === 'organization' && users.length > 0 && (
            <label className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Visible To
              <ThemedSelect style={{ ...fieldStyle, marginTop: 6 }} value={selectedLeadListAssignee} onChange={e => assignSelectedLeadList(e.target.value)} disabled={!selectedLeadList || assigningLeadList}>
                <option value="">Everyone with CRM access</option>
                {users.map(user => <option key={user.id} value={user.id}>{user.displayName || user.username || user.email || user.id}</option>)}
              </ThemedSelect>
            </label>
          )}
        </div>

        {mode === 'vertical' && (isNewCategory || savedCategory) && (
          <div className="rounded-lg p-3 mt-3" style={{ background: 'var(--surface2)', border: '1px dashed var(--accent)' }}>
            <div className="text-xs font-bold mb-2" style={{ color: 'var(--text)' }}>
              {isNewCategory ? 'Add your own lead type' : `Edit "${savedCategory.label}"`}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.5fr_auto] gap-2 items-end">
              <label className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Lead type
                <input style={{ ...fieldStyle, marginTop: 6 }} value={draftCategoryLabel} onChange={e => setDraftCategoryLabel(e.target.value)}
                  placeholder="Computer stores"
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); persistCategory() } }} />
              </label>
              <label className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Search terms (optional)
                <input style={{ ...fieldStyle, marginTop: 6 }} value={draftCategoryTerms} onChange={e => setDraftCategoryTerms(e.target.value)}
                  placeholder={`${trimmedDraftLabel.toLowerCase() || 'computer stores'} computer repair owner phone website`}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); persistCategory() } }} />
              </label>
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" onClick={() => persistCategory()} disabled={savingCategory || !trimmedDraftLabel}
                  style={{ ...fieldStyle, width: 'auto', marginTop: 0, whiteSpace: 'nowrap', cursor: savingCategory || !trimmedDraftLabel ? 'default' : 'pointer', fontWeight: 700, color: 'var(--accent)' }}>
                  {savingCategory ? '…' : savedCategory ? 'Update' : '+ Save lead type'}
                </button>
                {savedCategory && (
                  <button type="button" onClick={deleteCategory} disabled={savingCategory}
                    style={{ ...fieldStyle, width: 'auto', marginTop: 0, whiteSpace: 'nowrap', cursor: savingCategory ? 'default' : 'pointer', fontWeight: 700, color: 'var(--red)' }}>
                    Delete
                  </button>
                )}
              </div>
            </div>
            <div className="text-[11px] mt-2" style={{ color: 'var(--text-muted)' }}>
              Saved lead types stay in the Category list for every future run. Leave search terms blank and the lab builds them from the name. Geography still comes from the Geography field.
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-3">
          <label className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Must-Have Terms
            <input style={{ ...fieldStyle, marginTop: 6 }} value={mustHave} onChange={e => setMustHave(e.target.value)} placeholder="owner, phone, website" />
          </label>
          <label className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Exclude Terms
            <input style={{ ...fieldStyle, marginTop: 6 }} value={exclude} onChange={e => setExclude(e.target.value)} placeholder="jobs, hiring, directory" />
          </label>
        </div>

        <div className="mt-3 grid grid-cols-1 lg:grid-cols-3 gap-2">
          {activeSourceTools.map(tool => {
            const selectable = tool.status !== 'queued'
            return (
            <button key={tool.id} type="button" onClick={() => { if (tool.id === 'manual-import') window.location.assign('/?tab=migrate&object=leads'); else if (selectable) setSourceTool(tool.id) }}
              className="rounded-lg px-3 py-2 text-left"
              style={{ background: sourceTool === tool.id ? 'var(--accent-soft)' : 'var(--surface2)', color: selectable ? 'var(--text)' : 'var(--text-muted)', border: `1px solid ${sourceTool === tool.id ? 'var(--accent)' : 'var(--border)'}`, cursor: selectable ? 'pointer' : 'default' }}>
              <div className="text-xs font-bold">{tool.label}</div>
              <div className="text-[10px] uppercase mt-0.5" style={{ color: selectable ? 'var(--green)' : 'var(--text-muted)' }}>{tool.status}</div>
            </button>
          )})}
        </div>

        {mode === 'vertical' && (
          <div className="mt-3 rounded-lg p-3" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
            <div className="text-xs font-bold" style={{ color: 'var(--text)' }}>Sources for this run</div>
            <div className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
              {(resolvedSourcesQ.data?.sources || []).length
                ? resolvedSourcesQ.data.sources.map(source => `${source.name} — ${source.reason}`).join(' · ')
                : 'No proven public-record source matches this lead type and location yet. Prove a source in the Sources tab; Places remains the shortfall finder.'}
            </div>
          </div>
        )}

        <label className="block text-xs font-semibold mt-3" style={{ color: 'var(--text-muted)' }}>Quality Notes
          <textarea style={{ ...fieldStyle, marginTop: 6, minHeight: 72, resize: 'vertical' }} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Example: prioritize weak websites, emergency call volume, and owner-operated shops." />
        </label>
      </section>

      {mode === 'vertical' && vertical.id === 'political-campaigns' && <CampaignSignalsPanel initialLocation={location} />}

      <section className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-4">
        <div className="rounded-lg p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="text-sm font-bold mb-2" style={{ color: 'var(--text)' }}>Search Spec Preview</div>
          <textarea readOnly value={query} style={{ ...fieldStyle, minHeight: 130, resize: 'vertical', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }} />
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg px-3 py-2" style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}><strong>{mode === 'organization' ? 'Offer:' : 'Lead with:'}</strong> {mode === 'organization' ? organizationCampaign.offer : vertical.leadWith}</div>
            <div className="rounded-lg px-3 py-2" style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}><strong style={{ color: 'var(--text)' }}>{mode === 'organization' ? 'Fit:' : 'Caveat:'}</strong> {mode === 'organization' ? organizationCampaign.fit : vertical.caveat}</div>
          </div>
        </div>

        <div className="rounded-lg p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="text-sm font-bold" style={{ color: 'var(--text)' }}>Saved Setups</div>
          <div className="text-xs mt-1 mb-3" style={{ color: 'var(--text-muted)' }}>
            Private to you. The form also reopens with whatever you ran last, so a one-off never needs saving.
          </div>
          <select value={selectedPresetId} onChange={e => choosePreset(e.target.value)} style={fieldStyle}>
            <option value="">{savedPresets.length ? 'Load a saved setup...' : 'Nothing saved yet'}</option>
            {savedPresets.map(preset => (
              <option key={preset.id} value={preset.id}>{preset.name}</option>
            ))}
          </select>
          <input
            value={presetName}
            onChange={e => setPresetName(e.target.value)}
            placeholder="Name this setup, e.g. City, ST plumbers x10"
            style={{ ...fieldStyle, marginTop: 8 }}
          />
          <div className="flex gap-2 mt-2">
            <button onClick={savePreset} disabled={savingPreset || !presetName.trim()}
              className="flex-1 px-3 py-2 rounded-lg text-xs font-semibold"
              style={{
                background: savingPreset || !presetName.trim() ? 'var(--surface2)' : 'var(--accent)',
                color: savingPreset || !presetName.trim() ? 'var(--text-muted)' : 'var(--accent-text)',
                border: '1px solid var(--border)',
                cursor: savingPreset || !presetName.trim() ? 'default' : 'pointer',
              }}>
              {selectedPresetId ? 'Update setup' : 'Save setup'}
            </button>
            {selectedPresetId && (
              <button onClick={deletePreset} disabled={savingPreset}
                className="px-3 py-2 rounded-lg text-xs font-semibold"
                style={{ background: 'var(--surface2)', color: 'var(--text-muted)', border: '1px solid var(--border)', cursor: savingPreset ? 'default' : 'pointer' }}>
                Delete
              </button>
            )}
          </div>
        </div>

        <div className="rounded-lg p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="text-sm font-bold" style={{ color: 'var(--text)' }}>{mode === 'organization' ? 'Run Import' : 'Run Experiment'}</div>
          <div className="text-xs mt-1 mb-3" style={{ color: 'var(--text-muted)' }}>{runSummary}</div>
          <button type="button" className="w-full px-4 py-3 rounded-lg text-sm font-semibold" disabled={runDisabled} onClick={runSweep}
            style={{ background: runDisabled ? 'var(--surface2)' : 'var(--accent)', color: runDisabled ? 'var(--text-muted)' : 'var(--accent-text)', border: '1px solid var(--border)', cursor: running ? 'wait' : runDisabled ? 'default' : 'pointer' }}>
            {running ? (mode === 'organization' ? 'Generating...' : leadSource === 'apollo' ? 'Finding decision-makers...' : 'Getting businesses...') : mode === 'organization' ? `Generate ${requestedLeadCount} leads` : leadSource === 'apollo' ? `Find ${count} decision-makers` : `Get ${count} businesses`}
          </button>
          {result && (
            <div aria-live="polite" role="status" className="mt-3 rounded-lg p-3 text-xs" style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: result.kind === 'error' ? 'var(--red)' : result.kind === 'success' ? 'var(--green)' : 'var(--text-muted)' }}>
              <div>{result.text}</div>
              {result.runId && <div className="mt-1" style={{ color: 'var(--text-muted)' }}>Run ID: {result.runId}</div>}
            </div>
          )}
          {recentRuns.length > 0 && (
            <div className="mt-4">
              <div className="text-xs font-bold mb-2" style={{ color: 'var(--text)' }}>Recent runs</div>
              <div className="flex flex-col gap-2">
                {recentRuns.slice(0, 6).map(run => (
                  <div key={run.id} className="rounded-lg px-3 py-2 text-xs flex items-center justify-between gap-3"
                    style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ color: 'var(--text)' }}>{describeRun(run)}</div>
                      <div style={{ color: 'var(--text-muted)' }}>{runOutcome(run)}</div>
                    </div>
                    {run.params?.form && (
                      <button
                        onClick={() => {
                          applyConfig(run.params.form)
                          setResult({ kind: 'success', text: 'Settings restored. Hit the run button when you are ready.' })
                        }}
                        className="px-2 py-1 rounded-md shrink-0"
                        style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', cursor: 'pointer' }}>
                        Use these
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
      </div>
    </div>
  )
}
