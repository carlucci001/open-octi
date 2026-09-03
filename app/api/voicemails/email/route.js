import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { getCred } from '@/lib/agent-creds'

const TO = process.env.VOICEMAIL_NOTIFY_TO || 'personal@example.invalid'
const FROM = process.env.VOICEMAIL_NOTIFY_FROM || 'Farrington Command Center <redacted@example.invalid>'

export async function POST(request) {
  const { ids } = await request.json()
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: 'No conversation ids provided' }, { status: 400 })
  }
  const cred = getCred('elevenlabs') || getCred('eleven')
  if (!cred?.key) return NextResponse.json({ error: 'No ElevenLabs API key' }, { status: 400 })
  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) return NextResponse.json({ error: 'RESEND_API_KEY not set in .env.local' }, { status: 400 })

  try {
    const details = await Promise.all(
      ids.map(id =>
        fetch(`https://api.elevenlabs.io/v1/convai/conversations/${id}`, { headers: { 'xi-api-key': cred.key } })
          .then(r => r.ok ? r.json() : null)
          .catch(() => null)
      )
    )

    const blocks = details.filter(Boolean).map(d => {
      const started = new Date((d.metadata?.start_time_unix_secs || 0) * 1000).toLocaleString('en-US', { timeZone: 'America/New_York' })
      const from = d.metadata?.phone_call?.external_number || '(unknown)'
      const summary = d.analysis?.transcript_summary || d.metadata?.call_summary_title || ''
      const transcript = (d.transcript || []).map(t => `<div><strong style="color:${t.role === 'agent' ? '#3b7dd8' : '#1a1c2e'}">${t.role === 'agent' ? 'Lucci' : 'Caller'}:</strong> ${(t.message || '').replace(/</g, '&lt;')}</div>`).join('\n')
      return `<div style="border:1px solid #d0d3dc;border-radius:12px;padding:20px;margin-bottom:16px;background:#fff;">
        <h2 style="margin:0 0 8px 0;color:#1a1c2e;font-family:system-ui,sans-serif;">${d.metadata?.call_summary_title || 'Voicemail'}</h2>
        <div style="color:#6b7084;font-size:13px;margin-bottom:12px;">
          <strong>From:</strong> ${from} &middot; <strong>When:</strong> ${started} &middot; <strong>Duration:</strong> ${d.metadata?.call_duration_secs}s
        </div>
        <div style="color:#2d9a52;font-size:14px;margin-bottom:12px;padding:12px;background:#f0f9f1;border-radius:8px;"><strong>Summary:</strong> ${summary}</div>
        <div style="font-size:13px;line-height:1.6;color:#1a1c2e;padding-top:12px;border-top:1px solid #eceef2;">${transcript}</div>
        <div style="margin-top:12px;font-size:12px;"><a href="https://elevenlabs.io/app/conversational-ai/history/${d.metadata?.conversation_id || ''}" style="color:#3b7dd8;">View in ElevenLabs dashboard →</a></div>
      </div>`
    })

    const resend = new Resend(resendKey)
    const result = await resend.emails.send({
      from: FROM,
      to: [TO],
      subject: `📞 ${ids.length} new voicemail${ids.length > 1 ? 's' : ''} on your 770 line`,
      html: `<div style="max-width:640px;margin:0 auto;font-family:system-ui,-apple-system,sans-serif;background:#f4f5f7;padding:24px;">
        <h1 style="color:#1a1c2e;font-size:22px;margin-bottom:20px;">Voicemails — Farrington Command Center</h1>
        ${blocks.join('\n')}
        <div style="margin-top:20px;font-size:11px;color:#6b7084;text-align:center;">Sent from your NewsroomAIOS Main Line via Lucci agent</div>
      </div>`,
    })

    if (result.error) return NextResponse.json({ error: result.error.message }, { status: 502 })
    return NextResponse.json({ ok: true, sentTo: TO, count: ids.length })
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
