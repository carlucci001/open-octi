import { NextResponse } from 'next/server'
import { requireCrmRead } from '@/lib/permissions'
import { ensurePressDeskSeeds } from '@/lib/press/store'
import { queryPressContacts } from '@/lib/press/query'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function fromSearchParams(searchParams) {
  return {
    beats: searchParams.getAll('beats').flatMap(value => value.split(',')),
    outletTypes: searchParams.getAll('outletTypes').flatMap(value => value.split(',')),
    scope: searchParams.get('scope'),
    state: searchParams.get('state'),
    metro: searchParams.get('metro'),
    limit: searchParams.get('limit'),
    minScore: searchParams.get('minScore'),
  }
}

export async function GET(request) {
  const { error } = await requireCrmRead(request)
  if (error) return error
  ensurePressDeskSeeds()
  return NextResponse.json({ ok: true, ...queryPressContacts(fromSearchParams(new URL(request.url).searchParams)) })
}

export async function POST(request) {
  const { error } = await requireCrmRead(request)
  if (error) return error
  const body = await request.json().catch(() => ({}))
  ensurePressDeskSeeds()
  return NextResponse.json({ ok: true, ...queryPressContacts(body) })
}
