// Video-meeting invite — creates a Daily.co room and emails the join URL.
// POST { to, name?, subject?, note?, when?, persistent? (bool), seed? }
// Email is intentionally lightweight (no template chrome, no big CTA button,
// plain-text alternative) so Gmail routes it to Primary instead of Promotions.
import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { logActivity, findById } from '@/lib/entityStore'
import { getMode } from '@/lib/mode'

// In demo mode, redirect every video invite to Carl's real inbox so the demo
// flow is end-to-end (clicked → email arrives → join from phone) without
// blasting fake addresses.
const DEMO_RECIPIENT = 'personal@example.invalid'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function createDailyRoom({ seed, persistent }) {
  const apiKey = process.env.DAILY_API_KEY
  if (!apiKey) throw new Error('DAILY_API_KEY not set')
  const slug = String(seed || 'meeting').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'meeting'
  const name = persistent ? `ff-${slug}` : `ff-${slug}-${Math.random().toString(36).slice(2, 8)}`
  const exp = persistent ? undefined : Math.floor(Date.now() / 1000) + 4 * 60 * 60
  // Match the same paid-tier polish as /api/video/create-room.
  const res = await fetch('https://api.daily.co/v1/rooms', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      properties: {
        ...(exp ? { exp } : {}),
        enable_prejoin_ui: false,
        enable_knocking: false,
        enable_screenshare: true,
        enable_chat: true,
        enable_people_ui: true,
        enable_network_ui: true,
        enable_pip_ui: true,
        start_video_off: false,
        start_audio_off: false,
        lang: 'en',
      },
    }),
  })
  const data = await res.json()
  if (!res.ok) {
    if (res.status === 409) return { url: `https://${process.env.DAILY_SUBDOMAIN || 'farringtondev'}.daily.co/${name}`, name }
    throw new Error(data.error || data.info || 'Daily room creation failed')
  }
  return { url: data.url, name: data.name }
}

export async function POST(request) {
  try {
    const body = await request.json()
    const { to, name, subject, note, when, persistent, seed, linkedTo, existingUrl, existingRoom } = body

    // PRIORITY: if an accountId is linked, always use the account's CURRENT email
    // from the source of truth (accounts.json). This guarantees we never send to
    // a stale email that the frontend may have cached.
    let freshEmail = null
    if (linkedTo?.accountId) {
      const account = findById('accounts', linkedTo.accountId)
      if (account?.email && account.email.includes('@')) freshEmail = account.email
    }

    // Build recipient list: fresh email from DB wins; otherwise fall back to passed `to`
    let recipients
    if (freshEmail) {
      recipients = [freshEmail]
    } else {
      recipients = (Array.isArray(to) ? to : String(to || '').split(/[,;\s]+/))
        .map(s => String(s).trim())
        .filter(e => e && e.includes('@'))
    }

    // Demo mode: redirect to Carl's real inbox so the call flow can be demonstrated
    // end-to-end without trying to email fake addresses.
    const isDemo = getMode() === 'demo'
    const intendedRecipients = recipients
    if (isDemo) recipients = [DEMO_RECIPIENT]

    if (recipients.length === 0) return NextResponse.json({ ok: false, error: 'At least one valid recipient email required' }, { status: 400 })

    const resendKey = process.env.RESEND_API_KEY
    if (!resendKey) return NextResponse.json({ ok: false, error: 'RESEND_API_KEY not set' }, { status: 400 })

    const roomSeed = seed || name || 'Meeting'
    const createdRoom = existingUrl
      ? { url: existingUrl, name: existingRoom || existingUrl.split('/').filter(Boolean).pop() || 'video-room' }
      : await createDailyRoom({ seed: roomSeed, persistent: !!persistent })
    const { url: meetUrl, name: room } = createdRoom

    const whenText = when
      ? new Date(when).toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
      : 'at your earliest convenience'

    // Conversational subject (no "Video call with Farrington Development" template-feel).
    // Short timestamp suffix prevents Gmail from threading/deduping repeated sends.
    const timeTag = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    const baseSubject = subject || `Video link from Carl · ${timeTag}`
    // In demo mode, prefix the subject so Carl can spot demo invites at a glance in his inbox.
    const finalSubject = isDemo ? `[DEMO] ${baseSubject}` : baseSubject
    const finalNote = note || `Hop on a quick video call when you're ready — link below works in any browser, no install needed.`
    // Demo banner shown only in demo emails so the original recipient is clear when reviewing.
    const demoBannerText = isDemo
      ? `\n[Demo redirect — invite was triggered for: ${intendedRecipients.join(', ') || '(no email on file)'}]\n`
      : ''
    const demoBannerHtml = isDemo
      ? `<p style="font-size:12px;color:#b91c1c;background:#fef2f2;padding:8px 12px;border-radius:6px;border:1px solid #fecaca">🎭 Demo redirect — invite was triggered for: <strong>${intendedRecipients.join(', ') || '(no email on file)'}</strong></p>`
      : ''

    const joinUrl = meetUrl
    const firstName = (name || '').trim().split(/\s+/)[0] || 'there'

    // Plain-text alternative — Gmail favors emails that have both parts.
    const bodyText = [
      demoBannerText || null,
      `Hi ${firstName},`,
      '',
      finalNote,
      '',
      when ? `When: ${whenText}` : null,
      when ? '' : null,
      `Join here: ${joinUrl}`,
      '',
      '— Carl',
    ].filter(l => l !== null).join('\n')

    // Minimal HTML — looks like a normal personal email, not a marketing template.
    // Plain anchor link (no big colored CTA), no wrapper chrome, no footer images.
    const bodyHtml = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;line-height:1.55;color:#1a1a1a">
${demoBannerHtml}
<p>Hi ${firstName},</p>
<p>${finalNote}</p>
${when ? `<p>When: ${whenText}</p>` : ''}
<p>Join here: <a href="${joinUrl}">${joinUrl}</a></p>
<p>&mdash; Carl</p>
</div>`

    const resend = new Resend(resendKey)
    const primaryFromAddr = process.env.FARRINGTON_FROM_EMAIL || 'Carl Farrington <redacted@example.invalid>'
    const fallbackFromAddr = process.env.FARRINGTON_FALLBACK_FROM_EMAIL || process.env.RESEND_FROM_EMAIL || 'ContentHub <redacted@example.invalid>'
    const sendPayload = {
      from: primaryFromAddr,
      to: recipients,
      replyTo: 'personal@example.invalid',
      subject: finalSubject,
      text: bodyText,
      html: bodyHtml,
    }
    let result = await resend.emails.send(sendPayload)
    let usedFallbackSender = false
    if (
      result.error &&
      fallbackFromAddr &&
      fallbackFromAddr !== primaryFromAddr &&
      /domain is not verified|sender|from/i.test(result.error.message || '')
    ) {
      result = await resend.emails.send({ ...sendPayload, from: fallbackFromAddr })
      usedFallbackSender = !result.error
    }
    if (result.error) return NextResponse.json({ ok: false, error: result.error.message }, { status: 502 })

    if (linkedTo && (linkedTo.accountId || linkedTo.contactId || linkedTo.opportunityId || linkedTo.leadId)) {
      try {
        logActivity({
          type: 'video_invite',
          subject: `Sent video invite to ${recipients.join(', ')}`,
          body: `Room: ${room}\n${finalNote}`,
          linkedTo,
          meta: { meetUrl, when: when || null, recipients },
        })
      } catch {}
    }

    return NextResponse.json({ ok: true, url: meetUrl, room, sentTo: recipients, usedFallbackSender })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
