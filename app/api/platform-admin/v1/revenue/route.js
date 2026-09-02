import { NextResponse } from 'next/server'
import { authorizePlatformAdminRequest } from '@/lib/platform-admin/auth'
import { buildFccRevenue } from '@/lib/platform-admin/fccResources'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
  const denied = await authorizePlatformAdminRequest(request)
  if (denied) return denied
  const { searchParams } = new URL(request.url)
  return NextResponse.json(buildFccRevenue({ from: searchParams.get('from'), to: searchParams.get('to') }), { headers: { 'Cache-Control': 'no-store' } })
}
