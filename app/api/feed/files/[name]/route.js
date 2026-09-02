// Reads an uploaded feed attachment from disk and streams it back. Auth-required:
// only logged-in CRM users can view files posted to the feed.
//
// Uses Node fs (not Next's static manifest) so files uploaded AFTER the most
// recent build are still served. Live uploads need this — the public/ folder
// is fixed at build time.
import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import fs from 'fs'
import path from 'path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UPLOAD_DIR = path.join(process.cwd(), 'data', 'uploads', 'feed')

const MIME_BY_EXT = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.heic': 'image/heic', '.bmp': 'image/bmp',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.webm': 'audio/webm',
  '.m4a': 'audio/mp4', '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4', '.mov': 'video/quicktime',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
}

export async function GET(request, { params }) {
  const me = await getCurrentUser(request)
  if (!me) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

  // Defend against ../../ traversal: only a basename is allowed.
  const raw = decodeURIComponent(params.name || '')
  if (!raw || raw.includes('/') || raw.includes('\\') || raw.startsWith('.')) {
    return NextResponse.json({ ok: false, error: 'invalid name' }, { status: 400 })
  }
  const full = path.join(UPLOAD_DIR, raw)
  if (!full.startsWith(UPLOAD_DIR + path.sep) && full !== UPLOAD_DIR) {
    return NextResponse.json({ ok: false, error: 'invalid path' }, { status: 400 })
  }
  if (!fs.existsSync(full)) {
    return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
  }

  const ext = path.extname(raw).toLowerCase()
  const mime = MIME_BY_EXT[ext] || 'application/octet-stream'
  const data = fs.readFileSync(full)
  return new NextResponse(data, {
    status: 200,
    headers: {
      'Content-Type': mime,
      'Content-Length': String(data.length),
      'Cache-Control': 'private, max-age=3600',
    },
  })
}
