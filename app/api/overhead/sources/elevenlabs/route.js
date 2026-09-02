import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TIER_PRICES = {
  free: 0,
  starter: 5,
  creator: 22,
  pro: 99,
  scale: 330,
  business: 1320,
}

function getApiKey() {
  try {
    const filePath = path.join(process.cwd(), 'data', 'credentials.json')
    const raw = fs.readFileSync(filePath, 'utf8')
    const { credentials } = JSON.parse(raw)
    const entry = credentials.find(c => c.name === 'ElevenLabs') || credentials.find(c => c.id === 'cred_005')
    if (!entry) return null
    const field = entry.fields.find(f => /api/i.test(f.label))
    return field?.value || null
  } catch {
    return null
  }
}

export async function GET() {
  const base = { source: 'elevenlabs', vendor: 'ElevenLabs', fetchedAt: new Date().toISOString() }

  const apiKey = getApiKey()
  if (!apiKey) {
    return NextResponse.json({
      ok: false,
      ...base,
      needsCredential: true,
      credentialHint: 'Add ElevenLabs API key to credentials vault',
    })
  }

  try {
    const res = await fetch('https://api.elevenlabs.io/v1/user/subscription', {
      headers: { 'xi-api-key': apiKey },
      cache: 'no-store',
    })

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText)
      return NextResponse.json({ ok: false, ...base, error: `ElevenLabs API error ${res.status}: ${text}` })
    }

    const data = await res.json()
    const tier = (data.tier || 'free').toLowerCase()
    const cost = TIER_PRICES[tier] ?? 0
    const used = data.character_count ?? 0
    const limit = data.character_limit ?? 0
    const nextDue = data.next_character_count_reset_unix
      ? new Date(data.next_character_count_reset_unix * 1000).toISOString().slice(0, 10)
      : undefined

    return NextResponse.json({
      ok: true,
      ...base,
      category: 'ai',
      currentMonthCost: cost,
      currency: 'USD',
      frequency: 'monthly',
      ...(nextDue && { nextDue }),
      details: [
        { label: `Plan: ${tier}`, amount: cost },
        { label: `Characters: ${used.toLocaleString()} / ${limit.toLocaleString()}`, amount: 0 },
      ],
      loginUrl: 'https://elevenlabs.io/app/subscription',
    })
  } catch (err) {
    return NextResponse.json({ ok: false, ...base, error: err.message })
  }
}
