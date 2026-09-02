import { readData, writeData } from '@/lib/dataStore'

const DISCIPLINES = {
  seo: { key: 'SEO', label: 'SEO', color: '#4f7f3c' },
  aeo: { key: 'AEO', label: 'AEO', color: '#d96909' },
  geo: { key: 'GEO', label: 'GEO', color: '#ba3927' },
}

export function isGetFound3Configured() {
  return Boolean(
    process.env.GETFOUND3_API_URL?.trim()
    && process.env.GETFOUND3_API_KEY?.trim(),
  )
}

export async function runGetFound3Report({
  url,
  types,
  tenantId,
  accountId,
  accountName = '',
  createdBy = '',
}) {
  const baseUrl = process.env.GETFOUND3_API_URL?.trim().replace(/\/+$/, '')
  const apiKey = process.env.GETFOUND3_API_KEY?.trim()
  if (!baseUrl || !apiKey) throw new Error('GetFound3 service is not configured')

  const response = await fetch(`${baseUrl}/api/v1/audits`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-Tenant-ID': tenantId,
    },
    body: JSON.stringify({
      url,
      siteName: accountName || undefined,
      maxPages: 5,
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(55_000),
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.data) {
    const message = payload?.error?.message || payload?.error || `GetFound3 returned ${response.status}`
    throw new Error(String(message).slice(0, 300))
  }

  const audit = validateAudit(payload.data)
  const selected = types.map(type => DISCIPLINES[type]).filter(Boolean)
  const now = new Date()
  const generatedAt = now.toISOString().slice(0, 10)
  const typeLabels = selected.map(type => type.label).join(' + ')
  const title = `${typeLabels} Report — ${audit.hostname} — ${generatedAt}`
  const publicUrl = audit.shareToken
    ? `${baseUrl}/report/${encodeURIComponent(audit.shareToken)}`
    : ''
  const body = renderDocument({ audit, selected, accountName, publicUrl })

  const store = readData('documents.json') || { documents: [] }
  const document = {
    id: `doc_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    title,
    templateId: '',
    templateName: 'GetFound3 Visibility Report',
    clientId: accountId,
    clientName: accountName,
    contactId: '',
    signerName: '',
    signerEmail: '',
    folder: 'Reports',
    body,
    values: {},
    requiresSignature: false,
    // A report the client bought through the portal is THEIR deliverable -
    // publish it to their Documents. Operator-run filings stay unpublished.
    portalVisible: String(createdBy || '').startsWith('portal:'),
    status: 'delivered',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    createdBy,
    linkedTo: { accountId },
    meta: {
      generator: 'getfound3-api',
      auditId: audit.id,
      url: audit.finalUrl || url,
      types,
      scores: Object.fromEntries(selected.map(type => [type.key.toLowerCase(), audit.scores[type.key].score])),
      pagesCrawled: audit.pages.length,
      narrativeModel: audit.narrative?.source === 'AI' ? audit.narrative.model : null,
      getFound3ReportUrl: publicUrl || null,
      engagementSummary: audit.narrative?.executiveSummary || '',
      actionPlan: audit.findings
        .filter(finding => selected.some(type => type.key === finding.discipline))
        .sort((first, second) => Number(second.priority || 0) - Number(first.priority || 0))
        .slice(0, 12)
        .map(finding => ({
          priority: String(finding.severity || 'medium').toLowerCase(),
          title: String(finding.title || ''),
          why: String(finding.evidence || finding.description || ''),
          impact: String(finding.recommendation || ''),
          effort: String(finding.effort || ''),
          discipline: String(finding.discipline || ''),
        })),
    },
  }
  store.documents = [document, ...(store.documents || [])]
  writeData('documents.json', store)

  return {
    documentId: document.id,
    title,
    summary: audit.narrative?.executiveSummary
      || `Measured ${audit.pages.length} pages of ${audit.hostname}.`,
    scores: document.meta.scores,
    usage: null,
    model: document.meta.narrativeModel,
    reportUrl: publicUrl || null,
    engine: 'getfound3',
  }
}

function validateAudit(value) {
  if (
    !value
    || typeof value !== 'object'
    || typeof value.id !== 'string'
    || typeof value.hostname !== 'string'
    || !value.scores
    || !Array.isArray(value.pages)
    || !Array.isArray(value.findings)
  ) {
    throw new Error('GetFound3 returned an invalid report')
  }
  for (const discipline of Object.values(DISCIPLINES)) {
    if (!Number.isFinite(value.scores?.[discipline.key]?.score)) {
      throw new Error(`GetFound3 report is missing ${discipline.label} measurements`)
    }
  }
  return value
}

function renderDocument({ audit, selected, accountName, publicUrl }) {
  const scores = selected.map(type => {
    const score = audit.scores[type.key]
    return `<article style="border:1px solid #e9dfd2;border-top:4px solid ${type.color};padding:16px;background:#fff;">
      <div style="font-size:12px;font-weight:800;color:${type.color};">${type.label}</div>
      <div style="font:700 34px Georgia,serif;color:#2b1b12;margin:5px 0;">${score.score}<small style="font:400 13px Arial;color:#74685e;"> / 100</small></div>
      <div style="height:8px;background:#eee5da;border-radius:8px;overflow:hidden;"><span style="display:block;width:${score.score}%;height:100%;background:${type.color};"></span></div>
      <p style="font-size:12px;color:#74685e;">${score.passedChecks || 0} of ${score.totalChecks || 0} measured checks passed</p>
    </article>`
  }).join('')
  const findings = audit.findings
    .filter(finding => selected.some(type => type.key === finding.discipline))
    .sort((first, second) => second.priority - first.priority)
    .slice(0, 14)
    .map((finding, index) => `<tr>
      <td style="padding:10px;border-bottom:1px solid #eee5da;font-weight:700;">${index + 1}. ${esc(finding.title)}</td>
      <td style="padding:10px;border-bottom:1px solid #eee5da;">${esc(finding.discipline)}</td>
      <td style="padding:10px;border-bottom:1px solid #eee5da;">${esc(finding.severity)}</td>
      <td style="padding:10px;border-bottom:1px solid #eee5da;">${esc(finding.recommendation)}</td>
    </tr>`).join('')
  const priorities = (audit.narrative?.priorities || [])
    .slice(0, 6)
    .map(priority => `<li style="margin:0 0 8px;">${esc(priority)}</li>`)
    .join('')

  return `<div style="max-width:920px;margin:0 auto;padding:34px;font-family:Arial,sans-serif;color:#2b1b12;background:#fffdf9;">
    <div style="font-size:12px;font-weight:800;color:#d55312;text-transform:uppercase;letter-spacing:.08em;">GetFound3 · SEO · AEO · GEO</div>
    <h1 style="font:700 30px Georgia,serif;margin:8px 0 4px;overflow-wrap:anywhere;">${esc(audit.hostname)}</h1>
    <p style="margin:0 0 24px;color:#74685e;">Prepared for ${esc(accountName || 'your organization')} · ${audit.pages.length} pages measured</p>
    <section style="display:grid;grid-template-columns:repeat(${Math.max(1, selected.length)},1fr);gap:12px;">${scores}</section>
    <section style="margin-top:26px;padding:18px;border:1px solid #e9dfd2;background:#fff;">
      <h2 style="font:700 21px Georgia,serif;margin:0 0 10px;">Executive interpretation</h2>
      <p style="line-height:1.65;color:#574a40;">${esc(audit.narrative?.executiveSummary || 'The report is based on measured website evidence. Work the highest-priority findings and rerun the audit to verify improvement.')}</p>
      ${priorities ? `<ol style="padding-left:20px;color:#574a40;">${priorities}</ol>` : ''}
    </section>
    <section style="margin-top:26px;">
      <h2 style="font:700 21px Georgia,serif;">Prioritized action plan</h2>
      <table style="width:100%;border-collapse:collapse;font-size:12px;background:#fff;"><thead><tr><th style="text-align:left;padding:10px;">Finding</th><th style="text-align:left;padding:10px;">Channel</th><th style="text-align:left;padding:10px;">Severity</th><th style="text-align:left;padding:10px;">Recommended action</th></tr></thead><tbody>${findings}</tbody></table>
    </section>
    ${publicUrl ? `<p style="margin-top:26px;"><a href="${esc(publicUrl)}" style="color:#c14916;font-weight:700;">Open the complete interactive GetFound3 report</a></p>` : ''}
    <p style="margin-top:32px;font-size:11px;color:#8a7c70;">Measurements supplied by GetFound3, a service of Farrington Development LLC. AI interpretation, when enabled, is constrained to the measured evidence.</p>
  </div>`
}

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}
