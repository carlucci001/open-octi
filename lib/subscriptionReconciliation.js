import {
  normalizeImportKey,
  subscriptionMatchKey,
} from './subscriptionImport'

const COMPARISON_FIELDS = [
  'amount',
  'currency',
  'frequency',
  'billingType',
  'billingDayOfMonth',
  'lastChargeDate',
  'nextDue',
  'status',
  'paymentMethod',
  'businessEntity',
  'projectOrProduct',
  'minObservedAmount',
  'maxObservedAmount',
  'avgMonthlyAmount',
  'lastChargeAmount',
  'sourceReceiptId',
]

function addIndex(existing, index) {
  return existing ? [...existing, index] : [index]
}

function indexedSubscriptions(subscriptions) {
  const byFullKey = new Map()
  const byReceipt = new Map()
  const byVendorProduct = new Map()
  const byVendorMethod = new Map()
  const byVendor = new Map()

  subscriptions.forEach((subscription, index) => {
    indexSubscription(subscription, index, { byFullKey, byReceipt, byVendorProduct, byVendorMethod, byVendor })
  })

  return { byFullKey, byReceipt, byVendorProduct, byVendorMethod, byVendor }
}

function indexSubscription(subscription, index, maps) {
  const vendor = normalizeImportKey(subscription.vendor)
  const product = normalizeImportKey(subscription.productOrPlan)
  const method = normalizeImportKey(subscription.paymentMethod)
  const receipt = normalizeImportKey(subscription.sourceReceiptId)
  const fullKey = subscriptionMatchKey(subscription)

  if (fullKey.replace(/\|/g, '')) maps.byFullKey.set(fullKey, index)
  if (receipt) maps.byReceipt.set(receipt, index)
  if (vendor && product) maps.byVendorProduct.set(`${vendor}|${product}`, addIndex(maps.byVendorProduct.get(`${vendor}|${product}`), index))
  if (vendor && method) maps.byVendorMethod.set(`${vendor}|${method}`, addIndex(maps.byVendorMethod.get(`${vendor}|${method}`), index))
  if (vendor) maps.byVendor.set(vendor, addIndex(maps.byVendor.get(vendor), index))
}

function singleMatch(list) {
  return Array.isArray(list) && list.length === 1 ? list[0] : null
}

function findMatch(subscription, indexes) {
  const vendor = normalizeImportKey(subscription.vendor)
  const product = normalizeImportKey(subscription.productOrPlan)
  const method = normalizeImportKey(subscription.paymentMethod)
  const receipt = normalizeImportKey(subscription.sourceReceiptId)
  const fullKey = subscriptionMatchKey(subscription)

  if (receipt && indexes.byReceipt.has(receipt)) {
    return { index: indexes.byReceipt.get(receipt), confidence: 'strong', reason: 'receipt/invoice id' }
  }

  if (fullKey.replace(/\|/g, '') && indexes.byFullKey.has(fullKey)) {
    return { index: indexes.byFullKey.get(fullKey), confidence: 'strong', reason: 'vendor, plan, and payment method' }
  }

  const vendorProduct = singleMatch(indexes.byVendorProduct.get(`${vendor}|${product}`))
  if (vendorProduct !== null) {
    return { index: vendorProduct, confidence: 'strong', reason: 'vendor and plan' }
  }

  const vendorMethod = singleMatch(indexes.byVendorMethod.get(`${vendor}|${method}`))
  if (vendorMethod !== null) {
    return { index: vendorMethod, confidence: 'medium', reason: 'vendor and payment method' }
  }

  const vendorOnly = indexes.byVendor.get(vendor)
  if (Array.isArray(vendorOnly) && vendorOnly.length > 1) {
    return { index: null, confidence: 'review', reason: 'multiple subscriptions for this vendor' }
  }

  if (Array.isArray(vendorOnly) && vendorOnly.length === 1) {
    return { index: vendorOnly[0], confidence: 'review', reason: 'vendor only' }
  }

  return { index: null, confidence: 'new', reason: 'no existing match' }
}

function valuesEqual(a, b) {
  if (a == null || a === '') return b == null || b === ''
  if (b == null || b === '') return false
  if (typeof a === 'number' || typeof b === 'number') return Number(a) === Number(b)
  return String(a) === String(b)
}

function patchFromComparison(existing, incoming) {
  const patch = {}
  const changes = []

  for (const field of COMPARISON_FIELDS) {
    const next = incoming[field]
    if (next == null || next === '') continue
    if (valuesEqual(existing[field], next)) continue
    patch[field] = next
    changes.push({
      field,
      from: existing[field] ?? null,
      to: next,
    })
  }

  if (incoming.notes) {
    const currentNotes = String(existing.notes || '')
    if (!currentNotes.includes(incoming.notes)) {
      patch.notes = currentNotes ? `${currentNotes}\n${incoming.notes}` : incoming.notes
      changes.push({ field: 'notes', from: currentNotes || null, to: patch.notes })
    }
  }

  return { patch, changes }
}

function resultSummary(items) {
  return items.reduce((acc, item) => {
    acc[item.action] = (acc[item.action] || 0) + 1
    return acc
  }, { suggested_create: 0, suggested_update: 0, unchanged: 0, needs_review: 0, skipped: 0 })
}

export function reconcileSubscriptionRecords(existingSubscriptions, parsedRecords, { now = new Date() } = {}) {
  const indexes = indexedSubscriptions(existingSubscriptions)
  const previewedAt = now.toISOString()
  const items = []

  for (const record of parsedRecords) {
    if (!record.ok) {
      items.push({
        action: 'skipped',
        row: record.rowNumber,
        error: record.error,
      })
      continue
    }

    const incoming = record.subscription
    const match = findMatch(incoming, indexes)

    if (match.confidence === 'review') {
      items.push({
        action: 'needs_review',
        row: record.rowNumber,
        vendor: incoming.vendor,
        productOrPlan: incoming.productOrPlan,
        amount: incoming.amount,
        confidence: match.confidence,
        reason: match.reason,
        matchedSubscriptionId: match.index === null ? null : existingSubscriptions[match.index]?.id,
      })
      continue
    }

    if (match.index === null) {
      items.push({
        action: 'suggested_create',
        row: record.rowNumber,
        matchedSubscriptionId: null,
        vendor: incoming.vendor,
        productOrPlan: incoming.productOrPlan,
        amount: incoming.amount,
        confidence: match.confidence,
        reason: match.reason,
        suggestion: incoming,
      })
      continue
    }

    const existing = existingSubscriptions[match.index]
    const { patch, changes } = patchFromComparison(existing, incoming)

    if (changes.length === 0) {
      items.push({
        action: 'unchanged',
        row: record.rowNumber,
        id: existing.id,
        matchedSubscriptionId: existing.id,
        vendor: existing.vendor,
        productOrPlan: existing.productOrPlan,
        reason: match.reason,
        confidence: match.confidence,
      })
      continue
    }

    items.push({
      action: 'suggested_update',
      row: record.rowNumber,
      id: existing.id,
      matchedSubscriptionId: existing.id,
      vendor: existing.vendor,
      productOrPlan: existing.productOrPlan,
      reason: match.reason,
      confidence: match.confidence,
      changes,
      patch,
    })
  }

  return {
    previewedAt,
    items,
    summary: resultSummary(items),
  }
}
