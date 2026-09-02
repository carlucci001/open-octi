import { loadAll, saveAll } from './entityStore'
import { readData, writeData } from './dataStore'
import { buildFccRevenue } from './platform-admin/fccResources'
import { callPlatformAdminResource } from './platforms/adminClient'
import { listPlatforms, platformSupportsCapability } from './platforms/registry'
import { queryUsage } from './usage-events'

const SETTINGS_FILE = 'money-settings.json'
export const DEFAULT_DUNNING_PROPOSAL_DAYS = 7

function amount(value) {
  const number = Number(value)
  return Number.isFinite(number) ? Number(number.toFixed(2)) : 0
}

function cleanText(value, fallback = '') {
  return String(value ?? fallback).trim()
}

function safeRevenue(row = {}) {
  return {
    currency: cleanText(row.currency, 'USD').toUpperCase(),
    mrr: amount(row.mrr),
    newMrr: amount(row.newMrr),
    churnedMrr: amount(row.churnedMrr),
    failedPayments: Math.max(0, Math.round(Number(row.failedPayments) || 0)),
    trials: {
      started: Math.max(0, Math.round(Number(row.trials?.started) || 0)),
      converted: Math.max(0, Math.round(Number(row.trials?.converted) || 0)),
    },
  }
}

export function moneyPeriod(periodKey, now = new Date()) {
  const match = String(periodKey || '').match(/^(\d{4})-(0[1-9]|1[0-2])$/)
  const year = match ? Number(match[1]) : now.getUTCFullYear()
  const month = match ? Number(match[2]) - 1 : now.getUTCMonth()
  const from = new Date(Date.UTC(year, month, 1))
  const to = new Date(Date.UTC(year, month + 1, 1))
  return { key: `${year}-${String(month + 1).padStart(2, '0')}`, from: from.toISOString(), to: to.toISOString() }
}

function usageMap(rows = []) {
  return new Map(rows.map(row => [String(row.key || 'unknown'), row]))
}

function usageCost(row) {
  if (!row) return { value: 0, unknown: false }
  if (row.unknown || Number(row.unknownEvents) > 0) return { value: 'unknown', unknown: true }
  return { value: amount(row.estCostUsd), unknown: false }
}

export function buildMoneySnapshot({ period, capturedAt = new Date().toISOString(), revenueRows = [], usageByProduct = [], usageByClient = [], clientRevenue = [], dunningCandidates = [] } = {}) {
  const normalizedPeriod = period || moneyPeriod()
  const productUsage = usageMap(usageByProduct)
  const products = revenueRows.map(input => {
    const revenue = safeRevenue(input)
    const cost = usageCost(productUsage.get(String(input.productId || 'unknown')))
    return {
      productId: cleanText(input.productId, 'unknown'),
      name: cleanText(input.name, input.productId || 'Unknown product'),
      available: input.available !== false,
      ...(input.error ? { error: cleanText(input.error) } : {}),
      ...revenue,
      attributedCostUsd: cost.value,
      marginUsd: cost.unknown ? 'unknown' : amount(revenue.mrr - cost.value),
      marginUnknown: cost.unknown,
    }
  })

  const allCosts = usageByProduct.map(usageCost)
  const portfolioMarginUnknown = allCosts.some(cost => cost.unknown)
  const knownCost = amount(allCosts.reduce((sum, cost) => sum + (cost.unknown ? 0 : cost.value), 0))
  const currencies = [...new Set(products.filter(product => product.available).map(product => product.currency))]
  const totals = products.reduce((sum, product) => ({
    mrr: amount(sum.mrr + product.mrr),
    newMrr: amount(sum.newMrr + product.newMrr),
    churnedMrr: amount(sum.churnedMrr + product.churnedMrr),
    failedPayments: sum.failedPayments + product.failedPayments,
    trials: {
      started: sum.trials.started + product.trials.started,
      converted: sum.trials.converted + product.trials.converted,
    },
  }), { mrr: 0, newMrr: 0, churnedMrr: 0, failedPayments: 0, trials: { started: 0, converted: 0 } })

  const clientUsage = usageMap(usageByClient)
  const clientRevenueMap = new Map(clientRevenue.map(row => [String(row.clientId || 'unknown'), row]))
  const clientIds = [...new Set([...clientUsage.keys(), ...clientRevenueMap.keys()])]
  const clients = clientIds.map(clientId => {
    const cost = usageCost(clientUsage.get(clientId))
    const revenueRow = clientRevenueMap.get(clientId)
    const revenueUsd = revenueRow ? amount(revenueRow.revenueUsd) : 'unknown'
    return {
      clientId,
      name: cleanText(revenueRow?.name, clientId),
      attributedCostUsd: cost.value,
      revenueUsd,
      marginUsd: revenueUsd === 'unknown' || cost.unknown ? 'unknown' : amount(revenueUsd - cost.value),
      marginUnknown: revenueUsd === 'unknown' || cost.unknown,
    }
  })

  return {
    id: `revenue-${normalizedPeriod.key}`,
    periodKey: normalizedPeriod.key,
    period: { from: normalizedPeriod.from, to: normalizedPeriod.to },
    capturedAt,
    portfolio: {
      currency: currencies.length === 1 ? currencies[0] : currencies.length ? 'MIXED' : 'USD',
      ...totals,
      attributedCostUsd: portfolioMarginUnknown ? 'unknown' : knownCost,
      marginUsd: portfolioMarginUnknown ? 'unknown' : amount(totals.mrr - knownCost),
      marginUnknown: portfolioMarginUnknown,
    },
    products,
    clients,
    dunningCandidates,
  }
}

export function upsertMonthlySnapshot(snapshots = [], snapshot) {
  return [snapshot, ...snapshots.filter(row => row.periodKey !== snapshot.periodKey)]
    .sort((a, b) => String(b.periodKey).localeCompare(String(a.periodKey)))
}

export function getMoneySettings() {
  const stored = readData(SETTINGS_FILE) || {}
  const days = Number(stored.dunningProposalDays)
  return { dunningProposalDays: Number.isFinite(days) && days >= 1 && days <= 90 ? Math.round(days) : DEFAULT_DUNNING_PROPOSAL_DAYS }
}

export function saveMoneySettings(input = {}) {
  const days = Number(input.dunningProposalDays)
  if (!Number.isFinite(days) || days < 1 || days > 90) throw new Error('Dunning proposal days must be between 1 and 90.')
  const settings = { dunningProposalDays: Math.round(days), updatedAt: new Date().toISOString() }
  writeData(SETTINGS_FILE, settings)
  return settings
}

function failedLease(lease = {}) {
  const subscription = cleanText(lease.stripeSubscriptionStatus || lease.status).toLowerCase()
  const billing = cleanText(lease.billingStatus).toLowerCase()
  return ['past_due', 'unpaid'].includes(subscription) || billing === 'payment_failed'
}

export function buildDunningCandidates({ leases = [], accounts = [], now = new Date().toISOString(), proposalDays = DEFAULT_DUNNING_PROPOSAL_DAYS, platformId = 'farrington-command-center', productName = 'Command Center' } = {}) {
  const nowMs = Date.parse(now)
  const accountMap = new Map(accounts.map(account => [account.id, account]))
  return leases.filter(failedLease).map(lease => {
    const account = accountMap.get(lease.accountId || lease.clientId) || {}
    const failedAt = lease.paymentFailedAt || lease.updatedAt || lease.createdAt || now
    const ageDays = Math.max(0, Math.floor((nowMs - Date.parse(failedAt || now)) / 86_400_000))
    return {
      id: String(lease.id),
      platformId,
      productName,
      targetId: String(lease.accountId || lease.clientId || lease.id),
      clientName: cleanText(lease.accountName || lease.clientName || account.name, 'Customer'),
      email: cleanText(lease.email || lease.contactEmail || account.email),
      failedAt,
      ageDays,
      pauseProposed: ageDays >= proposalDays,
      automatic: false,
    }
  })
}

export function buildFccClientRevenue({ leases = [], accounts = [], pricing = { tiers: [] } } = {}) {
  const accountMap = new Map(accounts.map(account => [String(account.id), account]))
  const totals = new Map()
  for (const lease of leases) {
    const status = cleanText(lease.stripeSubscriptionStatus || lease.status).toLowerCase()
    if (!['active', 'trialing'].includes(status)) continue
    const clientId = cleanText(lease.accountId || lease.clientId)
    if (!clientId) continue
    const tier = (pricing.tiers || []).find(item => item.id === lease.tierId || item.id === lease.planId || item.name === lease.tierName)
    const fee = amount(lease.monthlyFee ?? lease.tierMonthlyFee ?? lease.priceMonthly ?? tier?.monthlyFee ?? 0)
    const current = totals.get(clientId) || { clientId, name: cleanText(lease.accountName || lease.clientName || accountMap.get(clientId)?.name, clientId), revenueUsd: 0 }
    current.revenueUsd = amount(current.revenueUsd + fee)
    totals.set(clientId, current)
  }
  return [...totals.values()].sort((a, b) => b.revenueUsd - a.revenueUsd || a.name.localeCompare(b.name))
}

function replaceTemplate(value, candidate) {
  return cleanText(value)
    .replaceAll('{company}', candidate.clientName || 'your team')
    .replaceAll('{contact}', candidate.clientName || 'there')
    .replaceAll('{brand}', candidate.productName || 'Farrington Development')
}

export function buildDunningHandoffPayload(candidate = {}, template = {}) {
  const subject = replaceTemplate(template.subject || 'Payment method update for {company}', candidate)
  const body = replaceTemplate(template.body || 'Hi {contact},\n\nPlease update the payment method for {company}.', candidate)
  return {
    action: 'start',
    fromAgentId: 'money-console',
    complexity: 'light',
    outputFormat: 'email subject and body',
    wait: 120,
    task: 'Draft only a concise, courteous failed-payment email from the supplied template. Never send it, never claim it was sent, and preserve the factual payment details. Carl must approve it in Comms.',
    context: `Product: ${candidate.productName || 'Unknown'}\nCustomer: ${candidate.clientName || 'Customer'}\nRecipient: ${candidate.email || 'Unknown'}\nPayment failed: ${candidate.failedAt || 'Unknown'}\nTemplate subject: ${subject}\nTemplate body:\n${body}`,
  }
}

function csvCell(value) {
  const text = String(value ?? '')
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export function moneySnapshotCsv(snapshot = {}) {
  const headers = ['period', 'product_id', 'product_name', 'currency', 'mrr', 'new_mrr', 'churned_mrr', 'failed_payments', 'trials_started', 'trials_converted', 'attributed_cost_usd', 'margin_usd']
  const rows = (snapshot.products || []).map(product => {
    const unavailable = product.available === false ? 'unknown' : null
    return [snapshot.periodKey, product.productId, product.name, product.currency, unavailable ?? product.mrr, unavailable ?? product.newMrr, unavailable ?? product.churnedMrr, unavailable ?? product.failedPayments, unavailable ?? (product.trials?.started || 0), unavailable ?? (product.trials?.converted || 0), product.attributedCostUsd, unavailable ?? product.marginUsd]
  })
  return [headers, ...rows].map(row => row.map(csvCell).join(',')).join('\n')
}

export async function pollMoneyConsole({ periodKey, bypassCache = false } = {}) {
  const period = moneyPeriod(periodKey)
  const capturedAt = new Date().toISOString()
  const platforms = listPlatforms()
  const fcc = platforms.find(platform => platform.platformId === 'farrington-command-center')
  const revenueRows = [{ productId: 'farrington-command-center', name: fcc?.name || 'Command Center', available: true, ...buildFccRevenue({ from: period.from, to: period.to }) }]

  for (const platform of platforms.filter(row => row.platformId !== 'farrington-command-center')) {
    if (!platformSupportsCapability(platform, 'revenue')) {
      revenueRows.push({ productId: platform.platformId, name: platform.name, available: false, error: 'Revenue capability not declared.' })
      continue
    }
    const result = await callPlatformAdminResource(platform.platformId, 'revenue', { from: period.from, to: period.to }, { bypassCache })
    const body = result.body?.data || result.body
    if (result.status >= 200 && result.status < 300 && body) revenueRows.push({ productId: platform.platformId, name: platform.name, available: true, ...body })
    else revenueRows.push({ productId: platform.platformId, name: platform.name, available: false, error: result.body?.error?.message || `Revenue unavailable (HTTP ${result.status}).` })
  }

  const usageArgs = { from: period.from, to: period.to }
  const usageByProduct = queryUsage({ ...usageArgs, groupBy: 'product' }).groups
  const usageByClient = queryUsage({ ...usageArgs, groupBy: 'client' }).groups
  const leases = (readData('leases.json') || {}).leases || []
  const accounts = loadAll('accounts')
  const clientRevenue = buildFccClientRevenue({ leases, accounts, pricing: readData('pricing-tiers.json') || { tiers: [] } })
  const settings = getMoneySettings()
  const dunningCandidates = buildDunningCandidates({ leases, accounts, now: capturedAt, proposalDays: settings.dunningProposalDays })
  const snapshot = buildMoneySnapshot({ period, capturedAt, revenueRows, usageByProduct, usageByClient, clientRevenue, dunningCandidates })
  saveAll('revenueSnapshots', upsertMonthlySnapshot(loadAll('revenueSnapshots'), snapshot))
  return snapshot
}
