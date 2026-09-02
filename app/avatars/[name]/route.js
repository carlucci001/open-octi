import fs from 'fs'
import path from 'path'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PUBLIC_DIR = path.join(process.cwd(), 'public', 'avatars')

function mimeFromExt(name) {
  const ext = String(name || '').split('.').pop()?.toLowerCase()
  const map = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
    svg: 'image/svg+xml',
  }
  return map[ext] || 'application/octet-stream'
}

export async function GET(_request, { params }) {
  const name = String(params?.name || '')
  if (!name || name !== path.basename(name)) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  const filePath = path.join(PUBLIC_DIR, name)
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  return new NextResponse(fs.readFileSync(filePath), {
    headers: {
      'Content-Type': mimeFromExt(name),
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
    },
  })
}
