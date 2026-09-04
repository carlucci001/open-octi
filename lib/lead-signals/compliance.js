import { findById } from '@/lib/entityStore'
import { getLeadSource } from './registry'

export class LeadSignalComplianceError extends Error {
  constructor(message, details = {}) {
    super(message)
    this.name = 'LeadSignalComplianceError'
    this.code = 'lead-signal-channel-blocked'
    this.status = 422
    this.details = details
  }
}

function allowedChannels(lead) {
  if (!lead?.signal?.sourceId) return null
  if (Array.isArray(lead.signal.channels)) return lead.signal.channels
  return getLeadSource(lead.signal.sourceId)?.compliance?.channels || []
}

export function assertLeadSignalChannelAllowed({ lead, leadId, channel }) {
  const record = lead || (leadId ? findById('leads', leadId) : null)
  if (!record?.signal?.sourceId) return { allowed: true, signalLead: false }
  const channels = allowedChannels(record)
  const normalized = String(channel || '').toLowerCase()
  const permitted = normalized === 'email'
    ? channels.some(value => value === 'email-b2b' || value === 'email-b2c')
    : channels.includes(normalized)
  if (!permitted) {
    throw new LeadSignalComplianceError(`Outbound ${normalized} is blocked for this public-record lead because source ${record.signal.sourceId} does not allow that channel.`, { sourceId: record.signal.sourceId, channel: normalized, channels })
  }
  if (normalized === 'ai-voice' && !record.consent?.recordedAt) {
    throw new LeadSignalComplianceError('Outbound AI voice is blocked for this public-record lead until prior express consent is recorded.', { sourceId: record.signal.sourceId, channel: normalized, reason: 'consent-required' })
  }
  return { allowed: true, signalLead: true, sourceId: record.signal.sourceId, channel: normalized }
}
