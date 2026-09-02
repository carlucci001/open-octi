import { NextResponse } from 'next/server'
import { requireCrmRead, requireCrmWrite } from '@/lib/permissions'
import { getUsageSettings, queryUsage, saveUsageSettings } from '@/lib/usage-events'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
  const { error } = await requireCrmRead(request)
  if (error) return error
  const { searchParams } = new URL(request.url)
  try {
    const result = queryUsage({
      from: searchParams.get('from') || undefined,
      to: searchParams.get('to') || undefined,
      groupBy: searchParams.get('groupBy') || 'agent',
    })
    return NextResponse.json({ ok: true, ...result, settings: getUsageSettings() })
  } catch (cause) {
    return NextResponse.json({ ok: false, error: cause?.message || 'Invalid usage query' }, { status: 400 })
  }
}

export async function POST(request) {
  const { error } = await requireCrmWrite(request)
  if (error) return error
  const body = await request.json().catch(() => ({}))
  const settings = saveUsageSettings({
    agentMonthlyUsd: body.agentMonthlyUsd,
    clientMonthlyUsd: body.clientMonthlyUsd,
  })
  return NextResponse.json({ ok: true, settings })
}
