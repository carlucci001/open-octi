import { NextResponse } from 'next/server'
import { readData } from '@/lib/dataStore'
import { requireCrmRead } from '@/lib/permissions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const EMPTY_COUNTS = { emails: 0, images: 0, calls: 0, tasks: 0, money: 0, agent: 0 }

function classifyActivity(type) {
  const t = String(type || '').toLowerCase()
  if (/email|resend|mail/.test(t) || t === 'dictate_email') return 'emails'
  if (/call|video|phone|dial|voicemail|voice/.test(t)) return 'calls'
  if (/payment|invoice|stripe|subscription|billing|charge/.test(t)) return 'money'
  if (/image|media|upload|gallery/.test(t)) return 'images'
  if (/task/.test(t)) return 'tasks'
  return 'agent'
}

function readArray(filename, key) {
  const data = readData(filename) || {}
  return {
    data,
    items: Array.isArray(data[key]) ? data[key] : [],
  }
}

function dateKey(value) {
  if (!value) return ''
  const raw = String(value)
  const match = raw.match(/\d{4}-\d{2}-\d{2}/)
  if (match) return match[0]
  const parsed = new Date(raw)
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString().slice(0, 10) : ''
}

function makeSeries(days) {
  const out = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    out.push({
      date: d.toISOString().slice(0, 10),
      label: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      weekday: d.toLocaleDateString('en-US', { weekday: 'short' }),
      counts: { ...EMPTY_COUNTS },
    })
  }
  return out
}

function add(series, event, sourceTotals) {
  const key = dateKey(event.date)
  if (!key) return
  const bucket = series.find(d => d.date === key)
  if (!bucket) return
  const category = EMPTY_COUNTS[event.category] === undefined ? 'agent' : event.category
  bucket.counts[category]++
  sourceTotals[event.source] = (sourceTotals[event.source] || 0) + 1
}

function collectEvents() {
  const events = []
  const activities = readArray('activities.json', 'activities')
  const media = readArray('media.json', 'items')
  const tasks = readArray('tasks.json', 'tasks')
  const payments = readArray('payments.json', 'payments')
  const invoices = readArray('invoices.json', 'invoices')
  const feed = readArray('feed-posts.json', 'posts')
  const messages = readArray('messages.json', 'messages')
  const notifications = readArray('notifications.json', 'notifications')
  const audit = readArray('security-audit-log.json', 'events')
  const documents = readArray('documents.json', 'documents')
  const subscriptions = readArray('subscriptions.json', 'subscriptions')
  const voiceUsage = readArray('voice-usage.json', 'events')

  for (const a of activities.items) events.push({ source: 'activities', category: classifyActivity(a.type), date: a.at || a.createdAt || a.updatedAt })
  for (const m of media.items) events.push({ source: 'media', category: 'images', date: m.createdAt || m.updatedAt })
  for (const t of tasks.items) {
    if (t.status === 'done') events.push({ source: 'tasks', category: 'tasks', date: t.completedAt || t.updatedAt || t.createdAt })
  }
  for (const p of payments.items) events.push({ source: 'payments', category: 'money', date: p.paidAt || p.receivedAt || p.date || p.createdAt || p.updatedAt })
  for (const i of invoices.items) events.push({ source: 'invoices', category: 'money', date: i.sentAt || i.paidAt || i.date || i.createdAt || i.updatedAt || i.dueDate })
  for (const p of feed.items) events.push({ source: 'feed', category: 'agent', date: p.at || p.createdAt })
  for (const m of messages.items) events.push({ source: 'messages', category: 'agent', date: m.at || m.createdAt })
  for (const n of notifications.items) events.push({ source: 'notifications', category: classifyActivity(n.type || n.area || n.title), date: n.at || n.createdAt || n.updatedAt })
  for (const e of audit.items) events.push({ source: 'audit', category: classifyActivity(e.action || e.type || e.area), date: e.at || e.createdAt || e.timestamp })
  for (const d of documents.items) events.push({ source: 'documents', category: 'agent', date: d.updatedAt || d.createdAt || d.signedAt })
  for (const s of subscriptions.items) {
    if (s.lastChargeDate) events.push({ source: 'subscriptions', category: 'money', date: s.lastChargeDate })
    if (s.nextDue) events.push({ source: 'subscriptions', category: 'money', date: s.nextDue })
    if (s.importedAt || s.updatedAt) events.push({ source: 'subscriptions', category: 'agent', date: s.importedAt || s.updatedAt })
  }
  for (const v of voiceUsage.items) events.push({ source: 'voice', category: 'calls', date: v.at || v.createdAt || v.timestamp })

  for (const source of [activities, media, tasks, payments, invoices, feed, messages, notifications, audit, documents, subscriptions, voiceUsage]) {
    if (source.data?.lastUpdated) events.push({ source: 'source_updates', category: 'agent', date: source.data.lastUpdated })
  }

  return events
}

function buildPulse(days, events) {
  const series = makeSeries(days)
  const sourceTotals = {}
  for (const event of events) add(series, event, sourceTotals)
  return { series, sourceTotals }
}

export async function GET(request) {
  const { error } = await requireCrmRead(request)
  if (error) return error

  // This route reads a dozen stores. A single malformed one used to 500 the
  // route with no log line; the dashboard then fell back silently. Now the
  // failure is recorded and the client still gets a well-formed empty pulse.
  try {
    const events = collectEvents()
    const d7 = buildPulse(7, events)
    const d14 = buildPulse(14, events)
    const d30 = buildPulse(30, events)

    return NextResponse.json({
      ok: true,
      pulse: { d7: d7.series, d14: d14.series, d30: d30.series },
      sourceTotals: d14.sourceTotals,
    })
  } catch (err) {
    console.error('[dashboard/pulse] failed to build pulse:', err?.stack || err?.message)
    return NextResponse.json({
      ok: false,
      error: 'Pulse unavailable.',
      pulse: { d7: makeSeries(7), d14: makeSeries(14), d30: makeSeries(30) },
      sourceTotals: {},
    })
  }
}
