import crypto from 'crypto'
import { NextResponse } from 'next/server'
import Stripe from 'stripe'

import { requireOwner } from '@/lib/auth'
import { logAuditEvent } from '@/lib/auditLog'
import { mutateData, readData } from '@/lib/dataStore'
import {
  createLeaseStripeCheckoutSession,
  previewLeaseStripeSubscription,
  previewStripeSubscriptionMigrations,
  syncStripeBillingCatalog,
  syncStripeSubscriptionMigrations,
  updateLeaseStripeSubscription,
} from '@/lib/stripe-billing-catalog.mjs'
import { getRuntimeStripeBillingCatalogDefinitions } from '@/lib/stripe-billing-catalog-source'
import {
  bindExistingLeaseSubscriptionCheckoutSession,
  reserveExistingLeaseSubscriptionCheckout,
} from '@/lib/stripe-subscription-lifecycle'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const STATE_FILE = 'stripe-catalog-sync-runs.json'
const CONFIRMATION = 'UPDATE STRIPE CATALOG'
const MIGRATION_CONFIRMATION = 'MIGRATE WITHOUT PRORATION'
const LEASE_CONFIRMATION = 'UPDATE CLIENT SUBSCRIPTION'
const CHECKOUT_CONFIRMATION = 'CREATE BILLING SETUP'
const CANCEL_CONFIRMATION = 'CANCEL AT RENEWAL'
const UNDO_CANCEL_CONFIRMATION = 'KEEP SUBSCRIPTION ACTIVE'
const PREVIEW_TTL_MS = 15 * 60 * 1000
const MAX_RUNS = 100

function json(body, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]))
}

function sha(value) {
  return crypto.createHash('sha256').update(JSON.stringify(stable(value))).digest('hex')
}

function signingSecret() {
  return String(process.env.STRIPE_CATALOG_SYNC_SECRET || process.env.CRM_SESSION_SECRET || '').trim()
}

function existingLeaseCheckoutNonce({ leaseId, requestId, planHash }) {
  const secret = signingSecret()
  if (!secret) throw new Error('Stripe billing checkout signing is not configured')
  return crypto.createHmac('sha256', secret)
    .update(`${leaseId}:${requestId}:${planHash}`)
    .digest('hex')
}

function stripeSecretKey() {
  const fromEnv = String(process.env.STRIPE_SECRET_KEY || '').trim()
  if (fromEnv) return fromEnv
  const credentials = (readData('credentials.json') || {}).credentials || []
  const entry = credentials.find(credential => /stripe/i.test(credential.name || ''))
  const fields = entry?.fields || []
  const production = fields.find(field => /secret.*\(p\)/i.test(field.label || ''))
  const test = fields.find(field => /secret.*\(s\)/i.test(field.label || ''))
  const fallback = fields.find(field => /secret/i.test(field.label || ''))
  return String((production || test || fallback)?.value || '').trim()
}

function stripePublishableKey() {
  const fromEnv = String(
    process.env.NEXT_PUBLIC_STRIPE_PK
    || process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
    || '',
  ).trim()
  if (fromEnv.startsWith('pk_')) return fromEnv
  const credentials = (readData('credentials.json') || {}).credentials || []
  const entry = credentials.find(credential => /stripe/i.test(credential.name || ''))
  const field = (entry?.fields || []).find(item => /publishable/i.test(item.label || ''))
  const value = String(field?.value || '').trim()
  return value.startsWith('pk_') ? value : ''
}

function safeText(value, max = 300) {
  return String(value || '').trim().slice(0, max)
}

function publicSummary(summary = {}) {
  return {
    create: Number(summary.create ?? summary.creates ?? 0),
    update: Number(summary.update ?? summary.updates ?? 0),
    unchanged: Number(summary.unchanged ?? summary.none ?? 0),
    conflicts: Number(summary.conflicts ?? summary.conflict ?? 0),
    errors: Number(summary.errors ?? 0),
  }
}

function publicResult(result, fallbackCatalogHash) {
  const items = Array.isArray(result?.items) ? result.items.slice(0, 500).map(item => ({
    catalogKey: safeText(item?.catalogKey, 140),
    kind: safeText(item?.kind, 40),
    name: safeText(item?.name, 180),
    billingMode: safeText(item?.billingMode, 40),
    priceCount: Number(item?.priceCount || 0),
    status: safeText(item?.status, 40),
  })) : []
  const operations = Array.isArray(result?.operations) ? result.operations.slice(0, 1000).map(operation => ({
    action: safeText(operation?.action, 40),
    resource: safeText(operation?.resource, 40),
    catalogKey: safeText(operation?.catalogKey, 140),
    lookupKey: safeText(operation?.lookupKey, 180),
    stripeId: safeText(operation?.stripeId, 180),
    reason: safeText(operation?.reason, 300),
  })) : []
  const errors = Array.isArray(result?.errors)
    ? result.errors.slice(0, 100).map(error => safeText(error?.message || error, 300))
    : []
  return {
    ok: result?.ok === true,
    mode: result?.mode === 'apply' ? 'apply' : 'dry-run',
    catalogVersion: safeText(result?.catalogVersion, 80),
    catalogHash: safeText(result?.catalogHash, 80) || fallbackCatalogHash,
    summary: publicSummary(result?.summary),
    items,
    operations,
    errors,
  }
}

function planFingerprint(plan) {
  return sha({
    catalogVersion: plan.catalogVersion,
    catalogHash: plan.catalogHash,
    summary: plan.summary,
    items: plan.items,
    operations: plan.operations,
    errors: plan.errors,
  })
}

function signPreview(plan) {
  const secret = signingSecret()
  if (!secret) throw new Error('Stripe catalog preview signing is not configured')
  const payload = Buffer.from(JSON.stringify({
    fingerprint: planFingerprint(plan),
    catalogHash: plan.catalogHash,
    expiresAt: Date.now() + PREVIEW_TTL_MS,
  })).toString('base64url')
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('base64url')
  return `${payload}.${signature}`
}

function migrationFingerprint(result) {
  return sha({
    catalogVersion: result.catalogVersion,
    catalogHash: result.catalogHash,
    summary: result.summary,
    items: result.items,
    errors: result.errors,
  })
}

function publicMigration(result) {
  const rawSummary = result?.summary || {}
  const errors = Array.isArray(result?.errors)
    ? result.errors.slice(0, 100).map(error => safeText(error?.message || error, 300))
    : []
  const summary = {
    subscriptions: Number(rawSummary.subscriptionsScanned || 0),
    items: Number(rawSummary.eligible || 0),
    unchanged: Number(rawSummary.current || 0),
    unsupported: Number(rawSummary.unsupported || 0),
    errors: errors.length,
    subscriptionsScanned: Number(rawSummary.subscriptionsScanned || 0),
    itemsScanned: Number(rawSummary.itemsScanned || 0),
    eligible: Number(rawSummary.eligible || 0),
    current: Number(rawSummary.current || 0),
  }
  return {
    ok: result?.ok === true,
    mode: result?.mode === 'apply' ? 'apply' : 'preview',
    catalogVersion: safeText(result?.catalogVersion, 80),
    catalogHash: safeText(result?.catalogHash, 80),
    summary,
    items: Array.isArray(result?.items) ? result.items.slice(0, 1000).map(item => ({
      requestId: safeText(item?.requestId, 180),
      catalogKey: safeText(item?.catalogKey, 140),
      status: safeText(item?.status, 40),
      quantity: Math.max(0, Number(item?.quantity || 0)),
    })) : [],
    applied: Math.max(0, Number(result?.applied || 0)),
    errors,
  }
}

function publicLeasePlan(result) {
  const summary = result?.summary || {}
  return {
    ok: result?.ok === true,
    mode: result?.mode === 'apply' ? 'apply' : 'preview',
    catalogHash: safeText(result?.catalogHash, 80),
    planHash: safeText(result?.planHash, 80),
    checkoutRequired: result?.checkoutRequired === true,
    monthlyAmountCents: Math.max(0, Number(result?.monthlyAmountCents || 0)),
    summary: {
      desired: Math.max(0, Number(summary.desired || 0)),
      add: Math.max(0, Number(summary.add || 0)),
      replace: Math.max(0, Number(summary.replace || 0)),
      remove: Math.max(0, Number(summary.remove || 0)),
      current: Math.max(0, Number(summary.current || 0)),
    },
    operations: Array.isArray(result?.operations) ? result.operations.slice(0, 100).map(operation => ({
      catalogKey: safeText(operation?.catalogKey, 140),
      action: safeText(operation?.action, 40),
      quantity: Math.max(0, Number(operation?.quantity || 0)),
    })) : [],
    applied: result?.applied === true,
    errors: Array.isArray(result?.errors)
      ? result.errors.slice(0, 50).map(error => safeText(error?.message || error, 300))
      : [],
  }
}

function signMigrationPreview(result) {
  const secret = signingSecret()
  if (!secret) throw new Error('Stripe catalog preview signing is not configured')
  const payload = Buffer.from(JSON.stringify({
    kind: 'subscription-migration',
    fingerprint: migrationFingerprint(result),
    catalogHash: result.catalogHash,
    expiresAt: Date.now() + PREVIEW_TTL_MS,
  })).toString('base64url')
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('base64url')
  return `${payload}.${signature}`
}

function signLeasePreview(leaseId, result) {
  const secret = signingSecret()
  if (!secret) throw new Error('Stripe catalog preview signing is not configured')
  const fingerprint = sha(publicLeasePlan(result))
  const payload = Buffer.from(JSON.stringify({
    kind: 'lease-subscription',
    leaseId,
    fingerprint,
    planHash: result.planHash,
    catalogHash: result.catalogHash,
    expiresAt: Date.now() + PREVIEW_TTL_MS,
  })).toString('base64url')
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('base64url')
  return `${payload}.${signature}`
}

function signCancellationPreview(leaseId, result) {
  const secret = signingSecret()
  if (!secret) throw new Error('Stripe catalog preview signing is not configured')
  const fingerprint = sha(result)
  const payload = Buffer.from(JSON.stringify({
    kind: 'lease-cancellation',
    leaseId,
    fingerprint,
    expiresAt: Date.now() + PREVIEW_TTL_MS,
  })).toString('base64url')
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('base64url')
  return `${payload}.${signature}`
}

function verifyPreview(token) {
  const secret = signingSecret()
  if (!secret) throw new Error('Stripe catalog preview signing is not configured')
  const [payload, supplied] = safeText(token, 4096).split('.')
  if (!payload || !supplied) throw new Error('Preview token is invalid')
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('base64url')
  const suppliedBuffer = Buffer.from(supplied)
  const expectedBuffer = Buffer.from(expected)
  if (suppliedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)) {
    throw new Error('Preview token is invalid')
  }
  const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  if (!Number.isFinite(parsed?.expiresAt) || parsed.expiresAt < Date.now()) throw new Error('Preview expired; run it again')
  return parsed
}

function syncState() {
  const state = readData(STATE_FILE) || {}
  return {
    lastSync: state.lastSync || null,
    lastAttempt: state.lastAttempt || null,
    runs: Array.isArray(state.runs) ? state.runs : [],
  }
}

function clientSubscriptionRecords() {
  const leases = (readData('leases.json') || {}).leases || []
  const accounts = (readData('accounts.json') || {}).accounts || []
  const accountById = new Map(accounts.map(account => [account.id, account]))
  return leases
    .filter(lease => lease?.status === 'active')
    .map(lease => {
      const account = accountById.get(lease.clientAccountId)
      const hasStripeSubscription = Boolean(safeText(lease.stripeSubscriptionId, 180))
      return {
        leaseId: safeText(lease.id, 180),
        accountName: safeText(account?.name || lease.tenantName || lease.clientAccountId || 'Client account', 180),
        tierId: safeText(lease.tierId, 140),
        tierName: safeText(lease.tierName || lease.planName || lease.tierId || 'Subscription', 180),
        hasStripeCustomer: Boolean(safeText(lease.stripeCustomerId, 180)),
        hasStripeSubscription,
        stripeSubscriptionStatus: safeText(lease.stripeSubscriptionStatus || 'not_connected', 40),
        billingStatus: safeText(lease.billingStatus || (hasStripeSubscription ? 'unverified' : 'setup_required'), 40),
        currentPeriodEnd: safeText(lease.currentPeriodEnd, 80),
        paidThrough: safeText(lease.paidThrough, 80),
        verifiedAt: safeText(lease.stripeLifecycleVerifiedAt, 80),
        cancelAtPeriodEnd: lease.stripeCancelAtPeriodEnd === true,
        cancellationEffectiveAt: safeText(lease.stripeCancellationEffectiveAt, 80),
      }
    })
    .sort((a, b) => a.accountName.localeCompare(b.accountName))
}

function activeLease(leaseId) {
  const id = safeText(leaseId, 180)
  const leases = (readData('leases.json') || {}).leases || []
  return leases.find(lease => lease?.id === id && lease?.status === 'active') || null
}

function isoFromStripeSeconds(value) {
  const seconds = Number(value)
  if (!Number.isFinite(seconds) || seconds <= 0) return ''
  return new Date(seconds * 1000).toISOString()
}

async function cancellationPreview(stripe, lease) {
  if (!lease?.stripeSubscriptionId) throw new Error('This client does not have a Stripe subscription')
  const subscription = await stripe.subscriptions.retrieve(lease.stripeSubscriptionId)
  const status = safeText(subscription?.status, 40)
  const cancelAtPeriodEnd = subscription?.cancel_at_period_end === true
  const result = {
    ok: ['active', 'trialing'].includes(status),
    leaseId: lease.id,
    status,
    cancelAtPeriodEnd,
    currentPeriodEnd: isoFromStripeSeconds(subscription?.current_period_end)
      || safeText(lease.currentPeriodEnd, 80),
    canSchedule: ['active', 'trialing'].includes(status) && !cancelAtPeriodEnd,
    canUndo: ['active', 'trialing'].includes(status) && cancelAtPeriodEnd,
    errors: ['active', 'trialing'].includes(status) ? [] : ['Only active or trialing subscriptions can be changed.'],
  }
  return result
}

function rememberCancellationEvidence({ leaseId, cancelAtPeriodEnd, effectiveAt, actor, requestId }) {
  const changedAt = new Date().toISOString()
  return mutateData('leases.json', current => {
    const data = current && typeof current === 'object' ? current : { leases: [] }
    const leases = Array.isArray(data.leases) ? [...data.leases] : []
    const index = leases.findIndex(lease => lease.id === leaseId && lease.status === 'active')
    if (index < 0) throw new Error('Active client lease not found')
    leases[index] = {
      ...leases[index],
      stripeCancelAtPeriodEnd: cancelAtPeriodEnd,
      stripeCancellationEffectiveAt: cancelAtPeriodEnd ? effectiveAt : null,
      stripeCancellationScheduledAt: cancelAtPeriodEnd ? changedAt : null,
      stripeCancellationLastChangedAt: changedAt,
      stripeCancellationLastAction: cancelAtPeriodEnd ? 'scheduled_at_period_end' : 'schedule_removed',
      stripeCancellationRequestId: requestId,
      stripeCancellationChangedBy: safeText(actor, 160),
    }
    return { data: { ...data, leases }, result: leases[index] }
  })
}

function accountForLease(lease) {
  const accounts = (readData('accounts.json') || {}).accounts || []
  return accounts.find(account => account?.id === lease?.clientAccountId) || null
}

function rememberAttempt({ requestId, fingerprint, result, actor }) {
  const now = new Date().toISOString()
  const record = {
    requestId,
    fingerprint,
    catalogHash: result.catalogHash,
    catalogVersion: result.catalogVersion,
    status: result.ok ? 'synced' : 'failed',
    summary: result.summary,
    completedAt: now,
    actor: safeText(actor, 160),
    result,
  }
  return mutateData(STATE_FILE, current => {
    const data = current && typeof current === 'object' ? current : {}
    const runs = Array.isArray(data.runs) ? data.runs : []
    const next = {
      ...data,
      lastAttempt: record,
      lastSync: result.ok ? {
        catalogHash: result.catalogHash,
        catalogVersion: result.catalogVersion,
        status: 'synced',
        summary: result.summary,
        completedAt: now,
      } : data.lastSync || null,
      runs: [record, ...runs.filter(run => run.requestId !== requestId)].slice(0, MAX_RUNS),
    }
    return { data: next, result: record }
  })
}

function rememberMigrationAttempt({ requestId, fingerprint, result, actor }) {
  const now = new Date().toISOString()
  const record = {
    requestId,
    kind: 'subscription-migration',
    fingerprint,
    catalogHash: result.catalogHash,
    catalogVersion: result.catalogVersion,
    status: result.ok ? 'migrated' : 'failed',
    summary: result.summary,
    completedAt: now,
    actor: safeText(actor, 160),
    result,
  }
  return mutateData(STATE_FILE, current => {
    const data = current && typeof current === 'object' ? current : {}
    const runs = Array.isArray(data.runs) ? data.runs : []
    return {
      data: {
        ...data,
        lastMigration: record,
        runs: [record, ...runs.filter(run => run.requestId !== requestId)].slice(0, MAX_RUNS),
      },
      result: record,
    }
  })
}

function rememberLeaseAttempt({ requestId, kind, leaseId, fingerprint, result, actor }) {
  const now = new Date().toISOString()
  const record = {
    requestId,
    kind,
    leaseId,
    fingerprint,
    catalogHash: result.catalogHash,
    status: result.ok ? 'completed' : 'failed',
    summary: result.summary,
    completedAt: now,
    actor: safeText(actor, 160),
    result,
  }
  return mutateData(STATE_FILE, current => {
    const data = current && typeof current === 'object' ? current : {}
    const runs = Array.isArray(data.runs) ? data.runs : []
    return {
      data: {
        ...data,
        lastClientSubscriptionAction: record,
        runs: [record, ...runs.filter(run => run.requestId !== requestId)].slice(0, MAX_RUNS),
      },
      result: record,
    }
  })
}

function pendingChanges(plan, lastSync) {
  const summary = plan.summary || {}
  return !lastSync
    || lastSync.catalogHash !== plan.catalogHash
    || summary.create > 0
    || summary.update > 0
    || summary.conflicts > 0
    || summary.errors > 0
}

async function preview(stripe) {
  const definitions = getRuntimeStripeBillingCatalogDefinitions()
  const hash = sha(definitions)
  const raw = await syncStripeBillingCatalog({ stripe, apply: false, definitions })
  const plan = publicResult(raw, hash)
  const state = syncState()
  const canApply = plan.ok && plan.summary.conflicts === 0 && plan.summary.errors === 0
  return {
    plan,
    previewToken: canApply ? signPreview(plan) : '',
    previewExpiresInSeconds: canApply ? PREVIEW_TTL_MS / 1000 : 0,
    canApply,
    pendingChanges: pendingChanges(plan, state.lastSync),
    lastSync: state.lastSync,
  }
}

function stripeClient() {
  const key = stripeSecretKey()
  if (!key) return null
  return new Stripe(key)
}

export async function GET(request) {
  const { error } = await requireOwner(request)
  if (error) return error
  const stripe = stripeClient()
  if (!stripe) return json({ ok: false, error: 'Stripe is not configured.' }, 503)
  if (!signingSecret()) return json({ ok: false, error: 'Stripe catalog preview signing is not configured.' }, 503)

  try {
    const result = await preview(stripe)
    return json({ ok: true, ...result, clients: clientSubscriptionRecords() })
  } catch (error) {
    console.error('Stripe catalog preview failed', safeText(error?.code || error?.name || 'unknown', 80))
    return json({ ok: false, error: 'Stripe catalog could not be inspected. No changes were made.' }, 502)
  }
}

export async function POST(request) {
  const { user, error } = await requireOwner(request)
  if (error) return error

  const body = await request.json().catch(() => null)
  const action = safeText(body?.action, 80)
  if (![
    'apply',
    'preview-existing-subscriptions',
    'migrate-existing-subscriptions',
    'preview-client-subscription',
    'update-client-subscription',
    'create-client-billing-setup',
    'preview-client-cancellation',
    'cancel-client-at-renewal',
    'undo-client-cancellation',
  ].includes(action)) {
    return json({ ok: false, error: 'Unknown Stripe catalog action.' }, 400)
  }

  const stripe = stripeClient()
  if (!stripe) return json({ ok: false, error: 'Stripe is not configured.' }, 503)

  if (action === 'preview-client-cancellation') {
    const lease = activeLease(body?.leaseId)
    if (!lease) return json({ ok: false, error: 'Active client lease not found.' }, 404)
    try {
      const cancellation = await cancellationPreview(stripe, lease)
      return json({
        ok: true,
        lease: clientSubscriptionRecords().find(client => client.leaseId === lease.id) || { leaseId: lease.id },
        cancellation,
        previewToken: cancellation.ok ? signCancellationPreview(lease.id, cancellation) : '',
        previewExpiresInSeconds: cancellation.ok ? PREVIEW_TTL_MS / 1000 : 0,
      })
    } catch (cancellationError) {
      console.error('Stripe cancellation preview failed', safeText(cancellationError?.code || cancellationError?.name || 'unknown', 80))
      return json({ ok: false, error: safeText(cancellationError?.message, 180) || 'Cancellation status could not be inspected.' }, 502)
    }
  }

  if (['cancel-client-at-renewal', 'undo-client-cancellation'].includes(action)) {
    const scheduling = action === 'cancel-client-at-renewal'
    const requiredConfirmation = scheduling ? CANCEL_CONFIRMATION : UNDO_CANCEL_CONFIRMATION
    if (safeText(body?.confirmation, 80) !== requiredConfirmation) {
      return json({ ok: false, error: `Type ${requiredConfirmation} to continue.` }, 400)
    }
    const requestId = safeText(body?.requestId, 100).replace(/[^a-zA-Z0-9_-]/g, '')
    if (requestId.length < 8) return json({ ok: false, error: 'A valid request ID is required.' }, 400)
    let approved
    try {
      approved = verifyPreview(body?.previewToken)
      if (approved.kind !== 'lease-cancellation') throw new Error('Cancellation preview token is invalid')
    } catch (previewError) {
      return json({ ok: false, error: safeText(previewError.message, 160) }, 400)
    }
    const lease = activeLease(body?.leaseId)
    if (!lease || lease.id !== approved.leaseId || !lease.stripeSubscriptionId) {
      return json({ ok: false, error: 'Active client subscription not found.' }, 404)
    }
    const kind = scheduling ? 'client-cancellation-scheduled' : 'client-cancellation-removed'
    const prior = syncState().runs.find(run => run.requestId === requestId)
    if (prior) {
      if (prior.kind !== kind || prior.leaseId !== lease.id || prior.fingerprint !== approved.fingerprint) {
        return json({ ok: false, error: 'This request ID was already used for a different operation.' }, 409)
      }
      return json({ ok: true, idempotent: true, result: prior.result })
    }
    try {
      const current = await cancellationPreview(stripe, lease)
      if (!current.ok || sha(current) !== approved.fingerprint) {
        return json({ ok: false, error: 'The Stripe subscription changed after preview. Preview cancellation again.' }, 409)
      }
      if (scheduling && !current.canSchedule) return json({ ok: false, error: 'Cancellation is already scheduled.' }, 409)
      if (!scheduling && !current.canUndo) return json({ ok: false, error: 'This subscription is not scheduled to cancel.' }, 409)

      const params = { cancel_at_period_end: scheduling }
      const updated = await stripe.subscriptions.update(lease.stripeSubscriptionId, params, {
        idempotencyKey: `fcc_billing:${scheduling ? 'cancel_at_renewal' : 'keep_active'}:${sha({ leaseId: lease.id, requestId, fingerprint: approved.fingerprint }).slice(0, 48)}`,
      })
      const status = safeText(updated?.status || current.status, 40)
      const effectiveAt = isoFromStripeSeconds(updated?.current_period_end) || current.currentPeriodEnd
      const result = {
        ok: ['active', 'trialing'].includes(status),
        applied: true,
        leaseId: lease.id,
        status,
        cancelAtPeriodEnd: updated?.cancel_at_period_end === true,
        currentPeriodEnd: effectiveAt,
        canSchedule: updated?.cancel_at_period_end !== true,
        canUndo: updated?.cancel_at_period_end === true,
        errors: [],
      }
      if (result.cancelAtPeriodEnd !== scheduling) {
        return json({ ok: false, error: 'Stripe did not confirm the requested renewal setting.' }, 502)
      }
      const actor = user?.name || user?.email || user?.id || 'Command Center owner'
      rememberCancellationEvidence({
        leaseId: lease.id,
        cancelAtPeriodEnd: scheduling,
        effectiveAt,
        actor,
        requestId,
      })
      rememberLeaseAttempt({
        requestId,
        kind,
        leaseId: lease.id,
        fingerprint: approved.fingerprint,
        result,
        actor,
      })
      try {
        logAuditEvent({
          request,
          user,
          action: scheduling ? 'stripe_subscription_cancel_at_period_end_scheduled' : 'stripe_subscription_cancel_at_period_end_removed',
          area: 'billing',
          severity: scheduling ? 'warning' : 'info',
          targetId: lease.id,
          targetName: lease.tenantName || lease.clientAccountId || lease.id,
          meta: {
            requestId,
            cancelAtPeriodEnd: scheduling,
            effectiveAt,
            immediateCancellation: false,
            proration: false,
            refund: false,
          },
        })
      } catch {}
      return json({ ok: true, idempotent: false, result })
    } catch (cancellationError) {
      console.error('Stripe cancellation schedule update failed', safeText(cancellationError?.code || cancellationError?.name || 'unknown', 80))
      return json({ ok: false, error: 'The renewal setting was not changed. Preview it again before retrying.' }, 502)
    }
  }

  if (action === 'preview-client-subscription') {
    const lease = activeLease(body?.leaseId)
    if (!lease) return json({ ok: false, error: 'Active client lease not found.' }, 404)
    try {
      const definitions = getRuntimeStripeBillingCatalogDefinitions()
      const plan = publicLeasePlan(await previewLeaseStripeSubscription({ stripe, definitions, lease }))
      const canApply = plan.ok
        && !plan.checkoutRequired
        && plan.errors.length === 0
        && (plan.summary.add + plan.summary.replace + plan.summary.remove) > 0
      const canCreateCheckout = plan.ok && plan.checkoutRequired && plan.errors.length === 0
      return json({
        ok: true,
        lease: clientSubscriptionRecords().find(client => client.leaseId === lease.id) || { leaseId: lease.id },
        plan,
        canApply,
        canCreateCheckout,
        previewToken: plan.ok ? signLeasePreview(lease.id, plan) : '',
        previewExpiresInSeconds: plan.ok ? PREVIEW_TTL_MS / 1000 : 0,
      })
    } catch (leaseError) {
      console.error('Stripe client subscription preview failed', safeText(leaseError?.code || leaseError?.name || 'unknown', 80))
      return json({ ok: false, error: 'This client subscription could not be inspected. No changes were made.' }, 502)
    }
  }

  if (action === 'update-client-subscription') {
    if (safeText(body?.confirmation, 80) !== LEASE_CONFIRMATION) {
      return json({ ok: false, error: `Type ${LEASE_CONFIRMATION} to continue.` }, 400)
    }
    if ((body?.existingSubscriptions?.mode || '') !== 'immediate_no_proration'
      || body?.existingSubscriptions?.prorationBehavior !== 'none') {
      return json({ ok: false, error: 'Client subscription items update immediately and must use no proration.' }, 400)
    }
    const requestId = safeText(body?.requestId, 100).replace(/[^a-zA-Z0-9_-]/g, '')
    if (requestId.length < 8) return json({ ok: false, error: 'A valid request ID is required.' }, 400)
    let approved
    try {
      approved = verifyPreview(body?.previewToken)
      if (approved.kind !== 'lease-subscription') throw new Error('Client subscription preview token is invalid')
    } catch (previewError) {
      return json({ ok: false, error: safeText(previewError.message, 160) }, 400)
    }
    const lease = activeLease(body?.leaseId)
    if (!lease || lease.id !== approved.leaseId) return json({ ok: false, error: 'Active client lease not found.' }, 404)
    const prior = syncState().runs.find(run => run.requestId === requestId)
    if (prior) {
      if (prior.kind !== 'client-subscription-update'
        || prior.leaseId !== lease.id
        || prior.fingerprint !== approved.fingerprint) {
        return json({ ok: false, error: 'This request ID was already used for a different operation.' }, 409)
      }
      return json({ ok: true, idempotent: true, result: prior.result })
    }
    try {
      const definitions = getRuntimeStripeBillingCatalogDefinitions()
      const current = publicLeasePlan(await previewLeaseStripeSubscription({ stripe, definitions, lease }))
      if (!current.ok || current.planHash !== approved.planHash || sha(current) !== approved.fingerprint) {
        return json({ ok: false, error: 'The client lease or Stripe subscription changed after preview. Preview again before updating.' }, 409)
      }
      const result = publicLeasePlan(await updateLeaseStripeSubscription({
        stripe,
        definitions,
        lease,
        apply: true,
        confirmPlanHash: approved.planHash,
      }))
      const actor = user?.name || user?.email || user?.id || 'Command Center owner'
      rememberLeaseAttempt({
        requestId,
        kind: 'client-subscription-update',
        leaseId: lease.id,
        fingerprint: approved.fingerprint,
        result,
        actor,
      })
      try {
        logAuditEvent({
          request,
          user,
          action: result.ok && result.applied ? 'stripe_client_subscription_updated' : 'stripe_client_subscription_update_failed',
          area: 'billing',
          severity: result.ok && result.applied ? 'info' : 'warning',
          targetId: lease.id,
          targetName: lease.tenantName || lease.clientAccountId || lease.id,
          meta: {
            requestId,
            catalogHash: result.catalogHash,
            planHash: result.planHash,
            summary: result.summary,
            updateTiming: 'immediate',
            prorationBehavior: 'none',
          },
        })
      } catch {}
      return json({ ok: result.ok && result.applied, idempotent: false, result }, result.ok && result.applied ? 200 : 409)
    } catch (leaseError) {
      console.error('Stripe client subscription update failed', safeText(leaseError?.code || leaseError?.name || 'unknown', 80))
      return json({ ok: false, error: 'The client subscription was not updated. Preview again before retrying.' }, 502)
    }
  }

  if (action === 'create-client-billing-setup') {
    if (safeText(body?.confirmation, 80) !== CHECKOUT_CONFIRMATION || body?.customerConsent !== true) {
      return json({ ok: false, error: `Confirm customer consent and type ${CHECKOUT_CONFIRMATION} to continue.` }, 400)
    }
    const requestId = safeText(body?.requestId, 100).replace(/[^a-zA-Z0-9_-]/g, '')
    if (requestId.length < 8) return json({ ok: false, error: 'A valid request ID is required.' }, 400)
    let approved
    try {
      approved = verifyPreview(body?.previewToken)
      if (approved.kind !== 'lease-subscription') throw new Error('Client subscription preview token is invalid')
    } catch (previewError) {
      return json({ ok: false, error: safeText(previewError.message, 160) }, 400)
    }
    const lease = activeLease(body?.leaseId)
    if (!lease || lease.id !== approved.leaseId) return json({ ok: false, error: 'Active client lease not found.' }, 404)
    if (lease.stripeSubscriptionId) return json({ ok: false, error: 'This client already has a Stripe subscription.' }, 409)
    const publishableKey = stripePublishableKey()
    if (!publishableKey) return json({ ok: false, error: 'Stripe publishable key is not configured.' }, 503)
    try {
      const definitions = getRuntimeStripeBillingCatalogDefinitions()
      const current = publicLeasePlan(await previewLeaseStripeSubscription({ stripe, definitions, lease }))
      if (!current.ok
        || !current.checkoutRequired
        || current.planHash !== approved.planHash
        || sha(current) !== approved.fingerprint) {
        return json({ ok: false, error: 'The client lease or Stripe catalog changed after preview. Preview again before creating billing setup.' }, 409)
      }
      const account = accountForLease(lease)
      const origin = safeText(process.env.CRM_PUBLIC_URL, 300).startsWith('https://')
        ? safeText(process.env.CRM_PUBLIC_URL, 300).replace(/\/$/, '')
        : 'https://crm.company.example.com'
      const checkoutNonce = existingLeaseCheckoutNonce({
        leaseId: lease.id,
        requestId,
        planHash: current.planHash,
      })
      const reservation = reserveExistingLeaseSubscriptionCheckout({
        leaseId: lease.id,
        accountId: lease.clientAccountId,
        tenantId: lease.tenantId,
        tierId: lease.tierId,
        planHash: current.planHash,
        requestId,
        checkoutNonce,
      })
      if (!reservation.ok) {
        const message = reservation.code === 'checkout_in_progress'
          ? 'Another billing setup is already in progress for this client.'
          : 'This lease is not eligible for initial Stripe billing setup.'
        return json({ ok: false, error: message, code: reservation.code }, 409)
      }
      const checkout = await createLeaseStripeCheckoutSession({
        stripe,
        definitions,
        lease,
        customerEmail: safeText(account?.billingEmail || account?.email || account?.contactEmail, 240),
        returnUrl: `${origin}/?tab=products&stripe_setup=complete&session_id={CHECKOUT_SESSION_ID}`,
        requestId,
        checkoutNonce,
        customerConsent: true,
      })
      if (!checkout?.clientSecret) throw new Error('Embedded checkout was not created')
      const binding = bindExistingLeaseSubscriptionCheckoutSession({
        leaseId: lease.id,
        requestId,
        checkoutNonce,
        sessionId: checkout.sessionId,
      })
      if (!binding.ok) throw new Error('Embedded checkout could not be bound to the client lease')
      const actor = user?.name || user?.email || user?.id || 'Command Center owner'
      rememberLeaseAttempt({
        requestId,
        kind: 'client-billing-setup',
        leaseId: lease.id,
        fingerprint: approved.fingerprint,
        result: {
          ok: true,
          catalogHash: current.catalogHash,
          planHash: checkout.planHash,
          summary: current.summary,
          monthlyAmountCents: checkout.monthlyAmountCents,
        },
        actor,
      })
      try {
        logAuditEvent({
          request,
          user,
          action: 'stripe_client_billing_setup_created',
          area: 'billing',
          severity: 'info',
          targetId: lease.id,
          targetName: lease.tenantName || lease.clientAccountId || lease.id,
          meta: {
            requestId,
            catalogHash: current.catalogHash,
            planHash: checkout.planHash,
            monthlyAmountCents: checkout.monthlyAmountCents,
            customerConsent: true,
          },
        })
      } catch {}
      return json({
        ok: true,
        checkout: {
          clientSecret: checkout.clientSecret,
          publishableKey,
          monthlyAmountCents: checkout.monthlyAmountCents,
          planHash: checkout.planHash,
          leaseId: lease.id,
        },
      })
    } catch (checkoutError) {
      console.error('Stripe client billing setup failed', safeText(checkoutError?.code || checkoutError?.name || 'unknown', 80))
      return json({ ok: false, error: safeText(checkoutError?.message, 220) || 'Client billing setup was not created.' }, 502)
    }
  }

  if (action === 'preview-existing-subscriptions') {
    if ((body?.existingSubscriptions?.mode || '') !== 'immediate_no_proration'
      || body?.existingSubscriptions?.prorationBehavior !== 'none') {
      return json({ ok: false, error: 'Subscription items update immediately and must use no proration.' }, 400)
    }
    try {
      const definitions = getRuntimeStripeBillingCatalogDefinitions()
      const migration = publicMigration(await previewStripeSubscriptionMigrations({ stripe, definitions }))
      const canApply = migration.ok && migration.summary.errors === 0 && migration.summary.items > 0
      return json({
        ok: true,
        ...migration,
        canApply,
        previewToken: canApply ? signMigrationPreview(migration) : '',
        previewExpiresInSeconds: canApply ? PREVIEW_TTL_MS / 1000 : 0,
      })
    } catch (migrationError) {
      console.error('Stripe subscription migration preview failed', safeText(migrationError?.code || migrationError?.name || 'unknown', 80))
      return json({ ok: false, error: 'Existing subscriptions could not be inspected. No changes were made.' }, 502)
    }
  }

  if (action === 'migrate-existing-subscriptions') {
    if (safeText(body?.confirmation, 80) !== MIGRATION_CONFIRMATION) {
      return json({ ok: false, error: `Type ${MIGRATION_CONFIRMATION} to continue.` }, 400)
    }
    if ((body?.existingSubscriptions?.mode || '') !== 'immediate_no_proration'
      || body?.existingSubscriptions?.prorationBehavior !== 'none') {
      return json({ ok: false, error: 'Subscription items update immediately and must use no proration.' }, 400)
    }
    const requestId = safeText(body?.requestId, 100).replace(/[^a-zA-Z0-9_-]/g, '')
    if (requestId.length < 8) return json({ ok: false, error: 'A valid request ID is required.' }, 400)

    let approved
    try {
      approved = verifyPreview(body?.previewToken)
      if (approved.kind !== 'subscription-migration') throw new Error('Subscription migration preview token is invalid')
    } catch (previewError) {
      return json({ ok: false, error: safeText(previewError.message, 160) }, 400)
    }

    const prior = syncState().runs.find(run => run.requestId === requestId)
    if (prior) {
      if (prior.kind !== 'subscription-migration' || prior.fingerprint !== approved.fingerprint) {
        return json({ ok: false, error: 'This request ID was already used for a different operation.' }, 409)
      }
      return json({ ok: true, idempotent: true, result: prior.result })
    }

    try {
      const definitions = getRuntimeStripeBillingCatalogDefinitions()
      const current = publicMigration(await previewStripeSubscriptionMigrations({ stripe, definitions }))
      if (!current.ok
        || current.catalogHash !== approved.catalogHash
        || migrationFingerprint(current) !== approved.fingerprint) {
        return json({ ok: false, error: 'Subscriptions or the billing catalog changed after preview. Preview again before migrating.' }, 409)
      }
      const result = publicMigration(await syncStripeSubscriptionMigrations({
        stripe,
        definitions,
        migrateExisting: true,
        confirmCatalogHash: approved.catalogHash,
      }))
      const actor = user?.name || user?.email || user?.id || 'Command Center owner'
      rememberMigrationAttempt({ requestId, fingerprint: approved.fingerprint, result, actor })
      try {
        logAuditEvent({
          request,
          user,
          action: result.ok ? 'stripe_subscriptions_migrated' : 'stripe_subscription_migration_failed',
          area: 'billing',
          severity: result.ok ? 'info' : 'warning',
          targetId: result.catalogHash.slice(0, 16),
          targetName: 'Stripe subscription migration',
          meta: {
            requestId,
            catalogHash: result.catalogHash,
            catalogVersion: result.catalogVersion,
            summary: result.summary,
            updateTiming: 'immediate',
            prorationBehavior: 'none',
          },
        })
      } catch {}
      return json({ ok: result.ok, idempotent: false, result }, result.ok ? 200 : 409)
    } catch (migrationError) {
      console.error('Stripe subscription migration failed', safeText(migrationError?.code || migrationError?.name || 'unknown', 80))
      return json({ ok: false, error: 'Existing subscriptions were not migrated. Preview again before retrying.' }, 502)
    }
  }

  if (safeText(body?.confirmation, 80) !== CONFIRMATION) {
    return json({ ok: false, error: `Type ${CONFIRMATION} to continue.` }, 400)
  }
  const requestId = safeText(body?.requestId, 100).replace(/[^a-zA-Z0-9_-]/g, '')
  if (requestId.length < 8) return json({ ok: false, error: 'A valid request ID is required.' }, 400)
  if ((body?.existingSubscriptions?.mode || 'none') !== 'none') {
    return json({
      ok: false,
      error: 'Existing subscription migration is a separate reviewed operation and is not part of catalog updates.',
    }, 409)
  }

  let approved
  try {
    approved = verifyPreview(body?.previewToken)
  } catch (previewError) {
    return json({ ok: false, error: safeText(previewError.message, 160) }, 400)
  }

  const prior = syncState().runs.find(run => run.requestId === requestId)
  if (prior) {
    if (prior.fingerprint !== approved.fingerprint) {
      return json({ ok: false, error: 'This request ID was already used for a different catalog preview.' }, 409)
    }
    return json({ ok: true, idempotent: true, result: prior.result, lastSync: syncState().lastSync })
  }

  try {
    const currentPreview = await preview(stripe)
    if (!currentPreview.canApply
      || currentPreview.plan.catalogHash !== approved.catalogHash
      || planFingerprint(currentPreview.plan) !== approved.fingerprint) {
      return json({ ok: false, error: 'The backend catalog or Stripe changed after preview. Preview again before updating.' }, 409)
    }

    const applied = publicResult(
      await syncStripeBillingCatalog({
        stripe,
        apply: true,
        definitions: getRuntimeStripeBillingCatalogDefinitions(),
      }),
      currentPreview.plan.catalogHash,
    )
    const actor = user?.name || user?.email || user?.id || 'Command Center owner'
    const record = rememberAttempt({
      requestId,
      fingerprint: approved.fingerprint,
      result: applied,
      actor,
    })

    try {
      logAuditEvent({
        request,
        user,
        action: applied.ok ? 'stripe_catalog_updated' : 'stripe_catalog_update_failed',
        area: 'billing',
        severity: applied.ok ? 'info' : 'warning',
        targetId: applied.catalogHash.slice(0, 16),
        targetName: `Stripe billing catalog ${applied.catalogVersion || ''}`.trim(),
        meta: {
          requestId,
          catalogHash: applied.catalogHash,
          catalogVersion: applied.catalogVersion,
          summary: applied.summary,
          existingSubscriptions: 'unchanged',
        },
      })
    } catch {}

    return json({
      ok: applied.ok,
      idempotent: false,
      result: applied,
      lastSync: record.status === 'synced' ? syncState().lastSync : syncState().lastSync,
    }, applied.ok ? 200 : 409)
  } catch (applyError) {
    console.error('Stripe catalog apply failed', safeText(applyError?.code || applyError?.name || 'unknown', 80))
    return json({ ok: false, error: 'Stripe catalog was not updated. Preview again before retrying.' }, 502)
  }
}
