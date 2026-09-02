import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { buildEmail, getAgentEmailIdentity } from '@/lib/emailSignature'
import { resolveAttachments } from '@/lib/email-attachments'
import { requireCapability } from '@/lib/permissions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CORS = {
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

function withCors(request, status = 200) {
  const origin = request.headers.get('origin') || ''
  const publicOrigin = process.env.NEXT_PUBLIC_APP_URL || process.env.PUBLIC_BASE_URL || process.env.NEXTAUTH_URL || ''
  const headers = { ...CORS }
  if (publicOrigin && origin === publicOrigin) headers['Access-Control-Allow-Origin'] = origin
  return { status, headers }
}

async function requireToolAccess(request) {
  const expected = String(process.env.CONCIERGE_TOOL_SECRET || '').trim()
  const auth = String(request.headers.get('authorization') || '').trim()
  if (expected && auth === `Bearer ${expected}`) return null
  const { error } = await requireCapability(request, 'agents:use')
  return error
}

export async function OPTIONS(request) {
  return new NextResponse(null, withCors(request, 204))
}

export async function POST(request) {
  const authError = await requireToolAccess(request)
  if (authError) return authError
  const cors = withCors(request).headers
  try {
    const { to, subject, body, from, replyTo, html: htmlOverride, attachments: attachmentSpecs, agent: agentSpec, brand: brandKey } = await request.json()
    if (!to || !to.includes('@')) {
      return NextResponse.json({ ok: false, error: 'Missing or invalid recipient email' }, { status: 400, headers: cors })
    }
    if (!subject || (!body && !htmlOverride)) {
      return NextResponse.json({ ok: false, error: 'Subject and body are required' }, { status: 400, headers: cors })
    }
    const resendKey = process.env.RESEND_API_KEY
    if (!resendKey) {
      return NextResponse.json({ ok: false, error: 'RESEND_API_KEY not set' }, { status: 400, headers: cors })
    }

    const bodyHtml = htmlOverride || body.split('\n').map(line => `<p style="margin:0 0 12px 0">${line || '&nbsp;'}</p>`).join('')
    const agentIdentity = agentSpec ? (typeof agentSpec === 'object' ? agentSpec : getAgentEmailIdentity(agentSpec)) : null
    const { html, inlineAttachments } = buildEmail(bodyHtml, brandKey || 'farrington', { agent: agentIdentity })

    const resend = new Resend(resendKey)
    const userAttachments = await resolveAttachments(attachmentSpecs)
    const allAttachments = [...inlineAttachments, ...userAttachments]
    const defaultFrom = process.env.RESEND_FROM || 'Farrington Development <redacted@example.invalid>'
    const fallbackFrom = process.env.RESEND_FALLBACK_FROM || 'Farrington Development <redacted@example.invalid>'
    const defaultReplyTo = process.env.RESEND_REPLY_TO || 'redacted@example.invalid'
    const sendPayload = {
      from: from || defaultFrom,
      to: [to],
      replyTo: replyTo || defaultReplyTo,
      subject,
      html,
      ...(allAttachments.length ? { attachments: allAttachments } : {}),
    }
    let result = await resend.emails.send(sendPayload)
    const message = result.error?.message || ''
    if (result.error && fallbackFrom !== sendPayload.from && /domain|verify|authorization|permission|sender/i.test(message)) {
      result = await resend.emails.send({ ...sendPayload, from: fallbackFrom })
    }
    if (result.error) return NextResponse.json({ ok: false, error: result.error.message }, { status: 502, headers: cors })
    return NextResponse.json({ ok: true, message: `Email sent to ${to}.`, sentTo: to }, { headers: cors })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500, headers: cors })
  }
}
