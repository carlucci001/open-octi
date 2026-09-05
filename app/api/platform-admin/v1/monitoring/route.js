import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { openMonitoringHistory } from '@/lib/monitoring/history'
import { runScheduledMonitoring } from '@/lib/monitoring/runtime'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function json(body, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

async function authorized(request) {
  const user = await getCurrentUser(request)
  return user && ['owner', 'admin'].includes(user.role)
}

export async function GET(request) {
  if (!await authorized(request)) return json({ ok: false, error: 'Administrator access is required' }, 403)
  const history = openMonitoringHistory()
  try {
    return json({ ok: true, latest: history.latest(), history: history.list(48) })
  } finally { history.close() }
}

export async function POST(request) {
  if (!await authorized(request)) return json({ ok: false, error: 'Administrator access is required' }, 403)
  try {
    const result = await runScheduledMonitoring()
    return json(result, result.busy ? 409 : 200)
  } catch {
    return json({ ok: false, error: 'Monitoring could not run. Check the installation manifest and server logs.' }, 500)
  }
}
