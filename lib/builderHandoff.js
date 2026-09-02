import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const HANDOFF_TTL_MS = 60 * 1000
const SIGNING_CONTEXT = 'fcc-builder-handoff-v1'
const globalStore = globalThis
const consumed = globalStore.__fccConsumedBuilderHandoffs || new Set()

if (!globalStore.__fccConsumedBuilderHandoffs) globalStore.__fccConsumedBuilderHandoffs = consumed

function secret() {
  const value = process.env.CRM_SESSION_SECRET
  if (!value) throw new Error('CRM_SESSION_SECRET is not set')
  return value
}

function sign(payload) {
  return createHmac('sha256', secret()).update(`${SIGNING_CONTEXT}.${payload}`).digest('base64url')
}

function signaturesMatch(actual, expected) {
  const actualBytes = Buffer.from(actual || '', 'utf8')
  const expectedBytes = Buffer.from(expected || '', 'utf8')
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes)
}

export function issueBuilderHandoff({ uid, ver }) {
  const payload = Buffer.from(JSON.stringify({
    uid,
    ver: ver || 1,
    exp: Date.now() + HANDOFF_TTL_MS,
    nonce: randomBytes(16).toString('base64url'),
  })).toString('base64url')
  return `${payload}.${sign(payload)}`
}

export function consumeBuilderHandoffDetailed(code) {
  if (!code || typeof code !== 'string') return { handoff: null, reason: 'missing' }
  if (consumed.has(code)) return { handoff: null, reason: 'consumed' }
  const separator = code.lastIndexOf('.')
  if (separator <= 0) return { handoff: null, reason: 'malformed' }
  const payload = code.slice(0, separator)
  const signature = code.slice(separator + 1)
  if (!signaturesMatch(signature, sign(payload))) return { handoff: null, reason: 'signature' }

  let handoff
  try {
    handoff = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  } catch {
    return { handoff: null, reason: 'payload' }
  }
  if (!handoff?.uid || !handoff?.exp) return { handoff: null, reason: 'claims' }
  if (handoff.exp <= Date.now()) return { handoff: null, reason: 'expired' }

  consumed.add(code)
  if (consumed.size > 500) consumed.clear()
  return { handoff, reason: null }
}

export function consumeBuilderHandoff(code) {
  return consumeBuilderHandoffDetailed(code).handoff
}
