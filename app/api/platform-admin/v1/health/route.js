import { NextResponse } from 'next/server'
import { authorizePlatformAdminRequest } from '@/lib/platform-admin/auth'
import { buildFccHealth } from '@/lib/platform-admin/fccResources'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
  const denied = await authorizePlatformAdminRequest(request)
  if (denied) return denied
  return NextResponse.json(await buildFccHealth(), { headers: { 'Cache-Control': 'no-store' } })
}
