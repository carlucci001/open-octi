import { NextResponse } from 'next/server'
import { requireCrmRead, requireCrmWrite } from '@/lib/permissions'
import { findById } from '@/lib/entityStore'
import { createIncidentTask, listIncidents, readIncidentStatusState, updateIncidentAction } from '@/lib/incidents'
import { pollIncidentSources } from '@/lib/incident-poller'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function json(body, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

export async function GET(request) {
  const { error } = await requireCrmRead(request)
  if (error) return error
  try {
    return json(await pollIncidentSources())
  } catch (pollError) {
    console.error('[incident-inbox] poll failed:', pollError?.message)
    const status = readIncidentStatusState()
    return json({ generatedAt: status.generatedAt, pollIntervalMs: 60_000, platforms: status.platforms || [], incidents: listIncidents(), warning: 'One or more platform sources could not be polled.' })
  }
}

export async function POST(request) {
  const { error } = await requireCrmWrite(request)
  if (error) return error
  let body
  try { body = await request.json() } catch { return json({ ok: false, error: 'Invalid JSON.' }, 400) }
  const incident = findById('incidents', String(body?.incidentId || ''))
  if (!incident) return json({ ok: false, error: 'Incident not found.' }, 404)
  try {
    if (body.action === 'create-task') return json({ ok: true, ...createIncidentTask(incident) })
    if (['acknowledge', 'resolve', 'mute', 'set-public'].includes(body.action)) {
      return json({ ok: true, incident: updateIncidentAction(incident.id, body.action, { publicValue: body.public }) })
    }
    return json({ ok: false, error: 'Unknown incident action.' }, 400)
  } catch (actionError) {
    return json({ ok: false, error: actionError?.message || 'Incident action failed.' }, 400)
  }
}
