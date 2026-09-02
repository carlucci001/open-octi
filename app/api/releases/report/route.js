import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import { recordRelease } from '@/lib/releases'
import { notifyFailedRelease } from '@/lib/ship-desk-alerts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function authorized(request) {
  const expected = String(process.env.FCC_RELEASE_REPORT_TOKEN || '').trim()
  if (!expected) return { ok: false, status: 503, error: 'Release reporting is not configured.' }
  const supplied = String(request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  const a = Buffer.from(supplied)
  const b = Buffer.from(expected)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
    ? { ok: true }
    : { ok: false, status: 401, error: 'Unauthorized.' }
}

export async function POST(request) {
  const auth = authorized(request)
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })
  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON.' }, { status: 400 })
  }
  try {
    const result = recordRelease(body)
    if (result.release.status === 'failed') await notifyFailedRelease('farrington-command-center', result.release)
    return NextResponse.json({ ok: true, ...result }, { status: result.created ? 201 : 200 })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error?.message || 'Invalid release report.' }, { status: 400 })
  }
}
