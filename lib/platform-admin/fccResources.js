import { readFileSync } from 'node:fs'
import { statfs } from 'node:fs/promises'
import path from 'node:path'
import { loadAll } from '../entityStore'
import { readData } from '../dataStore'

// Keep this list truthful. FCC currently implements exactly these five routes;
// customers, subscriptions, and actions must not be advertised until matching
// route handlers exist.
const CAPABILITIES = ['health', 'releases', 'errors', 'usage', 'revenue']

function packageVersion() {
  try {
    return JSON.parse(readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')).version || '0.0.0'
  } catch {
    return '0.0.0'
  }
}

export function fccVersion() {
  const base = packageVersion()
  const sw = String(process.env.FCC_SW_VERSION || '').trim()
  return sw ? `${base}+${sw}` : base
}

export function buildFccManifest({ packageVersion: base = packageVersion(), swVersion = process.env.FCC_SW_VERSION || '' } = {}) {
  const version = String(swVersion || '').trim() ? `${base}+${String(swVersion).trim()}` : base
  return {
    schemaVersion: '2.0',
    platform: {
      id: 'farrington-command-center',
      name: 'Command Center',
      version,
      adminApiBasePath: '/api/platform-admin/v1',
    },
    authentication: {
      methods: ['bearer'],
      audience: 'farrington-command-center-platform-admin',
    },
    capabilities: [...CAPABILITIES],
  }
}

async function sqliteCheck() {
  try {
    readData('settings.json')
    return { ok: true, detail: 'SQLite read succeeded.' }
  } catch {
    return { ok: false, detail: 'SQLite read failed.' }
  }
}

async function deerflowCheck() {
  const baseUrl = String(process.env.DEERFLOW_API_BASE_URL || 'http://127.0.0.1:8000').trim()
  try {
    const response = await fetch(new URL('/health', baseUrl), { signal: AbortSignal.timeout(3_000), cache: 'no-store' })
    return response.ok
      ? { ok: true, detail: `DeerFlow responded with HTTP ${response.status}.` }
      : { ok: false, detail: `DeerFlow responded with HTTP ${response.status}.` }
  } catch {
    return { ok: false, detail: 'DeerFlow did not respond.' }
  }
}

async function diskCheck() {
  try {
    const stats = await statfs(process.cwd())
    const total = Number(stats.blocks) * Number(stats.bsize)
    const free = Number(stats.bavail) * Number(stats.bsize)
    const percent = total > 0 ? Math.round((free / total) * 100) : 0
    return { ok: percent >= 10, detail: `Disk has ${percent}% free.` }
  } catch {
    return { ok: false, detail: 'Disk capacity could not be read.' }
  }
}

export async function buildFccHealth({ version = fccVersion(), now = () => new Date(), checks = {} } = {}) {
  const providers = {
    sqlite: checks.sqlite || sqliteCheck,
    deerflow: checks.deerflow || deerflowCheck,
    disk: checks.disk || diskCheck,
  }
  const results = await Promise.all(Object.entries(providers).map(async ([name, check]) => {
    try {
      const result = await check()
      return { name, ok: Boolean(result?.ok), detail: String(result?.detail || (result?.ok ? 'OK' : 'Unavailable')) }
    } catch {
      return { name, ok: false, detail: 'Check failed.' }
    }
  }))
  const sqliteOk = results.find(check => check.name === 'sqlite')?.ok
  const status = !sqliteOk ? 'down' : results.every(check => check.ok) ? 'ok' : 'degraded'
  return { status, version, checks: results, ts: now().toISOString() }
}

function clampLimit(value, fallback = 20) {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? Math.min(100, Math.max(1, parsed)) : fallback
}

export function listFccReleases({ releases = loadAll('releases'), limit = 20 } = {}) {
  return releases
    .filter(release => release && release.id && release.version && release.commit && release.deployedAt && release.deployer && ['live', 'previous', 'failed'].includes(release.status))
    .sort((a, b) => String(b.deployedAt).localeCompare(String(a.deployedAt)))
    .slice(0, clampLimit(limit))
    .map(release => ({
      id: String(release.id),
      version: String(release.version),
      commit: String(release.commit),
      deployedAt: String(release.deployedAt),
      deployer: String(release.deployer),
      status: release.status,
      ...(release.notes ? { notes: String(release.notes) } : {}),
    }))
}

// FCC currently has no product error tracker or product analytics source.
// The v2 contract explicitly permits truthful empty relays; do not invent data.
export function listFccErrors() {
  return []
}

export function readFccUsage() {
  return {}
}

function inPeriod(value, fromMs, toMs) {
  const timestamp = Date.parse(value || '')
  return Number.isFinite(timestamp) && timestamp >= fromMs && timestamp < toMs
}

function monthlyFee(lease, tiers = []) {
  const tier = tiers.find(item => item.id === lease?.tierId || item.id === lease?.planId || item.name === lease?.tierName)
  const value = Number(lease?.monthlyFee ?? lease?.tierMonthlyFee ?? lease?.priceMonthly ?? tier?.monthlyFee ?? 0)
  return Number.isFinite(value) ? Math.max(0, value) : 0
}

function money(value) {
  return Math.round((Number(value) || 0) * 100) / 100
}

export function buildFccRevenue({
  from,
  to,
  leases = (readData('leases.json') || {}).leases || [],
  payments = (readData('payments.json') || {}).payments || [],
  pricing = readData('pricing-tiers.json') || { tiers: [], currency: 'USD' },
} = {}) {
  const fromMs = Number.isFinite(Date.parse(from || '')) ? Date.parse(from) : new Date(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1).getTime()
  const toMs = Number.isFinite(Date.parse(to || '')) ? Date.parse(to) : Date.now() + 1
  const active = leases.filter(lease => ['active', 'trialing'].includes(String(lease?.stripeSubscriptionStatus || lease?.status || '').toLowerCase()))
  const newlyActive = leases.filter(lease => String(lease?.stripeSubscriptionStatus || '').toLowerCase() === 'active' && inPeriod(lease?.stripeSubscriptionStartedAt || lease?.createdAt, fromMs, toMs))
  const churned = leases.filter(lease => ['canceled', 'cancelled'].includes(String(lease?.stripeSubscriptionStatus || lease?.status || '').toLowerCase()) && inPeriod(lease?.canceledAt || lease?.cancelledAt || lease?.updatedAt, fromMs, toMs))
  const failedPaymentRows = payments.filter(payment => ['failed', 'payment_failed'].includes(String(payment?.status || '').toLowerCase()) && inPeriod(payment?.date || payment?.createdAt, fromMs, toMs)).length
  const failedLeasePayments = leases.filter(lease => inPeriod(lease?.paymentFailedAt, fromMs, toMs)).length
  return {
    currency: String(process.env.STRIPE_CURRENCY || pricing.currency || 'USD').toUpperCase(),
    mrr: money(active.reduce((sum, lease) => sum + monthlyFee(lease, pricing.tiers), 0)),
    newMrr: money(newlyActive.reduce((sum, lease) => sum + monthlyFee(lease, pricing.tiers), 0)),
    churnedMrr: money(churned.reduce((sum, lease) => sum + monthlyFee(lease, pricing.tiers), 0)),
    failedPayments: failedPaymentRows + failedLeasePayments,
    trials: {
      started: leases.filter(lease => inPeriod(lease?.stripeTrialStart, fromMs, toMs)).length,
      converted: leases.filter(lease => inPeriod(lease?.stripeTrialConvertedAt, fromMs, toMs)
        || (String(lease?.stripeSubscriptionStatus || '').toLowerCase() === 'active' && inPeriod(lease?.stripeTrialEnd, fromMs, toMs))).length,
    },
  }
}
