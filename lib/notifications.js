import { readData, writeData } from './dataStore'

const FILE = 'notifications.json'
const MAX = 200

function load() {
  return readData(FILE) || { notifications: [] }
}

function save(d) {
  writeData(FILE, d)
}

export function listNotifications({ includeDismissed = false } = {}) {
  const arr = load().notifications || []
  const out = includeDismissed ? arr : arr.filter(n => !n.dismissed)
  return out.slice().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
}

export function unreadCount() {
  return listNotifications().filter(n => !n.read).length
}

export function pushNotification({ source = 'system', severity = 'info', title, body = '', link = null, dedupeKey = null } = {}) {
  if (!title) return null
  const data = load()
  const arr = data.notifications

  if (dedupeKey) {
    const any = arr.find(n => n.dedupeKey === dedupeKey)
    if (any?.dismissed) {
      return null
    }
    if (any) {
      any.createdAt = new Date().toISOString()
      any.count = (any.count || 1) + 1
      any.read = false
      any.body = body || any.body
      any.severity = severity || any.severity
      save(data)
      return any
    }
  }

  const n = {
    id: 'ntf_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    source,
    severity,
    title,
    body,
    link,
    createdAt: new Date().toISOString(),
    read: false,
    dismissed: false,
    count: 1,
    dedupeKey,
  }
  arr.unshift(n)
  if (arr.length > MAX) arr.length = MAX
  save(data)
  return n
}

export function markRead(id) {
  const data = load()
  const n = data.notifications.find(x => x.id === id)
  if (n) { n.read = true; save(data) }
  return n
}

export function markAllRead() {
  const data = load()
  for (const n of data.notifications) n.read = true
  save(data)
}

export function dismiss(id) {
  const data = load()
  const n = data.notifications.find(x => x.id === id)
  if (n) { n.dismissed = true; save(data) }
  return n
}

export function clearAll() {
  const data = load()
  for (const n of data.notifications) n.dismissed = true
  save(data)
}
