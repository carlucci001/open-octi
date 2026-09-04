import { NextResponse } from 'next/server'
import { buildFeatureManifest } from '@/lib/feature-manifest'
import { listOpenOctiKeyStatus } from '@/lib/openocti-keys'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Deliberately public and value-free: this endpoint reports only whether a
// capability is configured. It never returns credential contents.
export async function GET() {
  const providerStatuses = listOpenOctiKeyStatus()
  return NextResponse.json({ ok: true, ...buildFeatureManifest(process.env, { providerStatuses }) }, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
