import { NextResponse } from 'next/server'
import bridge from '@/lib/twilio-agent-bridge'
import { verifyTwilioWebhook } from '@/lib/twilio-webhook-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function paramsFromUrl(url) {
  return Object.fromEntries(url.searchParams.entries())
}

async function paramsFromRequest(request) {
  const url = new URL(request.url)
  const params = paramsFromUrl(url)
  if (request.method !== 'POST') return params
  const contentType = request.headers.get('content-type') || ''
  if (!contentType.includes('application/x-www-form-urlencoded')) return params
  const body = await request.text()
  const form = new URLSearchParams(body)
  for (const [key, value] of form.entries()) {
    if (params[key] === undefined) params[key] = value
  }
  return params
}

async function handle(request) {
  const authError = await verifyTwilioWebhook(request)
  if (authError) return authError
  const params = await paramsFromRequest(request)
  const twiml = bridge.buildTwilioAgentTwiML({
    requestUrl: request.url,
    agentId: params.agentId || params.agent || params.Agent || 'matilda',
    provider: params.provider || params.voiceProvider || 'openai',
    model: params.model,
    voiceName: params.voiceName || params.voice,
    leaseId: params.leaseId || params.lease,
    clientId: params.clientId || params.client,
    prompt: params.prompt,
    greeting: params.greeting,
    streamUrl: params.streamUrl || params.StreamUrl,
  })
  return new NextResponse(twiml, { headers: { 'Content-Type': 'text/xml; charset=utf-8' } })
}

export const GET = handle
export const POST = handle
