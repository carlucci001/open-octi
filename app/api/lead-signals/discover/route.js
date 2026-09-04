import { NextResponse } from 'next/server'
import { discoverLocalSources } from '@/lib/lead-signals/discovery'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(request) {
  const zip = new URL(request.url).searchParams.get('zip') || ''
  if (!/^\d{5}$/.test(zip)) return NextResponse.json({ ok: false, error: 'A valid five-digit ZIP is required' }, { status: 400 })
  try {
    const index = new URL(request.url).searchParams.get('index') !== '0'
    const result = await discoverLocalSources({ zip, index })
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 422 })
  }
}
