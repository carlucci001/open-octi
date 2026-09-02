import { NextResponse } from 'next/server'
import { requireCrmRead, requireCrmWrite } from '@/lib/permissions'
import { getMoneySettings, pollMoneyConsole, saveMoneySettings } from '@/lib/money-console'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function json(body, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

export async function GET(request) {
  const { error } = await requireCrmRead(request)
  if (error) return error
  const { searchParams } = new URL(request.url)
  try {
    const snapshot = await pollMoneyConsole({ periodKey: searchParams.get('period') || undefined, bypassCache: searchParams.get('refresh') === '1' })
    return json({ ok: true, snapshot, settings: getMoneySettings() })
  } catch (error) {
    return json({ ok: false, error: error?.message || 'Money Console could not load.' }, 500)
  }
}

export async function POST(request) {
  const { error } = await requireCrmWrite(request)
  if (error) return error
  try {
    const body = await request.json()
    return json({ ok: true, settings: saveMoneySettings({ dunningProposalDays: body?.dunningProposalDays }) })
  } catch (error) {
    return json({ ok: false, error: error?.message || 'Money Console settings could not be saved.' }, 400)
  }
}
