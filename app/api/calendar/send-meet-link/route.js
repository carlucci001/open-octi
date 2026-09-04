import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { wrapEmailBody } from '@/lib/emailSignature'
import { requireCrmWrite } from '@/lib/permissions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function createDailyRoom({ seed, persistent }) {
  const apiKey = process.env.DAILY_API_KEY
  if (!apiKey) throw new Error('DAILY_API_KEY not set')
  const slug = String(seed || 'appointment').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'appointment'
  const name = persistent ? `ff-${slug}` : `ff-${slug}-${Math.random().toString(36).slice(2, 8)}`
  const exp = persistent ? undefined : Math.floor(Date.now() / 1000) + 24 * 60 * 60
  const res = await fetch('https://api.daily.co/v1/rooms', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      properties: {
        ...(exp ? { exp } : {}),
        enable_prejoin_ui: false,
        enable_screenshare: true,
        enable_chat: true,
        start_video_off: false,
        start_audio_off: false,
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
  const { error } = await requireCrmWrite(request)
  if (error) return error
  try {
    const { to, attendeeName, meetLink, eventTitle, eventStart, from, isDemo } = await request.json()
    if (!to || !to.includes('@')) return NextResponse.json({ error: 'Missing or invalid recipient email' }, { status: 400 })
    const resendKey = process.env.RESEND_API_KEY
    if (!resendKey) return NextResponse.json({ error: 'RESEND_API_KEY not set in .env.local' }, { status: 400 })

    // If a link wasn't explicitly passed, create a fresh Daily.co room for this appointment.
    let joinUrl = meetLink && meetLink.startsWith('http') ? meetLink : null
    if (!joinUrl) {
      const seed = attendeeName || eventTitle || 'appointment'
      const room = await createDailyRoom({ seed, persistent: false })
      joinUrl = room.url
    }

    const when = eventStart
      ? new Date(eventStart).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' Eastern'
      : 'our scheduled time'

    const appointmentLabel = isDemo ? 'demo' : 'appointment'
    const buttonLabel = isDemo ? 'Join Video Demo' : 'Join Video Call'

    const bodyHtml = `<p>Hi ${attendeeName || 'there'},</p>
      <p>Looking forward to our ${appointmentLabel} at <strong>${when}</strong>.</p>
      <p>Here's your video link — no install or account needed, it opens in any browser:</p>
      <p style="text-align:center;margin:28px 0">
        <a href="${joinUrl}" style="background:#3b7dd8;color:white;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">🎥 ${buttonLabel}</a>
      </p>
      <p style="font-size:13px;color:#6b7084;text-align:center;word-break:break-all">
        Or copy this link: <span style="font-family:monospace">${joinUrl}</span>
      </p>
      <p>Talk soon,</p>`
    const html = wrapEmailBody(bodyHtml, 'newsroom')

    const resend = new Resend(resendKey)
    const result = await resend.emails.send({
      from: from || 'ContentStudio <redacted@example.invalid>',
      to: [to],
      replyTo: 'personal@example.invalid',
      subject: `Video link for our ${appointmentLabel} — ${eventTitle || 'Farrington Development'}`,
      html,
    })
    if (result.error) return NextResponse.json({ error: result.error.message }, { status: 502 })
    return NextResponse.json({ ok: true, sentTo: to, meetUrl: joinUrl })
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
