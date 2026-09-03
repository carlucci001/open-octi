'use client'
import ThemedSelect from '../components/ThemedSelect'
import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarClock, Check, Image as Images, Megaphone, Pencil, Play, RotateCcw, Send, Sparkles, Trash2, Wand2 } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import ViewModeToggle from '../components/ViewModeToggle'
import BulkActionsMenu from '../components/BulkActionsMenu'
import { Paginator, usePagination } from '../components/Paginator'
import ComponentSettings, { useComponentSettings } from '../components/ComponentSettings'
import MediaPickerModal from '../components/MediaPickerModal'
import SocialOperatorPanel from './SocialOperatorPanel'
import SocialPublishing from '../social/SocialPublishing'

const statusLabels = {
  draft: 'Draft',
  asset_needed: 'Asset needed',
  asset_ready: 'Asset ready',
  approved: 'Approved',
  scheduled: 'Scheduled',
}

const assetLabels = {
  needed: 'Needs asset',
  requested: 'Requested',
  ready: 'Ready',
  attached: 'Attached',
  not_required: 'Copy only',
}

function connectedChannelPlatform(channel = {}) {
  const raw = String(channel.platform || channel.provider || channel.type || channel.providerIdentifier || channel.identifier || channel.name || '').trim()
  if (!raw) return ''
  const value = raw.toLowerCase()
  if (value.includes('blue')) return 'BlueSky'
  if (value.includes('instagram')) return 'Instagram'
  if (value.includes('facebook')) return 'Facebook'
  if (value.includes('linkedin')) return 'LinkedIn'
  if (value.includes('tiktok')) return 'TikTok'
  if (value.includes('substack')) return 'Substack'
  if (value === 'x' || value.includes('twitter')) return 'X'
  return raw
}

function defaultScheduleValue() {
  const date = new Date(Date.now() + 30 * 60 * 1000)
  const pad = value => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatDate(value) {
  if (!value) return ''
  try {
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value))
  } catch {
    return value
  }
}

function campaignMonthLabel(campaign = {}) {
  const value = campaign.createdAt || campaign.updatedAt
  if (!value) return 'Undated campaign'
  try {
    return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(new Date(value))
  } catch {
    return 'Undated campaign'
  }
}

const CAMPAIGN_ASSET_CACHE_VERSION = '2026-06-21-campaign-assets'

function campaignAssetUrl(url, version = CAMPAIGN_ASSET_CACHE_VERSION) {
  const raw = String(url || '').trim()
  if (!raw) return ''
  try {
    const parsed = raw.startsWith('http') ? new URL(raw) : new URL(raw, 'https://crm.company.example.com')
    const parts = parsed.pathname.split('/').filter(Boolean)
    const file = parts.length ? decodeURIComponent(parts[parts.length - 1]) : ''
    if (!file) return raw
    if (parsed.pathname.startsWith('/media/') || parsed.pathname.startsWith('/api/media/file/')) {
      return `/api/media/file/${encodeURIComponent(file)}?v=${encodeURIComponent(version || CAMPAIGN_ASSET_CACHE_VERSION)}`
    }
  } catch {}
  return raw
}

function formatScheduleDate(value) {
  if (!value) return ''
  try {
    return new Intl.DateTimeFormat(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    }).format(new Date(value))
  } catch {
    return value
  }
}

function Pill({ children, tone = 'neutral' }) {
  const tones = {
    neutral: { bg: 'var(--surface2)', border: 'var(--border)', color: 'var(--text-muted)' },
    good: { bg: 'rgba(34,197,94,0.13)', border: 'rgba(34,197,94,0.35)', color: 'rgb(74,222,128)' },
    warn: { bg: 'rgba(245,158,11,0.14)', border: 'rgba(245,158,11,0.36)', color: 'rgb(251,191,36)' },
    active: { bg: 'var(--accent-soft)', border: 'var(--border)', color: 'var(--accent)' },
  }
  const style = tones[tone] || tones.neutral
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      minHeight: 26,
      padding: '3px 9px',
      borderRadius: 999,
      background: style.bg,
      border: `1px solid ${style.border}`,
      color: style.color,
      fontSize: 12,
      fontWeight: 700,
      whiteSpace: 'nowrap',
    }}>
      {children}
    </span>
  )
}

function Field({ label, children }) {
  return (
    <label style={{ display: 'grid', gap: 6, minWidth: 0 }}>
      <span style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: 700 }}>{label}</span>
      {children}
    </label>
  )
}

function selectStyle() {
  return {
    width: '100%',
    maxWidth: '100%',
    minWidth: 0,
    minHeight: 48,
    borderRadius: 8,
    border: '1px solid var(--border)',
    background: 'var(--surface)',
    color: 'var(--text)',
    padding: '0 12px',
    fontSize: 16,
    outline: 'none',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  }
}

function inputStyle() {
  return {
    ...selectStyle(),
    padding: '9px 10px',
  }
}

function nativeSelectStyle() {
  return {
    ...selectStyle(),
    appearance: 'auto',
    WebkitAppearance: 'menulist',
    background: 'var(--surface)',
  }
}

function postizErrorMessage(result, fallback = 'Postiz rejected the scheduling request.') {
  if (!result || typeof result !== 'object') return fallback
  const parts = []
  if (result.error) parts.push(String(result.error))
  if (result.stage) parts.push(`stage: ${result.stage}`)
  if (result.detail) {
    const detail = typeof result.detail === 'string' ? result.detail : JSON.stringify(result.detail)
    parts.push(detail)
  }
  return parts.filter(Boolean).join(' - ') || fallback
}

async function readPostizJson(response) {
  const text = await response.text()
  try {
    return JSON.parse(text)
  } catch {
    const contentType = response.headers.get('content-type') || 'unknown content type'
    const prefix = text.slice(0, 180).replace(/\s+/g, ' ').trim()
    if (/^\s*<!doctype\s+html/i.test(text) || /^\s*<html[\s>]/i.test(text)) {
      return {
        ok: false,
        error: `CRM received HTML instead of JSON from the Postiz push route. HTTP ${response.status}; ${contentType}; starts "${prefix}"`,
        status: response.status,
      }
    }
    return {
      ok: false,
      error: `Postiz route returned ${response.status || 'a non-JSON response'}`,
      detail: text.slice(0, 400),
      status: response.status,
    }
  }
}

export default function CampaignStudio({ onNavigate, initialWorkspace = 'campaigns' }) {
  const [workspace, setWorkspace] = useState(initialWorkspace)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [campaigns, setCampaigns] = useState([])
  const [offers, setOffers] = useState([])
  const [endpoints, setEndpoints] = useState([])
  const [cadences, setCadences] = useState([])
  const [brandCatalog, setBrandCatalog] = useState({ brands: [], brandMap: {}, defaultBrandId: 'farrington-development' })
  const [socialOperatorConfig, setSocialOperatorConfig] = useState({ platforms: [], approvalRules: [], budgets: {} })
  const [campaignPublisher, setCampaignPublisher] = useState({ connected: false, postizConfigured: false, schedulerEnabled: false, reason: '' })
  const [activeId, setActiveId] = useState('')
  const [assetBusy, setAssetBusy] = useState('')
  const [pickerPostId, setPickerPostId] = useState('')
  const [attachBusy, setAttachBusy] = useState(false)
  const [editId, setEditId] = useState('')
  const [editDraft, setEditDraft] = useState({})
  const [postFilter, setPostFilter] = useState('all')
  const [selectedPostId, setSelectedPostId] = useState('')
  const [showGenerator, setShowGenerator] = useState(false)
  const [wizardStep, setWizardStep] = useState('brief')
  const [wizardPostIndex, setWizardPostIndex] = useState(0)
  const [wizardChannels, setWizardChannels] = useState([])
  const [wizardChannelsLoading, setWizardChannelsLoading] = useState(false)
  const [wizardChannelError, setWizardChannelError] = useState('')
  const [wizardSelectedChannels, setWizardSelectedChannels] = useState([])
  const [wizardScheduleAt, setWizardScheduleAt] = useState(defaultScheduleValue)
  const [uiStateReady, setUiStateReady] = useState(false)
  const restoredUiRef = useRef({ form: false, campaignView: false })
  const [campaignSearch, setCampaignSearch] = useState('')
  const [campaignStatusFilter, setCampaignStatusFilter] = useState('all')
  const [campaignView, setCampaignView] = useState('list')
  const [selectedCampaigns, setSelectedCampaigns] = useState([])
  const [selectedPosts, setSelectedPosts] = useState([])
  const [postView, setPostView] = useState('list')
  const [renaming, setRenaming] = useState(false)
  const [renameDraft, setRenameDraft] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [pushId, setPushId] = useState('')
  const [pushBusy, setPushBusy] = useState('')
  const [pushChannels, setPushChannels] = useState([])
  const [pushChannelsLoading, setPushChannelsLoading] = useState(false)
  const [pushChannelsError, setPushChannelsError] = useState('')
  const [pushSelected, setPushSelected] = useState([])
  const [pushWhen, setPushWhen] = useState('')
  const [pushPanelStatus, setPushPanelStatus] = useState('')
  const [postActionStatus, setPostActionStatus] = useState('')
  const [ownerAccounts, setOwnerAccounts] = useState([])
  const [form, setForm] = useState({
    name: 'Fresh marketing campaign',
    accountId: '',
    accountName: '',
    offerId: 'command-center',
    brandId: 'farrington-development',
    objective: 'create sales conversations',
    audience: 'local business owners',
    market: 'Central Ohio',
    cadenceId: 'daily-7',
    customDays: 30,
    creationEndpoint: 'openai',
    destination: 'Postiz scheduler - BlueSky first',
    platforms: ['BlueSky'],
  })
  const [toast, setToast] = useState('')

  const flash = (message) => {
    setToast(message)
    setTimeout(() => setToast(''), 2800)
  }

  // Brand streams: resolve a channel's brand from the same map the server enforces.
  const channelBrandId = (channelId) => brandCatalog.brandMap?.[String(channelId)] || brandCatalog.defaultBrandId || 'farrington-development'
  const channelsForBrand = (list, brandId) => (list || []).filter(channel => channelBrandId(channel.id) === (brandId || 'farrington-development'))
  const brandLabel = (brandId) => brandCatalog.brands?.find(brand => brand.id === brandId)?.label || brandId || 'Farrington Development'

  const load = async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/campaign-studio', { cache: 'no-store' })
      const j = await r.json()
      setOffers(j.offers || [])
      setEndpoints(j.endpoints || [])
      setCadences(j.cadences || [])
      setBrandCatalog(j.brands || { brands: [], brandMap: {}, defaultBrandId: 'farrington-development' })
      setCampaigns(j.campaigns || [])
      setSocialOperatorConfig(j.socialOperator || { platforms: [], approvalRules: [], budgets: {} })
      setCampaignPublisher(j.campaignPublisher || { connected: false, postizConfigured: false, schedulerEnabled: false, reason: 'Publisher status unavailable' })
      try {
        const accountsRes = await fetch('/api/accounts', { cache: 'no-store' })
        const accountsJson = await accountsRes.json()
        setOwnerAccounts(accountsJson.accounts || [])
      } catch { setOwnerAccounts([]) }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    const openPlanner = () => setWorkspace('planner')
    window.addEventListener('fcc:social-sub', openPlanner)
    return () => window.removeEventListener('fcc:social-sub', openPlanner)
  }, [])

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem('fcc:campaigns-workspace-state') || '{}')
      if (initialWorkspace !== 'planner' && ['campaigns', 'social_operator', 'planner'].includes(saved.workspace)) setWorkspace(saved.workspace)
      if (saved.form && typeof saved.form === 'object') { restoredUiRef.current.form = true; setForm(current => ({ ...current, ...saved.form })) }
      if (['brief', 'generate', 'review', 'schedule', 'done'].includes(saved.wizardStep)) setWizardStep(saved.wizardStep)
      if (typeof saved.showGenerator === 'boolean') setShowGenerator(saved.showGenerator)
      if (typeof saved.activeId === 'string') setActiveId(saved.activeId)
      if (typeof saved.campaignSearch === 'string') setCampaignSearch(saved.campaignSearch)
      if (typeof saved.campaignStatusFilter === 'string') setCampaignStatusFilter(saved.campaignStatusFilter)
      if (['card', 'list'].includes(saved.campaignView)) { restoredUiRef.current.campaignView = true; setCampaignView(saved.campaignView) }
      if (Number.isInteger(saved.wizardPostIndex) && saved.wizardPostIndex >= 0) setWizardPostIndex(saved.wizardPostIndex)
      if (typeof saved.wizardScheduleAt === 'string' && saved.wizardScheduleAt) setWizardScheduleAt(saved.wizardScheduleAt)
      if (Array.isArray(saved.wizardSelectedChannels)) setWizardSelectedChannels(saved.wizardSelectedChannels.map(String))
    } catch {}
    setUiStateReady(true)
  }, [initialWorkspace])

  useEffect(() => {
    if (!uiStateReady) return
    window.localStorage.setItem('fcc:campaigns-workspace-state', JSON.stringify({
      workspace,
      form,
      wizardStep,
      showGenerator,
      activeId,
      campaignSearch,
      campaignStatusFilter,
      campaignView,
      wizardPostIndex,
      wizardScheduleAt,
      wizardSelectedChannels,
    }))
  }, [activeId, campaignSearch, campaignStatusFilter, campaignView, form, showGenerator, uiStateReady, wizardPostIndex, wizardScheduleAt, wizardSelectedChannels, wizardStep, workspace])

  useEffect(() => {
    if (!showGenerator) return undefined
    const controller = new AbortController()
    setWizardChannelsLoading(true)
    setWizardChannelError('')
    fetch('/api/postiz/channels?tenantId=farrington-development', { cache: 'no-store', signal: controller.signal })
      .then(async response => {
        const result = await response.json().catch(() => ({}))
        if (!response.ok || !result.ok) throw new Error(result.error || 'Could not load connected channels')
        const connected = (result.channels || []).filter(channel => !channel.disabled)
        setWizardChannels(connected)
        setWizardSelectedChannels(current => {
          const available = new Set(connected.map(channel => String(channel.id)))
          const retained = current.filter(id => available.has(String(id)))
          return retained.length ? retained : connected.map(channel => String(channel.id))
        })
      })
      .catch(error => {
        if (error.name !== 'AbortError') setWizardChannelError(error.message || 'Could not load connected channels')
      })
      .finally(() => {
        if (!controller.signal.aborted) setWizardChannelsLoading(false)
      })
    return () => controller.abort()
  }, [showGenerator])

  const active = useMemo(() => campaigns.find(c => c.id === activeId) || null, [campaigns, activeId])
  const activeEndpoint = endpoints.find(e => e.id === active?.creationEndpoint)
  const formEndpoint = endpoints.find(e => e.id === form.creationEndpoint)
  const ready = active?.summary?.readyForAutopilot
  const visibleCampaigns = useMemo(() => {
    const query = campaignSearch.trim().toLowerCase()
    return campaigns.filter(campaign => {
      const postText = (campaign.posts || []).flatMap(post => [post.platform, post.hook, post.body, post.cta, post.assetBrief]).filter(Boolean).join(' ')
      const monthLabel = campaignMonthLabel(campaign)
      const haystack = [campaign.name, monthLabel, campaign.createdAt, campaign.updatedAt, campaign.offerLabel, campaign.objective, campaign.audience, campaign.market, campaign.autopilot?.destination, postText].filter(Boolean).join(' ').toLowerCase()
      const matchesQuery = !query || haystack.includes(query)
      const matchesStatus = campaignStatusFilter === 'all'
        || (campaignStatusFilter === 'armed' ? !!campaign.autopilot?.enabled : campaign.status === campaignStatusFilter)
      return matchesQuery && matchesStatus
    })
  }, [campaigns, campaignSearch, campaignStatusFilter])
  const { page: campaignPage, setPage: setCampaignPage, pageSize: campaignPageSize, setPageSize: setCampaignPageSize, paginated: pagedCampaigns } = usePagination(visibleCampaigns, 25)
  const filteredPosts = useMemo(() => {
    const posts = active?.posts || []
    return postFilter === 'all' ? posts : posts.filter(p => p.status === postFilter)
  }, [active, postFilter])
  const { page: postPage, setPage: setPostPage, pageSize: postPageSize, setPageSize: setPostPageSize, paginated: pagedPosts } = usePagination(filteredPosts, 10)
  // Component configuration layer: stored defaults for this screen's sections.
  // localStorage (last used on this device) still wins where it exists.
  const campaignsPrefs = useComponentSettings('campaign-studio.campaigns')
  const postQueuePrefs = useComponentSettings('campaign-studio.post-queue')
  const briefPrefs = useComponentSettings('campaign-studio.brief')
  useEffect(() => {
    if (!campaignsPrefs.loaded || !campaignsPrefs.values) return
    if (!restoredUiRef.current.campaignView) setCampaignView(campaignsPrefs.values.view)
    setCampaignPageSize(campaignsPrefs.values.pageSize)
  }, [campaignsPrefs.loaded])
  useEffect(() => {
    if (!postQueuePrefs.loaded || !postQueuePrefs.values) return
    setPostView(postQueuePrefs.values.view)
    setPostPageSize(postQueuePrefs.values.pageSize)
  }, [postQueuePrefs.loaded])
  useEffect(() => {
    if (!briefPrefs.loaded || !briefPrefs.values || restoredUiRef.current.form) return
    const v = briefPrefs.values
    setForm(f => ({ ...f, brandId: v.defaultBrandId, cadenceId: v.defaultCadenceId, customDays: v.defaultCustomDays, creationEndpoint: v.defaultCreationEndpoint }))
  }, [briefPrefs.loaded])
  const applyComponentSettings = (id, values) => {
    if (id === 'campaign-studio.campaigns') { setCampaignView(values.view); setCampaignPageSize(values.pageSize) }
    if (id === 'campaign-studio.post-queue') { setPostView(values.view); setPostPageSize(values.pageSize) }
    if (id === 'campaign-studio.brief') setForm(f => ({ ...f, brandId: values.defaultBrandId, cadenceId: values.defaultCadenceId, customDays: values.defaultCustomDays, creationEndpoint: values.defaultCreationEndpoint }))
  }
  const selectedPost = useMemo(() => {
    if (!selectedPostId) return null
    return filteredPosts.find(p => p.id === selectedPostId) || null
  }, [filteredPosts, selectedPostId])
  const wizardPosts = active?.posts || []
  const wizardPost = wizardPosts[Math.min(wizardPostIndex, Math.max(0, wizardPosts.length - 1))] || null
  const wizardCadence = cadences.find(cadence => cadence.id === form.cadenceId)

  useEffect(() => {
    if (!selectedPost && selectedPostId) setSelectedPostId('')
  }, [selectedPost, selectedPostId])
  useEffect(() => {
    setSelectedPostId('')
    setSelectedPosts([])
    setEditId('')
    setPushId('')
    setPostActionStatus('')
  }, [activeId])
  useEffect(() => {
    if (!activeId) return
    const onKey = (event) => {
      if (event.key !== 'Escape') return
      if (selectedPostId) {
        setSelectedPostId('')
        setEditId('')
        setPushId('')
        setPostActionStatus('')
      } else {
        setActiveId('')
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [activeId, selectedPostId])

  const upsertCampaign = (campaign, activate = true) => {
    setCampaigns(prev => {
      const exists = prev.some(item => item.id === campaign.id)
      return exists ? prev.map(item => item.id === campaign.id ? campaign : item) : [campaign, ...prev]
    })
    if (activate) setActiveId(campaign.id)
  }

  const create = async () => {
    if (!form.platforms?.length) {
      flash('Pick at least one social account')
      return
    }
    setSaving(true)
    try {
      const connectedPlatforms = [...new Set(wizardChannels
        .filter(channel => wizardSelectedChannels.includes(String(channel.id)))
        .map(connectedChannelPlatform)
        .filter(Boolean))]
      const r = await fetch('/api/campaign-studio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_campaign',
          campaign: {
            ...form,
            platforms: connectedPlatforms.length ? connectedPlatforms : form.platforms,
          },
        }),
      })
      const j = await r.json()
      if (j.ok) {
        upsertCampaign(j.campaign, true)
        setWizardPostIndex(0)
        setWizardStep('review')
        flash('Campaign generated')
      } else {
        flash(j.error || 'Campaign failed')
      }
    } finally {
      setSaving(false)
    }
  }

  // "Use my own image" path: attach a file from the Media library to a post.
  const attachAsset = async (postId, item) => {
    if (!active || !item || attachBusy) return
    const post = (active.posts || []).find(p => p.id === postId)
    setAttachBusy(true)
    try {
      const r = await fetch('/api/campaign-studio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'attach_asset', campaignId: active.id, postId, mediaId: item.id }),
      })
      const j = await r.json()
      if (j.ok) {
        upsertCampaign(j.campaign)
        setSelectedPostId(postId)
        setPostActionStatus(`Attached "${item.title || item.originalName || item.file}" to post #${post?.sequence || ''}.`)
        flash('Image attached from Media')
        setPickerPostId('')
      } else {
        flash(j.error || 'Could not attach image')
      }
    } catch {
      flash('Could not attach image')
    } finally {
      setAttachBusy(false)
    }
  }

  const generateAsset = async (postId) => {
    if (!active || assetBusy) return
    const post = (active.posts || []).find(item => item.id === postId)
    setAssetBusy(postId)
    setSelectedPostId(postId)
    setPostActionStatus(`Creating image for post #${post?.sequence || ''}. This can take a little while.`)
    try {
      const r = await fetch('/api/campaign-studio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate_asset', campaignId: active.id, postId }),
      })
      const j = await r.json()
      if (j.ok) {
        upsertCampaign(j.campaign)
        setPostActionStatus(`Image ready for post #${post?.sequence || ''}.`)
        flash('Asset created')
      } else {
        setPostActionStatus(j.error || 'Image generation failed')
        flash(j.error || 'Asset generation failed')
      }
    } catch {
      setPostActionStatus('Image generation failed')
      flash('Asset generation failed')
    } finally {
      setAssetBusy('')
    }
  }

  const scheduleWizardCampaign = async () => {
    if (!active || !wizardPosts.length || !wizardSelectedChannels.length || !wizardScheduleAt) return
    if (wizardPosts.some(post => post.status !== 'approved' && post.status !== 'scheduled')) {
      flash('Approve every post before scheduling')
      setWizardStep('review')
      return
    }
    setSaving(true)
    try {
      const start = new Date(wizardScheduleAt)
      if (!Number.isFinite(start.getTime())) throw new Error('Choose a valid start time')
      let latest = active
      for (let index = 0; index < wizardPosts.length; index += 1) {
        const spacingDays = Math.max(1, Number(wizardCadence?.spacingDays || 1))
        const publishAt = new Date(start.getTime() + index * spacingDays * 24 * 60 * 60 * 1000).toISOString()
        const response = await fetch('/api/campaign-studio', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'update_post',
            campaignId: active.id,
            postId: wizardPosts[index].id,
            patch: {
              status: 'scheduled',
              publishAt,
              scheduledFor: publishAt,
              channels: wizardSelectedChannels,
              channelIds: wizardSelectedChannels,
              autoPublish: true,
            },
          }),
        })
        const result = await response.json()
        if (!response.ok || !result.ok) throw new Error(result.error || 'Could not schedule campaign')
        latest = result.campaign
      }
      upsertCampaign(latest)
      setWizardStep('done')
      flash('Campaign scheduled')
    } catch (error) {
      flash(error.message || 'Could not schedule campaign')
    } finally {
      setSaving(false)
    }
  }

  const openPushPanel = async (post, options = {}) => {
    if (!options.force && pushId === post.id) { setPushId(''); return }
    setSelectedPostId(post.id)
    setPushId(post.id)
    setPostActionStatus(`Opening schedule controls for post #${post.sequence}.`)
    // default datetime-local to now + 30 minutes (local tz)
    const when = new Date(Date.now() + 30 * 60 * 1000)
    const pad = (n) => String(n).padStart(2, '0')
    setPushWhen(`${when.getFullYear()}-${pad(when.getMonth()+1)}-${pad(when.getDate())}T${pad(when.getHours())}:${pad(when.getMinutes())}`)
    setPushSelected([])
    setPushPanelStatus('Nothing is sent yet. Choose where and when, then press Schedule post.')
    setPushChannelsError('')
    const tenantId = (active && active.tenantId) || 'farrington-development'
    setPushChannelsLoading(true)
    try {
      const r = await fetch(`/api/postiz/channels?tenantId=${encodeURIComponent(tenantId)}`, { cache: 'no-store' })
      const j = await readPostizJson(r)
      if (j.ok) {
        const brandChannels = channelsForBrand(j.channels || [], (active && active.brandId) || 'farrington-development')
        setPushChannels(brandChannels)
        setPushSelected(brandChannels.filter(c => !c.disabled).slice(0, 1).map(c => c.id))
        setPostActionStatus(`Scheduler ready for post #${post.sequence}. Nothing is sent yet.`)
      } else {
        setPostActionStatus(postizErrorMessage(j, 'Could not load Postiz channels'))
        setPushChannelsError(postizErrorMessage(j, 'Could not load Postiz channels'))
      }
    } catch (e) {
      setPostActionStatus(String(e && e.message || e))
      setPushChannelsError(String(e && e.message || e))
    } finally {
      setPushChannelsLoading(false)
    }
  }

  const togglePushChannel = (id) => {
    setPushSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const confirmPush = async (post) => {
    if (pushBusy) return
    if (pushSelected.length === 0) {
      setPushPanelStatus('Pick at least one channel before scheduling.')
      flash('Pick at least one channel')
      return
    }
    if (!pushWhen) {
      setPushPanelStatus('Choose a publish time before scheduling.')
      flash('Choose a publish time')
      return
    }
    setPushBusy(post.id)
    setPushPanelStatus('Scheduling this post in Postiz...')
    try {
      const publishAt = pushWhen ? new Date(pushWhen).toISOString() : new Date(Date.now() + 60 * 1000).toISOString()
      const text = [post.hook, post.body, post.cta].filter(Boolean).join('\n\n')
      if (!text.trim()) {
        setPushPanelStatus('This post has no copy to send.')
        flash('This post has no copy to send')
        return
      }
      const r = await fetch('/api/postiz/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text, mediaUrl: post.assetUrl || '', channels: pushSelected, publishAt, tenantId: (active && active.tenantId) || 'farrington-development', brandId: (active && active.brandId) || 'farrington-development' }),
      })
      const j = await readPostizJson(r)
      if (j.ok) {
        setPushPanelStatus(`Scheduled in Postiz for ${formatDate(j.scheduledFor) || 'the selected time'}.`)
        flash('Scheduled in Postiz')
        setPushId('')
        try {
          // Mark post scheduled locally so the Scheduled filter reflects it.
          await setPostStatus(post.id, { status: 'scheduled', scheduledFor: j.scheduledFor }, '')
        } catch {
          flash('Scheduled in Postiz - CRM status did not update')
        }
      } else {
        const message = postizErrorMessage(j)
        setPushPanelStatus(message)
        flash(message)
      }
    } catch (e) {
      const raw = e && e.message ? String(e.message) : String(e || 'unknown error')
      const message = raw.includes('Unexpected token')
        ? 'Postiz scheduling failed before the API response could be read. Reload the CRM window once and retry.'
        : `Postiz scheduling failed: ${raw}`
      setPushPanelStatus(message)
      flash(message)
    } finally {
      setPushBusy('')
    }
  }

  const patchPost = async (postId, patch) => {
    if (!active) return
    const r = await fetch('/api/campaign-studio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update_post', campaignId: active.id, postId, patch }),
    })
    const j = await r.json()
    if (j.ok) upsertCampaign(j.campaign)
  }

  const startEdit = (post) => {
    setSelectedPostId(post.id)
    setPushId('')
    setEditId(post.id)
    setEditDraft({ hook: post.hook || '', body: post.body || '', cta: post.cta || '', assetBrief: post.assetBrief || '' })
    setPostActionStatus(`Editing post #${post.sequence}.`)
  }
  const openPost = (post) => {
    const switchingPost = selectedPostId !== post.id
    setSelectedPostId(post.id)
    if (switchingPost) {
      setEditId('')
      setPushId('')
      setPostActionStatus(`Opened post #${post.sequence}.`)
    }
  }
  const schedulePost = (post) => {
    setEditId('')
    openPushPanel(post, { force: true })
  }
  const cancelEdit = () => { setEditId(''); setEditDraft({}) }
  const saveEdit = async (postId) => {
    await patchPost(postId, editDraft)
    setEditId('')
    setEditDraft({})
    setPostActionStatus('Post changes saved.')
    flash('Post updated')
  }

  const patchCampaign = async (patch) => {
    if (!active) return
    const r = await fetch('/api/campaign-studio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update_campaign', id: active.id, patch }),
    })
    const j = await r.json()
    if (j.ok) upsertCampaign(j.campaign)
  }

  const setPostStatus = async (postId, patch, message) => {
    await patchPost(postId, patch)
    if (message) setPostActionStatus(message)
    if (message) flash(message)
  }

  const deleteActiveCampaign = async () => {
    if (!active) return
    const r = await fetch('/api/campaign-studio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete_campaign', id: active.id }),
    })
    const j = await r.json()
    if (j.ok) {
      setCampaigns(prev => prev.filter(c => c.id !== active.id))
      setActiveId('')
      setConfirmDelete(false)
      flash('Campaign deleted')
    } else {
      flash('Delete failed')
    }
  }

  const resetMarketing = async () => {
    if (!window.confirm('Clear all Campaign Studio campaigns and start fresh?')) return
    const r = await fetch('/api/campaign-studio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'clear_campaigns' }),
    })
    const j = await r.json()
    if (j.ok) {
      setCampaigns([])
      setActiveId('')
      setSelectedPostId('')
      setConfirmDelete(false)
      setPostFilter('all')
      setShowGenerator(false)
      flash('Marketing slate cleared')
    } else {
      flash(j.error || 'Reset failed')
    }
  }

  const toggleCampaignSelected = (id) => {
    setSelectedCampaigns(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id])
  }

  const deleteSelectedCampaigns = async () => {
    if (!selectedCampaigns.length) return
    if (!window.confirm(`Delete ${selectedCampaigns.length} selected campaign${selectedCampaigns.length === 1 ? '' : 's'}?`)) return
    setSaving(true)
    try {
      await fetch('/api/campaign-studio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete_campaigns', campaignIds: selectedCampaigns }),
      })
      setCampaigns(prev => prev.filter(c => !selectedCampaigns.includes(c.id)))
      if (selectedCampaigns.includes(activeId)) setActiveId('')
      setSelectedCampaigns([])
      flash('Selected campaigns deleted')
    } finally {
      setSaving(false)
    }
  }

  const togglePostSelected = (id) => {
    setSelectedPosts(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id])
  }

  const deleteSelectedPosts = async () => {
    if (!active || !selectedPosts.length) return
    if (!window.confirm(`Delete ${selectedPosts.length} selected post${selectedPosts.length === 1 ? '' : 's'} from this campaign?`)) return
    setSaving(true)
    try {
      const r = await fetch('/api/campaign-studio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete_posts', campaignId: active.id, postIds: selectedPosts }),
      })
      const j = await r.json()
      if (j.ok) {
        upsertCampaign(j.campaign)
        setSelectedPosts([])
        flash(`Deleted ${j.deleted} post${j.deleted === 1 ? '' : 's'}`)
      } else {
        flash(j.error || 'Bulk delete failed')
      }
    } finally {
      setSaving(false)
    }
  }

  const saveRename = async () => {
    const name = renameDraft.trim()
    if (!active || !name) { setRenaming(false); return }
    await patchCampaign({ name })
    setRenaming(false)
    flash('Campaign renamed')
  }

  const armAutopilot = async () => {
    if (!active) return
    await patchCampaign({
      status: ready ? 'armed' : 'draft',
      autopilot: {
        ...(active.autopilot || {}),
        enabled: !!ready,
        mode: ready ? 'armed' : 'manual',
      },
    })
    flash(ready ? 'Campaign marked ready' : 'Approve every post before marking ready')
  }

  const openGenerator = () => {
    if (wizardStep === 'done') {
      setWizardStep('brief')
      setWizardPostIndex(0)
    }
    setShowGenerator(true)
  }

  const wizardSteps = ['brief', 'generate', 'review', 'schedule', 'done']
  const generatorCard = (
    <section aria-label="Campaign creation wizard" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 18, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Sparkles size={20} color="var(--accent)" />
            <h2 style={{ fontSize: 22, fontWeight: 900, color: 'var(--text)' }}>Create a campaign</h2>
          </div>
          <p style={{ color: 'var(--text-muted)', margin: '6px 0 0' }}>One clear decision at a time. Your progress is saved on this device.</p>
        </div>
        <button type="button" onClick={() => setShowGenerator(false)} style={wizardButtonStyle(false)}>Close builder</button>
      </div>

      <ol style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(84px, 1fr))', gap: 8, padding: 0, margin: '0 0 20px', listStyle: 'none', overflowX: 'auto' }}>
        {wizardSteps.map((step, index) => {
          const current = wizardStep === step
          const complete = wizardSteps.indexOf(wizardStep) > index
          return <li key={step} aria-current={current ? 'step' : undefined} style={{ minWidth: 84, padding: '9px 10px', borderRadius: 8, border: `1px solid ${current ? 'var(--accent)' : 'var(--border)'}`, background: current ? 'var(--accent-soft)' : 'var(--surface2)', color: current || complete ? 'var(--accent)' : 'var(--text-muted)', fontSize: 13, fontWeight: 900, textTransform: 'capitalize' }}>{index + 1}. {step}</li>
        })}
      </ol>

      {wizardStep === 'brief' && (
        <div style={{ display: 'grid', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
            <div><h3 style={{ fontSize: 20, fontWeight: 900 }}>Brief</h3><p style={{ color: 'var(--text-muted)', marginTop: 5 }}>Tell the campaign what it is selling and who it needs to reach.</p></div>
            <ComponentSettings componentId="campaign-studio.brief" context={{ brandId: form.brandId || '', brandLabel: brandLabel(form.brandId) }} title="Brief defaults" onApplied={applyComponentSettings} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: 16 }}>
            <Field label="Belongs to">
              <select
                value={form.accountId}
                onChange={e => {
                  const accountId = e.target.value
                  const account = ownerAccounts.find(item => item.id === accountId)
                  setForm(f => ({ ...f, accountId, accountName: account?.name || '' }))
                }}
                style={{ ...inputStyle(), minHeight: 52, fontSize: 16 }}
              >
                <option value="">Farrington Development (in-house)</option>
                {ownerAccounts.filter(a => a.type === 'in-house').map(a => <option key={a.id} value={a.id}>{a.name} — in-house</option>)}
                {ownerAccounts.filter(a => a.type === 'client').map(a => <option key={a.id} value={a.id}>{a.name} — client</option>)}
              </select>
            </Field>
            <Field label="Campaign / client name"><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={{ ...inputStyle(), minHeight: 52, fontSize: 16 }} /></Field>
            <Field label="Offer"><select value={form.offerId} onChange={e => setForm(f => ({ ...f, offerId: e.target.value }))} style={{ ...nativeSelectStyle(), minHeight: 52, fontSize: 16 }}>{offers.map(offer => <option key={offer.id} value={offer.id}>{offer.label}</option>)}</select></Field>
            <Field label="Brand stream"><select value={form.brandId || 'farrington-development'} onChange={e => setForm(f => ({ ...f, brandId: e.target.value }))} style={{ ...nativeSelectStyle(), minHeight: 52, fontSize: 16 }}>{(brandCatalog.brands || []).map(brand => <option key={brand.id} value={brand.id}>{brand.label}</option>)}</select></Field>
            <Field label="Audience"><input value={form.audience} onChange={e => setForm(f => ({ ...f, audience: e.target.value }))} style={{ ...inputStyle(), minHeight: 52, fontSize: 16 }} /></Field>
            <Field label="Market"><input value={form.market} onChange={e => setForm(f => ({ ...f, market: e.target.value }))} style={{ ...inputStyle(), minHeight: 52, fontSize: 16 }} /></Field>
            <Field label="Run length"><select value={form.cadenceId} onChange={e => setForm(f => ({ ...f, cadenceId: e.target.value }))} style={{ ...nativeSelectStyle(), minHeight: 52, fontSize: 16 }}>{cadences.map(cadence => <option key={cadence.id} value={cadence.id}>{cadence.label}</option>)}<option value="custom">Custom — pick the days</option></select></Field>
            {form.cadenceId === 'custom' && (
              <Field label="Days (one post per day)"><input type="number" min={1} max={90} value={form.customDays} onChange={e => setForm(f => ({ ...f, customDays: e.target.value }))} style={{ ...inputStyle(), minHeight: 52, fontSize: 16 }} /></Field>
            )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}><button type="button" onClick={() => setWizardStep('generate')} disabled={!form.name.trim() || !form.audience.trim() || !form.market.trim()} style={wizardButtonStyle(true, !form.name.trim() || !form.audience.trim() || !form.market.trim())}>Continue to generate</button></div>
        </div>
      )}

      {wizardStep === 'generate' && (
        <div style={{ display: 'grid', gap: 16 }}>
          <div><h3 style={{ fontSize: 20, fontWeight: 900 }}>Generate</h3><p style={{ color: 'var(--text-muted)', marginTop: 5 }}>Choose the production engine, then generate the campaign copy and review queue.</p></div>
          <Field label="Creation endpoint">
            <select value={form.creationEndpoint} onChange={e => setForm(f => ({ ...f, creationEndpoint: e.target.value }))} style={{ ...nativeSelectStyle(), minHeight: 52, fontSize: 16 }}>{endpoints.map(endpoint => <option key={endpoint.id} value={endpoint.id}>{endpoint.label}</option>)}</select>
          </Field>
          <div style={{ padding: 16, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface2)' }}>
            <strong style={{ display: 'block', color: 'var(--text)' }}>{saving ? 'Generating campaign…' : (formEndpoint?.modelLabel || 'Campaign engine ready')}</strong>
            <span style={{ display: 'block', color: 'var(--text-muted)', marginTop: 6 }}>{formEndpoint ? `${formEndpoint.vendor || 'Provider'} · ${formEndpoint.costPerImage === 0 ? 'Image generation is free' : `Images cost about $${Number(formEndpoint.costPerImage || 0).toFixed(2)} each`}` : 'Cost information will appear when the endpoint loads.'}</span>
            <span style={{ display: 'block', color: 'var(--text-muted)', marginTop: 4 }}>Copy generates now. Images remain approval-gated in Review so no asset budget is spent without a clear action.</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}><button type="button" onClick={() => setWizardStep('brief')} style={wizardButtonStyle(false)}>Back</button><button type="button" onClick={create} disabled={saving} aria-busy={saving} style={wizardButtonStyle(true, saving)}><Wand2 size={18} /> {saving ? 'Generating…' : 'Generate campaign'}</button></div>
        </div>
      )}

      {wizardStep === 'review' && (
        <div style={{ display: 'grid', gap: 16 }}>
          <div><h3 style={{ fontSize: 20, fontWeight: 900 }}>Review</h3><p style={{ color: 'var(--text-muted)', marginTop: 5 }}>Review one post at a time. Edit the copy, create its image, then approve it.</p></div>
          {!wizardPost && <Pill tone="warn">Generate a campaign to begin review.</Pill>}
          {wizardPost && (
            <article style={{ padding: 18, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface2)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}><Pill tone="active">Post {wizardPostIndex + 1} of {wizardPosts.length} · {wizardPost.platform}</Pill><Pill tone={wizardPost.status === 'approved' || wizardPost.status === 'scheduled' ? 'good' : 'neutral'}>{statusLabels[wizardPost.status] || wizardPost.status}</Pill></div>
              {editId === wizardPost.id ? (
                <div style={{ display: 'grid', gap: 12 }}>
                  <Field label="Headline"><input value={editDraft.hook || ''} onChange={e => setEditDraft(d => ({ ...d, hook: e.target.value }))} style={{ ...inputStyle(), minHeight: 48, fontSize: 16 }} /></Field>
                  <Field label="Body"><textarea value={editDraft.body || ''} onChange={e => setEditDraft(d => ({ ...d, body: e.target.value }))} rows={5} style={{ ...inputStyle(), fontSize: 16, resize: 'vertical' }} /></Field>
                  <Field label="Call to action"><input value={editDraft.cta || ''} onChange={e => setEditDraft(d => ({ ...d, cta: e.target.value }))} style={{ ...inputStyle(), minHeight: 48, fontSize: 16 }} /></Field>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}><button type="button" onClick={() => saveEdit(wizardPost.id)} style={wizardButtonStyle(true)}>Save changes</button><button type="button" onClick={cancelEdit} style={wizardButtonStyle(false)}>Cancel</button></div>
                </div>
              ) : (
                <div><h4 style={{ fontSize: 19, fontWeight: 900 }}>{wizardPost.hook}</h4><p style={{ lineHeight: 1.6, marginTop: 10 }}>{wizardPost.body}</p><p style={{ color: 'var(--accent)', fontWeight: 900, marginTop: 10 }}>{wizardPost.cta}</p>{wizardPost.assetUrl && <img src={campaignAssetUrl(wizardPost.assetUrl, wizardPost.assetUpdatedAt || wizardPost.updatedAt)} alt={wizardPost.hook} style={{ display: 'block', width: '100%', maxWidth: 480, marginTop: 14, borderRadius: 8, border: '1px solid var(--border)' }} />}</div>
              )}
              {editId !== wizardPost.id && <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}><button type="button" onClick={() => startEdit(wizardPost)} style={wizardButtonStyle(false)}><Pencil size={18} /> Edit</button><button type="button" onClick={() => setPickerPostId(wizardPost.id)} disabled={!!assetBusy} style={wizardButtonStyle(false, !!assetBusy)}><Images size={18} /> {wizardPost.assetUrl ? 'Swap image' : 'Use my image'}</button><button type="button" onClick={() => generateAsset(wizardPost.id)} disabled={!!assetBusy} style={wizardButtonStyle(false, !!assetBusy)}><Sparkles size={18} /> {assetBusy === wizardPost.id ? 'Generating image…' : (wizardPost.assetUrl ? 'Regenerate image' : 'Generate image')}</button><button type="button" onClick={() => setPostStatus(wizardPost.id, { status: 'approved' }, 'Post approved')} style={wizardButtonStyle(true)}><Check size={18} /> {wizardPost.status === 'approved' ? 'Approved' : 'Approve post'}</button></div>}
            </article>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => setWizardPostIndex(index => Math.max(0, index - 1))} disabled={wizardPostIndex === 0} style={wizardButtonStyle(false, wizardPostIndex === 0)}>Previous post</button>
            {wizardPostIndex < wizardPosts.length - 1 ? <button type="button" onClick={() => setWizardPostIndex(index => Math.min(wizardPosts.length - 1, index + 1))} style={wizardButtonStyle(true)}>Next post</button> : <button type="button" onClick={() => setWizardStep('schedule')} disabled={wizardPosts.some(post => post.status !== 'approved' && post.status !== 'scheduled')} style={wizardButtonStyle(true, wizardPosts.some(post => post.status !== 'approved' && post.status !== 'scheduled'))}>Continue to schedule</button>}
          </div>
        </div>
      )}

      {wizardStep === 'schedule' && (
        <div style={{ display: 'grid', gap: 16 }}>
          <div><h3 style={{ fontSize: 20, fontWeight: 900 }}>Schedule</h3><p style={{ color: 'var(--text-muted)', marginTop: 5 }}>Only channels currently connected through Postiz can receive this campaign.</p></div>
          <Field label="Connected channels">
            {wizardChannelsLoading && <Pill>Loading connected channels…</Pill>}
            {wizardChannelError && <Pill tone="warn">{wizardChannelError}</Pill>}
            {!wizardChannelsLoading && !wizardChannelError && channelsForBrand(wizardChannels, active?.brandId || form.brandId).length === 0 && <Pill tone="warn">No connected channels for the {brandLabel(active?.brandId || form.brandId)} brand.</Pill>}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {channelsForBrand(wizardChannels, active?.brandId || form.brandId).map(channel => {
                const id = String(channel.id)
                const selected = wizardSelectedChannels.includes(id)
                return <button key={id} type="button" aria-pressed={selected} onClick={() => setWizardSelectedChannels(current => selected ? current.filter(value => value !== id) : [...current, id])} style={{ ...wizardButtonStyle(selected), background: selected ? 'var(--accent-soft)' : 'var(--surface2)', color: selected ? 'var(--accent)' : 'var(--text)' }}>{selected && <Check size={18} />}{channel.name || channel.identifier || connectedChannelPlatform(channel)} · {connectedChannelPlatform(channel)}</button>
              })}
            </div>
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: 16 }}>
            <Field label="Cadence"><select value={form.cadenceId} onChange={e => setForm(f => ({ ...f, cadenceId: e.target.value }))} style={{ ...nativeSelectStyle(), minHeight: 52, fontSize: 16 }}>{cadences.map(cadence => <option key={cadence.id} value={cadence.id}>{cadence.label}</option>)}<option value="custom">Custom — {Math.min(90, Math.max(1, Math.round(Number(form.customDays)) || 7))} days daily</option></select></Field>
            <Field label="First publish time"><input type="datetime-local" value={wizardScheduleAt} onChange={e => setWizardScheduleAt(e.target.value)} style={{ ...inputStyle(), minHeight: 52, fontSize: 16 }} /></Field>
          </div>
          <p style={{ color: 'var(--text-muted)', margin: 0 }}>Posts will follow the selected {wizardCadence?.label || 'campaign'} cadence from the starting time. The existing manual Postiz scheduler remains available on every post.</p>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}><button type="button" onClick={() => setWizardStep('review')} style={wizardButtonStyle(false)}>Back to review</button><button type="button" onClick={scheduleWizardCampaign} disabled={saving || !wizardSelectedChannels.length || !wizardScheduleAt} style={wizardButtonStyle(true, saving || !wizardSelectedChannels.length || !wizardScheduleAt)}>{saving ? 'Scheduling…' : 'Confirm schedule'}</button></div>
        </div>
      )}

      {wizardStep === 'done' && (
        <div style={{ display: 'grid', gap: 18, textAlign: 'center', justifyItems: 'center', padding: '22px 8px' }}>
          <span style={{ width: 64, height: 64, display: 'grid', placeItems: 'center', borderRadius: 999, background: 'var(--accent-soft)', color: 'var(--accent)' }}><Check size={32} /></span>
          <div><h3 style={{ fontSize: 24, fontWeight: 900 }}>Campaign scheduled</h3><p style={{ color: 'var(--text-muted)', marginTop: 8, maxWidth: 620 }}>The runner will deliver approved posts to the selected connected channels on schedule. Manual Postiz controls remain available for adjustments.</p></div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center' }}><button type="button" onClick={() => setShowGenerator(false)} style={wizardButtonStyle(true)}>View campaign queue</button><button type="button" onClick={() => { setWizardStep('brief'); setWizardPostIndex(0); setActiveId('') }} style={wizardButtonStyle(false)}>Create another campaign</button></div>
        </div>
      )}
    </section>
  )
  const actionCueState = assetBusy || pushBusy || pushChannelsLoading
    ? 'working'
    : /\b(ready|scheduled|approved|saved|created|marked)\b/i.test(postActionStatus || '')
      ? 'done'
      : 'idle'
  const schedulePreview = formatScheduleDate(pushWhen)

  return (
    <div className="command-workspace p-6">
      <PageHeader
        icon={<Megaphone size={22} />}
        title="Campaigns"
        subtitle="Plan, create, review, schedule, and monitor connected-channel campaigns in one workspace."
        viewToggle={workspace === 'campaigns' ? <ViewModeToggle value={campaignView} onChange={setCampaignView} modes={['list', 'card']} /> : null}
        controls={workspace === 'campaigns' ? <ComponentSettings componentId="campaign-studio.campaigns" title="Campaigns list settings" onApplied={applyComponentSettings} /> : null}
        actions={
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {toast ? <Pill tone="active">{toast}</Pill> : null}
            {workspace === 'campaigns' ? (
              <>
                <button
                  type="button"
                  onClick={openGenerator}
                  aria-label="New campaign"
                  data-tooltip="New campaign"
                  data-tooltip-side="bottom"
                  style={headerIconButtonStyle(true)}
                >
                  <Wand2 size={16} />
                </button>
                <button
                  type="button"
                  onClick={resetMarketing}
                  aria-label="Fresh start"
                  data-tooltip="Fresh start"
                  data-tooltip-side="bottom"
                  style={headerIconButtonStyle(false)}
                >
                  <RotateCcw size={16} />
                </button>
              </>
            ) : null}
          </div>
        }
      />

      <div role="tablist" aria-label="Campaigns workspace" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: 4, marginBottom: 16, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', width: 'fit-content', maxWidth: '100%', overflowX: 'auto' }}>
        <button type="button" role="tab" aria-selected={workspace === 'campaigns'} onClick={() => setWorkspace('campaigns')} style={workspaceTabStyle(workspace === 'campaigns')}>Campaigns</button>
        <button type="button" role="tab" aria-selected={workspace === 'planner'} onClick={() => setWorkspace('planner')} style={workspaceTabStyle(workspace === 'planner')}>Planner & channels</button>
        <button type="button" role="tab" aria-selected={workspace === 'social_operator'} onClick={() => setWorkspace('social_operator')} style={workspaceTabStyle(workspace === 'social_operator')}>Social Operator</button>
      </div>

      {workspace === 'social_operator' ? (
        <SocialOperatorPanel
          campaigns={campaigns}
          config={socialOperatorConfig}
          onCampaignSaved={campaign => upsertCampaign(campaign)}
          onOpenCampaign={campaignId => { setActiveId(campaignId); setWorkspace('campaigns') }}
        />
      ) : workspace === 'planner' ? (
        <SocialPublishing embedded onNavigate={onNavigate} onOpenCampaigns={() => setWorkspace('campaigns')} />
      ) : (
      <>
      {showGenerator && generatorCard}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))', gap: 16, alignItems: 'start' }}>
        <aside style={{ display: 'grid', gap: 16 }}>
          <section style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', marginBottom: 10 }}>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 900, color: 'var(--text)' }}>Campaign Control</h2>
                <div style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: 700 }}>{visibleCampaigns.length} of {campaigns.length} campaigns</div>
              </div>
              <button onClick={openGenerator} title="Create campaign" style={{
                width: 48,
                height: 48,
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'var(--accent-soft)',
                color: 'var(--accent)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <Wand2 size={15} />
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 190px), 1fr))', gap: 10, marginBottom: 12 }}>
              <Field label="Campaign name">
                <ThemedSelect value={activeId} onChange={e => setActiveId(e.target.value)} style={selectStyle()}>
                  <option value="">Select a campaign</option>
                  {campaigns.map(campaign => <option key={campaign.id} value={campaign.id}>{campaignMonthLabel(campaign)} - {campaign.name}</option>)}
                </ThemedSelect>
              </Field>
              <Field label="Search campaigns and copy">
                <input value={campaignSearch} onChange={e => setCampaignSearch(e.target.value)} placeholder="Search name, target, post text" style={inputStyle()} />
              </Field>
              <Field label="Status">
                <ThemedSelect value={campaignStatusFilter} onChange={e => setCampaignStatusFilter(e.target.value)} style={selectStyle()}>
                  <option value="all">All</option>
                  <option value="draft">Draft</option>
                  <option value="armed">Armed</option>
                </ThemedSelect>
              </Field>
              <div style={{ display: 'flex', alignItems: 'end', gap: 8, flexWrap: 'wrap' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 800, color: 'var(--text-muted)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={pagedCampaigns.length > 0 && pagedCampaigns.every(campaign => selectedCampaigns.includes(campaign.id))}
                    ref={el => { if (el) el.indeterminate = selectedCampaigns.length > 0 && !pagedCampaigns.every(campaign => selectedCampaigns.includes(campaign.id)) }}
                    onChange={e => setSelectedCampaigns(e.target.checked ? pagedCampaigns.map(campaign => campaign.id) : [])}
                    aria-label="Select all campaigns"
                    style={{ width: 16, height: 16, accentColor: 'var(--accent)' }}
                  />
                  Select all
                </label>
                <BulkActionsMenu
                  selectedCount={selectedCampaigns.length}
                  totalCount={pagedCampaigns.length}
                  onSelectPage={() => setSelectedCampaigns(pagedCampaigns.map(campaign => campaign.id))}
                  onClearSelection={() => setSelectedCampaigns([])}
                  onDeleteSelected={deleteSelectedCampaigns}
                  disabled={saving}
                />
              </div>
            </div>
            <div style={{ display: campaignView === 'card' ? 'grid' : 'block', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
              {loading && <Pill>Loading</Pill>}
              {!loading && campaigns.length === 0 && <Pill tone="warn">No campaigns yet</Pill>}
              {!loading && campaigns.length > 0 && visibleCampaigns.length === 0 && <Pill tone="warn">No campaigns match your search</Pill>}
              {pagedCampaigns.map(campaign => (
                <div
                  key={campaign.id}
                  role="button"
                  tabIndex={0}
                  aria-expanded={active?.id === campaign.id}
                  onClick={() => setActiveId(campaign.id)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      setActiveId(campaign.id)
                    }
                  }}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: campaignView === 'card' ? '1fr' : 'auto minmax(180px, 1.2fr) minmax(160px, 1fr) minmax(160px, 1fr) auto',
                    gap: 10,
                    alignItems: 'center',
                    borderRadius: 8,
                    border: `1px solid ${active?.id === campaign.id ? 'var(--accent)' : 'var(--border)'}`,
                    background: active?.id === campaign.id ? 'var(--accent-soft)' : 'var(--surface2)',
                    padding: 12,
                    marginBottom: campaignView === 'card' ? 0 : 8,
                    color: 'var(--text)',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedCampaigns.includes(campaign.id)}
                    onChange={(event) => {
                      event.stopPropagation()
                      toggleCampaignSelected(campaign.id)
                    }}
                    onClick={event => event.stopPropagation()}
                    aria-label={`Select ${campaign.name}`}
                    style={{ width: 16, height: 16, accentColor: 'var(--accent)' }}
                  />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 900, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{campaign.name}</div>
                    <div style={{ color: 'var(--accent)', fontSize: 11, fontWeight: 900, marginTop: 3, textTransform: 'uppercase' }}>{campaignMonthLabel(campaign)}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: 700, marginTop: 3 }}>{campaign.audience} · {campaign.market}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: 700, marginTop: 3 }}>{(campaign.platforms || []).join(', ') || 'No platforms selected'}</div>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    <Pill>{campaign.offerLabel}</Pill>
                    <Pill tone={campaign.autopilot?.enabled ? 'good' : 'neutral'}>{campaign.autopilot?.enabled ? 'Ready' : 'Manual'}</Pill>
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {campaign.autopilot?.destination || 'No destination'}
                  </div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                    <ActionButton onClick={() => { setActiveId(campaign.id); setRenameDraft(campaign.name); setRenaming(true) }}><Pencil size={14} /> Rename</ActionButton>
                    <ActionButton onClick={() => { setActiveId(campaign.id); setConfirmDelete(true) }}><Trash2 size={14} /> Delete</ActionButton>
                  </div>
                </div>
              ))}
            </div>
            <Paginator total={visibleCampaigns.length} page={campaignPage} pageSize={campaignPageSize} onPage={setCampaignPage} onPageSize={setCampaignPageSize} label="campaigns" />
          </section>
        </aside>

        <main style={active ? {
          display: 'grid',
          gap: 12,
          minWidth: 0,
          alignContent: 'start',
          maxHeight: 'calc(100vh - 150px)',
          overflowY: 'auto',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: 12,
        } : { display: 'none' }}>
          {!active ? (
            <section style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 24 }}>
              <Pill tone={campaigns.length ? 'neutral' : 'warn'}>{campaigns.length ? 'Select a campaign to open its queue' : 'No campaigns yet'}</Pill>
              <div style={{ marginTop: 14 }}>
                <ActionButton onClick={openGenerator}><Wand2 size={14} /> New Campaign</ActionButton>
              </div>
            </section>
          ) : (
            <>
              <section style={{ order: -2, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start', flexWrap: 'wrap' }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    {renaming ? (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        <input value={renameDraft} onChange={e => setRenameDraft(e.target.value)} style={{ ...inputStyle(), maxWidth: 320, fontWeight: 800 }} autoFocus />
                        <ActionButton onClick={saveRename}><Check size={14} /> Save</ActionButton>
                        <ActionButton onClick={() => setRenaming(false)}>Cancel</ActionButton>
                      </div>
                    ) : (
                      <h2 style={{ color: 'var(--text)', fontSize: 18, fontWeight: 900 }}>{active.name}</h2>
                    )}
                    <p style={{ color: 'var(--text-muted)', marginTop: 4 }}>{active.objective} for {active.audience} in {active.market}</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                      <Pill tone="active">{active.autopilot?.destination || 'No destination set'}</Pill>
                      <Pill>{active.tenantId || 'farrington-development'}</Pill>
                      <Pill tone={campaignPublisher.connected ? 'active' : 'warn'}>
                        {campaignPublisher.connected ? 'Automatic publishing connected' : (campaignPublisher.reason || 'Automatic publishing unavailable')}
                      </Pill>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <ActionButton onClick={() => { setActiveId(''); setSelectedPostId(''); setEditId(''); setPushId(''); setPostActionStatus('') }}>Close Preview</ActionButton>
                    {!renaming && <ActionButton onClick={() => { setRenameDraft(active.name); setRenaming(true) }}><Pencil size={14} /> Rename</ActionButton>}
                    {confirmDelete ? (
                      <>
                        <ActionButton onClick={deleteActiveCampaign}><Trash2 size={14} /> Confirm delete</ActionButton>
                        <ActionButton onClick={() => setConfirmDelete(false)}>Cancel</ActionButton>
                      </>
                    ) : (
                      <ActionButton onClick={() => setConfirmDelete(true)}><Trash2 size={14} /> Delete</ActionButton>
                    )}
                    <button onClick={armAutopilot} style={{
                      minHeight: 48,
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      background: ready ? 'rgba(34,197,94,0.18)' : 'var(--surface2)',
                      color: ready ? 'rgb(74,222,128)' : 'var(--text-muted)',
                      padding: '0 14px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      fontSize: 16,
                      fontWeight: 800,
                    }}>
                      <Play size={16} /> {active.autopilot?.enabled ? 'Marked ready' : 'Mark ready'}
                    </button>
                  </div>
                </div>
                <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: 800 }}>Image engine</span>
                  <ThemedSelect value={active.creationEndpoint} onChange={e => patchCampaign({ creationEndpoint: e.target.value })} style={{ ...selectStyle(), width: 280 }}>
                    {endpoints.map(ep => <option key={ep.id} value={ep.id}>{ep.label}</option>)}
                  </ThemedSelect>
                  {activeEndpoint?.modelLabel && (
                    <span style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: 700, overflowWrap: 'anywhere' }}>
                      {activeEndpoint.modelLabel} · {activeEndpoint.costPerImage === 0 ? 'free' : `~$${Number(activeEndpoint.costPerImage).toFixed(2)}/image`}
                    </span>
                  )}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, marginTop: 12 }}>
                  <Metric label="Posts" value={active.summary?.total || 0} />
                  <Metric label="Assets ready" value={`${active.summary?.assetsReady || 0}/${active.summary?.total || 0}`} />
                  <Metric label="Approved" value={`${active.summary?.approved || 0}/${active.summary?.total || 0}`} />
                  <Metric label="Engine" value={activeEndpoint?.modelLabel || activeEndpoint?.label || active.creationEndpoint} />
                </div>
              </section>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {[
                  { id: 'all', label: 'All' },
                  { id: 'draft', label: 'Draft' },
                  { id: 'asset_ready', label: 'Asset ready' },
                  { id: 'approved', label: 'Approved' },
                  { id: 'scheduled', label: 'Scheduled' },
                ].map(c => {
                  const count = c.id === 'all' ? (active.posts || []).length : (active.posts || []).filter(p => p.status === c.id).length
                  const on = postFilter === c.id
                  return (
                    <button key={c.id} onClick={() => setPostFilter(c.id)} style={{
                      minHeight: 48, padding: '0 14px', borderRadius: 999,
                      border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                      background: on ? 'var(--accent-soft)' : 'var(--surface2)',
                      color: on ? 'var(--accent)' : 'var(--text-muted)',
                      fontWeight: 800, fontSize: 16, cursor: 'pointer',
                    }}>{c.label} {count}</button>
                  )
                })}
              </div>

              {postActionStatus && (
                <div role="status" style={{ background: 'var(--accent-soft)', border: '1px solid var(--border)', borderRadius: 8, padding: 10, color: 'var(--accent)', fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <ActivityCue state={actionCueState} label={actionCueState === 'working' ? 'Working' : actionCueState === 'done' ? 'Done' : 'Ready'} compact />
                  <span>{postActionStatus}</span>
                </div>
              )}

              <section style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
                  <h3 style={{ color: 'var(--text)', fontSize: 15, fontWeight: 900 }}>Post Queue</h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <ViewModeToggle value={postView} onChange={setPostView} modes={['card', 'list']} />
                    <ComponentSettings
                      components={[
                        { id: 'campaign-studio.post-queue', context: {} },
                        { id: 'campaign-studio.image-gen', context: { brandId: active?.brandId || '', campaignId: active?.id || '', brandLabel: brandLabel(active?.brandId) } },
                      ]}
                      title="Post Queue settings"
                      onApplied={applyComponentSettings}
                    />
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 800, color: 'var(--text-muted)', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={pagedPosts.length > 0 && pagedPosts.every(post => selectedPosts.includes(post.id))}
                        ref={el => { if (el) el.indeterminate = selectedPosts.length > 0 && !pagedPosts.every(post => selectedPosts.includes(post.id)) }}
                        onChange={e => setSelectedPosts(e.target.checked ? pagedPosts.map(post => post.id) : [])}
                        aria-label="Select all posts on this page"
                        style={{ width: 16, height: 16, accentColor: 'var(--accent)' }}
                      />
                      Select all
                    </label>
                    <Pill>{filteredPosts.length} visible</Pill>
                    <BulkActionsMenu
                      selectedCount={selectedPosts.length}
                      totalCount={pagedPosts.length}
                      onSelectPage={() => setSelectedPosts(pagedPosts.map(post => post.id))}
                      onClearSelection={() => setSelectedPosts([])}
                      onDeleteSelected={deleteSelectedPosts}
                      disabled={saving}
                    />
                  </div>
                </div>
                {filteredPosts.length === 0 && (
                  <div style={{ padding: 12 }}><Pill tone="neutral">No posts in this view</Pill></div>
                )}
                {pagedPosts.map(post => {
                  const on = selectedPost?.id === post.id
                  const postWorking = assetBusy === post.id || pushBusy === post.id || (pushId === post.id && pushChannelsLoading)
                  const postDone = !!post.assetUrl || post.status === 'approved' || post.status === 'scheduled'
                  const cueLabel = postWorking ? 'Working' : post.status === 'scheduled' ? 'Scheduled' : post.assetUrl ? 'Image ready' : post.status === 'approved' ? 'Approved' : 'Draft'
                  if (postView === 'list' && !on) {
                    return (
                      <div
                        key={post.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => openPost(post)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault()
                            openPost(post)
                          }
                        }}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', border: '1px solid var(--border)', borderRadius: 8, marginBottom: 6, background: 'var(--surface2)', color: 'var(--text)', cursor: 'pointer' }}
                      >
                        <input
                          type="checkbox"
                          checked={selectedPosts.includes(post.id)}
                          onChange={(event) => { event.stopPropagation(); togglePostSelected(post.id) }}
                          onClick={event => event.stopPropagation()}
                          aria-label={`Select post ${post.sequence}`}
                          style={{ width: 16, height: 16, accentColor: 'var(--accent)', flexShrink: 0 }}
                        />
                        <Pill tone="active">#{post.sequence} {post.platform}</Pill>
                        <Pill>{statusLabels[post.status] || post.status}</Pill>
                        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 800 }}>{post.hook || post.body}</span>
                        <span style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: 800, whiteSpace: 'nowrap' }}>{formatDate(post.scheduledFor)}</span>
                      </div>
                    )
                  }
                  return (
                    <div
                      key={post.id}
                      role="button"
                      tabIndex={0}
                      aria-expanded={on}
                      onClick={() => openPost(post)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          openPost(post)
                        }
                      }}
                      style={{
                      display: 'grid',
                      gap: 9,
                      padding: 10,
                      border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                      borderRadius: 8,
                      marginBottom: 8,
                      background: on ? 'var(--accent-soft)' : 'var(--surface2)',
                      color: 'var(--text)',
                      cursor: 'pointer',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                          <input
                            type="checkbox"
                            checked={selectedPosts.includes(post.id)}
                            onChange={(event) => { event.stopPropagation(); togglePostSelected(post.id) }}
                            onClick={event => event.stopPropagation()}
                            aria-label={`Select post ${post.sequence}`}
                            style={{ width: 16, height: 16, accentColor: 'var(--accent)' }}
                          />
                          <Pill tone="active">#{post.sequence} {post.platform}</Pill>
                          <Pill>{statusLabels[post.status] || post.status}</Pill>
                          <Pill tone={post.assetUrl ? 'good' : 'warn'}>{post.assetUrl ? 'Image ready' : (assetLabels[post.assetStatus] || post.assetStatus)}</Pill>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <ActivityCue state={postWorking ? 'working' : postDone ? 'done' : 'idle'} label={cueLabel} />
                          <span style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: 800 }}>{formatDate(post.scheduledFor)}</span>
                        </div>
                      </div>
                      <div style={{ color: 'var(--text)', fontWeight: 900, overflowWrap: 'anywhere' }}>{post.hook}</div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <ActionButton onClick={() => startEdit(post)}><Pencil size={14} /> Edit</ActionButton>
                        <ActionButton onClick={() => setPickerPostId(post.id)} disabled={!!assetBusy}><Images size={14} /> {post.assetUrl ? 'Swap Image' : 'Use My Image'}</ActionButton>
                        <ActionButton onClick={() => { setSelectedPostId(post.id); generateAsset(post.id) }} disabled={!!assetBusy} busy={assetBusy === post.id}>
                          {assetBusy === post.id ? 'Generating...' : (post.assetUrl ? 'Regenerate' : 'Generate Image')}
                        </ActionButton>
                        <ActionButton onClick={() => schedulePost(post)} disabled={!!pushBusy} busy={pushBusy === post.id}><Send size={14} /> Schedule</ActionButton>
                      </div>
                      {assetBusy === post.id && (
                        <div style={{ color: 'var(--accent)', fontSize: 13, fontWeight: 800 }}>
                          Creating image and saving it back to this post...
                        </div>
                      )}
                      {on && (
                        <div className="campaign-post-drawer" onClick={event => event.stopPropagation()} style={{
                          display: 'grid',
                          gap: 12,
                          background: 'var(--surface)',
                          border: '1px solid var(--border)',
                          borderRadius: 8,
                          padding: 14,
                          cursor: 'default',
                          animation: 'campaign-drawer-slide 180ms ease-out',
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                            <strong style={{ color: 'var(--text)', fontSize: 16 }}>Post #{post.sequence}</strong>
                            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                              <ActivityCue state={postWorking ? 'working' : postDone ? 'done' : 'idle'} label={cueLabel} />
                              <ActionButton onClick={() => { setSelectedPostId(''); setEditId(''); setPushId(''); setPostActionStatus('') }}>Close</ActionButton>
                            </div>
                          </div>

                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 12, alignItems: 'start' }}>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                                <Pill tone="active">#{post.sequence} {post.platform}</Pill>
                                <Pill>{post.format}</Pill>
                                <Pill tone={post.status === 'approved' || post.status === 'scheduled' ? 'good' : post.status === 'asset_needed' ? 'warn' : 'neutral'}>{statusLabels[post.status] || post.status}</Pill>
                                <Pill tone={post.assetStatus === 'ready' || post.assetStatus === 'attached' || post.assetStatus === 'not_required' ? 'good' : 'warn'}>{assetLabels[post.assetStatus] || post.assetStatus}</Pill>
                              </div>
                              {editId === post.id ? (
                                <div style={{ display: 'grid', gap: 8, marginBottom: 8 }}>
                                  <Field label="Headline"><input value={editDraft.hook} onChange={e => setEditDraft(d => ({ ...d, hook: e.target.value }))} style={inputStyle()} /></Field>
                                  <Field label="Body"><textarea value={editDraft.body} onChange={e => setEditDraft(d => ({ ...d, body: e.target.value }))} rows={3} style={{ ...inputStyle(), resize: 'vertical' }} /></Field>
                                  <Field label="Call to action"><input value={editDraft.cta} onChange={e => setEditDraft(d => ({ ...d, cta: e.target.value }))} style={inputStyle()} /></Field>
                                  <Field label="Image brief (describe the visual - no text in the image)"><textarea value={editDraft.assetBrief} onChange={e => setEditDraft(d => ({ ...d, assetBrief: e.target.value }))} rows={2} style={{ ...inputStyle(), resize: 'vertical' }} /></Field>
                                </div>
                              ) : (
                                <>
                                  <h3 style={{ color: 'var(--text)', fontSize: 16, fontWeight: 900, marginBottom: 6 }}>{post.hook}</h3>
                                  <p style={{ color: 'var(--text)', lineHeight: 1.45, marginBottom: 8 }}>{post.body}</p>
                                  <p style={{ color: 'var(--accent)', fontWeight: 800 }}>{post.cta}</p>
                                  <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 10 }}>{post.assetBrief}</div>
                                </>
                              )}
                              {post.assetUrl && (
                                <div style={{ marginTop: 12 }}>
                                  <img src={campaignAssetUrl(post.assetUrl, post.assetUpdatedAt || post.updatedAt || active?.updatedAt || post.assetUrl)} alt={post.hook} loading="lazy" decoding="async" style={{ width: '100%', maxWidth: 360, borderRadius: 8, border: '1px solid var(--border)', display: 'block' }} />
                                  {post.assetModel && (
                                    <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 6, fontWeight: 700 }}>
                                      {post.assetModel} / {post.assetVendor} / {typeof post.assetCost === 'number' ? (post.assetCost === 0 ? 'free' : `$${post.assetCost.toFixed(2)}/image`) : 'cost n/a'}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>

                            <div style={{ display: 'grid', gap: 8, minWidth: 152 }}>
                              <Pill><CalendarClock size={13} style={{ marginRight: 5 }} /> {formatDate(post.scheduledFor) || 'Not scheduled'}</Pill>
                              {editId === post.id ? (
                                <>
                                  <ActionButton onClick={() => saveEdit(post.id)}><Check size={14} /> Save changes</ActionButton>
                                  <ActionButton onClick={cancelEdit}>Cancel edit</ActionButton>
                                </>
                              ) : (
                                <>
                                  <ActionButton onClick={() => startEdit(post)}><Pencil size={14} /> Edit copy</ActionButton>
                                  <ActionButton onClick={() => setPickerPostId(post.id)} disabled={!!assetBusy}><Images size={14} /> {post.assetUrl ? 'Swap image' : 'Use my image'}</ActionButton>
                                  <ActionButton onClick={() => generateAsset(post.id)} disabled={!!assetBusy} busy={assetBusy === post.id}>
                                    {assetBusy === post.id ? 'Generating...' : (post.assetUrl ? 'Regenerate image' : 'Generate image')}
                                  </ActionButton>
                                  <ActionButton onClick={() => setPostStatus(post.id, { status: 'approved' }, 'Post approved - see the Approved filter')}><Check size={14} /> {post.status === 'approved' ? 'Approved' : 'Approve'}</ActionButton>
                                  <ActionButton onClick={() => setPostStatus(post.id, { status: 'scheduled' }, 'Marked scheduled - this does not push to Postiz')}>{post.status === 'scheduled' ? 'Marked scheduled' : 'Mark scheduled'}</ActionButton>
                                  <ActionButton onClick={() => openPushPanel(post)} disabled={!!pushBusy} busy={pushBusy === post.id}><Send size={14} /> {pushBusy === post.id ? 'Scheduling...' : (pushId === post.id ? 'Hide scheduler' : 'Open scheduler')}</ActionButton>
                                </>
                              )}
                            </div>
                          </div>

                          {pushId === post.id && (
                            <div style={{ padding: 12, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface2)' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                                <Send size={16} color="var(--accent)" />
                                <strong style={{ color: 'var(--text)', fontSize: 16 }}>Schedule in Postiz</strong>
                              </div>
                              <div style={{ display: 'grid', gap: 4, marginBottom: 12, padding: 10, borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border)' }}>
                                <strong style={{ color: 'var(--text)', fontSize: 13 }}>Nothing is sent yet.</strong>
                                <span style={{ color: 'var(--text-muted)', fontSize: 13, fontWeight: 700 }}>
                                  Pick the account, confirm the publish time, then press {schedulePreview ? `Schedule for ${schedulePreview}` : 'Schedule post'}.
                                </span>
                              </div>
                              {pushChannelsLoading && <Pill>Loading channels...</Pill>}
                              {pushChannelsError && <Pill tone="warn">{pushChannelsError}</Pill>}
                              {!pushChannelsLoading && !pushChannelsError && pushChannels.length === 0 && (
                                <Pill tone="warn">No Postiz channels assigned to this campaign's tenant ({active && active.tenantId || 'farrington-development'}). Tag a channel below or connect one under Planner & channels.</Pill>
                              )}
                              {pushChannels.length > 0 && (
                                <div style={{ display: 'grid', gap: 12 }}>
                                  <div>
                                    <div style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: 800, marginBottom: 6 }}>Where to post</div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                      {pushChannels.map(ch => {
                                        const selected = pushSelected.includes(ch.id)
                                        return (
                                          <button key={ch.id} type="button" onClick={() => togglePushChannel(ch.id)} disabled={ch.disabled} style={{
                                            minHeight: 48, padding: '0 14px', borderRadius: 8,
                                            border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                                            background: selected ? 'var(--accent-soft)' : 'var(--surface)',
                                            color: selected ? 'var(--accent)' : 'var(--text)',
                                            fontSize: 16, fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 8,
                                            opacity: ch.disabled ? 0.5 : 1, cursor: ch.disabled ? 'not-allowed' : 'pointer',
                                          }}>
                                            {ch.picture && <img src={ch.picture} alt="" style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover' }} />}
                                            <span>{ch.identifier || ch.name}{ch.profile ? ` / ${ch.profile}` : ''}</span>
                                            {selected && <Check size={16} />}
                                          </button>
                                        )
                                      })}
                                    </div>
                                  </div>
                                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                                    <Field label="Publish time">
                                      <input type="datetime-local" value={pushWhen} onChange={e => setPushWhen(e.target.value)} style={{ ...inputStyle(), fontSize: 16, minHeight: 48 }} />
                                      <div style={{ marginTop: 6, color: 'var(--accent)', fontSize: 13, fontWeight: 900 }}>
                                        {schedulePreview ? `Postiz will publish this on ${schedulePreview}.` : 'Choose the exact publish time.'}
                                      </div>
                                    </Field>
                                    <Field label="Image">
                                      <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                                        {post.assetUrl ? (post.assetProvider === 'library' ? 'Your Media image will be uploaded to Postiz.' : 'Generated asset will be uploaded to Postiz.') : 'No image - text-only post.'}
                                      </div>
                                    </Field>
                                  </div>
                                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                    <button type="button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); confirmPush(post) }} disabled={pushBusy === post.id || !pushWhen} aria-busy={pushBusy === post.id} style={{
                                      minHeight: 48, padding: '0 18px', borderRadius: 8,
                                      border: '1px solid var(--border)', background: 'var(--accent)', color: 'var(--accent-text)',
                                      fontSize: 16, fontWeight: 900, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                      flex: '1 1 260px', minWidth: 0, whiteSpace: 'normal', lineHeight: 1.2, textAlign: 'center',
                                      cursor: (pushBusy === post.id || !pushWhen) ? 'not-allowed' : 'pointer', opacity: (pushBusy === post.id || !pushWhen) ? 0.7 : 1,
                                    }}>
                                      <Send size={16} /> {pushBusy === post.id ? 'Scheduling...' : schedulePreview ? `Schedule for ${schedulePreview}` : 'Choose time first'}
                                    </button>
                                    <button type="button" onClick={(event) => { event.stopPropagation(); setPushId('') }} style={{
                                      minHeight: 48, padding: '0 18px', borderRadius: 8,
                                      border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)',
                                      fontSize: 16, fontWeight: 800, cursor: 'pointer',
                                    }}>Hide scheduler</button>
                                  </div>
                                  {pushPanelStatus && (
                                    <div role="status" style={{ color: 'var(--text-muted)', fontSize: 13, fontWeight: 700 }}>
                                      {pushPanelStatus}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
                <Paginator total={filteredPosts.length} page={postPage} pageSize={postPageSize} onPage={setPostPage} onPageSize={setPostPageSize} label="posts" />
              </section>

              <section style={{ display: 'none' }}>
                {!selectedPost && (
                  <Pill tone="neutral">No posts in this view</Pill>
                )}
                {[selectedPost].filter(Boolean).map(post => (
                  <article key={post.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
                      <strong style={{ color: 'var(--text)', fontSize: 16 }}>Post #{post.sequence}</strong>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <ActivityCue
                          state={(assetBusy === post.id || pushBusy === post.id || (pushId === post.id && pushChannelsLoading)) ? 'working' : (post.assetUrl || post.status === 'approved' || post.status === 'scheduled') ? 'done' : 'idle'}
                          label={(assetBusy === post.id || pushBusy === post.id || (pushId === post.id && pushChannelsLoading)) ? 'Working' : post.status === 'scheduled' ? 'Scheduled' : post.assetUrl ? 'Image ready' : post.status === 'approved' ? 'Approved' : 'Draft'}
                        />
                        <ActionButton onClick={() => { setSelectedPostId(''); setEditId(''); setPushId(''); setPostActionStatus('') }}>Close Post</ActionButton>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))', gap: 12, alignItems: 'start' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                          <Pill tone="active">#{post.sequence} {post.platform}</Pill>
                          <Pill>{post.format}</Pill>
                          <Pill tone={post.status === 'approved' || post.status === 'scheduled' ? 'good' : post.status === 'asset_needed' ? 'warn' : 'neutral'}>{statusLabels[post.status] || post.status}</Pill>
                          <Pill tone={post.assetStatus === 'ready' || post.assetStatus === 'attached' || post.assetStatus === 'not_required' ? 'good' : 'warn'}>{assetLabels[post.assetStatus] || post.assetStatus}</Pill>
                        </div>
                        {editId === post.id ? (
                          <div style={{ display: 'grid', gap: 8, marginBottom: 8 }}>
                            <Field label="Headline"><input value={editDraft.hook} onChange={e => setEditDraft(d => ({ ...d, hook: e.target.value }))} style={inputStyle()} /></Field>
                            <Field label="Body"><textarea value={editDraft.body} onChange={e => setEditDraft(d => ({ ...d, body: e.target.value }))} rows={3} style={{ ...inputStyle(), resize: 'vertical' }} /></Field>
                            <Field label="Call to action"><input value={editDraft.cta} onChange={e => setEditDraft(d => ({ ...d, cta: e.target.value }))} style={inputStyle()} /></Field>
                            <Field label="Image brief (describe the visual - no text in the image)"><textarea value={editDraft.assetBrief} onChange={e => setEditDraft(d => ({ ...d, assetBrief: e.target.value }))} rows={2} style={{ ...inputStyle(), resize: 'vertical' }} /></Field>
                          </div>
                        ) : (
                          <>
                            <h3 style={{ color: 'var(--text)', fontSize: 16, fontWeight: 900, marginBottom: 6 }}>{post.hook}</h3>
                            <p style={{ color: 'var(--text)', lineHeight: 1.45, marginBottom: 8 }}>{post.body}</p>
                            <p style={{ color: 'var(--accent)', fontWeight: 800 }}>{post.cta}</p>
                            <div style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 10 }}>{post.assetBrief}</div>
                          </>
                        )}
                        {post.assetUrl && (
                          <div style={{ marginTop: 12 }}>
                            <img
                              src={campaignAssetUrl(post.assetUrl, post.assetUpdatedAt || post.updatedAt || active?.updatedAt || post.assetUrl)}
                              alt={post.hook}
                              loading="lazy"
                              decoding="async"
                              style={{ width: '100%', maxWidth: 360, borderRadius: 8, border: '1px solid var(--border)', display: 'block' }}
                            />
                            {post.assetModel && (
                              <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 6, fontWeight: 700 }}>
                                {post.assetModel} / {post.assetVendor} / {typeof post.assetCost === 'number' ? (post.assetCost === 0 ? 'free' : `$${post.assetCost.toFixed(2)}/image`) : 'cost n/a'}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'grid', gap: 8, minWidth: 152 }}>
                        <Pill><CalendarClock size={13} style={{ marginRight: 5 }} /> {formatDate(post.scheduledFor)}</Pill>
                        {editId === post.id ? (
                          <>
                            <ActionButton onClick={() => saveEdit(post.id)}><Check size={14} /> Save</ActionButton>
                            <ActionButton onClick={cancelEdit}>Cancel</ActionButton>
                          </>
                        ) : (
                          <>
                            <ActionButton onClick={() => startEdit(post)}><Pencil size={14} /> Edit Copy</ActionButton>
                            <ActionButton onClick={() => setPickerPostId(post.id)} disabled={!!assetBusy}><Images size={14} /> {post.assetUrl ? 'Swap Image' : 'Use My Image'}</ActionButton>
                            <ActionButton onClick={() => generateAsset(post.id)} disabled={!!assetBusy} busy={assetBusy === post.id}>
                              {assetBusy === post.id ? 'Generating...' : (post.assetUrl ? 'Regenerate Image' : 'Generate Image')}
                            </ActionButton>
                            <ActionButton onClick={() => setPostStatus(post.id, { status: 'approved' }, 'Post approved - see the Approved filter')}><Check size={14} /> {post.status === 'approved' ? 'Approved' : 'Approve'}</ActionButton>
                            <ActionButton onClick={() => setPostStatus(post.id, { status: 'scheduled' }, 'Marked scheduled - this does not push to Postiz')}>{post.status === 'scheduled' ? 'Marked scheduled' : 'Mark scheduled'}</ActionButton>
                            <ActionButton onClick={() => openPushPanel(post)} disabled={!!pushBusy} busy={pushBusy === post.id}><Send size={14} /> {pushBusy === post.id ? 'Scheduling...' : (pushId === post.id ? 'Hide scheduler' : 'Open scheduler')}</ActionButton>
                          </>
                        )}
                      </div>
                    </div>
                    {pushId === post.id && (
                      <div style={{ marginTop: 12, padding: 12, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface2)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                          <Send size={16} color="var(--accent)" />
                          <strong style={{ color: 'var(--text)', fontSize: 16 }}>Schedule in Postiz</strong>
                        </div>
                        <div style={{ display: 'grid', gap: 4, marginBottom: 12, padding: 10, borderRadius: 8, background: 'var(--surface)', border: '1px solid var(--border)' }}>
                          <strong style={{ color: 'var(--text)', fontSize: 13 }}>Nothing is sent yet.</strong>
                          <span style={{ color: 'var(--text-muted)', fontSize: 13, fontWeight: 700 }}>
                            Pick the account, confirm the publish time, then press {schedulePreview ? `Schedule for ${schedulePreview}` : 'Schedule post'}.
                          </span>
                        </div>
                        {pushChannelsLoading && <Pill>Loading channels...</Pill>}
                        {pushChannelsError && <Pill tone="warn">{pushChannelsError}</Pill>}
                        {!pushChannelsLoading && !pushChannelsError && pushChannels.length === 0 && (
                          <Pill tone="warn">No Postiz channels assigned to this campaign's tenant ({active && active.tenantId || 'farrington-development'}). Tag a channel below or connect one under Planner & channels.</Pill>
                        )}
                        {pushChannels.length > 0 && (
                          <div style={{ display: 'grid', gap: 12 }}>
                            <div>
                              <div style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: 800, marginBottom: 6 }}>Where to post</div>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                {pushChannels.map(ch => {
                                  const on = pushSelected.includes(ch.id)
                                  return (
                                    <button key={ch.id} type="button" onClick={() => togglePushChannel(ch.id)} disabled={ch.disabled} style={{
                                      minHeight: 48,
                                      padding: '0 14px',
                                      borderRadius: 8,
                                      border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                                      background: on ? 'var(--accent-soft)' : 'var(--surface)',
                                      color: on ? 'var(--accent)' : 'var(--text)',
                                      fontSize: 16, fontWeight: 800,
                                      display: 'inline-flex', alignItems: 'center', gap: 8,
                                      opacity: ch.disabled ? 0.5 : 1,
                                      cursor: ch.disabled ? 'not-allowed' : 'pointer',
                                    }}>
                                      {ch.picture && <img src={ch.picture} alt="" style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover' }} />}
                                      <span>{ch.identifier || ch.name}{ch.profile ? ` / ${ch.profile}` : ''}</span>
                                      {on && <Check size={16} />}
                                    </button>
                                  )
                                })}
                              </div>
                              <details style={{ marginTop: 8 }}>
                                <summary style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>Re-assign a channel to a different tenant (admin)</summary>
                                <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
                                  {pushChannels.map(ch => (
                                    <div key={'tag-' + ch.id} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                                      <span style={{ color: 'var(--text-muted)', fontSize: 12, minWidth: 160 }}>{ch.identifier || ch.name}</span>
                                      <input defaultValue={ch.tenantId || ''} placeholder="tenantId" onBlur={async (e) => {
                                        const next = (e.target.value || '').trim() || 'farrington-development'
                                        if (next === ch.tenantId) return
                                        const r = await fetch('/api/postiz/channel-tenant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channelId: ch.id, tenantId: next }) })
                                        const j = await readPostizJson(r)
                                        if (j.ok) { flash('Channel re-tagged'); openPushPanel(post) } else { flash(postizErrorMessage(j, 'Re-tag failed')) }
                    }} style={{ ...inputStyle(), maxWidth: 260, fontSize: 16, minHeight: 48 }} />
                                    </div>
                                  ))}
                                </div>
                              </details>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
                              <Field label="Publish time">
                                <input type="datetime-local" value={pushWhen} onChange={e => setPushWhen(e.target.value)} style={{ ...inputStyle(), fontSize: 16, minHeight: 48 }} />
                                <div style={{ marginTop: 6, color: 'var(--accent)', fontSize: 13, fontWeight: 900 }}>
                                  {schedulePreview ? `Postiz will publish this on ${schedulePreview}.` : 'Choose the exact publish time.'}
                                </div>
                              </Field>
                              <Field label="Image">
                                <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                                  {post.assetUrl ? (post.assetProvider === 'library' ? 'Your Media image will be uploaded to Postiz.' : 'Generated asset will be uploaded to Postiz.') : 'No image - text-only post.'}
                                </div>
                              </Field>
                            </div>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                              <button type="button" onClick={(event) => { event.preventDefault(); event.stopPropagation(); confirmPush(post) }} disabled={pushBusy === post.id || !pushWhen} aria-busy={pushBusy === post.id} style={{
                                minHeight: 48, padding: '0 18px', borderRadius: 8,
                                border: '1px solid var(--border)', background: 'var(--accent)', color: 'var(--accent-text)',
                                fontSize: 16, fontWeight: 900, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                flex: '1 1 260px', minWidth: 0, whiteSpace: 'normal', lineHeight: 1.2, textAlign: 'center',
                                cursor: (pushBusy === post.id || !pushWhen) ? 'not-allowed' : 'pointer', opacity: (pushBusy === post.id || !pushWhen) ? 0.7 : 1,
                              }}>
                                <Send size={16} /> {pushBusy === post.id ? 'Scheduling...' : schedulePreview ? `Schedule for ${schedulePreview}` : 'Choose time first'}
                              </button>
                              <button type="button" onClick={() => setPushId('')} style={{
                                minHeight: 48, padding: '0 18px', borderRadius: 8,
                                border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)',
                                fontSize: 16, fontWeight: 800, cursor: 'pointer',
                              }}>Hide scheduler</button>
                            </div>
                            {pushPanelStatus && (
                              <div role="status" style={{ color: 'var(--text-muted)', fontSize: 13, fontWeight: 700 }}>
                                {pushPanelStatus}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </article>
                ))}
              </section>
            </>
          )}
        </main>
      </div>
      </>
      )}
      <style jsx global>{`
        @keyframes campaign-twirl {
          to { transform: rotate(360deg); }
        }
        @keyframes campaign-dot-ready {
          0%, 100% { box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.28); }
          50% { box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.12); }
        }
        @keyframes campaign-drawer-slide {
          from { opacity: 0; transform: translateY(-6px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
      <MediaPickerModal
        open={!!pickerPostId}
        busy={attachBusy}
        title="Choose an image from Media"
        onClose={() => { if (!attachBusy) setPickerPostId('') }}
        onSelect={item => attachAsset(pickerPostId, item)}
      />
    </div>
  )
}

function Metric({ label, value }) {
  return (
    <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
      <div style={{ color: 'var(--text-muted)', fontSize: 12, fontWeight: 800 }}>{label}</div>
      <div style={{ color: 'var(--text)', fontSize: 19, fontWeight: 900, marginTop: 2, overflowWrap: 'anywhere' }}>{value}</div>
    </div>
  )
}

function ActivityCue({ state = 'idle', label, compact = false }) {
  const working = state === 'working'
  const done = state === 'done'
  const color = working || done ? 'var(--accent)' : 'var(--text-muted)'
  return (
    <span aria-label={label} title={label} style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: compact ? 5 : 6,
      color,
      fontSize: compact ? 12 : 11,
      fontWeight: 900,
      minHeight: compact ? 18 : 20,
      whiteSpace: 'nowrap',
    }}>
      {working ? (
        <RotateCcw size={compact ? 13 : 14} style={{ animation: 'campaign-twirl 900ms linear infinite' }} />
      ) : (
        <span style={{
          width: compact ? 8 : 9,
          height: compact ? 8 : 9,
          borderRadius: '50%',
          background: done ? 'var(--accent)' : 'var(--border)',
          display: 'inline-block',
          animation: done ? 'campaign-dot-ready 1.8s ease-in-out infinite' : 'none',
        }} />
      )}
      <span>{label}</span>
    </span>
  )
}

function headerIconButtonStyle(primary = false) {
  return {
    width: 48,
    height: 48,
    minWidth: 48,
    display: 'grid',
    placeItems: 'center',
    borderRadius: 8,
    border: primary ? '1px solid var(--accent)' : '1px solid var(--border)',
    background: primary ? 'var(--accent)' : 'var(--surface2)',
    color: primary ? 'var(--accent-text)' : 'var(--text)',
    cursor: 'pointer',
  }
}

function workspaceTabStyle(active) {
  return {
    minHeight: 48,
    border: 0,
    borderRadius: 6,
    padding: '8px 16px',
    background: active ? 'var(--accent)' : 'transparent',
    color: active ? 'var(--accent-text)' : 'var(--text-muted)',
    fontSize: 16,
    fontWeight: 900,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  }
}

function wizardButtonStyle(primary = false, disabled = false) {
  return {
    minHeight: 48,
    borderRadius: 8,
    border: `1px solid ${primary ? 'var(--accent)' : 'var(--border)'}`,
    background: primary ? 'var(--accent)' : 'var(--surface2)',
    color: primary ? 'var(--accent-text)' : 'var(--text)',
    padding: '0 18px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    fontSize: 16,
    fontWeight: 900,
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.58 : 1,
  }
}

function ActionButton({ children, onClick, disabled = false, busy = false }) {
  return (
    <button type="button" onClick={(event) => {
      event.stopPropagation()
      if (!disabled && onClick) onClick(event)
    }} disabled={disabled} style={{
      minHeight: 48,
      borderRadius: 8,
      border: '1px solid var(--border)',
      background: busy ? 'var(--accent-soft)' : 'var(--surface2)',
      color: busy ? 'var(--accent)' : 'var(--text)',
      padding: '0 14px',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      fontSize: 16,
      fontWeight: 800,
      whiteSpace: 'nowrap',
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled && !busy ? 0.55 : 1,
    }}>
      {children}
    </button>
  )
}
