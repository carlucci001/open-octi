import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const keySid = process.env.TWILIO_API_KEY_SID
  const keySecret = process.env.TWILIO_API_KEY_SECRET

  if (!sid || !keySid || !keySecret) {
    return NextResponse.json({
      ok: false,
      source: 'twilio',
      vendor: 'Twilio',
      needsCredential: true,
      credentialHint: 'Set TWILIO_ACCOUNT_SID, TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET env vars',
      fetchedAt: new Date().toISOString(),
    })
  }

  try {
    const auth = Buffer.from(`${keySid}:${keySecret}`).toString('base64')
    const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Usage/Records/ThisMonth.json?PageSize=200`
    const res = await fetch(url, {
      headers: { Authorization: `Basic ${auth}` },
      cache: 'no-store',
    })

    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json({
        ok: false,
        source: 'twilio',
        vendor: 'Twilio',
        error: `Twilio API error ${res.status}: ${text.slice(0, 200)}`,
        fetchedAt: new Date().toISOString(),
      })
    }

    const data = await res.json()
    const records = data.usage_records ?? []

    const withCost = records
      .map(r => ({ label: r.description || r.category, amount: Math.abs(parseFloat(r.price) || 0) }))
      .filter(r => r.amount > 0)

    const total = withCost.reduce((sum, r) => sum + r.amount, 0)

    const details = [...withCost]
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5)

    return NextResponse.json({
      ok: true,
      source: 'twilio',
      vendor: 'Twilio',
      category: 'telephony',
      currentMonthCost: Math.round(total * 10000) / 10000,
      currency: 'USD',
      frequency: 'usage-based',
      details,
      loginUrl: 'https://console.twilio.com/us1/billing/manage-billing/billing-overview',
      fetchedAt: new Date().toISOString(),
    })
  } catch (e) {
    return NextResponse.json({
      ok: false,
      source: 'twilio',
      vendor: 'Twilio',
      error: e.message,
      fetchedAt: new Date().toISOString(),
    })
  }
}
