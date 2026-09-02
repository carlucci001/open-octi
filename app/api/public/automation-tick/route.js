import { NextResponse } from 'next/server'
import { runSchedulerTick } from '@/lib/automation-scheduler'
import { authorized } from '@/lib/automation-bridge-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request) {
  const auth = authorized(request)
  if (!auth.ok) {
    return NextResponse.json({ error: 'unauthorized' }, { status: auth.status })
  }
  try {
    const result = await runSchedulerTick()
    return NextResponse.json(result)
  } catch (error) {
    return NextResponse.json({ ok: false, error: error?.message || 'tick failed' }, { status: 500 })
  }
}
