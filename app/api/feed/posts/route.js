// Feed posts: free-form messages from CRM users with optional attachments.
// Stored in feed-posts.json (via dataStore, so it works under both JSON and SQLite backends).
// Posts mix into the Feed page alongside system activities, sorted by time.
import { NextResponse } from 'next/server'
import { getCurrentUser, listUsers } from '@/lib/auth'
import { readData, writeData } from '@/lib/dataStore'
import { isAdminLike } from '@/lib/roles'
import fs from 'fs'
import path from 'path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UPLOAD_DIR = path.join(process.cwd(), 'data', 'uploads', 'feed')

function load() {
  return readData('feed-posts.json') || { posts: [] }
}
function save(d) { writeData('feed-posts.json', d) }
function genId() { return 'fp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8) }

function unlinkAttachment(att) {
  if (!att?.url) return
  const m = att.url.match(/^\/api\/feed\/files\/([^?#]+)/)
  if (!m) return
  try {
    const name = decodeURIComponent(m[1])
    if (name.includes('/') || name.includes('\\') || name.startsWith('.')) return
    const full = path.join(UPLOAD_DIR, name)
    if (full.startsWith(UPLOAD_DIR + path.sep) && fs.existsSync(full)) fs.unlinkSync(full)
  } catch {}
}

// GET /api/feed/posts?limit=50  → newest first, hydrated with author names
export async function GET(request) {
  const me = await getCurrentUser(request)
  if (!me) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  const { searchParams } = new URL(request.url)
  const limit = Math.min(200, Math.max(1, Number(searchParams.get('limit')) || 50))
  const users = listUsers()
  const byId = new Map(users.map(u => [u.id, { id: u.id, displayName: u.displayName, username: u.username }]))
  const all = (load().posts || []).slice().sort((a, b) => (b.at || '').localeCompare(a.at || ''))
  const items = all.slice(0, limit).map(p => ({
    ...p,
    author: byId.get(p.authorId) || { id: p.authorId, displayName: p.authorId, username: p.authorId },
  }))
  return NextResponse.json({ ok: true, posts: items })
}

// DELETE /api/feed/posts  → admin clears the entire feed (and removes all attached files).
export async function DELETE(request) {
  const me = await getCurrentUser(request)
  if (!me) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  if (!isAdminLike(me)) return NextResponse.json({ ok: false, error: 'admin only' }, { status: 403 })
  const data = load()
  for (const p of (data.posts || [])) {
    for (const att of (p.attachments || [])) unlinkAttachment(att)
  }
  const removed = (data.posts || []).length
  save({ posts: [], lastUpdated: new Date().toISOString() })
  return NextResponse.json({ ok: true, removed })
}

// POST /api/feed/posts  body: { body: text, attachments?: [{ kind, url, name, mime, sizeBytes }] }
export async function POST(request) {
  const me = await getCurrentUser(request)
  if (!me) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  let body
  try { body = await request.json() } catch { return NextResponse.json({ ok: false, error: 'bad json' }, { status: 400 }) }
  const text = (body.body || '').toString().trim()
  const atts = Array.isArray(body.attachments) ? body.attachments : []
  if (!text && atts.length === 0) return NextResponse.json({ ok: false, error: 'post body or attachment required' }, { status: 400 })
  const post = {
    id: genId(),
    authorId: me.id,
    body: text,
    attachments: atts,
    at: new Date().toISOString(),
  }
  const data = load()
  data.posts = data.posts || []
  data.posts.push(post)

  // Rolling 40-entry cap. Anything older than the most recent 40 gets moved
  // into feed-posts.json.archive (kept on disk for recovery, never shown in UI).
  const CAP = 40
  if (data.posts.length > CAP) {
    data.posts.sort((a, b) => (a.at || '').localeCompare(b.at || '')) // oldest first
    const overflow = data.posts.slice(0, data.posts.length - CAP)
    data.posts = data.posts.slice(data.posts.length - CAP)
    const archive = readData('feed-posts.json.archive') || { archived: [] }
    archive.archived = (archive.archived || []).concat(overflow)
    archive.lastUpdated = new Date().toISOString()
    writeData('feed-posts.json.archive', archive)
  }

  save(data)
  return NextResponse.json({ ok: true, post: { ...post, author: { id: me.id, displayName: me.displayName, username: me.username } } })
}
