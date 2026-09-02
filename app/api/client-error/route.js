import { NextResponse } from 'next/server'

import { mutateData } from '@/lib/dataStore'
import { pushNtfy } from '@/lib/ntfy'
import { signatureOf } from '@/lib/client-error'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const STORE = 'client-errors.json'
const MAX_STORED = 200
const MAX_BODY_BYTES = 65_536
const ALERT_COOLDOWN_MS = 15 * 60 * 1000

const clip = (value, max) => (typeof value === 'string' ? value.slice(0, max) : '')

export async function POST(request) {
  let report
  try {
    const raw = await request.text()
    if (raw.length > MAX_BODY_BYTES) {
      return NextResponse.json({ ok: false, error: 'Payload too large.' }, { status: 413 })
    }
    const body = JSON.parse(raw)
    report = {
      message: clip(body?.message, 500) || 'Unknown client error',
      stack: clip(body?.stack, 4000),
      componentStack: clip(body?.componentStack, 4000),
      digest: clip(body?.digest, 100),
      url: clip(body?.url, 500),
      kind: clip(body?.kind, 40) || 'render',
      userAgent: clip(request.headers.get('user-agent'), 300),
      at: new Date().toISOString(),
    }
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON.' }, { status: 400 })
  }

  // Reporting a crash must never itself crash, so every failure below is swallowed.
  let shouldAlert = false
  try {
    const outcome = mutateData(STORE, (current) => {
      const document =
        current && typeof current === 'object' && Array.isArray(current.errors)
          ? current
          : { errors: [], alerts: {} }
      const alerts =
        document.alerts && typeof document.alerts === 'object' ? { ...document.alerts } : {}
      const signature = signatureOf(report)
      const now = Date.now()
      const fresh = now - (Number(alerts[signature]) || 0) > ALERT_COOLDOWN_MS
      if (fresh) alerts[signature] = now
      for (const key of Object.keys(alerts)) {
        if (now - Number(alerts[key]) > ALERT_COOLDOWN_MS * 8) delete alerts[key]
      }
      return {
        data: { errors: [report, ...document.errors].slice(0, MAX_STORED), alerts },
        result: { fresh },
      }
    })
    shouldAlert = Boolean(outcome?.fresh)
  } catch (error) {
    console.error('[client-error] failed to persist report:', error?.message)
  }

  console.error(
    `[client-error] ${report.kind} on ${report.url}: ${report.message}`,
    report.stack ? `\n${report.stack}` : '',
  )

  if (shouldAlert) {
    await pushNtfy({
      title: 'Command Center client crash',
      body: `${report.message}\n${report.url}\n${report.kind}`,
      priority: 'high',
      tags: ['rotating_light'],
    }).catch(() => {})
  }

  return NextResponse.json({ ok: true, alerted: shouldAlert })
}

export async function GET() {
  return NextResponse.json({ ok: true, store: STORE, note: 'POST client crash reports here.' })
}
