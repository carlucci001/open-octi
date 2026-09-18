// Google Maps browser-extension intake. Accepts a batch of scraped map
// listings and creates leads through the same create path as /api/leads,
// so dedupe, timestamps and record shape stay identical.
import { NextResponse } from 'next/server'
import { create, loadAll, logActivity } from '@/lib/entityStore'
import { requireCrmWrite } from '@/lib/permissions'
import { findExistingLeadMatch } from '@/lib/leadDedupe'
import { leadCreatePayload } from '../route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_LEADS = 200
// Snake_case to match every other lead list id in lead-lists.json
// (new_business_owners, political_campaigns_2026). normalizeLeadList keeps an
// explicit id verbatim, so a mismatch here would silently orphan these leads:
// userCanAccessLead() denies a lead whose leadListId has no matching list.
const MAPS_LEAD_LIST_ID = 'google_harvest'

function corsHeaders(request) {
  const origin = request?.headers?.get('origin')
  const headers = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin
    headers['Access-Control-Allow-Credentials'] = 'true'
    headers['Vary'] = 'Origin'
  } else {
    headers['Access-Control-Allow-Origin'] = '*'
  }
  return headers
}

function clean(value, limit = 500) {
  return String(value ?? '').trim().slice(0, limit)
}

function slugify(value) {
  return String(value || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

// Digits only, but keep a leading '+' for international numbers.
function normalizePhone(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const hasPlus = raw.startsWith('+')
  const digits = raw.replace(/\D+/g, '')
  if (!digits) return ''
  return hasPlus ? `+${digits}` : digits
}

// Add https:// when the scheme is missing, and strip utm_* tracking params.
function normalizeWebsite(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  try {
    const url = new URL(withScheme)
    for (const key of Array.from(url.searchParams.keys())) {
      if (/^utm_/i.test(key)) url.searchParams.delete(key)
    }
    let result = url.toString()
    if (result.endsWith('?')) result = result.slice(0, -1)
    return result
  } catch {
    return withScheme
  }
}

// Best-effort parse of a US-format address string, e.g.
// "123 Main St, Greenville, SC 29601" -> { street, city, state, zip }.
function parseAddress(address) {
  const raw = String(address || '').trim()
  const empty = { street: '', city: '', state: '', zip: '' }
  if (!raw) return empty
  const parts = raw.split(',').map(p => p.trim()).filter(Boolean)
  if (!parts.length) return empty
  const stateZipFrom = (segment) => {
    const m = String(segment || '').match(/^([A-Za-z]{2})\s*(\d{5}(?:-\d{4})?)?/)
    if (!m) return { state: '', zip: '' }
    return { state: (m[1] || '').toUpperCase(), zip: m[2] || '' }
  }
  if (parts.length >= 3) {
    const { state, zip } = stateZipFrom(parts[2])
    return { street: parts[0], city: parts[1], state, zip }
  }
  if (parts.length === 2) {
    const { state, zip } = stateZipFrom(parts[1])
    return { street: '', city: parts[0], state, zip }
  }
  return { street: parts[0] || '', city: '', state: '', zip: '' }
}

async function authenticate(request) {
  const authHeader = request.headers.get('authorization') || ''
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i)
  const token = bearerMatch ? bearerMatch[1].trim() : ''
  const envToken = String(process.env.FCC_MAPS_INTAKE_TOKEN || '').trim()
  if (envToken && token && token === envToken) {
    return { user: { role: 'integration', source: 'maps-intake-token' }, error: null }
  }
  const { user, error } = await requireCrmWrite(request)
  if (error) return { user: null, error }
  return { user, error: null }
}

function buildMapsLead(entry, meta, now) {
  const name = clean(entry?.name, 200)
  if (!name) return { status: 'invalid', name: '', reason: 'name required' }

  const phone = normalizePhone(entry.phone)
  const website = normalizeWebsite(entry.website)
  const address = clean(entry.address, 500)
  const { city, state, zip } = parseAddress(address)
  const category = clean(entry.category, 160)
  const ratingNum = entry.rating !== undefined && entry.rating !== null && entry.rating !== ''
    ? Number(entry.rating) : null
  const rating = Number.isFinite(ratingNum) ? ratingNum : null
  const reviewCountNum = entry.reviewCount !== undefined && entry.reviewCount !== null && entry.reviewCount !== ''
    ? Number(entry.reviewCount) : null
  const reviewCount = Number.isFinite(reviewCountNum) ? reviewCountNum : null
  const hours = clean(entry.hours, 200)
  const mapsUrl = clean(entry.mapsUrl, 500)
  const placeId = clean(entry.placeId, 200)
  const query = clean(entry.query || meta.query, 200)
  const location = clean(entry.location || meta.location, 200)

  const tags = Array.from(new Set(['google-maps', category ? slugify(category) : ''].filter(Boolean)))
  const notes = [
    'Google Maps',
    category || '',
    rating !== null ? `${rating}★ (${reviewCount ?? 0})` : '',
    hours || '',
  ].filter(Boolean).join(' · ')

  const incoming = {
    businessName: name,
    name: '',
    phone,
    website,
    address,
    city,
    state,
    zip,
    source: 'google-maps-extension',
    sourceUrl: mapsUrl,
    leadSourceProvider: 'google-maps',
    leadSourceCategory: category,
    leadSourceQuery: query,
    leadSourceLocation: location,
    leadSourcedAt: now,
    brandContext: 'farrington_dev',
    status: 'new',
    leadListId: MAPS_LEAD_LIST_ID,
    tags,
    maps: { placeId, rating, reviewCount, hours, category, mapsUrl },
    notes,
  }
  return { status: 'ok', name, incoming }
}

export async function POST(request) {
  const cors = corsHeaders(request)
  const { error } = await authenticate(request)
  if (error) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401, headers: cors })
  }

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON' }, { status: 400, headers: cors })
  }

  const leads = Array.isArray(body?.leads) ? body.leads : null
  if (!leads) {
    return NextResponse.json({ ok: false, error: 'leads array required' }, { status: 400, headers: cors })
  }
  if (leads.length > MAX_LEADS) {
    return NextResponse.json({ ok: false, error: `max ${MAX_LEADS} leads per request` }, { status: 400, headers: cors })
  }

  const meta = body?.meta && typeof body.meta === 'object' ? body.meta : {}
  const now = new Date().toISOString()
  const existingLeads = loadAll('leads')
  if (!loadAll('leadLists').some(list => list.id === MAPS_LEAD_LIST_ID)) {
    create('leadLists', { id: MAPS_LEAD_LIST_ID, name: 'Google harvest', brandContext: 'farrington_dev', system: true, visibleToAll: true })
  }
  const results = []
  let created = 0
  let skipped = 0

  for (const entry of leads) {
    if (!entry || typeof entry !== 'object') {
      results.push({ name: '', status: 'invalid', reason: 'invalid entry' })
      skipped += 1
      continue
    }
    const built = buildMapsLead(entry, meta, now)
    if (built.status === 'invalid') {
      results.push({ name: built.name, status: 'invalid', reason: built.reason })
      skipped += 1
      continue
    }
    const existingMatch = findExistingLeadMatch(built.incoming, existingLeads)
    if (existingMatch) {
      results.push({ name: built.name, status: 'duplicate', existingId: existingMatch.lead.id, reason: existingMatch.reason })
      skipped += 1
      continue
    }
    const rec = create('leads', leadCreatePayload(built.incoming))
    existingLeads.push(rec)
    logActivity({ type: 'note', subject: 'Lead created (Google Maps)', linkedTo: { leadId: rec.id } })
    results.push({ name: built.name, status: 'created', id: rec.id })
    created += 1
  }

  return NextResponse.json({ ok: true, created, skipped, results }, { headers: cors })
}

export async function OPTIONS(request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) })
}
