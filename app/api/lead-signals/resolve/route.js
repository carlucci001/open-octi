import { NextResponse } from 'next/server'
import { resolveLeadSources } from '@/lib/lead-signals/resolver'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request) {
  const params = new URL(request.url).searchParams
  const type = params.get('type') || 'home-services'
  const location = params.get('location') || ''
  const result = resolveLeadSources({ leadType: type, location })
  return NextResponse.json({ ok: true, ...result })
}
