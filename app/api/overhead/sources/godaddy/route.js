import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function getCredentials() {
  const key = process.env.GODADDY_API_KEY
  const secret = process.env.GODADDY_API_SECRET
  if (key && secret) return { key, secret }
  try {
    const vault = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'credentials.json'), 'utf8'))
    const entry = vault.credentials?.find(c => /godaddy/i.test(c.name))
    if (entry) {
      const k = entry.fields?.find(f => /api key/i.test(f.label))?.value
      const s = entry.fields?.find(f => /api secret/i.test(f.label))?.value
      if (k && s) return { key: k, secret: s }
    }
  } catch {}
  return null
}

function summarise(rows, now) {
  const thisYear = now.getFullYear(), thisMonth = now.getMonth()
  let currentMonthCost = 0, nextDueDate = null
  const details = []
  for (const { label, amount, exp } of rows) {
    if (exp) {
      if (exp.getFullYear() === thisYear && exp.getMonth() === thisMonth) currentMonthCost += amount
      if (exp >= now && (!nextDueDate || exp < new Date(nextDueDate))) nextDueDate = exp.toISOString().slice(0, 10)
    }
    details.push({ label, amount })
  }
  details.sort((a, b) => a.label.localeCompare(b.label))
  return { currentMonthCost, nextDueDate, details: details.slice(0, 10) }
}

const BASE = { ok: true, source: 'godaddy', vendor: 'GoDaddy', category: 'domains', currency: 'USD', frequency: 'yearly', loginUrl: 'https://dcc.godaddy.com/control/portfolio' }

export async function GET() {
  const fetchedAt = new Date().toISOString()
  const now = new Date()
  try {
    // Primary: local domains.json
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'domains.json'), 'utf8'))
      const rows = (raw.domains || [])
        .filter(d => /godaddy/i.test(d.registrar || ''))
        .map(d => ({ label: d.domain, amount: Number(d.renewalCost) || 0, exp: d.expirationDate ? new Date(d.expirationDate) : null }))
      const { currentMonthCost, nextDueDate, details } = summarise(rows, now)
      return NextResponse.json({ ...BASE, currentMonthCost, nextDue: nextDueDate ?? undefined, details, fetchedAt })
    } catch {}

    // Fallback: GoDaddy API
    const creds = getCredentials()
    if (!creds) return NextResponse.json({ ok: false, source: 'godaddy', vendor: 'GoDaddy', needsCredential: true, credentialHint: 'Set GODADDY_API_KEY and GODADDY_API_SECRET env vars or add to credentials vault', fetchedAt })

    const res = await fetch('https://api.godaddy.com/v1/domains?limit=100', { headers: { Authorization: `sso-key ${creds.key}:${creds.secret}` }, cache: 'no-store' })
    if (!res.ok) return NextResponse.json({ ok: false, source: 'godaddy', vendor: 'GoDaddy', error: `GoDaddy API error ${res.status}`, fetchedAt })

    const rows = (await res.json()).map(d => ({ label: d.domain, amount: Number(d.renewalPrice) || 0, exp: d.expires ? new Date(d.expires) : null }))
    const { currentMonthCost, nextDueDate, details } = summarise(rows, now)
    return NextResponse.json({ ...BASE, currentMonthCost, nextDue: nextDueDate ?? undefined, details, fetchedAt })
  } catch (e) {
    return NextResponse.json({ ok: false, source: 'godaddy', vendor: 'GoDaddy', error: e.message, fetchedAt })
  }
}
