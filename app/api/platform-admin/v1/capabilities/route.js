import { NextResponse } from 'next/server'
import { buildFeatureManifest } from '@/lib/feature-manifest'
import { listOpenOctiKeyStatus } from '@/lib/openocti-keys'
import { integrationTestStatuses } from '@/lib/integration-test-status'
import { effectivePostizEnv } from '@/lib/postiz-config'
import { stripeConfigurationEnv } from '@/lib/stripe-configuration'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Deliberately public and value-free: this endpoint reports only whether a
// capability is configured. It never returns credential contents.
export async function GET() {
  const providerStatuses = listOpenOctiKeyStatus()
  const manifest = buildFeatureManifest(effectivePostizEnv(stripeConfigurationEnv()), { providerStatuses })
  const testStatuses = integrationTestStatuses()
  manifest.capabilities = manifest.capabilities.map(capability => ({ ...capability, lastTest: testStatuses[capability.id] || null }))
  return NextResponse.json({ ok: true, ...manifest }, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
