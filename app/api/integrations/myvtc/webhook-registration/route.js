import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { getCred, upsertCredential } from '@/lib/agent-creds'
import { logAuditEvent } from '@/lib/auditLog'
import {
  deleteWebhook,
  listWebhooks,
  myvtcCredential,
  registerWebhook,
} from '@/lib/myvtc/client'
import { listMyvtcEvents } from '@/lib/myvtc/webhook'
import { getMyvtcSyncState } from '@/lib/myvtc/sync'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CREDENTIAL_NAME = 'MyVTC Webhook'
const EVENTS = ['contact.received']
const PRODUCTION_ORIGIN = 'https://openocti.local'

function exactField(credential, label) {
  return String(credential?.fields?.find(field => String(field?.label || '').trim().toLowerCase() === label.toLowerCase())?.value || '').trim()
}

function vaultRegistration() {
  const credential = getCred(CREDENTIAL_NAME)
  const secret = exactField(credential, 'Signing Secret')
  const endpointId = exactField(credential, 'Endpoint ID')
  const url = exactField(credential, 'Endpoint URL')
  const registeredAt = exactField(credential, 'Registered At')
  return {
    registered: Boolean(secret && endpointId && url),
    endpointId: endpointId || null,
    url: url || null,
    events: endpointId ? EVENTS : [],
    registeredAt: registeredAt || null,
  }
}

function registrationUrl() {
  let origin = PRODUCTION_ORIGIN
  try {
    const candidate = new URL(process.env.NEXT_PUBLIC_APP_URL || PRODUCTION_ORIGIN)
    if (candidate.protocol === 'https:' && !/^(localhost|127\.0\.0\.1|\[?::1\]?)$/i.test(candidate.hostname)) {
      origin = candidate.origin
    }
  } catch {}
  return `${origin}/api/integrations/myvtc/webhook`
}

function safeRemoteEndpoint(endpoint) {
  return {
    id: String(endpoint?.id || ''),
    url: String(endpoint?.url || ''),
    events: Array.isArray(endpoint?.events) ? endpoint.events.map(String) : [],
    status: String(endpoint?.status || ''),
    createdAt: endpoint?.createdAt || null,
  }
}

function clearWebhookCredential() {
  return upsertCredential({
    name: CREDENTIAL_NAME,
    category: 'Platforms',
    fields: [],
    notes: 'MyVTC webhook registration is not active.',
  })
}

function upstreamError(error) {
  const status = error?.status === 503 ? 503 : 502
  const code = /^[A-Z0-9_:-]{1,80}$/.test(String(error?.code || '')) ? error.code : 'UPSTREAM_ERROR'
  return NextResponse.json({ error: code }, { status })
}

export async function GET(request) {
  const { error } = await requireAdmin(request)
  if (error) return error

  const registration = vaultRegistration()
  const keyConfigured = Boolean(myvtcCredential()?.key)
  let remote = { checked: false, endpoint: null }
  if (keyConfigured) {
    try {
      const endpoints = await listWebhooks()
      const endpoint = endpoints.find(item => String(item?.id || '') === registration.endpointId)
        || endpoints.find(item => String(item?.url || '') === registration.url)
        || null
      remote = { checked: true, endpoint: endpoint ? safeRemoteEndpoint(endpoint) : null }
    } catch {
      remote = { checked: false, endpoint: null, error: 'UPSTREAM_UNAVAILABLE' }
    }
  }

  return NextResponse.json({
    ...registration,
    keyConfigured,
    remote,
    recentEvents: listMyvtcEvents({ limit: 10 }),
    sync: getMyvtcSyncState(),
  })
}

export async function POST(request) {
  const { error, user } = await requireAdmin(request)
  if (error) return error
  const body = await request.json().catch(() => ({}))
  const existing = vaultRegistration()

  if (existing.registered && !body.replace) {
    return NextResponse.json({ error: 'ALREADY_REGISTERED' }, { status: 409 })
  }
  if (existing.registered && String(body.reason || '').trim().length < 3) {
    return NextResponse.json({ error: 'REASON_REQUIRED' }, { status: 400 })
  }

  try {
    if (existing.registered && body.replace) {
      try {
        await deleteWebhook(existing.endpointId)
      } catch (deleteError) {
        if (deleteError?.status !== 404) throw deleteError
      }
      clearWebhookCredential()
    }

    const endpoint = await registerWebhook({ url: registrationUrl(), events: EVENTS })
    if (!endpoint?.id || !endpoint?.url || !endpoint?.secret) throw new Error('invalid response')
    upsertCredential({
      name: CREDENTIAL_NAME,
      category: 'Platforms',
      fields: [
        { label: 'Signing Secret', value: endpoint.secret },
        { label: 'Endpoint ID', value: endpoint.id },
        { label: 'Endpoint URL', value: endpoint.url },
        { label: 'Registered At', value: endpoint.createdAt || new Date().toISOString() },
      ],
      notes: 'Signing secret returned once by MyVTC and stored directly by Command Center.',
    })
    const urlHost = new URL(endpoint.url).hostname
    logAuditEvent({
      request,
      user,
      action: 'myvtc_webhook_registered',
      area: 'integrations',
      targetId: endpoint.id,
      targetName: urlHost,
      meta: { endpointId: endpoint.id, urlHost, replaced: Boolean(existing.registered && body.replace) },
    })
    return NextResponse.json({
      ok: true,
      registered: true,
      endpointId: endpoint.id,
      url: endpoint.url,
      events: Array.isArray(endpoint.events) ? endpoint.events : EVENTS,
      registeredAt: endpoint.createdAt || null,
    }, { status: 201 })
  } catch (registrationError) {
    return upstreamError(registrationError)
  }
}

export async function DELETE(request) {
  const { error, user } = await requireAdmin(request)
  if (error) return error
  const body = await request.json().catch(() => ({}))
  if (String(body.reason || '').trim().length < 3) {
    return NextResponse.json({ error: 'REASON_REQUIRED' }, { status: 400 })
  }

  const existing = vaultRegistration()
  if (!existing.endpointId) return NextResponse.json({ error: 'NOT_REGISTERED' }, { status: 404 })
  try {
    try {
      await deleteWebhook(existing.endpointId)
    } catch (deleteError) {
      if (deleteError?.status !== 404) throw deleteError
    }
    clearWebhookCredential()
    const urlHost = existing.url ? new URL(existing.url).hostname : ''
    logAuditEvent({
      request,
      user,
      action: 'myvtc_webhook_revoked',
      area: 'integrations',
      severity: 'warning',
      targetId: existing.endpointId,
      targetName: urlHost,
      meta: { endpointId: existing.endpointId, urlHost, reason: String(body.reason).trim() },
    })
    return NextResponse.json({ ok: true, registered: false })
  } catch (deleteError) {
    return upstreamError(deleteError)
  }
}
