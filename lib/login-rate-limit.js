import crypto from 'crypto'
import { readData, writeData } from './dataStore'

const FILE = 'login-attempts.json'
const VERSION = 1
const WINDOW_MS = 15 * 60 * 1000
const LOCK_MS = 15 * 60 * 1000
const USER_LIMIT = 5
const IP_LIMIT = 25
const MAX_RECORD_AGE_MS = 24 * 60 * 60 * 1000

function nowMs() { return Date.now() }

function loadStore() {
  const data = readData(FILE)
  if (data && data.__version === VERSION && data.records) return data
  return { __version: VERSION, records: {}, lastUpdated: null }
}

function saveStore(data) {
  data.__version = VERSION
  data.lastUpdated = new Date().toISOString()
  writeData(FILE, data)
}

function digest(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, 32)
}

export function normalizeLoginIdentifier(value) {
  return String(value || '').trim().toLowerCase() || 'unknown'
}

export function getLoginClientIp(request) {
  const headers = request?.headers
  const cf = headers?.get?.('cf-connecting-ip')
  if (cf) return cf.trim()
  const forwarded = headers?.get?.('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  const real = headers?.get?.('x-real-ip')
  if (real) return real.trim()
  return 'unknown'
}

function recordKeys(username, ip) {
  return [
    { key: `user:${digest(normalizeLoginIdentifier(username))}`, limit: USER_LIMIT, kind: 'username' },
    { key: `ip:${digest(ip || 'unknown')}`, limit: IP_LIMIT, kind: 'ip' },
  ]
}

function isLocked(record, at = nowMs()) {
  return record?.lockedUntil && record.lockedUntil > at
}

function retryAfterSeconds(record, at = nowMs()) {
  return Math.max(1, Math.ceil(((record?.lockedUntil || at) - at) / 1000))
}

function pruneRecords(records, at = nowMs()) {
  const cutoff = at - MAX_RECORD_AGE_MS
  for (const [key, record] of Object.entries(records || {})) {
    const last = record.lastFailedAt || record.firstFailedAt || 0
    if (!isLocked(record, at) && last < cutoff) delete records[key]
  }
}

export function applyLoginFailure(record = {}, limit, at = nowMs()) {
  record = record || {}
  const firstFailedAt = record.firstFailedAt && record.firstFailedAt > at - WINDOW_MS
    ? record.firstFailedAt
    : at
  const failures = firstFailedAt === record.firstFailedAt ? (record.failures || 0) + 1 : 1
  const next = {
    firstFailedAt,
    lastFailedAt: at,
    failures,
    lockedUntil: record.lockedUntil && record.lockedUntil > at ? record.lockedUntil : null,
  }
  if (failures >= limit) next.lockedUntil = at + LOCK_MS
  return next
}

export function checkLoginThrottle(request, username, at = nowMs()) {
  const ip = getLoginClientIp(request)
  const data = loadStore()
  pruneRecords(data.records, at)
  let locked = null
  for (const entry of recordKeys(username, ip)) {
    const record = data.records[entry.key]
    if (isLocked(record, at)) {
      locked = {
        kind: entry.kind,
        retryAfterSeconds: retryAfterSeconds(record, at),
        lockedUntil: new Date(record.lockedUntil).toISOString(),
      }
      break
    }
  }
  if (locked) saveStore(data)
  return locked
}

export function recordLoginFailure(request, username, at = nowMs()) {
  const ip = getLoginClientIp(request)
  const data = loadStore()
  pruneRecords(data.records, at)
  let locked = null
  for (const entry of recordKeys(username, ip)) {
    const next = applyLoginFailure(data.records[entry.key], entry.limit, at)
    data.records[entry.key] = next
    if (!locked && isLocked(next, at)) {
      locked = {
        kind: entry.kind,
        retryAfterSeconds: retryAfterSeconds(next, at),
        lockedUntil: new Date(next.lockedUntil).toISOString(),
      }
    }
  }
  saveStore(data)
  return locked
}

export function clearLoginThrottle(request, username) {
  const ip = getLoginClientIp(request)
  const data = loadStore()
  for (const entry of recordKeys(username, ip)) delete data.records[entry.key]
  pruneRecords(data.records)
  saveStore(data)
}

export const LOGIN_RATE_LIMITS = {
  windowMs: WINDOW_MS,
  lockMs: LOCK_MS,
  userLimit: USER_LIMIT,
  ipLimit: IP_LIMIT,
}
