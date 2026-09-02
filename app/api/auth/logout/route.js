import { NextResponse } from 'next/server'
import { clearSessionCookie } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST() {
  const res = NextResponse.json({ ok: true })
  res.headers.set('Set-Cookie', clearSessionCookie())
  return res
}
