import { NextResponse } from 'next/server'
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

const REPLAY_WINDOW_MS = 10 * 60 * 1000

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Idempotency-Key',
  }
}

function clean(value, limit = 500) {
  return String(value || '').trim().slice(0, limit)
}

function stageForPipeline(pipelineId, fallbackStageId) {
  const pipeline = loadAll('pipelines').find(p => p.id === pipelineId)
  if (!pipeline) return null
  if (fallbackStageId && pipeline.stages?.some(s => s.id === fallbackStageId)) return fallbackStageId
  return pipeline.stages?.find(s => !s.terminal)?.id || pipeline.stages?.[0]?.id || null
}

function budgetValue(budget) {
  const text = String(budget || '')
  if (/\$400k|\$1m|1m/i.test(text)) return 400000
  if (/\$150k/i.test(text)) return 150000
  if (/\$50k|50k/i.test(text)) return 50000
  return 0
}

function submissionIdFrom(request, body) {
  const raw = body.submissionId || body.externalId || body.idempotencyKey || request.headers.get('idempotency-key')
  return clean(raw, 160).replace(/[^a-zA-Z0-9_-]/g, '')
}

function existingSubmission({ submissionId, email, source, productOpportunity }) {
  const leads = loadAll('leads') || []
  if (submissionId) {
    const exact = leads.find(lead =>
      lead.externalId === submissionId ||
      lead.bookingId === submissionId ||
      lead.submissionId === submissionId
    )
    if (exact) return exact
  }

  const cutoff = Date.now() - REPLAY_WINDOW_MS
  return leads.find(lead => {
    const createdAt = Date.parse(lead.createdAt || lead.inboundReceivedAt || '')
    return Number.isFinite(createdAt) &&
      createdAt >= cutoff &&
      clean(lead.email, 180).toLowerCase() === email &&
      clean(lead.source, 80) === source &&
      clean(lead.productOpportunity, 180) === productOpportunity
  })
}

function duplicateResponse(lead, submissionId) {
  return NextResponse.json({
    ok: true,
    deduplicated: true,
    submissionId: submissionId || lead.submissionId || lead.externalId || null,
    leadId: lead.id,
    accountId: lead.convertedToAccountId || lead.accountId || null,
    contactId: lead.convertedToContactId || lead.contactId || null,
    opportunityId: lead.convertedToOpportunityId || lead.opportunityId || null,
  }, { headers: corsHeaders() })
}

export async function POST(request) {
  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400, headers: corsHeaders() })
  }

  const name = clean(body.name, 140)
  const email = clean(body.email, 180).toLowerCase()
  const company = clean(body.company, 180)
  const phone = clean(body.phone, 80)

  if (!name || !company) {
    return NextResponse.json({ ok: false, error: 'Name and company required' }, { status: 400, headers: corsHeaders() })
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ ok: false, error: 'Valid email required' }, { status: 400, headers: corsHeaders() })
  }

  const needs = Array.isArray(body.needs) ? body.needs.map(v => clean(v, 80)).filter(Boolean) : []
  const source = clean(body.source || 'fd-website', 80)
  const ref = clean(body.ref, 80)
  const productOpportunity = clean(body.productOpportunity || 'Farrington Development Project Intake', 180)
  const submissionId = submissionIdFrom(request, body)
  const serviceLine = clean(
    body.serviceLine ||
      (/command center/i.test(productOpportunity) ? 'Farrington Development - Command Center' : 'Farrington Development Services'),
    180
  )

  const duplicate = existingSubmission({ submissionId, email, source, productOpportunity })
  if (duplicate) return duplicateResponse(duplicate, submissionId)

  const pipelineId = 'farrington_dev'
  const stageId = stageForPipeline(pipelineId, 'discovery')
  const notes = [
    clean(body.description || body.message, 2000),
    `Service line: ${serviceLine}`,
    `Product/opportunity: ${productOpportunity}`,
    ref ? `Reference: ${ref}` : '',
    clean(body.role, 140) ? `Role: ${clean(body.role, 140)}` : '',
    clean(body.sector, 160) ? `Sector: ${clean(body.sector, 160)}` : '',
    needs.length ? `Needs: ${needs.join(', ')}` : '',
    clean(body.budget, 120) ? `Budget: ${clean(body.budget, 120)}` : '',
    clean(body.timeline, 120) ? `Timeline: ${clean(body.timeline, 120)}` : '',
    `Source: ${source}`,
  ].filter(Boolean).join('\n')

  const tags = Array.from(new Set([
    'inbound',
    'farrington-development',
    source,
    'website-intake',
    serviceLine.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    ...needs.map(v => v.toLowerCase().replace(/[^a-z0-9]+/g, '-')),
  ]))

  const lead = create('leads', {
    name,
    email,
    phone,
    businessName: company,
    title: clean(body.role, 140),
    source,
    brandContext: 'farrington_dev',
    status: 'new',
    notes,
    tags,
    ref,
    submissionId: submissionId || null,
    externalId: submissionId || null,
    bookingId: submissionId || null,
    productOpportunity,
    serviceLine,
    suggestedPipelineId: stageId ? pipelineId : null,
    inboundReceivedAt: new Date().toISOString(),
    meta: {
      role: clean(body.role, 140),
      sector: clean(body.sector, 160),
      needs,
      budget: clean(body.budget, 120),
      timeline: clean(body.timeline, 120),
    },
  })

  const accountMatch = findAccountMatches({ name: company, email })?.[0]?.account
  const account = accountMatch || create('accounts', {
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
      title: clean(body.role, 140),
      accountId: account.id,
      primary: true,
      tags,
    })
  } else if (!contact.accountId) {
    contact = update('contacts', contact.id, { accountId: account.id })
  }

  const opportunity = create('opportunities', {
    name: `${productOpportunity} - ${company}`,
    accountId: account.id,
    contactId: contact.id,
    pipelineId: stageId ? pipelineId : null,
    stageId,
    value: budgetValue(body.budget),
    probability: 20,
    expectedClose: null,
    notes,
    tags,
    fromLeadId: lead.id,
    source,
    productOpportunity,
    serviceLine,
  })

  update('leads', lead.id, {
    opportunityId: opportunity.id,
    convertedToAccountId: account.id,
    convertedToContactId: contact.id,
    convertedToOpportunityId: opportunity.id,
  })

  logActivity({
    type: 'website_intake',
    subject: `${productOpportunity} intake`,
    body: notes,
    linkedTo: { leadId: lead.id, accountId: account.id, contactId: contact.id, opportunityId: opportunity.id },
  })

  // Notify Carl by email instantly so no lead lives only in the CRM
  const RESEND = process.env.RESEND_API_KEY
  if (RESEND) {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'FCC Leads <redacted@example.invalid>',
          to: ['redacted@example.invalid'],
          reply_to: email,
          subject: `New lead: ${name} — ${company} [${source}]`,
          text: `New website lead captured in Command Center.\n\nName: ${name}\nCompany: ${company}\nEmail: ${email}\nPhone: ${phone || '(none)'}\n\n${notes}\n\nOpportunity: ${opportunity.name}\nOpen FCC: https://openocti.local`,
        }),
      })
    } catch (err) { console.warn('intake notify email failed:', err?.message) }
  }

  return NextResponse.json({
    ok: true,
    deduplicated: false,
    submissionId: submissionId || null,
    leadId: lead.id,
    accountId: account.id,
    contactId: contact.id,
    opportunityId: opportunity.id,
  }, { headers: corsHeaders() })
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() })
}
