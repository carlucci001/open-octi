import { NextResponse } from 'next/server'
import { authorizePlatformAdminRequest } from '@/lib/platform-admin/auth'
import { listFccReleases } from '@/lib/platform-admin/fccResources'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
  const denied = await authorizePlatformAdminRequest(request)
  if (denied) return denied
  const { searchParams } = new URL(request.url)
  return NextResponse.json(listFccReleases({ limit: searchParams.get('limit') }), { headers: { 'Cache-Control': 'no-store' } })
}
