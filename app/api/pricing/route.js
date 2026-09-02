// Pricing tiers + cost projections.
// GET /api/pricing                    → all tiers (public-shaped, what to quote customers)
// GET /api/pricing?withMargin=1       → tiers + Carl's projected cost per tier + margin
//
// Cost projection assumes a customer USES their full included allowance (worst case for Carl).

import { NextResponse } from 'next/server'
import { readData } from '@/lib/dataStore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function projectCarlCost(tier, vendors) {
  const inc = tier.included || {}
  let cost = 0
  const breakdown = []

  // Phone number rental — every tier ships with 1 dedicated Twilio number
  cost += vendors.twilio.phoneNumberMonthlyRental
  breakdown.push({ item: 'Twilio number rental (1 line)', cost: vendors.twilio.phoneNumberMonthlyRental })

  // Voice minutes — split inbound/outbound conservatively (assume 70% inbound for receptionist tiers, 50/50 for office mgr)
  const minutes = inc.voiceMinutes || 0
  if (minutes > 0) {
    const elev = minutes * vendors.elevenlabs.voicePerMinute
    const tw = minutes * (vendors.twilio.voicePerMinuteInbound * 0.6 + vendors.twilio.voicePerMinuteOutbound * 0.4)
    cost += elev + tw
    breakdown.push({ item: `${minutes} voice minutes (ElevenLabs)`, cost: +elev.toFixed(2) })
    breakdown.push({ item: `${minutes} voice minutes (Twilio)`, cost: +tw.toFixed(2) })
  }

  // Email
  if (inc.emails) {
    const e = Math.max(vendors.resend.monthlyMinimum, inc.emails * vendors.resend.perEmail)
    // The minimum is shared across all tenants — attribute proportionally; keep simple, count $0 marginal
    breakdown.push({ item: `${inc.emails} emails (Resend, shared minimum)`, cost: 0 })
  }

  // SMS
  if (inc.sms) {
    const s = inc.sms * vendors.twilio.smsPerSegment
    cost += s
    breakdown.push({ item: `${inc.sms} SMS segments (Twilio)`, cost: +s.toFixed(2) })
  }

  // Images
  if (inc.imagesGenerated) {
    const img = inc.imagesGenerated * vendors.openai.gptImage1PerImage
    cost += img
    breakdown.push({ item: `${inc.imagesGenerated} AI images (OpenAI image-1)`, cost: +img.toFixed(2) })
  }

  // LLM tokens — rough projection at Sonnet 4.6 mid usage
  // Voice agents use ~4k tokens per minute of conversation. Assume 60% input / 40% output.
  if (minutes > 0) {
    const tokens = minutes * 4000
    const inputTokens = tokens * 0.6
    const outputTokens = tokens * 0.4
    const llm = (inputTokens / 1_000_000) * vendors.anthropic.claudeSonnet46PerMillionInput
              + (outputTokens / 1_000_000) * vendors.anthropic.claudeSonnet46PerMillionOutput
    cost += llm
    breakdown.push({ item: `LLM tokens for ${minutes} min of voice (Claude Sonnet 4.6)`, cost: +llm.toFixed(2) })
  }

  // Token budget for engineering tier
  if (inc.tokenBudget) {
    const llm = (inc.tokenBudget * 0.6 / 1_000_000) * vendors.anthropic.claudeSonnet46PerMillionInput
              + (inc.tokenBudget * 0.4 / 1_000_000) * vendors.anthropic.claudeSonnet46PerMillionOutput
    cost += llm
    breakdown.push({ item: `${(inc.tokenBudget/1_000_000).toFixed(1)}M token budget`, cost: +llm.toFixed(2) })
  }

  // Documents — flat cost per document for AI drafting
  if (inc.documentsGenerated) {
    const docs = inc.documentsGenerated * 0.50  // Claude tokens to draft a contract ~$0.50 each
    cost += docs
    breakdown.push({ item: `${inc.documentsGenerated} document drafts`, cost: +docs.toFixed(2) })
  }

  // Per-tenant infra share (Firebase + Vercel)
  cost += vendors.firebase.monthlyEstimatePerTenant
  breakdown.push({ item: 'Per-tenant infra share (Firebase)', cost: vendors.firebase.monthlyEstimatePerTenant })

  return { totalCost: +cost.toFixed(2), breakdown }
}

export async function GET(request) {
  const url = new URL(request.url)
  const withMargin = url.searchParams.get('withMargin') === '1'
  const wantAddons = url.searchParams.get('addons') === '1'

  const tiersFile = readData('pricing-tiers.json') || { tiers: [] }
  const ratesFile = readData('vendor-rates.json') || { vendors: {} }

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }

  if (wantAddons) {
    return NextResponse.json({ ok: true, addons: tiersFile.addons || {} }, { headers: corsHeaders })
  }
  if (!withMargin) {
    return NextResponse.json({ ok: true, tiers: tiersFile.tiers || [], addons: tiersFile.addons || {}, notes: tiersFile.notes }, { headers: corsHeaders })
  }

  const out = (tiersFile.tiers || []).map(t => {
    const projection = projectCarlCost(t, ratesFile.vendors)
    return {
      ...t,
      carlCostProjection: projection.totalCost,
      carlCostBreakdown: projection.breakdown,
      grossMargin: +(t.monthlyFee - projection.totalCost).toFixed(2),
      grossMarginPercent: +(((t.monthlyFee - projection.totalCost) / t.monthlyFee) * 100).toFixed(1),
    }
  })

  return NextResponse.json({ ok: true, tiers: out, notes: tiersFile.notes }, { headers: corsHeaders })
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  })
}
