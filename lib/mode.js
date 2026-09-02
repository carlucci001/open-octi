/**
 * Demo / Real mode toggle.
 *
 * The mode is stored as a single text file at data/.mode. Default = real.
 *
 * SAFETY:
 *   - The mode flag itself ALWAYS lives in real data/, never in data-demo/
 *     (so you can't accidentally trap yourself in demo mode).
 *   - Files listed in PINNED_TO_REAL are read/written from real data/ even
 *     in demo mode (AI agent config, sensitive credentials, infra config).
 *   - Everything else redirects to data-demo/ when mode=demo.
 *   - Real customer data is physically untouchable from the running CRM
 *     while demo mode is on.
 */
import fs from 'fs'
import path from 'path'

export const REAL_DIR = process.env.CRM_DATA_DIR || path.join(process.cwd(), 'data')
export const DEMO_DIR = path.join(process.cwd(), 'data-demo')
const MODE_FILE = path.join(REAL_DIR, '.mode')
const MODE_META_FILE = path.join(REAL_DIR, '.mode-meta.json')
const DEMO_MODE_TTL_MS = Number(process.env.DEMO_MODE_TTL_MS || 4 * 60 * 60 * 1000)

// Files that MUST always read from real data/ regardless of mode.
// AI agent config + avatars are part of the product surface (you want
// the same Maggie/Craig/etc. visible in both modes). Credentials &
// service accounts are sensitive and irrelevant for a demo. User/auth
// data must also stay real so switching into demo mode never invalidates
// the active Command Center session.
export const PINNED_TO_REAL = new Set([
  'agents.json',
  'avatars.json',
  'users.json',
  'security-audit-log.json',
  'credentials.json',
  'firebase-service-account.json',
  'gcal-service-account.json',
  'calendar-config.json',
  'inbound-channels.json',
  'privacy-card-categories.json',
  'privacy-cards.json',
  'privacy-transactions.json',
  'notes-config.json',
  'voice-agent.json',
  'voice-agent-roster.json',
  'enrich-log.json',
  'enrich-progress.json',
  'scripts.json',
])

export function getModeMeta() {
  try {
    return JSON.parse(fs.readFileSync(MODE_META_FILE, 'utf-8'))
  } catch {
    return null
  }
}

function isExpiredDemo(meta) {
  if (!meta?.expiresAt) return false
  const expires = Date.parse(meta.expiresAt)
  return Number.isFinite(expires) && Date.now() > expires
}

export function getMode() {
  try {
    const v = fs.readFileSync(MODE_FILE, 'utf-8').trim().toLowerCase()
    if (v !== 'demo') return 'real'
    if (isExpiredDemo(getModeMeta())) return setMode('real', { reason: 'expired-demo-mode' })
    return 'demo'
  } catch {
    return 'real'
  }
}

export function setMode(mode, options = {}) {
  const v = mode === 'demo' ? 'demo' : 'real'
  if (!fs.existsSync(REAL_DIR)) fs.mkdirSync(REAL_DIR, { recursive: true })
  fs.writeFileSync(MODE_FILE, v, 'utf-8')
  const now = new Date()
  const meta = {
    mode: v,
    updatedAt: now.toISOString(),
    reason: options.reason || null,
    expiresAt: v === 'demo' ? new Date(now.getTime() + DEMO_MODE_TTL_MS).toISOString() : null,
  }
  fs.writeFileSync(MODE_META_FILE, JSON.stringify(meta, null, 2), 'utf-8')
  return v
}

export function dirForFile(filename) {
  if (PINNED_TO_REAL.has(filename)) return REAL_DIR
  return getMode() === 'demo' ? DEMO_DIR : REAL_DIR
}
