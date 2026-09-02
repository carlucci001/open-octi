import { getCred } from '@/lib/agent-creds'

function fieldVal(fields, labelRx) {
  const f = (fields || []).find(x => labelRx.test(x.label || ''))
  return f?.value?.trim() || ''
}

function providerKey(credName, envName) {
  return getCred(credName)?.key || process.env[envName] || ''
}

function providerFields(credName) {
  return getCred(credName)?.fields || []
}

function stripJsonFence(text) {
  return String(text || '')
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim()
}

function parseJson(text) {
  try { return JSON.parse(stripJsonFence(text)) } catch {}
  const match = String(text || '').match(/\{[\s\S]*\}/)
  if (!match) return null
  try { return JSON.parse(match[0]) } catch { return null }
}

function asArray(value) {
  if (!value) return []
  if (Array.isArray(value)) return value.filter(Boolean)
  return [value].filter(Boolean)
}

function compactRecord(record) {
  if (!record) return null
  return Object.fromEntries(Object.entries(record).filter(([, v]) => v !== undefined && v !== null && v !== ''))
}

export function availableLeadResearchProviders() {
  const apifyFields = providerFields('apify')
  const apifyToken = providerKey('apify', 'APIFY_TOKEN')
  const apifyActorId = fieldVal(apifyFields, /actor|task/i) || process.env.APIFY_ACTOR_ID || process.env.APIFY_TASK_ID || ''
  return {
    apify: Boolean(apifyToken && apifyActorId),
    apifyToken: Boolean(apifyToken),
    apifyActorId: Boolean(apifyActorId),
    perplexity: Boolean(providerKey('perplexity', 'PERPLEXITY_API_KEY')),
    gemini: Boolean(providerKey('gemini', 'GEMINI_API_KEY') || providerKey('google gemini', 'GOOGLE_API_KEY')),
  }
}

function fallbackRequirements({ opportunity, account, contact, lead, instructions }) {
  const company = account?.name || lead?.businessName || opportunity?.accountName || opportunity?.name || ''
  const raw = instructions || opportunity?.notes || lead?.notes || ''
  const leadGeneration = opportunity?.leadGeneration || {}
  return {
    summary: raw || `Research and qualify ${company || 'this opportunity'}.`,
    leadProfile: {
      company,
      contactName: contact?.name || lead?.name || '',
      email: contact?.email || lead?.email || '',
      phone: contact?.phone || lead?.phone || '',
      pipelineId: opportunity?.pipelineId || '',
      stageId: opportunity?.stageId || '',
    },
    leadGenerationPlan: {
      enabled: Boolean(leadGeneration.enabled),
      dailyLeadTarget: Number(leadGeneration.dailyLeadTarget) || 0,
      geography: leadGeneration.geography || '',
      industries: leadGeneration.industries || '',
      sourceTypes: leadGeneration.sourceTypes || '',
      providerPreference: leadGeneration.providerPreference || 'auto',
      scheduleMode: leadGeneration.scheduleMode || 'manual',
      scheduleTime: leadGeneration.scheduleTime || '09:00',
      scheduleDays: leadGeneration.scheduleDays || 'weekdays',
    },
    dataNeeded: [
      { key: 'company_overview', label: 'Company overview', required: true, sourceHint: 'web' },
      { key: 'decision_maker', label: 'Likely decision maker', required: false, sourceHint: 'web' },
      { key: 'pain_points', label: 'Likely business needs and pain points', required: true, sourceHint: 'analysis' },
      { key: 'next_step', label: 'Recommended next step', required: true, sourceHint: 'analysis' },
    ],
    searchQueries: [company, raw].filter(Boolean).slice(0, 3),
    targetUrls: [],
    qualificationQuestions: [],
    outreachAngles: [],
    recommendedProvider: 'perplexity',
    notes: raw,
  }
}

async function callGeminiForRequirements(context) {
  const key = providerKey('gemini', 'GEMINI_API_KEY') || providerKey('google gemini', 'GOOGLE_API_KEY')
  if (!key) return null
  const prompt = `Convert this opportunity research request into strict JSON.
Return only JSON. No markdown.

JSON schema:
{
  "summary": "one concise sentence",
  "leadProfile": {
    "company": "",
    "contactName": "",
    "email": "",
    "phone": "",
    "pipelineId": "",
    "stageId": ""
  },
  "leadGenerationPlan": {
    "enabled": true,
    "dailyLeadTarget": 0,
    "geography": "",
    "industries": "",
    "sourceTypes": "",
    "providerPreference": "auto|apify|perplexity|google|manual",
    "scheduleMode": "manual|daily|weekly|paused",
    "scheduleTime": "09:00",
    "scheduleDays": "weekdays|everyday|monday"
  },
  "dataNeeded": [
    { "key": "snake_case", "label": "human label", "required": true, "sourceHint": "web|crm|analysis|manual" }
  ],
  "searchQueries": ["queries to research this prospect"],
  "targetUrls": ["seed URLs if present"],
  "qualificationQuestions": ["questions Carl should ask"],
  "outreachAngles": ["specific positioning angles"],
  "recommendedProvider": "apify|perplexity|google|manual",
  "notes": "brief handling notes"
}

Prefer Perplexity for broad current web research. Prefer Apify only when the request needs structured scraping, directory/list extraction, Google Maps/places enrichment, or target URL crawling.

Context:
${JSON.stringify(context, null, 2)}`

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 1200, responseMimeType: 'application/json' },
    }),
    signal: AbortSignal.timeout(20000),
  })
  if (!res.ok) throw new Error(`Gemini ${res.status}`)
  const data = await res.json()
  return parseJson(data.candidates?.[0]?.content?.parts?.[0]?.text)
}

async function callPerplexityResearch(requirements, context) {
  const key = providerKey('perplexity', 'PERPLEXITY_API_KEY')
  if (!key) return null
  const prompt = `Research this sales opportunity and return concise JSON only.

JSON schema:
{
  "provider": "perplexity",
  "executiveSummary": "",
  "findings": [
    { "label": "", "value": "", "confidence": "low|medium|high", "source": "" }
  ],
  "risks": [],
  "recommendedNextSteps": [],
  "suggestedMessage": ""
}

Opportunity context:
${JSON.stringify(context, null, 2)}

Structured requirements:
${JSON.stringify(requirements, null, 2)}`

  const res = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'sonar',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1000,
      temperature: 0.2,
    }),
    signal: AbortSignal.timeout(30000),
  })
  if (!res.ok) throw new Error(`Perplexity ${res.status}`)
  const data = await res.json()
  const content = data.choices?.[0]?.message?.content || ''
  return parseJson(content) || { provider: 'perplexity', executiveSummary: content, findings: [], risks: [], recommendedNextSteps: [], suggestedMessage: '' }
}

async function callApifyResearch(requirements) {
  const fields = providerFields('apify')
  const token = providerKey('apify', 'APIFY_TOKEN')
  const configuredId = fieldVal(fields, /actor|task/i) || process.env.APIFY_ACTOR_ID || process.env.APIFY_TASK_ID || ''
  if (!token || !configuredId) return null

  const defaultInputJson = fieldVal(fields, /input|payload/i)
  let actorInput = null
  if (defaultInputJson) {
    try { actorInput = JSON.parse(defaultInputJson) } catch {}
  }
  actorInput = actorInput || requirements.apifyInput || {
    searchQueries: asArray(requirements.searchQueries).slice(0, 5),
    startUrls: asArray(requirements.targetUrls).slice(0, 10).map(url => ({ url })),
    maxItems: 10,
    maxResults: 10,
  }

  const actorId = encodeURIComponent(configuredId.replace('/', '~'))
  const res = await fetch(`https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}&timeout=60`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(actorInput),
    signal: AbortSignal.timeout(70000),
  })
  if (!res.ok) throw new Error(`Apify ${res.status}`)
  const items = await res.json()
  return {
    provider: 'apify',
    actorId: configuredId,
    itemCount: Array.isArray(items) ? items.length : 0,
    items: Array.isArray(items) ? items.slice(0, 10) : items,
  }
}

export async function generateOpportunityRequirements({ opportunity, account, contact, lead, instructions = '', runResearch = true }) {
  const context = {
    opportunity: compactRecord(opportunity),
    account: compactRecord(account),
    contact: compactRecord(contact),
    lead: compactRecord(lead),
    instructions,
  }

  const providers = availableLeadResearchProviders()
  let requirements = null
  let parserProvider = 'fallback'
  try {
    requirements = await callGeminiForRequirements(context)
    if (requirements) parserProvider = 'gemini'
  } catch (e) {
    requirements = null
  }
  requirements = requirements || fallbackRequirements({ opportunity, account, contact, lead, instructions })

  let research = null
  let researchError = ''
  if (runResearch) {
    const wantsApify = requirements.recommendedProvider === 'apify'
    if (wantsApify && providers.apify) {
      try { research = await callApifyResearch(requirements) } catch (e) { researchError = e.message || String(e) }
    }
    if (!research && providers.perplexity) {
      try { research = await callPerplexityResearch(requirements, context) } catch (e) { researchError = researchError || e.message || String(e) }
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    parserProvider,
    providers: {
      apify: providers.apify,
      apifyConfigured: providers.apifyToken || providers.apifyActorId,
      perplexity: providers.perplexity,
      gemini: providers.gemini,
    },
    sourceText: instructions,
    requirements,
    research,
    researchError,
  }
}
