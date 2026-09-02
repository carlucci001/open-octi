import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function configuredFallback(base) {
  return NextResponse.json({
    ok: true,
    ...base,
    currentMonthCost: 0,
    currency: 'USD',
    frequency: 'usage-based',
    details: [
      { label: 'OpenAI key configured', amount: 0 },
      { label: 'Billing data requires org-admin key (most keys do not qualify)', amount: 0 },
      { label: 'Add OpenAI as a manual subscription with your typical monthly spend', amount: 0 },
    ],
  })
}

export async function GET() {
  const key = process.env.OPENAI_ADMIN_KEY || process.env.OPENAI_API_KEY
  const fetchedAt = new Date().toISOString()
  const loginUrl = 'https://platform.openai.com/usage'
  const base = { source: 'openai', vendor: 'OpenAI', category: 'ai', loginUrl, fetchedAt }

  if (!key) {
    return NextResponse.json({ ok: false, ...base, error: 'No OpenAI key found', needsCredential: true, credentialHint: 'Set OPENAI_API_KEY env var with your OpenAI key.' })
  }

  const now = Math.floor(Date.now() / 1000)
  const d = new Date()
  const startOfMonth = Math.floor(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).getTime() / 1000)

  try {
    const url = `https://api.openai.com/v1/organization/costs?start_time=${startOfMonth}&end_time=${now}&bucket_width=1d`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      cache: 'no-store',
    })

    if (res.status === 401 || res.status === 403) {
      return configuredFallback(base)
    }

    if (!res.ok) {
      return configuredFallback(base)
    }

    const data = await res.json()
    const buckets = data?.data ?? []

    // Each bucket has results[] with { amount: { value, currency }, line_item }
    let currentMonthCost = 0
    const modelMap = {}
    for (const bucket of buckets) {
      for (const result of bucket.results ?? []) {
        const amount = result?.amount?.value ?? 0
        currentMonthCost += amount
        const label = result?.line_item ?? result?.project_id ?? 'other'
        modelMap[label] = (modelMap[label] ?? 0) + amount
      }
    }

    const details = Object.entries(modelMap)
      .map(([label, amount]) => ({ label, amount: Math.round(amount * 10000) / 10000 }))
      .sort((a, b) => b.amount - a.amount)

    return NextResponse.json({ ok: true, ...base, currentMonthCost: Math.round(currentMonthCost * 10000) / 10000, currency: 'USD', frequency: 'usage-based', details, })
  } catch (e) {
    // Network or parse error — key is configured, billing endpoint just isn't accessible
    return configuredFallback(base)
  }
}
