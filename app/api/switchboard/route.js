import { NextResponse } from 'next/server'
import { readData, writeData } from '@/lib/dataStore'
import { listAgents } from '@/lib/agents-store'
import { requireCapability } from '@/lib/permissions'
import { listAuditEvents, logAuditEvent } from '@/lib/auditLog'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TERMS_VERSION = 'switchboard-qa-v1'
const CONSENT_VALUES = new Set(['opted_in', 'opted_out', 'unknown'])

function cleanPhone(value) {
  if (!value) return ''
  const raw = String(value)
  if (raw.startsWith('client:')) return raw
  const digits = raw.replace(/\D/g, '')
  if (digits.length >= 4) return `***${digits.slice(-4)}`
  return raw
}

async function tw(path) {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const keySid = process.env.TWILIO_API_KEY_SID
  const keySecret = process.env.TWILIO_API_KEY_SECRET
  if (!sid || !keySid || !keySecret) return null
  const auth = Buffer.from(`${keySid}:${keySecret}`).toString('base64')
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}${path}`, {
    headers: { Authorization: `Basic ${auth}` },
    cache: 'no-store',
  })
  return res.json()
}

async function listActiveConferences() {
  const confList = await tw('/Conferences.json?Status=in-progress&PageSize=20')
  if (confList === null) return { configured: false, conferences: [] }
  const conferences = await Promise.all((confList.conferences || []).map(async (conf) => {
    const partList = await tw(`/Conferences/${conf.sid}/Participants.json?PageSize=20`)
    const participants = await Promise.all((partList?.participants || []).map(async (p) => {
      const call = await tw(`/Calls/${p.call_sid}.json`)
      return {
        callSid: p.call_sid,
        muted: !!p.muted,
        hold: !!p.hold,
        status: p.status,
        from: cleanPhone(call?.from),
        to: cleanPhone(call?.to),
        direction: call?.direction || '',
        isClient: String(call?.from || '').startsWith('client:') || String(call?.to || '').startsWith('client:'),
      }
    }))
    return {
      sid: conf.sid,
      friendlyName: conf.friendly_name,
      status: conf.status,
      dateCreated: conf.date_created,
      participants,
      monitorable: true,
      route: 'twilio_conference',
    }
  }))
  return { configured: true, conferences }
}

function leaseMonitoring(lease) {
  if (!lease) {
    return {
      scope: 'internal',
      consent: 'internal',
      allowed: true,
      reason: 'In-house Farrington agent',
      noticePolicy: 'conditional',
      termsVersion: TERMS_VERSION,
    }
  }

  const consent = lease.monitoringConsent || 'unknown'
  const allowed = consent === 'opted_in'
  return {
    scope: 'leased',
    consent,
    allowed,
    reason: allowed
      ? 'Leased customer opted in to QA monitoring'
      : consent === 'opted_out'
        ? 'Leased customer opted out of QA monitoring'
        : 'Leased customer has not accepted QA monitoring terms',
    noticePolicy: lease.monitoringNoticePolicy || 'conditional',
    acceptedBy: lease.monitoringAcceptedBy || '',
    acceptedAt: lease.monitoringAcceptedAt || null,
    termsVersion: lease.monitoringTermsVersion || TERMS_VERSION,
  }
}

function buildLeaseMap() {
  const leasesFile = readData('leases.json') || { leases: [] }
  const activeLeases = (leasesFile.leases || []).filter(l => l.status !== 'cancelled')
  return new Map(activeLeases.map(l => [l.agentId, l]))
}

async function switchboardSnapshot() {
  const [agentData, active] = await Promise.all([
    listAgents(),
    listActiveConferences(),
  ])
  const leaseByAgent = buildLeaseMap()
  const roster = readData('voice-agent-roster.json') || {}

  const agents = (agentData.agents || []).map(agent => {
    const lease = leaseByAgent.get(agent.id) || (agent.leaseId ? (readData('leases.json')?.leases || []).find(l => l.id === agent.leaseId) : null)
    const monitoring = leaseMonitoring(lease)
    const voiceBinding = roster[agent.id] || null
    return {
      id: agent.id,
      name: agent.name || agent.id,
      title: agent.title || agent.role || '',
      enabled: agent.enabled !== false,
      tenantId: agent.tenantId || 'farrington-development',
      tenantName: lease?.tenantName || (agent.tenantId === 'farrington-development' ? 'Farrington Development' : agent.tenantId || ''),
      leaseId: lease?.id || agent.leaseId || null,
      leased: !!lease,
      voiceProvider: agent.voice?.provider || (voiceBinding ? 'elevenlabs' : 'unknown'),
      voiceAgentId: voiceBinding?.agentId || null,
      monitoring,
      status: agent.enabled === false ? 'offline' : 'available',
    }
  })

  const recentEvents = listAuditEvents({ limit: 80 })
    .filter(e => e.area === 'switchboard' || String(e.action || '').startsWith('switchboard_'))
    .slice(0, 24)
    .map(e => ({
      id: e.id,
      at: e.at,
      severity: e.severity,
      action: e.action,
      targetId: e.targetId,
      targetName: e.targetName,
      user: e.user ? {
        username: e.user.username,
        displayName: e.user.displayName,
      } : null,
      meta: e.meta || {},
    }))

  return {
    ok: true,
    termsVersion: TERMS_VERSION,
    twilioConfigured: active.configured,
    activeCalls: active.conferences,
    agents,
    recentEvents,
    activity: {
      liveCalls: active.conferences.length,
      recentEvents: recentEvents.length,
      lastEventAt: recentEvents[0]?.at || null,
    },
    limits: {
      listen: 'Available for CRM/Twilio conference calls.',
      whisper: 'Planned for managed conference calls after coach routing is added.',
      takeover: 'Planned for managed conference calls after transfer routing is added.',
      elevenLabsNative: 'Native ElevenLabs outbound calls are visible after the fact; live monitoring requires routing through the CRM/Twilio switchboard path.',
    },
  }
}

export async function GET(request) {
  const { error } = await requireCapability(request, 'agents:manage')
  if (error) return error

  try {
    return NextResponse.json(await switchboardSnapshot())
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}

export async function POST(request) {
  const { user, error } = await requireCapability(request, 'agents:manage')
  if (error) return error

  let body
  try { body = await request.json() } catch { return NextResponse.json({ ok: false, error: 'Bad JSON' }, { status: 400 }) }

  try {
    if (body.action === 'update_monitoring_consent') {
      const leaseId = String(body.leaseId || '')
      const consent = String(body.consent || 'unknown')
      if (!leaseId) return NextResponse.json({ ok: false, error: 'leaseId required' }, { status: 400 })
      if (!CONSENT_VALUES.has(consent)) return NextResponse.json({ ok: false, error: 'invalid consent value' }, { status: 400 })

      const leasesFile = readData('leases.json') || { leases: [] }
      const lease = (leasesFile.leases || []).find(l => l.id === leaseId)
      if (!lease) return NextResponse.json({ ok: false, error: 'lease not found' }, { status: 404 })

      lease.monitoringConsent = consent
      lease.monitoringNoticePolicy = body.noticePolicy === 'always' ? 'always' : 'conditional'
      lease.monitoringTermsVersion = TERMS_VERSION
      lease.monitoringAcceptedBy = consent === 'opted_in' ? String(body.acceptedBy || user.displayName || user.username || 'admin').slice(0, 120) : ''
      lease.monitoringAcceptedAt = consent === 'opted_in' ? new Date().toISOString() : null
      lease.monitoringUpdatedAt = new Date().toISOString()
      lease.monitoringUpdatedBy = user.username || user.id || ''
      leasesFile.lastUpdated = lease.monitoringUpdatedAt
      writeData('leases.json', leasesFile)

      logAuditEvent({
        request,
        user,
        action: 'switchboard_monitoring_consent_updated',
        area: 'switchboard',
        severity: consent === 'opted_out' ? 'warn' : 'info',
        targetId: lease.agentId,
        targetName: lease.agentName || lease.tenantName,
        meta: { leaseId, consent, noticePolicy: lease.monitoringNoticePolicy, termsVersion: TERMS_VERSION },
      })

      return NextResponse.json({ ok: true, lease })
    }

    if (body.action === 'monitor_event') {
      const agentId = String(body.agentId || '')
      const leaseId = String(body.leaseId || '')
      const event = String(body.event || '')
      const allowedEvents = new Set(['attempt', 'blocked', 'started', 'stopped', 'failed'])
      if (!allowedEvents.has(event)) return NextResponse.json({ ok: false, error: 'invalid monitor event' }, { status: 400 })

      logAuditEvent({
        request,
        user,
        action: `switchboard_monitor_${event}`,
        area: 'switchboard',
        severity: event === 'blocked' || event === 'failed' ? 'warn' : 'info',
        targetId: agentId || leaseId,
        targetName: String(body.agentName || body.callName || '').slice(0, 120),
        meta: {
          leaseId,
          callRoute: body.callRoute || '',
          conference: body.conference || '',
          noticePolicy: body.noticePolicy || 'conditional',
        },
      })
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ ok: false, error: `Unknown action: ${body.action}` }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
