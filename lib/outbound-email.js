import { Resend } from 'resend'
import { readData } from './dataStore'

function usable(value) {
  const text = String(value || '').trim()
  return text && !['missing', 'changeme', 'change-me', 'undefined', 'null'].includes(text.toLowerCase()) ? text : ''
}

export function resolveResendKey() {
  const fromEnvironment = usable(process.env.RESEND_API_KEY)
  if (fromEnvironment) return fromEnvironment
  const credentials = (readData('credentials.json') || {}).credentials || []
  const entry = credentials.find(credential => /resend|transactional email|email delivery/i.test([
    credential.name, credential.provider, credential.category,
  ].filter(Boolean).join(' ')))
  const field = (entry?.fields || []).find(item => /api.?key|secret|token/i.test([
    item.label, item.name, item.key,
  ].filter(Boolean).join(' ')))
  return usable(field?.value)
}

export function hasOutboundEmailTransport() {
  return Boolean(resolveResendKey())
}

export async function sendOutboundEmail(payload, options = {}) {
  const key = usable(options.key) || resolveResendKey()
  if (!key) throw new Error('Resend is not configured in the environment or credentials vault')
  const client = options.client || new Resend(key)
  const defaultFrom = process.env.RESEND_FROM || 'Farrington Development <redacted@example.invalid>'
  const fallbackFrom = process.env.RESEND_FALLBACK_FROM || 'Farrington Development <redacted@example.invalid>'
  const message = {
    ...payload,
    from: payload.from || defaultFrom,
    replyTo: payload.replyTo || process.env.RESEND_REPLY_TO || 'redacted@example.invalid',
  }
  let result = await client.emails.send(message)
  const errorMessage = result?.error?.message || ''
  if (result?.error && fallbackFrom !== message.from && /domain|verify|authorization|permission|sender/i.test(errorMessage)) {
    result = await client.emails.send({ ...message, from: fallbackFrom })
  }
  if (result?.error) throw new Error(result.error.message)
  return result?.data || result
}
