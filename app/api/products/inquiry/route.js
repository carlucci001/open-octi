import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { buildEmail } from '@/lib/emailSignature'
import {
  create,
  findAccountMatches,
  findContactByEmail,
  loadAll,
  logActivity,
  update,
} from '@/lib/entityStore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}

function clean(value, limit = 240) {
  return String(value || '').trim().slice(0, limit)
}

function money(value) {
  const number = Math.round(Number(value || 0))
  return number ? `$${number.toLocaleString()}` : ''
}

function stageForPipeline(pipelineId, fallbackStageId) {
  const pipeline = loadAll('pipelines').find(p => p.id === pipelineId)
  if (!pipeline) return null
  if (fallbackStageId && pipeline.stages?.some(s => s.id === fallbackStageId)) return fallbackStageId
  return pipeline.stages?.find(s => !s.terminal)?.id || pipeline.stages?.[0]?.id || null
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function detailRows(rows) {
  return `<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin-top:12px">
    ${rows.map(([label, value]) => `<tr>
      <td style="padding:8px 12px 8px 0;border-bottom:1px solid #eceef2;color:#6b7084;font-size:13px;width:150px;vertical-align:top">${escapeHtml(label)}</td>
      <td style="padding:8px 0;border-bottom:1px solid #eceef2;font-size:14px;vertical-align:top;white-space:pre-wrap">${escapeHtml(value) || '<span style="color:#a8adba">-</span>'}</td>
    </tr>`).join('')}
  </table>`
}

async function sendProductInquiryEmails({ buyer, company, productName, offerName, estimatedLow, estimatedHigh, dueToday, qualification, notes, lead, opportunity }) {
  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) return { ok: false, skipped: true, reason: 'RESEND_API_KEY not set' }

  const resend = new Resend(resendKey)
  const from = process.env.RESEND_FROM || 'Farrington Development <redacted@example.invalid>'
  const fallbackFrom = process.env.RESEND_FALLBACK_FROM || 'Farrington Development <redacted@example.invalid>'
  const replyTo = process.env.RESEND_REPLY_TO || 'redacted@example.invalid'
  const carlEmail = process.env.LEAD_NOTIFY_EMAIL || 'redacted@example.invalid'
  const range = estimatedLow || estimatedHigh ? `${money(estimatedLow)}-${money(estimatedHigh)}` : 'Review required'

  const internalBody = `
    <h2 style="margin:0 0 8px;font-size:20px">New Command Center consult</h2>
    <p style="margin:0 0 12px;color:#6b7084">A product consult request was captured in the Farrington Development pipeline and marked as a Command Center service inquiry.</p>
    ${detailRows([
      ['Name', buyer.name],
      ['Company', company],
      ['Email', buyer.email],
      ['Phone', buyer.phone],
      ['Product', productName],
      ['Selected path', offerName],
      ['Estimated build', range],
      ['Due today shown', dueToday ? money(dueToday) : ''],
      ['Business type', qualification.businessType],
      ['Opportunity focus', qualification.opportunityFocus],
      ['Lead ID', lead.id],
      ['Opportunity ID', opportunity.id],
      ['Notes', notes],
    ])}
  `
  const visitorBody = `
    <p style="margin:0 0 12px">Hi ${escapeHtml(buyer.name)},</p>
    <p style="margin:0 0 12px">We received your Farrington Command Center consult request for <strong>${escapeHtml(company)}</strong>.</p>
    <p style="margin:0 0 12px">Selected path: <strong>${escapeHtml(offerName || 'Review needed')}</strong><br/>Estimated build: <strong>${escapeHtml(range)}</strong></p>
    <p style="margin:0">Carl will review the setup path, modules, deployment model, and fit before anything is treated as a final scope or price.</p>
  `

  const internal = buildEmail(internalBody, 'farrington')
  const visitor = buildEmail(visitorBody, 'farrington')
  const sendWithFallback = async (payload) => {
    let result = await resend.emails.send({ ...payload, from })
    const message = result.error?.message || ''
    if (result.error && fallbackFrom !== from && /domain|verify|authorization|permission|sender/i.test(message)) {
      result = await resend.emails.send({ ...payload, from: fallbackFrom })
    }
    return result
  }

  const [internalResult, visitorResult] = await Promise.all([
    sendWithFallback({
      to: [carlEmail],
      replyTo: buyer.email || replyTo,
      subject: `Command Center consult - ${buyer.name} @ ${company}`,
      html: internal.html,
      attachments: internal.inlineAttachments,
    }),
    sendWithFallback({
      to: [buyer.email],
      replyTo,
      subject: 'We received your Farrington Command Center consult request',
      html: visitor.html,
      attachments: visitor.inlineAttachments,
    }),
  ])

  return {
    ok: !internalResult.error && !visitorResult.error,
    internal: internalResult.error ? internalResult.error.message : 'sent',
    visitor: visitorResult.error ? visitorResult.error.message : 'sent',
  }
}

export async function POST(request) {
  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400, headers: corsHeaders() })
  }

  const buyer = body.buyer || {}
  const email = clean(buyer.email, 180).toLowerCase()
  const name = clean(buyer.name, 140)
  const company = clean(buyer.company, 180)
  const phone = clean(buyer.phone, 80)

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ ok: false, error: 'Valid buyer email required' }, { status: 400, headers: corsHeaders() })
  }
  if (!name || !company) {
    return NextResponse.json({ ok: false, error: 'Buyer name and company required' }, { status: 400, headers: corsHeaders() })
  }

  const qualification = body.qualification || {}
  const productName = clean(body.productName || 'Farrington Command Center', 160)
  const serviceLine = clean(body.serviceLine || `Farrington Development - ${productName}`, 180)
  const offerName = clean(body.offerName, 160)
  const source = clean(body.source || 'product-inquiry', 80)
  const estimatedLow = Number(body.estimatedBuildLow || 0)
  const estimatedHigh = Number(body.estimatedBuildHigh || 0)
  const dueToday = Number(body.dueToday || 0)
  const quoteFlags = Array.isArray(body.quoteFlags) ? body.quoteFlags.map(v => clean(v, 80)).filter(Boolean) : []
  const modules = Array.isArray(body.modules) ? body.modules.map(v => clean(v, 80)).filter(Boolean) : []

  const notes = [
    clean(body.notes, 1200),
    `Service line: ${serviceLine}`,
    `Product: ${productName}`,
    offerName ? `Selected path: ${offerName}` : '',
    estimatedLow || estimatedHigh ? `Estimated build: ${money(estimatedLow)}-${money(estimatedHigh)}` : '',
    dueToday ? `Due today shown: ${money(dueToday)}` : '',
    clean(body.deployment, 100) ? `Deployment: ${clean(body.deployment, 100)}` : '',
    clean(qualification.businessType, 100) ? `Business type: ${clean(qualification.businessType, 100)}` : '',
    clean(qualification.opportunityFocus, 100) ? `Opportunity focus: ${clean(qualification.opportunityFocus, 100)}` : '',
    quoteFlags.length ? `Quote flags: ${quoteFlags.join(', ')}` : '',
    modules.length ? `Modules: ${modules.join(', ')}` : '',
  ].filter(Boolean).join('\n')

  const tags = [
    'command-center',
    'farrington-development',
    serviceLine.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    'product-inquiry',
    source,
    clean(qualification.businessType, 80),
    clean(qualification.opportunityFocus, 80),
  ].filter(Boolean)

  const pipelineId = 'farrington_dev'
  const stageId = stageForPipeline(pipelineId, 'discovery')

  const lead = create('leads', {
    name,
    email,
    phone,
    businessName: company,
    title: clean(buyer.title, 120),
    source,
    status: 'new',
    notes,
    tags,
    productOpportunity: productName,
    serviceLine,
    suggestedPipelineId: stageId ? pipelineId : null,
    offerPath: clean(body.offerPath, 80),
    offerName,
    estimatedBuildLow: estimatedLow,
    estimatedBuildHigh: estimatedHigh,
    dueToday,
    qualification,
  })

  const matches = findAccountMatches({ name: company, email })
  const account = matches?.[0]?.account || create('accounts', {
    name: company,
    type: 'prospect',
    stage: 'active',
    priority: 'high',
    notes,
    tags,
  })

  let contact = findContactByEmail(email)
  if (!contact) {
    contact = create('contacts', {
      name,
      email,
      phone,
      title: clean(buyer.title, 120),
      accountId: account.id,
      primary: true,
      tags,
    })
  } else if (!contact.accountId) {
    contact = update('contacts', contact.id, { accountId: account.id })
  }

  const opportunity = create('opportunities', {
    name: `${productName} - ${company}`,
    accountId: account.id,
    contactId: contact.id,
    pipelineId: stageId ? pipelineId : null,
    stageId,
    value: estimatedLow || dueToday || 9999,
    probability: source === 'command-center-consult' ? 20 : 30,
    expectedClose: null,
    notes,
    tags,
    fromLeadId: lead.id,
    productOpportunity: productName,
    serviceLine,
    offerPath: clean(body.offerPath, 80),
    offerName,
    quoteRequired: Boolean(body.quoteRequired),
    quoteFlags,
  })

  update('leads', lead.id, {
    opportunityId: opportunity.id,
    convertedToAccountId: account.id,
    convertedToContactId: contact.id,
    convertedToOpportunityId: opportunity.id,
  })

  logActivity({
    type: 'product_inquiry',
    subject: `${productName} inquiry`,
    body: notes,
    linkedTo: { leadId: lead.id, accountId: account.id, contactId: contact.id, opportunityId: opportunity.id },
  })

  let emailNotice = { ok: false, skipped: true }
  try {
    emailNotice = await sendProductInquiryEmails({
      buyer: { name, email, phone, title: clean(buyer.title, 120) },
      company,
      productName,
      offerName,
      estimatedLow,
      estimatedHigh,
      dueToday,
      qualification,
      notes,
      lead,
      opportunity,
    })
    if (!emailNotice.ok) console.warn('Product inquiry email notice failed', emailNotice)
  } catch (error) {
    emailNotice = { ok: false, error: error.message }
    console.warn('Product inquiry email notice failed', error.message)
  }

  return NextResponse.json({
    ok: true,
    leadId: lead.id,
    accountId: account.id,
    contactId: contact.id,
    opportunityId: opportunity.id,
    emailNotice,
  }, { headers: corsHeaders() })
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() })
}
