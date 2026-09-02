// In-CRM direct messages between users.
// Storage: messages.json via dataStore. Each message is { id, from, to, body, at, readAt }.
// "from" and "to" are user IDs.
import { NextResponse } from 'next/server'
import { getCurrentUser, findUserById } from '@/lib/auth'
import { readData, writeData } from '@/lib/dataStore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function load() {
  return readData('messages.json') || { messages: [] }
}
function save(d) { writeData('messages.json', d) }

function genId() {
  return 'msg_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

// GET /api/messages              → list everyone you've talked with + last message + unread count
// GET /api/messages?with=USERID  → return the thread between you and that user (chronological)
export async function GET(request) {
  const me = await getCurrentUser(request)
  if (!me) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  const url = new URL(request.url)
  const withId = url.searchParams.get('with')
  const all = (load().messages || [])
    .filter(m => m.from === me.id || m.to === me.id)

  if (withId) {
    const thread = all
      .filter(m => (m.from === me.id && m.to === withId) || (m.from === withId && m.to === me.id))
      .sort((a, b) => (a.at || '').localeCompare(b.at || ''))
    return NextResponse.json({ ok: true, withUserId: withId, messages: thread })
  }

  // Inbox view: latest message per peer + unread count
  const peers = new Map()
  for (const m of all) {
    const peer = m.from === me.id ? m.to : m.from
    const cur = peers.get(peer) || { peerId: peer, lastMessage: null, unread: 0 }
    if (!cur.lastMessage || (m.at || '') > (cur.lastMessage.at || '')) cur.lastMessage = m
    if (m.to === me.id && !m.readAt) cur.unread++
    peers.set(peer, cur)
  }
  const inbox = Array.from(peers.values())
    .sort((a, b) => (b.lastMessage?.at || '').localeCompare(a.lastMessage?.at || ''))
  return NextResponse.json({ ok: true, inbox })
}

// POST /api/messages  body: { to: userId, body: text }
export async function POST(request) {
  const me = await getCurrentUser(request)
  if (!me) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  let body
  try { body = await request.json() } catch { return NextResponse.json({ ok: false, error: 'bad json' }, { status: 400 }) }
  const to = body.to
  const text = (body.body || '').toString().trim()
  if (!to || !text) return NextResponse.json({ ok: false, error: 'to and body are required' }, { status: 400 })
  if (!findUserById(to)) return NextResponse.json({ ok: false, error: 'recipient not found' }, { status: 404 })
  const msg = { id: genId(), from: me.id, to, body: text, at: new Date().toISOString(), readAt: null }
  const data = load()
  data.messages = data.messages || []
  data.messages.push(msg)
  save(data)
  return NextResponse.json({ ok: true, message: msg })
}

// PATCH /api/messages  body: { from: userId, until: isoTime } → mark all messages from that user up to "until" as read
export async function PATCH(request) {
  const me = await getCurrentUser(request)
  if (!me) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  let body
  try { body = await request.json() } catch { return NextResponse.json({ ok: false, error: 'bad json' }, { status: 400 }) }
  const from = body.from
  const until = body.until || new Date().toISOString()
  if (!from) return NextResponse.json({ ok: false, error: 'from required' }, { status: 400 })
  const data = load()
  let n = 0
  for (const m of (data.messages || [])) {
    if (m.from === from && m.to === me.id && !m.readAt && (m.at || '') <= until) {
      m.readAt = new Date().toISOString()
      n++
    }
  }
  if (n > 0) save(data)
  return NextResponse.json({ ok: true, marked: n })
}
