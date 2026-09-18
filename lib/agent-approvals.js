// Action-bound, single-use approval artifacts for agent tool calls.
//
// enforceAgentToolPolicy() in app/api/agent/execute/route.js hard-blocks every
// approvalRequired tool because a boolean inside agent-generated arguments is
// not proof of human approval. This module is the separate artifact that
// route.js checks instead: a request record that only a real admin session
// (through /api/admin/agent-approvals) can move to 'approved', bound to the
// exact tool+args+tenant via a fingerprint, and consumed exactly once.
//
// Nothing in here ever reads an "approved" flag out of tool args. Approval
// can only come from a decidedBy/openedBy string the caller supplies from a
// verified admin session — this module never infers who the approver is.
import { randomUUID, createHash } from 'node:crypto'
import { Resend } from 'resend'
import { mutateData, readData, writeData } from './dataStore'
import { pushNtfy } from './ntfy'

export const AGENT_APPROVALS_FILE = 'agent-approvals.json'
export const AGENT_APPROVALS_VERSION = 1

// Same file the execute route's logAgentGuardrailEvent() writes to — keep
// approvals and tool-call guardrail events in one audit trail. route.js
// cannot export helpers from a route.js file (Next.js app-router route files
// only allow HTTP-method/config exports), so this is a self-contained
// equivalent rather than an import.
const AGENT_GUARDRAIL_LOG_FILE = 'agent-tool-guardrails.json'

const DEFAULT_TTL_MINUTES = 15
const MAX_WINDOW_MINUTES = 120
const MAX_REQUESTS_RETAINED = 200
const MAX_WINDOWS_RETAINED = 50

const REQUEST_STATUSES = new Set(['pending', 'approved', 'denied', 'consumed', 'expired'])

const SENSITIVE_KEY_PATTERN = /(key|token|secret|password|passphrase|credential)/i
const SUMMARY_TEXT_KEYS = ['id', 'clientId', 'clientName', 'accountId', 'agent', 'agentId', 'provider', 'domain', 'method', 'phone', 'to']

// ---------------------------------------------------------------------------
// Approval settings — persisted config for timing + notification channels.
// A missing/corrupt file reproduces today's hardcoded behavior exactly: the
// DEFAULT_TTL_MINUTES / MAX_WINDOW_MINUTES constants above stay the fallback
// values, push notifications stay on, and email (which didn't exist before
// this file gained it) stays off.
//
// HARD_MAX_* are absolute ceilings enforced in code on every read AND on
// every write, independent of what a caller posts or what's sitting in the
// config file — even a directly-edited config file cannot push the window
// cap (or the approval TTL) past these. This is the "maximum window stays
// capped in code regardless of what's configured" guarantee.
// ---------------------------------------------------------------------------

export const AGENT_APPROVAL_SETTINGS_FILE = 'agent-approval-settings.json'
const HARD_MAX_TTL_MINUTES = 120
const HARD_MAX_WINDOW_MINUTES = 240
const DEFAULT_NOTIFY_EMAIL_TO = (process.env.OWNER_EMAIL || 'personal@example.invalid').trim()

function clampInt(value, min, max, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

function normalizeEmail(value, fallback) {
  const s = typeof value === 'string' ? value.trim() : ''
  return s && s.includes('@') ? s : fallback
}

// Sane defaults matching today's hardcoded constants, so a missing config
// file behaves exactly as before this settings surface existed.
export function getApprovalSettings() {
  const raw = readData(AGENT_APPROVAL_SETTINGS_FILE)
  return {
    notifyPush: raw?.notifyPush !== false, // default true — pushNtfy fired unconditionally before this change
    notifyEmail: raw?.notifyEmail === true, // default false — email notifications did not exist before this change
    notifyEmailTo: normalizeEmail(raw?.notifyEmailTo, DEFAULT_NOTIFY_EMAIL_TO),
    ttlMinutes: clampInt(raw?.ttlMinutes, 1, HARD_MAX_TTL_MINUTES, DEFAULT_TTL_MINUTES),
    maxWindowMinutes: clampInt(raw?.maxWindowMinutes, 1, HARD_MAX_WINDOW_MINUTES, MAX_WINDOW_MINUTES),
    updatedAt: raw?.updatedAt || null,
    updatedBy: raw?.updatedBy || null,
  }
}

// Server-side clamp — never trust a posted value. Called only from the admin
// settings route, which runs requireAdmin() before this, and never accepts a
// machine key.
export function saveApprovalSettings({ notifyPush, notifyEmail, notifyEmailTo, ttlMinutes, maxWindowMinutes, updatedBy } = {}) {
  const next = {
    notifyPush: notifyPush !== false,
    notifyEmail: notifyEmail === true,
    notifyEmailTo: normalizeEmail(notifyEmailTo, DEFAULT_NOTIFY_EMAIL_TO),
    ttlMinutes: clampInt(ttlMinutes, 1, HARD_MAX_TTL_MINUTES, DEFAULT_TTL_MINUTES),
    maxWindowMinutes: clampInt(maxWindowMinutes, 1, HARD_MAX_WINDOW_MINUTES, MAX_WINDOW_MINUTES),
    updatedAt: new Date().toISOString(),
    updatedBy: updatedBy || null,
  }
  writeData(AGENT_APPROVAL_SETTINGS_FILE, next)
  return next
}

// ---------------------------------------------------------------------------
// Notifications — push via ntfy, email via Resend (the same provider/path
// send_email in app/api/agent/execute/route.js already uses; no second
// mailer). Both channels are gated by getApprovalSettings() and are always
// fire-and-forget from the caller's perspective: a notification failure must
// never block or fail the guarded tool call.
// ---------------------------------------------------------------------------

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

// Shared Resend send used by both the real "approval is pending" email and
// the settings screen's "send test notification" button, so there is only
// one place that talks to Resend for approval notifications. Throws on
// failure — callers decide whether to await-and-report (test button) or
// fire-and-forget (real pending-approval notice).
export async function sendApprovalNotificationEmail({ to, subject, lines }) {
  const recipient = normalizeEmail(to, '')
  if (!recipient) throw new Error('a valid notification email address is required')
  const key = process.env.RESEND_API_KEY
  if (!key) throw new Error('RESEND_API_KEY not set')
  const resend = new Resend(key)
  const textLines = Array.isArray(lines) ? lines : [String(lines || '')]
  const text = textLines.join('\n')
  const html = textLines.map(line => (line ? `<p style="margin:0 0 10px 0">${escapeHtml(line)}</p>` : '<br/>')).join('')
  const r = await resend.emails.send({
    from: 'ContentStudio <redacted@example.invalid>',
    to: [recipient],
    replyTo: 'personal@example.invalid',
    subject: subject || 'Command Center approval notification',
    html,
    text,
  })
  if (r?.error) throw new Error(r.error.message || 'Resend error')
  return { ok: true, id: r?.data?.id }
}

// Fire-and-forget: fires whichever channels getApprovalSettings() has
// enabled for a newly-created pending approval request. Never throws, never
// returns a promise callers are expected to await — same posture as the
// pushNtfy(...).catch(() => {}) call this replaces in route.js.
export function notifyApprovalPending({ tool, reason, argsSummary, requestedByAgent, expiresAt } = {}) {
  const settings = getApprovalSettings()
  const summaryLine = Object.entries(argsSummary || {}).map(([key, value]) => `${key}: ${value}`).join(', ')

  if (settings.notifyPush) {
    pushNtfy({
      title: `Approval needed: ${tool}`,
      body: [reason, summaryLine].filter(Boolean).join(' — ') || `${tool} is waiting for approval.`,
      priority: 'high',
      tags: ['warning', 'lock'],
    }).catch(() => {})
  }

  if (settings.notifyEmail) {
    const lines = [
      'An agent tool call is waiting for your approval in Command Center.',
      '',
      `Tool: ${tool}`,
      reason ? `Why it's gated: ${reason}` : null,
      requestedByAgent ? `Requested by: ${requestedByAgent}` : null,
      summaryLine ? `Details: ${summaryLine}` : null,
      expiresAt ? `Expires: ${new Date(expiresAt).toLocaleString()}` : null,
      '',
      'Nothing has been sent or changed yet. Approve or deny it from Settings -> Agent Approvals in the CRM.',
    ].filter(Boolean)
    sendApprovalNotificationEmail({ to: settings.notifyEmailTo, subject: `Approval needed: ${tool}`, lines }).catch(() => {})
  }
}

// ---------------------------------------------------------------------------
// Canonicalization + fingerprint
// ---------------------------------------------------------------------------

function canonicalize(value) {
  if (value === undefined) return undefined
  if (Array.isArray(value)) {
    return value.map(canonicalize).filter(v => v !== undefined)
  }
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out = {}
    for (const key of Object.keys(value).sort()) {
      const v = canonicalize(value[key])
      if (v !== undefined) out[key] = v
    }
    return out
  }
  return value
}

// Binds an approval to the exact action: same tool, same tenant, same args.
// Any change to args (a different recipient, a different amount) produces a
// different fingerprint and needs its own approval.
export function fingerprintAction({ tool, args, tenantId } = {}) {
  const canonical = canonicalize({ tool: tool || null, tenantId: tenantId || null, args: args || {} })
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex')
}

// ---------------------------------------------------------------------------
// Args redaction (fallback when the caller doesn't already pass argsSummary)
// ---------------------------------------------------------------------------

export function summarizeApprovalArgs(args = {}) {
  const summary = {}
  if (!args || typeof args !== 'object') return summary
  for (const key of SUMMARY_TEXT_KEYS) {
    if (SENSITIVE_KEY_PATTERN.test(key)) continue
    if (args[key] !== undefined && args[key] !== null && args[key] !== '') {
      summary[key] = String(args[key]).slice(0, 120)
    }
  }
  if (args.amount !== undefined) summary.amount = Number(args.amount) || 0
  if (args.usd !== undefined) summary.usd = Number(args.usd) || 0
  if (args.credits !== undefined) summary.credits = Number(args.credits) || 0
  if (args.recipients) summary.recipientsCount = Array.isArray(args.recipients) ? args.recipients.length : 1
  if (args.prompt) summary.promptLength = String(args.prompt).length
  if (args.body) summary.bodyLength = String(args.body).length
  if (args.html) summary.htmlLength = String(args.html).length
  if (args.subject) summary.subject = String(args.subject).slice(0, 160)
  // Safety net: never surface anything under a key that looks like a secret,
  // even if a future caller widens SUMMARY_TEXT_KEYS or passes extras.
  for (const key of Object.keys(summary)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) delete summary[key]
  }
  return summary
}

// ---------------------------------------------------------------------------
// Guardrail audit log (shared with route.js's own AGENT_GUARDRAIL_LOG_FILE)
// ---------------------------------------------------------------------------

export function logGuardrailAuditEvent(event) {
  try {
    const current = readData(AGENT_GUARDRAIL_LOG_FILE) || { events: [] }
    const events = Array.isArray(current.events) ? current.events : []
    events.push({
      id: `agt_guard_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      at: new Date().toISOString(),
      ...event,
    })
    writeData(AGENT_GUARDRAIL_LOG_FILE, { events: events.slice(-250), lastUpdated: new Date().toISOString() })
  } catch (e) {
    console.warn(`[agent-approvals] guardrail log failed: ${String(e.message || e).slice(0, 160)}`)
  }
}

// ---------------------------------------------------------------------------
// Store plumbing
// ---------------------------------------------------------------------------

function normalizeStore(raw) {
  if (!raw || typeof raw !== 'object') return { version: AGENT_APPROVALS_VERSION, requests: [], windows: [] }
  return {
    version: Number(raw.version) || AGENT_APPROVALS_VERSION,
    requests: Array.isArray(raw.requests) ? raw.requests : [],
    windows: Array.isArray(raw.windows) ? raw.windows : [],
  }
}

// Expires anything past its expiresAt (pending/approved requests → expired;
// open windows → closed). Mutates in place, returns whether anything changed.
function sweepStore(store) {
  const now = Date.now()
  let changed = false
  for (const req of store.requests) {
    if (!REQUEST_STATUSES.has(req.status)) req.status = 'expired'
    if ((req.status === 'pending' || req.status === 'approved') && req.expiresAt && new Date(req.expiresAt).getTime() <= now) {
      req.status = 'expired'
      changed = true
    }
  }
  for (const win of store.windows) {
    if (!win.closedAt && win.expiresAt && new Date(win.expiresAt).getTime() <= now) {
      win.closedAt = new Date(now).toISOString()
      changed = true
    }
  }
  return changed
}

function trimStore(store) {
  store.requests = store.requests.slice(-MAX_REQUESTS_RETAINED)
  store.windows = store.windows.slice(-MAX_WINDOWS_RETAINED)
}

// Read path used by every query function. Cheap peek first; only goes
// through the transactional mutateData (and re-sweeps inside it, so a
// concurrent writer can't race the expiry) when something actually expired.
function readSweptStore() {
  const peek = normalizeStore(readData(AGENT_APPROVALS_FILE))
  const peekChanged = sweepStore(peek)
  if (!peekChanged) return peek
  return mutateData(AGENT_APPROVALS_FILE, stored => {
    const store = normalizeStore(stored)
    sweepStore(store)
    trimStore(store)
    return { data: store, result: store }
  })
}

// Write path used by every mutating function. Always sweeps first (inside
// the transaction) so expiry is applied before the caller's own logic runs.
function mutateStore(fn) {
  return mutateData(AGENT_APPROVALS_FILE, stored => {
    const store = normalizeStore(stored)
    sweepStore(store)
    const result = fn(store)
    trimStore(store)
    return { data: store, result }
  })
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export function createOrReuseRequest({
  tool, risk, reason, args, argsSummary, tenantId, requestedByAgent, ttlMinutes,
} = {}) {
  if (!tool) throw new Error('tool is required')
  const fingerprint = fingerprintAction({ tool, args, tenantId })
  const summary = (argsSummary && typeof argsSummary === 'object') ? argsSummary : summarizeApprovalArgs(args)
  return mutateStore(store => {
    const now = Date.now()
    const existing = store.requests.find(r => (
      r.fingerprint === fingerprint && r.status === 'pending' && new Date(r.expiresAt).getTime() > now
    ))
    if (existing) return { ...existing, reused: true }

    // ttlMinutes, when the caller passes one explicitly, is still clamped to
    // the same hard ceiling as the configured default — no caller can hand
    // this an unbounded TTL. When omitted (the normal route.js path), the
    // admin-configured (or default) ttlMinutes from settings applies.
    const ttl = ttlMinutes === undefined
      ? getApprovalSettings().ttlMinutes
      : clampInt(ttlMinutes, 1, HARD_MAX_TTL_MINUTES, DEFAULT_TTL_MINUTES)
    const nowIso = new Date(now).toISOString()
    const record = {
      id: `apr_req_${randomUUID()}`,
      fingerprint,
      tool,
      risk: risk || null,
      reason: reason || '',
      argsSummary: summary,
      requestedByAgent: requestedByAgent || null,
      tenantId: tenantId || null,
      createdAt: nowIso,
      expiresAt: new Date(now + ttl * 60000).toISOString(),
      status: 'pending',
      decidedBy: null,
      decidedAt: null,
      consumedAt: null,
    }
    store.requests.push(record)
    return { ...record, reused: false }
  })
}

// An approved, unexpired, unconsumed request matching this fingerprint, or null.
export function findUsableApproval(fingerprint) {
  if (!fingerprint) return null
  const store = readSweptStore()
  const now = Date.now()
  return store.requests.find(r => (
    r.fingerprint === fingerprint && r.status === 'approved' && new Date(r.expiresAt).getTime() > now
  )) || null
}

// Single-use: flips approved -> consumed. A second call on the same id finds
// status !== 'approved' and returns null.
export function consumeApproval(id) {
  if (!id) return null
  return mutateStore(store => {
    const now = Date.now()
    const req = store.requests.find(r => r.id === id)
    if (!req) return null
    if (req.status !== 'approved') return null
    if (req.expiresAt && new Date(req.expiresAt).getTime() <= now) {
      req.status = 'expired'
      return null
    }
    req.status = 'consumed'
    req.consumedAt = new Date(now).toISOString()
    return { ...req }
  })
}

export function listRequests({ status, limit } = {}) {
  const store = readSweptStore()
  let list = store.requests.slice().reverse()
  if (status) list = list.filter(r => r.status === status)
  const n = Number(limit)
  if (Number.isFinite(n) && n > 0) list = list.slice(0, n)
  return list
}

// decidedBy is a string supplied by the caller from a verified admin
// session — this module never infers who the approver is.
export function approveRequest(id, decidedBy) {
  if (!id) throw new Error('id is required')
  if (!decidedBy) throw new Error('decidedBy is required')
  return mutateStore(store => {
    const now = Date.now()
    const req = store.requests.find(r => r.id === id)
    if (!req) return null
    if (req.status !== 'pending') return { ...req }
    if (req.expiresAt && new Date(req.expiresAt).getTime() <= now) {
      req.status = 'expired'
      return { ...req }
    }
    req.status = 'approved'
    req.decidedBy = decidedBy
    req.decidedAt = new Date(now).toISOString()
    return { ...req }
  })
}

export function denyRequest(id, decidedBy) {
  if (!id) throw new Error('id is required')
  if (!decidedBy) throw new Error('decidedBy is required')
  return mutateStore(store => {
    const now = Date.now()
    const req = store.requests.find(r => r.id === id)
    if (!req) return null
    if (req.status !== 'pending') return { ...req }
    if (req.expiresAt && new Date(req.expiresAt).getTime() <= now) {
      req.status = 'expired'
      return { ...req }
    }
    req.status = 'denied'
    req.decidedBy = decidedBy
    req.decidedAt = new Date(now).toISOString()
    return { ...req }
  })
}

// ---------------------------------------------------------------------------
// Windows — a time-boxed "yes to this class of risk" the admin opens
// explicitly, e.g. while walking through a batch of sends together.
// ---------------------------------------------------------------------------

export function activeWindowForRisk(risk) {
  if (!risk) return null
  const store = readSweptStore()
  const now = Date.now()
  return store.windows.find(w => (
    !w.closedAt
    && new Date(w.expiresAt).getTime() > now
    && (w.risks === 'all' || (Array.isArray(w.risks) && w.risks.includes(risk)))
  )) || null
}

// openedBy is a string supplied by the caller from a verified admin session
// — this module never infers who opened the window. minutes is clamped to
// the admin-configured maxWindowMinutes (itself always <= HARD_MAX_WINDOW_MINUTES,
// regardless of what's stored in the settings file) — no caller, including a
// future admin API bug, can open a window longer than that hard ceiling.
export function openWindow({ minutes, risks, openedBy, note } = {}) {
  if (!openedBy) throw new Error('openedBy is required')
  const cap = getApprovalSettings().maxWindowMinutes
  const mins = clampInt(minutes, 1, cap, 15)
  const normalizedRisks = (risks === undefined || risks === null || risks === 'all')
    ? 'all'
    : (Array.isArray(risks) ? risks.map(String).filter(Boolean) : [String(risks)])
  return mutateStore(store => {
    const now = Date.now()
    const win = {
      id: `apr_win_${randomUUID()}`,
      openedBy,
      openedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + mins * 60000).toISOString(),
      risks: normalizedRisks,
      note: note ? String(note).slice(0, 300) : '',
      closedAt: null,
      closedBy: null,
    }
    store.windows.push(win)
    return { ...win }
  })
}

export function closeWindow(id, closedBy) {
  if (!id) throw new Error('id is required')
  if (!closedBy) throw new Error('closedBy is required')
  return mutateStore(store => {
    const win = store.windows.find(w => w.id === id)
    if (!win) return null
    if (!win.closedAt) {
      win.closedAt = new Date().toISOString()
      win.closedBy = closedBy
    }
    return { ...win }
  })
}

export function listWindows() {
  const store = readSweptStore()
  return store.windows.slice().reverse()
}
