import { NextResponse } from 'next/server'
import { readData } from '@/lib/dataStore'
import { requireCrmRead } from '@/lib/permissions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
  const { error } = await requireCrmRead(request)
  if (error) return error
  const url = new URL(request.url)
  const since = Number(url.searchParams.get('since') || 0)
  const data = readData('ui-actions.json') || { actions: [] }
  const actions = Array.isArray(data.actions) ? data.actions : []
  return NextResponse.json({
    ok: true,
    actions: actions.filter(action => Number(action.createdAt || 0) > since).slice(-20),
  })
}
