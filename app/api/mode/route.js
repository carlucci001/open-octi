import { NextResponse } from 'next/server'
import { getMode, getModeMeta, setMode } from '@/lib/mode'
import { dataStoreInfo } from '@/lib/dataStore'
import { requireCapability } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({
    mode: getMode(),
    meta: getModeMeta(),
    banner: 'hidden',
    store: dataStoreInfo(['users.json', 'accounts.json', 'leads.json', 'conference.json']),
  })
}

export async function POST(request) {
  try {
    const { error } = await requireCapability(request, 'system:manage')
    if (error) return error

    const body = await request.json().catch(() => ({}))
    const target = body.mode === 'demo' ? 'demo' : 'real'
    const result = setMode(target)
    return NextResponse.json({
      ok: true,
      mode: result,
      meta: getModeMeta(),
      banner: 'hidden',
      store: dataStoreInfo(['users.json', 'accounts.json', 'leads.json', 'conference.json']),
    })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
