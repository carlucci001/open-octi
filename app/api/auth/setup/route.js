import { NextResponse } from 'next/server'
import { needsFirstRunAccount, isLocalSetupRequest, createFirstRunAccount } from '@/lib/first-run-account'
import { signSession, buildSessionCookie, SESSION_TTL_MS } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
  return NextResponse.json({ required: needsFirstRunAccount(), local: isLocalSetupRequest(request) }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request) {
  if (!isLocalSetupRequest(request, true)) {
    return NextResponse.json({ error: 'Create the first account from localhost on the Docker host, or configure INITIAL_ADMIN_PASSWORD for a remote installation.' }, { status: 403 })
  }
  if (!needsFirstRunAccount()) return NextResponse.json({ error: 'Account setup is already complete or managed by the installer.' }, { status: 409 })
  try {
    const body = await request.text()
    if (body.length > 4096) return NextResponse.json({ error: 'Setup request is too large.' }, { status: 413 })
    let input
    try { input = JSON.parse(body) } catch { return NextResponse.json({ error: 'Enter your account details and try again.' }, { status: 400 }) }
    const user = await createFirstRunAccount(input || {})
    const token = await signSession({ uid: user.id, ver: user.tokenVersion || 1, exp: Date.now() + SESSION_TTL_MS })
    return NextResponse.json({ ok: true, user }, { headers: { 'Set-Cookie': buildSessionCookie(token), 'Cache-Control': 'no-store' } })
  } catch (error) {
    return NextResponse.json({ error: error.status ? error.message : 'Account setup could not finish. Check the application logs and try signing in if your account was created.' }, { status: error.status || 500 })
  }
}
