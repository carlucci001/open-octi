import { NextResponse } from 'next/server'
import { requireCrmRead } from '@/lib/permissions'
import { getOpenMontageStatus } from '@/lib/openmontage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
  const { error } = await requireCrmRead(request)
  if (error) return error
  return NextResponse.json(getOpenMontageStatus())
}
