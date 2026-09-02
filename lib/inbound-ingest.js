// Unified inbound intake. Every email, contact form, call, and SMS flows
// through recordInboundItem(): owner-inbox store + in-app notification +
// ntfy push to Carl's phone. Notification failures never block ingestion.
import { ingestOwnerInboxMessage } from './ownerInbox'
import { pushNotification } from './notifications'
import { pushNtfy } from './ntfy'

const KIND_LABEL = { email: 'Email', form: 'Form inquiry', call: 'Call', sms: 'Text' }
const KIND_TAG = { email: 'envelope', form: 'inbox_tray', call: 'telephone_receiver', sms: 'speech_balloon' }

export async function recordInboundItem(input = {}, { notify = true } = {}) {
  const result = ingestOwnerInboxMessage(input)
  if (!result.ok) return result
  const message = result.message
  if (notify) {
    const label = KIND_LABEL[message.kind] || 'Inbound'
    const title = `${label} — ${message.inboxLabel}`
    const body = `${message.from || 'unknown'}: ${message.subject}`
    try {
      pushNotification({
        source: 'inbound',
        severity: 'info',
        title,
        body,
        link: '/accounts',
        dedupeKey: `inbound:${message.id}`,
      })
    } catch (error) {
      console.error('[inbound] in-app notification failed:', error?.message)
    }
    await pushNtfy({
      title,
      body: `${body}\n${String(message.snippet || '').slice(0, 300)}`,
      tags: [KIND_TAG[message.kind] || 'inbox_tray'],
    })
  }
  return result
}
