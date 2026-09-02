// All activities tagged to a specific lease's tenant. Plus aggregate usage + projected bill.

import { NextResponse } from 'next/server'
import { readData } from '@/lib/dataStore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function fmtDur(secs) {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

export async function GET(request, { params }) {
  const leaseId = params.id
  if (!leaseId) return NextResponse.json({ ok: false, error: 'lease id required' }, { status: 400 })

  const leasesFile = readData('leases.json') || { leases: [] }
  const lease = (leasesFile.leases || []).find(l => l.id === leaseId)
  if (!lease) return NextResponse.json({ ok: false, error: 'lease not found' }, { status: 404 })

  const tenantId = lease.tenantId
  const activitiesFile = readData('activities.json') || { activities: [] }
  const all = activitiesFile.activities || []
  const tagged = all.filter(a => a.tenantId === tenantId)

  // Aggregate usage from activities
  const usage = {
    totalActivities: tagged.length,
    timeTrackedSeconds: 0,
    emailsSent: 0,
    callsLogged: 0,
    notesTaken: 0,
    imagesGenerated: 0,
  }
  for (const a of tagged) {
    if (a.type === 'time_tracked') usage.timeTrackedSeconds += (a.meta?.durationSeconds || 0)
    if (a.type === 'email' || a.type === 'email_sent') usage.emailsSent++
    if (a.type === 'call_logged' || a.type === 'voice_call') usage.callsLogged++
    if (a.type === 'note') usage.notesTaken++
    if (a.type === 'image_generated') usage.imagesGenerated++
  }
  usage.timeTrackedHumanReadable = fmtDur(usage.timeTrackedSeconds)

  // Projected this-month bill: base lease + addons + projected overages
  // (For now we don't know real voice minutes from the activities, so this is a base view.)
  const projection = {
    baseFee: lease.monthlyFee || 0,
    overagesEstimate: 0,
    projectedTotal: lease.monthlyFee || 0,
    note: 'Base fee shown. Voice/email overages computed at end-of-month.',
  }

  return NextResponse.json({
    ok: true,
    lease: {
      id: lease.id,
      tenantName: lease.tenantName,
      agentName: lease.agentName,
      tierName: lease.tierName,
      monthlyFee: lease.monthlyFee,
      status: lease.status,
      startDate: lease.startDate,
      twilioPhoneNumber: lease.twilioPhoneNumber || null,
      addons: lease.addons || {},
    },
    usage,
    projection,
    activities: tagged.slice(-50).reverse(), // most recent 50
  })
}
