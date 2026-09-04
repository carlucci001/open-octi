import { apiKeyFor, fetchJson } from './common.js'
import { scoreCampaignSignal } from '../campaign-scoring.js'

const BASE = 'https://api.open.fec.gov/v1'
const cache = new Map()
let requestQueue = Promise.resolve()
let lastRequestAt = 0
const ALLOWED = [
  /^\/v1\/candidates\/search\/$/,
  /^\/v1\/candidates\/totals\/$/,
  /^\/v1\/committees\/$/,
  /^\/v1\/committee\/[A-Z0-9]+\/$/i,
  /^\/v1\/candidate\/[A-Z0-9]+\/committees\/$/i,
  /^\/v1\/candidate\/[A-Z0-9]+\/totals\/$/i,
]

export function assertFecEndpointAllowed(value) {
  const url = value instanceof URL ? value : new URL(String(value), BASE)
  const path = decodeURIComponent(url.pathname)
  if (/schedule[_/-]?[ab]|\/schedules\//i.test(path) || !ALLOWED.some(pattern => pattern.test(path))) {
    const error = new Error(`FEC endpoint is not allowed for campaign lead signals: ${path}`)
    error.code = 'fec-endpoint-blocked'
    throw error
  }
  return url
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

async function throttledFetch(url) {
  const underVitest = Boolean(process.env.VITEST || process.env.VITEST_POOL_ID)
  const minimumInterval = underVitest ? 0 : Math.max(350, Number(process.env.FEC_MIN_INTERVAL_MS) || 375)
  const task = requestQueue.then(async () => {
    const wait = Math.max(0, lastRequestAt + minimumInterval - Date.now())
    if (wait) await delay(wait)
    lastRequestAt = Date.now()
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await fetchJson(url)
      } catch (error) {
        const retryableNetwork = ['TimeoutError', 'AbortError', 'ECONNRESET', 'ETIMEDOUT'].includes(error.code)
        if (attempt === 2 || (error.status !== 429 && !retryableNetwork)) throw error
        const retrySeconds = underVitest ? 0 : error.status === 429
          ? Math.min(15, Math.max(1, Number(error.retryAfter) || 2))
          : 1
        await delay(retrySeconds * 1000)
        lastRequestAt = Date.now()
      }
    }
  })
  requestQueue = task.catch(() => {})
  return task
}

async function request(path, params, apiKey) {
  const url = assertFecEndpointAllowed(new URL(`${BASE}${path}`))
  for (const [key, value] of Object.entries({ ...params, api_key: apiKey })) {
    if (value !== '' && value !== null && value !== undefined) url.searchParams.set(key, String(value))
  }
  const safeKey = url.toString().replace(apiKey, '[key]')
  if (cache.has(safeKey)) return cache.get(safeKey)
  const pending = throttledFetch(url.toString()).catch(error => { cache.delete(safeKey); throw error })
  cache.set(safeKey, pending)
  return pending
}

const first = value => Array.isArray(value) ? value[0] : value
const clean = value => String(value || '').trim() || null
const readableName = value => {
  const text = clean(value)
  if (!text || text !== text.toUpperCase()) return text
  return text.toLowerCase().replace(/(^|[\s'-])\p{L}/gu, match => match.toUpperCase())
}
const candidateName = value => {
  const text = clean(value) || 'Candidate'
  if (!text.includes(',')) return readableName(text)
  const [last, ...rest] = text.split(',')
  return readableName(`${rest.join(' ').trim()} ${last.trim()}`.replace(/\s+/g, ' ').trim())
}

function committeeIdFor(candidate) {
  const committees = candidate.principal_committees || candidate.principal_campaign_committees || []
  const current = committees.find(item => item.cycles?.includes?.(2026)) || committees[0]
  return clean(current?.committee_id || first(candidate.committee_ids))
}

function normalizeCampaign({ candidate, committee, totals, manifest }) {
  const committeeId = clean(committee?.committee_id) || committeeIdFor(candidate) || clean(totals?.committee_id)
  const cashOnHand = Number(totals?.cash_on_hand_end_period ?? totals?.cash_on_hand ?? 0) || 0
  const receipts = Number(totals?.receipts ?? totals?.total_receipts ?? 0) || 0
  const disbursements = Number(totals?.disbursements ?? totals?.total_disbursements ?? 0) || 0
  const office = clean(candidate?.office || totals?.office) || ''
  const electionDate = '2026-11-03'
  const email = clean(committee?.email)
  const phone = clean(committee?.treasurer_phone)
  const candidatePerson = candidateName(candidate?.name || totals?.candidate_name)
  const treasurer = clean(committee?.treasurer_name)
  return {
    sourceId: manifest.id,
    externalId: committeeId || clean(candidate?.candidate_id) || clean(totals?.candidate_id),
    triggeredAt: clean(totals?.last_report_date || committee?.last_f2_date || candidate?.load_date),
    trigger: 'campaign',
    entity: {
      name: clean(committee?.name) || `${candidatePerson} campaign`,
      address: {
        line1: clean(committee?.street_1), city: clean(committee?.city),
        state: clean(committee?.state || candidate?.state || totals?.state),
        zip: clean(committee?.zip)?.slice(0, 5) || null, county: null,
      },
      email, phone, website: clean(committee?.website),
    },
    people: [treasurer ? { name: treasurer, title: 'Treasurer' } : null, candidatePerson ? { name: candidatePerson, title: 'Candidate' } : null].filter(Boolean),
    attrs: {
      candidateId: clean(candidate?.candidate_id || totals?.candidate_id), committeeId, office,
      state: clean(committee?.state || candidate?.state || totals?.state),
      district: clean(candidate?.district || totals?.district), party: clean(candidate?.party || totals?.party), cycle: 2026,
      cashOnHand, receipts, disbursements, lastReport: clean(totals?.last_report_date), electionDate,
      score: scoreCampaignSignal({ cashOnHand, office, electionDate, email, phone }),
    },
    provenance: { source: 'government', agency: 'Federal Election Commission', endpoints: ['candidates/search', 'committee/:id', 'candidate/:id/totals'], fecContributorData: 'never' },
  }
}

async function mapConcurrent(items, concurrency, mapper) {
  const out = new Array(items.length)
  let cursor = 0
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++
      out[index] = await mapper(items[index], index)
    }
  }))
  return out
}

async function candidateRows({ apiKey, state, limit }) {
  const rows = []
  for (const office of ['H', 'S', 'P']) {
    const payload = await request('/candidates/search/', {
      cycle: 2026, office, state: office === 'P' ? '' : state, is_active_candidate: true,
      per_page: Math.min(100, Math.max(limit * 3, 30)), page: 1,
    }, apiKey)
    rows.push(...(payload.results || []))
  }
  return rows
}

function interleave(groups) {
  const rows = []
  const longest = Math.max(0, ...groups.map(group => group.length))
  for (let index = 0; index < longest; index += 1) {
    for (const group of groups) if (group[index]) rows.push(group[index])
  }
  return rows
}

async function boundedProvingCandidates({ apiKey, state, maxCommittees, nationalSpotCheck }) {
  const [house, senate, president] = await Promise.all([
    request('/candidates/search/', { cycle: 2026, office: 'H', state, is_active_candidate: true, per_page: 50, page: 1 }, apiKey),
    request('/candidates/search/', { cycle: 2026, office: 'S', state, is_active_candidate: true, per_page: 50, page: 1 }, apiKey),
    request('/candidates/search/', { cycle: 2026, office: 'P', is_active_candidate: true, per_page: 10, page: 1 }, apiKey),
  ])
  const stateLimit = Math.max(0, maxCommittees - nationalSpotCheck)
  const stateCandidates = interleave([house.results || [], senate.results || []]).slice(0, stateLimit)
  const nationalCandidates = (president.results || []).slice(0, nationalSpotCheck)
  return [...new Map([...stateCandidates, ...nationalCandidates].map(candidate => [candidate.candidate_id, candidate])).values()].slice(0, maxCommittees)
}

async function pullBoundedFecProvingSample({ manifest, jurisdiction, limit, onProgress }) {
  const startedAt = Date.now()
  const apiKey = apiKeyFor(manifest)
  const state = clean(jurisdiction.state) || ''
  const targetRows = Math.min(Math.max(Number(limit) || 25, 1), 25)
  const maxCommittees = Math.min(40, Math.max(20, targetRows * 2))
  const nationalSpotCheck = Math.min(5, maxCommittees)
  onProgress?.({ phase: 'sampling', completed: 0, total: maxCommittees, label: `Selecting ${state || 'state'} committee sample` })
  const candidates = await boundedProvingCandidates({ apiKey, state, maxCommittees, nationalSpotCheck })
  let completed = 0
  const hydrated = await mapConcurrent(candidates, 4, async candidate => {
    try {
      return await hydrateCandidate(candidate, manifest, apiKey)
    } finally {
      completed += 1
      onProgress?.({ phase: 'sampling', completed, total: candidates.length || 1, label: `Checking committees ${completed}/${candidates.length}` })
    }
  })
  const rows = hydrated
    .filter(row => row?.externalId && (row.entity.email || row.entity.phone))
    .slice(0, targetRows)
  return {
    rows,
    cursor: null,
    stats: {
      reachability: true,
      schemaMatched: true,
      fetched: rows.length,
      candidates: candidates.length,
      pages: 1,
      elapsedMs: Date.now() - startedAt,
      endpoint: 'api.open.fec.gov',
      provingSample: {
        jurisdiction: state || 'US',
        committeesChecked: candidates.length,
        nationalSpotCheck: Math.min(nationalSpotCheck, candidates.length),
        maxCommittees,
      },
    },
  }
}

async function hydrateCandidate(candidate, manifest, apiKey) {
  const committeeId = committeeIdFor(candidate)
  if (!committeeId) return null
  const [committeePayload, totalsPayload] = await Promise.all([
    request(`/committee/${committeeId}/`, { cycle: 2026 }, apiKey),
    request(`/candidate/${candidate.candidate_id}/totals/`, { cycle: 2026, election_full: true }, apiKey),
  ])
  const committee = committeePayload.results?.find(row => row.cycles?.includes?.(2026)) || committeePayload.results?.[0]
  const totals = totalsPayload.results?.find(row => Number(row.cycle) === 2026) || totalsPayload.results?.[0] || {}
  return normalizeCampaign({ candidate, committee, totals, manifest })
}

export async function pullFecCampaigns({ manifest, jurisdiction = {}, limit = 50, proving = false, onProgress }) {
  if (proving) return pullBoundedFecProvingSample({ manifest, jurisdiction, limit, onProgress })
  const startedAt = Date.now()
  const apiKey = apiKeyFor(manifest)
  const state = clean(jurisdiction.state) || ''
  const ranked = await pullFecTopCampaigns({ manifest, state, district: clean(jurisdiction.district) || '', limit: Math.max(limit * 3, 30) })
  const rankedReachable = ranked.filter(row => row?.externalId && (row.entity.email || row.entity.phone)).slice(0, limit)
  if (rankedReachable.length >= limit) {
    return { rows: rankedReachable, cursor: null, stats: { reachability: true, schemaMatched: true, fetched: rankedReachable.length, candidates: ranked.length, pages: 1, elapsedMs: Date.now() - startedAt, endpoint: 'api.open.fec.gov', rankedByCash: true } }
  }
  const candidates = await candidateRows({ apiKey, state, limit })
  const unique = [...new Map(candidates.map(item => [item.candidate_id, item])).values()]
  const rows = [...rankedReachable]
  const candidatesToCheck = unique.slice(0, Math.max(limit * 3, 30))
  const batchSize = Math.min(8, Math.max(1, limit))
  for (let offset = 0; offset < candidatesToCheck.length && rows.length < limit; offset += batchSize) {
    const hydrated = await mapConcurrent(candidatesToCheck.slice(offset, offset + batchSize), 4, item => hydrateCandidate(item, manifest, apiKey))
    rows.push(...hydrated.filter(row => row?.externalId && (row.entity.email || row.entity.phone) && !rows.some(existing => existing.externalId === row.externalId)))
  }
  rows.length = Math.min(rows.length, limit)
  return { rows, cursor: null, stats: { reachability: true, schemaMatched: true, fetched: rows.length, candidates: unique.length, pages: 1, elapsedMs: Date.now() - startedAt, endpoint: 'api.open.fec.gov' } }
}

export async function pullFecTopCampaigns({ manifest, state = '', district = '', limit = 50 }) {
  const apiKey = apiKeyFor(manifest)
  const params = { cycle: 2026, election_full: true, state, district, per_page: 100, sort: '-receipts' }
  const firstPage = await request('/candidates/totals/', { ...params, page: 1 }, apiKey)
  const allTotals = [...(firstPage.results || [])]
  const totalPages = Math.min(100, Number(firstPage.pagination?.pages || 1))
  for (let page = 2; page <= totalPages; page += 1) {
    const payload = await request('/candidates/totals/', { ...params, page }, apiKey)
    allTotals.push(...(payload.results || []))
  }
  allTotals.sort((a, b) => Number(b.cash_on_hand_end_period || 0) - Number(a.cash_on_hand_end_period || 0))
  const seenCandidates = new Set()
  const rankedTotals = allTotals.filter(row => {
    const id = clean(row.candidate_id)
    if (!id || seenCandidates.has(id)) return false
    seenCandidates.add(id)
    return true
  })
  const candidates = rankedTotals.map(row => ({ candidate_id: row.candidate_id, name: row.name, office: row.office, state: row.state, district: row.district, party: row.party }))
  const hydrated = await mapConcurrent(candidates.slice(0, limit), 4, async (candidate, index) => {
    const totals = rankedTotals[index]
    const result = await request(`/candidate/${candidate.candidate_id}/committees/`, { cycle: 2026, designation: 'P', per_page: 10 }, apiKey)
    const committee = result.results?.find(row => row.designation === 'P') || result.results?.[0]
    return committee ? normalizeCampaign({ candidate, committee, totals, manifest }) : null
  })
  const byCommittee = new Map()
  for (const row of hydrated.filter(Boolean)) {
    const existing = byCommittee.get(row.externalId)
    if (!existing || Number(row.attrs.cashOnHand) > Number(existing.attrs.cashOnHand)) byCommittee.set(row.externalId, row)
  }
  return [...byCommittee.values()].sort((a, b) => b.attrs.cashOnHand - a.attrs.cashOnHand).slice(0, limit)
}

export async function countFecCommitteesWithEmail({ manifest, maxPages = 500, targetCount = 5000 }) {
  const apiKey = apiKeyFor(manifest)
  let count = 0
  let scanned = 0
  let pages = 1
  for (let page = 1; page <= Math.min(pages, maxPages); page += 1) {
    const payload = await request('/committees/', { cycle: 2026, per_page: 100, page }, apiKey)
    pages = Number(payload.pagination?.pages || 1)
    const rows = payload.results || []
    scanned += rows.length
    count += rows.filter(row => clean(row.email)).length
    if (count >= targetCount) break
  }
  return { count, scanned, pagesScanned: Math.ceil(scanned / 100), totalPages: pages, targetReached: count >= targetCount }
}

export function clearFecCache() { cache.clear(); requestQueue = Promise.resolve(); lastRequestAt = 0 }
