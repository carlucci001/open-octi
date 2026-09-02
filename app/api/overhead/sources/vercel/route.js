import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PLAN_PRICES = { hobby: 0, pro: 20, enterprise: 0 }

function getToken() {
  if (process.env.VERCEL_TOKEN) return process.env.VERCEL_TOKEN
  if (process.env.VERCEL_API_TOKEN) return process.env.VERCEL_API_TOKEN
  try {
    const vaultPath = path.join(process.cwd(), 'data', 'credentials.json')
    const vault = JSON.parse(fs.readFileSync(vaultPath, 'utf8'))
    const entry = vault.credentials?.find(c => /vercel/i.test(c.name))
    if (entry) {
      const field = entry.fields?.find(f => /token|key|secret/i.test(f.label))
      if (field?.value) return field.value
    }
  } catch {}
  return null
}

export async function GET() {
  const base = {
    source: 'vercel',
    vendor: 'Vercel',
    category: 'hosting',
    fetchedAt: new Date().toISOString(),
  }

  const token = getToken()
  if (!token) {
    return NextResponse.json({
      ...base,
      ok: false,
      needsCredential: true,
      credentialHint:
        'Set VERCEL_TOKEN env var or add Vercel API token to credentials vault. Generate one at https://vercel.com/account/tokens',
    })
  }

  const headers = { Authorization: `Bearer ${token}` }

  try {
    const userRes = await fetch('https://api.vercel.com/v2/user', { headers })
    if (!userRes.ok) {
      const err = await userRes.text()
      return NextResponse.json({
        ...base,
        ok: false,
        error: `Vercel API error ${userRes.status}: ${err.slice(0, 200)}`,
      })
    }

    const { user } = await userRes.json()
    const planRaw = (user?.billing?.plan ?? user?.plan ?? 'hobby').toLowerCase()
    const planName = planRaw.charAt(0).toUpperCase() + planRaw.slice(1)
    const cost = PLAN_PRICES[planRaw] ?? 0

    const details = [{ label: `Plan: ${planName}`, amount: cost }]

    // Try to grab project count as a useful detail
    try {
      const projRes = await fetch('https://api.vercel.com/v9/projects?limit=100', { headers })
      if (projRes.ok) {
        const projData = await projRes.json()
        const count = projData.projects?.length ?? 0
        details.push({ label: `Projects`, amount: count })
      }
    } catch {}

    return NextResponse.json({
      ...base,
      ok: true,
      currentMonthCost: cost,
      currency: 'USD',
      frequency: 'monthly',
      details,
      loginUrl: 'https://vercel.com/dashboard/usage',
    })
  } catch (e) {
    return NextResponse.json({ ...base, ok: false, error: e.message })
  }
}
