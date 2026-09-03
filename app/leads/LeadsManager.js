'use client'
import ThemedSelect from '../components/ThemedSelect'
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import PageHeader, { LabHeaderButton } from '../components/PageHeader'
import QualifyWizard from './QualifyWizard'
import { Paginator, usePagination } from '../components/Paginator'
import ViewModeToggle from '../components/ViewModeToggle'
import ComponentSettings, { useComponentSettings } from '../components/ComponentSettings'
import CallButton from '../components/CallButton'
import { useCachedData } from '@/lib/useCachedData'
import VideoMeetButton from '../components/VideoMeetButton'
import LeadCallScripts from '../components/LeadCallScripts'
import EmailTemplateEditor from '../components/EmailTemplateEditor'
import ItemActionsMenu from '../components/ItemActionsMenu'
import { BookOpen, CheckCircle2, ExternalLink, Globe, Mail, Phone, Plus, Sprout, Trash2, Video, XCircle } from 'lucide-react'

const STATUS = [
  { id: 'new',          label: 'New',          color: 'var(--accent)',     bg: 'var(--accent-soft)' },
  { id: 'contacted',    label: 'Contacted',    color: 'var(--teal)',       bg: 'var(--teal-soft)' },
  { id: 'qualified',    label: 'Qualified',    color: 'var(--green)',      bg: 'var(--green-soft)' },
  { id: 'unqualified',  label: 'Unqualified',  color: 'var(--text-muted)', bg: 'var(--surface2)' },
  { id: 'converted',    label: 'Converted',    color: 'var(--purple)',     bg: 'var(--purple-soft)' },
]
const SOURCES = [
  { id: 'cold_call',    label: 'Cold Call' },
  { id: 'cold_list',    label: 'Cold List' },
  { id: 'demo_request', label: 'Demo Request' },
  { id: 'referral',     label: 'Referral' },
  { id: 'inbound',      label: 'Inbound' },
  { id: 'fd-website',   label: 'Website Intake' },
  { id: 'command-center-consult', label: 'Command Center Consult' },
  { id: 'product-inquiry', label: 'Product Inquiry' },
  { id: 'other',        label: 'Other' },
]

const BRAND_CONTEXTS = [
  { id: 'farrington_dev', label: 'Farrington Development', from: 'Farrington Development', campaignType: 'farrington_dev' },
  { id: 'VideoHub', label: 'VideoHub', from: 'VideoHub', campaignType: 'VideoHub' },
  { id: 'ContentHub', label: 'ContentHub', from: 'ContentHub', campaignType: 'ContentHub_demo' },
  { id: 'wnc_times', label: 'WNC Times', from: 'WNC Times', campaignType: 'wnc_times' },
]

const LEAD_CATEGORY_GROUPS = {
  farrington_dev: [
    { id: 'web-development', label: 'Web development' },
    { id: 'ai-automation', label: 'AI automation' },
    { id: 'crm-command-center', label: 'CRM / command center' },
    { id: 'custom-software', label: 'Custom software' },
    { id: 'app-build', label: 'App build' },
    { id: 'workflow-integration', label: 'Workflow integration' },
    { id: 'api-data-integration', label: 'API / data integration' },
    { id: 'ecommerce', label: 'Ecommerce' },
    { id: 'seo-marketing-automation', label: 'SEO / marketing automation' },
    { id: 'hosting-maintenance', label: 'Hosting / maintenance' },
    { id: 'consulting-scope', label: 'Consulting / scope' },
  ],
  VideoHub: [
    { id: 'VideoHub', label: 'VideoHub contact' },
    { id: 'contact', label: 'General contact' },
    { id: 'funeral-home', label: 'Funeral home partnership' },
  ],
  ContentHub: [
    { id: 'platform-demo', label: 'Platform demo' },
    { id: 'publisher-onboarding', label: 'Publisher onboarding' },
    { id: 'tourism-authority', label: 'Tourism authority / destination org' },
    { id: 'newsroom-automation', label: 'Newsroom automation' },
    { id: 'sponsor-sales', label: 'Sponsor sales' },
    { id: 'content-media-workflow', label: 'Content / media workflow' },
    { id: 'tenant-buildout', label: 'Tenant buildout' },
  ],
  wnc_times: [
    { id: 'sponsor-lead', label: 'Sponsor lead' },
    { id: 'ad-package', label: 'Ad package' },
    { id: 'tda', label: 'TDA' },
    { id: 'coverage-story', label: 'Coverage / story' },
    { id: 'event-community', label: 'Event / community' },
    { id: 'partnership', label: 'Partnership' },
  ],
}

const LEADS_VIEW_MODES = ['list', 'grid', 'kanban', 'lead-lists']

const statusMeta = (s) => STATUS.find(x => x.id === s) || STATUS[0]
const initials = (n = '') => n.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('') || '?'
const sourceLabel = (id = '') => SOURCES.find(s => s.id === id)?.label || String(id || '').replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
const categoryOptionsForBrand = (brandId = 'farrington_dev') => LEAD_CATEGORY_GROUPS[brandId] || LEAD_CATEGORY_GROUPS.farrington_dev
const categoryLabel = (id = '', brandId = 'farrington_dev') => {
  const all = Object.values(LEAD_CATEGORY_GROUPS).flat()
  return categoryOptionsForBrand(brandId).find(c => c.id === id)?.label || all.find(c => c.id === id)?.label || sourceLabel(id)
}
const categoryValueForLead = (lead = {}, brandId = lead.brandContext || inferBrand(lead)) => {
  const direct = lead.serviceLine || lead.productOpportunity || ''
  if (direct) return direct
  if (brandId === 'farrington_dev') return ''
  return lead.category || lead.campaignType || lead.campaign || lead.legacy?.campaign || ''
}
const isFarringtonCategoryValue = (value = '') => {
  const text = String(value || '').toLowerCase()
  if (!text) return false
  if (categoryOptionsForBrand('farrington_dev').some(c => c.id === value)) return true
  return /farrington|command[ -]?center|automation|crm|software|web|website|app|api|data|ecommerce|seo|hosting|maintenance|consult/i.test(text)
}
const sourceValuesForLead = (lead = {}) => [
  lead.source,
  lead.campaign,
  lead.campaignType,
  lead.brandContext,
  lead.legacy?.source,
  lead.legacy?.campaign,
].map(v => String(v || '').trim()).filter(Boolean)
const normalizeLeadViewMode = (mode = '') => {
  if (mode === 'card' || mode === 'cards') return 'grid'
  if (mode === 'board') return 'kanban'
  if (mode === 'pipeline' || mode === 'lead-list') return 'lead-lists'
  return LEADS_VIEW_MODES.includes(mode) ? mode : 'list'
}

// The prospect's own website. Swept leads have carried lead.website in the data
// all along (apify-farrington-lead-sweep stores it, leadDedupe matches on it) —
// the UI just never surfaced it. Fall back to the same aliases dedupe checks.
const leadWebsite = (lead = {}) => String(lead.website || lead.web || lead.url || lead.domain || '').trim()
const leadWebsiteHref = (url = '') => (/^https?:\/\//i.test(url) ? url : `https://${url}`)

const leadReceivedAt = (lead = {}) => lead.receivedAt || lead.createdAt || lead.inboundReceivedAt || lead.submittedAt || lead.importedAt || lead.created_at || lead.legacy?.receivedAt || lead.legacy?.ts || lead.legacy?.createdAt || lead.legacy?.created_at || lead.updatedAt || null
const leadUpdatedAt = (lead = {}) => lead.updatedAt || lead.modifiedAt || lead.modified_at || null
const leadLastEngagedAt = (lead = {}) => lead.lastEngagedAt || lead.lastContactedAt || lead.contactedAt || lead.qualifiedAt || lead.convertedAt || null
const leadStaleAnchorAt = (lead = {}) => leadLastEngagedAt(lead) || leadUpdatedAt(lead) || leadReceivedAt(lead)

function formatLeadDateTime(value) {
  if (!value) return 'Not captured'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not captured'
  return date.toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function formatLeadAge(value) {
  if (!value) return 'Age unknown'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Age unknown'
  const diffMs = Date.now() - date.getTime()
  if (diffMs < 0) return 'Scheduled'
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 60) return minutes <= 1 ? 'Just now' : `${minutes}m old`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h old`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d old`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months}mo old`
  const years = Math.floor(months / 12)
  return `${years}y old`
}

function LeadTimestamp({ lead, compact = false }) {
  const receivedAt = leadReceivedAt(lead)
  const label = formatLeadDateTime(receivedAt)
  const age = formatLeadAge(receivedAt)
  return (
    <span className={`lead-timestamp-pill inline-flex items-center gap-1 rounded-full font-medium ${compact ? 'text-[10px] px-2 py-1' : 'text-[11px] px-2.5 py-1'}`} style={{ background: 'var(--surface2)', color: 'var(--text-muted)', border: '1px solid var(--border)' }} title={`Received ${label}`}>
      <span style={{ color: 'var(--accent)' }}>Received</span>
      <span>{compact ? age : `${label} · ${age}`}</span>
    </span>
  )
}

function LastTouchPill({ lead, compact = false }) {
  const touchedAt = leadLastEngagedAt(lead)
  const label = formatLeadDateTime(touchedAt)
  const age = formatLeadAge(touchedAt)
  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-medium ${compact ? 'text-[10px] px-2 py-1' : 'text-[11px] px-2.5 py-1'}`} style={{ background: touchedAt ? 'var(--green-soft)' : 'var(--surface2)', color: touchedAt ? 'var(--green)' : 'var(--text-muted)', border: `1px solid ${touchedAt ? 'var(--green)' : 'var(--border)'}` }} title={touchedAt ? `Last touch ${label}` : 'No engagement captured yet'}>
      <span>Last touch</span>
      <span>{touchedAt ? (compact ? age : `${label} - ${age}`) : 'none'}</span>
    </span>
  )
}

function LeadSignalBars({ lead }) {
  const statusIndex = Math.max(0, STATUS.findIndex(status => status.id === lead.status))
  const staleAnchor = new Date(leadStaleAnchorAt(lead) || 0).getTime()
  const ageDays = staleAnchor ? Math.max(0, Math.floor((Date.now() - staleAnchor) / 86400000)) : 0
  const urgency = Math.min(4, Math.max(1, Math.ceil(ageDays / 3)))
  return (
    <div className="lead-signal-bars" aria-hidden="true" title={`Status step ${statusIndex + 1}; stale anchor ${formatLeadAge(leadStaleAnchorAt(lead))}`}>
      {[0, 1, 2, 3, 4].map(index => (
        <span
          key={index}
          className={index <= statusIndex || index < urgency ? 'is-lit' : ''}
          style={{ height: `${8 + index * 3}px` }}
        />
      ))}
    </div>
  )
}

function api(url, body) { return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()) }

const inp = { background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13, outline: 'none', fontFamily: 'inherit' }

function Modal({ title, onClose, children, wide }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div className={`relative w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} rounded-xl p-6 animate-fade-in max-h-[85vh] overflow-auto`} style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
        <button type="button" aria-label="Close" onClick={onClose} className="absolute top-3 right-3 w-9 h-9 rounded-lg text-lg font-bold" style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}>X</button>
        <h2 className="text-lg font-semibold mb-4 pr-10" style={{ color: 'var(--text)' }}>{title}</h2>
        {children}
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return <div className="mb-3"><label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-muted)' }}>{label}</label>{children}</div>
}

function inferBrand(lead = {}) {
  const haystack = [lead.brandContext, lead.source, lead.serviceLine, lead.productOpportunity, lead.notes, ...(lead.tags || [])].join(' ').toLowerCase()
  if (haystack.includes('VideoHub')) return 'VideoHub'
  if (haystack.includes('wnc')) return 'wnc_times'
  if (haystack.includes('newsroom')) return 'ContentHub'
  return 'farrington_dev'
}

// Substitute template variables with this lead's facts. The letters live in
// /api/email-templates (kv_store) — editable in the UI, no deploy needed.
const fillTemplate = (text = '', lead = {}, brand = {}) => String(text)
  .replaceAll('{contact}', lead.name || 'there')
  .replaceAll('{company}', lead.businessName || 'your team')
  .replaceAll('{brand}', brand.from || brand.label || '')

function LeadEmailModal({ lead, onClose, onSent }) {
  // Brand follows the lead's pipeline: a Farrington lead sends as Farrington
  // Development, a ContentHub lead as ContentHub. The /api/sponsor-email
  // route maps the brand to the actual From address (BRAND_FROM).
  const [brandId, setBrandId] = useState(() => lead.brandContext || inferBrand(lead))
  const [templates, setTemplates] = useState(null) // null = loading
  const [templateId, setTemplateId] = useState('')
  const [to, setTo] = useState(lead.email || '')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [managing, setManaging] = useState(false)
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState('')
  const brand = BRAND_CONTEXTS.find(b => b.id === brandId) || BRAND_CONTEXTS[0]
  const brandTemplates = (templates || []).filter(t => t.brandContext === brandId)

  const loadTemplates = useCallback(async () => {
    try {
      const res = await fetch('/api/email-templates')
      const data = await res.json()
      setTemplates(Array.isArray(data.templates) ? data.templates : [])
    } catch {
      setTemplates([])
    }
  }, [])
  useEffect(() => { loadTemplates() }, [loadTemplates])

  // Refill the editable draft whenever the picked template or brand changes.
  // Setting the same templateId back is a state no-op, so this doesn't loop;
  // operator edits persist until they switch template or brand.
  useEffect(() => {
    if (!templates) return
    const list = templates.filter(t => t.brandContext === brandId)
    const current = list.find(t => t.id === templateId) || list[0] || null
    setTemplateId(current?.id || '')
    setSubject(fillTemplate(current?.subject || '', lead, brand))
    setBody(fillTemplate(current?.body || '', lead, brand))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templates, brandId, templateId])

  const send = async () => {
    if (!to.includes('@')) return
    setSending(true)
    setResult('')
    try {
      const fd = new FormData()
      fd.append('to', to)
      fd.append('subject', subject)
      fd.append('body', body)
      fd.append('campaignType', brand.campaignType)
      fd.append('brand', brand.id)
      fd.append('fromName', brand.from)
      fd.append('contactName', lead.name || 'there')
      fd.append('paperName', lead.businessName || '')
      const res = await fetch('/api/sponsor-email', { method: 'POST', body: fd })
      const data = await res.json()
      if (!data.ok) throw new Error(data.error || 'Email failed')
      // Log the touch so the lead's history shows what went out and when.
      fetch('/api/activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add', activity: { type: 'email', subject: `Follow-up sent: ${subject}`, body: `To: ${to}\nBrand: ${brand.label}\nTemplate: ${brandTemplates.find(t => t.id === templateId)?.name || 'custom'}`, linkedTo: { leadId: lead.id } } }),
      }).catch(() => {})
      setResult('Email sent.')
      onSent?.()
      setTimeout(onClose, 900)
    } catch (e) {
      setResult(e.message || 'Email failed')
    } finally {
      setSending(false)
    }
  }

  return (
    <Modal title={managing ? 'Edit email templates' : `Email ${lead.businessName || lead.name || 'lead'}`} onClose={onClose} wide>
      {managing && templates ? (
        <EmailTemplateEditor initialBrand={brandId} onChanged={loadTemplates} onDone={() => setManaging(false)} doneLabel="Back to email" />
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Send as">
              <ThemedSelect style={inp} value={brandId} onChange={e => setBrandId(e.target.value)}>
                {BRAND_CONTEXTS.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
              </ThemedSelect>
            </Field>
            <Field label="Letter">
              <ThemedSelect style={inp} value={templateId} onChange={e => setTemplateId(e.target.value)}>
                {templates === null && <option value="">Loading templates...</option>}
                {templates !== null && brandTemplates.length === 0 && <option value="">No templates for this brand yet</option>}
                {brandTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </ThemedSelect>
            </Field>
          </div>
          <div className="text-[11px] rounded-lg px-3 py-2 mb-3" style={{ background: 'var(--surface2)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
            Sends from the <b style={{ color: 'var(--text)' }}>{brand.label}</b> address for this pipeline. Subject and message are editable — tweak anything before sending.
          </div>
          <Field label="To"><input style={inp} value={to} onChange={e => setTo(e.target.value)} placeholder="email@example.com" /></Field>
          <Field label="Subject"><input style={inp} value={subject} onChange={e => setSubject(e.target.value)} /></Field>
          <Field label="Message"><textarea style={{ ...inp, minHeight: 220, resize: 'vertical' }} value={body} onChange={e => setBody(e.target.value)} /></Field>
          {result && <div className="text-xs mb-3" style={{ color: result.includes('sent') ? 'var(--green)' : 'var(--red)' }}>{result}</div>}
          <div className="flex gap-2 justify-end flex-wrap">
            <button className="px-4 rounded-lg text-sm" style={{ background: 'var(--surface2)', color: 'var(--text-muted)', minHeight: 44 }} onClick={onClose} disabled={sending}>Close</button>
            <button className="px-4 rounded-lg text-sm" style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', minHeight: 44 }} onClick={() => setManaging(true)} disabled={templates === null}>Edit templates</button>
            <button className="px-4 rounded-lg text-sm font-semibold" style={{ background: 'var(--surface2)', color: 'var(--accent)', minHeight: 44 }} onClick={() => navigator.clipboard?.writeText(body)}>Copy</button>
            <button className="px-5 rounded-lg text-sm font-semibold" style={{ background: 'var(--accent)', color: 'var(--accent-text)', minHeight: 44 }} onClick={send} disabled={sending || !to.includes('@')}>{sending ? 'Sending...' : 'Send Email'}</button>
          </div>
        </>
      )}
    </Modal>
  )
}

function LeadForm({ lead, leadLists, opportunities, onSave, onClose, onQualify, onDelete }) {
  const defaultLeadListId = leadLists.find(list => list.id === 'farrington_dev')?.id || leadLists[0]?.id || ''
  const initialBrand = lead?.brandContext || inferBrand(lead || {})
  const [f, setF] = useState(lead || {
    name: '', email: '', phone: '', businessName: '', website: '', title: '',
    source: 'cold_call', status: 'new', brandContext: 'farrington_dev', serviceLine: categoryOptionsForBrand('farrington_dev')[0].id, leadListId: defaultLeadListId, suggestedPipelineId: null, opportunityId: '',
    notes: '', tags: [],
  })
  const u = (k, v) => setF(p => ({ ...p, [k]: v }))
  const activeBrandId = f.brandContext || initialBrand || 'farrington_dev'
  const activeCategoryOptions = categoryOptionsForBrand(activeBrandId)
  const currentCategory = f.serviceLine || categoryValueForLead(f, activeBrandId)
  const selectedCategory = activeCategoryOptions.some(c => c.id === currentCategory)
    ? currentCategory
    : activeCategoryOptions[0]?.id || ''
  const normalizedForm = () => ({ ...f, brandContext: activeBrandId, serviceLine: selectedCategory })
  const selectedOpportunity = opportunities.find(o => o.id === f.opportunityId)
  const receivedAt = leadReceivedAt(f)
  const updatedAt = leadUpdatedAt(f)
  const lastEngagedAt = leadLastEngagedAt(f)
  return (
    <Modal title={lead?.id ? 'Edit Lead' : 'New Lead'} onClose={onClose} wide>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-4">
        <div className="rounded-lg px-3 py-2" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
          <div className="text-[10px] uppercase font-semibold tracking-wider" style={{ color: 'var(--accent)' }}>Received</div>
          <div className="text-xs font-semibold mt-1" style={{ color: 'var(--text)' }}>{formatLeadDateTime(receivedAt)}</div>
          <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{formatLeadAge(receivedAt)}</div>
        </div>
        <div className="rounded-lg px-3 py-2" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
          <div className="text-[10px] uppercase font-semibold tracking-wider" style={{ color: 'var(--green)' }}>Last touch</div>
          <div className="text-xs font-semibold mt-1" style={{ color: 'var(--text)' }}>{formatLeadDateTime(lastEngagedAt)}</div>
          <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{lastEngagedAt ? formatLeadAge(lastEngagedAt) : 'No engagement'}</div>
        </div>
        <div className="rounded-lg px-3 py-2" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
          <div className="text-[10px] uppercase font-semibold tracking-wider" style={{ color: 'var(--teal)' }}>Updated</div>
          <div className="text-xs font-semibold mt-1" style={{ color: 'var(--text)' }}>{formatLeadDateTime(updatedAt)}</div>
          <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{formatLeadAge(updatedAt)}</div>
        </div>
        <div className="rounded-lg px-3 py-2" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
          <div className="text-[10px] uppercase font-semibold tracking-wider" style={{ color: 'var(--green)' }}>Converted</div>
          <div className="text-xs font-semibold mt-1" style={{ color: 'var(--text)' }}>{formatLeadDateTime(f.convertedAt)}</div>
          <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{f.convertedAt ? formatLeadAge(f.convertedAt) : 'Not converted'}</div>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Contact Name"><input style={inp} value={f.name} onChange={e => u('name', e.target.value)} placeholder="John Smith" autoFocus /></Field>
        <Field label="Business Name"><input style={inp} value={f.businessName} onChange={e => u('businessName', e.target.value)} placeholder="ACME Corp" /></Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Email"><input type="email" style={inp} value={f.email} onChange={e => u('email', e.target.value)} /></Field>
        <Field label="Phone"><input style={inp} value={f.phone} onChange={e => u('phone', e.target.value)} placeholder="PHONE_REDACTED" /></Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Website">
          <div className="flex items-center gap-2">
            <input style={{ ...inp, flex: 1 }} value={f.website || ''} onChange={e => u('website', e.target.value)} placeholder="example.com" />
            {leadWebsite(f) && (
              <a href={leadWebsiteHref(leadWebsite(f))} target="_blank" rel="noopener noreferrer" aria-label="Open website" title={`Open ${leadWebsite(f)}`}
                className="inline-grid place-items-center rounded-lg" style={{ width: 40, height: 40, minWidth: 40, background: 'var(--accent-soft)', color: 'var(--accent)', border: '1px solid var(--accent)' }}>
                <Globe size={16} strokeWidth={2.2} aria-hidden="true" />
              </a>
            )}
          </div>
        </Field>
        <Field label="Title"><input style={inp} value={f.title} onChange={e => u('title', e.target.value)} placeholder="e.g. Owner, Director of Marketing" /></Field>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Field label="Source">
          <ThemedSelect style={inp} value={f.source} onChange={e => u('source', e.target.value)}>{SOURCES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</ThemedSelect>
        </Field>
        <Field label="Brand / Context">
          <ThemedSelect style={inp} value={activeBrandId} onChange={e => {
            const brandId = e.target.value
            setF(p => ({ ...p, brandContext: brandId, serviceLine: categoryOptionsForBrand(brandId)[0]?.id || '' }))
          }}>{BRAND_CONTEXTS.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}</ThemedSelect>
        </Field>
        <Field label="Category">
          <ThemedSelect style={inp} value={selectedCategory} onChange={e => u('serviceLine', e.target.value)}>
            {activeCategoryOptions.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </ThemedSelect>
        </Field>
        <Field label="Status">
          <ThemedSelect style={inp} value={f.status} onChange={e => u('status', e.target.value)}>{STATUS.filter(s => s.id !== 'converted').map(s => <option key={s.id} value={s.id}>{s.label}</option>)}</ThemedSelect>
        </Field>
      </div>
      <div className="grid grid-cols-1 gap-3">
        <Field label="Lead List">
          <ThemedSelect style={inp} value={f.leadListId || f.suggestedPipelineId || ''} onChange={e => setF(p => ({ ...p, leadListId: e.target.value, suggestedPipelineId: null }))}>
            <option value="">— Any —</option>
            {leadLists.map(list => <option key={list.id} value={list.id}>{list.name}</option>)}
          </ThemedSelect>
        </Field>
      </div>
      <Field label="Assigned Opportunity">
        <ThemedSelect style={inp} value={f.opportunityId || ''} onChange={e => {
          const opp = opportunities.find(o => o.id === e.target.value)
          setF(p => ({
            ...p,
            opportunityId: e.target.value,
            leadListId: p.leadListId || p.suggestedPipelineId,
          }))
        }}>
          <option value="">— None —</option>
          {opportunities.map(o => <option key={o.id} value={o.id}>{o.name}{o.accountName ? ` · ${o.accountName}` : ''}</option>)}
        </ThemedSelect>
      </Field>
      {selectedOpportunity && (
        <div className="text-[11px] rounded-lg px-3 py-2 mb-3" style={{ background: 'var(--accent-soft)', color: 'var(--accent)', border: '1px solid var(--accent)' }}>
          This lead will be linked to {selectedOpportunity.name}.
        </div>
      )}
      <Field label="Notes"><textarea style={{ ...inp, minHeight: 80, resize: 'vertical' }} value={f.notes} onChange={e => u('notes', e.target.value)} placeholder="Context, pitch points, history..." /></Field>
      <div className="flex gap-2 mt-4 flex-wrap">
        {lead?.id && lead.status !== 'converted' && onQualify && (
          <button className="px-5 rounded-lg text-base font-semibold" style={{ background: 'var(--green)', color: 'var(--accent-text)', minHeight: 48 }}
            onClick={() => onQualify(normalizedForm())}>Convert to Prospect + Opportunity</button>
        )}
        {lead?.id && onDelete && (
          <button className="px-5 rounded-lg text-base font-medium" style={{ background: 'var(--surface2)', color: 'var(--red)', border: '1px solid var(--border)', minHeight: 48 }}
            onClick={() => onDelete(lead.id)}>Delete</button>
        )}
        <button className="flex-1 rounded-lg text-base font-medium" style={{ background: 'var(--accent)', color: 'var(--accent-text)', minHeight: 48 }}
          onClick={() => (f.name.trim() || f.businessName.trim()) && onSave(normalizedForm())}>Save</button>
        <button className="px-5 rounded-lg text-base" style={{ background: 'var(--surface2)', color: 'var(--text-muted)', minHeight: 48 }} onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  )
}

export default function LeadsManager({ onNavigate }) {
  // Stale-while-revalidate: paint instantly with last-known data, refetch silently in the background.
  // First-ever visit on a fresh device will show the empty state for a beat; every subsequent visit is instant.
  const leadsQ = useCachedData('/api/leads', { extract: j => j?.leads || [] })
  const leadListsQ = useCachedData('/api/lead-lists', { extract: j => j?.leadLists || [] })
  const pipesQ = useCachedData('/api/pipelines', { extract: j => j?.pipelines || [] })
  const oppsQ = useCachedData('/api/opportunities', { extract: j => j?.opportunities || [] })
  const leads = leadsQ.data || []
  const leadLists = leadListsQ.data || []
  const pipelines = pipesQ.data || []
  const opportunities = oppsQ.data || []
  const opportunitiesById = useMemo(() => new Map(opportunities.map(o => [o.id, o])), [opportunities])
  const leadListsById = useMemo(() => new Map(leadLists.map(list => [list.id, list])), [leadLists])
  const pipelinesById = useMemo(() => new Map(pipelines.map(p => [p.id, p])), [pipelines])
  const refreshing = leadsQ.refreshing || leadListsQ.refreshing || pipesQ.refreshing || oppsQ.refreshing
  const firstLoad = leadsQ.data == null && leadsQ.refreshing

  const _ls = () => { try { return JSON.parse(localStorage.getItem('leads-ui') || '{}') } catch { return {} } }
  const hadSavedPrefs = useRef((() => { try { return localStorage.getItem('leads-ui') != null } catch { return false } })())
  const userTouchedListPrefs = useRef(false)
  const [search, setSearch] = useState(() => _ls().search ?? '')
  const [filterBrand, setFilterBrand] = useState(() => _ls().filterBrand ?? 'all')
  const [filterCategory, setFilterCategory] = useState(() => _ls().filterCategory ?? 'all')
  const [filterStatus, setFilterStatus] = useState(() => _ls().filterStatus ?? 'all')
  const [filterSource, setFilterSource] = useState(() => _ls().filterSource ?? 'all')
  const [filterLeadList, setFilterLeadList] = useState(() => _ls().filterLeadList ?? 'all')
  const [sortBy, setSortBy] = useState(() => _ls().sortBy ?? 'created')
  const [sortDir, setSortDir] = useState(() => _ls().sortDir ?? 'desc')
  const [view, setView] = useState(() => normalizeLeadViewMode(_ls().view))
  const activeView = normalizeLeadViewMode(view)
  const [editing, setEditing] = useState(null)
  const [adding, setAdding] = useState(false)
  const [qualifying, setQualifying] = useState(null)
  const [showNewList, setShowNewList] = useState(false)
  const [newListName, setNewListName] = useState('')
  const [creatingList, setCreatingList] = useState(false)

  useEffect(() => {
    let leadId = ''
    try { leadId = sessionStorage.getItem('fcc.leads.openId') || '' } catch {}
    if (!leadId) return
    const lead = leads.find(item => item.id === leadId)
    if (!lead) return
    setEditing(lead)
    try { sessionStorage.removeItem('fcc.leads.openId') } catch {}
  }, [leads])

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
      if (data.leadList?.id) setFilterLeadList(data.leadList.id)
      setNewListName('')
      setShowNewList(false)
    } catch (error) {
      window.alert(error.message || 'Lead list creation failed')
    } finally {
      setCreatingList(false)
    }
  }
  const [emailing, setEmailing] = useState(null)
  const [scripting, setScripting] = useState(null)

  useEffect(() => {
    localStorage.setItem('leads-ui', JSON.stringify({ search, filterBrand, filterCategory, filterStatus, filterSource, filterLeadList, sortBy, sortDir, view: activeView }))
  }, [search, filterBrand, filterCategory, filterStatus, filterSource, filterLeadList, sortBy, sortDir, activeView])

  useEffect(() => {
    const resetFromMainNav = (event) => {
      if (event?.detail?.tab !== 'leads') return
      setView('list')
      setEditing(null)
      setAdding(false)
      setQualifying(null)
      setEmailing(null)
    }
    window.addEventListener('fcc:main-nav', resetFromMainNav)
    return () => window.removeEventListener('fcc:main-nav', resetFromMainNav)
  }, [])

  // Global search navigates here first, then asks this manager to open the exact record.
  // Keep a short-lived pending selection so a result click still works while leads are loading.
  useEffect(() => {
    const handler = (event) => {
      const record = event?.detail
      if (!record || record.type !== 'lead' || !record.id) return
      window.__fccPendingLeadSelect = { id: record.id, ts: Date.now() }
      const match = leads.find(lead => lead.id === record.id)
      if (match) {
        setEditing(match)
        window.__fccPendingLeadSelect = null
      }
    }
    window.addEventListener('fcc:select-record', handler)
    return () => window.removeEventListener('fcc:select-record', handler)
  }, [leads])

  useEffect(() => {
    const pending = window.__fccPendingLeadSelect
    if (!pending || Date.now() - pending.ts > 10000) return
    const match = leads.find(lead => lead.id === pending.id)
    if (match) {
      setEditing(match)
      window.__fccPendingLeadSelect = null
    }
  }, [leads])

  // Force the cache to refetch after any mutation so the next render has fresh data.
  const refresh = useCallback(async () => { await leadsQ.refresh(); await pipesQ.refresh(); await oppsQ.refresh() }, [leadsQ, pipesQ, oppsQ])

  const save = async (form) => {
    const action = form.id ? 'update' : 'add'
    const result = await api('/api/leads', { action, lead: form })
    if (result?.skipped || result?.error) {
      alert(result.message || result.error || 'Lead was not saved.')
      return
    }
    setEditing(null); setAdding(false)
    await leadsQ.refresh()
  }
  const del = async (id) => { if (!confirm('Delete this lead?')) return; await api('/api/leads', { action: 'delete', id }); await leadsQ.refresh() }
  const setStatus = async (lead, status) => { await api('/api/leads', { action: 'update', lead: { id: lead.id, status } }); await leadsQ.refresh() }

  const filtered = useMemo(() => {
    let out = leads
    if (search.trim()) {
      const q = search.toLowerCase()
      out = out.filter(l =>
        (l.name || '').toLowerCase().includes(q) ||
        (l.businessName || '').toLowerCase().includes(q) ||
        (l.email || '').toLowerCase().includes(q) ||
        (l.phone || '').includes(q) ||
        leadWebsite(l).toLowerCase().includes(q) ||
        (l.productOpportunity || '').toLowerCase().includes(q) ||
        (l.serviceLine || '').toLowerCase().includes(q) ||
        (l.tags || []).join(' ').toLowerCase().includes(q) ||
        (l.searchAliases || []).join(' ').toLowerCase().includes(q)
      )
    }
    // A converted lead is history, not work. It stays in the store for source
    // attribution but no longer belongs in the working list - click the
    // Converted tile to see them.
    if (filterStatus !== 'all') out = out.filter(l => l.status === filterStatus)
    else out = out.filter(l => l.status !== 'converted')
    if (filterBrand !== 'all') out = out.filter(l => (l.brandContext || inferBrand(l)) === filterBrand)
    if (filterCategory !== 'all') out = out.filter(l => categoryValueForLead(l) === filterCategory)
    if (filterSource !== 'all') out = out.filter(l => sourceValuesForLead(l).includes(filterSource))
    if (filterLeadList !== 'all') out = out.filter(l => (l.leadListId || l.suggestedPipelineId || 'unassigned') === filterLeadList)
    out = [...out].sort((a, b) => {
      let cmp = 0
      if (sortBy === 'name') cmp = (a.name || a.businessName || '').localeCompare(b.name || b.businessName || '')
      else if (sortBy === 'created') cmp = new Date(leadReceivedAt(a) || 0).getTime() - new Date(leadReceivedAt(b) || 0).getTime()
      else if (sortBy === 'status') cmp = (a.status || '').localeCompare(b.status || '')
      return sortDir === 'asc' ? cmp : -cmp
    })
    return out
  }, [leads, search, filterBrand, filterCategory, filterStatus, filterSource, filterLeadList, sortBy, sortDir])

  const sourceOptions = useMemo(() => {
    const seen = new Map(SOURCES.map(s => [s.id, s.label]))
    for (const lead of leads) {
      for (const value of sourceValuesForLead(lead)) {
        if (!seen.has(value)) seen.set(value, sourceLabel(value))
      }
    }
    return Array.from(seen, ([id, label]) => ({ id, label }))
  }, [leads])

  const stats = useMemo(() => ({
    total: leads.length,
    new: leads.filter(l => l.status === 'new').length,
    contacted: leads.filter(l => l.status === 'contacted').length,
    qualified: leads.filter(l => l.status === 'qualified' || l.status === 'converted').length,
    converted: leads.filter(l => l.status === 'converted').length,
  }), [leads])
  const maxStatusCount = Math.max(1, ...STATUS.map(status => leads.filter(lead => lead.status === status.id).length))
  const newestReceivedAt = useMemo(() => {
    let newest = 0
    for (const lead of leads) {
      const time = new Date(leadReceivedAt(lead) || 0).getTime()
      if (!Number.isNaN(time) && time > newest) newest = time
    }
    return newest ? new Date(newest).toISOString() : null
  }, [leads])
  const staleOpenCount = useMemo(() => {
    const sevenDays = 7 * 24 * 60 * 60 * 1000
    return leads.filter(lead => !['converted', 'unqualified'].includes(lead.status) && Date.now() - new Date(leadStaleAnchorAt(lead) || 0).getTime() > sevenDays).length
  }, [leads])

  const { page, setPage, pageSize, setPageSize, paginated } = usePagination(filtered, _ls().pageSize || 50)
  const changePageSize = size => { userTouchedListPrefs.current = true; setPageSize(size) }

  // Component configuration layer: configured defaults apply only where this
  // device has no last-used value saved in localStorage.
  const listPrefs = useComponentSettings('leads.list')
  useEffect(() => {
    if (!listPrefs.loaded || !listPrefs.values) return
    if (userTouchedListPrefs.current) return
    // Configured component settings are the source of truth for the default
    // view; a stale localStorage value must not override them.
    setView(normalizeLeadViewMode(listPrefs.values.view))
    if (hadSavedPrefs.current) return
    setPageSize(listPrefs.values.pageSize)
    setSortBy(listPrefs.values.defaultSort ?? 'created')
    setSortDir(listPrefs.values.defaultSortDir ?? 'desc')
    setFilterStatus(listPrefs.values.defaultStatusFilter ?? 'all')
  }, [listPrefs.loaded])

  useEffect(() => { const s = _ls(); if (s.page) setPage(s.page) }, [])
  const activeFilterCategoryOptions = filterBrand === 'all'
    ? Object.values(LEAD_CATEGORY_GROUPS).flat()
    : categoryOptionsForBrand(filterBrand)
  useEffect(() => {
    if (filterBrand !== 'all' && filterCategory !== 'all' && !categoryOptionsForBrand(filterBrand).some(c => c.id === filterCategory)) {
      setFilterCategory('all')
    }
  }, [filterBrand, filterCategory])
  useEffect(() => { setPage(1) }, [search, filterBrand, filterCategory, filterStatus, filterSource, sortBy, sortDir, view, setPage])
  useEffect(() => { localStorage.setItem('leads-ui', JSON.stringify({ search, filterBrand, filterCategory, filterStatus, filterSource, sortBy, sortDir, view, page, pageSize })) }, [page, pageSize])
  const changeSourceFilter = (value) => {
    userTouchedListPrefs.current = true
    setFilterSource(value)
    setFilterStatus('all')
    setSearch('')
    setPage(1)
  }

  const sel = { background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '6px 10px', borderRadius: 6, fontSize: 12, outline: 'none', minWidth: 150 }
  const leadListSelectStyle = { ...sel, flex: '1 1 260px', minWidth: 260 }
  const cardSelectStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', width: '100%', padding: '8px 10px', borderRadius: 8, fontSize: 12, outline: 'none' }
  const leadHeaderIconButtonStyle = { width: 40, height: 40, minWidth: 40, display: 'grid', placeItems: 'center', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', cursor: 'pointer' }
  const leadIconActionStyle = { width: 32, height: 32, minWidth: 32, borderRadius: 999, display: 'inline-grid', placeItems: 'center', fontSize: 0, border: '1px solid var(--border)', cursor: 'pointer' }
  const leadIconTone = {
    primary: { background: 'var(--accent-soft)', color: 'var(--accent)', border: '1px solid var(--accent)' },
    purple: { background: 'var(--purple-soft)', color: 'var(--purple)', border: '1px solid var(--purple)' },
  }
  const iconOnly = (Icon) => <Icon size={15} strokeWidth={2.2} aria-hidden="true" />
  const stopCardOpen = (e) => e.stopPropagation()
  const leadMenuActions = (l) => {
    const site = leadWebsite(l)
    return [
      { label: 'Open lead', icon: ExternalLink, onClick: () => setEditing(l) },
      site && {
        label: 'Open website',
        icon: Globe,
        href: leadWebsiteHref(site),
        target: '_blank',
        rel: 'noopener noreferrer',
      },
      { label: 'Open call scripts', icon: BookOpen, onClick: () => setScripting(l) },
      l.email && { label: 'Email lead', icon: Mail, onClick: () => setEmailing(l) },
      l.status !== 'converted' && { label: 'Convert to account', icon: CheckCircle2, onClick: () => setQualifying(l) },
      l.status !== 'converted' && l.status !== 'unqualified' && { label: 'Disqualify lead', icon: XCircle, onClick: () => setStatus(l, 'unqualified') },
      { label: 'Delete lead', icon: Trash2, tone: 'danger', onClick: () => del(l.id) },
    ]
  }
  const renderLeadActions = (l) => (
    <div
      data-lead-actions={l.id}
      className="flex items-center justify-end gap-1.5 flex-nowrap"
      style={{ width: 114, minWidth: 114, minHeight: 34 }}
      onClick={e => e.stopPropagation()}
      onPointerDown={e => e.stopPropagation()}
    >
      {l.phone && (
        <CallButton
          phone={l.phone}
          name={l.name || l.businessName}
          label={iconOnly(Phone)}
          stopPropagation
          className="inline-grid place-items-center"
          style={{ ...leadIconActionStyle, ...leadIconTone.primary }}
        />
      )}
      {l.email && (
        <VideoMeetButton
          compact
          instant
          stopPropagation
          to={l.email}
          name={l.name || l.businessName}
          seed={l.businessName || l.name}
          linkedTo={{ leadId: l.id, opportunityId: l.opportunityId || undefined }}
          label={iconOnly(Video)}
          className="inline-grid place-items-center"
          style={{ ...leadIconActionStyle, ...leadIconTone.purple }}
        />
      )}
      <ItemActionsMenu label={`Actions for ${l.businessName || l.name || 'lead'}`} actions={leadMenuActions(l)} />
    </div>
  )
  const opportunityPipelineNameForLead = (lead) => {
    const linkedOpportunity = opportunitiesById.get(lead.opportunityId || lead.convertedToOpportunityId)
    const pipelineId = linkedOpportunity?.pipelineId
    return pipelinesById.get(pipelineId)?.name || ''
  }
  const leadListNameForLead = (lead) => {
    const leadListId = lead.leadListId || lead.suggestedPipelineId || ''
    return leadListsById.get(leadListId)?.name || lead.leadListName || ''
  }
  const serviceLabelForLead = (lead) => {
    const value = lead.serviceLine || lead.productOpportunity || ''
    const brandId = lead.brandContext || inferBrand(lead)
    if (brandId === 'farrington_dev' && !isFarringtonCategoryValue(value)) return ''
    return value
  }
  const renderLeadCard = (l, compact = false) => (
    <div key={l.id} onClick={() => setEditing(l)} className="rounded-lg p-3 cursor-pointer" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold leading-snug truncate" style={{ color: 'var(--text)' }}>{l.businessName || l.name}</div>
          {l.name && l.businessName && <div className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>{l.name}</div>}
          <div className="mt-2 flex flex-wrap gap-1.5">
            <LeadTimestamp lead={l} compact />
            <LastTouchPill lead={l} compact />
          </div>
        </div>
        <LeadSignalBars lead={l} />
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <span className="text-[10px] px-2 py-1 rounded-full" style={{ background: statusMeta(l.status).bg, color: statusMeta(l.status).color, border: `1px solid ${statusMeta(l.status).color}` }}>{statusMeta(l.status).label}</span>
        {l.source && <span className="text-[10px] px-2 py-1 rounded-full" style={{ background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>{sourceLabel(l.source)}</span>}
        {serviceLabelForLead(l) && <span className="text-[10px] px-2 py-1 rounded-full" style={{ background: 'var(--amber-soft)', color: 'var(--amber)', border: '1px solid var(--amber)' }}>{categoryLabel(serviceLabelForLead(l), l.brandContext || inferBrand(l))}</span>}
      </div>
      {(leadListNameForLead(l) || opportunityPipelineNameForLead(l) || l.opportunityId) && (
        <div className="mt-2 rounded-lg px-2.5 py-2 text-[11px] leading-snug" style={{ background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
          {leadListNameForLead(l) && <div><span style={{ color: 'var(--green)', fontWeight: 700 }}>Lead List:</span> {leadListNameForLead(l)}</div>}
          {opportunityPipelineNameForLead(l) && <div><span style={{ color: 'var(--accent)', fontWeight: 700 }}>Sales Pipeline:</span> {opportunityPipelineNameForLead(l)}</div>}
          {l.opportunityId && <div><span style={{ color: 'var(--accent)', fontWeight: 700 }}>Opportunity:</span> {opportunitiesById.get(l.opportunityId)?.name || 'Linked'}</div>}
        </div>
      )}
      <div className="mt-3" onClick={e => e.stopPropagation()}>
        <ThemedSelect
          style={cardSelectStyle}
          value={l.status || 'new'}
          onPointerDown={stopCardOpen}
          onMouseDown={stopCardOpen}
          onClick={stopCardOpen}
          onChange={e => { e.stopPropagation(); setStatus(l, e.target.value) }}
          aria-label={`Move ${l.businessName || l.name || 'lead'} status`}
        >
          {STATUS.map(status => <option key={status.id} value={status.id}>Move to {status.label}</option>)}
        </ThemedSelect>
      </div>
      {l.status === 'converted' && l.convertedToAccountName && (
        <div className="mt-3" onClick={e => e.stopPropagation()}>
          <span className='text-[11px] font-semibold px-2 py-1 rounded-lg' title='This lead became an account'
            style={{ background: 'var(--green-soft)', color: 'var(--green)', border: '1px solid var(--green)' }}>
            &rarr; {l.convertedToAccountName}
          </span>
        </div>
      )}
      <div className="mt-3 flex justify-end flex-nowrap" style={{ minHeight: 34 }}>
        {renderLeadActions(l)}
      </div>
    </div>
  )
  const leadListGroups = useMemo(() => {
    const groups = leadLists.map(list => ({ id: list.id, label: list.name, leads: [] }))
    const unassigned = { id: 'unassigned', label: 'No lead list', leads: [] }
    for (const lead of filtered) {
      const leadListId = lead.leadListId || lead.suggestedPipelineId
      const group = groups.find(g => g.id === leadListId) || unassigned
      group.leads.push(lead)
    }
    return [...groups.filter(g => g.leads.length), ...(unassigned.leads.length ? [unassigned] : [])]
  }, [filtered, leadLists])

  return (
    <div className="leads-workspace command-workspace p-6">
      <PageHeader
        icon={<Sprout size={20} />}
        title="Lead Manager"
        className="leads-command-header"
        subtitle={`${stats.total} total · ${stats.new} new · ${stats.contacted} contacted · ${stats.converted} converted${refreshing && !firstLoad ? '  ·  ⟳ refreshing' : ''}`}
        actions={
          <div style={{ display: 'flex', gap: 8, position: 'relative', flexWrap: 'nowrap' }}>
            <LabHeaderButton onClick={() => onNavigate?.('leads-lab')} label="Open leads lab" />
            <LabHeaderButton onClick={() => onNavigate?.('email-templates')} label="Email Templates" icon={<Mail size={16} strokeWidth={2.25} />} />
            <button type="button" onClick={() => setAdding(true)} aria-label="Intake lead" data-tooltip="Intake lead" data-tooltip-side="bottom" style={{ ...leadHeaderIconButtonStyle, background: 'var(--accent)', color: 'var(--accent-text)', borderColor: 'var(--accent)' }}>
              <Plus size={17} strokeWidth={2.25} />
            </button>
          </div>
        }
        viewToggle={<ViewModeToggle value={activeView} onChange={mode => { userTouchedListPrefs.current = true; setView(normalizeLeadViewMode(mode)) }} modes={LEADS_VIEW_MODES} />}
        controls={
          <ComponentSettings componentId="leads.list" title="Leads list settings" onApplied={(id, v) => {
            setView(normalizeLeadViewMode(v.view))
            setPageSize(v.pageSize)
            if (v.defaultSort) setSortBy(v.defaultSort)
            if (v.defaultSortDir) setSortDir(v.defaultSortDir)
            if (v.defaultStatusFilter) setFilterStatus(v.defaultStatusFilter)
          }} />
        }
      />

      {/* Stat pills */}
      <div className="command-stat-grid grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        {STATUS.map(s => {
          const count = leads.filter(l => l.status === s.id).length
          return (
            <button key={s.id} onClick={() => { userTouchedListPrefs.current = true; setFilterStatus(filterStatus === s.id ? 'all' : s.id) }} className="lead-stat-pill rounded-lg p-3 text-left"
              style={{ background: filterStatus === s.id ? s.bg : 'var(--surface)', border: `1px solid ${filterStatus === s.id ? s.color : 'var(--border)'}`, cursor: 'pointer' }}>
              <div className="text-xl font-bold font-mono" style={{ color: s.color }}>{count}</div>
              <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: s.color, opacity: 0.8 }}>{s.label}</div>
              <div className="lead-stat-graph" aria-hidden="true">
                {[0, 1, 2, 3, 4].map(index => (
                  <span key={index} style={{ height: `${8 + Math.round((count / maxStatusCount) * 18) + index * 2}px`, background: s.color, opacity: 0.26 + index * 0.12 }} />
                ))}
              </div>
            </button>
          )
        })}
      </div>

      {/* Filter bar */}
      <div className="flex gap-2 items-center flex-wrap mb-4">
        <input style={{ ...sel, flex: 1, minWidth: 200, padding: '8px 12px', fontSize: 13 }} placeholder="Search name, business, email, phone, website..." value={search} onChange={e => setSearch(e.target.value)} />
        <ThemedSelect style={sel} value={filterBrand} onChange={e => { setFilterBrand(e.target.value); setFilterCategory('all') }}>
          <option value="all">All Brands</option>
          {BRAND_CONTEXTS.map(b => <option key={b.id} value={b.id}>{b.label}</option>)}
        </ThemedSelect>
        <ThemedSelect style={sel} value={filterCategory} onChange={e => setFilterCategory(e.target.value)}>
          <option value="all">All Categories</option>
          {activeFilterCategoryOptions.map(c => <option key={`${c.id}-${c.label}`} value={c.id}>{c.label}</option>)}
        </ThemedSelect>
        <ThemedSelect style={sel} value={filterSource} onChange={e => changeSourceFilter(e.target.value)}>
          <option value="all">All Sources</option>
          {sourceOptions.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </ThemedSelect>
        <ThemedSelect style={leadListSelectStyle} value={filterLeadList} onChange={e => setFilterLeadList(e.target.value)}>
          <option value="all">All Lead Lists</option>
          <option value="unassigned">No Lead List</option>
          {leadLists.map(list => <option key={list.id} value={list.id}>{list.name}</option>)}
        </ThemedSelect>
        {showNewList ? (
          <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            <input style={{ ...sel, minWidth: 170, padding: '8px 12px', fontSize: 13 }} autoFocus placeholder="New list name" value={newListName} onChange={e => setNewListName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') createLeadList(); if (e.key === 'Escape') { setShowNewList(false); setNewListName('') } }} />
            <button style={{ ...sel, cursor: 'pointer', fontWeight: 700, color: 'var(--accent)' }} disabled={creatingList || !newListName.trim()} onClick={createLeadList}>{creatingList ? '…' : 'Create'}</button>
            <button style={{ ...sel, cursor: 'pointer' }} aria-label="Cancel new list" onClick={() => { setShowNewList(false); setNewListName('') }}>✕</button>
          </span>
        ) : (
          <button style={{ ...sel, cursor: 'pointer', whiteSpace: 'nowrap' }} data-tooltip="Create a new lead list" onClick={() => setShowNewList(true)}>+ List</button>
        )}
        <ThemedSelect style={sel} value={sortBy} onChange={e => { userTouchedListPrefs.current = true; setSortBy(e.target.value) }}>
          <option value="created">Sort: Received</option>
          <option value="name">Sort: Name</option>
          <option value="status">Sort: Status</option>
        </ThemedSelect>
        <button style={{ ...sel, cursor: 'pointer', minWidth: 32 }} onClick={() => { userTouchedListPrefs.current = true; setSortDir(d => d === 'asc' ? 'desc' : 'asc') }}>{sortDir === 'asc' ? '↑' : '↓'}</button>
      </div>

      {firstLoad ? <div className="text-center py-16" style={{ color: 'var(--text-muted)' }}><span className="inline-block w-3 h-3 rounded-full mr-2 animate-pulse" style={{ background: 'var(--accent)' }}></span>Fetching leads…</div>
        : filtered.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-3">🌱</div>
            <p style={{ color: 'var(--text-muted)' }}>{leads.length === 0 ? 'No leads yet. Add one to get started.' : 'No leads match these filters.'}</p>
          </div>
        ) : activeView === 'grid' ? (
          <>
          <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
            {paginated.map(l => renderLeadCard(l))}
          </div>
          <Paginator total={filtered.length} page={page} pageSize={pageSize} onPage={setPage} onPageSize={changePageSize} label="leads" />
          </>
        ) : activeView === 'list' ? (
          <>
          <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            {paginated.map((l, i) => {
              const stMeta = statusMeta(l.status)
              return (
                <div key={l.id} data-lead-row={l.id} className="flex items-center gap-3 px-4 group cursor-pointer overflow-hidden" style={{ height: 76, minHeight: 76, borderBottom: i < paginated.length - 1 ? '1px solid var(--border)' : 'none' }}
                  onClick={() => setEditing(l)}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface2)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = '' }}>
                  <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-[11px] shrink-0" style={{ background: stMeta.bg, color: stMeta.color }}>{initials(l.businessName || l.name)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-nowrap overflow-hidden">
                      <div className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{l.businessName || l.name}</div>
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: stMeta.bg, color: stMeta.color }}>{stMeta.label}</span>
                      <LeadSignalBars lead={l} />
                      {l.source && <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>· {sourceLabel(l.source)}</span>}
                      {serviceLabelForLead(l) && <span className="text-[10px]" style={{ color: 'var(--amber)' }}>· {categoryLabel(serviceLabelForLead(l), l.brandContext || inferBrand(l))}</span>}
                      {leadListNameForLead(l) && <span className="text-[10px]" style={{ color: 'var(--green)' }}>· Lead List: {leadListNameForLead(l)}</span>}
                      {opportunityPipelineNameForLead(l) && <span className="text-[10px]" style={{ color: 'var(--accent)' }}>· Sales Pipeline: {opportunityPipelineNameForLead(l)}</span>}
                      {l.opportunityId && <span className="text-[10px]" style={{ color: 'var(--accent)' }}>· {opportunitiesById.get(l.opportunityId)?.name || 'Opportunity linked'}</span>}
                    </div>
                    <div className="text-[11px] flex items-center gap-3 flex-nowrap mt-0.5 overflow-hidden" style={{ color: 'var(--text-muted)' }}>
                      <LeadTimestamp lead={l} />
                      <LastTouchPill lead={l} />
                      {l.name && l.businessName && <span>{l.name}</span>}
                      {l.email && <span>✉ {l.email}</span>}
                      {l.status === 'converted' && l.convertedToAccountName && <span style={{ color: 'var(--green)', fontWeight: 700 }}>&rarr; {l.convertedToAccountName}</span>}
                    </div>
                  </div>
                  {renderLeadActions(l)}
                </div>
              )
            })}
          </div>
          <Paginator total={filtered.length} page={page} pageSize={pageSize} onPage={setPage} onPageSize={changePageSize} label="leads" />
          </>
        ) : activeView === 'lead-lists' ? (
          <>
          <div className="flex gap-3 overflow-x-auto pb-3">
            {leadListGroups.map(group => (
              <div key={group.id} className="flex-shrink-0 w-80 rounded-xl p-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                <div className="flex items-center justify-between mb-3 px-1">
                  <span className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--accent)' }}>{group.label}</span>
                  <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{group.leads.length}</span>
                </div>
                <div className="space-y-2">
                  {group.leads.map(l => renderLeadCard(l, true))}
                </div>
              </div>
            ))}
          </div>
          </>
        ) : (
          <>
          <div className="flex gap-3 overflow-x-auto pb-3">
            {STATUS.map(s => {
              const colLeads = filtered.filter(l => l.status === s.id)
              return (
                <div key={s.id} className="flex-shrink-0 w-72 rounded-xl p-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <div className="flex items-center justify-between mb-3 px-1">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ background: s.color }} />
                      <span className="text-xs font-bold uppercase tracking-wider" style={{ color: s.color }}>{s.label}</span>
                    </div>
                    <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{colLeads.length}</span>
                  </div>
                  <div className="space-y-2">
                    {colLeads.map(l => {
                      return (
                      <div key={l.id} onClick={() => setEditing(l)} className="rounded-lg p-3 cursor-pointer" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                        <div className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold leading-snug truncate" style={{ color: 'var(--text)' }}>{l.businessName || l.name}</div>
                            {l.name && l.businessName && <div className="text-[11px] mt-0.5 truncate" style={{ color: 'var(--text-muted)' }}>{l.name}</div>}
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              <LeadTimestamp lead={l} compact />
                              <LastTouchPill lead={l} compact />
                            </div>
                          </div>
                          <LeadSignalBars lead={l} />
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {l.source && <span className="text-[10px] px-2 py-1 rounded-full" style={{ background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>{sourceLabel(l.source)}</span>}
                          {serviceLabelForLead(l) && <span className="text-[10px] px-2 py-1 rounded-full" style={{ background: 'var(--amber-soft)', color: 'var(--amber)', border: '1px solid var(--amber)' }}>{categoryLabel(serviceLabelForLead(l), l.brandContext || inferBrand(l))}</span>}
                        </div>
                        {(leadListNameForLead(l) || opportunityPipelineNameForLead(l) || l.opportunityId) && (
                          <div className="mt-2 rounded-lg px-2.5 py-2 text-[11px] leading-snug" style={{ background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                            {leadListNameForLead(l) && <div><span style={{ color: 'var(--green)', fontWeight: 700 }}>Lead List:</span> {leadListNameForLead(l)}</div>}
                            {opportunityPipelineNameForLead(l) && <div><span style={{ color: 'var(--accent)', fontWeight: 700 }}>Sales Pipeline:</span> {opportunityPipelineNameForLead(l)}</div>}
                            {l.opportunityId && <div><span style={{ color: 'var(--accent)', fontWeight: 700 }}>Opportunity:</span> {opportunitiesById.get(l.opportunityId)?.name || 'Linked'}</div>}
                          </div>
                        )}
                        <div className="mt-3" onClick={e => e.stopPropagation()}>
                          <ThemedSelect
                            style={cardSelectStyle}
                            value={l.status || 'new'}
                            onPointerDown={stopCardOpen}
                            onMouseDown={stopCardOpen}
                            onClick={stopCardOpen}
                            onChange={e => { e.stopPropagation(); setStatus(l, e.target.value) }}
                            aria-label={`Move ${l.businessName || l.name || 'lead'} status`}
                          >
                            {STATUS.map(status => <option key={status.id} value={status.id}>Move to {status.label}</option>)}
                          </ThemedSelect>
                        </div>
                        {l.status === 'converted' && l.convertedToAccountName && (
                          <div className="mt-3" onClick={e => e.stopPropagation()}>
                            <span className='text-[11px] font-semibold px-2 py-1 rounded-lg' title='This lead became an account'
                              style={{ background: 'var(--green-soft)', color: 'var(--green)', border: '1px solid var(--green)' }}>
                              &rarr; {l.convertedToAccountName}
                            </span>
                          </div>
                        )}
                        <div className="mt-3 flex justify-end flex-nowrap" style={{ minHeight: 34 }}>
                          {renderLeadActions(l)}
                        </div>
                      </div>
                      )
                    })}
                    {colLeads.length === 0 && <div className="text-[11px] text-center py-4" style={{ color: 'var(--text-muted)' }}>No leads</div>}
                  </div>
                </div>
              )
            })}
          </div>
          </>
        )}

      {adding && <LeadForm leadLists={leadLists} opportunities={opportunities} onSave={save} onClose={() => setAdding(false)} />}
      {editing && <LeadForm lead={editing} leadLists={leadLists} opportunities={opportunities} onSave={save} onClose={() => setEditing(null)} onQualify={l => { setEditing(null); setQualifying(l) }} onDelete={async id => { await del(id); setEditing(null) }} />}
      {emailing && <LeadEmailModal lead={emailing} onClose={() => setEmailing(null)} onSent={() => setStatus(emailing, 'contacted')} />}
      {scripting && (
        <LeadCallScripts
          lead={scripting}
          onClose={() => setScripting(null)}
          onContacted={() => setStatus(scripting, 'contacted')}
          onEmail={(l) => { setScripting(null); setEmailing(l) }}
        />
      )}
      {qualifying && <QualifyWizard lead={qualifying} pipelines={pipelines} onComplete={() => { setQualifying(null); refresh() }} onClose={() => setQualifying(null)} />}
    </div>
  )
}
