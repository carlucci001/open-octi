// Log a finished time-tracking session against a client account.
// Side effects:
//   - Increment accounts.json[N].trackedSeconds (cumulative running total)
//   - Append a 'time_tracked' activity to activities.json with linkedTo.accountId
//
// POST { accountId, startedAt, stoppedAt, durationSeconds, note? }

import { NextResponse } from 'next/server'
import { logTimeTrackingSession } from '@/lib/timeTracking'
import { requireCrmWrite } from '@/lib/permissions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request) {
  const { error } = await requireCrmWrite(request)
  if (error) return error
  let body
  try { body = await request.json() } catch { return NextResponse.json({ ok: false, error: 'Bad JSON' }, { status: 400 }) }

  try {
    return NextResponse.json({ ok: true, ...logTimeTrackingSession(body) })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status || 400 })
  }
}
