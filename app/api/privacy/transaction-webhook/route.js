import { NextResponse } from 'next/server'
import { publicPrivacyWebhookUrl, upsertPrivacyTransaction } from '@/lib/privacyFinance'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function authorized(request, url) {
  const expected = process.env.PRIVACY_WEBHOOK_TOKEN || ''
  if (!expected) return true
  const supplied = request.headers.get('x-privacy-webhook-token') || url.searchParams.get('token') || ''
  return supplied === expected
}

export async function GET(request) {
  const url = new URL(request.url)
  return NextResponse.json({
    ok: true,
    provider: 'privacy.com',
    webhookUrl: publicPrivacyWebhookUrl(url.origin),
    accepts: 'POST application/json',
  })
}

export async function POST(request) {
  const url = new URL(request.url)
  if (!authorized(request, url)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized Privacy webhook' }, { status: 401 })
  }

  let payload
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400 })
  }

  try {
    const result = upsertPrivacyTransaction(payload, { source: 'privacy_webhook' })
    return NextResponse.json({ ok: true, created: result.created })
  } catch {
    return NextResponse.json({ ok: false, error: 'Privacy webhook failed' }, { status: 500 })
  }
}
