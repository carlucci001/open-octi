import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BASE = 'https://api.daily.co/v1'
const FREE_MINUTES = 10000
const COST_PER_MINUTE = 0.004

export async function GET() {
  const fetchedAt = new Date().toISOString()
  const key = process.env.DAILY_API_KEY

  if (!key) {
    return NextResponse.json({
      ok: false,
      source: 'daily',
      vendor: 'Daily.co',
      needsCredential: true,
      credentialHint: 'Set DAILY_API_KEY env var. Get one at https://dashboard.daily.co/developers',
      fetchedAt,
    })
  }

  const headers = { Authorization: `Bearer ${key}` }
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthStartTs = Math.floor(monthStart.getTime() / 1000)

  try {
    const res = await fetch(`${BASE}/meetings?limit=100`, { headers, cache: 'no-store' })

    if (!res.ok) {
      const txt = await res.text().catch(() => res.statusText)
      return NextResponse.json({
        ok: false,
        source: 'daily',
        vendor: 'Daily.co',
        error: `Daily.co API error ${res.status}: ${txt}`,
        fetchedAt,
      })
    }

    const data = await res.json()
    const meetings = Array.isArray(data?.data) ? data.data : []

    // Filter to current month using start_time (unix seconds)
    const thisMonth = meetings.filter(m => m.start_time >= monthStartTs)

    let totalParticipantMinutes = 0
    for (const m of thisMonth) {
      const durationSec = m.duration ?? 0
      const participants = m.max_participants ?? m.participants ?? 1
      totalParticipantMinutes += (durationSec / 60) * participants
    }

    const overage = Math.max(0, totalParticipantMinutes - FREE_MINUTES)
    const estimatedCost = parseFloat((overage * COST_PER_MINUTE).toFixed(2))

    return NextResponse.json({
      ok: true,
      source: 'daily',
      vendor: 'Daily.co',
      category: 'telephony',
      currentMonthCost: estimatedCost,
      currency: 'USD',
      frequency: 'usage-based',
      details: [
        { label: `Meetings this month: ${thisMonth.length}`, amount: 0 },
        { label: `Participant minutes: ${Math.round(totalParticipantMinutes)}`, amount: 0 },
        { label: 'Estimated overage', amount: estimatedCost },
      ],
      loginUrl: 'https://dashboard.daily.co/billing',
      fetchedAt,
    })
  } catch (e) {
    return NextResponse.json({
      ok: true,
      source: 'daily',
      vendor: 'Daily.co',
      category: 'telephony',
      currentMonthCost: 0,
      currency: 'USD',
      frequency: 'usage-based',
      details: [
        { label: 'Meetings this month: 0', amount: 0 },
        { label: 'Participant minutes: 0', amount: 0 },
        { label: 'Estimated overage', amount: 0 },
      ],
      loginUrl: 'https://dashboard.daily.co/billing',
      note: `Could not fetch meetings: ${e.message}`,
      fetchedAt,
    })
  }
}
