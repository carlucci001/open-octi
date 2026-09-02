const DEFAULT_PLATFORM_URL = 'https://www.newsroomaios.com'
const DEFAULT_TIMEOUT_MS = 20_000
const MAX_RESPONSE_BYTES = 2_000_000
const DEFAULT_ALLOWED_HOSTS = new Set([
  'www.newsroomaios.com',
  'newsroomaios.com',
  'wnctimes.com',
  'www.wnctimes.com',
  'oceansideca.news',
  'www.oceansideca.news',
])

const PAPER_DEFINITIONS = {
  wnc: {
    id: 'wnc',
    name: 'WNC Times',
    aliases: ['wnc', 'wnc times', 'wnct', 'wnct times', 'wnct-times'],
    tenantIdEnv: 'NEWSROOM_AIOS_WNC_TENANT_ID',
    apiKeyEnv: 'NEWSROOM_AIOS_WNC_API_KEY',
    siteUrlEnv: 'NEWSROOM_AIOS_WNC_SITE_URL',
    defaultSiteUrl: 'https://wnctimes.com',
  },
  oceanside: {
    id: 'oceanside',
    name: 'Oceanside News',
    aliases: ['oceanside', 'oceanside news', 'oceansidenews'],
    tenantIdEnv: 'NEWSROOM_AIOS_OCEANSIDE_TENANT_ID',
    apiKeyEnv: 'NEWSROOM_AIOS_OCEANSIDE_API_KEY',
    siteUrlEnv: 'NEWSROOM_AIOS_OCEANSIDE_SITE_URL',
    defaultSiteUrl: 'https://oceansideca.news',
  },
}

function cleanBaseUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '')
}

function approvedCredentialUrl(value, label) {
  const configuredHosts = String(process.env.NEWSROOM_AIOS_ALLOWED_HOSTS || '')
    .split(',')
    .map(host => host.trim().toLowerCase())
    .filter(Boolean)
  const allowedHosts = new Set([...DEFAULT_ALLOWED_HOSTS, ...configuredHosts])
  let parsed
  try {
    parsed = new URL(cleanBaseUrl(value))
  } catch {
    throw new Error(`${label} is not a valid URL.`)
  }
  const isLocalDevelopment = process.env.NODE_ENV !== 'production'
    && ['localhost', '127.0.0.1'].includes(parsed.hostname.toLowerCase())
  if ((!isLocalDevelopment && parsed.protocol !== 'https:')
    || (!allowedHosts.has(parsed.hostname.toLowerCase()) && !isLocalDevelopment)) {
    throw new Error(`${label} is not an approved credential host.`)
  }
  return cleanBaseUrl(parsed.toString())
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase()
}

function normalizeCategory(value) {
  return normalizeText(value).replace(/[^a-z0-9]+/g, '-')
}

function publicPaperConfig(definition) {
  return {
    id: definition.id,
    name: definition.name,
    tenantId: process.env[definition.tenantIdEnv] || '',
    siteUrl: cleanBaseUrl(process.env[definition.siteUrlEnv] || definition.defaultSiteUrl),
    configured: Boolean(process.env[definition.tenantIdEnv] && process.env[definition.apiKeyEnv]),
  }
}

export function listNewsroomPapers() {
  return Object.values(PAPER_DEFINITIONS).map(publicPaperConfig)
}

export function resolveNewsroomPaper(value) {
  const requested = normalizeText(value || 'wnc')
  const definition = Object.values(PAPER_DEFINITIONS).find(candidate => (
    candidate.id === requested || candidate.aliases.includes(requested)
  ))
  if (!definition) {
    throw new Error(`Unknown newspaper: ${value}. Use "wnc" or "oceanside".`)
  }
  const tenantId = process.env[definition.tenantIdEnv]
  const apiKey = process.env[definition.apiKeyEnv]
  if (!tenantId || !apiKey) {
    throw new Error(`${definition.name} Newsroom credentials are not configured.`)
  }
  return {
    ...publicPaperConfig(definition),
    apiKey,
  }
}

function platformUrl() {
  return approvedCredentialUrl(
    process.env.NEWSROOM_AIOS_BASE_URL || DEFAULT_PLATFORM_URL,
    'Newsroom AIOS base URL',
  )
}

async function readJsonResponse(response, label) {
  const declaredLength = Number(response.headers.get('content-length') || 0)
  if (declaredLength > MAX_RESPONSE_BYTES) {
    throw new Error(`${label} returned too much data.`)
  }
  const text = await response.text()
  if (text.length > MAX_RESPONSE_BYTES) {
    throw new Error(`${label} returned too much data.`)
  }
  let data = {}
  if (text) {
    try { data = JSON.parse(text) } catch { data = { message: text.slice(0, 500) } }
  }
  if (!response.ok) {
    const message = data?.error || data?.message || `${response.status} ${response.statusText}`
    throw new Error(`${label} failed: ${String(message).slice(0, 300)}`)
  }
  return data
}

async function requestJson(url, options = {}, label = 'Newsroom request') {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || DEFAULT_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {}),
      },
    })
    return await readJsonResponse(response, label)
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error(`${label} timed out.`)
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

export async function callNewsroomPlatform(paperValue, endpoint, options = {}) {
  const paper = resolveNewsroomPaper(paperValue)
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
  return requestJson(`${platformUrl()}${path}`, {
    ...options,
    headers: {
      'X-Tenant-ID': paper.tenantId,
      'X-API-Key': paper.apiKey,
      ...(options.headers || {}),
    },
  }, `${paper.name} ${path}`)
}

export async function callNewspaperSite(paperValue, endpoint, options = {}) {
  const paper = resolveNewsroomPaper(paperValue)
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
  const siteUrl = approvedCredentialUrl(paper.siteUrl, `${paper.name} site URL`)
  return requestJson(`${siteUrl}${path}`, {
    ...options,
    headers: {
      'X-Tenant-ID': paper.tenantId,
      'X-API-Key': paper.apiKey,
      ...(options.headers || {}),
    },
  }, `${paper.name} site ${path}`)
}

function asArray(value, keys = []) {
  if (Array.isArray(value)) return value
  for (const key of keys) {
    if (Array.isArray(value?.[key])) return value[key]
  }
  return []
}

function reporterIdentity(reporter) {
  return String(reporter?.id || reporter?.uid || reporter?.userId || reporter?.email || reporter?.displayName || reporter?.name || '').trim()
}

function reporterName(reporter) {
  return String(reporter?.displayName || reporter?.name || reporter?.email || reporterIdentity(reporter) || 'Unknown reporter').trim()
}

function articleIdentity(article) {
  return String(article?.id || article?.slug || article?.articleId || '').trim()
}

function currentAuthorIdentity(article) {
  return String(article?.authorId || article?.journalistId || article?.author || '').trim()
}

function looksUnassigned(article) {
  const author = normalizeText(article?.author)
  return !article?.authorId || !author || author === 'unknown' || author.includes('staff') || author.includes('import')
}

function normalizeReporterCategoryMap(value = {}) {
  const output = new Map()
  if (!value || typeof value !== 'object' || Array.isArray(value)) return output
  for (const [reporter, categories] of Object.entries(value)) {
    const normalized = (Array.isArray(categories) ? categories : String(categories || '').split(','))
      .map(normalizeCategory)
      .filter(Boolean)
    output.set(normalizeText(reporter), new Set(normalized))
  }
  return output
}

export function planReporterAssignments({
  articles = [],
  reporters = [],
  reporterCategories = {},
  onlyUnassigned = true,
  maxChanges = 50,
} = {}) {
  const safeArticles = asArray(articles, ['articles'])
  const safeReporters = asArray(reporters, ['users', 'reporters', 'authors'])
    .filter(reporter => reporterIdentity(reporter))
  const limit = Math.max(1, Math.min(Number(maxChanges) || 50, 200))
  if (!safeReporters.length) {
    return { proposals: [], summary: { articlesReviewed: safeArticles.length, reporters: 0, proposedChanges: 0 }, warnings: ['No reporters were available.'] }
  }

  const categoryMap = normalizeReporterCategoryMap(reporterCategories)
  const workloads = new Map(safeReporters.map(reporter => [reporterIdentity(reporter), 0]))
  const history = new Map(safeReporters.map(reporter => [reporterIdentity(reporter), new Map()]))

  for (const article of safeArticles) {
    const authorId = currentAuthorIdentity(article)
    const reporter = safeReporters.find(candidate => (
      reporterIdentity(candidate) === authorId || normalizeText(reporterName(candidate)) === normalizeText(article?.author)
    ))
    if (!reporter) continue
    const id = reporterIdentity(reporter)
    workloads.set(id, (workloads.get(id) || 0) + 1)
    const category = normalizeCategory(article?.categoryId || article?.category)
    if (category) history.get(id).set(category, (history.get(id).get(category) || 0) + 1)
  }

  const proposals = []
  const candidates = safeArticles.filter(article => !onlyUnassigned || looksUnassigned(article))
  for (const article of candidates) {
    if (proposals.length >= limit) break
    const category = normalizeCategory(article?.categoryId || article?.category)
    const eligible = safeReporters.filter(reporter => {
      if (!category) return true
      const id = reporterIdentity(reporter)
      const explicit = categoryMap.get(normalizeText(id)) || categoryMap.get(normalizeText(reporterName(reporter)))
      if (explicit?.size) return explicit.has(category)
      return (history.get(id)?.get(category) || 0) > 0
    })
    const pool = eligible.length ? eligible : safeReporters
    pool.sort((a, b) => {
      const aId = reporterIdentity(a)
      const bId = reporterIdentity(b)
      const loadDifference = (workloads.get(aId) || 0) - (workloads.get(bId) || 0)
      if (loadDifference) return loadDifference
      const affinityDifference = (history.get(bId)?.get(category) || 0) - (history.get(aId)?.get(category) || 0)
      if (affinityDifference) return affinityDifference
      return reporterName(a).localeCompare(reporterName(b))
    })
    const selected = pool[0]
    const selectedId = reporterIdentity(selected)
    workloads.set(selectedId, (workloads.get(selectedId) || 0) + 1)
    proposals.push({
      articleId: articleIdentity(article),
      title: String(article?.title || article?.headline || 'Untitled article').slice(0, 200),
      category: article?.category || article?.categoryId || 'Uncategorized',
      currentAuthor: article?.author || article?.authorId || null,
      proposedReporterId: selectedId,
      proposedReporter: reporterName(selected),
      reason: eligible.length
        ? `Matches ${article?.category || article?.categoryId || 'the article category'} and balances the current workload.`
        : 'No category specialist was identified, so the least-loaded available reporter was selected.',
    })
  }

  return {
    proposals,
    summary: {
      articlesReviewed: safeArticles.length,
      candidateArticles: candidates.length,
      reporters: safeReporters.length,
      proposedChanges: proposals.length,
      onlyUnassigned: Boolean(onlyUnassigned),
    },
    projectedWorkloads: safeReporters.map(reporter => ({
      reporterId: reporterIdentity(reporter),
      reporter: reporterName(reporter),
      articles: workloads.get(reporterIdentity(reporter)) || 0,
    })).sort((a, b) => b.articles - a.articles),
    warnings: categoryMap.size ? [] : ['Category specialties were inferred from existing bylines. Supply reporterCategories for an authoritative category map.'],
  }
}

export async function getReporterAssignmentPlan(args = {}) {
  const paper = resolveNewsroomPaper(args.paper)
  let articleData
  let authorData
  try {
    const directorData = await callNewspaperSite(paper.id, '/api/admin/director/assignments')
    articleData = directorData
    authorData = directorData
  } catch {
    [articleData, authorData] = await Promise.all([
      callNewspaperSite(paper.id, '/api/articles?limit=100'),
      callNewspaperSite(paper.id, '/api/admin/assign-author'),
    ])
  }
  const reporters = asArray(authorData, ['users', 'reporters', 'authors'])
  const authoritativeCategories = args.reporterCategories || Object.fromEntries(
    reporters.filter(reporter => Array.isArray(reporter?.categories) && reporter.categories.length)
      .map(reporter => [reporterIdentity(reporter), reporter.categories])
  )
  return {
    paper: { id: paper.id, name: paper.name, siteUrl: paper.siteUrl },
    ...planReporterAssignments({
      articles: asArray(articleData, ['articles']),
      reporters,
      reporterCategories: authoritativeCategories,
      onlyUnassigned: args.onlyUnassigned !== false,
      maxChanges: args.maxChanges,
    }),
  }
}

export async function getNewsroomOverview(args = {}) {
  const paper = resolveNewsroomPaper(args.paper)
  const operations = {
    articles: () => callNewspaperSite(paper.id, '/api/articles?limit=100'),
    authors: () => callNewspaperSite(paper.id, '/api/admin/assign-author'),
    credits: () => callNewsroomPlatform(paper.id, '/api/credits/balance'),
    support: () => callNewsroomPlatform(paper.id, '/api/support/status'),
    releases: () => callNewsroomPlatform(paper.id, '/api/tenants/releases'),
  }
  const entries = await Promise.all(Object.entries(operations).map(async ([name, run]) => {
    try { return [name, { ok: true, data: await run() }] } catch (error) { return [name, { ok: false, error: error.message }] }
  }))
  const result = Object.fromEntries(entries)
  const articles = asArray(result.articles?.data, ['articles'])
  const authors = asArray(result.authors?.data, ['users', 'reporters', 'authors'])
  return {
    paper: { id: paper.id, name: paper.name, tenantId: paper.tenantId, siteUrl: paper.siteUrl },
    articleSample: { limit: 100, count: articles.length, complete: articles.length < 100 },
    counts: {
      sampledArticles: articles.length,
      reporters: authors.length,
      sampledUnassignedArticles: articles.filter(looksUnassigned).length,
      sampledDraftArticles: articles.filter(article => normalizeText(article?.status) === 'draft').length,
      sampledReviewArticles: articles.filter(article => ['review', 'pending_review'].includes(normalizeText(article?.status))).length,
    },
    services: result,
  }
}

export const NEWSROOM_DIRECTOR_TOOLS = {
  newsroom_list_papers: {
    description: 'List newspapers configured for the Newsroom Director. Returns public names, tenant IDs, site URLs, and configuration status; never returns credentials. Args: {}.',
    run: () => ({ papers: listNewsroomPapers() }),
  },
  newsroom_capabilities: {
    description: 'Explain the Newsroom Director specialist capabilities, approval boundaries, and current limitations. Args: {}.',
    run: () => ({
      specialists: ['assignment desk', 'reporter drafting', 'copy and fact check', 'images and metadata', 'newsletter planning', 'breaking-news monitoring', 'advertising operations', 'paper operations'],
      automatic: ['read paper status', 'inspect articles and reporters', 'search news', 'search images', 'prepare assignment plans', 'draft editorial material'],
      approvalRequired: ['support ticket creation', 'publishing', 'reassigning articles', 'sending newsletters', 'sending push alerts', 'billing changes', 'deployments', 'rollouts', 'credential changes'],
      currentLimitations: ['Precise assignment changes require the new audited newspaper endpoint to be deployed to each paper before the apply tool can succeed.'],
      orchestration: 'OpenClaw is the primary runtime. Existing Newsroom schedules and Command Center automations handle recurring work; Airflow is not required for the first version.',
    }),
  },
  newsroom_get_overview: {
    description: 'Get a read-only operating overview for WNC Times or Oceanside News: article/reporter counts, unassigned work, credits, support status, and releases. Args: { paper: "wnc"|"oceanside" }.',
    run: getNewsroomOverview,
  },
  newsroom_plan_reporter_assignments: {
    description: 'Create a read-only, balanced per-article reporter assignment plan using article categories, current bylines, workloads, and optional authoritative category mappings. Never changes the newspaper. Args: { paper, onlyUnassigned?, maxChanges?, reporterCategories?: { reporterIdOrName: [categories] } }.',
    run: getReporterAssignmentPlan,
  },
  newsroom_preview_reporter_assignments: {
    description: 'Validate a proposed per-article reporter assignment batch against the selected newspaper without changing anything. Args: { paper, assignments: [{ articleId, reporterId }] }.',
    run: args => callNewspaperSite(args.paper, '/api/admin/director/assignments', {
      method: 'POST',
      body: JSON.stringify({ assignments: args.assignments, dryRun: true }),
    }),
  },
  newsroom_apply_reporter_assignments: {
    description: 'Apply a previously reviewed per-article reporter assignment batch and write a newspaper audit record. Requires Carl\'s explicit approval. Args: { paper, assignments: [{ articleId, reporterId }], explicitApproval: true }.',
    run: args => callNewspaperSite(args.paper, '/api/admin/director/assignments', {
      method: 'POST',
      body: JSON.stringify({ assignments: args.assignments, dryRun: false, confirm: true }),
    }),
  },
  newsroom_search_news: {
    description: 'Search current news through the selected paper\'s Newsroom AIOS tenant. Args: { paper, query, limit?, sources? }.',
    run: args => callNewsroomPlatform(args.paper, '/api/ai/search-news', {
      method: 'POST',
      body: JSON.stringify({ query: args.query, limit: args.limit, sources: args.sources }),
    }),
  },
  newsroom_search_images: {
    description: 'Search candidate editorial images through the selected Newsroom tenant. This does not attach or publish an image. Args: { paper, query, limit? }.',
    run: args => callNewsroomPlatform(args.paper, '/api/ai/search-images', {
      method: 'POST',
      body: JSON.stringify({ query: args.query, limit: args.limit }),
    }),
  },
  newsroom_generate_draft: {
    description: 'Generate an article draft for a selected newspaper and category. Produces draft material only and does not publish. Args: { paper, categoryId, sourceContent?, useWebSearch?, journalistName?, generateImage? }.',
    run: args => callNewsroomPlatform(args.paper, '/api/ai/generate-article', {
      method: 'POST',
      body: JSON.stringify({
        categoryId: args.categoryId,
        sourceContent: args.sourceContent,
        useWebSearch: args.useWebSearch,
        journalistName: args.journalistName,
        generateImage: args.generateImage,
      }),
    }),
  },
  newsroom_edit_draft: {
    description: 'Edit or improve draft article content through Newsroom AIOS. Does not publish. Args: { paper, content, instructions, title? }.',
    run: args => callNewsroomPlatform(args.paper, '/api/ai/edit-article', {
      method: 'POST',
      body: JSON.stringify({ content: args.content, instructions: args.instructions, title: args.title }),
    }),
  },
  newsroom_get_releases: {
    description: 'Read platform release notes and roadmap items for a newspaper tenant. Args: { paper }.',
    run: args => callNewsroomPlatform(args.paper, '/api/tenants/releases'),
  },
  newsroom_get_support: {
    description: 'Read Newsroom AIOS support status and the selected paper\'s support tickets. Args: { paper }.',
    run: async args => {
      const [status, tickets] = await Promise.all([
        callNewsroomPlatform(args.paper, '/api/support/status'),
        callNewsroomPlatform(args.paper, '/api/support/tickets'),
      ])
      return { status, tickets }
    },
  },
  newsroom_create_support_ticket: {
    description: 'Create a real Newsroom AIOS support ticket for a selected paper after checking for open duplicates. Requires Carl\'s explicit approval. Args: { paper, subject, message, priority?, allowDuplicate?, explicitApproval? }.',
    run: async args => {
      const existing = await callNewsroomPlatform(args.paper, '/api/support/tickets')
      const tickets = asArray(existing, ['tickets', 'items'])
      const subject = normalizeText(args.subject)
      const duplicate = tickets.find(ticket => {
        const status = normalizeText(ticket?.status)
        const existingSubject = normalizeText(ticket?.subject || ticket?.title)
        return !['closed', 'resolved', 'cancelled'].includes(status)
          && subject && existingSubject
          && (existingSubject === subject || existingSubject.includes(subject) || subject.includes(existingSubject))
      })
      if (duplicate && args.allowDuplicate !== true) {
        return {
          created: false,
          duplicate: {
            id: duplicate.id || duplicate.ticketId || null,
            number: duplicate.ticketNumber || duplicate.number || null,
            subject: duplicate.subject || duplicate.title || null,
            status: duplicate.status || null,
          },
          guidance: 'An open ticket with a matching subject already exists. Follow up on it or explicitly allow a duplicate.',
        }
      }
      return callNewsroomPlatform(args.paper, '/api/support/tickets', {
        method: 'POST',
        body: JSON.stringify({ subject: args.subject, message: args.message, priority: args.priority }),
      })
    },
  },
}
