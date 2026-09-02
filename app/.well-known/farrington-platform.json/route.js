import { NextResponse } from 'next/server'
import { buildFccManifest } from '@/lib/platform-admin/fccResources'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json(buildFccManifest(), {
    headers: { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' },
  })
}
