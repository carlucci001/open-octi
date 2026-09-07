import { NextResponse } from 'next/server'
import { requireCrmRead } from '@/lib/permissions'
import { resolveStripeConfiguration, stripeConfigurationStatus } from '@/lib/stripe-configuration'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
  const { error } = await requireCrmRead(request)
  if (error) return error
  const config = resolveStripeConfiguration()
  const status = stripeConfigurationStatus(config)
  return NextResponse.json({ ok: status.browserReady, publishableKey: status.browserReady ? config.publishableKey : null, mode: status.mode }, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
