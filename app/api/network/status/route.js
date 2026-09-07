import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { openOctiSystemStatus } from '@/lib/openocti-system-status'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
  const { error } = await requireAdmin(request)
  if (error) return error
  return NextResponse.json(await openOctiSystemStatus())
}
