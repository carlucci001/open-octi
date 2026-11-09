import { NextResponse } from 'next/server'
import { GoogleGenAI } from '@google/genai'
import { getCred } from '@/lib/agent-creds'
import { resolvePublicWidgetAgent } from '@/lib/public-agent-widget'
import { consumePublicEndpointQuota, PUBLIC_WIDGET_RATE_LIMITS } from '@/lib/public-endpoint-rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const PUBLIC_WIDGET_VOICE_BINDINGS = {
  'farrington-doreen': {
    voice: 'Aoede',
    name: 'Doreen',
    firstName: 'Doreen',
  },
  'wnctimes-doreen': {
    voice: 'Sulafat',
    name: 'Jessica',
    firstName: 'Jessica',
  },
  'ContentStudio-web': {
    voice: 'Charon',
    name: 'Bruce',
    firstName: 'Bruce',
  },
}

const GEMINI_LIVE_MODEL = 'gemini-3.8-live'

function json(body, init = {}) {
  return NextResponse.json(body, {
    ...init,
    headers: { ...CORS_HEADERS, ...(init.headers || {}) },
  })
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function GET(request) {
  const quota = consumePublicEndpointQuota(request, PUBLIC_WIDGET_RATE_LIMITS.voiceToken)
  if (quota.limited) {
    return json({ ok: false, error: 'Too many requests. Try again shortly.' }, {
      status: 429,
      headers: { 'Retry-After': String(quota.retryAfterSeconds) },
    })
  }

  const url = new URL(request.url)
  const agentId = String(url.searchParams.get('agent') || '').trim()
  const profile = await resolvePublicWidgetAgent(agentId, { baseUrl: url.origin })

  if (!profile.voiceEnabled) {
    return json({ ok: false, error: 'Voice is not enabled for this public widget.' }, { status: 403 })
  }

  const binding = PUBLIC_WIDGET_VOICE_BINDINGS[profile.id]
  if (!binding?.voice) return json({ ok: false, error: 'This public agent does not have a live voice profile.' }, { status: 404 })

  const cred = getCred('gemini') || getCred('google gemini') || getCred('google')
  const freeCred = getCred('gemini free') || getCred('google gemini free')
  const paidKey = String(cred?.key || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim()
  const freeKey = String(freeCred?.key || '').trim()
  const primaryKey = freeKey || paidKey
  if (!primaryKey) return json({ ok: false, error: 'Gemini Live is not configured.' }, { status: 503 })

  const speechConfig = { voiceConfig: { prebuiltVoiceConfig: { voiceName: binding.voice } } }
  const systemInstruction = {
    parts: [{
      text: `${profile.systemPrompt || `You are ${profile.name}, a public-facing assistant.`}\n\nVoice-session rules: Speak naturally and concisely. Stay in the named persona. You may explain services and guide the visitor to the visible contact controls, but do not claim that you submitted, booked, emailed, saved, or changed anything.`,
    }],
  }
  const setup = {
    model: `models/${GEMINI_LIVE_MODEL}`,
    generationConfig: { responseModalities: ['AUDIO'], speechConfig },
    systemInstruction,
    inputAudioTranscription: {},
    outputAudioTranscription: {},
    contextWindowCompression: { slidingWindow: {} },
  }
  const openingPrompt = [
    'The visitor just started Live Voice.',
    `Begin now with this greeting: "${profile.greeting}"`,
    'Do not wait for the visitor to speak first.',
    'Say the greeting once, then pause and listen.',
  ].join(' ')

  try {
    const now = Date.now()
    const tokenRequest = {
      config: {
        uses: 1,
        expireTime: new Date(now + 30 * 60 * 1000).toISOString(),
        newSessionExpireTime: new Date(now + 60 * 1000).toISOString(),
        liveConnectConstraints: {
          model: GEMINI_LIVE_MODEL,
          config: {
            responseModalities: ['AUDIO'],
            speechConfig,
            systemInstruction,
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            contextWindowCompression: setup.contextWindowCompression,
          },
        },
        httpOptions: { apiVersion: 'v1alpha' },
      },
    }
    const issueToken = apiKey => new GoogleGenAI({ apiKey, httpOptions: { apiVersion: 'v1alpha' } }).authTokens.create(tokenRequest)
    let billingRoute = freeKey ? 'free-primary' : 'configured-primary'
    let token
    try {
      token = await issueToken(primaryKey)
    } catch (error) {
      const quotaLimited = Number(error?.status || error?.code) === 429
        || /resource[_ -]?exhausted|quota|rate.?limit/i.test(String(error?.message || ''))
      const canUsePaidFallback = quotaLimited && freeKey && paidKey && freeKey !== paidKey
      if (!canUsePaidFallback) throw error
      token = await issueToken(paidKey)
      billingRoute = 'paid-quota-fallback'
    }
    if (!token?.name) return json({ ok: false, error: 'Gemini Live did not issue a session token.' }, { status: 502 })
    return json({
      ok: true,
      provider: 'gemini',
      token: token.name,
      model: GEMINI_LIVE_MODEL,
      voice: binding.voice,
      billingRoute,
      setup,
      agentName: profile.name,
      openingPrompt,
    })
  } catch {
    return json({ ok: false, error: 'Voice service unavailable.' }, { status: 502 })
  }
}
