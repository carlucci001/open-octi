import { readData, writeData } from './dataStore'

const FILE = 'security-audit-log.json'
const MAX_EVENTS = 1500

function load() {
  try {
    return readData(FILE) || { events: [] }
  } catch {
    return { events: [] }
  }
}

function clientIp(request) {
  if (!request?.headers) return ''
  const forwarded = request.headers.get('x-forwarded-for') || ''
  if (forwarded) return forwarded.split(',')[0].trim()
  return request.headers.get('cf-connecting-ip') || request.headers.get('x-real-ip') || ''
}

function cleanText(value, max = 160) {
  if (value === null || value === undefined) return ''
  return String(value).slice(0, max)
}

function cleanMeta(meta = {}) {
  const out = {}
  for (const [key, value] of Object.entries(meta || {})) {
    if (/password|secret|token|key|credential|value/i.test(key)) {
      out[key] = '[redacted]'
    } else if (Array.isArray(value)) {
      out[key] = value.slice(0, 20).map(v => cleanText(v, 80))
    } else if (value && typeof value === 'object') {
      out[key] = '[object]'
    } else {
      out[key] = cleanText(value, 220)
    }
  }
  return out
}

export function logAuditEvent({ request, user, action, area = 'security', severity = 'info', targetId = '', targetName = '', meta = {} }) {
  try {
    const data = load()
    const events = data.events || []
    events.unshift({
      id: 'aud_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      at: new Date().toISOString(),
      severity,
      area,
      action,
      targetId: cleanText(targetId, 120),
      targetName: cleanText(targetName, 180),
      user: user ? {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
      } : null,
      ip: clientIp(request),
      userAgent: cleanText(request?.headers?.get('user-agent') || '', 260),
      meta: cleanMeta(meta),
    })
    writeData(FILE, { lastUpdated: new Date().toISOString(), events: events.slice(0, MAX_EVENTS) })
  } catch (e) {
    console.error('audit log failed', e.message)
  }
}

export function listAuditEvents({ limit = 250 } = {}) {
  const data = load()
  return (data.events || []).slice(0, Math.min(Number(limit) || 250, MAX_EVENTS))
}
