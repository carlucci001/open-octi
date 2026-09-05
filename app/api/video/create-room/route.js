// Creates a Daily.co room without sending an email — used by in-app video triggers
// (Conference Center, VideoMeetButton, etc.) that just need a URL to embed or share.
import { NextResponse } from 'next/server'
import { requireCapability } from '@/lib/feature-manifest'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request) {
  const unavailable = requireCapability('daily')
  if (unavailable) return NextResponse.json(unavailable.body, { status: unavailable.status })
  try {
    const { seed, persistent } = await request.json().catch(() => ({}))
    const apiKey = process.env.DAILY_API_KEY

    const slug = String(seed || 'meeting').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'meeting'
    const name = persistent ? `ff-${slug}` : `ff-${slug}-${Math.random().toString(36).slice(2, 8)}`
    const exp = persistent ? undefined : Math.floor(Date.now() / 1000) + 4 * 60 * 60

    // Daily room properties tuned for our paid plan — knocking off (no waiting room
    // friction for instant calls), full participant/network/PiP UI on, English UI.
    // Daily's "Powered by Daily" footer is automatically removed on paid tiers when
    // the embed lands on our subdomain. Brand-kit colors live in the Daily dashboard.
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
      if (res.status === 409) {
        const existing = await fetch(`https://api.daily.co/v1/rooms/${name}`, { headers: { Authorization: `Bearer ${apiKey}` } }).then(r => r.json()).catch(() => null)
        if (existing?.url) return NextResponse.json({ ok: true, url: existing.url, name })
      }
      return NextResponse.json({ error: data.error || data.info || 'Daily room creation failed' }, { status: 500 })
    }
    return NextResponse.json({ ok: true, url: data.url, name: data.name })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
