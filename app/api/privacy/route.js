import { NextResponse } from 'next/server'
import { requireCrmRead, requireCrmWrite } from '@/lib/permissions'
import {
  assignPrivacyCardCategory,
  deletePrivacyCategory,
  getPrivacyCredential,
  privacyAuthHeaders,
  privacySummary,
  publicPrivacyWebhookUrl,
  readPrivacyCards,
  readPrivacyCategories,
  readPrivacyTransactions,
  upsertPrivacyCard,
  upsertPrivacyCategory,
  upsertPrivacyTransaction,
} from '@/lib/privacyFinance'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

class PrivacyProviderError extends Error {
  constructor(message, { status = 502, upstreamStatus = 0, body = null } = {}) {
    super(message)
    this.name = 'PrivacyProviderError'
    this.status = status
    this.upstreamStatus = upstreamStatus
    this.body = body
  }
}

function providerMessage(error, fallback = 'Privacy.com rejected the request') {
  const message = String(error?.message || fallback).trim()
  return message || fallback
}

function providerErrorResponse(error, action) {
  const upstreamStatus = Number(error?.upstreamStatus || 0)
  const status = upstreamStatus >= 400 && upstreamStatus < 500 ? 424 : 502
  const message = providerMessage(error)
  console.warn('Privacy API request failed', {
    action,
    upstreamStatus: upstreamStatus || undefined,
    message,
  })
  return NextResponse.json(
    {
      ok: false,
      code: 'privacy_provider_error',
      error: `Privacy.com rejected ${action}: ${message}`,
      providerStatus: upstreamStatus || undefined,
    },
    { status },
  )
}

async function fetchPrivacyTransactions({ key, baseUrl }) {
  const url = `${String(baseUrl).replace(/\/+$/, '')}/transactions?page_size=25`
  const res = await fetch(url, {
    headers: privacyAuthHeaders(key),
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new PrivacyProviderError(body?.message || body?.error || `Privacy HTTP ${res.status}`, {
      upstreamStatus: res.status,
      body,
    })
  }
  const rows = Array.isArray(body?.data) ? body.data : []
  return rows.map(row => upsertPrivacyTransaction(row, { source: 'privacy_api' }).transaction)
}

async function privacyApiJson({ key, baseUrl }, path, options = {}) {
  const res = await fetch(`${String(baseUrl).replace(/\/+$/, '')}${path}`, {
    ...options,
    headers: {
      ...privacyAuthHeaders(key),
      ...(options.headers || {}),
    },
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new PrivacyProviderError(body?.message || body?.error || `Privacy HTTP ${res.status}`, {
      upstreamStatus: res.status,
      body,
    })
  }
  return body
}

async function fetchPrivacyCards(cred) {
  const body = await privacyApiJson(cred, '/cards?page_size=100')
  const rows = Array.isArray(body?.data) ? body.data : []
  return rows.map(row => upsertPrivacyCard(row, { source: 'privacy_api' }).card)
}

async function fetchPrivacyFundingSources(cred) {
  const body = await privacyApiJson(cred, '/funding_sources')
  const rows = Array.isArray(body?.data) ? body.data : []
  return rows.map(source => ({
    token: String(source.token || ''),
    label: source.nickname || source.account_name || `${source.type || 'Funding source'} ${source.last_four ? `*${source.last_four}` : ''}`.trim(),
    lastFour: source.last_four || '',
    state: source.state || '',
    type: source.type || '',
  }))
}

function dollarsToCents(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.round(n * 100)
}

function privacyState() {
  const transactions = readPrivacyTransactions()
  const cards = readPrivacyCards()
  const categories = readPrivacyCategories()
  return {
    transactions,
    cards,
    categories,
    summary: privacySummary(transactions.transactions, cards.cards),
  }
}

export async function GET(request) {
  const { error } = await requireCrmRead(request)
  if (error) return error

  const url = new URL(request.url)
  const cred = getPrivacyCredential()
  let refreshError = ''
  let fundingSources = []
  if (url.searchParams.get('refresh') === '1' && cred.configured) {
    try {
      await Promise.all([
        fetchPrivacyTransactions(cred),
        fetchPrivacyCards(cred),
      ])
    } catch (err) {
      refreshError = err.message || 'Privacy refresh failed'
    }
  }
  if (cred.configured) {
    try {
      fundingSources = await fetchPrivacyFundingSources(cred)
    } catch {}
  }

  const data = privacyState()
  return NextResponse.json({
    ok: true,
    configured: cred.configured,
    environment: cred.environment,
    baseUrl: cred.configured ? cred.baseUrl : '',
    credentialId: cred.credential?.id || '',
    webhookUrl: publicPrivacyWebhookUrl(url.origin),
    refreshError,
    fundingSources,
    summary: data.summary,
    transactions: data.transactions.transactions,
    transactionLastUpdated: data.transactions.lastUpdated,
    cards: data.cards.cards,
    cardLastUpdated: data.cards.lastUpdated,
    categories: data.categories.categories,
    categoryLastUpdated: data.categories.lastUpdated,
  })
}

export async function POST(request) {
  const { error } = await requireCrmWrite(request)
  if (error) return error

  const body = await request.json().catch(() => ({}))
  const action = String(body.action || '').trim()
  const cred = getPrivacyCredential()

  if (action === 'create_category') {
    const result = upsertPrivacyCategory(body.category || body)
    return NextResponse.json({ ok: true, ...result, ...privacyState() })
  }

  if (action === 'update_category') {
    const result = upsertPrivacyCategory(body.category || body)
    return NextResponse.json({ ok: true, ...result, ...privacyState() })
  }

  if (action === 'delete_category') {
    const result = deletePrivacyCategory(body.id || body.categoryId)
    return NextResponse.json({ ok: true, ...result, ...privacyState() })
  }

  if (action === 'assign_category') {
    const result = assignPrivacyCardCategory(body.cardToken, body.categoryId || '')
    return NextResponse.json({ ok: true, ...result, ...privacyState() })
  }

  if (!cred.configured) {
    return NextResponse.json({ ok: false, error: 'Privacy.com credential is not configured' }, { status: 400 })
  }

  if (action === 'create_card') {
    const card = body.card || {}
    const memo = String(card.memo || '').trim()
    if (!memo) return NextResponse.json({ ok: false, error: 'Card memo is required' }, { status: 400 })
    const payload = {
      type: card.type || 'SINGLE_USE',
      memo,
      spend_limit: dollarsToCents(card.spendLimit),
      spend_limit_duration: card.spendLimitDuration || 'TRANSACTION',
      state: card.state || 'OPEN',
    }
    if (card.fundingToken) payload.funding_token = card.fundingToken
    let created
    try {
      created = await privacyApiJson(cred, '/cards', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
    } catch (err) {
      if (err instanceof PrivacyProviderError) return providerErrorResponse(err, 'card creation')
      throw err
    }
    const result = upsertPrivacyCard(created, {
      source: 'privacy_api_create',
      categoryId: String(card.categoryId || ''),
      cardholderName: String(card.cardholderName || ''),
    })
    return NextResponse.json({ ok: true, ...result, ...privacyState() })
  }

  if (action === 'update_card_state') {
    const token = String(body.cardToken || '').trim()
    const state = String(body.state || '').trim().toUpperCase()
    if (!token) return NextResponse.json({ ok: false, error: 'Card token is required' }, { status: 400 })
    if (!['OPEN', 'PAUSED', 'CLOSED'].includes(state)) return NextResponse.json({ ok: false, error: 'Unsupported card state' }, { status: 400 })
    let updated
    try {
      updated = await privacyApiJson(cred, `/cards/${encodeURIComponent(token)}`, {
        method: 'PATCH',
        body: JSON.stringify({ state }),
      })
    } catch (err) {
      if (err instanceof PrivacyProviderError) return providerErrorResponse(err, 'card update')
      throw err
    }
    const result = upsertPrivacyCard(updated, { source: 'privacy_api_update' })
    return NextResponse.json({ ok: true, ...result, ...privacyState() })
  }

  return NextResponse.json({ ok: false, error: 'Unknown Privacy action' }, { status: 400 })
}
