import fs from 'fs'
import path from 'path'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PUBLIC_DIR = path.join(process.cwd(), 'public', 'media')

function mimeFromExt(name) {
  const ext = String(name || '').split('.').pop()?.toLowerCase()
  const map = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    mp4: 'video/mp4',
    mov: 'video/quicktime',
    webm: 'video/webm',
    m4v: 'video/x-m4v',
  }
  return map[ext] || 'application/octet-stream'
}

function mimeFromFile(name, buffer) {
  if (buffer?.length >= 8) {
    const sig = buffer.subarray(0, 12).toString('hex')
    if (sig.startsWith('89504e47')) return 'image/png'
    if (sig.startsWith('ffd8ff')) return 'image/jpeg'
    if (sig.startsWith('47494638')) return 'image/gif'
    if (buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP') return 'image/webp'
    if (buffer.subarray(4, 8).toString() === 'ftyp') return mimeFromExt(name)
  }
  const start = buffer?.subarray(0, 128).toString('utf8').trimStart().toLowerCase() || ''
  if (start.startsWith('<svg')) return 'image/svg+xml'
  return mimeFromExt(name)
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
  const buffer = fs.readFileSync(filePath)

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': mimeFromFile(name, buffer),
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
    },
  })
}
