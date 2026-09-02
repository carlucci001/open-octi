'use client'
import ThemedSelect from '../components/ThemedSelect'
import { useState, useEffect, useMemo, useRef } from 'react'
import { marked } from 'marked'
import PageHeader from '../components/PageHeader'
import ViewModeToggle from '../components/ViewModeToggle'
import ComponentSettings, { useComponentSettings } from '../components/ComponentSettings'
import { Paginator, usePagination } from '../components/Paginator'
import BulkActionsMenu from '../components/BulkActionsMenu'
import ItemActionsMenu from '../components/ItemActionsMenu'
import { Code2, Copy as CopyIcon, Download, ExternalLink, FileSignature, FileText, Pencil, Send, Trash2 } from 'lucide-react'

function api(body) { return fetch('/api/documents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()) }
const fmtDate = d => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '-'

marked.setOptions({ breaks: true, gfm: true })

const ACTION_TONES = {
  accent: 'var(--accent)',
  amber: 'var(--amber)',
  danger: 'var(--red)',
  muted: 'var(--text-muted)',
}

function ActionIconButton({ label, icon: Icon, onClick, tone = 'muted', disabled = false, className = '' }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      className={`inline-grid place-items-center rounded-md ${className}`}
      style={{
        width: 30,
        height: 30,
        minWidth: 30,
        background: 'var(--surface2)',
        color: ACTION_TONES[tone] || ACTION_TONES.muted,
        border: '1px solid var(--border)',
        opacity: disabled ? 0.55 : 1,
      }}
      onPointerDown={e => e.stopPropagation()}
      onClick={e => {
        e.stopPropagation()
        if (!disabled) onClick?.(e)
      }}
    >
      <Icon size={15} strokeWidth={2.1} aria-hidden="true" />
    </button>
  )
}

const DOC_TYPE_LABELS = {
  'call-transcript': 'Transcript',
  agreement: 'Agreement',
  policy: 'Policy',
  addendum: 'Addendum',
  order_form: 'Order Form',
}

function docTypeLabel(doc = {}) {
  if (doc.type === 'transcript') return 'Transcript'
  return DOC_TYPE_LABELS[doc.docType] || DOC_TYPE_LABELS[doc.templateId] || doc.templateName || 'Document'
}

function isTranscriptDoc(doc = {}) {
  return doc.type === 'transcript' || doc.docType === 'call-transcript'
}

function docSnippet(doc = {}) {
  const text = String(doc.summary || doc.body || doc.content || '')
    .replace(/[#>*_`~-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text || 'No preview text available.'
}

function DocumentThumb({ doc, compact = false }) {
  const isTranscript = doc?.type === 'transcript' || doc?.docType === 'call-transcript'
  const accent = isTranscript ? 'var(--accent)' : docNeedsSignature(doc) ? 'var(--amber)' : 'var(--green)'
  return (
    <div
      style={{
        width: compact ? 42 : 58,
        height: compact ? 54 : 74,
        borderRadius: 6,
        background: 'linear-gradient(180deg, #fffaf3 0%, #f2eadf 100%)',
        border: '1px solid rgba(43,32,26,0.18)',
        boxShadow: '0 8px 18px rgba(43,32,26,0.10)',
        padding: compact ? 6 : 9,
        display: 'grid',
        alignContent: 'start',
        gap: compact ? 4 : 5,
        flex: '0 0 auto',
      }}
      aria-hidden="true"
    >
      <div style={{ height: compact ? 6 : 7, borderRadius: 2, background: accent, width: '68%' }} />
      <div style={{ height: 3, borderRadius: 2, background: '#8a7a69', opacity: 0.75, width: '88%' }} />
      <div style={{ height: 3, borderRadius: 2, background: '#b9aa99', width: '100%' }} />
      <div style={{ height: 3, borderRadius: 2, background: '#b9aa99', width: '76%' }} />
      {!compact && <div style={{ marginTop: 'auto', height: 1, background: '#cbbdab', width: '100%' }} />}
    </div>
  )
}

// Wrap rendered markdown in inline-styled HTML that survives a paste into Gmail / Outlook.
function renderEmailHtml(body, title) {
  const inner = marked.parse(body || '')
  return `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.55;color:#111;max-width:720px;">
${title ? `<h1 style="font-size:20px;font-weight:700;margin:0 0 16px;color:#0A0B0D;">${title}</h1>` : ''}
${inner}
</div>`.replace(/<h1([^>]*)>/g, '<h1 style="font-size:18px;font-weight:700;margin:20px 0 10px;color:#0A0B0D;"$1>')
       .replace(/<h2([^>]*)>/g, '<h2 style="font-size:16px;font-weight:600;margin:18px 0 8px;color:#0A0B0D;"$1>')
       .replace(/<h3([^>]*)>/g, '<h3 style="font-size:14px;font-weight:600;margin:14px 0 6px;color:#0A0B0D;"$1>')
       .replace(/<p>/g, '<p style="margin:0 0 12px;">')
       .replace(/<ul>/g, '<ul style="margin:0 0 12px 20px;padding:0;">')
       .replace(/<ol>/g, '<ol style="margin:0 0 12px 20px;padding:0;">')
       .replace(/<li>/g, '<li style="margin:4px 0;">')
       .replace(/<strong>/g, '<strong style="font-weight:600;">')
}

async function copyAsHtml(html) {
  const plain = html.replace(/<[^>]+>/g, '').replace(/\n{3,}/g, '\n\n')
  if (navigator.clipboard && window.ClipboardItem) {
    const item = new ClipboardItem({
      'text/html': new Blob([html], { type: 'text/html' }),
      'text/plain': new Blob([plain], { type: 'text/plain' }),
    })
    await navigator.clipboard.write([item])
    return true
  }
  await navigator.clipboard.writeText(html)
  return false
}

const STATUS_COLORS = {
  draft:    { bg: 'rgba(148,163,184,0.18)', fg: 'var(--text-muted)' },
  sent:     { bg: 'rgba(137,180,250,0.18)', fg: 'var(--accent)' },
  signed:   { bg: 'rgba(166,227,161,0.18)', fg: 'var(--green)' },
  active:   { bg: 'rgba(166,227,161,0.18)', fg: 'var(--green)' },
  archived: { bg: 'rgba(148,163,184,0.18)', fg: 'var(--text-muted)' },
  pending:  { bg: 'rgba(137,180,250,0.18)', fg: 'var(--accent)' },
  required: { bg: 'rgba(245,158,11,0.15)', fg: 'var(--amber)' },
  expired:  { bg: 'rgba(239,68,68,0.14)', fg: 'var(--red)' },
  voided:   { bg: 'rgba(148,163,184,0.18)', fg: 'var(--text-muted)' },
  email_failed: { bg: 'rgba(239,68,68,0.14)', fg: 'var(--red)' },
  not_requested: { bg: 'rgba(148,163,184,0.14)', fg: 'var(--text-muted)' },
}

const signatureState = (doc) => doc?.signature?.status || (doc?.requiresSignature ? 'required' : '')
const docNeedsSignature = (doc) => !!doc?.requiresSignature || !!signatureState(doc) || /signature\s*:/i.test(doc?.body || '') || /signed by both parties/i.test(doc?.body || '')

const EMPTY_SIGNATURE_DRAFT = { documentId: '', signerName: '', signerEmail: '' }

function signatureWorkflowState(doc = {}) {
  const sig = doc.signature || null
  if (sig?.status === 'pending' && sig.email && sig.email.ok === false) return 'email_failed'
  if (sig?.status === 'pending' && sig.expiresAt && new Date(sig.expiresAt).getTime() < Date.now()) return 'expired'
  if (sig?.status) return sig.status
  if (docNeedsSignature(doc)) return 'required'
  return 'not_requested'
}

function signatureStatusLabel(state) {
  return ({
    pending: 'Pending',
    signed: 'Signed',
    required: 'Required',
    expired: 'Expired',
    voided: 'Voided',
    email_failed: 'Email failed',
    not_requested: 'Not requested',
  })[state] || state
}

// Human labels for known placeholders
const LABELS = {
  effective_date: 'Effective date',
  state_of_governing_law: 'Governing law (state)',
  client_name: 'Client name',
  client_address: 'Client address',
  client_email: 'Client email',
  client_phone: 'Client phone',
  client_business_name: 'Client business name',
  client_website_url: 'Client website URL',
  contact_email: 'Contact email',
  scope_of_work: 'Scope of work (AI-expanded from your dictation)',
  scope_of_services: 'Scope of services (AI-expanded from your dictation)',
  total_fee: 'Total fee (e.g. $12,500)',
  payment_schedule: 'Payment schedule (e.g. 50% on signing, 50% on delivery)',
  timeline: 'Timeline (e.g. 8 weeks)',
  monthly_fee: 'Monthly fee (e.g. $1,200)',
  support_hours: 'Support hours per month',
  response_time_hours: 'Response time (hours)',
  covered_systems: 'Covered systems',
  covered_properties: 'Covered properties (sites/domains)',
  uptime_sla: 'Uptime SLA (e.g. 99.5%)',
  reserved_hours: 'Reserved hours per month',
  rollover_policy: 'Rollover policy (e.g. no rollover, or 50% rolls to next month)',
  revisions_included: 'Revisions included',
  deliverables: 'Deliverables (list)',
  project_name: 'Project name',
  msa_date: 'MSA date',
  purpose_of_disclosure: 'Purpose of disclosure (what you\'re exploring)',
  term_years: 'Term (years)',
  hourly_rate: 'Hourly rate (e.g. $175)',
  type_of_business: 'Client\'s type of business',
  data_handling_terms: 'Data handling terms (special requirements if any)',
  ai_features_list: 'AI features on the site',
  ai_providers_list: 'AI providers used',
  client_signer_name: 'Client signer name',
  client_signer_title: 'Client signer title',
  acceptance_period_days: 'Acceptance period (business days)',
  warranty_days: 'Warranty period (days)',
  liability_lookback_months: 'Liability cap lookback (months)',
  security_requirements: 'Security requirements',
  payment_terms: 'Payment terms',
  cancellation_terms: 'Cancellation terms',
  initial_term: 'Initial term',
  renewal_terms: 'Renewal terms',
  implementation_fee: 'Implementation fee',
  master_agreement_reference: 'Master agreement reference',
  dpa_reference: 'DPA / security addendum reference',
  overage_terms: 'Overage terms',
  response_time: 'Response time target',
  maintenance_window: 'Maintenance window',
  sla_credit_terms: 'SLA service credits',
  incident_contact_email: 'Incident contact email',
  processing_purpose: 'Processing purpose',
  personal_data_categories: 'Personal data categories',
  data_subject_categories: 'Data subject categories',
  special_category_data_notes: 'Sensitive data notes',
  security_measures: 'Security measures',
  subprocessor_list: 'Subprocessor list',
  transfer_mechanism: 'Transfer mechanism',
  breach_notice_hours: 'Breach notice (hours)',
  return_delete_days: 'Return/delete timing (days)',
  audit_terms: 'Audit terms',
}

const SCOPE_KEYS = ['scope_of_work','scope_of_services']
const FORM_FIELD_TYPES = ['text', 'email', 'phone', 'textarea', 'select', 'checkbox', 'date', 'number']
const EMPTY_FORM_FIELD = { label: 'Name', key: 'name', type: 'text', required: true, options: '' }
const EMPTY_FORM_DRAFT = {
  id: '',
  title: '',
  description: '',
  status: 'draft',
  destination: 'leads',
  automation: '',
  fields: [EMPTY_FORM_FIELD],
}

export default function DocumentsManager({ clientId: lockedClientId = '', lockClient = false } = {}) {
  const [templates, setTemplates] = useState([])
  const [documents, setDocuments] = useState([])
  const [forms, setForms] = useState([])
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [clientFilter, setClientFilter] = useState('all')
  const [docTypeFilter, setDocTypeFilter] = useState('all')
  const [sortBy, setSortBy] = useState('newest')
  const [documentView, setDocumentView] = useState('list')
  const [selectedDocs, setSelectedDocs] = useState([])
  const [templateSearch, setTemplateSearch] = useState('')
  const [templateCategory, setTemplateCategory] = useState('all')
  const [templateView, setTemplateView] = useState('list')
  const [templateSort, setTemplateSort] = useState('name')
  const [selectedTemplates, setSelectedTemplates] = useState([])
  const [formSearch, setFormSearch] = useState('')
  const [formStatusFilter, setFormStatusFilter] = useState('all')
  const [formView, setFormView] = useState('list')
  const [selectedForms, setSelectedForms] = useState([])
  const [formEditorOpen, setFormEditorOpen] = useState(false)
  const [formDraft, setFormDraft] = useState(EMPTY_FORM_DRAFT)
  const [formPreview, setFormPreview] = useState(null)
  const [toast, setToast] = useState({ msg: '', kind: 'info' })

  const [showForm, setShowForm] = useState(false)
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [selectedClientId, setSelectedClientId] = useState('')
  const [fields, setFields] = useState({})
  const [dictation, setDictation] = useState('')
  const [draftBody, setDraftBody] = useState('')
  const [draftAiInstruction, setDraftAiInstruction] = useState('')
  const [draftAiBusy, setDraftAiBusy] = useState(false)
  const [draftSel, setDraftSel] = useState({ start: 0, end: 0 })
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [viewDoc, setViewDoc] = useState(null)
  const [viewMode, setViewMode] = useState('formatted') // 'formatted' | 'raw'
  const [sendingDoc, setSendingDoc] = useState(false)
  const [signingDocId, setSigningDocId] = useState('')
  const [lastSignaturePayload, setLastSignaturePayload] = useState(null)
  const [signatureRequestOpen, setSignatureRequestOpen] = useState(false)
  const [signatureDraft, setSignatureDraft] = useState(EMPTY_SIGNATURE_DRAFT)
  const [eSignConfig, setESignConfig] = useState({ configured: true, missing: [], message: '' })
  const [docEditMode, setDocEditMode] = useState(false)
  const [docDraftBody, setDocDraftBody] = useState('')
  const [docAiInstruction, setDocAiInstruction] = useState('')
  const [docAiBusy, setDocAiBusy] = useState(false)
  const [docSel, setDocSel] = useState({ start: 0, end: 0 })
  const [docSaving, setDocSaving] = useState(false)

  const [viewTab, setViewTab] = useState('documents') // 'documents' | 'esignatures' | 'forms' | 'transcripts' | 'templates'
  const [tplPreview, setTplPreview] = useState(null) // { id, name, body, rawBody } - body is filled preview, rawBody is source
  const [tplLoading, setTplLoading] = useState(false)
  const [tplClientId, setTplClientId] = useState('')
  const [tplMode, setTplMode] = useState('preview') // 'preview' | 'edit'
  const [tplDraft, setTplDraft] = useState('')
  const [tplSaving, setTplSaving] = useState(false)
  const [newTplOpen, setNewTplOpen] = useState(false)
  const [newTplMode, setNewTplMode] = useState('wizard') // 'wizard' | 'manual'
  const [newTpl, setNewTpl] = useState({ name: '', category: 'Custom', description: '', body: '', requiresSignature: true })
  const [tplWizard, setTplWizard] = useState({
    baseTemplateId: '',
    title: '',
    docType: 'agreement', // agreement | policy | addendum | order_form
    providerName: 'Farrington Development LLC',
    counterpartyLabel: 'Client', // Client | Customer | Counterparty | Licensee | Subscriber | etc.
    scopeStyle: 'work', // work | services
    pricingModel: 'fixed', // fixed | hourly | subscription | usage | none
    termStyle: 'fixed', // fixed | month_to_month | project
    deploymentModel: 'n_a', // hosted | on_prem | hybrid | n_a
    signatureMode: 'both', // both | client_only | none
    includeScope: true,
    includeFees: true,
    includeTerm: true,
    includeSupport: true,
    includeLicensing: false,
    includeDataSecurity: true,
    includeIndemnity: true,
    specialRisks: '',
  })
  const [tplWizardAiBusy, setTplWizardAiBusy] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  const [aiInstruction, setAiInstruction] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const [lastSel, setLastSel] = useState({ start: 0, end: 0 })
  const textareaRef = useRef(null)
  const aiInputRef = useRef(null)
  const draftTextareaRef = useRef(null)
  const docTextareaRef = useRef(null)

  const openAI = () => {
    if (tplMode === 'preview') { setTplMode('edit'); setTplDraft(tplPreview?.rawBody || tplDraft) }
    setAiOpen(true)
    setTimeout(() => aiInputRef.current?.focus(), 50)
  }

  const askAI = async () => {
    if (!aiInstruction.trim() || !tplPreview?.id) return
    const { start, end } = lastSel
    const selection = (start !== end) ? tplDraft.slice(start, end) : ''
    setAiBusy(true)
    const r = await api({ action: 'ai_edit', body: tplDraft, selection, instruction: aiInstruction })
    setAiBusy(false)
    if (r.error) { flash(r.error, 'error'); return }
    if (r.scope === 'selection' && selection) {
      setTplDraft(tplDraft.slice(0, start) + r.replacement + tplDraft.slice(end))
      flash('Rewrote selection', 'success')
    } else {
      setTplDraft(r.replacement)
      flash('Rewrote template', 'success')
    }
    setAiInstruction('')
    setLastSel({ start: 0, end: 0 })
    setAiOpen(false)
  }

  const applyDraftAI = async () => {
    if (!draftAiInstruction.trim() || !draftBody) return
    const { start, end } = draftSel
    const selection = start !== end ? draftBody.slice(start, end) : ''
    setDraftAiBusy(true)
    const r = await api({ action: 'ai_edit', body: draftBody, selection, instruction: draftAiInstruction })
    setDraftAiBusy(false)
    if (r.error) { flash(r.error, 'error'); return }
    if (r.scope === 'selection' && selection) {
      setDraftBody(draftBody.slice(0, start) + r.replacement + draftBody.slice(end))
      flash('Updated selected text', 'success')
    } else {
      setDraftBody(r.replacement)
      flash('Updated full draft', 'success')
    }
    setDraftAiInstruction('')
    setDraftSel({ start: 0, end: 0 })
  }

  const applyDocAI = async () => {
    if (!docAiInstruction.trim() || !docDraftBody) return
    const { start, end } = docSel
    const selection = start !== end ? docDraftBody.slice(start, end) : ''
    setDocAiBusy(true)
    const r = await api({ action: 'ai_edit', body: docDraftBody, selection, instruction: docAiInstruction })
    setDocAiBusy(false)
    if (r.error) { flash(r.error, 'error'); return }
    if (r.scope === 'selection' && selection) {
      setDocDraftBody(docDraftBody.slice(0, start) + r.replacement + docDraftBody.slice(end))
      flash('Updated selected text', 'success')
    } else {
      setDocDraftBody(r.replacement)
      flash('Updated full document', 'success')
    }
    setDocAiInstruction('')
    setDocSel({ start: 0, end: 0 })
  }

  const flash = (m, kind='info') => { setToast({ msg: m, kind }); if (kind !== 'error') setTimeout(() => setToast({ msg:'', kind:'info' }), 3000) }
  const clearToast = () => setToast({ msg:'', kind:'info' })

  const load = () => {
    const qs = lockClient && lockedClientId ? `?clientId=${encodeURIComponent(lockedClientId)}` : ''
    return Promise.all([
      fetch('/api/documents' + qs).then(r => r.json()),
      fetch('/api/clients').then(r => r.json()),
    ]).then(([d, c]) => {
      setDocuments(d.documents || [])
      setTemplates(d.templates || [])
      setForms(d.forms || [])
      setESignConfig(d.eSign || { configured: true, missing: [], message: '' })
      setClients(c.clients || [])
      setLoading(false)
    })
  }

  useEffect(() => {
    if (lockClient && lockedClientId) setSelectedClientId(lockedClientId)
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockedClientId, lockClient])

  const resetForm = () => {
    setSelectedTemplateId('')
    setSelectedClientId(lockClient ? lockedClientId : '')
    setFields({})
    setDictation('')
    setDraftBody('')
    setDraftAiInstruction('')
    setDraftSel({ start: 0, end: 0 })
  }

  const selectedTemplate = useMemo(() => templates.find(t => t.id === selectedTemplateId), [templates, selectedTemplateId])
  const selectedClient = useMemo(() => clients.find(c => c.id === (lockClient ? lockedClientId : selectedClientId)), [clients, selectedClientId, lockedClientId, lockClient])
  const scopeKey = useMemo(() => {
    if (!selectedTemplate) return null
    return SCOPE_KEYS.find(k => selectedTemplate.placeholders.includes(k)) || null
  }, [selectedTemplate])

  // When template/client changes, prefill fields with sensible defaults
  useEffect(() => {
    if (!selectedTemplate) { setFields({}); return }
    const today = new Date().toISOString().slice(0, 10)
    const defaults = {
      effective_date: today,
      state_of_governing_law: 'North Carolina',
      term_years: '2',
      client_name: selectedClient?.name || '',
      client_address: selectedClient?.address || '',
      client_email: selectedClient?.email || '',
      client_phone: selectedClient?.phone || '',
      client_business_name: selectedClient?.name || '',
      contact_email: selectedClient?.email || '',
    }
    const next = {}
    for (const p of selectedTemplate.placeholders) {
      next[p] = defaults[p] || ''
    }
    setFields(next)
  }, [selectedTemplateId, selectedClientId])

  const updateField = (k, v) => setFields(f => ({ ...f, [k]: v }))

  const generate = async () => {
    if (!selectedTemplate) { flash('Pick a template first', 'error'); return }
    setGenerating(true)
    try {
      const r = await api({
        action: 'generate',
        templateId: selectedTemplate.id,
        clientId: (lockClient ? lockedClientId : selectedClientId) || null,
        fields,
        dictation: scopeKey ? dictation : '',
      })
      if (r.error) { flash(r.error, 'error'); setGenerating(false); return }
      setDraftBody(r.draft)
      // Merge AI-generated scope back into fields so it persists if user regenerates
      if (scopeKey && r.values?.[scopeKey]) setFields(f => ({ ...f, [scopeKey]: r.values[scopeKey] }))
      flash('Draft generated', 'success')
    } catch (e) { flash(e.message, 'error') }
    setGenerating(false)
  }

  const save = async () => {
    if (!draftBody) { flash('Generate the draft first', 'error'); return }
    setSaving(true)
    try {
      const r = await api({
        action: 'save',
        templateId: selectedTemplate.id,
        templateName: selectedTemplate.name,
        title: `${selectedTemplate.name}${selectedClient ? ' - ' + selectedClient.name : ''}`,
        clientId: lockClient ? lockedClientId : selectedClientId,
        clientName: selectedClient?.name || fields.client_name || '',
        body: draftBody,
        values: fields,
        status: 'draft',
      })
      if (r.error) { flash(r.error, 'error'); setSaving(false); return }
      flash(`Document saved`, 'success')
      await load()
      resetForm()
      setShowForm(false)
    } catch (e) { flash(e.message, 'error') }
    setSaving(false)
  }

  const downloadPdf = async (id) => {
    const res = await fetch('/api/documents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'pdf', id }) })
    if (!res.ok) { flash('PDF generation failed', 'error'); return }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const doc = documents.find(d => d.id === id)
    a.href = url
    a.download = `${doc?.templateId || 'document'}-${(doc?.clientName || 'client').replace(/\s+/g,'-').toLowerCase()}.pdf`
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const setStatus = async (id, status) => {
    const r = await api({ action: 'set_status', id, status })
    if (r.error) { flash(r.error, 'error'); return }
    setDocuments(ds => ds.map(d => d.id === id ? r.document : d))
    flash(`Marked ${status}`, 'success')
  }

  const deleteDoc = async (id) => {
    if (!confirm('Delete this document?')) return
    const r = await api({ action: 'delete', id })
    if (r.error) { flash(r.error, 'error'); return }
    setDocuments(ds => ds.filter(d => d.id !== id))
    setSelectedDocs(ids => ids.filter(x => x !== id))
    flash('Deleted', 'success')
  }

  const duplicateDoc = async (id) => {
    const r = await api({ action: 'duplicate', id })
    if (r.error) { flash(r.error, 'error'); return }
    setDocuments(ds => [r.document, ...ds])
    flash('Document copied', 'success')
  }

  // Portal share gate: a document reaches the client portal only while
  // portalVisible === true (app/api/portal/documents/route.js). Creating or
  // filing a document never shares it - this control is the only way in.
  const setPortalShare = async (doc, next) => {
    const r = await api({ action: 'update', document: { id: doc.id, portalVisible: next === true } })
    if (r.error) { flash(r.error, 'error'); return }
    setDocuments(ds => ds.map(d => d.id === doc.id ? r.document : d))
    setViewDoc(v => (v && v.id === doc.id ? r.document : v))
    flash(next === true ? 'Shared with client' : 'No longer shared with client', 'success')
  }

  const batchDeleteDocs = async () => {
    if (!selectedDocs.length) return
    if (!confirm(`Delete ${selectedDocs.length} selected document${selectedDocs.length === 1 ? '' : 's'}?`)) return
    const r = await api({ action: 'batch_delete', ids: selectedDocs })
    if (r.error) { flash(r.error, 'error'); return }
    setDocuments(ds => ds.filter(d => !selectedDocs.includes(d.id)))
    setSelectedDocs([])
    flash(`Deleted ${r.deleted || 0} document${(r.deleted || 0) === 1 ? '' : 's'}`, 'success')
  }

  const newFormDraft = () => ({
    ...EMPTY_FORM_DRAFT,
    fields: [{ ...EMPTY_FORM_FIELD }],
  })

  const openNewForm = () => {
    setFormDraft(newFormDraft())
    setFormEditorOpen(true)
  }

  const openFormEditor = (form) => {
    setFormDraft({
      ...newFormDraft(),
      ...form,
      fields: (form.fields?.length ? form.fields : [EMPTY_FORM_FIELD]).map(f => ({ ...EMPTY_FORM_FIELD, ...f })),
    })
    setFormEditorOpen(true)
  }

  const openFormPreview = (form) => {
    setFormPreview({
      ...form,
      fields: (form.fields?.length ? form.fields : []).map(f => ({ ...EMPTY_FORM_FIELD, ...f })),
      publicUrl: form.publicUrl || (form.id ? `/forms/${form.id}` : ''),
    })
  }

  const updateFormField = (index, key, value) => {
    setFormDraft(form => ({
      ...form,
      fields: form.fields.map((field, i) => i === index ? { ...field, [key]: value } : field),
    }))
  }

  const addFormField = () => setFormDraft(form => ({ ...form, fields: [...form.fields, { ...EMPTY_FORM_FIELD, label: 'New field', key: `field_${form.fields.length + 1}`, required: false }] }))
  const removeFormField = (index) => setFormDraft(form => ({ ...form, fields: form.fields.filter((_, i) => i !== index) }))

  const saveFormDraft = async () => {
    if (!formDraft.title.trim()) { flash('Form title required', 'error'); return }
    const action = formDraft.id ? 'update_form' : 'create_form'
    const r = await api({ action, form: formDraft })
    if (r.error) { flash(r.error, 'error'); return }
    setForms(fs => formDraft.id ? fs.map(f => f.id === r.form.id ? r.form : f) : [r.form, ...fs])
    setFormEditorOpen(false)
    setFormDraft(newFormDraft())
    flash(formDraft.id ? 'Form updated' : 'Form created', 'success')
  }

  const duplicateForm = async (id) => {
    const r = await api({ action: 'duplicate_form', id })
    if (r.error) { flash(r.error, 'error'); return }
    setForms(fs => [r.form, ...fs])
    flash('Form copied', 'success')
  }

  const deleteForm = async (id) => {
    if (!confirm('Delete this form? Existing submissions remain in the audit store.')) return
    const r = await api({ action: 'delete_form', id })
    if (r.error) { flash(r.error, 'error'); return }
    setForms(fs => fs.filter(f => f.id !== id))
    setSelectedForms(ids => ids.filter(x => x !== id))
    flash('Form deleted', 'success')
  }

  const batchDeleteForms = async () => {
    if (!selectedForms.length) return
    if (!confirm(`Delete ${selectedForms.length} selected form${selectedForms.length === 1 ? '' : 's'}?`)) return
    const r = await api({ action: 'batch_delete_forms', ids: selectedForms })
    if (r.error) { flash(r.error, 'error'); return }
    setForms(fs => fs.filter(f => !selectedForms.includes(f.id)))
    setSelectedForms([])
    flash(`Deleted ${r.deleted || 0} form${(r.deleted || 0) === 1 ? '' : 's'}`, 'success')
  }

  const loadTplPreview = async (templateId, name, clientId) => {
    setTplLoading(true)
    const [rawRes, previewRes] = await Promise.all([
      api({ action: 'get_template', templateId }),
      api({ action: 'preview_template', templateId, clientId: clientId || null }),
    ])
    setTplLoading(false)
    if (rawRes.error || previewRes.error) { flash(rawRes.error || previewRes.error, 'error'); setTplPreview(null); return }
    setTplPreview({ id: templateId, name, body: previewRes.template.body, rawBody: rawRes.template.body })
    setTplDraft(rawRes.template.body)
  }

  const openTemplate = (t) => {
    setTplPreview({ id: t.id, name: t.name, body: '', rawBody: '' })
    setTplMode('preview')
    loadTplPreview(t.id, t.name, tplClientId)
  }

  useEffect(() => {
    if (tplPreview?.id) loadTplPreview(tplPreview.id, tplPreview.name, tplClientId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tplClientId])

  const saveTemplate = async () => {
    if (!tplPreview?.id) return
    setTplSaving(true)
    const r = await api({ action: 'save_template', templateId: tplPreview.id, body: tplDraft })
    setTplSaving(false)
    if (r.error) { flash(r.error, 'error'); return }
    flash('Template saved (backup: ' + r.backup + ')', 'success')
    await loadTplPreview(tplPreview.id, tplPreview.name, tplClientId)
    setTplMode('preview')
  }

  const createTemplate = async () => {
    if (!newTpl.name.trim()) { flash('Template name required', 'error'); return }
    const r = await api({ action: 'create_template', ...newTpl })
    if (r.error) { flash(r.error, 'error'); return }
    flash('Template created', 'success')
    setNewTplOpen(false)
    setNewTplMode('wizard')
    setNewTpl({ name: '', category: 'Custom', description: '', body: '', requiresSignature: true })
    setTplWizard({
      baseTemplateId: '',
      title: '',
      includeScope: true,
      includeFees: true,
      includeTerm: true,
      includeSupport: true,
      includeLicensing: false,
      includeDataSecurity: true,
      includeIndemnity: true,
      specialRisks: '',
    })
    await load()
    openTemplate(r.template)
  }

  const duplicateTemplate = async (t) => {
    const r = await api({ action: 'duplicate_template', templateId: t.id, name: `${t.name} Copy` })
    if (r.error) { flash(r.error, 'error'); return }
    flash('Template duplicated', 'success')
    await load()
    openTemplate(r.template)
  }

  const deleteTemplate = async (t) => {
    if (!confirm(`Delete template "${t.name}"? The markdown file will be renamed as a backup, not wiped.`)) return
    const r = await api({ action: 'delete_template', templateId: t.id })
    if (r.error) { flash(r.error, 'error'); return }
    flash('Template deleted; backup kept', 'success')
    setSelectedTemplates(ids => ids.filter(id => id !== t.id))
    if (tplPreview?.id === t.id) setTplPreview(null)
    await load()
  }

  const batchDeleteTemplates = async () => {
    if (!selectedTemplates.length) return
    if (!confirm(`Delete ${selectedTemplates.length} selected template${selectedTemplates.length === 1 ? '' : 's'}? Template files will be renamed as backups, not wiped.`)) return
    const r = await api({ action: 'batch_delete_templates', templateIds: selectedTemplates })
    if (r.error) { flash(r.error, 'error'); return }
    if (tplPreview && selectedTemplates.includes(tplPreview.id)) setTplPreview(null)
    setSelectedTemplates([])
    flash(`Deleted ${r.deleted || 0} template${(r.deleted || 0) === 1 ? '' : 's'}; backups kept`, 'success')
    await load()
  }

  const WIZARD_BASE_OPTIONS = [
    { id: '', label: 'Start from scratch' },
    { id: 'nda-mutual', label: 'Mutual NDA' },
    { id: 'msa', label: 'Master Services Agreement (MSA)' },
    { id: 'sow', label: 'Statement of Work (SOW)' },
    { id: 'maintenance-support', label: 'Maintenance & Support Agreement' },
    { id: 'hosting', label: 'Hosting & Managed Services Agreement' },
    { id: 'order-form-subscription', label: 'Order Form (Subscription / Managed Services)' },
    { id: 'service-level-agreement-exhibit', label: 'SLA Exhibit' },
    { id: 'data-processing-addendum', label: 'Data Processing Addendum (DPA)' },
    { id: 'command-center-commercial-source-license', label: 'Commercial Source License' },
    { id: 'command-center-enterprise-on-prem-license', label: 'Enterprise On-Prem License' },
    { id: 'command-center-managed-subscription-license', label: 'Managed Subscription License' },
    { id: 'agent-lease-agreement', label: 'AI Agent Lease Agreement' },
    { id: 'open-source-release-addendum', label: 'Open Source Release Addendum' },
  ]

  const DEFAULT_NOTICE = `> **LEGAL NOTICE (TEMPLATE - NOT LEGAL ADVICE):** This document is a starting template, not a finished legal contract. Have a licensed attorney review and customize before use. Remove any internal/template notes before sending for signature. Farrington Development LLC and any AI that filled in this template are not your lawyers.\n\n---\n\n`

  const setFirstHeading = (body, title) => {
    const t = String(title || '').trim()
    if (!t) return String(body || '')
    const text = String(body || '')
    if (/^\s*#\s+[^\n]+\n/.test(text)) return text.replace(/^\s*#\s+[^\n]+\n/, `# ${t}\n`)
    return `# ${t}\n\n${text}`
  }

  const appendTemplateNotes = (body, risks) => {
    const r = String(risks || '').trim()
    if (!r) return String(body || '')
    const text = String(body || '')
    const marker = '## Template Notes'
    const lines = r.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    const bullets = lines.map(l => `- ${l}`).join('\n')
    if (text.includes(marker)) {
      return text.replace(marker, `${marker}\n- Special risks / review focus:\n${bullets}\n`)
    }
    return `${text}\n\n---\n\n## Template Notes (Remove before sending)\n- Special risks / review focus:\n${bullets}\n`
  }

  const generateScratchTemplate = (w, name) => {
    const title = String(w?.title || name || (w?.docType === 'policy' ? 'Policy Template' : 'Agreement Template')).trim()
    const providerName = String(w?.providerName || 'Farrington Development LLC').trim() || 'Farrington Development LLC'
    const counterpartyLabel = String(w?.counterpartyLabel || 'Client').trim() || 'Client'
    const scopeKey = w?.scopeStyle === 'services' ? 'scope_of_services' : 'scope_of_work'
    const blocks = []
    blocks.push(DEFAULT_NOTICE)
    blocks.push(`# ${title}\n`)
    if (w?.docType === 'policy') {
      blocks.push(`This Policy is effective as of **{{effective_date}}** and applies to **{{client_business_name}}** and its services.\n`)
      blocks.push('## Purpose\n[Explain what this policy covers and who it applies to.]\n')
      if (w?.includeScope) blocks.push(`## Scope\n{{${scopeKey}}}\n`)
      blocks.push('## Disclosures\n[Explain key disclosures in plain language.]\n')
      blocks.push('## Contact\nContact: {{contact_email}}\n')
    } else {
      blocks.push(`This Agreement ("Agreement") is entered into as of **{{effective_date}}** ("Effective Date") by and between **${providerName}** ("Provider") and **{{client_name}}** ("${counterpartyLabel}").\n`)
      blocks.push('## Recitals\nA. [Background / context]\nB. [Purpose of the relationship]\nC. The Parties agree as follows.\n')
      blocks.push('## Definitions\n[Define key terms used in the Agreement.]\n')
      if (w?.includeScope) blocks.push(`## Scope\n{{${scopeKey}}}\n`)
      if (w?.includeFees) {
        if (w?.pricingModel === 'hourly') blocks.push('## Fees; Payment\n- Hourly rate: {{hourly_rate}}\n- Billing increment: [e.g., 15 minutes]\n- Invoicing cadence: [e.g., monthly]\n')
        else if (w?.pricingModel === 'subscription') blocks.push('## Fees; Payment\n- Monthly fee: {{monthly_fee}}\n- Payment terms: {{payment_terms}}\n- Overage terms (if any): {{overage_terms}}\n')
        else if (w?.pricingModel === 'usage') blocks.push('## Fees; Payment\n- Base fee (if any): {{monthly_fee}}\n- Usage metric: {{usage_metric}}\n- Included units: {{included_units}}\n- Overage rate: {{overage_rate}}\n')
        else if (w?.pricingModel !== 'none') blocks.push('## Fees; Payment\n- Fees: {{total_fee}}\n- Payment schedule: {{payment_schedule}}\n- Taxes: [Who pays applicable taxes]\n')
      }
      if (w?.includeTerm) {
        if (w?.termStyle === 'month_to_month') blocks.push('## Term; Termination\n- Term: month-to-month\n- Cancellation: {{cancellation_terms}}\n')
        else if (w?.termStyle === 'project') blocks.push('## Term; Termination\n- Term: until completion of the scope\n- Termination: [for cause / for convenience]\n')
        else blocks.push('## Term; Termination\n- Initial term: {{initial_term}}\n- Renewal: {{renewal_terms}}\n- Termination: [for cause / for convenience]\n')
      }
      if (w?.includeSupport) blocks.push('## Support (Optional)\nSupport plan: {{support_plan}}\nResponse time: {{response_time}}\n')
      if (w?.includeLicensing) {
        const dm = (w?.deploymentModel && w.deploymentModel !== 'n_a') ? `\nIntended deployment model (wizard): ${w.deploymentModel}\n` : ''
        blocks.push(`## License Scope (Optional)\nDeployment model: {{deployment_model}}${dm}\nUsage/seats/users: {{max_users}}\n`)
      }
      blocks.push('## Confidentiality\n[Define confidential information, obligations, exclusions, and survival.]\n')
      blocks.push('## Intellectual Property; License\n[Work product ownership, provider retained IP, third-party/open-source components.]\n')
      if (w?.includeDataSecurity) blocks.push('## Data; Privacy; Security\nSecurity and compliance requirements (if any): {{security_requirements}}\n')
      blocks.push('## Warranties; Disclaimer\n[Express warranties if any; otherwise AS IS / AS AVAILABLE.]\n')
      blocks.push('## Limitation of Liability\nProvider total liability cap: {{liability_period}} (e.g., 12 months) lookback.\nNo indirect or consequential damages.\n')
      if (w?.includeIndemnity) blocks.push('## Indemnity (Optional - Attorney Review)\n[Insert deal-specific indemnity language; counsel review recommended.]\n')
      blocks.push('## Governing Law; Venue\n{{state_of_governing_law}}\n')

      if (w?.signatureMode !== 'none') {
        const clientLabel = counterpartyLabel.toUpperCase()
        if (w?.signatureMode === 'client_only') {
          blocks.push(`---\n\n**${clientLabel} ({{client_name}})**\n\nBy: _______________________________  Date: ____________  \nName: {{client_signer_name}}  \nTitle: {{client_signer_title}}\n`)
        } else {
          const providerIsFarrington = /farrington\s+development/i.test(providerName)
          const providerSigner = providerIsFarrington
            ? 'Name: Carl Farrington  \nTitle: Owner'
            : 'Name: [Provider signer name]  \nTitle: [Provider signer title]'
          blocks.push(`---\n\n**PROVIDER (${providerName})**\n\nBy: _______________________________  Date: ____________  \n${providerSigner}\n\n**${clientLabel} ({{client_name}})**\n\nBy: _______________________________  Date: ____________  \nName: {{client_signer_name}}  \nTitle: {{client_signer_title}}\n`)
        }
      }
    }

    blocks.push('\n---\n\n## Template Notes (Remove before sending)\n- Confirm commercial terms, liability cap, and any carve-outs with counsel.\n')
    return blocks.join('\n')
  }

  const generateWizardBody = async () => {
    const baseId = String(tplWizard.baseTemplateId || '').trim()
    const title = (tplWizard.title || newTpl.name || '').trim()
    try {
      let body = ''
      if (baseId) {
        const res = await api({ action: 'get_template', templateId: baseId })
        if (res?.error) throw new Error(res.error)
        body = res?.template?.body || ''
      } else {
        body = generateScratchTemplate(tplWizard, newTpl.name)
      }
      if (!String(body || '').startsWith('> **LEGAL NOTICE')) body = DEFAULT_NOTICE + body
      body = setFirstHeading(body, title)
      body = appendTemplateNotes(body, tplWizard.specialRisks)
      setNewTpl(t => ({ ...t, body, requiresSignature: tplWizard.signatureMode !== 'none' }))
      flash('Wizard draft generated', 'success')
    } catch (e) {
      flash(e.message || 'Failed to generate wizard draft', 'error')
    }
  }

  const generateWizardBodyAI = async () => {
    const baseId = String(tplWizard.baseTemplateId || '').trim()
    const title = (tplWizard.title || newTpl.name || '').trim()
    setTplWizardAiBusy(true)
    try {
      const r = await api({ action: 'ai_generate_template', wizard: tplWizard, baseTemplateId: baseId, title, name: newTpl.name })
      if (r?.error) throw new Error(r.error)
      let body = r?.body || ''
      if (!String(body || '').startsWith('> **LEGAL NOTICE')) body = DEFAULT_NOTICE + body
      body = setFirstHeading(body, title)
      body = appendTemplateNotes(body, tplWizard.specialRisks)
      setNewTpl(t => ({ ...t, body, requiresSignature: tplWizard.signatureMode !== 'none' }))
      flash('AI wizard draft generated', 'success')
    } catch (e) {
      flash(e.message || 'Failed to generate AI wizard draft', 'error')
    }
    setTplWizardAiBusy(false)
  }

  const sendDoc = async (doc) => {
    const client = clients.find(c => c.id === doc.clientId)
    const email = client?.email || doc.values?.client_email
    if (!email) { flash('No email address on file for this client', 'error'); return }
    setSendingDoc(true)
    try {
      const html = /^\s*</.test(doc.body || '') ? doc.body : renderEmailHtml(doc.body, doc.title)
      const r = await fetch('/api/tools/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: email, subject: doc.title, html }),
      }).then(r => r.json())
      if (!r.ok) { flash(r.error || 'Send failed', 'error'); setSendingDoc(false); return }
      await setStatus(doc.id, 'sent')
      setViewDoc(d => d ? { ...d, status: 'sent' } : null)
      flash(`Sent to ${email}`, 'success')
    } catch(e) { flash(e.message, 'error') }
    setSendingDoc(false)
  }

  const sendSignatureRequest = async (doc, options = {}) => {
    const client = clients.find(c => c.id === doc.clientId)
    const signerEmail = String(options.signerEmail ?? client?.email ?? doc.values?.client_email ?? '').trim()
    const signerName = String(options.signerName ?? doc.clientName ?? client?.name ?? doc.values?.client_name ?? '').trim()
    if (!signerEmail) { flash('No signer email on file for this client', 'error'); return false }
    setSigningDocId(doc.id)
    try {
      const r = await api({ action: 'send_signature_request', id: doc.id, signerEmail, signerName, force: options.force ?? docNeedsSignature(doc) })
      if (r.error) { flash(r.error, 'error'); return false }
      setDocuments(ds => ds.map(d => d.id === doc.id ? r.document : d))
      setViewDoc(r.document)
      setLastSignaturePayload(r.payload || { signUrl: r.signUrl, signerName, signerEmail, documentId: doc.id, title: doc.title })
      flash(r.email?.ok ? `Signature link sent to ${signerEmail}` : 'Sign link created, but email failed', r.email?.ok ? 'success' : 'error')
      return true
    } catch(e) {
      flash(e.message, 'error')
      return false
    } finally {
      setSigningDocId('')
    }
  }

  const saveDocEdits = async () => {
    if (!viewDoc) return
    setDocSaving(true)
    const r = await api({ action: 'update', document: { id: viewDoc.id, body: docDraftBody } })
    setDocSaving(false)
    if (r.error) { flash(r.error, 'error'); return }
    setDocuments(ds => ds.map(d => d.id === viewDoc.id ? r.document : d))
    setViewDoc(r.document)
    setDocEditMode(false)
    flash('Document saved', 'success')
  }

  const openSavedDoc = (doc) => {
    setViewDoc(doc)
    setLastSignaturePayload(null)
    setDocDraftBody(doc.body || '')
    setDocEditMode(false)
    setDocAiInstruction('')
    setDocSel({ start: 0, end: 0 })
    setViewMode('formatted')
  }

  const openDocForEdit = (doc) => {
    setViewDoc(doc)
    setLastSignaturePayload(null)
    setDocDraftBody(doc.body || '')
    setDocEditMode(true)
    setDocAiInstruction('')
    setDocSel({ start: 0, end: 0 })
    setViewMode('raw')
  }

  useEffect(() => {
    const handler = async (event) => {
      const detail = event.detail || {}
      const documentId = typeof detail === 'string' ? detail : detail.documentId
      if (!documentId) return
      setViewTab(detail.view || detail.tab || 'documents')
      let doc = documents.find(d => d.id === documentId)
      if (!doc) {
        const qs = lockClient && lockedClientId ? `?clientId=${encodeURIComponent(lockedClientId)}` : ''
        const data = await fetch('/api/documents' + qs, { cache: 'no-store' }).then(r => r.json()).catch(() => ({}))
        const nextDocs = data.documents || []
        if (nextDocs.length) setDocuments(nextDocs)
        doc = nextDocs.find(d => d.id === documentId)
      }
      if (doc) openSavedDoc(doc)
      else flash('Linked document was not found in this view', 'error')
    }
    window.addEventListener('fcc:open-document', handler)
    return () => window.removeEventListener('fcc:open-document', handler)
  }, [documents, lockClient, lockedClientId])

  useEffect(() => {
    const handler = (event) => {
      const view = event.detail?.view || event.detail?.tab
      if (['templates', 'documents', 'forms', 'transcripts', 'esignatures'].includes(view)) setViewTab(view)
    }
    window.addEventListener('fcc:documents-view', handler)
    return () => window.removeEventListener('fcc:documents-view', handler)
  }, [])

  const useTemplate = (templateId, preferredClientId = '') => {
    setSelectedTemplateId(templateId)
    setSelectedClientId(lockClient ? lockedClientId : preferredClientId)
    setShowForm(true)
  }

  const copyHtml = async (body, title) => {
    try {
      const rich = await copyAsHtml(renderEmailHtml(body, title))
      flash(rich ? 'Copied formatted email draft' : 'Copied HTML source', 'success')
    } catch (e) { flash('Copy failed: ' + e.message, 'error') }
  }

  const copyText = async (text, label = 'Copied') => {
    try {
      await navigator.clipboard.writeText(text || '')
      flash(label, 'success')
    } catch (e) {
      flash('Copy failed: ' + e.message, 'error')
    }
  }

  const transcriptDocs = useMemo(() => documents.filter(isTranscriptDoc), [documents])
  const transcriptStats = useMemo(() => {
    const linked = transcriptDocs.filter(d => d.clientId || d.clientName).length
    const complete = transcriptDocs.filter(d => (d.status || '').toLowerCase() === 'complete').length
    return { linked, complete }
  }, [transcriptDocs])
  const signatureAttachableDocs = useMemo(() => documents.filter(d => !isTranscriptDoc(d)), [documents])
  const signatureQueueDocs = useMemo(() => signatureAttachableDocs.filter(d => d.signature || docNeedsSignature(d)), [signatureAttachableDocs])
  const selectedSignatureDoc = useMemo(() => signatureAttachableDocs.find(d => d.id === signatureDraft.documentId) || null, [signatureAttachableDocs, signatureDraft.documentId])
  const eSignatureStats = useMemo(() => {
    const stats = { pending: 0, signed: 0, email_failed: 0, expired: 0, required: 0, voided: 0 }
    for (const doc of signatureQueueDocs) {
      const state = signatureWorkflowState(doc)
      if (stats[state] !== undefined) stats[state] += 1
    }
    return stats
  }, [signatureQueueDocs])

  const hydrateSignatureDraft = (doc) => {
    if (!doc) return EMPTY_SIGNATURE_DRAFT
    const client = clients.find(c => c.id === doc.clientId)
    return {
      documentId: doc.id,
      signerName: doc.signature?.signerName || doc.clientName || client?.name || doc.values?.client_name || '',
      signerEmail: doc.signature?.signerEmail || client?.email || doc.values?.client_email || '',
    }
  }

  const openSignatureRequest = (doc = null) => {
    const target = doc || signatureAttachableDocs[0] || null
    setSignatureDraft(hydrateSignatureDraft(target))
    setSignatureRequestOpen(true)
  }

  const selectSignatureDocument = (id) => {
    const doc = signatureAttachableDocs.find(d => d.id === id)
    setSignatureDraft(hydrateSignatureDraft(doc))
  }

  const submitSignatureRequest = async () => {
    if (!selectedSignatureDoc) { flash('Pick a document to send for signature', 'error'); return }
    if (!signatureDraft.signerEmail.trim()) { flash('Signer email is required', 'error'); return }
    const ok = await sendSignatureRequest(selectedSignatureDoc, {
      signerName: signatureDraft.signerName,
      signerEmail: signatureDraft.signerEmail,
      force: true,
    })
    if (ok) {
      setSignatureRequestOpen(false)
      setSignatureDraft(EMPTY_SIGNATURE_DRAFT)
      setViewTab('esignatures')
    }
  }

  const openCapture = () => {
    window.dispatchEvent(new CustomEvent('fcc:navigate', {
      detail: {
        tab: 'meeting-capture',
        returnTo: { tab: 'documents', view: 'transcripts', label: 'Documents / Transcripts' },
      },
    }))
  }

  const filtered = useMemo(() => {
    const base = documents.filter(d => {
      const isTranscript = isTranscriptDoc(d)
      const workflowState = signatureWorkflowState(d)
      const scope = viewTab === 'transcripts'
        ? isTranscript
        : viewTab === 'esignatures'
          ? !isTranscript && (d.signature || docNeedsSignature(d))
          : true
      const haystack = [d.title, d.clientName, d.templateName, d.summary, d.transcript].join(' ').toLowerCase()
      const s = !search || haystack.includes(search.toLowerCase())
      const st = statusFilter === 'all' || (viewTab === 'esignatures' ? workflowState === statusFilter : d.status === statusFilter)
      const cl = clientFilter === 'all' || d.clientId === clientFilter
      const ty = docTypeFilter === 'all' || docTypeLabel(d) === docTypeFilter
      return scope && s && st && cl && ty
    })
    return base.sort((a, b) => {
      if (sortBy === 'newest') return new Date(b.createdAt) - new Date(a.createdAt)
      if (sortBy === 'oldest') return new Date(a.createdAt) - new Date(b.createdAt)
      if (sortBy === 'updated') return new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt)
      if (sortBy === 'title') return (a.title || '').localeCompare(b.title || '')
      if (sortBy === 'type') return (a.templateName || '').localeCompare(b.templateName || '')
      if (sortBy === 'client') return (a.clientName || '').localeCompare(b.clientName || '')
      if (sortBy === 'status') return (a.status || '').localeCompare(b.status || '')
      return 0
    })
  }, [documents, search, statusFilter, clientFilter, docTypeFilter, sortBy, viewTab])

  const transcriptCount = transcriptDocs.length
  const documentCount = documents.length
  const eSignatureCount = signatureQueueDocs.length
  const documentTypes = useMemo(() => Array.from(new Set(documents.map(docTypeLabel))).filter(Boolean).sort(), [documents])
  const { page, setPage, pageSize, setPageSize, paginated: pagedDocuments } = usePagination(filtered, 25)

  // Component configuration layer: configured defaults for the documents list.
  const docListPrefs = useComponentSettings('documents.list')
  useEffect(() => {
    if (!docListPrefs.loaded || !docListPrefs.values) return
    setDocumentView(docListPrefs.values.view)
    setPageSize(docListPrefs.values.pageSize)
  }, [docListPrefs.loaded])
  const filteredForms = useMemo(() => {
    const q = formSearch.toLowerCase()
    return forms.filter(form => {
      const haystack = [form.title, form.description, form.destination, form.automation, ...(form.fields || []).map(f => `${f.label} ${f.key} ${f.type}`)].join(' ').toLowerCase()
      const s = !q || haystack.includes(q)
      const st = formStatusFilter === 'all' || form.status === formStatusFilter
      return s && st
    }).sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0))
  }, [forms, formSearch, formStatusFilter])
  const { page: formPage, setPage: setFormPage, pageSize: formPageSize, setPageSize: setFormPageSize, paginated: pagedForms } = usePagination(filteredForms, 25)

  useEffect(() => {
    setPage(1)
    setSelectedDocs([])
  }, [search, statusFilter, clientFilter, docTypeFilter, sortBy, viewTab, documentView, pageSize, setPage])

  useEffect(() => {
    setStatusFilter('all')
    setDocTypeFilter('all')
    setSelectedDocs([])
  }, [viewTab])

  useEffect(() => {
    setFormPage(1)
    setSelectedForms([])
  }, [formSearch, formStatusFilter, formView, formPageSize, setFormPage])

  const templateCategories = useMemo(() => Array.from(new Set(templates.map(t => t.category || 'Uncategorized'))).sort(), [templates])

  const filteredTemplates = useMemo(() => {
    const q = templateSearch.trim().toLowerCase()
    const base = templates.filter(t => {
      const cat = templateCategory === 'all' || (t.category || 'Uncategorized') === templateCategory
      const text = !q || [t.name, t.description, t.category, t.id, ...(t.placeholders || [])].join(' ').toLowerCase().includes(q)
      return cat && text
    })
    return base.sort((a, b) => {
      if (templateSort === 'category') return (a.category || '').localeCompare(b.category || '') || (a.name || '').localeCompare(b.name || '')
      if (templateSort === 'fields') return (b.placeholders?.length || 0) - (a.placeholders?.length || 0)
      if (templateSort === 'signature') return Number(!!b.requiresSignature) - Number(!!a.requiresSignature) || (a.name || '').localeCompare(b.name || '')
      return (a.name || '').localeCompare(b.name || '')
    })
  }, [templates, templateSearch, templateCategory, templateSort])

  const { page: templatePage, setPage: setTemplatePage, pageSize: templatePageSize, setPageSize: setTemplatePageSize, paginated: pagedTemplates } = usePagination(filteredTemplates, 25)

  useEffect(() => {
    setTemplatePage(1)
    setSelectedTemplates([])
  }, [templateSearch, templateCategory, templateSort, templateView, templatePageSize, setTemplatePage])

  const byCategory = useMemo(() => {
    const out = {}
    for (const t of filteredTemplates) {
      out[t.category] = out[t.category] || []
      out[t.category].push(t)
    }
    return out
  }, [filteredTemplates])

  const is = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13, outline: 'none', width: '100%' }

  return (
    <div className="command-workspace p-6">
      {toast.msg && (
        <div className="fixed top-4 right-4 z-50 px-4 py-2 rounded-lg text-sm font-medium animate-fade-in flex items-center gap-3 max-w-md" style={{
          background: toast.kind === 'success' ? 'var(--green)' : toast.kind === 'error' ? 'var(--red)' : 'var(--amber)',
          color: 'var(--accent-text)', boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        }}>
          <span className="flex-1">{toast.kind === 'success' ? 'OK: ' : toast.kind === 'error' ? 'Error: ' : ''}{toast.msg}</span>
          {toast.kind === 'error' && <button onClick={clearToast} className="opacity-80 hover:opacity-100 font-bold text-lg leading-none">x</button>}
        </div>
      )}

      <PageHeader
        icon={<FileText size={20} />}
        title="Documents"
        subtitle="Templates, documents, e-signatures, embeddable forms, transcript records, and client document history"
        viewToggle={viewTab !== 'esignatures' ? <ViewModeToggle value={documentView} onChange={setDocumentView} modes={['list', 'card']} /> : null}
        controls={viewTab !== 'esignatures' ? <ComponentSettings componentId="documents.list" title="Documents list settings" onApplied={(id, v) => { setDocumentView(v.view); setPageSize(v.pageSize) }} /> : null}
        actions={
          <div className="flex gap-2 items-center flex-wrap">
            <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
              <button className="px-3 text-sm font-semibold inline-flex items-center gap-2" style={{ background: viewTab === 'documents' ? 'var(--accent)' : 'var(--surface2)', color: viewTab === 'documents' ? 'var(--accent-text)' : 'var(--text-muted)', minHeight: 38 }} onClick={() => setViewTab('documents')}>
                Documents
                <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: viewTab === 'documents' ? 'rgba(255,255,255,0.22)' : 'var(--accent-soft)', color: viewTab === 'documents' ? 'var(--accent-text)' : 'var(--accent)' }}>{documentCount}</span>
              </button>
              <button className="px-3 text-sm font-semibold inline-flex items-center gap-2" style={{ background: viewTab === 'esignatures' ? 'var(--accent)' : 'var(--surface2)', color: viewTab === 'esignatures' ? 'var(--accent-text)' : 'var(--text-muted)', minHeight: 38 }} onClick={() => setViewTab('esignatures')}>
                E-Signatures
                <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: viewTab === 'esignatures' ? 'rgba(255,255,255,0.22)' : 'var(--accent-soft)', color: viewTab === 'esignatures' ? 'var(--accent-text)' : 'var(--accent)' }}>{eSignatureCount}</span>
              </button>
              <button className="px-3 text-sm font-semibold inline-flex items-center gap-2" style={{ background: viewTab === 'forms' ? 'var(--accent)' : 'var(--surface2)', color: viewTab === 'forms' ? 'var(--accent-text)' : 'var(--text-muted)', minHeight: 38 }} onClick={() => setViewTab('forms')}>
                Forms
                <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: viewTab === 'forms' ? 'rgba(255,255,255,0.22)' : 'var(--accent-soft)', color: viewTab === 'forms' ? 'var(--accent-text)' : 'var(--accent)' }}>{forms.length}</span>
              </button>
              <button className="px-3 text-sm font-semibold inline-flex items-center gap-2" style={{ background: viewTab === 'transcripts' ? 'var(--accent)' : 'var(--surface2)', color: viewTab === 'transcripts' ? 'var(--accent-text)' : 'var(--text-muted)', minHeight: 38 }} onClick={() => setViewTab('transcripts')}>
                Transcripts
                <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: viewTab === 'transcripts' ? 'rgba(255,255,255,0.22)' : 'var(--accent-soft)', color: viewTab === 'transcripts' ? 'var(--accent-text)' : 'var(--accent)' }}>{transcriptCount}</span>
              </button>
              <button className="px-3 text-sm font-semibold inline-flex items-center gap-2" style={{ background: viewTab === 'templates' ? 'var(--accent)' : 'var(--surface2)', color: viewTab === 'templates' ? 'var(--accent-text)' : 'var(--text-muted)', minHeight: 38 }} onClick={() => setViewTab('templates')}>
                Templates
                <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: viewTab === 'templates' ? 'rgba(255,255,255,0.22)' : 'var(--accent-soft)', color: viewTab === 'templates' ? 'var(--accent-text)' : 'var(--accent)' }}>{templates.length}</span>
              </button>
            </div>
          </div>
        }
      />

      {viewTab === 'esignatures' && !eSignConfig.configured && (
        <div className="rounded-lg p-4 mb-4" role="status" style={{ background: 'var(--amber-soft)', border: '1px solid var(--amber)', color: 'var(--text)' }}>
          <div className="font-semibold">E-signature is not configured</div>
          <div className="text-sm mt-1">Add <code>SIGNING_PUBLIC_URL</code> and <code>RESEND_API_KEY</code> to enable e-signature.</div>
        </div>
      )}

      <div style={{ display: viewTab === 'documents' || viewTab === 'transcripts' || viewTab === 'esignatures' ? 'block' : 'none' }}>
      <div className="command-toolbar flex gap-2 mb-4 flex-wrap items-center rounded-lg p-3">
        <input className="flex-1" style={{ ...is, minWidth: 180 }} placeholder={viewTab === 'transcripts' ? 'Search transcripts, speakers, clients, decisions...' : viewTab === 'esignatures' ? 'Search signature requests, signers, clients...' : 'Search documents, clients, templates...'} value={search} onChange={e => setSearch(e.target.value)} />
        <ThemedSelect style={{ ...is, width: 'auto', minWidth: 140 }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          {viewTab === 'esignatures' ? (
            <>
              <option value="all">All statuses</option>
              <option value="pending">Pending</option>
              <option value="signed">Signed</option>
              <option value="email_failed">Email failed</option>
              <option value="expired">Expired</option>
              <option value="required">Required</option>
              <option value="voided">Voided</option>
            </>
          ) : (
            <>
              <option value="all">All statuses</option>
              <option value="draft">Draft</option>
              <option value="sent">Sent</option>
              <option value="signed">Signed</option>
              <option value="complete">Complete</option>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </>
          )}
        </ThemedSelect>
        <ThemedSelect style={{ ...is, width: 'auto', minWidth: 160 }} value={clientFilter} onChange={e => setClientFilter(e.target.value)}>
          <option value="all">All clients</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </ThemedSelect>
        <ThemedSelect style={{ ...is, width: 'auto', minWidth: 150 }} value={docTypeFilter} onChange={e => setDocTypeFilter(e.target.value)}>
          <option value="all">All types</option>
          {documentTypes.map(type => <option key={type} value={type}>{type}</option>)}
        </ThemedSelect>
        <ThemedSelect style={{ ...is, width: 'auto', minWidth: 150 }} value={sortBy} onChange={e => setSortBy(e.target.value)}>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="updated">Recently updated</option>
          <option value="title">Title A-Z</option>
          <option value="type">By type</option>
          <option value="client">By client</option>
          <option value="status">By status</option>
        </ThemedSelect>
        {viewTab === 'esignatures' ? (
          <button disabled={!eSignConfig.configured} title={!eSignConfig.configured ? eSignConfig.message : 'Request an electronic signature'} className="px-3 rounded-lg text-sm font-semibold inline-flex items-center gap-2" style={{ background: 'var(--accent)', color: 'var(--accent-text)', minHeight: 40, opacity: eSignConfig.configured ? 1 : 0.55, cursor: eSignConfig.configured ? 'pointer' : 'not-allowed' }} onClick={() => openSignatureRequest()}>
            <FileSignature size={16} aria-hidden="true" />
            Request Signature
          </button>
        ) : (
          <button className="px-3 rounded-lg text-sm font-semibold" style={{ background: 'var(--accent)', color: 'var(--accent-text)', minHeight: 40 }} onClick={() => setShowForm(true)}>New</button>
        )}
        {viewTab === 'transcripts' && (
          <button className="px-3 rounded-lg text-sm font-semibold" style={{ background: 'var(--surface)', color: 'var(--accent)', minHeight: 40, border: '1px solid var(--border)' }} onClick={openCapture}>Capture</button>
        )}
        {viewTab !== 'esignatures' && (
          <BulkActionsMenu
            selectedCount={selectedDocs.length}
            totalCount={pagedDocuments.length}
            onSelectPage={() => setSelectedDocs(pagedDocuments.map(doc => doc.id))}
            onClearSelection={() => setSelectedDocs([])}
            onDeleteSelected={batchDeleteDocs}
          />
        )}
      </div>
      {viewTab === 'transcripts' && (
        <div className="grid gap-3 mb-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
          <div className="rounded-lg p-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="text-[11px] uppercase font-semibold" style={{ color: 'var(--text-muted)', letterSpacing: 0 }}>Captured</div>
            <div className="text-2xl font-bold" style={{ color: 'var(--text)' }}>{transcriptCount}</div>
          </div>
          <div className="rounded-lg p-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="text-[11px] uppercase font-semibold" style={{ color: 'var(--text-muted)', letterSpacing: 0 }}>Linked</div>
            <div className="text-2xl font-bold" style={{ color: 'var(--text)' }}>{transcriptStats.linked}</div>
          </div>
          <div className="rounded-lg p-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="text-[11px] uppercase font-semibold" style={{ color: 'var(--text-muted)', letterSpacing: 0 }}>Complete</div>
            <div className="text-2xl font-bold" style={{ color: 'var(--text)' }}>{transcriptStats.complete}</div>
          </div>
        </div>
      )}
      {loading ? <div className="text-center py-16" style={{ color: 'var(--text-muted)' }}>Loading...</div> :
        filtered.length === 0 ? (
          <div className="text-center py-16">
            <p style={{ color: 'var(--text-muted)' }}>{viewTab === 'esignatures' ? 'No e-signature requests match this view. Start one from Request Signature.' : documents.length === 0 ? 'No documents yet. Click "New Document" to create one from a template.' : 'No documents match your filter.'}</p>
          </div>
        ) : viewTab === 'esignatures' ? (
          <div className="grid gap-4">
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
              {[
                ['Pending', eSignatureStats.pending],
                ['Signed', eSignatureStats.signed],
                ['Email failed', eSignatureStats.email_failed],
                ['Expired', eSignatureStats.expired],
                ['Required', eSignatureStats.required],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg p-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  <div className="text-[11px] uppercase font-semibold" style={{ color: 'var(--text-muted)', letterSpacing: 0 }}>{label}</div>
                  <div className="text-2xl font-bold" style={{ color: 'var(--text)' }}>{value}</div>
                </div>
              ))}
            </div>
            <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              {pagedDocuments.map(d => {
                const state = signatureWorkflowState(d)
                const sc = STATUS_COLORS[state] || STATUS_COLORS.not_requested
                const signUrl = d.signature?.signUrl || ''
                return (
                  <div key={d.id} className="grid gap-3 items-center px-4 py-3" style={{ gridTemplateColumns: '46px minmax(0, 1.4fr) minmax(130px, 0.7fr) minmax(140px, 0.8fr) minmax(110px, 0.6fr) auto', borderBottom: '1px solid var(--border)' }}>
                    <DocumentThumb doc={d} compact />
                    <div className="min-w-0">
                      <button className="font-semibold truncate text-left block w-full" style={{ color: 'var(--text)', background: 'transparent', border: 0, padding: 0 }} onClick={() => openSavedDoc(d)}>{d.title}</button>
                      <div className="text-xs truncate mt-1" style={{ color: 'var(--text-muted)' }}>{docTypeLabel(d)} - {d.clientName || 'Global document'}</div>
                    </div>
                    <span className="text-xs px-2 py-1 rounded-full text-center font-medium" style={{ background: sc.bg, color: sc.fg }}>{signatureStatusLabel(state)}</span>
                    <div className="text-xs min-w-0" style={{ color: 'var(--text)' }}>
                      <div className="truncate">{d.signature?.signerName || d.clientName || 'No signer selected'}</div>
                      <div className="truncate" style={{ color: 'var(--text-muted)' }}>{d.signature?.signerEmail || d.values?.client_email || ''}</div>
                    </div>
                    <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {d.signature?.signedAt ? fmtDate(d.signature.signedAt) : d.signature?.requestedAt ? fmtDate(d.signature.requestedAt) : fmtDate(d.updatedAt || d.createdAt)}
                    </div>
                    <div className="flex gap-1 justify-end flex-nowrap">
                      <ActionIconButton label="Open document" icon={ExternalLink} onClick={() => openSavedDoc(d)} tone="accent" />
                      <ActionIconButton label={d.signature?.status === 'pending' ? 'Resend signature request' : 'Request signature'} icon={Send} onClick={() => openSignatureRequest(d)} tone="amber" disabled={signingDocId === d.id} />
                      <ActionIconButton label="Download PDF" icon={Download} onClick={() => downloadPdf(d.id)} tone="muted" />
                      {signUrl && <ActionIconButton label="Copy signing link" icon={CopyIcon} onClick={() => copyText(signUrl, 'Signing link copied')} tone="accent" />}
                      {signUrl && <ActionIconButton label="Open signing link" icon={ExternalLink} onClick={() => window.open(signUrl, '_blank', 'noopener,noreferrer')} tone="accent" />}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ) : documentView === 'list' ? (
          <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            {pagedDocuments.map(d => {
              const sc = STATUS_COLORS[d.status] || STATUS_COLORS.draft
              return (
                <div key={d.id} className="document-list-row grid gap-3 items-center px-4 py-3 cursor-pointer" style={{ gridTemplateColumns: '28px 46px minmax(0, 1.5fr) minmax(120px, 0.7fr) 92px 90px auto', borderBottom: '1px solid var(--border)' }} onClick={() => openSavedDoc(d)}>
                  <input
                    type="checkbox"
                    checked={selectedDocs.includes(d.id)}
                    onChange={e => setSelectedDocs(ids => e.target.checked ? [...ids, d.id] : ids.filter(id => id !== d.id))}
                    onClick={e => e.stopPropagation()}
                    aria-label={`Select ${d.title}`}
                  />
                  <DocumentThumb doc={d} compact />
                  <div className="min-w-0" style={{ display: 'grid', gap: 4 }}>
                    <div className="flex items-center gap-2 min-w-0">
                      <button className="font-semibold truncate text-left" style={{ color: 'var(--text)', background: 'transparent', border: 0, padding: 0, minWidth: 0 }} onClick={e => { e.stopPropagation(); openSavedDoc(d) }}>{d.title}</button>
                      {d.type === 'transcript' && <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>Transcript</span>}
                      <button className="text-[11px] px-2 py-0.5 rounded-full font-semibold" style={{ background: 'var(--surface2)', color: 'var(--accent)', border: '1px solid var(--border)', flex: '0 0 auto' }} onClick={e => { e.stopPropagation(); openDocForEdit(d) }}>Edit</button>
                      <button className="text-[11px] px-2 py-0.5 rounded-full font-semibold" style={{ background: d.portalVisible === true ? 'var(--accent-soft)' : 'var(--surface2)', color: d.portalVisible === true ? 'var(--accent)' : 'var(--text-muted)', border: '1px solid var(--border)', flex: '0 0 auto' }} title={d.portalVisible === true ? 'Visible in the client portal' : 'Hidden from the client portal'} onClick={e => { e.stopPropagation(); setPortalShare(d, d.portalVisible !== true) }}>{d.portalVisible === true ? 'Shared with client' : 'Not shared'}</button>
                    </div>
                    <div className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{docTypeLabel(d)} · {docSnippet(d)}</div>
                  </div>
                  <div className="text-sm truncate" style={{ color: 'var(--text)' }}>{d.clientName || 'Global'}</div>
                  <span className="text-xs px-2 py-1 rounded-full text-center font-medium" style={{ background: sc.bg, color: sc.fg }}>{d.status}</span>
                  <div className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{fmtDate(d.createdAt)}</div>
                  <div className="flex gap-1 justify-end flex-nowrap" onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
                    <ItemActionsMenu
                      label={`Actions for ${d.title}`}
                      actions={[
                        { label: 'Edit document', onClick: () => openDocForEdit(d) },
                        { label: 'Open document', onClick: () => openSavedDoc(d) },
                        { label: 'Download PDF', onClick: () => downloadPdf(d.id) },
                        { label: 'Copy document', onClick: () => duplicateDoc(d.id) },
                        { label: d.portalVisible === true ? 'Stop sharing with client' : 'Share with client', onClick: () => setPortalShare(d, d.portalVisible !== true) },
                        docNeedsSignature(d) && d.status !== 'signed' ? { label: 'Send signature request', disabled: signingDocId === d.id, onClick: () => sendSignatureRequest(d) } : null,
                        { label: 'Delete document', tone: 'danger', onClick: () => deleteDoc(d.id) },
                      ]}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
            {pagedDocuments.map(d => {
              const sc = STATUS_COLORS[d.status] || STATUS_COLORS.draft
              const snippet = docSnippet(d)
              return (
                <div key={d.id} className="rounded-lg flex flex-col" style={{ background: 'var(--surface)', border: '1px solid var(--border)', cursor: 'pointer', transition: 'box-shadow 0.15s', padding: 12, gap: 10, minHeight: 0 }}
                  onClick={() => openSavedDoc(d)}>
                  <div className="flex gap-3 min-w-0">
                    <input
                      type="checkbox"
                      checked={selectedDocs.includes(d.id)}
                      onChange={e => setSelectedDocs(ids => e.target.checked ? [...ids, d.id] : ids.filter(id => id !== d.id))}
                      onClick={e => e.stopPropagation()}
                      aria-label={`Select ${d.title}`}
                      style={{ alignSelf: 'start', marginTop: 4 }}
                    />
                    <DocumentThumb doc={d} compact />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1 min-w-0">
                        <span className="text-[11px] uppercase font-semibold truncate" style={{ color: 'var(--text-muted)', letterSpacing: 0 }}>{docTypeLabel(d)}</span>
                        {d.type === 'transcript' && <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>Transcript</span>}
                      </div>
                      <div className="font-semibold text-sm leading-tight truncate" style={{ color: 'var(--text)' }} title={d.title}>{d.title}</div>
                      <div className="text-xs truncate mt-1" style={{ color: 'var(--text-muted)' }}>{d.clientName || 'Global document'} · {fmtDate(d.createdAt)}</div>
                    </div>
                  </div>
                  <div className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                    {snippet.slice(0, 120)}{snippet.length > 120 ? '...' : ''}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap mt-auto">
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: sc.bg, color: sc.fg }}>{d.status}</span>
                    {docNeedsSignature(d) && signatureState(d) !== 'signed' && <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: 'rgba(245,158,11,0.15)', color: 'var(--amber)' }}>sign</span>}
                  </div>
                  <div className="flex gap-1 pt-1 flex-nowrap" onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
                    <ItemActionsMenu
                      label={`Actions for ${d.title}`}
                      actions={[
                        { label: 'Open document', onClick: () => openSavedDoc(d) },
                        { label: 'Download PDF', onClick: () => downloadPdf(d.id) },
                        { label: 'Edit document', onClick: () => openDocForEdit(d) },
                        { label: 'Copy document', onClick: () => duplicateDoc(d.id) },
                        { label: d.portalVisible === true ? 'Stop sharing with client' : 'Share with client', onClick: () => setPortalShare(d, d.portalVisible !== true) },
                        docNeedsSignature(d) && d.status !== 'signed' ? { label: 'Send signature request', disabled: signingDocId === d.id, onClick: () => sendSignatureRequest(d) } : null,
                        { label: 'Delete document', tone: 'danger', onClick: () => deleteDoc(d.id) },
                      ]}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )
      }
      {filtered.length > 0 && (
        <Paginator total={filtered.length} page={page} pageSize={pageSize} onPage={setPage} onPageSize={setPageSize} label={viewTab === 'transcripts' ? 'transcripts' : viewTab === 'esignatures' ? 'signature requests' : 'documents'} />
      )}

      </div>

      {viewTab === 'forms' && (
        <div>
          <div className="flex gap-2 mb-4 flex-wrap items-center rounded-lg p-3" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
            <input className="flex-1" style={{ ...is, minWidth: 180 }} placeholder="Search forms, fields, destinations, automations..." value={formSearch} onChange={e => setFormSearch(e.target.value)} />
            <ThemedSelect style={{ ...is, width: 'auto', minWidth: 140 }} value={formStatusFilter} onChange={e => setFormStatusFilter(e.target.value)}>
              <option value="all">All statuses</option>
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="archived">Archived</option>
            </ThemedSelect>
            <ViewModeToggle value={formView} onChange={setFormView} modes={['card', 'list']} />
            <button className="px-3 rounded-lg text-sm font-semibold" style={{ background: 'var(--accent)', color: 'var(--accent-text)', minHeight: 40 }} onClick={openNewForm}>New Form</button>
            <BulkActionsMenu
              selectedCount={selectedForms.length}
              totalCount={pagedForms.length}
              onSelectPage={() => setSelectedForms(pagedForms.map(form => form.id))}
              onClearSelection={() => setSelectedForms([])}
              onDeleteSelected={batchDeleteForms}
            />
          </div>

          {filteredForms.length === 0 ? (
            <div className="text-center py-16">
              <p style={{ color: 'var(--text-muted)' }}>{forms.length === 0 ? 'No forms yet. Create a form to capture leads, intake details, or automation triggers.' : 'No forms match your filter.'}</p>
            </div>
          ) : formView === 'list' ? (
            <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              {pagedForms.map(form => (
                <div key={form.id} className="form-list-row grid gap-3 items-center px-4 py-3 cursor-pointer" style={{ gridTemplateColumns: '28px 46px minmax(0, 1.5fr) minmax(120px, 0.7fr) 92px 90px auto', borderBottom: '1px solid var(--border)' }} onClick={() => openFormPreview(form)}>
                  <input type="checkbox" checked={selectedForms.includes(form.id)} onChange={e => setSelectedForms(ids => e.target.checked ? [...ids, form.id] : ids.filter(id => id !== form.id))} onClick={e => e.stopPropagation()} aria-label={`Select ${form.title}`} />
                  <div aria-hidden="true" className="rounded-md grid place-items-center font-bold" style={{ width: 42, height: 42, background: 'var(--accent-soft)', color: 'var(--accent)', border: '1px solid var(--border)' }}>F</div>
                  <div className="min-w-0">
                    <div className="font-semibold truncate" style={{ color: 'var(--text)' }}>{form.title}</div>
                    <div className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{form.description || 'No description'} · {(form.fields || []).length} fields</div>
                  </div>
                  <div className="text-sm truncate" style={{ color: 'var(--text)' }}>{form.destination || 'leads'}</div>
                  <span className="text-xs px-2 py-1 rounded-full text-center font-medium" style={{ background: form.status === 'active' ? 'rgba(34,197,94,0.16)' : 'var(--surface2)', color: form.status === 'active' ? 'var(--green)' : 'var(--text-muted)' }}>{form.status || 'draft'}</span>
                  <div className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{form.submissionsCount || 0} subs</div>
                  <div className="flex gap-1 justify-end flex-nowrap" onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
                    <ItemActionsMenu
                      label={`Actions for ${form.title}`}
                      actions={[
                        { label: 'Edit form', onClick: () => openFormEditor(form) },
                        { label: 'Open form', onClick: () => openFormPreview(form) },
                        { label: 'Copy embed code', onClick: () => copyText(form.embedCode, 'Embed code copied') },
                        { label: 'Copy form', onClick: () => duplicateForm(form.id) },
                        { label: 'Delete form', tone: 'danger', onClick: () => deleteForm(form.id) },
                      ]}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
              {pagedForms.map(form => (
                <div key={form.id} className="rounded-lg flex flex-col" style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: 12, gap: 10, cursor: 'pointer' }} onClick={() => openFormPreview(form)}>
                  <div className="flex gap-3 min-w-0">
                    <input type="checkbox" checked={selectedForms.includes(form.id)} onChange={e => setSelectedForms(ids => e.target.checked ? [...ids, form.id] : ids.filter(id => id !== form.id))} onClick={e => e.stopPropagation()} aria-label={`Select ${form.title}`} style={{ alignSelf: 'start', marginTop: 4 }} />
                    <div aria-hidden="true" className="rounded-md grid place-items-center font-bold" style={{ width: 44, height: 54, background: 'var(--accent-soft)', color: 'var(--accent)', border: '1px solid var(--border)', flex: '0 0 auto' }}>F</div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm leading-tight truncate" style={{ color: 'var(--text)' }}>{form.title}</div>
                      <div className="text-xs truncate mt-1" style={{ color: 'var(--text-muted)' }}>{form.destination || 'leads'} · {(form.fields || []).length} fields · {form.submissionsCount || 0} subs</div>
                    </div>
                  </div>
                  <div className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>{form.description || 'Ready for intake, landing pages, and automation triggers.'}</div>
                  <div className="flex gap-1 pt-1 flex-nowrap mt-auto" onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
                    <ItemActionsMenu
                      label={`Actions for ${form.title}`}
                      actions={[
                        { label: 'Edit form', onClick: () => openFormEditor(form) },
                        { label: 'Open form', onClick: () => openFormPreview(form) },
                        { label: 'Copy embed code', onClick: () => copyText(form.embedCode, 'Embed code copied') },
                        { label: 'Copy form', onClick: () => duplicateForm(form.id) },
                        { label: 'Delete form', tone: 'danger', onClick: () => deleteForm(form.id) },
                      ]}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
          {filteredForms.length > 0 && (
            <Paginator total={filteredForms.length} page={formPage} pageSize={formPageSize} onPage={setFormPage} onPageSize={setFormPageSize} label="forms" />
          )}
        </div>
      )}

      {viewTab === 'templates' && (
        <div>
          <div className="flex gap-2 mb-4 flex-wrap items-center rounded-lg p-3" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
            <input className="flex-1" style={{ ...is, minWidth: 180 }} placeholder="Search templates by name, category, description, or field..." value={templateSearch} onChange={e => setTemplateSearch(e.target.value)} autoFocus />
            <ThemedSelect style={{ ...is, width: 'auto', minWidth: 180 }} value={templateCategory} onChange={e => setTemplateCategory(e.target.value)}>
              <option value="all">All categories</option>
              {templateCategories.map(c => <option key={c} value={c}>{c}</option>)}
            </ThemedSelect>
            <ThemedSelect style={{ ...is, width: 'auto', minWidth: 150 }} value={templateSort} onChange={e => setTemplateSort(e.target.value)}>
              <option value="name">Name A-Z</option>
              <option value="category">By category</option>
              <option value="fields">Most fields</option>
              <option value="signature">Signature first</option>
            </ThemedSelect>
            <ViewModeToggle value={templateView} onChange={setTemplateView} modes={['card', 'list']} />
            <button className="px-3 rounded-lg text-sm font-semibold" style={{ background: 'var(--accent)', color: 'var(--accent-text)', minHeight: 40 }} onClick={() => setNewTplOpen(o => !o)}>
              {newTplOpen ? 'Close New' : 'New Template'}
            </button>
            <BulkActionsMenu
              selectedCount={selectedTemplates.length}
              totalCount={pagedTemplates.length}
              onSelectPage={() => setSelectedTemplates(pagedTemplates.map(template => template.id))}
              onClearSelection={() => setSelectedTemplates([])}
              onDeleteSelected={batchDeleteTemplates}
            />
          </div>

          {newTplOpen && (
            <div className="rounded-xl p-4 mb-5" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="flex gap-3 items-center flex-wrap mb-3">
                <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                  <button className="px-3 text-sm font-semibold" style={{ background: newTplMode === 'wizard' ? 'var(--accent)' : 'var(--surface2)', color: newTplMode === 'wizard' ? 'var(--accent-text)' : 'var(--text-muted)', minHeight: 40 }} onClick={() => setNewTplMode('wizard')}>Wizard</button>
                  <button className="px-3 text-sm font-semibold" style={{ background: newTplMode === 'manual' ? 'var(--accent)' : 'var(--surface2)', color: newTplMode === 'manual' ? 'var(--accent-text)' : 'var(--text-muted)', minHeight: 40 }} onClick={() => setNewTplMode('manual')}>Manual</button>
                </div>
                {newTplMode === 'manual' ? (
                  <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                    <input type="checkbox" checked={!!newTpl.requiresSignature} onChange={e => setNewTpl(t => ({ ...t, requiresSignature: !!e.target.checked }))} />
                    Requires signature
                  </label>
                ) : (
                  <ThemedSelect
                    style={{ ...is, width: 'auto', minWidth: 200 }}
                    value={tplWizard.signatureMode}
                    onChange={e => {
                      const mode = e.target.value
                      setTplWizard(w => ({ ...w, signatureMode: mode }))
                      setNewTpl(t => ({ ...t, requiresSignature: mode !== 'none' }))
                    }}
                  >
                    <option value="both">Signatures: both parties</option>
                    <option value="client_only">Signatures: client only</option>
                    <option value="none">No signatures (policy)</option>
                  </ThemedSelect>
                )}
                {newTplMode === 'wizard' && (
                  <>
                    <ThemedSelect style={{ ...is, width: 'auto', minWidth: 260 }} value={tplWizard.baseTemplateId} onChange={e => setTplWizard(w => ({ ...w, baseTemplateId: e.target.value }))}>
                      {WIZARD_BASE_OPTIONS.map(o => <option key={o.id || 'scratch'} value={o.id}>{o.label}</option>)}
                    </ThemedSelect>
                    <button className="px-4 rounded-lg text-sm font-semibold" style={{ background: 'var(--purple, #a855f7)', color: 'white', minHeight: 40, opacity: tplWizardAiBusy ? 0.7 : 1 }} onClick={generateWizardBody} disabled={tplWizardAiBusy}>Generate Draft</button>
                    <button className="px-4 rounded-lg text-sm font-semibold" style={{ background: tplWizardAiBusy ? 'var(--surface2)' : 'rgba(168,85,247,0.18)', color: tplWizardAiBusy ? 'var(--text-muted)' : 'var(--purple, #a855f7)', border: '1px solid var(--purple, #a855f7)', minHeight: 40 }} onClick={generateWizardBodyAI} disabled={tplWizardAiBusy}>{tplWizardAiBusy ? 'AI Drafting...' : 'AI Draft'}</button>
                  </>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                <input style={is} placeholder="Template name" value={newTpl.name} onChange={e => setNewTpl(t => ({ ...t, name: e.target.value }))} />
                <input style={is} placeholder="Category" value={newTpl.category} onChange={e => setNewTpl(t => ({ ...t, category: e.target.value }))} />
                <input style={is} placeholder="Description" value={newTpl.description} onChange={e => setNewTpl(t => ({ ...t, description: e.target.value }))} />
              </div>
              {newTplMode === 'wizard' && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                  <input style={is} placeholder="H1 title override (optional)" value={tplWizard.title} onChange={e => setTplWizard(w => ({ ...w, title: e.target.value }))} />
                  <ThemedSelect style={is} value={tplWizard.docType} onChange={e => setTplWizard(w => ({ ...w, docType: e.target.value }))}>
                    <option value="agreement">Document type: agreement</option>
                    <option value="order_form">Document type: order form</option>
                    <option value="addendum">Document type: addendum/exhibit</option>
                    <option value="policy">Document type: policy</option>
                  </ThemedSelect>
                  <input style={is} placeholder="Provider legal name" value={tplWizard.providerName} onChange={e => setTplWizard(w => ({ ...w, providerName: e.target.value }))} />
                  <input style={is} placeholder="Counterparty label (Client/Licensee/Subscriber)" value={tplWizard.counterpartyLabel} onChange={e => setTplWizard(w => ({ ...w, counterpartyLabel: e.target.value }))} />
                  <ThemedSelect style={is} value={tplWizard.scopeStyle} onChange={e => setTplWizard(w => ({ ...w, scopeStyle: e.target.value }))}>
                    <option value="work">Scope placeholder: scope_of_work</option>
                    <option value="services">Scope placeholder: scope_of_services</option>
                  </ThemedSelect>
                  <ThemedSelect style={is} value={tplWizard.pricingModel} onChange={e => setTplWizard(w => ({ ...w, pricingModel: e.target.value }))}>
                    <option value="fixed">Pricing: fixed fee</option>
                    <option value="hourly">Pricing: hourly</option>
                    <option value="subscription">Pricing: subscription</option>
                    <option value="usage">Pricing: usage-based</option>
                    <option value="none">Pricing: none</option>
                  </ThemedSelect>
                  <ThemedSelect style={is} value={tplWizard.termStyle} onChange={e => setTplWizard(w => ({ ...w, termStyle: e.target.value }))}>
                    <option value="fixed">Term: fixed term</option>
                    <option value="month_to_month">Term: month-to-month</option>
                    <option value="project">Term: project-based</option>
                  </ThemedSelect>
                  <ThemedSelect
                    style={is}
                    value={tplWizard.deploymentModel}
                    onChange={e => {
                      const value = e.target.value
                      setTplWizard(w => ({ ...w, deploymentModel: value, includeLicensing: value !== 'n_a' ? true : w.includeLicensing }))
                    }}
                  >
                    <option value="n_a">Deployment: n/a</option>
                    <option value="hosted">Deployment: hosted</option>
                    <option value="on_prem">Deployment: on-prem</option>
                    <option value="hybrid">Deployment: hybrid</option>
                  </ThemedSelect>
                  <label className="flex items-center gap-2 text-xs rounded-lg px-3" style={{ ...is, display: 'flex', alignItems: 'center', minHeight: 40 }}>
                    <input type="checkbox" checked={!!tplWizard.includeIndemnity} onChange={e => setTplWizard(w => ({ ...w, includeIndemnity: !!e.target.checked }))} />
                    Include indemnity placeholder
                  </label>
                  <label className="flex items-center gap-2 text-xs rounded-lg px-3" style={{ ...is, display: 'flex', alignItems: 'center', minHeight: 40 }}>
                    <input type="checkbox" checked={!!tplWizard.includeDataSecurity} onChange={e => setTplWizard(w => ({ ...w, includeDataSecurity: !!e.target.checked }))} />
                    Include data/security placeholder
                  </label>
                  <label className="flex items-center gap-2 text-xs rounded-lg px-3" style={{ ...is, display: 'flex', alignItems: 'center', minHeight: 40 }}>
                    <input type="checkbox" checked={!!tplWizard.includeScope} onChange={e => setTplWizard(w => ({ ...w, includeScope: !!e.target.checked }))} />
                    Include scope section
                  </label>
                  <label className="flex items-center gap-2 text-xs rounded-lg px-3" style={{ ...is, display: 'flex', alignItems: 'center', minHeight: 40 }}>
                    <input type="checkbox" checked={!!tplWizard.includeFees} onChange={e => setTplWizard(w => ({ ...w, includeFees: !!e.target.checked }))} />
                    Include fees/payment
                  </label>
                  <label className="flex items-center gap-2 text-xs rounded-lg px-3" style={{ ...is, display: 'flex', alignItems: 'center', minHeight: 40 }}>
                    <input type="checkbox" checked={!!tplWizard.includeTerm} onChange={e => setTplWizard(w => ({ ...w, includeTerm: !!e.target.checked }))} />
                    Include term/termination
                  </label>
                  <label className="flex items-center gap-2 text-xs rounded-lg px-3" style={{ ...is, display: 'flex', alignItems: 'center', minHeight: 40 }}>
                    <input type="checkbox" checked={!!tplWizard.includeSupport} onChange={e => setTplWizard(w => ({ ...w, includeSupport: !!e.target.checked }))} />
                    Include support section
                  </label>
                  <label className="flex items-center gap-2 text-xs rounded-lg px-3" style={{ ...is, display: 'flex', alignItems: 'center', minHeight: 40 }}>
                    <input type="checkbox" checked={!!tplWizard.includeLicensing} onChange={e => setTplWizard(w => ({ ...w, includeLicensing: !!e.target.checked }))} />
                    Include licensing scope
                  </label>
                  <textarea className="md:col-span-3" style={{ ...is, minHeight: 84 }} placeholder="Special risks / review focus (optional). One per line; becomes bullets in Template Notes." value={tplWizard.specialRisks} onChange={e => setTplWizard(w => ({ ...w, specialRisks: e.target.value }))} />
                </div>
              )}
              <textarea style={{ ...is, minHeight: 140, fontFamily: 'ui-monospace, monospace' }} placeholder="Template markdown. Use {{client_name}} style placeholders." value={newTpl.body} onChange={e => setNewTpl(t => ({ ...t, body: e.target.value }))} />
              <div className="flex gap-2 mt-3">
                <button className="px-4 rounded-lg text-sm font-semibold" style={{ background: 'var(--green)', color: 'var(--accent-text)', minHeight: 40 }} onClick={createTemplate}>Create Template</button>
                <button className="px-4 rounded-lg text-sm" style={{ background: 'var(--surface2)', color: 'var(--text-muted)', minHeight: 40 }} onClick={() => setNewTplOpen(false)}>Cancel</button>
              </div>
            </div>
          )}
          {/* Template editor modal - explicit viewport overlay, never inline list content. */}
          {tplPreview && (
            <div
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 100000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 16,
                background: 'rgba(0,0,0,0.72)',
                backdropFilter: 'blur(4px)',
              }}
              onClick={() => { setTplPreview(null); setAiOpen(false) }}
            >
            <div className="w-full max-w-6xl rounded-xl p-4 overflow-auto" style={{ background: 'var(--surface)', border: '1px solid #2a2d42', maxHeight: '92vh', boxShadow: '0 24px 80px rgba(0,0,0,0.45)' }} onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-start mb-3 gap-3 flex-wrap">
                <div>
                  <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>{tplPreview.name}</h2>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{tplMode === 'edit' ? 'Editing template source - variables like {{client_name}} are filled when a document is generated.' : (tplClientId ? 'Preview filled for selected client.' : 'Preview with placeholders. Pick a client above to fill known fields.')}</p>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <ThemedSelect style={{ ...is, width: 'auto', minWidth: 160 }} value={tplClientId} onChange={e => setTplClientId(e.target.value)}>
                    <option value="">- No client -</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </ThemedSelect>
                  <button className="px-4 rounded-lg text-base font-semibold" style={{ background: 'var(--purple-soft, rgba(168,85,247,0.2))', color: 'var(--purple, #a855f7)', border: '1px solid var(--purple, #a855f7)', minHeight: 48 }} onClick={openAI}>AI Edit</button>
                  <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                    <button className="px-3 text-sm font-medium" style={{ background: tplMode === 'preview' ? 'var(--accent)' : 'var(--surface2)', color: tplMode === 'preview' ? 'var(--accent-text)' : 'var(--text-muted)', minHeight: 48 }} onClick={() => setTplMode('preview')}>Preview</button>
                    <button className="px-3 text-sm font-medium" style={{ background: tplMode === 'edit' ? 'var(--accent)' : 'var(--surface2)', color: tplMode === 'edit' ? 'var(--accent-text)' : 'var(--text-muted)', minHeight: 48 }} onClick={() => { setTplMode('edit'); setTplDraft(tplPreview.rawBody || '') }}>Edit</button>
                  </div>
                  {tplMode === 'preview' ? (
                    <>
                      <button className="px-4 rounded-lg text-base font-medium" style={{ background: 'var(--accent)', color: 'var(--accent-text)', minHeight: 48 }} onClick={() => useTemplate(tplPreview.id, tplClientId)}>Create</button>
                      <button className="px-4 rounded-lg text-base font-medium" style={{ background: 'var(--green)', color: 'var(--accent-text)', minHeight: 48 }} onClick={() => copyHtml(tplPreview.body, tplPreview.name)}>Copy HTML</button>
                    </>
                  ) : (
                    <button className="px-4 rounded-lg text-base font-medium" style={{ background: 'var(--green)', color: 'var(--accent-text)', minHeight: 48, opacity: tplSaving ? 0.6 : 1 }} onClick={saveTemplate} disabled={tplSaving}>{tplSaving ? 'Saving...' : 'Save'}</button>
                  )}
                  <button className="px-3 rounded-lg text-sm font-medium" style={{ background: 'var(--surface2)', color: 'var(--text-muted)', border: '1px solid var(--border)', minHeight: 48 }} onClick={() => { setTplPreview(null); setAiOpen(false) }}>✕ Close</button>
                </div>
              </div>
              {aiOpen && (
                <div className="rounded-lg p-3 mb-3" style={{ background: 'var(--purple-soft, rgba(168,85,247,0.15))', border: '2px solid var(--purple, #a855f7)' }}>
                  <div className="flex items-center gap-2 mb-2">
                    <span style={{ fontSize: 22 }}>AI</span>
                    <span className="text-sm font-semibold" style={{ color: 'var(--text)' }}>AI edit this template</span>
                    <span className="ml-auto text-xs" style={{ color: 'var(--text-muted)' }}>{lastSel.start !== lastSel.end ? `${lastSel.end - lastSel.start} chars selected - only that text changes` : 'No selection - applies to the whole template'}</span>
                    <button onClick={() => { setAiOpen(false); setAiInstruction('') }} className="text-base" style={{ background: 'transparent', color: 'var(--text-muted)', padding: '0 8px', minHeight: 32 }}>✕</button>
                  </div>
                  <div className="flex gap-2">
                    <input ref={aiInputRef} value={aiInstruction} onChange={e => setAiInstruction(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !aiBusy) { e.preventDefault(); askAI() } }} placeholder="e.g. 'soften the disclaimer', 'add a data-handling section'" style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', padding: '12px 14px', borderRadius: 6, fontSize: 15, outline: 'none', minHeight: 48 }} disabled={aiBusy} />
                    <button onClick={askAI} disabled={aiBusy || !aiInstruction.trim()} className="px-6 rounded-lg text-base font-semibold" style={{ background: aiBusy || !aiInstruction.trim() ? 'var(--surface)' : 'var(--purple, #a855f7)', color: aiBusy || !aiInstruction.trim() ? 'var(--text-muted)' : 'white', minHeight: 48, minWidth: 120 }}>{aiBusy ? 'Applying...' : 'Apply'}</button>
                  </div>
                </div>
              )}
              {tplLoading ? (
                <div className="text-center py-16" style={{ color: 'var(--text-muted)' }}>Loading template...</div>
              ) : tplMode === 'preview' ? (
                <div className="rounded-lg p-6" style={{ background: '#ffffff', color: '#111', maxHeight: '68vh', overflow: 'auto' }} dangerouslySetInnerHTML={{ __html: renderEmailHtml(tplPreview.body, tplPreview.name) }} />
              ) : (
                <textarea ref={textareaRef} value={tplDraft} onChange={e => setTplDraft(e.target.value)} onSelect={e => setLastSel({ start: e.target.selectionStart, end: e.target.selectionEnd })} onBlur={e => setLastSel({ start: e.target.selectionStart, end: e.target.selectionEnd })} style={{ ...is, minHeight: '68vh', background: '#ffffff', color: '#111', fontFamily: 'ui-monospace, monospace', fontSize: 13, lineHeight: 1.5 }} placeholder="Markdown template body with {{placeholder}} variables..." />
              )}
            </div>
            </div>
          )}

          {filteredTemplates.length === 0 ? (
            <div className="text-center py-16">
              <p style={{ color: 'var(--text-muted)' }}>{templates.length === 0 ? 'No templates yet. Create a template to start reusable document generation.' : 'No templates match your filter.'}</p>
            </div>
          ) : templateView === 'list' ? (
            <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              {pagedTemplates.map(t => (
                <div key={t.id} className="template-list-row grid gap-3 items-center px-4 py-3 cursor-pointer" style={{ gridTemplateColumns: '28px 46px minmax(0, 1.5fr) minmax(120px, 0.7fr) 92px 90px auto', borderBottom: '1px solid var(--border)' }} onClick={() => openTemplate(t)}>
                  <input type="checkbox" checked={selectedTemplates.includes(t.id)} onChange={e => setSelectedTemplates(ids => e.target.checked ? [...ids, t.id] : ids.filter(id => id !== t.id))} onClick={e => e.stopPropagation()} aria-label={`Select ${t.name}`} />
                  <DocumentThumb doc={{ requiresSignature: t.requiresSignature, templateName: t.name }} compact />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <button className="font-semibold truncate text-left" style={{ color: 'var(--text)', background: 'transparent', border: 0, padding: 0, minWidth: 0 }} onClick={e => { e.stopPropagation(); openTemplate(t) }}>{t.name}</button>
                      <button className="text-[11px] px-2 py-0.5 rounded-full font-semibold" style={{ background: 'var(--surface2)', color: 'var(--accent)', border: '1px solid var(--border)', flex: '0 0 auto' }} onClick={e => { e.stopPropagation(); openTemplate(t) }}>Edit</button>
                    </div>
                    <div className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{t.description || t.id}</div>
                  </div>
                  <div className="text-sm truncate" style={{ color: 'var(--text)' }}>{t.category || 'Uncategorized'}</div>
                  <span className="text-xs px-2 py-1 rounded-full text-center font-medium" style={{ background: t.requiresSignature ? 'rgba(245,158,11,0.15)' : 'var(--surface2)', color: t.requiresSignature ? 'var(--amber)' : 'var(--text-muted)' }}>{t.requiresSignature ? 'sign' : 'draft'}</span>
                  <div className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{(t.placeholders || []).length} fields</div>
                  <div className="flex gap-1 justify-end flex-wrap" onClick={e => e.stopPropagation()}>
                    <ItemActionsMenu
                      label={`Actions for ${t.name}`}
                      actions={[
                        { label: 'Edit template', onClick: () => openTemplate(t) },
                        { label: 'Use template', onClick: () => useTemplate(t.id) },
                        { label: 'Copy template', onClick: () => duplicateTemplate(t) },
                        { label: 'Delete template', tone: 'danger', onClick: () => deleteTemplate(t) },
                      ]}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
              {pagedTemplates.map(t => (
                <div key={t.id} className="rounded-lg flex flex-col" style={{ background: 'var(--surface)', border: '1px solid var(--border)', padding: 12, gap: 10, cursor: 'pointer' }} onClick={() => openTemplate(t)}>
                  <div className="flex gap-3 min-w-0">
                    <input type="checkbox" checked={selectedTemplates.includes(t.id)} onChange={e => setSelectedTemplates(ids => e.target.checked ? [...ids, t.id] : ids.filter(id => id !== t.id))} onClick={e => e.stopPropagation()} aria-label={`Select ${t.name}`} style={{ alignSelf: 'start', marginTop: 4 }} />
                    <DocumentThumb doc={{ requiresSignature: t.requiresSignature, templateName: t.name }} compact />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm leading-tight truncate" style={{ color: 'var(--text)' }}>{t.name}</div>
                      <div className="text-xs truncate mt-1" style={{ color: 'var(--text-muted)' }}>{t.category || 'Uncategorized'} · {(t.placeholders || []).length} fields</div>
                    </div>
                  </div>
                  <div className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>{t.description || t.id}</div>
                  <div className="flex gap-1 pt-1 flex-wrap mt-auto" onClick={e => e.stopPropagation()}>
                    <ItemActionsMenu
                      label={`Actions for ${t.name}`}
                      actions={[
                        { label: 'Edit template', onClick: () => openTemplate(t) },
                        { label: 'Use template', onClick: () => useTemplate(t.id) },
                        { label: 'Copy template', onClick: () => duplicateTemplate(t) },
                        { label: 'Delete template', tone: 'danger', onClick: () => deleteTemplate(t) },
                      ]}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
          {filteredTemplates.length > 0 && (
            <Paginator total={filteredTemplates.length} page={templatePage} pageSize={templatePageSize} onPage={setTemplatePage} onPageSize={setTemplatePageSize} label="templates" />
          )}
        </div>
      )}

      {formEditorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }} onClick={() => setFormEditorOpen(false)}>
          <div className="w-full max-w-4xl rounded-xl p-6 max-h-[92vh] overflow-auto" style={{ background: 'var(--surface)', border: '1px solid #2a2d42' }} onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start gap-3 mb-4 flex-wrap">
              <div>
                <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>{formDraft.id ? 'Edit Form' : 'New Form'}</h2>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Build embeddable intake forms for landing pages, automations, leads, and content workflows.</p>
              </div>
              <button className="px-3 rounded-lg text-base font-semibold" aria-label="Close form editor" style={{ background: 'var(--surface2)', color: 'var(--text-muted)', minHeight: 40, border: '1px solid var(--border)' }} onClick={() => setFormEditorOpen(false)}>X</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
              <input style={is} placeholder="Form title" value={formDraft.title} onChange={e => setFormDraft(f => ({ ...f, title: e.target.value }))} />
              <ThemedSelect style={is} value={formDraft.status} onChange={e => setFormDraft(f => ({ ...f, status: e.target.value }))}>
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="archived">Archived</option>
              </ThemedSelect>
              <input style={is} placeholder="Destination (leads, automations, content-lab)" value={formDraft.destination} onChange={e => setFormDraft(f => ({ ...f, destination: e.target.value }))} />
              <input style={is} placeholder="Automation hook or note" value={formDraft.automation} onChange={e => setFormDraft(f => ({ ...f, automation: e.target.value }))} />
              <textarea className="md:col-span-2" style={{ ...is, minHeight: 80 }} placeholder="Short public description" value={formDraft.description} onChange={e => setFormDraft(f => ({ ...f, description: e.target.value }))} />
            </div>

            <div className="rounded-lg p-3 mb-3" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Fields</div>
                <button className="px-3 rounded-lg text-sm font-semibold" style={{ background: 'var(--accent)', color: 'var(--accent-text)', minHeight: 36 }} onClick={addFormField}>Add Field</button>
              </div>
              <div className="grid gap-3">
                {(formDraft.fields || []).map((field, index) => (
                  <div key={field.id || index} className="form-field-row grid gap-2 items-center" style={{ gridTemplateColumns: 'minmax(120px,1fr) minmax(110px,0.8fr) minmax(100px,0.65fr) 92px auto' }}>
                    <input style={is} placeholder="Label" value={field.label || ''} onChange={e => updateFormField(index, 'label', e.target.value)} />
                    <input style={is} placeholder="key_name" value={field.key || ''} onChange={e => updateFormField(index, 'key', e.target.value)} />
                    <ThemedSelect style={is} value={field.type || 'text'} onChange={e => updateFormField(index, 'type', e.target.value)}>
                      {FORM_FIELD_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
                    </ThemedSelect>
                    <label className="flex items-center gap-2 text-xs rounded-lg px-2" style={{ ...is, display: 'flex', minHeight: 40 }}>
                      <input type="checkbox" checked={!!field.required} onChange={e => updateFormField(index, 'required', !!e.target.checked)} />
                      Required
                    </label>
                    <button className="px-3 rounded-lg text-sm font-medium" style={{ background: 'var(--surface)', color: 'var(--red)', minHeight: 40, border: '1px solid var(--border)' }} onClick={() => removeFormField(index)} disabled={(formDraft.fields || []).length <= 1}>Del</button>
                    {field.type === 'select' && (
                      <textarea className="md:col-span-5" style={{ ...is, minHeight: 70 }} placeholder="Select options, one per line" value={field.options || ''} onChange={e => updateFormField(index, 'options', e.target.value)} />
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4">
              <div className="rounded-lg p-3" style={{ background: '#ffffff', color: '#111', border: '1px solid var(--border)' }}>
                <div className="font-semibold mb-1">{formDraft.title || 'Untitled Form'}</div>
                {formDraft.description && <div className="text-xs mb-3" style={{ color: '#62584d' }}>{formDraft.description}</div>}
                <div className="grid gap-2">
                  {(formDraft.fields || []).map((field, index) => (
                    <label key={field.id || index} className="text-xs font-semibold" style={{ display: 'grid', gap: 4 }}>
                      {field.label || 'Field'}{field.required ? ' *' : ''}
                      <div style={{ minHeight: field.type === 'textarea' ? 64 : 34, border: '1px solid #d8cfc2', borderRadius: 6, background: '#fafafa' }} />
                    </label>
                  ))}
                </div>
              </div>
              <div className="rounded-lg p-3" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                <div className="text-sm font-semibold mb-2" style={{ color: 'var(--text)' }}>Embed</div>
                <textarea readOnly style={{ ...is, minHeight: 140, fontFamily: 'ui-monospace, monospace', fontSize: 12 }} value={formDraft.embedCode || (formDraft.id ? `<iframe src="/forms/${formDraft.id}/embed" title="${formDraft.title || 'Form'}" style="width:100%;min-height:720px;border:0;border-radius:8px;"></iframe>` : 'Save this form to generate an embed code.')} />
                <div className="flex gap-2 mt-2 flex-wrap">
                  {formDraft.id && <button className="px-3 rounded-lg text-sm font-semibold" style={{ background: 'var(--accent)', color: 'var(--accent-text)', minHeight: 38 }} onClick={() => copyText(formDraft.embedCode, 'Embed code copied')}>Copy Embed</button>}
                  {formDraft.id && <button className="px-3 rounded-lg text-sm font-medium" style={{ background: 'var(--surface)', color: 'var(--accent)', minHeight: 38, border: '1px solid var(--border)' }} onClick={() => openFormPreview(formDraft)}>Preview Form</button>}
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <button className="flex-1 py-2.5 rounded-lg text-sm font-semibold" style={{ background: 'var(--green)', color: 'var(--accent-text)' }} onClick={saveFormDraft}>Save Form</button>
              <button className="px-4 py-2.5 rounded-lg text-sm" style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }} onClick={() => setFormEditorOpen(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {formPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }} onClick={() => setFormPreview(null)}>
          <div className="w-full max-w-6xl rounded-xl max-h-[92vh] overflow-hidden flex flex-col" style={{ background: 'var(--surface)', border: '1px solid #2a2d42' }} onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b flex items-start justify-between gap-3 flex-wrap" style={{ borderColor: 'var(--border)' }}>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold truncate" style={{ color: 'var(--text)' }}>{formPreview.title || 'Untitled Form'}</h2>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{formPreview.destination || 'leads'} · {(formPreview.fields || []).length} fields · {formPreview.submissionsCount || 0} submissions</p>
              </div>
              <div className="flex gap-2 flex-wrap">
                <button className="px-4 rounded-lg text-sm font-semibold" style={{ background: 'var(--surface2)', color: 'var(--accent)', minHeight: 40, border: '1px solid var(--border)' }} onClick={() => { const next = formPreview; setFormPreview(null); openFormEditor(next) }}>Edit</button>
                <button className="px-4 rounded-lg text-sm font-medium" style={{ background: 'var(--surface2)', color: 'var(--text-muted)', minHeight: 40, border: '1px solid var(--border)' }} onClick={() => copyText(formPreview.embedCode || `<iframe src="${formPreview.publicUrl || `/forms/${formPreview.id}/embed`}" title="${formPreview.title || 'Form'}" style="width:100%;min-height:720px;border:0;border-radius:8px;"></iframe>`, 'Embed code copied')}>Embed</button>
                {formPreview.publicUrl && <button className="px-4 rounded-lg text-sm font-medium" style={{ background: 'var(--surface2)', color: 'var(--accent)', minHeight: 40, border: '1px solid var(--border)' }} onClick={() => window.open(formPreview.publicUrl, '_blank', 'noopener,noreferrer')}>External</button>}
                <button className="px-4 rounded-lg text-sm" style={{ background: 'var(--surface2)', color: 'var(--text-muted)', minHeight: 40, border: '1px solid var(--border)' }} onClick={() => setFormPreview(null)}>Close</button>
              </div>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] gap-0 min-h-0 flex-1">
              <aside className="p-4 border-r overflow-auto" style={{ borderColor: 'var(--border)', background: 'var(--surface2)' }}>
                <div className="text-[11px] uppercase font-semibold mb-2" style={{ color: 'var(--text-muted)', letterSpacing: 0 }}>Form details</div>
                <p className="text-sm mb-4" style={{ color: 'var(--text)' }}>{formPreview.description || 'No description set.'}</p>
                <div className="grid gap-2">
                  {(formPreview.fields || []).map((field, index) => (
                    <div key={field.id || field.key || index} className="rounded-lg p-2" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                      <div className="text-xs font-semibold" style={{ color: 'var(--text)' }}>{field.label || field.key || 'Field'}{field.required ? ' *' : ''}</div>
                      <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{field.type || 'text'} · {field.key || `field_${index + 1}`}</div>
                    </div>
                  ))}
                </div>
              </aside>
              <div className="p-4 min-h-0" style={{ background: 'var(--surface)' }}>
                <div className="rounded-lg overflow-hidden h-[68vh]" style={{ background: '#ffffff', border: '1px solid var(--border)' }}>
                  {formPreview.publicUrl ? (
                    <iframe title={formPreview.title || 'Form preview'} src={formPreview.publicUrl} style={{ width: '100%', height: '100%', border: 0, background: '#ffffff' }} />
                  ) : (
                    <div className="h-full grid place-items-center p-6 text-center" style={{ color: '#4b5563' }}>
                      Save this form before previewing the public viewport.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {signatureRequestOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }} onClick={() => { setSignatureRequestOpen(false); setSignatureDraft(EMPTY_SIGNATURE_DRAFT) }}>
          <div className="w-full max-w-2xl rounded-xl p-6 animate-fade-in max-h-[92vh] overflow-auto" style={{ background: 'var(--surface)', border: '1px solid #2a2d42' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h2 className="text-lg font-semibold mb-1 flex items-center gap-2" style={{ color: 'var(--text)' }}>
                  <FileSignature size={20} aria-hidden="true" />
                  Request E-Signature
                </h2>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Attach a CRM document, send a secure signing link, and keep the hash/audit trail in Documents.</p>
              </div>
              <button className="px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }} onClick={() => { setSignatureRequestOpen(false); setSignatureDraft(EMPTY_SIGNATURE_DRAFT) }}>Close</button>
            </div>

            <div className="grid gap-3 mb-4">
              <div>
                <label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-muted)' }}>Document</label>
                <ThemedSelect style={is} value={signatureDraft.documentId} onChange={e => selectSignatureDocument(e.target.value)}>
                  <option value="">- Pick a document -</option>
                  {signatureAttachableDocs.map(doc => (
                    <option key={doc.id} value={doc.id}>{doc.title} {doc.clientName ? `- ${doc.clientName}` : ''}</option>
                  ))}
                </ThemedSelect>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-muted)' }}>Signer name</label>
                  <input style={is} value={signatureDraft.signerName} onChange={e => setSignatureDraft(d => ({ ...d, signerName: e.target.value }))} placeholder="Client signer name" />
                </div>
                <div>
                  <label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-muted)' }}>Signer email</label>
                  <input style={is} type="email" value={signatureDraft.signerEmail} onChange={e => setSignatureDraft(d => ({ ...d, signerEmail: e.target.value }))} placeholder="name@example.com" />
                </div>
              </div>
            </div>

            {selectedSignatureDoc && (
              <div className="rounded-lg p-3 mb-4 text-sm" style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                <div className="font-semibold mb-1">{selectedSignatureDoc.title}</div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{docTypeLabel(selectedSignatureDoc)} - {selectedSignatureDoc.clientName || 'Global document'}</div>
                <div className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
                  Current signature state: {signatureStatusLabel(signatureWorkflowState(selectedSignatureDoc))}
                </div>
              </div>
            )}

            <div className="flex gap-2 flex-wrap justify-end">
              <button className="px-4 py-2.5 rounded-lg text-sm" style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }} onClick={() => { setSignatureRequestOpen(false); setShowForm(true) }}>New Document</button>
              <button className="px-4 py-2.5 rounded-lg text-sm font-semibold inline-flex items-center gap-2 disabled:opacity-50" style={{ background: 'var(--accent)', color: 'var(--accent-text)' }} onClick={submitSignatureRequest} disabled={!selectedSignatureDoc || !signatureDraft.signerEmail.trim() || signingDocId === signatureDraft.documentId}>
                <Send size={15} aria-hidden="true" />
                {signingDocId === signatureDraft.documentId ? 'Sending...' : 'Send Signature Request'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }} onClick={() => { setShowForm(false); resetForm() }}>
          <div className="w-full max-w-3xl rounded-xl p-6 animate-fade-in max-h-[92vh] overflow-auto" style={{ background: 'var(--surface)', border: '1px solid #2a2d42' }} onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-1" style={{ color: 'var(--text)' }}>New Document</h2>
            <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>Pick a template, fill the basics, dictate the scope, and let AI draft the rest.</p>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-muted)' }}>Template</label>
                <ThemedSelect style={is} value={selectedTemplateId} onChange={e => setSelectedTemplateId(e.target.value)}>
                  <option value="">- Pick a template -</option>
                  {Object.entries(byCategory).map(([cat, tpls]) => (
                    <optgroup key={cat} label={cat}>
                      {tpls.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </optgroup>
                  ))}
                </ThemedSelect>
                {selectedTemplate && <p className="text-[10px] mt-1 italic" style={{ color: 'var(--text-muted)' }}>{selectedTemplate.description}</p>}
              </div>
              <div>
                <label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-muted)' }}>Client</label>
                {lockClient ? (
                  <div style={{ ...is, background: 'var(--surface2)' }}>{selectedClient?.name || 'This account'}</div>
                ) : (
                <ThemedSelect style={is} value={selectedClientId} onChange={e => setSelectedClientId(e.target.value)}>
                  <option value="">- Pick a client (optional) -</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </ThemedSelect>
                )}
              </div>
            </div>

            {selectedTemplate && (
              <>
                <div className="mb-3 rounded-lg p-3" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                  <div className="text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>Fields (auto-filled where possible)</div>
                  <div className="grid grid-cols-2 gap-2">
                    {selectedTemplate.placeholders.filter(p => !SCOPE_KEYS.includes(p)).map(p => (
                      <div key={p}>
                        <label className="block text-[10px] mb-0.5" style={{ color: 'var(--text-muted)' }}>{LABELS[p] || p}</label>
                        <input style={{ ...is, padding: '6px 8px', fontSize: 12, background: 'var(--surface)' }} value={fields[p] || ''} onChange={e => updateField(p, e.target.value)} />
                      </div>
                    ))}
                  </div>
                </div>

                {scopeKey && (
                  <div className="mb-3">
                    <label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-muted)' }}>Dictate the scope in your own words - AI will expand it into formal prose</label>
                    <textarea style={{ ...is, minHeight: 110, fontFamily: 'inherit' }} placeholder="e.g. We're building them a marketing site on Next.js with about eight pages, a blog, and a contact form hooked into Gmail. They want a booking calendar on the services page. Launch by end of May. I'll provide hosting for the first year." value={dictation} onChange={e => setDictation(e.target.value)} />
                  </div>
                )}

                <div className="flex gap-2 mb-3">
                  <button className="flex-1 py-2 rounded-lg text-sm font-semibold" style={{ background: 'var(--accent)', color: 'var(--accent-text)', opacity: generating ? 0.6 : 1 }} onClick={generate} disabled={generating}>{generating ? 'Generating with AI...' : draftBody ? 'Regenerate Draft' : 'Generate Draft'}</button>
                </div>
              </>
            )}

            {draftBody && (
              <div className="mb-3">
                <div className="rounded-lg p-3 mb-3" style={{ background: 'rgba(168,85,247,0.12)', border: '1px solid var(--border)' }}>
                  <div className="flex gap-2 items-center flex-wrap">
                    <input value={draftAiInstruction} onChange={e => setDraftAiInstruction(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !draftAiBusy) { e.preventDefault(); applyDraftAI() } }} placeholder="Tell AI what to change. Highlight text first to change only that part." style={{ flex: 1, minWidth: 240, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', padding: '10px 12px', borderRadius: 6, fontSize: 14, outline: 'none', minHeight: 44 }} disabled={draftAiBusy} />
                    <button onClick={applyDraftAI} disabled={draftAiBusy || !draftAiInstruction.trim()} className="px-5 rounded-lg text-sm font-semibold" style={{ background: draftAiBusy || !draftAiInstruction.trim() ? 'var(--surface)' : 'var(--purple, #a855f7)', color: draftAiBusy || !draftAiInstruction.trim() ? 'var(--text-muted)' : 'white', minHeight: 44, minWidth: 96 }}>{draftAiBusy ? 'Applying...' : 'Apply'}</button>
                  </div>
                  <div className="text-[10px] mt-2" style={{ color: 'var(--text-muted)' }}>{draftSel.start !== draftSel.end ? `${draftSel.end - draftSel.start} chars selected - AI changes only that section.` : 'No text selected - AI applies your instruction to the whole draft.'}</div>
                </div>
                <label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-muted)' }}>Generated Draft (you can edit directly)</label>
                <textarea ref={draftTextareaRef} style={{ ...is, minHeight: 360, background: '#ffffff', color: '#111', fontFamily: 'ui-monospace, monospace', fontSize: 12 }} value={draftBody} onChange={e => setDraftBody(e.target.value)} onSelect={e => setDraftSel({ start: e.target.selectionStart, end: e.target.selectionEnd })} onBlur={e => setDraftSel({ start: e.target.selectionStart, end: e.target.selectionEnd })} />
                <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>Review this carefully before sending. This is a starting draft - have your attorney approve anything substantive.</p>
              </div>
            )}

            <div className="flex gap-2">
              <button className="flex-1 py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50" style={{ background: 'var(--green)', color: 'var(--accent-text)' }} onClick={save} disabled={!draftBody || saving}>{saving ? 'Saving...' : 'Save Document'}</button>
              <button className="px-4 py-2.5 rounded-lg text-sm" style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }} onClick={() => { setShowForm(false); resetForm() }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {viewDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }} onClick={() => { setViewDoc(null); setDocEditMode(false) }}>
          <div className="w-full max-w-3xl rounded-xl p-6 max-h-[92vh] overflow-auto" style={{ background: 'var(--surface)', border: '1px solid #2a2d42' }} onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4 gap-3 flex-wrap">
              <div>
                <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>{viewDoc.title}</h2>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{viewDoc.templateName} · {viewDoc.clientName} · Created {fmtDate(viewDoc.createdAt)}</p>
              </div>
              <div className="flex gap-2 flex-wrap">
                <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                  <button className="px-3 text-sm font-medium" style={{ background: viewMode === 'formatted' ? 'var(--accent)' : 'var(--surface2)', color: viewMode === 'formatted' ? 'var(--accent-text)' : 'var(--text-muted)', minHeight: 48 }} onClick={() => setViewMode('formatted')}>Formatted</button>
                  <button className="px-3 text-sm font-medium" style={{ background: viewMode === 'raw' ? 'var(--accent)' : 'var(--surface2)', color: viewMode === 'raw' ? 'var(--accent-text)' : 'var(--text-muted)', minHeight: 48 }} onClick={() => setViewMode('raw')}>Raw</button>
                </div>
                <button className="px-4 rounded-lg text-base font-semibold" style={{ background: viewDoc.portalVisible === true ? 'var(--green)' : 'var(--surface2)', color: viewDoc.portalVisible === true ? 'var(--accent-text)' : 'var(--text-muted)', minHeight: 48, border: '1px solid var(--border)' }} title={viewDoc.portalVisible === true ? 'Visible in the client portal' : 'Hidden from the client portal'} onClick={() => setPortalShare(viewDoc, viewDoc.portalVisible !== true)}>{viewDoc.portalVisible === true ? 'Shared with client' : 'Not shared'}</button>
                {docNeedsSignature(viewDoc) && viewDoc.status !== 'signed' && (
                  <button className="px-4 rounded-lg text-base font-semibold" style={{ background: 'var(--amber)', color: 'var(--accent-text)', minHeight: 48, opacity: signingDocId === viewDoc.id ? 0.6 : 1 }} onClick={() => sendSignatureRequest(viewDoc)} disabled={signingDocId === viewDoc.id}>{signingDocId === viewDoc.id ? 'Sending...' : 'Sign'}</button>
                )}
                {docEditMode ? (
                  <button className="px-4 rounded-lg text-base font-semibold" style={{ background: 'var(--green)', color: 'var(--accent-text)', minHeight: 48, opacity: docSaving ? 0.6 : 1 }} onClick={saveDocEdits} disabled={docSaving}>{docSaving ? 'Saving...' : 'Save'}</button>
                ) : (
                  <button className="px-4 rounded-lg text-base font-medium" style={{ background: 'var(--surface2)', color: 'var(--accent)', minHeight: 48, border: '1px solid var(--border)' }} onClick={() => { setDocDraftBody(viewDoc.body || ''); setDocEditMode(true) }}>Edit</button>
                )}
                <button className="px-4 rounded-lg text-base font-semibold" style={{ background: 'var(--accent)', color: 'var(--accent-text)', minHeight: 48, opacity: sendingDoc ? 0.6 : 1 }} onClick={() => sendDoc(viewDoc)} disabled={sendingDoc}>{sendingDoc ? 'Sending...' : 'Send'}</button>
                <button className="px-4 rounded-lg text-base font-medium" style={{ background: 'var(--green)', color: 'var(--accent-text)', minHeight: 48 }} onClick={() => copyHtml(viewDoc.body, viewDoc.title)}>Copy</button>
                <button className="px-4 rounded-lg text-base font-medium" style={{ background: 'var(--surface2)', color: 'var(--text-muted)', minHeight: 48 }} onClick={() => downloadPdf(viewDoc.id)}>PDF</button>
                <button className="px-4 rounded-lg text-base" style={{ background: 'var(--surface2)', color: 'var(--text-muted)', minHeight: 48 }} onClick={() => { setViewDoc(null); setDocEditMode(false) }}>Close</button>
              </div>
            </div>
            {docNeedsSignature(viewDoc) && (
              <div className="rounded-lg p-3 mb-3 text-sm" style={{ background: viewDoc.status === 'signed' ? 'rgba(166,227,161,0.12)' : 'rgba(245,158,11,0.12)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                Signature: {viewDoc.signature?.status === 'pending' ? `link sent to ${viewDoc.signature.signerEmail}` : viewDoc.signature?.status === 'signed' ? `signed by ${viewDoc.signature.signerName} on ${fmtDate(viewDoc.signature.signedAt)}` : 'required'}
                {viewDoc.signature?.documentHash && <div className="text-xs mt-1 font-mono" style={{ color: 'var(--text-muted)' }}>SHA-256 {viewDoc.signature.documentHash}</div>}
                {(viewDoc.signature?.signUrl || lastSignaturePayload?.signUrl) && (
                  <div className="mt-3 rounded-lg p-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
                    <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>E-sign payload</div>
                    <div className="grid gap-2 text-xs">
                      <div><strong>Signer:</strong> {viewDoc.signature?.signerName || lastSignaturePayload?.signerName || ''} &lt;{viewDoc.signature?.signerEmail || lastSignaturePayload?.signerEmail || ''}&gt;</div>
                      {viewDoc.signature?.requestedAt && <div><strong>Requested:</strong> {new Date(viewDoc.signature.requestedAt).toLocaleString()}</div>}
                      {viewDoc.signature?.expiresAt && <div><strong>Expires:</strong> {new Date(viewDoc.signature.expiresAt).toLocaleString()}</div>}
                      <div className="font-mono break-all rounded p-2" style={{ background: 'var(--surface2)', color: 'var(--text)' }}>{viewDoc.signature?.signUrl || lastSignaturePayload?.signUrl}</div>
                      <div className="flex gap-2 flex-wrap">
                        <button className="px-3 rounded-lg text-xs font-semibold" style={{ background: 'var(--accent)', color: 'var(--accent-text)', minHeight: 36 }} onClick={() => copyText(viewDoc.signature?.signUrl || lastSignaturePayload?.signUrl, 'Signing link copied')}>Copy Link</button>
                        <button className="px-3 rounded-lg text-xs font-semibold" style={{ background: 'var(--surface2)', color: 'var(--accent)', border: '1px solid var(--border)', minHeight: 36 }} onClick={() => window.open(viewDoc.signature?.signUrl || lastSignaturePayload?.signUrl, '_blank', 'noopener,noreferrer')}>Open Link</button>
                        <button className="px-3 rounded-lg text-xs font-semibold" style={{ background: 'var(--surface2)', color: 'var(--text-muted)', border: '1px solid var(--border)', minHeight: 36 }} onClick={() => copyText(JSON.stringify(lastSignaturePayload || {
                          documentId: viewDoc.id,
                          title: viewDoc.title,
                          signerName: viewDoc.signature?.signerName,
                          signerEmail: viewDoc.signature?.signerEmail,
                          signUrl: viewDoc.signature?.signUrl,
                          expiresAt: viewDoc.signature?.expiresAt,
                          documentHash: viewDoc.signature?.documentHash,
                          consentVersion: viewDoc.signature?.consentVersion,
                        }, null, 2), 'E-sign payload copied')}>Copy Payload</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
            {docEditMode ? (
              <div>
                <div className="rounded-lg p-3 mb-3" style={{ background: 'rgba(168,85,247,0.12)', border: '1px solid var(--border)' }}>
                  <div className="flex gap-2 items-center flex-wrap">
                    <input value={docAiInstruction} onChange={e => setDocAiInstruction(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !docAiBusy) { e.preventDefault(); applyDocAI() } }} placeholder="Tell AI what to change. Highlight text first to change only that part." style={{ flex: 1, minWidth: 240, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', padding: '10px 12px', borderRadius: 6, fontSize: 14, outline: 'none', minHeight: 44 }} disabled={docAiBusy} />
                    <button onClick={applyDocAI} disabled={docAiBusy || !docAiInstruction.trim()} className="px-5 rounded-lg text-sm font-semibold" style={{ background: docAiBusy || !docAiInstruction.trim() ? 'var(--surface)' : 'var(--purple, #a855f7)', color: docAiBusy || !docAiInstruction.trim() ? 'var(--text-muted)' : 'white', minHeight: 44, minWidth: 96 }}>{docAiBusy ? 'Applying...' : 'Apply'}</button>
                  </div>
                  <div className="text-[10px] mt-2" style={{ color: 'var(--text-muted)' }}>{docSel.start !== docSel.end ? `${docSel.end - docSel.start} chars selected - AI changes only that section.` : 'No text selected - AI applies your instruction to the whole document.'}</div>
                </div>
                <textarea ref={docTextareaRef} style={{ ...is, minHeight: '58vh', background: '#ffffff', color: '#111', fontFamily: 'ui-monospace, monospace', fontSize: 12, lineHeight: 1.5 }} value={docDraftBody} onChange={e => setDocDraftBody(e.target.value)} onSelect={e => setDocSel({ start: e.target.selectionStart, end: e.target.selectionEnd })} onBlur={e => setDocSel({ start: e.target.selectionStart, end: e.target.selectionEnd })} />
              </div>
            ) : viewMode === 'formatted' ? (
              <div className="rounded-lg p-6" style={{ background: '#ffffff', color: '#111', maxHeight: '65vh', overflow: 'auto' }} dangerouslySetInnerHTML={{ __html: /^\s*</.test(viewDoc.body || '') ? viewDoc.body : renderEmailHtml(viewDoc.body, viewDoc.title) }} />
            ) : (
              <pre className="rounded-lg p-4 whitespace-pre-wrap font-mono text-xs leading-relaxed" style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', maxHeight: '65vh', overflow: 'auto' }}>{viewDoc.body}</pre>
            )}
          </div>
        </div>
      )}

    </div>
  )
}
