import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function getKey() {
  if (process.env.OPENROUTER_API_KEY) return process.env.OPENROUTER_API_KEY
  try {
    const c = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'credentials.json'), 'utf-8'))
    const item = (c.credentials || []).find(x => /openrouter/i.test(x.name || ''))
    return item?.fields?.find(f => /api|key/i.test(f.label))?.value || null
  } catch { return null }
}

export async function GET() {
  const key = getKey()
  if (!key) {
    return NextResponse.json({
      ok: false,
      source: 'openrouter',
      vendor: 'OpenRouter',
      needsCredential: true,
      credentialHint: 'Set OPENROUTER_API_KEY env var or add OpenRouter API key to credentials vault',
      fetchedAt: new Date().toISOString(),
    })
  }

  try {
    const headers = { Authorization: `Bearer ${key}` }
    const res = await fetch('https://openrouter.ai/api/v1/credits', { headers, cache: 'no-store' })
    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json({
        ok: false,
        source: 'openrouter',
        vendor: 'OpenRouter',
        error: `Credits API returned ${res.status}: ${text.slice(0, 200)}`,
        fetchedAt: new Date().toISOString(),
      })
    }

    const { data } = await res.json()
    const totalCredits = Number(data.total_credits ?? 0)
    const totalUsage = Number(data.total_usage ?? 0)
    const balance = totalCredits - totalUsage

    return NextResponse.json({
      ok: true,
      source: 'openrouter',
      vendor: 'OpenRouter',
      category: 'ai',
      currentMonthCost: 0,
      currency: 'USD',
      frequency: 'usage-based',
      details: [
        { label: 'Total credits purchased', amount: totalCredits },
        { label: 'Total used (lifetime)', amount: totalUsage },
        { label: 'Balance remaining', amount: balance },
        { label: 'OpenRouter does not expose per-month usage; lifetime totals only', amount: 0 },
      ],
      loginUrl: 'https://openrouter.ai/activity',
      fetchedAt: new Date().toISOString(),
    })
  } catch (e) {
    return NextResponse.json({
      ok: false,
      source: 'openrouter',
      vendor: 'OpenRouter',
      error: e.message,
      fetchedAt: new Date().toISOString(),
    })
  }
}
