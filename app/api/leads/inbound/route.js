// Universal inbound webhook for Lead capture from external sources
// (websites, forms, third-party integrations).
//
// POST { channelId, payload, signature?, externalId? }
//   payload = { name, email, phone, company?, message?, preferredTime?, tags?, ... }
//
// If the channel has a secret configured, the signature must be the
// HMAC-SHA256 hex digest of JSON.stringify(payload) using the secret as key.
// Returns { ok: true, leadId, opportunityId? } on success.
import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { listChannels, ingestPayload } from '@/lib/inboundChannels'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function verifySignature(secret, payload, signature) {
  if (!secret) return true // signature optional when no secret set
  if (!signature) return false
  const expected = crypto.createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex')
  // timingSafeEqual requires equal-length buffers
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

export async function POST(request) {
  let body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { channelId, payload, signature, externalId, sourceMeta } = body
  if (!channelId) return NextResponse.json({ error: 'channelId required' }, { status: 400 })
  if (!payload || typeof payload !== 'object') return NextResponse.json({ error: 'payload required' }, { status: 400 })

  const channel = listChannels().find(c => c.id === channelId)
  if (!channel) return NextResponse.json({ error: `Unknown channelId: ${channelId}` }, { status: 404 })
  if (channel.type !== 'webhook') return NextResponse.json({ error: 'Channel is not a webhook type' }, { status: 400 })
  if (!channel.enabled) return NextResponse.json({ error: 'Channel is disabled' }, { status: 403 })

  if (!verifySignature(channel.config?.secret, payload, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  try {
    const result = await ingestPayload({ channelId, payload, externalId, sourceMeta })
    if (result.skipped) return NextResponse.json({ ok: true, skipped: true, reason: result.reason })
    return NextResponse.json({
      ok: true,
      leadId: result.lead?.id,
      opportunityId: result.opportunity?.id || null,
    })
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
