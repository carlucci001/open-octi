// Daily digest of inbound items sitting unhandled for more than 24 hours.
// Pushes an in-app notification plus a high-priority ntfy alert so nothing
// rots in the feed unseen — the failure mode that hid business email for months.
import { listUnhandledOwnerInboxMessages } from './ownerInbox'
import { pushNotification } from './notifications'
import { pushNtfy } from './ntfy'

export async function runInboundDigest() {
  const stale = listUnhandledOwnerInboxMessages({ olderThanHours: 24 })
  if (!stale.length) return { ok: true, unhandled: 0 }

  const lines = stale.slice(0, 12).map(message => (
    `- [${message.kind || 'email'}] ${message.from || 'unknown'} — ${message.subject}`
  ))
  if (stale.length > 12) lines.push(`…and ${stale.length - 12} more`)
  const title = `${stale.length} inbound item${stale.length === 1 ? '' : 's'} unhandled > 24h`

  try {
    pushNotification({
      source: 'inbound',
      severity: 'warning',
      title,
      body: lines.join('\n'),
      link: '/accounts',
      dedupeKey: 'inbound-digest',
    })
  } catch (error) {
    console.error('[inbound-digest] in-app notification failed:', error?.message)
  }
  await pushNtfy({ title, body: lines.join('\n'), priority: 'high', tags: ['warning', 'inbox_tray'] })

  return { ok: true, unhandled: stale.length }
}
