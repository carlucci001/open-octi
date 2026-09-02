// Serves a user's avatar as real image bytes instead of inlining a ~600KB
// base64 data URL into every JSON payload. Responses are versioned by the
// user's updatedAt (?v=), so they can be cached immutably by the browser.
import { NextResponse } from 'next/server'
import { findUserById, getCurrentUser } from '@/lib/auth'
import { decodeDataUrl, isStoredAvatar } from '@/lib/avatars'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
  const viewer = await getCurrentUser(request)
  if (!viewer) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 })

  const user = findUserById(id)
  if (!user || !isStoredAvatar(user.avatarUrl)) {
    return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
  }

  const decoded = decodeDataUrl(user.avatarUrl)
  if (!decoded) return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })

  const versioned = Boolean(searchParams.get('v'))
  return new NextResponse(decoded.buffer, {
    status: 200,
    headers: {
      'Content-Type': decoded.contentType,
      'Content-Length': String(decoded.buffer.length),
      // Versioned URLs are immutable; unversioned ones revalidate hourly.
      'Cache-Control': versioned
        ? 'private, max-age=31536000, immutable'
        : 'private, max-age=3600',
    },
  })
}
