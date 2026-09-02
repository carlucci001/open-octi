import { Resend } from 'resend'
import { getCred } from './agent-creds'
import { create, loadAll } from './entityStore'

const APIFY_GOOGLE_SEARCH_ACTOR = 'apify~google-search-scraper'
const APIFY_SYNC_URL = `https://api.apify.com/v2/acts/${APIFY_GOOGLE_SEARCH_ACTOR}/run-sync-get-dataset-items?timeout=90&memory=1024`
const DEFAULT_QUERY = 'Massachusetts property manager contact plumbing maintenance OR emergency plumbing commercial building'

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function uniqueApifyResults(items = [], limit = 10) {
  const rows = items
    .flatMap(item => Array.isArray(item.organicResults) ? item.organicResults : Array.isArray(item.results) ? item.results : [item])
    .filter(item => item && (item.url || item.link))

  const seen = new Set()
  const out = []
  for (const item of rows) {
    const url = String(item.url || item.link || '').trim()
    if (!url || seen.has(url.toLowerCase())) continue
    seen.add(url.toLowerCase())
    out.push(item)
    if (out.length >= limit) break
  }
  return out
}

function leadFromApifyResult(item, { now, campaign }) {
  const link = item.url || item.link || ''
  return {
    name: '',
    email: '',
    phone: '',
    title: '',
    businessName: item.title || 'Plumber lead source',
    website: link,
    sourceUrl: link,
    source: 'apify_google_search',
    status: 'new',
    suggestedPipelineId: campaign,
    serviceLine: 'plumbing-lead-engine',
    productOpportunity: 'Daily local lead sweep for plumber',
    tags: ['apify', 'plumber-leads', 'proof-run'],
    notes: `Plumber lead sweep buying signal: ${item.description || item.snippet || ''}`.trim(),
    legacy: {
      source: 'apify-google-search',
      campaign,
      originalStatus: 'prospect',
      lt: 'local-business',
      mk: 'Massachusetts',
      cat: 'plumbing',
      bt: 'commercial/property-manager',
      ts: now,
      originalNotes: [{ text: `Apify source URL: ${link}`, at: now }],
    },
  }
}

function buildEmailHtml({ automation, created, query }) {
  const rows = created.map((lead, index) => `
    <tr>
      <td style="padding:10px;border-bottom:1px solid #e5e7eb;">${index + 1}</td>
      <td style="padding:10px;border-bottom:1px solid #e5e7eb;"><strong>${escapeHtml(lead.businessName)}</strong><br /><span style="color:#6b7280;">${escapeHtml(lead.notes || '')}</span></td>
      <td style="padding:10px;border-bottom:1px solid #e5e7eb;"><a href="${escapeHtml(lead.website)}">${escapeHtml(lead.website)}</a></td>
    </tr>
  `).join('')

  return `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827;max-width:840px;margin:0 auto;padding:24px;">
      <h1 style="font-size:22px;margin:0 0 8px;">${escapeHtml(automation.name || 'Plumber lead sweep')}</h1>
      <p style="margin:0 0 16px;color:#4b5563;">Apify ran a live local lead sweep and Command Center imported ${created.length} CRM lead${created.length === 1 ? '' : 's'}.</p>
      <p style="margin:0 0 16px;"><strong>Query:</strong> ${escapeHtml(query)}</p>
      <p style="margin:0 0 16px;"><strong>Campaign:</strong> plumber-leads &nbsp; <strong>Tags:</strong> apify, plumber-leads, proof-run</p>
      <table style="border-collapse:collapse;width:100%;font-size:14px;">
        <thead><tr style="background:#f3f4f6;"><th align="left" style="padding:10px;">#</th><th align="left" style="padding:10px;">Lead</th><th align="left" style="padding:10px;">Source</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="3" style="padding:10px;">No new leads were created because the sources were already in CRM.</td></tr>'}</tbody>
      </table>
      <p style="margin-top:16px;color:#4b5563;">Open Command Center and search <strong>plumber-leads</strong> in the Working Lead Database to review them.</p>
    </div>
  `
}

function buildEmailText({ created, query }) {
  const lines = created.map((lead, index) => `${index + 1}. ${lead.businessName}\n   ${lead.website}\n   ${lead.notes || ''}`)
  return [
    `Apify plumber lead sweep completed.`,
    `Query: ${query}`,
    `Campaign: plumber-leads`,
    `Tags: apify, plumber-leads, proof-run`,
    '',
    ...lines,
  ].join('\n')
}

export async function runPlumberLeadSweep(automation, { recipientEmail } = {}) {
  const apifyKey = getCred('apify')?.key
  if (!apifyKey) throw new Error('Apify credential is missing from Command Center vault')
  if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is not configured')

  const to = String(recipientEmail || automation.delivery?.recipients?.[0] || '').trim()
  if (!to || !to.includes('@')) throw new Error('No email recipient is configured for this automation')

  const limit = Number(automation.dataSource?.limit) || 10
  const query = automation.dataSource?.query || DEFAULT_QUERY
  const campaign = 'plumber-leads'
  const now = new Date().toISOString()

  const response = await fetch(APIFY_SYNC_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apifyKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      queries: query,
      maxPagesPerQuery: 1,
      resultsPerPage: limit,
      countryCode: 'us',
      languageCode: 'en',
      mobileResults: false,
      saveHtml: false,
      saveHtmlToKeyValueStore: false,
    }),
    signal: AbortSignal.timeout(120000),
  })
  const items = await response.json().catch(() => null)
  if (!response.ok || !Array.isArray(items)) {
    throw new Error(`Apify sweep failed with HTTP ${response.status}`)
  }

  const results = uniqueApifyResults(items, limit)
  const existingUrls = new Set(loadAll('leads').map(lead => String(lead.website || lead.sourceUrl || '').toLowerCase()).filter(Boolean))
  const created = []
  for (const item of results) {
    const url = String(item.url || item.link || '').trim()
    if (!url || existingUrls.has(url.toLowerCase())) continue
    const lead = create('leads', leadFromApifyResult(item, { now, campaign }))
    created.push(lead)
    existingUrls.add(url.toLowerCase())
  }

  const resend = new Resend(process.env.RESEND_API_KEY)
  const subject = `Plumber lead sweep: ${created.length} new lead${created.length === 1 ? '' : 's'}`
  const { data, error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL || 'Farrington Development <redacted@example.invalid>',
    to,
    subject,
    html: buildEmailHtml({ automation, created, query }),
    text: buildEmailText({ created, query }),
  })
  if (error) throw new Error(error.message || 'Resend email failed')

  return {
    returned: results.length,
    created: created.length,
    emailedTo: to,
    emailId: data?.id || null,
    leads: created.map(lead => ({ id: lead.id, businessName: lead.businessName, website: lead.website })),
  }
}
