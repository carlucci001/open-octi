import { NextResponse } from 'next/server'
import { listUsers, createUser } from '@/lib/auth'
import { getServerEndpoints } from '@/lib/serverInfo'
import { requireUserManagement } from '@/lib/permissions'
import { isOwner } from '@/lib/roles'
import { logAuditEvent } from '@/lib/auditLog'
import { buildEmail } from '@/lib/emailSignature'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
  const { error } = await requireUserManagement(request)
  if (error) return error
  return NextResponse.json({ ok: true, users: listUsers() })
}

async function sendInviteEmail({ to, displayName, username, password, loginUrl, sender }) {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY not set' }
  if (!to) return { ok: false, error: 'no email address on file' }
  const from = process.env.RESEND_FROM || 'Farrington Development <redacted@example.invalid>'
  const fallbackFrom = process.env.RESEND_FALLBACK_FROM || 'Farrington Development <redacted@example.invalid>'
  const cc = process.env.INVITE_CC_EMAIL || process.env.CARL_EMAIL || 'redacted@example.invalid'
  const subject = 'You have access to Farrington Command Center'
  const senderName = sender?.displayName || sender?.username || 'Carl Farrington'
  const bodyHtml = `
    <p>Hi ${displayName || username},</p>
    <p>${senderName} has set up an account for you on the Farrington Command Center CRM.</p>
    <p><a href="${loginUrl}" style="display:inline-block;padding:12px 20px;background:#3b82f6;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Open the CRM</a></p>
    <p style="margin-top:24px"><strong>Your sign-in details:</strong></p>
    <p style="font-family:monospace;background:#f4f4f5;padding:12px;border-radius:6px">
      URL: <a href="${loginUrl}">${loginUrl}</a><br>
      Username: <strong>${username}</strong><br>
      Password: <strong>${password}</strong>
    </p>
    <p style="font-size:13px;color:#666">After signing in, you can change your password in Settings → Users (if you have admin) — or ask ${senderName} to update it for you.</p>
  `
  const { html, inlineAttachments } = buildEmail(bodyHtml, 'farrington')
  try {
    const send = (fromAddress) => fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        from: fromAddress,
        to,
        cc: cc ? [cc] : undefined,
        reply_to: cc || undefined,
        subject,
        html,
        attachments: inlineAttachments,
      }),
    })
    let r = await send(from)
    let j = await r.json()
    const message = j.message || j.error || ''
    if (!r.ok && fallbackFrom !== from && /domain|verify|authorization|permission|sender/i.test(message)) {
      r = await send(fallbackFrom)
      j = await r.json()
      if (r.ok) return { ok: true, id: j.id, fallback: true }
    }
    if (!r.ok) return { ok: false, error: j.message || j.error || `resend ${r.status}` }
    return { ok: true, id: j.id }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

export async function POST(request) {
  const { error, user: caller } = await requireUserManagement(request)
  if (error) return error
  let body
  try { body = await request.json() } catch { return NextResponse.json({ ok: false, error: 'bad json' }, { status: 400 }) }
  const { username, password, displayName, role, location, email, sendInvite } = body || {}
  if (!username || !password) return NextResponse.json({ ok: false, error: 'username and password required' }, { status: 400 })
  if (password.length < 6) return NextResponse.json({ ok: false, error: 'password must be at least 6 chars' }, { status: 400 })
  if (role === 'owner' && !isOwner(caller)) return NextResponse.json({ ok: false, error: 'owner only' }, { status: 403 })
  try {
    const created = await createUser({ username, password, displayName, role, location, email })
    logAuditEvent({
      request,
      user: caller,
      action: 'user_created',
      area: 'users',
      severity: role === 'admin' ? 'warn' : 'info',
      targetId: created.id,
      targetName: created.username,
      meta: { role, location, sendInvite: !!sendInvite },
    })
    let invite = null
    if (sendInvite) {
      const endpoints = await getServerEndpoints({ port: Number(process.env.PORT) || 3000 })
      const loginUrl = (endpoints.public?.url || endpoints.lan[0]?.url || endpoints.loopback) + '/login'
      invite = await sendInviteEmail({
        to: email,
        displayName,
        username,
        password,
        loginUrl,
        sender: caller,
      })
    }
    return NextResponse.json({ ok: true, user: created, invite })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 400 })
  }
}
