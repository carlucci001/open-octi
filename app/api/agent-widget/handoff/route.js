import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { create } from '@/lib/entityStore'
import { resolvePublicWidgetAgent } from '@/lib/public-agent-widget'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function json(body, init = {}) {
  return NextResponse.json(body, {
    ...init,
    headers: { ...CORS_HEADERS, ...(init.headers || {}) },
  })
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

function clean(value, max = 1200) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function cleanMultiline(value, max = 5000) {
  return String(value || '').replace(/\r/g, '').trim().slice(0, max)
}

function transcriptText(messages = []) {
  return (Array.isArray(messages) ? messages : [])
    .slice(-12)
    .map(m => `${m?.role === 'assistant' ? 'Receptionist' : 'Visitor'}: ${clean(m?.content, 1000)}`)
    .filter(line => !line.endsWith(': '))
    .join('\n')
}

function actionLabel(action) {
  if (action === 'callback') return 'Callback request'
  if (action === 'news-tip') return 'News tip'
  if (action === 'email') return 'Email request'
  return 'Website handoff'
}

async function notify({ profile, action, name, email, phone, when, message, transcript, leadId }) {
  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) return { ok: false, skipped: true, reason: 'RESEND_API_KEY missing' }

  const subject = `${profile.name}: ${actionLabel(action)} from ${name || 'website visitor'}`
  const text = [
    `${actionLabel(action)} from ${profile.title}`,
    '',
    `Name: ${name || '(not provided)'}`,
    `Email: ${email || '(not provided)'}`,
    `Phone: ${phone || '(not provided)'}`,
    `Preferred time: ${when || '(not provided)'}`,
    `Lead ID: ${leadId}`,
    '',
    'Message:',
    message || '(none)',
    '',
    transcript ? `Recent chat:\n${transcript}` : '',
  ].filter(Boolean).join('\n')

  const resend = new Resend(resendKey)
  const result = await resend.emails.send({
    from: 'WNC Times Receptionist <redacted@example.invalid>',
    to: [profile.handoffEmail || 'redacted@example.invalid'],
    replyTo: email || 'redacted@example.invalid',
    subject,
    text,
  })

  if (result.error) return { ok: false, error: result.error.message }
  return { ok: true }
}

export async function POST(request) {
  let body = {}
  try { body = await request.json() } catch {
    return json({ ok: false, error: 'Bad JSON' }, { status: 400 })
  }

  const profile = await resolvePublicWidgetAgent(body.agent, { baseUrl: new URL(request.url).origin })
  const action = clean(body.action, 40) || 'email'
  const name = clean(body.name, 120)
  const email = clean(body.email, 200)
  const phone = clean(body.phone, 80)
  const when = clean(body.when, 160)
  const message = cleanMultiline(body.message, 4000)
  const transcript = transcriptText(body.transcript || body.messages)

  if (!name) return json({ ok: false, error: 'Name is required.' }, { status: 400 })
  if (action === 'callback' && !phone) return json({ ok: false, error: 'Phone is required for a callback.' }, { status: 400 })
  if (action !== 'callback' && !email) return json({ ok: false, error: 'Email is required.' }, { status: 400 })
  if (!message && !transcript) return json({ ok: false, error: 'Message is required.' }, { status: 400 })

  const notes = [
    `Source: ${profile.source}`,
    `Action: ${actionLabel(action)}`,
    when ? `Preferred time: ${when}` : '',
    '',
    message ? `Message:\n${message}` : '',
    transcript ? `Recent chat:\n${transcript}` : '',
  ].filter(Boolean).join('\n')

  try {
    const lead = create('leads', {
      name,
      businessName: name,
      firstName: name.split(/\s+/)[0] || name,
      lastName: name.split(/\s+/).slice(1).join(' '),
      email,
      phone,
      status: 'new',
      stage: action === 'news-tip' ? 'news_tip' : 'interested',
      source: profile.source,
      notes,
      tenantId: 'lease-cl_001',
      campaignType: 'wnc_times',
      meta: { action, agentId: profile.id, brand: profile.brand },
    })

    const activity = create('activities', {
      type: action === 'news-tip' ? 'news_tip' : 'message',
      subject: `${profile.name}: ${actionLabel(action)} - ${name}`,
      body: notes,
      linkedTo: { leadId: lead.id },
      tenantId: 'lease-cl_001',
      at: new Date().toISOString(),
      meta: { action, agentId: profile.id, source: profile.source },
    })

    const notification = await notify({ profile, action, name, email, phone, when, message, transcript, leadId: lead.id }).catch(e => ({ ok: false, error: e.message }))

    return json({
      ok: true,
      leadId: lead.id,
      activityId: activity.id,
      notification,
      message: 'Got it. WNC Times has the handoff.',
    })
  } catch (e) {
    return json({ ok: false, error: e.message }, { status: 500 })
  }
}
