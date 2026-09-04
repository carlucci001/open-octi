// Shared lead-insert helper used by every inbound channel adapter
// (firestore listener, webhook endpoint, etc.).
//
// Responsibilities:
// - dedupe by externalId (Firestore doc id, webhook idempotency key) or by email
// - create the lead via entityStore so SponsorCRM's bridge picks it up
// - tag the lead with the channel id + 'inbound' so we can filter later
// - set legacy.campaign so the SponsorCRM project tabs (now dynamically
//   merged with channel ids) can render the lead in the right bucket
// - optionally create a linked opportunity in a target pipeline + stage
import { loadAll, create, logActivity, update } from '@/lib/entityStore'
import { createAppointmentEvent } from '@/lib/calendarEvents'

function fmtNotes({ payload, externalId, channelLabel, sourceMeta }) {
  const lines = []
  if (payload.preferredTime) {
    try {
      lines.push(`Requested time: ${new Date(payload.preferredTime).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}`)
    } catch { lines.push(`Requested time: ${payload.preferredTime}`) }
  }
  if (payload.company) lines.push(`Company: ${payload.company}`)
  if (payload.message) lines.push(`Message:\n${payload.message}`)
  if (sourceMeta?.role) lines.push(`Role: ${sourceMeta.role}`)
  if (sourceMeta?.budget) lines.push(`Budget: ${sourceMeta.budget}`)
  if (sourceMeta?.timeline) lines.push(`Timeline: ${sourceMeta.timeline}`)
  if (sourceMeta?.sector) lines.push(`Sector: ${sourceMeta.sector}`)
  if (sourceMeta?.topic) lines.push(`Topic: ${sourceMeta.topic}`)
  if (channelLabel) lines.push(`Channel: ${channelLabel}`)
  if (externalId) lines.push(`External ref: ${externalId}`)
  return lines.join('\n')
}

function alreadyImported({ externalId, email }) {
  // Only dedupe by externalId (Firestore doc id / webhook idempotency key).
  // Email-based dedupe used to block any subsequent submission from the same person —
  // a real bug: if Carl submits the demo form Monday and the intake form Friday with
  // the same email, the second one silently disappeared while Firestore status flipped
  // to "imported". Different submission = different lead. Carl can merge manually if needed.
  try {
    const leads = loadAll('leads') || []
    if (externalId && leads.some(l =>
      l.externalId === externalId ||
      l.bookingId === externalId ||
      l.submissionId === externalId
    )) return true
    return false
  } catch { return false }
}

function getStageForPipeline(pipelineId, preferredStageId) {
  try {
    const pipelines = loadAll('pipelines') || []
    const p = pipelines.find(x => x.id === pipelineId)
    if (!p) return null
    if (preferredStageId && p.stages?.some(s => s.id === preferredStageId)) return preferredStageId
    const firstNonTerminal = p.stages?.find(s => !s.terminal)
    return firstNonTerminal?.id || p.stages?.[0]?.id || null
  } catch { return null }
}

function brandContextForChannel(channel) {
  if (channel.id.startsWith('VideoHub')) return 'VideoHub'
  if (channel.id === 'ContentStudio_demos') return 'ContentStudio'
  if (channel.id === 'sample_business') return 'sample_business'
  if (/^fd[_-]|farrington/i.test(channel.id) || channel.targetPipelineId === 'farrington_dev') return 'farrington_dev'
  return 'farrington_dev'
}

function serviceLineForChannel(channel, payload, sourceMeta) {
  return sourceMeta?.serviceLine ||
    sourceMeta?.productOpportunity ||
    payload.serviceLine ||
    payload.productOpportunity ||
    (brandContextForChannel(channel) === 'farrington_dev' ? 'Farrington Development Services' : '')
}

export async function insertLeadFromChannel({ channel, payload, externalId, sourceMeta }) {
  if (alreadyImported({ externalId, email: payload.email })) {
    return { skipped: true, reason: 'duplicate' }
  }
  const tags = Array.from(new Set(['inbound', channel.id, ...(payload.tags || [])]))
  const brandContext = brandContextForChannel(channel)
  const serviceLine = serviceLineForChannel(channel, payload, sourceMeta)
  const lead = create('leads', {
    name: payload.name || '',
    email: payload.email || '',
    phone: payload.phone || '',
    businessName: payload.company || '',
    website: payload.website || payload.url || payload.site || '',
    title: payload.title || '',
    source: channel.id,
    brandContext,
    serviceLine,
    status: 'new',
    notes: fmtNotes({ payload, externalId, channelLabel: channel.label, sourceMeta }),
    tags,
    externalId: externalId || null,
    bookingId: externalId || null,           // backwards-compat with old listener
    preferredTime: payload.preferredTime || null,
    legacy: { campaign: channel.targetCampaign || channel.id, lt: '' },
    inboundReceivedAt: new Date().toISOString(),
  })

  logActivity({
    type: 'note',
    subject: `Inbound lead: ${lead.name || lead.email || externalId || channel.label}`,
    body: lead.notes,
    linkedTo: { leadId: lead.id },
  })

  let opportunity = null
  if (channel.autoCreateOpportunity && channel.targetPipelineId) {
    const stageId = getStageForPipeline(channel.targetPipelineId, channel.targetStageId)
    if (stageId) {
      try {
        opportunity = create('opportunities', {
          name: `${lead.businessName || lead.name || channel.label}`,
          pipelineId: channel.targetPipelineId,
          stageId,
          value: 0,
          probability: 0,
          leadId: lead.id,
          notes: `Auto-created from ${channel.label}`,
          source: channel.id,
          tags: [channel.id, 'inbound'],
        })
      } catch (e) {
        opportunity = { error: e.message }
      }
    }
  }

  // Calendar event — every booking with a time field gets one.
  // No silent drops: if the time is unparseable, we log an activity so Carl sees it
  // and can schedule manually. The calendar is routed by source via calendar-config.json
  // (ContentStudio_demos → ContentStudio calendar, fd-concierge/fd_inquiries → Farrington Dev calendar).
  let calendarEvent = null
  const whenField = payload.preferredTime || payload.when || payload.scheduledFor
  if (whenField) {
    try {
      const result = await createAppointmentEvent({
        source: channel.id,
        when: whenField,
        kind: channel.id === 'ContentStudio_demos' ? 'demo' : (channel.id === 'fd-concierge' ? 'callback' : 'meeting'),
        person: { name: lead.name, email: lead.email, phone: lead.phone },
        leadId: lead.id,
        opportunityId: opportunity?.id,
        accountId: lead.accountId,
        brief: payload.message || payload.description || sourceMeta?.brief || '',
      })
      if (result.created) {
        calendarEvent = result.event
        // Stamp the eventId on the lead so the UI can deep-link / cancel later
        try {
          update('leads', lead.id, {
            calendarEventId: result.event?.id,
            calendarKey: result.calendarKey,
            calendarHtmlLink: result.event?.htmlLink,
          })
        } catch {}
        logActivity({
          type: 'calendar',
          subject: `Calendar: ${result.event?.summary || 'event created'}`,
          body: `Booked on ${result.calendarName}\nTime: ${result.event?.start || 'unknown'}\nLink: ${result.event?.htmlLink || 'n/a'}`,
          linkedTo: { leadId: lead.id, opportunityId: opportunity?.id },
        })
      } else if (result.needsManualScheduling) {
        // Time was loose ("Tuesday afternoon"). Log loud so Carl sees it and books it himself.
        logActivity({
          type: 'note',
          subject: `⚠ Schedule this: ${lead.name || lead.email}`,
          body: `Visitor requested "${result.originalWhen}" — time is too loose to auto-book. Reach out and confirm a specific slot.\nLead: ${lead.id}`,
          linkedTo: { leadId: lead.id, opportunityId: opportunity?.id },
        })
        calendarEvent = { needsManualScheduling: true, originalWhen: result.originalWhen }
      } else {
        // Calendar API errored — log so the failure isn't silent
        logActivity({
          type: 'note',
          subject: `⚠ Calendar event failed for ${lead.name || lead.email}`,
          body: `Reason: ${result.reason}\nLead: ${lead.id}`,
          linkedTo: { leadId: lead.id, opportunityId: opportunity?.id },
        })
        calendarEvent = { error: result.reason }
      }
    } catch (e) {
      console.warn('[inbound] calendar event creation threw:', e.message)
      calendarEvent = { error: e.message }
    }
  }

  return { lead, opportunity, calendarEvent }
}
