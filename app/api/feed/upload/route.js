// Multipart upload for feed-post attachments (file / image / voice memo).
// Saves to data/uploads/feed/<random>-<safe-name> (NOT public/) so that
// served files are gated by auth and don't depend on Next's build-time
// static manifest. The public URL we return is /api/feed/files/<name> —
// see app/api/feed/files/[name]/route.js for the reader.
import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import fs from 'fs'
import path from 'path'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UPLOAD_DIR = path.join(process.cwd(), 'data', 'uploads', 'feed')

function safeName(name) {
  return (name || 'file').replace(/[^a-z0-9._-]/gi, '_').slice(0, 80)
}

function kindFromMime(mime) {
  if (!mime) return 'file'
  if (mime.startsWith('image/')) return 'image'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime.startsWith('video/')) return 'video'
  return 'file'
}

export async function POST(request) {
  const me = await getCurrentUser(request)
  if (!me) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

  let form
  try { form = await request.formData() } catch { return NextResponse.json({ ok: false, error: 'bad multipart' }, { status: 400 }) }
  const file = form.get('file')
  if (!file || typeof file === 'string') return NextResponse.json({ ok: false, error: 'no file' }, { status: 400 })
  if (file.size > 25 * 1024 * 1024) return NextResponse.json({ ok: false, error: 'file too large (max 25 MB)' }, { status: 413 })

  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true })

  const stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  const filename = stamp + '-' + safeName(file.name)
  const dest = path.join(UPLOAD_DIR, filename)
  const buf = Buffer.from(await file.arrayBuffer())
  fs.writeFileSync(dest, buf)

  return NextResponse.json({
    ok: true,
    attachment: {
      kind: kindFromMime(file.type),
      url: '/api/feed/files/' + encodeURIComponent(filename),
      name: file.name,
      mime: file.type || 'application/octet-stream',
      sizeBytes: file.size,
    },
  })
}
