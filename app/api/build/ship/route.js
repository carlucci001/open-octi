import { NextResponse } from 'next/server'
import { requireCrmRead } from '@/lib/permissions'
import { buildShipDeskSnapshot } from '@/lib/ship-desk-snapshot'
import { isOpenOcti } from '@/lib/edition'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
  const { error } = await requireCrmRead(request)
  if (error) return error
  if (isOpenOcti()) return NextResponse.json({ ok: false, error: 'capability_unavailable', capability: 'ship-desk', message: 'Platform release monitoring is not included in this OpenOcti build.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  try {
    return NextResponse.json(await buildShipDeskSnapshot(), { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('[ship-desk] snapshot failed:', error?.message)
    return NextResponse.json({ error: 'Ship Desk could not load platform release state.' }, { status: 500 })
  }
}
