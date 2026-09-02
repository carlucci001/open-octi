'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  FileText,
  Image as ImageIcon,
  Library,
  Loader2,
  Send,
  ShieldCheck,
  Sparkles,
  UserRound,
} from 'lucide-react'

const FALLBACK_PLATFORMS = ['BlueSky', 'LinkedIn', 'Facebook', 'Instagram', 'X', 'TikTok'].map(id => ({ id, label: id }))

const surface = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 8,
}

const inputStyle = {
  width: '100%',
  minHeight: 48,
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: 'var(--surface2)',
  color: 'var(--text)',
  padding: '10px 12px',
  fontSize: 16,
}

const labelStyle = {
  display: 'grid',
  gap: 6,
  color: 'var(--text)',
  fontSize: 16,
  fontWeight: 800,
}

function readError(response, body, fallback) {
  return body?.error || body?.detail || `${fallback} (${response.status})`
}

function sourceTitle(item, fallback) {
  return item?.title || item?.name || item?.topic || item?.prompt || fallback
}

function sourceBody(item) {
  return [
    item?.content,
    item?.body,
    item?.summary,
    item?.output?.content,
    item?.output?.text,
    item?.result?.content,
    item?.prompt,
  ].find(value => typeof value === 'string' && value.trim()) || ''
}

function mediaUrl(item) {
  if (item?.url) return item.url
  if (item?.file) return `/api/media/file/${encodeURIComponent(item.file)}`
  return ''
}

function platformKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

const PLATFORM_ALIASES = {
  bluesky: ['bluesky', 'bsky'],
  linkedin: ['linkedin'],
  facebook: ['facebook'],
  instagram: ['instagram'],
  x: ['x', 'twitter'],
  tiktok: ['tiktok'],
}

function recognizedPlatform(value) {
  const key = platformKey(value)
  if (!key) return ''
  for (const [platform, aliases] of Object.entries(PLATFORM_ALIASES)) {
    if (aliases.some(alias => key === alias || (alias.length > 2 && key.includes(alias)))) return platform
  }
  return ''
}

function channelPlatform(channel) {
  const explicit = [channel?.identifier, channel?.platform, channel?.provider, channel?.type]
  for (const value of explicit) {
    const platform = recognizedPlatform(value)
    if (platform) return platform
  }
  return recognizedPlatform(`${channel?.name || ''} ${channel?.profile || ''}`)
}

function matchesPlatform(channel, platform) {
  const detected = channelPlatform(channel)
  return !!detected && detected === recognizedPlatform(platform)
}

function supportsPlatform(channel, platform) {
  const detected = channelPlatform(channel)
  return !detected || detected === recognizedPlatform(platform)
}

function localDateTime(minutes = 30) {
  const date = new Date(Date.now() + minutes * 60 * 1000)
  const pad = value => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function Pill({ children, tone = 'neutral' }) {
  const tones = {
    neutral: { background: 'var(--surface2)', color: 'var(--text-muted)', border: 'var(--border)' },
    active: { background: 'var(--accent-soft)', color: 'var(--accent)', border: 'var(--accent)' },
    good: { background: 'rgba(22,163,74,0.1)', color: '#22c55e', border: 'rgba(34,197,94,0.35)' },
    warn: { background: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: 'rgba(245,158,11,0.35)' },
  }
  const selected = tones[tone] || tones.neutral
  return <span style={{ display: 'inline-flex', alignItems: 'center', minHeight: 28, padding: '3px 8px', borderRadius: 999, border: `1px solid ${selected.border}`, background: selected.background, color: selected.color, fontSize: 12, fontWeight: 800 }}>{children}</span>
}

function Metric({ label, value, note }) {
  return (
    <div style={{ ...surface, background: 'var(--surface2)', padding: 10, minWidth: 0 }}>
      <div style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</div>
      <div style={{ color: 'var(--text)', fontSize: 17, fontWeight: 900, marginTop: 3, overflowWrap: 'anywhere' }}>{value}</div>
      {note ? <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 3 }}>{note}</div> : null}
    </div>
  )
}

function Notice({ children, tone = 'warn' }) {
  const good = tone === 'good'
  return (
    <div role="status" style={{ display: 'flex', alignItems: 'flex-start', gap: 8, borderRadius: 8, padding: 10, border: `1px solid ${good ? 'rgba(34,197,94,.35)' : 'rgba(245,158,11,.35)'}`, background: good ? 'rgba(22,163,74,.08)' : 'rgba(245,158,11,.08)', color: good ? '#22c55e' : '#f59e0b', fontSize: 13, fontWeight: 700 }}>
      {good ? <CheckCircle2 size={16} style={{ flex: '0 0 auto', marginTop: 1 }} /> : <AlertTriangle size={16} style={{ flex: '0 0 auto', marginTop: 1 }} />}
      <span>{children}</span>
    </div>
  )
}

export default function SocialOperatorPanel({ campaigns = [], config = {}, onCampaignSaved, onOpenCampaign }) {
  const [clients, setClients] = useState([])
  const [agents, setAgents] = useState([])
  const [channels, setChannels] = useState([])
  const [contentJobs, setContentJobs] = useState([])
  const [mediaItems, setMediaItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [channelWarning, setChannelWarning] = useState('')
  const [activeJobId, setActiveJobId] = useState('')
  const [budgets, setBudgets] = useState(config.budgets || {})
  const [delivery, setDelivery] = useState({})
  const [formStateReady, setFormStateReady] = useState(false)
  const [form, setForm] = useState({
    clientId: '',
    agentId: '',
    sourceType: 'topic',
    sourceId: '',
    topic: '',
    sourceText: '',
    platforms: ['BlueSky', 'LinkedIn'],
    approvalRule: 'approval_required',
    researchMode: 'client_context',
    mediaMode: 'text_only',
    limitBehavior: 'block',
    budgetLimit: 10,
    channelIds: [],
  })

  useEffect(() => { setBudgets(config.budgets || {}) }, [config.budgets])

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem('fcc:social-operator-draft') || '{}')
      if (saved.form && typeof saved.form === 'object') setForm(current => ({ ...current, ...saved.form }))
      if (typeof saved.activeJobId === 'string') setActiveJobId(saved.activeJobId)
    } catch {}
    setFormStateReady(true)
  }, [])

  useEffect(() => {
    if (!formStateReady) return
    window.localStorage.setItem('fcc:social-operator-draft', JSON.stringify({ form, activeJobId }))
  }, [activeJobId, form, formStateReady])

  useEffect(() => {
    let alive = true
    setLoading(true)
    Promise.all([
      fetch('/api/clients', { cache: 'no-store' }).then(response => response.json().then(body => ({ response, body }))),
      fetch('/api/openclaw/agents', { cache: 'no-store' }).then(response => response.json().then(body => ({ response, body }))),
      fetch('/api/postiz/channels', { cache: 'no-store' }).then(response => response.json().catch(() => ({})).then(body => ({ response, body }))),
      fetch('/api/content-lab?limit=25', { cache: 'no-store' }).then(response => response.json().catch(() => ({})).then(body => ({ response, body }))),
      fetch('/api/media', { cache: 'no-store' }).then(response => response.json().catch(() => ({})).then(body => ({ response, body }))),
    ]).then(([clientResult, agentResult, channelResult, contentResult, mediaResult]) => {
      if (!alive) return
      if (!clientResult.response.ok) throw new Error(readError(clientResult.response, clientResult.body, 'Could not load clients'))
      if (!agentResult.response.ok) throw new Error(readError(agentResult.response, agentResult.body, 'Could not load agents'))
      setClients(clientResult.body.clients || [])
      setAgents((agentResult.body.agents || []).filter(agent => agent.enabled !== false && agent.draft !== true))
      setChannels((channelResult.body.channels || []).filter(channel => !channel.disabled))
      setChannelWarning(channelResult.body.warning || '')
      setContentJobs(contentResult.body.jobs || [])
      setMediaItems(mediaResult.body.items || [])
    }).catch(nextError => {
      if (alive) setError(String(nextError?.message || nextError))
    }).finally(() => {
      if (alive) setLoading(false)
    })
    return () => { alive = false }
  }, [])

  const platforms = config.platforms?.length ? config.platforms : FALLBACK_PLATFORMS
  const approvalRules = config.approvalRules?.length ? config.approvalRules : [
    { id: 'approval_required', label: 'Approval required' },
    { id: 'guarded_auto', label: 'Guarded automatic' },
  ]
  const operatorJobs = useMemo(() => campaigns.filter(campaign => campaign.kind === 'social_operator'), [campaigns])
  const activeJob = useMemo(() => operatorJobs.find(campaign => campaign.id === activeJobId) || operatorJobs[0] || null, [operatorJobs, activeJobId])
  const selectedClient = clients.find(client => client.id === form.clientId)
  const selectedAgent = agents.find(agent => agent.id === form.agentId)
  const selectedChannels = channels.filter(channel => form.channelIds.includes(channel.id))
  const selectedBudget = budgets[form.clientId]
  const availableCredits = selectedBudget
    ? Math.max(0, Number(form.budgetLimit || 0) - Number(selectedBudget.used || 0) - Number(selectedBudget.reserved || 0))
    : Number(form.budgetLimit || 0)
  const estimatedCredits = form.platforms.length
    + (form.researchMode === 'trend_research' ? 10 : 0)
    + (form.mediaMode === 'generate_one' ? 25 : 0)

  const setField = (key, value) => setForm(current => ({ ...current, [key]: value }))

  const chooseClient = value => {
    const budget = budgets[value]
    setForm(current => ({
      ...current,
      clientId: value,
      budgetLimit: budget?.limit || current.budgetLimit || 10,
      channelIds: current.clientId === value ? current.channelIds : [],
    }))
    setStatus('')
  }

  const chooseSource = value => {
    if (!value) return setField('sourceId', '')
    if (form.sourceType === 'content') {
      const item = contentJobs.find(job => job.id === value)
      setForm(current => ({ ...current, sourceId: value, topic: sourceTitle(item, 'Content Lab source'), sourceText: sourceBody(item) }))
      return
    }
    const item = mediaItems.find(media => media.id === value)
    setForm(current => ({ ...current, sourceId: value, topic: sourceTitle(item, 'Media Library asset'), sourceText: item?.prompt || item?.description || '' }))
  }

  const togglePlatform = platform => {
    setForm(current => ({
      ...current,
      platforms: current.platforms.includes(platform)
        ? current.platforms.filter(item => item !== platform)
        : [...current.platforms, platform],
    }))
  }

  const toggleChannel = channel => {
    setForm(current => {
      const selected = current.channelIds.includes(channel.id)
      if (selected) return { ...current, channelIds: current.channelIds.filter(id => id !== channel.id) }
      const existing = channels.filter(item => current.channelIds.includes(item.id))
      const crossTenant = existing.some(item => item.tenantId !== channel.tenantId)
      if (crossTenant) {
        setStatus('Postiz accounts from different tenants cannot share one job. The new tenant selection replaced the previous accounts.')
        return { ...current, channelIds: [channel.id] }
      }
      return { ...current, channelIds: [...current.channelIds, channel.id] }
    })
  }

  const createJob = async event => {
    event.preventDefault()
    setError('')
    setStatus('')
    if (!selectedClient || !selectedAgent || !form.topic.trim() || !form.platforms.length) {
      setError('Select a client and agent, add a topic, and choose at least one platform.')
      return
    }
    setBusy('create')
    try {
      const selectedMedia = form.sourceType === 'media' ? mediaItems.find(item => item.id === form.sourceId) : null
      const response = await fetch('/api/campaign-studio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_social_operator_job',
          job: {
            clientId: selectedClient.id,
            agentId: selectedAgent.id,
            sourceType: form.sourceType,
            topic: form.topic,
            sourceText: form.sourceText,
            platforms: form.platforms,
            approvalRule: form.approvalRule,
            researchMode: form.researchMode,
            mediaMode: form.mediaMode,
            limitBehavior: form.limitBehavior,
            budgetLimit: Number(form.budgetLimit),
            operationId: globalThis.crypto?.randomUUID?.() || `social-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            tenantId: selectedChannels[0]?.tenantId || 'farrington-development',
            channels: selectedChannels,
            media: selectedMedia ? {
              id: selectedMedia.id,
              name: sourceTitle(selectedMedia, 'Media Library asset'),
              url: mediaUrl(selectedMedia),
              type: selectedMedia.mediaType || selectedMedia.mimeType || '',
            } : null,
          },
        }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok || !body.ok) throw new Error(readError(response, body, 'Could not create Social Operator job'))
      setActiveJobId(body.campaign.id)
      setBudgets(current => ({ ...current, [selectedClient.id]: body.budget }))
      onCampaignSaved?.(body.campaign)
      const model = body.campaign.socialOperator?.generation?.model
      const media = body.campaign.socialOperator?.mediaMode === 'generate_one' ? ' A campaign image was created and attached.' : ''
      setStatus(body.campaign.socialOperator?.jobStatus === 'approved'
        ? `Variants generated${model ? ` with ${model}` : ''} and cleared by the guarded credit limit.${media} Nothing has been published yet.`
        : `Variants generated${model ? ` with ${model}` : ''} and saved.${media} Approval is required before Postiz handoff.`)
    } catch (nextError) {
      setError(String(nextError?.message || nextError))
    } finally {
      setBusy('')
    }
  }

  const approveJob = async () => {
    if (!activeJob) return
    setBusy('approve')
    setError('')
    try {
      const response = await fetch('/api/campaign-studio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve_social_operator_job', id: activeJob.id }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok || !body.ok) throw new Error(readError(response, body, 'Could not approve job'))
      setBudgets(current => ({ ...current, [body.campaign.socialOperator.client.id]: body.budget }))
      onCampaignSaved?.(body.campaign)
      setStatus('Latest copy and media approved. Generation usage was already recorded; nothing has been published yet.')
    } catch (nextError) {
      setError(String(nextError?.message || nextError))
    } finally {
      setBusy('')
    }
  }

  const deliveryState = post => {
    const jobChannels = activeJob?.socialOperator?.channels || []
    const matching = jobChannels.find(channel => matchesPlatform(channel, post.platform))
    return delivery[post.id] || { channelId: matching?.id || '', publishAt: localDateTime(30), status: '' }
  }

  const updateDelivery = (postId, patch) => setDelivery(current => ({
    ...current,
    [postId]: { ...deliveryState({ id: postId }), ...(current[postId] || {}), ...patch },
  }))

  const refreshJob = async id => {
    const response = await fetch('/api/campaign-studio', { cache: 'no-store' })
    const body = await response.json().catch(() => ({}))
    const updated = (body.campaigns || []).find(campaign => campaign.id === id)
    if (updated) onCampaignSaved?.(updated)
    return updated
  }

  const scheduleVariant = async post => {
    if (post.status === 'scheduled' || post.postiz?.postId || post.postiz?.recordedAt) {
      updateDelivery(post.id, { status: 'Already scheduled through Postiz. Duplicate handoff was blocked.' })
      return
    }
    const selected = deliveryState(post)
    if (!selected.channelId) {
      updateDelivery(post.id, { status: 'Choose one connected account for this platform variant.' })
      return
    }
    const selectedChannel = (activeJob?.socialOperator?.channels || []).find(channel => channel.id === selected.channelId)
    if (!selectedChannel || !supportsPlatform(selectedChannel, post.platform)) {
      updateDelivery(post.id, { status: `Choose a ${post.platform} account for this variant.` })
      return
    }
    setBusy(`publish:${post.id}`)
    setError('')
    try {
      const response = await fetch('/api/postiz/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignId: activeJob.id,
          postId: post.id,
          channels: [selected.channelId],
          publishAt: new Date(selected.publishAt).toISOString(),
        }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok || !body.ok) throw new Error(readError(response, body, 'Postiz handoff failed'))
      updateDelivery(post.id, { status: `Scheduled for ${new Date(body.scheduledFor).toLocaleString()}.` })
      await refreshJob(activeJob.id)
    } catch (nextError) {
      const message = String(nextError?.message || nextError)
      updateDelivery(post.id, { status: message })
      setError(message)
    } finally {
      setBusy('')
    }
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <section style={{ ...surface, padding: 14, display: 'flex', gap: 12, justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 0 }}>
          <div style={{ width: 42, height: 42, borderRadius: 8, background: 'var(--accent-soft)', color: 'var(--accent)', display: 'grid', placeItems: 'center', flex: '0 0 auto' }}><Bot size={21} /></div>
          <div>
            <h2 style={{ color: 'var(--text)', fontSize: 18, fontWeight: 900 }}>Social Operator</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 2 }}>Assign a Wizard, ground it in the client business, create platform-specific copy and media, guard credits, approve, then hand delivery to Postiz.</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Pill tone="active"><ShieldCheck size={13} style={{ marginRight: 5 }} /> Command Center controlled</Pill>
          <Pill>{operatorJobs.length} saved jobs</Pill>
        </div>
      </section>

      {config.pricing?.plans?.length ? (
        <section style={{ ...surface, padding: 14, display: 'grid', gap: 10 }}>
          <div>
            <div style={{ color: 'var(--accent)', fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.08em' }}>Internal managed-service proposal</div>
            <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 3 }}>Not customer-facing or connected to Stripe yet. Credits are reusable variable-cost fuel; campaign and variant allowances are plan quantities.</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
            {config.pricing.plans.map(plan => (
              <div key={plan.id} style={{ border: '1px solid var(--border)', background: 'var(--surface2)', borderRadius: 8, padding: 10 }}>
                <div style={{ color: 'var(--text)', fontWeight: 900 }}>{plan.name} · ${plan.monthlyPriceUsd}/mo</div>
                <div style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 4 }}>{plan.sourceCampaigns} campaigns · {plan.platformVariants} variants · {plan.includedCredits.toLocaleString()} credits</div>
              </div>
            ))}
          </div>
          <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Proposed top-up: ${config.pricing.topUp?.priceUsd || 10} for {(config.pricing.topUp?.credits || 1000).toLocaleString()} credits.</div>
        </section>
      ) : null}

      {error ? <Notice>{error}</Notice> : null}
      {status ? <Notice tone="good">{status}</Notice> : null}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 440px), 1fr))', gap: 16, alignItems: 'start' }}>
        <form onSubmit={createJob} style={{ ...surface, padding: 14, display: 'grid', gap: 14 }}>
          <div>
            <div style={{ color: 'var(--accent)', fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.08em' }}>New operator job</div>
            <h3 style={{ color: 'var(--text)', fontSize: 16, fontWeight: 900, marginTop: 3 }}>Assignment and source</h3>
          </div>

          {loading ? <div role="status" style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 8 }}><Loader2 size={16} className="spin" /> Loading clients, agents, content, media, and accounts...</div> : null}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
            <label style={labelStyle} htmlFor="social-operator-client"><span><UserRound size={13} style={{ marginRight: 5, verticalAlign: -2 }} />Client</span>
              <select id="social-operator-client" value={form.clientId} onChange={event => chooseClient(event.target.value)} style={inputStyle}>
                <option value="">Select client</option>
                {clients.map(client => <option key={client.id} value={client.id}>{client.name}</option>)}
              </select>
            </label>
            <label style={labelStyle} htmlFor="social-operator-agent"><span><Bot size={13} style={{ marginRight: 5, verticalAlign: -2 }} />Assigned Wizard</span>
              <select id="social-operator-agent" aria-label="Assigned agent" value={form.agentId} onChange={event => setField('agentId', event.target.value)} style={inputStyle}>
                <option value="">Select enabled agent</option>
                {agents.map(agent => <option key={agent.id} value={agent.id}>{agent.name}{agent.title ? ` — ${agent.title}` : ''}{agent.brain?.modelId ? ` · ${agent.brain.modelId}` : ''}</option>)}
              </select>
            </label>
          </div>

          {selectedAgent ? <Notice tone="good">{selectedAgent.name} will use {selectedAgent.brain?.modelId || 'the agent’s configured model'} plus saved client notes, industry, website, tags, and projects. Configured model fallbacks are tried automatically.</Notice> : null}

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(150px, .45fr) minmax(220px, 1fr)', gap: 10 }}>
            <label style={labelStyle} htmlFor="social-operator-source-type"><span><Library size={13} style={{ marginRight: 5, verticalAlign: -2 }} />Source</span>
              <select id="social-operator-source-type" value={form.sourceType} onChange={event => setForm(current => ({ ...current, sourceType: event.target.value, sourceId: '', topic: '', sourceText: '' }))} style={inputStyle}>
                <option value="topic">Topic / brief</option>
                <option value="content">Content Lab item</option>
                <option value="media">Media Library asset</option>
              </select>
            </label>
            {form.sourceType !== 'topic' ? (
              <label style={labelStyle} htmlFor="social-operator-source-item"><span>{form.sourceType === 'content' ? <FileText size={13} style={{ marginRight: 5, verticalAlign: -2 }} /> : <ImageIcon size={13} style={{ marginRight: 5, verticalAlign: -2 }} />}Existing item</span>
                <select id="social-operator-source-item" value={form.sourceId} onChange={event => chooseSource(event.target.value)} style={inputStyle}>
                  <option value="">Select existing {form.sourceType === 'content' ? 'content' : 'media'}</option>
                  {(form.sourceType === 'content' ? contentJobs : mediaItems).map((item, index) => <option key={item.id || index} value={item.id}>{sourceTitle(item, `Item ${index + 1}`)}</option>)}
                </select>
              </label>
            ) : <div />}
          </div>

          <label style={labelStyle} htmlFor="social-operator-topic">Topic or working headline
            <input id="social-operator-topic" value={form.topic} onChange={event => setField('topic', event.target.value)} placeholder="Example: Announce the Saturday trail clinic" style={inputStyle} />
          </label>
          <label style={labelStyle} htmlFor="social-operator-brief">Source details <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Optional extra context; the selected client record is added automatically.</span>
            <textarea id="social-operator-brief" value={form.sourceText} onChange={event => setField('sourceText', event.target.value)} rows={4} placeholder="Key facts, offer details, content excerpt, or instructions for the assigned agent" style={{ ...inputStyle, minHeight: 108, resize: 'vertical' }} />
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
            <label style={labelStyle} htmlFor="social-operator-research"><span><Library size={13} style={{ marginRight: 5, verticalAlign: -2 }} />Wizard research</span>
              <select id="social-operator-research" value={form.researchMode} onChange={event => setField('researchMode', event.target.value)} style={inputStyle}>
                <option value="client_context">Saved client context only</option>
                <option value="trend_research">Current niche and trend research (+10 credits)</option>
              </select>
            </label>
            <label style={labelStyle} htmlFor="social-operator-media"><span><ImageIcon size={13} style={{ marginRight: 5, verticalAlign: -2 }} />Media plan</span>
              <select id="social-operator-media" value={form.mediaMode} onChange={event => setField('mediaMode', event.target.value)} style={inputStyle}>
                <option value="text_only">Text only</option>
                <option value="generate_one">Generate one shared campaign image (+25 credits)</option>
              </select>
            </label>
          </div>

          <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 8 }}>
            <legend style={{ ...labelStyle, display: 'block', marginBottom: 8 }}>Platform variants</legend>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {platforms.map(platform => {
                const selected = form.platforms.includes(platform.id)
                    return <button key={platform.id} type="button" aria-pressed={selected} onClick={() => togglePlatform(platform.id)} style={{ minHeight: 48, padding: '8px 14px', borderRadius: 8, border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`, background: selected ? 'var(--accent-soft)' : 'var(--surface2)', color: selected ? 'var(--accent)' : 'var(--text-muted)', fontSize: 16, fontWeight: 800, cursor: 'pointer' }}>{platform.label || platform.id}</button>
              })}
            </div>
          </fieldset>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
            <label style={labelStyle} htmlFor="social-operator-approval"><span><ShieldCheck size={13} style={{ marginRight: 5, verticalAlign: -2 }} />Approval rule</span>
              <select id="social-operator-approval" value={form.approvalRule} onChange={event => setField('approvalRule', event.target.value)} style={inputStyle}>
                {approvalRules.map(rule => <option key={rule.id} value={rule.id}>{rule.label}</option>)}
              </select>
            </label>
            <label style={labelStyle} htmlFor="social-operator-budget"><span><CircleDollarSign size={13} style={{ marginRight: 5, verticalAlign: -2 }} />Client credit limit</span>
              <input id="social-operator-budget" type="number" min="1" step="1" value={form.budgetLimit} onChange={event => setField('budgetLimit', event.target.value)} style={inputStyle} />
            </label>
            <label style={labelStyle} htmlFor="social-operator-limit-behavior"><span><ShieldCheck size={13} style={{ marginRight: 5, verticalAlign: -2 }} />At the limit</span>
              <select id="social-operator-limit-behavior" value={form.limitBehavior} onChange={event => setField('limitBehavior', event.target.value)} style={inputStyle}>
                <option value="block">Stop work</option>
                <option value="request_approval">Request approval / top-up</option>
              </select>
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
            <Metric label="Estimated" value={`${estimatedCredits} credits`} note={`${form.platforms.length} variants${form.researchMode === 'trend_research' ? ' + research' : ''}${form.mediaMode === 'generate_one' ? ' + image' : ''}`} />
            <Metric label="Available" value={`${availableCredits} credits`} note="after used and reserved" />
            <Metric label="Actual used" value={`${selectedBudget?.used || 0} credits`} note="for this client" />
          </div>

          <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'grid', gap: 8 }}>
            <legend style={{ ...labelStyle, display: 'block', marginBottom: 8 }}>Connected Postiz accounts <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Optional during creation</span></legend>
            {channelWarning ? <Notice>{channelWarning}</Notice> : null}
            {!channels.length && !channelWarning ? <Notice>No connected accounts are available. Additional platform OAuth must be completed in Postiz; code alone cannot authorize an account.</Notice> : null}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {channels.map(channel => {
                const selected = form.channelIds.includes(channel.id)
                    return <button key={channel.id} type="button" aria-pressed={selected} onClick={() => toggleChannel(channel)} style={{ minHeight: 48, padding: '8px 14px', textAlign: 'left', borderRadius: 8, border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`, background: selected ? 'var(--accent-soft)' : 'var(--surface2)', color: selected ? 'var(--accent)' : 'var(--text)', fontSize: 16, cursor: 'pointer' }}><strong style={{ display: 'block', fontSize: 16 }}>{channel.name || channel.identifier || 'Connected account'}</strong><span style={{ display: 'block', fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>{channel.identifier || 'Postiz'} · {channel.tenantId}</span></button>
              })}
            </div>
          </fieldset>

              <button type="submit" disabled={busy === 'create' || loading} style={{ minHeight: 48, border: 0, borderRadius: 8, background: 'var(--accent)', color: 'var(--accent-text)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 16, fontWeight: 900, cursor: busy || loading ? 'not-allowed' : 'pointer', opacity: busy || loading ? .65 : 1 }}>
            {busy === 'create' ? <Loader2 size={17} className="spin" /> : <Sparkles size={17} />}
            {busy === 'create' ? 'Generating variants...' : 'Generate and save variants'}
          </button>
        </form>

        <section style={{ display: 'grid', gap: 12, alignContent: 'start' }}>
          <div style={{ ...surface, padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <div>
                <div style={{ color: 'var(--accent)', fontSize: 11, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '.08em' }}>Saved operator jobs</div>
                <h3 style={{ color: 'var(--text)', fontSize: 16, fontWeight: 900, marginTop: 3 }}>{activeJob?.name || 'No Social Operator job yet'}</h3>
              </div>
              {operatorJobs.length ? (
                <select aria-label="Saved Social Operator job" value={activeJob?.id || ''} onChange={event => setActiveJobId(event.target.value)} style={{ ...inputStyle, width: 'min(260px, 100%)' }}>
                  {operatorJobs.map(job => <option key={job.id} value={job.id}>{job.name}</option>)}
                </select>
              ) : null}
            </div>
          </div>

          {!activeJob ? (
            <div style={{ ...surface, padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
              <Bot size={32} style={{ color: 'var(--accent)', marginBottom: 8 }} />
              <div style={{ color: 'var(--text)', fontWeight: 900 }}>Create the first operator job</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>The job and its variants will be saved in the existing Campaign Studio queue.</div>
            </div>
          ) : (
            <>
              <div style={{ ...surface, padding: 14, display: 'grid', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <Pill tone="active">{activeJob.socialOperator?.client?.name}</Pill>
                    <Pill>{activeJob.socialOperator?.agent?.name}</Pill>
                    {activeJob.socialOperator?.generation?.model ? <Pill>{activeJob.socialOperator.generation.provider} / {activeJob.socialOperator.generation.model}</Pill> : null}
                    {activeJob.socialOperator?.researchMode === 'trend_research' ? <Pill>Current research</Pill> : null}
                    {activeJob.socialOperator?.mediaMode === 'generate_one' ? <Pill>Image generated</Pill> : null}
                    <Pill tone={activeJob.socialOperator?.jobStatus === 'approved' ? 'good' : 'warn'}>{activeJob.socialOperator?.jobStatus === 'approved' ? 'Approved' : 'Approval required'}</Pill>
                  </div>
                  <button type="button" onClick={() => onOpenCampaign?.(activeJob.id)} style={{ minHeight: 48, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', padding: '7px 14px', fontSize: 16, fontWeight: 800, cursor: 'pointer' }}>Open in Campaigns</button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
                  <Metric label="Estimated" value={`${activeJob.socialOperator?.budget?.estimated || 0} credits`} />
                  <Metric label="Actual" value={`${activeJob.socialOperator?.budget?.actual || 0} credits`} />
                  <Metric label="Remaining" value={`${activeJob.socialOperator?.usage?.balance ? activeJob.socialOperator.usage.balance.availableMilliCredits / 1000 : activeJob.socialOperator?.budget?.remaining || 0} credits`} />
                </div>
                {activeJob.socialOperator?.generation ? (
                  <div style={{ border: '1px solid var(--border)', background: 'var(--surface2)', borderRadius: 8, padding: 10, color: 'var(--text-muted)', fontSize: 12, lineHeight: 1.5 }}>
                    <strong style={{ color: 'var(--text)' }}>Wizard provenance:</strong> {activeJob.socialOperator.generation.provider || 'provider'} / {activeJob.socialOperator.generation.model || 'model'}
                    {activeJob.socialOperator.generation.usage?.total_tokens ? ` · ${Number(activeJob.socialOperator.generation.usage.total_tokens).toLocaleString()} tokens` : ''}
                    {Number(activeJob.socialOperator.generation.totalEstimatedUsd) > 0 ? ` · $${Number(activeJob.socialOperator.generation.totalEstimatedUsd).toFixed(4)} internal model cost` : ''}
                    {activeJob.socialOperator?.creditBreakdown ? ` · credits: ${activeJob.socialOperator.creditBreakdown.textVariants} text + ${activeJob.socialOperator.creditBreakdown.research} research + ${activeJob.socialOperator.creditBreakdown.media} media` : ''}
                  </div>
                ) : null}
                {activeJob.socialOperator?.research?.citations?.length ? (
                  <div style={{ border: '1px solid var(--border)', background: 'var(--surface2)', borderRadius: 8, padding: 10, color: 'var(--text-muted)', fontSize: 12 }}>
                    <strong style={{ color: 'var(--text)' }}>Current research sources:</strong>{' '}
                    {activeJob.socialOperator.research.citations.slice(0, 4).map((url, index) => <span key={url}>{index ? ' · ' : ''}<a href={url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)' }}>Source {index + 1}</a></span>)}
                  </div>
                ) : null}
                {activeJob.socialOperator?.jobStatus !== 'approved' ? (
                <button type="button" onClick={approveJob} disabled={busy === 'approve'} style={{ minHeight: 48, borderRadius: 8, border: 0, background: 'var(--accent)', color: 'var(--accent-text)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 16, fontWeight: 900, cursor: busy === 'approve' ? 'not-allowed' : 'pointer', opacity: busy === 'approve' ? .65 : 1 }}>
                    {busy === 'approve' ? <Loader2 size={17} className="spin" /> : <ShieldCheck size={17} />} Approve latest copy and media
                  </button>
                ) : <Notice tone="good">Approved variants can be scheduled individually. Guarded automatic means the job cleared its limit; it does not publish without a configured runner.</Notice>}
              </div>

              {(activeJob.posts || []).map(post => {
                const currentDelivery = deliveryState(post)
                const jobChannels = activeJob.socialOperator?.channels || []
                const compatibleChannels = jobChannels.filter(channel => supportsPlatform(channel, post.platform))
                const selectedChannel = compatibleChannels.find(channel => channel.id === currentDelivery.channelId)
                const publishing = busy === `publish:${post.id}`
                const delivered = post.status === 'scheduled' || !!post.postiz?.postId || !!post.postiz?.recordedAt
                const canSchedule = activeJob.socialOperator?.jobStatus === 'approved' && !delivered && !!selectedChannel
                return (
                  <article key={post.id} style={{ ...surface, padding: 14, display: 'grid', gap: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}><Pill tone="active">#{post.sequence} {post.platform}</Pill><Pill>{post.format}</Pill><Pill tone={post.status === 'scheduled' ? 'good' : post.status === 'approved' ? 'active' : 'warn'}>{post.status}</Pill></div>
                      <Pill><Clock3 size={12} style={{ marginRight: 4 }} /> {new Date(post.scheduledFor).toLocaleString()}</Pill>
                    </div>
                    <div style={{ color: 'var(--text)', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 14, lineHeight: 1.55 }}>
                      {post.hook ? <strong style={{ display: 'block', marginBottom: 6 }}>{post.hook}</strong> : null}
                      <div>{post.body}</div>
                      {post.cta ? <div style={{ color: 'var(--accent)', fontWeight: 800, marginTop: 8 }}>{post.cta}</div> : null}
                    </div>
                    {post.assetUrl ? <img src={post.assetUrl} alt={post.assetAltText || 'Selected campaign asset'} style={{ width: '100%', maxHeight: 220, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} /> : <div style={{ border: '1px dashed var(--border)', borderRadius: 8, padding: 10, color: 'var(--text-muted)', fontSize: 12 }}><ImageIcon size={14} style={{ marginRight: 5, verticalAlign: -2 }} />{activeJob.socialOperator?.mediaMode === 'text_only' ? 'Text-only was selected for this job.' : 'No asset attached. Open this job in Campaign Studio to use existing image/video providers or Media Library tools.'}</div>}
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, display: 'grid', gap: 8 }}>
                      <div style={{ color: 'var(--text)', fontSize: 13, fontWeight: 900 }}><Send size={13} style={{ marginRight: 5, verticalAlign: -2 }} />Postiz handoff</div>
                      {!jobChannels.length ? <Notice>No account was saved with this job. Create a new job with a connected Postiz account. Additional account OAuth must be completed in Postiz.</Notice> : !compatibleChannels.length ? <Notice>No saved account matches {post.platform}. Connect or select a {post.platform} account in Postiz before handoff.</Notice> : (
                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) minmax(190px, .8fr) auto', gap: 8, alignItems: 'end' }}>
                          <label style={labelStyle} htmlFor={`delivery-channel-${post.id}`}>Connected account
                            <select id={`delivery-channel-${post.id}`} value={selectedChannel?.id || ''} disabled={delivered} onChange={event => updateDelivery(post.id, { channelId: event.target.value, publishAt: currentDelivery.publishAt, status: '' })} style={inputStyle}>
                              <option value="">Select account</option>
                              {compatibleChannels.map(channel => <option key={channel.id} value={channel.id}>{channel.name || channel.identifier} · {channel.tenantId}</option>)}
                            </select>
                          </label>
                          <label style={labelStyle} htmlFor={`delivery-time-${post.id}`}>Schedule time
                            <input id={`delivery-time-${post.id}`} type="datetime-local" value={currentDelivery.publishAt} disabled={delivered} onChange={event => updateDelivery(post.id, { channelId: currentDelivery.channelId, publishAt: event.target.value, status: '' })} style={inputStyle} />
                          </label>
                          <button type="button" onClick={() => scheduleVariant(post)} disabled={publishing || !canSchedule} aria-label={`Schedule ${post.platform} variant`} title={delivered ? 'Already scheduled through Postiz' : activeJob.socialOperator?.jobStatus !== 'approved' ? 'Approve the job first' : !selectedChannel ? `Choose a ${post.platform} account` : 'Schedule through Postiz'} style={{ minWidth: 48, minHeight: 48, borderRadius: 8, border: '1px solid var(--border)', background: canSchedule ? 'var(--accent)' : 'var(--surface2)', color: canSchedule ? 'var(--accent-text)' : 'var(--text-muted)', display: 'grid', placeItems: 'center', cursor: publishing || !canSchedule ? 'not-allowed' : 'pointer', opacity: publishing ? .65 : 1 }}>{publishing ? <Loader2 size={18} className="spin" /> : delivered ? <CheckCircle2 size={18} /> : <Send size={18} />}</button>
                        </div>
                      )}
                      {currentDelivery.status || delivered ? <div role="status" style={{ color: delivered ? '#22c55e' : 'var(--text-muted)', fontSize: 12, fontWeight: 800 }}>{currentDelivery.status || 'Scheduled through Postiz. Duplicate handoff is disabled.'}</div> : null}
                    </div>
                  </article>
                )
              })}
            </>
          )}
        </section>
      </div>
    </div>
  )
}
