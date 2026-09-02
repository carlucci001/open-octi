// DELETE /api/feed/posts/:id  — author or admin can remove a single post.
import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { readData, writeData } from '@/lib/dataStore'
import { isAdminLike } from '@/lib/roles'
import fs from 'fs'
import path from 'path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UPLOAD_DIR = path.join(process.cwd(), 'data', 'uploads', 'feed')

function load() { return readData('feed-posts.json') || { posts: [] } }
function save(d) { writeData('feed-posts.json', d) }

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

// PATCH /api/feed/posts/:id  body: { body: text }
// Author can edit their own post body. Admin can edit anyone's. Marks editedAt.
export async function PATCH(request, { params }) {
  const me = await getCurrentUser(request)
  if (!me) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  let body
  try { body = await request.json() } catch { return NextResponse.json({ ok: false, error: 'bad json' }, { status: 400 }) }
  const text = (body.body || '').toString().trim()
  if (!text) return NextResponse.json({ ok: false, error: 'body required' }, { status: 400 })
  const data = load()
  const i = (data.posts || []).findIndex(p => p.id === params.id)
  if (i === -1) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
  const post = data.posts[i]
  if (post.authorId !== me.id && !isAdminLike(me)) {
    return NextResponse.json({ ok: false, error: 'not your post' }, { status: 403 })
  }
  post.body = text
  post.editedAt = new Date().toISOString()
  save(data)
  return NextResponse.json({ ok: true, post })
}

export async function DELETE(request, { params }) {
  const me = await getCurrentUser(request)
  if (!me) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  const data = load()
  const i = (data.posts || []).findIndex(p => p.id === params.id)
  if (i === -1) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
  const post = data.posts[i]
  // Permission: own post OR admin
  if (post.authorId !== me.id && !isAdminLike(me)) {
    return NextResponse.json({ ok: false, error: 'not your post' }, { status: 403 })
  }
  // Best-effort cleanup of any attached files on disk
  for (const att of (post.attachments || [])) unlinkAttachment(att)
  data.posts.splice(i, 1)
  save(data)
  return NextResponse.json({ ok: true })
}
