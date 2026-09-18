// Shared, browser-safe defaults. No scheduler/runtime imports here.
export const NEW_BUSINESS_LIST_ID = 'new_business_owners'
export const NEW_BUSINESS_AUTOMATION_ID = 'auto_fd_new_business_daily'
export const NEW_BUSINESS_DAILY = {
  id: NEW_BUSINESS_AUTOMATION_ID,
  name: 'New business owners — daily',
  label: 'New business owners — daily',
  scope: 'in-house',
  templateId: 'lead-sweep-v2',
  enabled: true,
  trigger: { type: 'schedule', config: { cadence: 'daily', hour: 8, timeZone: 'America/New_York' } },
  dataSource: {
    verticalId: 'new-businesses', location: 'US', limit: 25,
    campaign: 'fd-new-business-daily', leadListId: NEW_BUSINESS_LIST_ID,
    enrichContacts: true, provenOnly: true, signalSince: '-3d',
    requireEmail: true,
  },
}

export function formatNewBusinessDigest({ leads = [], skipped = 0, sources = [], errors = [], enrichment = {}, outreach = {} } = {}) {
  const sourceText = sources.map(source => source.name || source.id || source).join(', ') || 'none proven'
  const text = leads.length ? leads.map(lead => [
    lead.businessName || 'Unnamed business',
    lead.state || lead.signal?.state || 'Unknown state',
    String(lead.signal?.triggeredAt || '').slice(0, 10) || 'Unknown filing date',
    (lead.people || lead.signal?.people || []).find(person => !/registered agent/i.test(person.title || ''))?.name || (!(lead.people || lead.signal?.people || []).length && lead.name) || 'Owner unknown',
    lead.phone || 'No phone', lead.email || 'No email',
    `https://crm.company.example.com/?tab=leads&leadId=${encodeURIComponent(lead.id)}`,
  ].join(' — ')).join('\n') : `0 today, sources: ${sourceText}`
  const header = `${leads.length} created · ${leads.filter(lead => lead.email).length} with email · ${enrichment.placesPhonesAdded ?? enrichment.phonesAdded ?? 0} phones added via Places · ${leads.filter(lead => lead.phone).length} with phone · ${leads.filter(lead => lead.website).length} with website · ${skipped} skipped`
  const yesterday = `Outreach yesterday: ${outreach.sent || 0} sent (step 1: ${outreach.step1 || 0}, step 2: ${outreach.step2 || 0}), ${outreach.replies || 0} replies, ${outreach.unsubscribes || 0} unsubscribes, ${outreach.bounces || 0} bounces`
  return { subject: `${leads.length} new business owners today`, text: `${header}\n\n${text}\n\n${yesterday}` + (errors.length ? `\nSource errors: ${errors.map(error => `${error.sourceId}: ${error.error}`).join('; ')}` : '') }
}
