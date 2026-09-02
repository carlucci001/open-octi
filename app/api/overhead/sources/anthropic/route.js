import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BASE = {
  source: 'anthropic',
  vendor: 'Anthropic',
  category: 'ai',
  loginUrl: 'https://console.anthropic.com/settings/usage',
}

function getRegularKey() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY
  try {
    const c = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'credentials.json'), 'utf-8'))
    const item = (c.credentials || []).find(x => /anthropic/i.test(x.name || ''))
    return item?.fields?.find(f => /api|key/i.test(f.label))?.value || null
  } catch { return null }
}

export async function GET() {
  const adminKey = process.env.ANTHROPIC_ADMIN_KEY
  const regularKey = getRegularKey()

  if (!adminKey || !adminKey.startsWith('sk-ant-admin01-')) {
    // Regular key works for everything except billing — report a friendly "configured but billing locked"
    if (regularKey) {
      return NextResponse.json({
        ok: true,
        ...BASE,
        currentMonthCost: 0,
        currency: 'USD',
        frequency: 'usage-based',
        details: [
          { label: 'Configured (regular API key in vault)', amount: 0 },
          { label: 'Billing data requires Anthropic admin key (org-only feature)', amount: 0 },
          { label: 'Add Anthropic as a manual subscription with your typical monthly spend', amount: 0 },
        ],
        fetchedAt: new Date().toISOString(),
      })
    }
    return NextResponse.json({
      ok: false,
      ...BASE,
      error: 'No Anthropic key configured',
      needsCredential: true,
      credentialHint: 'Add an Anthropic API key to the credentials vault, or set ANTHROPIC_API_KEY env var.',
      fetchedAt: new Date().toISOString(),
    })
  }

  try {
    const now = new Date()
    const year = now.getUTCFullYear()
    const month = String(now.getUTCMonth() + 1).padStart(2, '0')
    const startOfMonth = `${year}-${month}-01T00:00:00Z`
    const endOfNow = now.toISOString()

    // Last month boundaries
    const lastMonthDate = new Date(Date.UTC(year, now.getUTCMonth() - 1, 1))
    const lastYear = lastMonthDate.getUTCFullYear()
    const lastMonth = String(lastMonthDate.getUTCMonth() + 1).padStart(2, '0')
    const startOfLastMonth = `${lastYear}-${lastMonth}-01T00:00:00Z`
    const endOfLastMonth = `${year}-${month}-01T00:00:00Z`

    const headers = {
      'x-api-key': adminKey,
      'anthropic-version': '2023-06-01',
    }

    async function fetchUsage(startTime, endTime) {
      const params = new URLSearchParams({ start_time: startTime, end_time: endTime, granularity: 'month' })
      const res = await fetch(
        `https://api.anthropic.com/v1/organizations/usage?${params}`,
        { headers, cache: 'no-store' }
      )
      if (!res.ok) {
        const text = await res.text()
        throw new Error(`Anthropic API ${res.status}: ${text.slice(0, 200)}`)
      }
      return res.json()
    }

    const [currentData, lastData] = await Promise.all([
      fetchUsage(startOfMonth, endOfNow),
      fetchUsage(startOfLastMonth, endOfLastMonth),
    ])

    function sumCost(data) {
      const buckets = data?.data ?? data?.usage ?? []
      return buckets.reduce((sum, b) => sum + (Number(b.total_cost ?? b.cost ?? 0)), 0)
    }

    function buildDetails(data) {
      const modelMap = {}
      const buckets = data?.data ?? data?.usage ?? []
      for (const b of buckets) {
        const model = b.model ?? 'unknown'
        modelMap[model] = (modelMap[model] ?? 0) + Number(b.total_cost ?? b.cost ?? 0)
      }
      return Object.entries(modelMap)
        .filter(([, v]) => v > 0)
        .map(([label, amount]) => ({ label, amount: Math.round(amount * 10000) / 10000 }))
        .sort((a, b) => b.amount - a.amount)
    }

    const currentMonthCost = Math.round(sumCost(currentData) * 10000) / 10000
    const lastMonthCost = Math.round(sumCost(lastData) * 10000) / 10000

    return NextResponse.json({
      ok: true,
      ...BASE,
      currentMonthCost,
      lastMonthCost,
      currency: 'USD',
      frequency: 'usage-based',
      details: buildDetails(currentData),
      fetchedAt: new Date().toISOString(),
    })
  } catch (e) {
    // Admin key was present but the API rejected it (likely not actually an admin key, or no org).
    // Fall back to the friendly "configured but billing locked" response.
    return NextResponse.json({
      ok: true,
      ...BASE,
      currentMonthCost: 0,
      currency: 'USD',
      frequency: 'usage-based',
      details: [
        { label: 'Anthropic key configured', amount: 0 },
        { label: 'Billing API rejected the admin key — likely no org account', amount: 0 },
        { label: 'Add Anthropic as a manual subscription with your typical monthly spend', amount: 0 },
      ],
      fetchedAt: new Date().toISOString(),
    })
  }
}
