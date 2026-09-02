import { NextResponse } from 'next/server'
import { verifyPassword, signSession, buildSessionCookie, SESSION_TTL_MS, seedInitialAdminIfEmpty } from '@/lib/auth'
import { getNetworkMode } from '@/lib/networkMode'
import { isOwner } from '@/lib/roles'
import { logAuditEvent } from '@/lib/auditLog'
import { checkLoginThrottle, clearLoginThrottle, recordLoginFailure } from '@/lib/login-rate-limit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request) {
  // First-run convenience: if there are zero users, seed Carl's admin account.
  await seedInitialAdminIfEmpty()

  let body
  try { body = await request.json() } catch { return NextResponse.json({ ok: false, error: 'bad json' }, { status: 400 }) }
  const { username, password } = body || {}
  if (!username || !password) {
    return NextResponse.json({ ok: false, error: 'username and password required' }, { status: 400 })
  }
  const locked = checkLoginThrottle(request, username)
  if (locked) {
    logAuditEvent({ request, user: null, action: 'login_rate_limited', area: 'auth', severity: 'warn', targetName: username })
    return NextResponse.json(
      { ok: false, error: 'too many failed login attempts; try again shortly', retryAfterSeconds: locked.retryAfterSeconds },
      { status: 429, headers: { 'Retry-After': String(locked.retryAfterSeconds) } }
    )
  }
  const user = await verifyPassword(username, password)
  if (user && user.suspendedReject) {
    logAuditEvent({ request, user: null, action: 'login_suspended_rejected', area: 'auth', severity: 'warn', targetName: username })
    return NextResponse.json({ ok: false, error: 'this account is suspended — contact your admin' }, { status: 403 })
  }
  if (!user) {
    const lockout = recordLoginFailure(request, username)
    if (lockout) {
      logAuditEvent({ request, user: null, action: 'login_rate_limit_started', area: 'auth', severity: 'warn', targetName: username })
      return NextResponse.json(
        { ok: false, error: 'too many failed login attempts; try again shortly', retryAfterSeconds: lockout.retryAfterSeconds },
        { status: 429, headers: { 'Retry-After': String(lockout.retryAfterSeconds) } }
      )
    }
    logAuditEvent({ request, user: null, action: 'login_failed', area: 'auth', severity: 'warn', targetName: username })
    return NextResponse.json({ ok: false, error: 'invalid credentials' }, { status: 401 })
  }
  clearLoginThrottle(request, username)
  // Solo mode: only admins can authenticate via the public internet (Cloudflare).
  // Members can still log in directly over Tailscale or LAN.
  if (!isOwner(user) && getNetworkMode() === 'solo') {
    logAuditEvent({ request, user, action: 'login_solo_mode_rejected', area: 'auth', severity: 'warn', targetName: username })
    return NextResponse.json({ ok: false, error: 'Solo Mode is on — only the admin can log in over the public web right now' }, { status: 403 })
  }
  logAuditEvent({ request, user, action: 'login_success', area: 'auth', severity: 'info', targetName: username })
  const token = await signSession({ uid: user.id, ver: user.tokenVersion || 1, exp: Date.now() + SESSION_TTL_MS })
  const res = NextResponse.json({ ok: true, user: { id: user.id, username: user.username, displayName: user.displayName, role: user.role } })
  res.headers.set('Set-Cookie', buildSessionCookie(token))
  return res
}
