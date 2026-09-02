import { NextResponse } from 'next/server'
import { requireCrmRead } from '@/lib/permissions'
import { buildShipDeskSnapshot } from '@/lib/ship-desk-snapshot'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
  const { error } = await requireCrmRead(request)
  if (error) return error
  try {
    return NextResponse.json(await buildShipDeskSnapshot(), { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('[ship-desk] snapshot failed:', error?.message)
    return NextResponse.json({ error: 'Ship Desk could not load platform release state.' }, { status: 500 })
  }
}
