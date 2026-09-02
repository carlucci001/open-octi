import { getCred } from '@/lib/agent-creds'
import { findClient as findClientRecord } from '@/lib/clients'
import { buildEmail } from '@/lib/emailSignature'
import { logActivity } from '@/lib/entityStore'
import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import PDFDocument from 'pdfkit'
import path from 'path'
import fs from 'fs'
import { requireCrmRead, requireCrmWrite } from '@/lib/permissions'
import {
  clientIp,
  createSignatureToken,
  hashDocumentForSignature,
  hashSignatureToken,
  isSignatureRequired,
  loadDocumentData,
  publicOrigin,
  saveDocumentData,
  signingConfiguration,
  signatureCertificateLines,
} from '@/lib/documentSignatures'
import { isOpenOcti } from '@/lib/edition'
import { brandAssetsFor } from '@/lib/brand-assets'
import { openclawChat } from '@/lib/openclaw-client'

const TEMPLATES_DIR = path.join(process.cwd(), 'data', 'document-templates')

function genId() { return 'doc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8) }
function genFormId() { return 'form_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8) }

function loadDocs() { return loadDocumentData() }
function saveDocs(data) { saveDocumentData(data) }

function ensureDocumentStore(data) {
  if (!Array.isArray(data.documents)) data.documents = []
  if (!Array.isArray(data.forms)) data.forms = []
  if (!Array.isArray(data.formSubmissions)) data.formSubmissions = []
  return data
}

function normalizeFormFields(fields = []) {
  const allowed = new Set(['text', 'email', 'phone', 'textarea', 'select', 'checkbox', 'date', 'number'])
  return (Array.isArray(fields) ? fields : []).map((field, index) => {
    const keyBase = String(field.key || field.label || `field_${index + 1}`)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || `field_${index + 1}`
    const type = allowed.has(field.type) ? field.type : 'text'
    return {
      id: field.id || `fld_${Date.now().toString(36)}_${index}`,
      key: keyBase,
      label: String(field.label || `Field ${index + 1}`).trim(),
      type,
      required: field.required === true,
      options: type === 'select'
        ? String(field.options || '').split(/\r?\n|,/).map(v => v.trim()).filter(Boolean).join('\n')
        : '',
    }
  })
}

function formLinks(form, request) {
  const origin = publicOrigin(request)
  const publicUrl = `${origin}/forms/${encodeURIComponent(form.id)}`
  const embedUrl = `${publicUrl}/embed`
  return {
    ...form,
    publicUrl,
    embedUrl,
    embedCode: `<iframe src="${embedUrl}" title="${String(form.title || 'Farrington form').replace(/"/g, '&quot;')}" style="width:100%;min-height:720px;border:0;border-radius:8px;"></iframe>`,
  }
}

function starterForms(now = new Date().toISOString()) {
  const form = ({ id, title, description, destination, automation, fields }) => ({
    id,
    title,
    description,
    status: 'active',
    destination,
    automation,
    fields: normalizeFormFields(fields),
    createdAt: now,
    updatedAt: now,
    seeded: true,
  })
  return [
    form({
      id: 'form_seed_client_intake',
      title: 'Client Discovery Intake',
      description: 'Captures a new client lead, budget range, timeline, goals, and preferred contact path.',
      destination: 'leads',
      automation: 'Create lead, notify owner, draft discovery agenda',
      fields: [
        { label: 'Name', key: 'name', type: 'text', required: true },
        { label: 'Email', key: 'email', type: 'email', required: true },
        { label: 'Phone', key: 'phone', type: 'phone' },
        { label: 'Company', key: 'company', type: 'text' },
        { label: 'What do you need built?', key: 'need', type: 'textarea', required: true },
        { label: 'Budget range', key: 'budget_range', type: 'select', options: '$2k-$5k\n$5k-$15k\n$15k-$50k\n$50k+' },
      ],
    }),
    form({
      id: 'form_seed_agent_setup',
      title: 'AI Agent Setup Request',
      description: 'Collects the persona, duties, tools, handoff rules, and voice requirements for a client agent.',
      destination: 'agents',
      automation: 'Create agent draft, route to Craig, prepare prompt packet',
      fields: [
        { label: 'Agent name', key: 'agent_name', type: 'text', required: true },
        { label: 'Department or role', key: 'role', type: 'text', required: true },
        { label: 'Primary responsibilities', key: 'responsibilities', type: 'textarea', required: true },
        { label: 'Needs phone voice?', key: 'needs_voice', type: 'checkbox' },
        { label: 'Transfer targets', key: 'transfer_targets', type: 'textarea' },
      ],
    }),
    form({
      id: 'form_seed_twilio_number',
      title: 'Phone Number Provisioning',
      description: 'Packages a client phone-number request with area code, preferred prefixes, routing, and agent assignment.',
      destination: 'voice-labs',
      automation: 'Search number inventory, stage Twilio purchase, assign agent',
      fields: [
        { label: 'Client name', key: 'client_name', type: 'text', required: true },
        { label: 'Area code', key: 'area_code', type: 'number', required: true },
        { label: 'Preferred prefixes', key: 'preferred_prefixes', type: 'text' },
        { label: 'Assigned agent', key: 'assigned_agent', type: 'text' },
        { label: 'Call purpose', key: 'call_purpose', type: 'textarea', required: true },
      ],
    }),
    form({
      id: 'form_seed_project_brief',
      title: 'Website Project Brief',
      description: 'Turns a website request into structured scope, pages, integrations, launch date, and design direction.',
      destination: 'projects',
      automation: 'Create project brief, draft SOW, attach to Documents',
      fields: [
        { label: 'Project name', key: 'project_name', type: 'text', required: true },
        { label: 'Site type', key: 'site_type', type: 'select', options: 'Business site\nLanding page\nClient portal\nE-commerce\nInternal app' },
        { label: 'Required pages', key: 'required_pages', type: 'textarea', required: true },
        { label: 'Integrations', key: 'integrations', type: 'textarea' },
        { label: 'Target launch date', key: 'target_launch_date', type: 'date' },
      ],
    }),
    form({
      id: 'form_seed_support_ticket',
      title: 'Client Support Ticket',
      description: 'Collects a clean support request with urgency, screenshots link, affected product, and reproduction notes.',
      destination: 'tasks',
      automation: 'Create task, set priority, notify assigned owner',
      fields: [
        { label: 'Client', key: 'client', type: 'text', required: true },
        { label: 'Affected system', key: 'affected_system', type: 'text', required: true },
        { label: 'Urgency', key: 'urgency', type: 'select', options: 'Low\nNormal\nHigh\nEmergency', required: true },
        { label: 'What happened?', key: 'issue', type: 'textarea', required: true },
        { label: 'Screenshot or link', key: 'screenshot_link', type: 'text' },
      ],
    }),
    form({
      id: 'form_seed_content_request',
      title: 'Content Lab Request',
      description: 'Starts a content job with audience, offer, tone, source material, and output type.',
      destination: 'content-lab',
      automation: 'Create content brief, assign Sasha, prepare draft',
      fields: [
        { label: 'Content type', key: 'content_type', type: 'select', options: 'Blog post\nSocial post\nEmail\nLanding page copy\nPress release', required: true },
        { label: 'Audience', key: 'audience', type: 'text', required: true },
        { label: 'Offer or topic', key: 'offer_or_topic', type: 'textarea', required: true },
        { label: 'Tone', key: 'tone', type: 'select', options: 'Professional\nWarm\nBold\nTechnical\nPlayful' },
        { label: 'Source notes', key: 'source_notes', type: 'textarea' },
      ],
    }),
    form({
      id: 'form_seed_campaign_launch',
      title: 'Marketing Campaign Launch Brief',
      description: 'Collects campaign goals, channels, budget, creative needs, and approval contact.',
      destination: 'campaign-studio',
      automation: 'Create campaign draft, generate asset brief, stage planner tasks',
      fields: [
        { label: 'Campaign name', key: 'campaign_name', type: 'text', required: true },
        { label: 'Goal', key: 'goal', type: 'select', options: 'Lead generation\nBrand awareness\nProduct sale\nEvent promotion\nRetention', required: true },
        { label: 'Channels', key: 'channels', type: 'textarea', required: true },
        { label: 'Budget', key: 'budget', type: 'text' },
        { label: 'Approval contact', key: 'approval_contact', type: 'email' },
      ],
    }),
    form({
      id: 'form_seed_product_order',
      title: 'Product Order Intake',
      description: 'Captures product/package selection, billing contact, Stripe readiness, and implementation notes.',
      destination: 'products',
      automation: 'Create order draft, verify Stripe product, prepare invoice',
      fields: [
        { label: 'Customer name', key: 'customer_name', type: 'text', required: true },
        { label: 'Billing email', key: 'billing_email', type: 'email', required: true },
        { label: 'Product or package', key: 'product_package', type: 'text', required: true },
        { label: 'Add-ons requested', key: 'addons', type: 'textarea' },
        { label: 'Ready to invoice?', key: 'ready_to_invoice', type: 'checkbox' },
      ],
    }),
    form({
      id: 'form_seed_access_request',
      title: 'Client Access Request',
      description: 'Documents who needs access, role level, systems, approval, and expiration date.',
      destination: 'settings',
      automation: 'Create access review task, notify owner, stage invite',
      fields: [
        { label: 'Requester email', key: 'requester_email', type: 'email', required: true },
        { label: 'Person needing access', key: 'person_name', type: 'text', required: true },
        { label: 'Role requested', key: 'role_requested', type: 'select', options: 'Viewer\nClient\nManager\nAdmin' },
        { label: 'Systems needed', key: 'systems_needed', type: 'textarea', required: true },
        { label: 'Expiration date', key: 'expiration_date', type: 'date' },
      ],
    }),
    form({
      id: 'form_seed_automation_request',
      title: 'Automation Build Request',
      description: 'Defines the trigger, action, data source, approval rule, and failure notification for an automation.',
      destination: 'automations',
      automation: 'Create automation draft, assign build review',
      fields: [
        { label: 'Automation name', key: 'automation_name', type: 'text', required: true },
        { label: 'Trigger', key: 'trigger', type: 'textarea', required: true },
        { label: 'Action', key: 'action', type: 'textarea', required: true },
        { label: 'Needs approval before running?', key: 'needs_approval', type: 'checkbox' },
        { label: 'Failure notification email', key: 'failure_email', type: 'email' },
      ],
    }),
  ]
}

function ensureStarterForms(data) {
  const existingIds = new Set(data.forms.map(form => form.id))
  const additions = starterForms().filter(form => !existingIds.has(form.id))
  if (data.forms.length >= 10 || !additions.length) return false
  data.forms = [...data.forms, ...additions].slice(0, Math.max(10, data.forms.length + additions.length))
  return true
}

function starterDocuments(now = new Date().toISOString()) {
  const doc = ({ id, title, templateId, templateName, body, status = 'active' }) => ({
    id,
    templateId,
    templateName,
    title,
    clientId: '',
    clientName: 'Global',
    projectId: '',
    linkedTo: {},
    body,
    values: {},
    requiresSignature: false,
    signature: null,
    portalVisible: false,
    status,
    createdAt: now,
    updatedAt: now,
    seeded: true,
  })
  return [
    doc({
      id: 'doc_seed_client_discovery_brief',
      title: 'Client Discovery Brief',
      templateId: 'client-discovery',
      templateName: 'Discovery',
      body: '# Client Discovery Brief\n\nUse this document to capture goals, constraints, stakeholders, timeline, budget range, and decision criteria before scope is drafted.\n\n## Intake Notes\n- Business objective\n- Current pain points\n- Target launch window\n- Required integrations\n- Approval contact\n',
    }),
    doc({
      id: 'doc_seed_ai_agent_scope',
      title: 'AI Agent Scope Checklist',
      templateId: 'agent-scope',
      templateName: 'Agent Planning',
      body: '# AI Agent Scope Checklist\n\nA global planning document for defining an agent before buildout.\n\n## Required Sections\n- Agent name and department\n- Responsibilities\n- Tools and permissions\n- Voice behavior\n- Transfer targets\n- Escalation rules\n',
    }),
    doc({
      id: 'doc_seed_phone_provisioning_sop',
      title: 'Phone Number Provisioning SOP',
      templateId: 'voice-provisioning',
      templateName: 'Voice Operations',
      body: '# Phone Number Provisioning SOP\n\nUse this global SOP when setting up a client phone number, routing it through Twilio, and assigning it to a voice agent.\n\n## Steps\n1. Confirm area code and preferred prefixes.\n2. Search available numbers.\n3. Stage purchase and routing.\n4. Assign the agent.\n5. Run an inbound/outbound test.\n',
    }),
    doc({
      id: 'doc_seed_website_project_brief',
      title: 'Website Project Brief',
      templateId: 'website-project',
      templateName: 'Project Brief',
      body: '# Website Project Brief\n\nA reusable document for turning a website request into scope.\n\n## Capture\n- Site type\n- Required pages\n- Copy and media status\n- Integrations\n- Hosting/deployment notes\n- Launch deadline\n',
    }),
    doc({
      id: 'doc_seed_support_intake_sop',
      title: 'Support Intake SOP',
      templateId: 'support-intake',
      templateName: 'Support',
      body: '# Support Intake SOP\n\nUse this to triage support issues consistently.\n\n## Triage Fields\n- Affected system\n- Urgency\n- Reproduction steps\n- Screenshot or link\n- Customer impact\n- Assigned owner\n',
    }),
    doc({
      id: 'doc_seed_content_campaign_brief',
      title: 'Content Campaign Brief',
      templateId: 'content-campaign',
      templateName: 'Content Lab',
      body: '# Content Campaign Brief\n\nA global brief for Sasha or the Content Lab before generating campaign assets.\n\n## Inputs\n- Audience\n- Offer\n- Tone\n- Channels\n- Source notes\n- Approval contact\n',
    }),
    doc({
      id: 'doc_seed_product_order_review',
      title: 'Product Order Review Sheet',
      templateId: 'product-order',
      templateName: 'Products',
      body: '# Product Order Review Sheet\n\nUse this before processing a product/order through Stripe and implementation.\n\n## Review\n- Selected product/package\n- Add-ons\n- Billing email\n- Fulfillment notes\n- Stripe product/price verification\n',
    }),
    doc({
      id: 'doc_seed_access_request_review',
      title: 'Access Request Review',
      templateId: 'access-review',
      templateName: 'Security',
      body: '# Access Request Review\n\nA global document for reviewing user access requests.\n\n## Checklist\n- Requester\n- Person needing access\n- Role level\n- Systems requested\n- Approval status\n- Expiration date\n',
    }),
    doc({
      id: 'doc_seed_automation_build_brief',
      title: 'Automation Build Brief',
      templateId: 'automation-build',
      templateName: 'Automations',
      body: '# Automation Build Brief\n\nUse this document to define a reliable automation before build.\n\n## Definition\n- Trigger\n- Action\n- Data source\n- Approval gate\n- Failure notification\n- Success metric\n',
    }),
    doc({
      id: 'doc_seed_go_live_checklist',
      title: 'Go-Live Checklist',
      templateId: 'go-live',
      templateName: 'Launch',
      body: '# Go-Live Checklist\n\nA reusable checklist for production launches.\n\n## Checks\n- Build passed\n- Restore point created\n- Service restart plan\n- Public endpoint checks\n- Auth boundary check\n- Rollback path\n',
    }),
  ]
}

function ensureStarterDocuments(data) {
  const existingIds = new Set(data.documents.map(document => document.id))
  const additions = starterDocuments().filter(document => !existingIds.has(document.id))
  if (data.documents.length >= 10 || !additions.length) return false
  data.documents = [...data.documents, ...additions].slice(0, Math.max(10, data.documents.length + additions.length))
  return true
}

function loadTemplateIndex() {
  try {
    const raw = fs.readFileSync(path.join(TEMPLATES_DIR, '_index.json'), 'utf8')
    return JSON.parse(raw.replace(/^\uFEFF/, '')).templates || []
  } catch { return [] }
}

function loadTemplateBody(id) {
  const tpl = loadTemplateIndex().find(t => t.id === id)
  if (!tpl) return null
  const p = path.join(TEMPLATES_DIR, tpl.file)
  if (!fs.existsSync(p)) return null
  return { ...tpl, body: fs.readFileSync(p, 'utf8') }
}

function saveTemplateIndex(templates) {
  fs.writeFileSync(path.join(TEMPLATES_DIR, '_index.json'), JSON.stringify({ templates }, null, 2), 'utf8')
}

function slugifyTemplateId(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || `template-${Date.now().toString(36)}`
}

function placeholdersFromBody(body = '') {
  const found = new Set()
  String(body).replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (_m, key) => {
    found.add(key)
    return _m
  })
  return Array.from(found)
}

function fillPlaceholders(body, values) {
  return body.replace(/\{\{\s*([a-zA-Z_]+)\s*\}\}/g, (m, name) => {
    const v = values[name]
    if (v === undefined || v === null || v === '') return `[${name}]` // visible marker for unfilled
    return String(v)
  })
}

function findClient(clientId) {
  return findClientRecord(clientId)
}

function withSignatureFlags(document, templates = loadTemplateIndex()) {
  const template = templates.find(t => t.id === document.templateId)
  return {
    ...document,
    requiresSignature: document.requiresSignature ?? isSignatureRequired(template, document.body || ''),
  }
}

function defaultFieldsFromClient(client, templateId) {
  const today = new Date().toISOString().slice(0, 10)
  const base = {
    effective_date: today,
    state_of_governing_law: 'North Carolina',
    client_name: client?.name || '',
    client_address: client?.address || '',
    client_email: client?.email || '',
    client_phone: client?.phone || '',
    contact_email: client?.email || '',
    client_business_name: client?.name || '',
    client_website_url: client?.website || '',
    term_years: '2',
    response_time_hours: '24',
    uptime_sla: '99.5%',
  }
  return base
}

function getOpenclawToken() {
  const cred = getCred('open claw') || getCred('openclaw')
  return cred?.key || ''
}

async function openclawText({ sessionKey, prompt }) {
  const token = getOpenclawToken()
  if (!token) throw new Error('OpenClaw credential not configured')
  const r = await openclawChat({ message: prompt, sessionKey, token })
  return String(r?.text || '').trim()
}

async function expandScopeWithAI({ templateName, dictation, clientName, additionalContext }) {
  const system = `You are drafting the Scope of Work section for a "${templateName}" between Farrington Development LLC and ${clientName}. Turn the user's plain-language dictation into formal, professional contract prose suitable for insertion into a legal document. Use clear headings, bulleted deliverables where appropriate, concrete milestones if any are implied, and avoid legalese that's not in the input. Do not invent prices, dates, or scope not present in the input. Return only the scope prose, no meta commentary, no markdown code fences.`
  const userPrompt = `Dictation from Farrington (expand into formal scope):\n\n"""${dictation}"""${additionalContext ? `\n\nAdditional context:\n${additionalContext}` : ''}`

  const cred = getCred('anthropic')
  if (cred?.key) {
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': cred.key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 2000,
          system,
          messages: [{ role: 'user', content: userPrompt }],
        }),
      })
      if (!res.ok) {
        const err = await res.text()
        return `[AI expansion failed: ${res.status}]\n\n${dictation}\n\n(Raw API error: ${err.slice(0, 200)})`
      }
      const j = await res.json()
      const text = j.content?.[0]?.text?.trim()
      return text || dictation
    } catch (e) {
      return `[AI expansion error: ${e.message}]\n\n${dictation}`
    }
  }

  // Fallback to OpenClaw (preferred in production) when Anthropic isn't configured.
  try {
    const prompt = `${system}\n\n${userPrompt}`
    const text = await openclawText({ sessionKey: `agent:legal:scope-expand-${Date.now()}`, prompt })
    return text || dictation
  } catch {
    return `[AI expansion unavailable — Anthropic credential not configured and OpenClaw generation failed. Raw dictation below.]\n\n${dictation}`
  }
}

async function sendSignatureEmail({ to, signerName, title, signUrl }) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY not set' }
  const openEdition = isOpenOcti()
  const from = process.env.RESEND_FROM || (openEdition ? 'OpenOcti <noreply@openocti.com>' : 'Farrington Development <redacted@example.invalid>')
  const fallbackFrom = process.env.RESEND_FALLBACK_FROM || from
  const replyTo = openEdition ? (process.env.OWNER_EMAIL || '') : (process.env.CARL_EMAIL || 'redacted@example.invalid')
  const senderName = openEdition ? (process.env.OPENOCTI_BUSINESS_NAME || 'Your business') : 'Carl Farrington'
  const bodyHtml = `
    <p>Hi ${signerName || 'there'},</p>
    <p>${senderName} has sent you <strong>${title}</strong> for electronic review and signature.</p>
    <p><a href="${signUrl}" style="display:inline-block;padding:12px 20px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-weight:700">Review and sign</a></p>
    <p style="font-size:13px;color:#555">The signing page records your consent, typed signature, timestamp, IP address, browser details, and a SHA-256 hash of the document for audit purposes.</p>
  `
  const { html, inlineAttachments } = buildEmail(bodyHtml, 'farrington')
  const resend = new Resend(apiKey)
  const payload = {
    from,
    to: [to],
    cc: replyTo ? [replyTo] : undefined,
    replyTo,
    subject: `Signature requested: ${title}`,
    html,
    attachments: inlineAttachments,
  }
  let result = await resend.emails.send(payload)
  const message = result.error?.message || ''
  if (result.error && fallbackFrom !== from && /domain|verify|authorization|permission|sender/i.test(message)) {
    result = await resend.emails.send({ ...payload, from: fallbackFrom })
    if (!result.error) return { ok: true, id: result.data?.id, fallback: true }
  }
  if (result.error) return { ok: false, error: result.error.message }
  return { ok: true, id: result.data?.id }
}

function buildPdf({ title, body, signature }) {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ size: 'letter', margin: 50 })
    const chunks = []
    doc.on('data', c => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))

    const brand = brandAssetsFor()
    const logoPath = path.join(process.cwd(), 'public', ...(brand.openOcti ? ['openocti', 'logo-horizontal.png'] : ['brand', 'fd-brand-dark.png']))
    if (fs.existsSync(logoPath)) doc.image(logoPath, 50, 40, { width: 240 })
    doc.fontSize(9).font('Helvetica').fillColor('#6B6F78')
    doc.text('Farrington Development LLC', 50, 115)
    doc.text('Asheville, North Carolina')
    doc.text('farringtondevelopment.com')

    doc.moveTo(50, 150).lineTo(562, 150).strokeColor('#6B6F78').lineWidth(0.5).stroke()

    doc.fontSize(18).font('Helvetica-Bold').fillColor('#0A0B0D').text(title, 50, 170, { width: 512 })

    // Render body. Markdown-ish: handle headings and plain text lines.
    doc.moveDown(1)
    const lines = (body || '').split('\n')
    for (const raw of lines) {
      const line = raw
      if (!line.trim()) { doc.moveDown(0.5); continue }
      if (line.startsWith('# ')) {
        doc.fontSize(16).font('Helvetica-Bold').fillColor('#0A0B0D').text(line.slice(2))
        doc.moveDown(0.3)
      } else if (line.startsWith('## ')) {
        doc.fontSize(13).font('Helvetica-Bold').fillColor('#0A0B0D').text(line.slice(3))
        doc.moveDown(0.2)
      } else if (line.startsWith('### ')) {
        doc.fontSize(11).font('Helvetica-Bold').fillColor('#333').text(line.slice(4))
        doc.moveDown(0.1)
      } else if (line.startsWith('> ')) {
        doc.fontSize(9).font('Helvetica-Oblique').fillColor('#6B6F78').text(line.slice(2), { width: 512 })
        doc.moveDown(0.2)
      } else if (/^\s*[-*]\s/.test(line)) {
        doc.fontSize(10).font('Helvetica').fillColor('#0A0B0D').text('â€¢ ' + line.replace(/^\s*[-*]\s/, ''), { width: 500, indent: 10 })
      } else if (line === '---') {
        doc.moveDown(0.3)
        const y = doc.y
        doc.moveTo(50, y).lineTo(562, y).strokeColor('#6B6F78').lineWidth(0.5).stroke()
        doc.moveDown(0.3)
      } else {
        // Bold handling for **...**
        const hasBold = /\*\*[^*]+\*\*/.test(line)
        if (hasBold) {
          const parts = line.split(/(\*\*[^*]+\*\*)/)
          doc.fontSize(10).fillColor('#0A0B0D')
          parts.forEach((p, i) => {
            if (p.startsWith('**') && p.endsWith('**')) {
              doc.font('Helvetica-Bold').text(p.slice(2, -2), { continued: i < parts.length - 1 })
            } else {
              doc.font('Helvetica').text(p, { continued: i < parts.length - 1 })
            }
          })
          doc.text('')
        } else {
          doc.fontSize(10).font('Helvetica').fillColor('#0A0B0D').text(line, { width: 512 })
        }
      }
    }

    const cert = signatureCertificateLines(signature)
    if (cert.length) {
      doc.addPage()
      doc.fontSize(15).font('Helvetica-Bold').fillColor('#0A0B0D').text(cert[0])
      doc.moveDown(0.8)
      doc.fontSize(10).font('Helvetica').fillColor('#0A0B0D')
      for (const line of cert.slice(1)) doc.text(line, { width: 512 })
    }

    doc.end()
  })
}

export async function GET(request) {
  const { error } = await requireCrmRead(request)
  if (error) return error
  const data = ensureDocumentStore(loadDocs())
  const seededForms = ensureStarterForms(data)
  const seededDocuments = ensureStarterDocuments(data)
  if (seededForms || seededDocuments) saveDocs(data)
  const templates = loadTemplateIndex()
  const { searchParams } = new URL(request.url)
  const projectId = searchParams.get('projectId')
  const accountId = searchParams.get('accountId') || searchParams.get('clientId')
  let documents = (data.documents || []).map(d => withSignatureFlags(d, templates))
  if (projectId) documents = documents.filter(d => d.linkedTo?.projectId === projectId || d.projectId === projectId)
  if (accountId) documents = documents.filter(d => d.clientId === accountId || d.linkedTo?.accountId === accountId)
  const forms = data.forms.map(form => formLinks({
    ...form,
    submissionsCount: data.formSubmissions.filter(s => s.formId === form.id).length,
  }, request))
  return NextResponse.json({ documents, templates, forms, eSign: signingConfiguration() })
}

export async function POST(request) {
  const { error, user } = await requireCrmWrite(request)
  if (error) return error
  const body = await request.json()
  const data = ensureDocumentStore(loadDocs())

  if (body.action === 'get_template') {
    const tpl = loadTemplateBody(body.templateId)
    if (!tpl) return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    return NextResponse.json({ template: tpl })
  }

  if (body.action === 'preview_template') {
    const tpl = loadTemplateBody(body.templateId)
    if (!tpl) return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    const client = body.clientId ? findClient(body.clientId) : null
    const values = {
      ...defaultFieldsFromClient(client, body.templateId),
      ...(body.fields || {}),
    }
    const filled = fillPlaceholders(tpl.body, values)
    return NextResponse.json({ template: { ...tpl, body: filled }, values })
  }

  if (body.action === 'ai_edit') {
    const cred = getCred('anthropic')
    const docBody = body.body || ''
    const selection = (body.selection || '').trim()
    const instruction = (body.instruction || '').trim()
    if (!instruction) return NextResponse.json({ error: 'instruction required' }, { status: 400 })
    const hasSelection = selection.length > 0
    const system = hasSelection
      ? `You are an inline document editor. The user selected a chunk of their document and wants you to transform it based on their instruction. Return ONLY the replacement text for the selection — no explanation, no preamble, no markdown code fences. Preserve the document's existing markdown style. Keep any {{placeholder}} variables exactly as they appear unless the instruction says otherwise.`
      : `You are a document editor. Apply the user's instruction to the full document. Return ONLY the complete rewritten document — no explanation, no preamble, no markdown code fences. Preserve the existing structure. Keep any {{placeholder}} variables exactly as they appear unless the instruction says otherwise.`
    const userPrompt = hasSelection
      ? `Full document (for context only — do not return this):\n"""\n${docBody}\n"""\n\nSelected text to transform (return the replacement for this):\n"""\n${selection}\n"""\n\nInstruction: ${instruction}`
      : `Document:\n"""\n${docBody}\n"""\n\nInstruction: ${instruction}`
    try {
      if (!cred?.key) {
        const prompt = `${system}\n\n${userPrompt}`
        const text = await openclawText({ sessionKey: `agent:legal:ai-edit-${Date.now()}`, prompt })
        return NextResponse.json({ replacement: text || '', scope: hasSelection ? 'selection' : 'document', provider: 'openclaw' })
      }
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': cred.key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: 4000, system, messages: [{ role: 'user', content: userPrompt }] }),
      })
      if (!res.ok) {
        const err = await res.text()
        return NextResponse.json({ error: `AI edit failed: ${res.status} ${err.slice(0, 200)}` }, { status: 502 })
      }
      const j = await res.json()
      const text = j.content?.[0]?.text?.trim() || ''
      return NextResponse.json({ replacement: text, scope: hasSelection ? 'selection' : 'document', provider: 'anthropic' })
    } catch (e) {
      return NextResponse.json({ error: e.message }, { status: 500 })
    }
  }

  if (body.action === 'ai_generate_template') {
    const w = body.wizard || {}
    const baseTemplateId = String(body.baseTemplateId || '').trim()
    let baseBody = typeof body.baseBody === 'string' ? body.baseBody : ''
    if (!baseBody && baseTemplateId) {
      baseBody = loadTemplateBody(baseTemplateId)?.body || ''
    }

    const title = String(w.title || body.title || body.name || '').trim()
    const providerName = String(w.providerName || 'Farrington Development LLC').trim() || 'Farrington Development LLC'
    const counterpartyLabel = String(w.counterpartyLabel || 'Client').trim() || 'Client'
    const scopeKey = w.scopeStyle === 'services' ? 'scope_of_services' : 'scope_of_work'

    const instructions = [
      'You are Linda, an internal legal-review assistant.',
      'Draft a reusable contract template in Markdown. This is a template and not legal advice.',
      'Use placeholders like {{client_name}} in snake_case. Do not invent real client facts, pricing, or terms beyond placeholders/examples.',
      'Keep {{placeholder}} variables exactly as {{placeholder}} (do not convert to [placeholder]).',
      'Include these sections where applicable: Recitals/Background, Definitions, Scope, Fees/Payment, Support, Confidentiality, IP/License, Restrictions, Data/Security, Term/Termination, Warranties/Disclaimers, Limitation of Liability, Indemnity (optional + marked attorney review), Governing Law, Signatures, Exhibits/Schedules, and Template Notes (remove before sending).',
      `Use Provider name: "${providerName}". Use counterparty label: "${counterpartyLabel}".`,
      `If a scope section is included, use the placeholder {{${scopeKey}}}.`,
      'Output ONLY the markdown body (no commentary, no code fences).',
    ]

    const wizardSummary = JSON.stringify({
      docType: w.docType,
      includeScope: !!w.includeScope,
      includeFees: !!w.includeFees,
      includeTerm: !!w.includeTerm,
      includeSupport: !!w.includeSupport,
      includeLicensing: !!w.includeLicensing,
      includeDataSecurity: !!w.includeDataSecurity,
      includeIndemnity: !!w.includeIndemnity,
      deploymentModel: w.deploymentModel,
      pricingModel: w.pricingModel,
      termStyle: w.termStyle,
      signatureMode: w.signatureMode,
      specialRisks: String(w.specialRisks || '').trim(),
    }, null, 2)

    const prompt = `${instructions.join('\n')}\n\n[Wizard settings]\n${wizardSummary}\n\n${title ? `[Desired H1 title]\n${title}\n\n` : ''}${baseBody ? `[Base template to adapt]\n${baseBody}\n\n` : ''}[Minimum placeholders to include]\n{{effective_date}}\n{{state_of_governing_law}}\n{{client_name}}\n{{client_signer_name}}\n{{client_signer_title}}\n`

    try {
      let text = await openclawText({ sessionKey: `agent:legal:template-wizard-${Date.now()}`, prompt })
      if (title) {
        // Ensure first heading matches desired title when provided.
        if (/^\s*#\s+[^\n]+\n/.test(text)) text = text.replace(/^\s*#\s+[^\n]+\n/, `# ${title}\n`)
        else text = `# ${title}\n\n${text}`
      }
      if (!/^\s*>\s*\*\*LEGAL NOTICE/i.test(text)) {
        const notice = `> **LEGAL NOTICE (TEMPLATE - NOT LEGAL ADVICE):** This document is a starting template, not a finished legal contract. Have a licensed attorney review and customize before use. Remove any internal/template notes before sending for signature. Farrington Development LLC and any AI that filled in this template are not your lawyers.\n\n---\n\n`
        text = notice + text
      }
      if (!/##\s+Template Notes/i.test(text)) {
        text = `${text}\n\n---\n\n## Template Notes (Remove before sending)\n- Confirm commercial terms, liability cap, and any carve-outs with counsel.\n`
      }
      return NextResponse.json({ ok: true, body: text, provider: 'openclaw' })
    } catch (e) {
      return NextResponse.json({ error: `AI template generation failed: ${e.message}` }, { status: 502 })
    }
  }

  if (body.action === 'save_template') {
    const templates = loadTemplateIndex()
    const tpl = templates.find(t => t.id === body.templateId)
    if (!tpl) return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    if (typeof body.body !== 'string') return NextResponse.json({ error: 'body required' }, { status: 400 })
    const filePath = path.join(TEMPLATES_DIR, tpl.file)
    if (!fs.existsSync(filePath)) return NextResponse.json({ error: 'Template file missing' }, { status: 404 })
    try {
      const prior = fs.readFileSync(filePath, 'utf8')
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      fs.writeFileSync(filePath + '.bak-' + stamp, prior)
      fs.writeFileSync(filePath, body.body, 'utf8')
      const updatedBody = String(body.body || '')
      const placeholders = placeholdersFromBody(updatedBody)
      const detectedSignature = /signature\s*:/i.test(updatedBody) || /signed by both parties/i.test(updatedBody) || /By:\s*_{2,}/i.test(updatedBody)
      const updatedTemplate = {
        ...tpl,
        placeholders: placeholders.length ? placeholders : (tpl.placeholders || []),
        requiresSignature: tpl.requiresSignature === true || detectedSignature,
      }
      saveTemplateIndex(templates.map(t => t.id === tpl.id ? updatedTemplate : t))
      return NextResponse.json({ ok: true, backup: path.basename(filePath) + '.bak-' + stamp, template: updatedTemplate })
    } catch (e) {
      return NextResponse.json({ error: 'Failed to save: ' + e.message }, { status: 500 })
    }
  }

  if (body.action === 'create_template') {
    const name = String(body.name || '').trim()
    if (!name) return NextResponse.json({ error: 'Template name required' }, { status: 400 })
    const templates = loadTemplateIndex()
    const idBase = slugifyTemplateId(body.id || name)
    let id = idBase
    let n = 2
    while (templates.some(t => t.id === id) || fs.existsSync(path.join(TEMPLATES_DIR, `${id}.md`))) {
      id = `${idBase}-${n++}`
    }
    const bodyText = typeof body.body === 'string' && body.body.trim()
      ? body.body
      : `# ${name}\n\n{{client_name}}\n\nSignature: _______________________  Date: ____________\n`
    const tpl = {
      id,
      name,
      category: String(body.category || 'Custom').trim() || 'Custom',
      description: String(body.description || '').trim(),
      placeholders: Array.isArray(body.placeholders) && body.placeholders.length ? body.placeholders : placeholdersFromBody(bodyText),
      file: `${id}.md`,
      requiresSignature: body.requiresSignature === true || /signature\s*:/i.test(bodyText),
    }
    fs.writeFileSync(path.join(TEMPLATES_DIR, tpl.file), bodyText, 'utf8')
    saveTemplateIndex([...templates, tpl])
    return NextResponse.json({ ok: true, template: tpl })
  }

  if (body.action === 'duplicate_template') {
    const source = loadTemplateBody(body.templateId)
    if (!source) return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    const templates = loadTemplateIndex()
    const name = String(body.name || `${source.name} Copy`).trim()
    const idBase = slugifyTemplateId(name)
    let id = idBase
    let n = 2
    while (templates.some(t => t.id === id) || fs.existsSync(path.join(TEMPLATES_DIR, `${id}.md`))) {
      id = `${idBase}-${n++}`
    }
    const tpl = {
      ...source,
      id,
      name,
      file: `${id}.md`,
      placeholders: placeholdersFromBody(source.body || '').length ? placeholdersFromBody(source.body || '') : source.placeholders || [],
    }
    delete tpl.body
    fs.writeFileSync(path.join(TEMPLATES_DIR, tpl.file), source.body || '', 'utf8')
    saveTemplateIndex([...templates, tpl])
    return NextResponse.json({ ok: true, template: tpl })
  }

  if (body.action === 'delete_template') {
    const templates = loadTemplateIndex()
    const tpl = templates.find(t => t.id === body.templateId)
    if (!tpl) return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filePath = path.join(TEMPLATES_DIR, tpl.file)
    if (fs.existsSync(filePath)) fs.renameSync(filePath, filePath + `.deleted-${stamp}`)
    saveTemplateIndex(templates.filter(t => t.id !== body.templateId))
    return NextResponse.json({ ok: true, backup: tpl.file + `.deleted-${stamp}` })
  }

  if (body.action === 'batch_delete_templates') {
    const ids = Array.isArray(body.templateIds) ? body.templateIds.map(String) : []
    if (!ids.length) return NextResponse.json({ error: 'No templates selected' }, { status: 400 })
    const templates = loadTemplateIndex()
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const backups = []
    const kept = []
    let deleted = 0
    for (const tpl of templates) {
      if (!ids.includes(tpl.id)) {
        kept.push(tpl)
        continue
      }
      const filePath = path.join(TEMPLATES_DIR, tpl.file)
      if (fs.existsSync(filePath)) {
        const backup = tpl.file + `.deleted-${stamp}`
        fs.renameSync(filePath, filePath + `.deleted-${stamp}`)
        backups.push(backup)
      }
      deleted++
    }
    saveTemplateIndex(kept)
    return NextResponse.json({ ok: true, deleted, backups })
  }

  if (body.action === 'generate') {
    const tpl = loadTemplateBody(body.templateId)
    if (!tpl) return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    const client = body.clientId ? findClient(body.clientId) : null
    const values = {
      ...defaultFieldsFromClient(client, body.templateId),
      ...(body.fields || {}),
    }

    // AI scope expansion when user provides dictation
    if (body.dictation && body.dictation.trim()) {
      const scopeKey = tpl.placeholders.includes('scope_of_work') ? 'scope_of_work'
        : tpl.placeholders.includes('scope_of_services') ? 'scope_of_services'
        : null
      if (scopeKey && !values[scopeKey]) {
        values[scopeKey] = await expandScopeWithAI({
          templateName: tpl.name,
          dictation: body.dictation,
          clientName: client?.name || values.client_name || 'the Client',
          additionalContext: body.context || null,
        })
      }
    }

    const filled = fillPlaceholders(tpl.body, values)
    return NextResponse.json({
      draft: filled,
      template: { id: tpl.id, name: tpl.name, category: tpl.category, placeholders: tpl.placeholders },
      values,
    })
  }

  if (body.action === 'save') {
    const template = loadTemplateIndex().find(t => t.id === body.templateId)
    const doc = {
      id: genId(),
      templateId: body.templateId,
      templateName: body.templateName,
      title: body.title || body.templateName,
      clientId: body.clientId || '',
      clientName: body.clientName || '',
      projectId: body.projectId || '',
      linkedTo: {
        ...(body.linkedTo || {}),
        ...(body.clientId ? { accountId: body.clientId } : {}),
        ...(body.projectId ? { projectId: body.projectId } : {}),
      },
      body: body.body || '',
      values: body.values || {},
      requiresSignature: isSignatureRequired(template, body.body || ''),
      signature: null,
      // Never share on creation; Carl toggles this from the Documents list.
      portalVisible: body.portalVisible === true,
      status: body.status || 'draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    data.documents.push(doc)
    saveDocs(data)
    return NextResponse.json({ ok: true, document: doc })
  }

  if (body.action === 'duplicate') {
    const source = data.documents.find(d => d.id === body.id)
    if (!source) return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    const now = new Date().toISOString()
    const doc = {
      ...source,
      id: genId(),
      title: `${source.title || source.templateName || 'Document'} Copy`,
      status: 'draft',
      signature: null,
      portalVisible: false,
      createdAt: now,
      updatedAt: now,
    }
    data.documents.push(doc)
    saveDocs(data)
    return NextResponse.json({ ok: true, document: withSignatureFlags(doc) })
  }

  if (body.action === 'batch_delete') {
    const ids = Array.isArray(body.ids) ? body.ids.map(String) : []
    if (!ids.length) return NextResponse.json({ error: 'No documents selected' }, { status: 400 })
    const before = data.documents.length
    data.documents = data.documents.filter(d => !ids.includes(String(d.id)))
    saveDocs(data)
    return NextResponse.json({ ok: true, deleted: before - data.documents.length })
  }

  if (body.action === 'create_form') {
    const title = String(body.form?.title || body.title || '').trim()
    if (!title) return NextResponse.json({ error: 'Form title required' }, { status: 400 })
    const now = new Date().toISOString()
    const form = {
      id: genFormId(),
      title,
      description: String(body.form?.description || body.description || '').trim(),
      status: body.form?.status || 'draft',
      destination: body.form?.destination || 'leads',
      automation: String(body.form?.automation || '').trim(),
      fields: normalizeFormFields(body.form?.fields || body.fields || []),
      createdAt: now,
      updatedAt: now,
    }
    data.forms.push(form)
    saveDocs(data)
    return NextResponse.json({ ok: true, form: formLinks(form, request) })
  }

  if (body.action === 'update_form') {
    const idx = data.forms.findIndex(f => f.id === body.form?.id || f.id === body.id)
    if (idx < 0) return NextResponse.json({ error: 'Form not found' }, { status: 404 })
    const prior = data.forms[idx]
    const patch = body.form || {}
    const next = {
      ...prior,
      ...patch,
      title: String(patch.title || prior.title || '').trim() || prior.title,
      description: String(patch.description ?? prior.description ?? '').trim(),
      fields: normalizeFormFields(patch.fields || prior.fields || []),
      updatedAt: new Date().toISOString(),
    }
    data.forms[idx] = next
    saveDocs(data)
    return NextResponse.json({ ok: true, form: formLinks(next, request) })
  }

  if (body.action === 'duplicate_form') {
    const source = data.forms.find(f => f.id === body.id)
    if (!source) return NextResponse.json({ error: 'Form not found' }, { status: 404 })
    const now = new Date().toISOString()
    const form = {
      ...source,
      id: genFormId(),
      title: `${source.title || 'Form'} Copy`,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    }
    data.forms.push(form)
    saveDocs(data)
    return NextResponse.json({ ok: true, form: formLinks(form, request) })
  }

  if (body.action === 'delete_form') {
    data.forms = data.forms.filter(f => f.id !== body.id)
    saveDocs(data)
    return NextResponse.json({ ok: true })
  }

  if (body.action === 'batch_delete_forms') {
    const ids = Array.isArray(body.ids) ? body.ids.map(String) : []
    if (!ids.length) return NextResponse.json({ error: 'No forms selected' }, { status: 400 })
    const before = data.forms.length
    data.forms = data.forms.filter(f => !ids.includes(String(f.id)))
    saveDocs(data)
    return NextResponse.json({ ok: true, deleted: before - data.forms.length })
  }

  if (body.action === 'update') {
    const idx = data.documents.findIndex(d => d.id === body.document?.id)
    if (idx < 0) return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    const prior = data.documents[idx]
    const template = loadTemplateIndex().find(t => t.id === (body.document?.templateId || prior.templateId))
    const next = { ...prior, ...body.document, updatedAt: new Date().toISOString() }
    next.requiresSignature = isSignatureRequired(template, next.body || '')
    next.portalVisible = body.document?.portalVisible === undefined
      ? prior.portalVisible === true
      : body.document.portalVisible === true
    if (prior.signature?.status === 'pending' && body.document?.body && body.document.body !== prior.body) {
      next.signature = {
        ...prior.signature,
        status: 'voided',
        voidedAt: new Date().toISOString(),
        voidReason: 'Document changed after signature request.',
      }
    }
    data.documents[idx] = next
    saveDocs(data)
    return NextResponse.json({ ok: true, document: data.documents[idx] })
  }

  if (body.action === 'send_signature_request') {
    const eSign = signingConfiguration()
    if (isOpenOcti() && !eSign.configured) {
      return NextResponse.json({ error: eSign.message, eSign }, { status: 503 })
    }
    const idx = data.documents.findIndex(d => d.id === body.id)
    if (idx < 0) return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    const doc = data.documents[idx]
    const client = doc.clientId ? findClient(doc.clientId) : null
    const signerEmail = (body.signerEmail || doc.values?.client_email || client?.email || '').trim()
    const signerName = (body.signerName || doc.clientName || doc.values?.client_name || client?.name || '').trim()
    if (!signerEmail || !signerEmail.includes('@')) return NextResponse.json({ error: 'Signer email required' }, { status: 400 })
    if (!doc.requiresSignature && !body.force) return NextResponse.json({ error: 'This document is not marked as requiring signature' }, { status: 400 })

    const token = createSignatureToken()
    const documentHash = hashDocumentForSignature(doc)
    const now = new Date()
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()
    const signUrl = `${publicOrigin(request)}/sign/${encodeURIComponent(token)}`
    const eventId = 'sig_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
    const signature = {
      required: true,
      status: 'pending',
      tokenHash: hashSignatureToken(token),
      signUrl,
      signerName,
      signerEmail,
      requestedAt: now.toISOString(),
      requestedBy: user ? { id: user.id, username: user.username, displayName: user.displayName, role: user.role } : null,
      expiresAt,
      documentHash,
      consentVersion: 'fcc-esign-v1',
      events: [
        {
          id: eventId,
          type: 'request_created',
          at: now.toISOString(),
          ip: clientIp(request),
          userAgent: request.headers.get('user-agent') || '',
        },
      ],
    }

    const emailResult = await sendSignatureEmail({ to: signerEmail, signerName, title: doc.title, signUrl })
    const savedSignature = {
      ...signature,
      email: {
        ok: !!emailResult.ok,
        id: emailResult.id || '',
        fallback: !!emailResult.fallback,
        error: emailResult.ok ? '' : (emailResult.error || 'Unknown email send failure'),
        attemptedAt: new Date().toISOString(),
      },
    }
    data.documents[idx] = { ...doc, status: 'sent', signature: savedSignature, updatedAt: now.toISOString() }
    saveDocs(data)
    logActivity({
      type: 'document',
      subject: `Signature requested: ${doc.title}`,
      body: emailResult.ok ? `Sent to ${signerEmail}.` : `Signature link created; email failed: ${emailResult.error}`,
      linkedTo: { accountId: doc.clientId || undefined, documentId: doc.id },
      meta: { documentId: doc.id, signatureStatus: 'pending', emailOk: !!emailResult.ok },
    })
    return NextResponse.json({
      ok: true,
      document: data.documents[idx],
      signUrl,
      payload: {
        documentId: doc.id,
        title: doc.title,
        signerName,
        signerEmail,
        signUrl,
        expiresAt,
        documentHash,
        consentVersion: signature.consentVersion,
        email: savedSignature.email,
      },
      email: emailResult,
    })
  }

  if (body.action === 'delete') {
    data.documents = data.documents.filter(d => d.id !== body.id)
    saveDocs(data)
    return NextResponse.json({ ok: true })
  }

  if (body.action === 'set_status') {
    const idx = data.documents.findIndex(d => d.id === body.id)
    if (idx < 0) return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    data.documents[idx].status = body.status
    data.documents[idx].updatedAt = new Date().toISOString()
    saveDocs(data)
    return NextResponse.json({ ok: true, document: data.documents[idx] })
  }

  if (body.action === 'pdf') {
    const doc = data.documents.find(d => d.id === body.id)
    if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    const buf = await buildPdf({ title: doc.title, body: doc.body, signature: doc.signature })
    return new NextResponse(buf, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${doc.templateId || 'document'}-${doc.id}.pdf"`,
        'X-Content-Type-Options': 'nosniff',
      },
    })
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}

