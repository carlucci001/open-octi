import twilio from 'twilio'
import { NextResponse } from 'next/server'

function candidateUrls(request) {
  const direct = new URL(request.url)
  const publicBase = String(process.env.PUBLIC_APP_URL || '').trim()
  if (publicBase) {
    try {
      return [new URL(`${direct.pathname}${direct.search}`, publicBase.endsWith('/') ? publicBase : `${publicBase}/`).toString()]
    } catch {
      return []
    }
  }
  return [direct.toString()]
}

async function formParams(request) {
  if (request.method !== 'POST') return {}
  const contentType = request.headers.get('content-type') || ''
  if (!contentType.includes('application/x-www-form-urlencoded')) return {}
  return Object.fromEntries(new URLSearchParams(await request.clone().text()))
}

export async function verifyTwilioWebhook(request) {
  const authToken = String(process.env.TWILIO_AUTH_TOKEN || '').trim()
  if (!authToken) return NextResponse.json({ error: 'Twilio webhook authentication is not configured' }, { status: 503 })

  const signature = String(request.headers.get('x-twilio-signature') || '').trim()
  if (!signature) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = await formParams(request)
  const valid = candidateUrls(request).some(url => twilio.validateRequest(authToken, signature, url, params))
  return valid ? null : NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
}
