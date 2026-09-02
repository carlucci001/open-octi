import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function cleanBase(value) {
  return String(value || '').trim().replace(/\/+$/, '')
}

function splitSetCookies(headers) {
  if (typeof headers.getSetCookie === 'function') return headers.getSetCookie()
  const merged = headers.get?.('set-cookie') || ''
  return merged ? merged.split(/,\s*(?=[^;,]+=)/) : []
}

function parseCookieHeader(header) {
  const [pair] = String(header || '').split(';')
  const idx = pair.indexOf('=')
  if (idx < 1) return null
  return {
    name: pair.slice(0, idx).trim(),
    value: pair.slice(idx + 1).trim(),
  }
}

export async function GET(request) {
  const { error } = await requireAdmin(request)
  if (error) return error

  const base = cleanBase(process.env.DEERFLOW_API_BASE_URL || process.env.DEER_FLOW_API_BASE_URL || 'http://127.0.0.1:2026')
  const target = cleanBase(process.env.DEERFLOW_BROWSER_DASHBOARD_URL || process.env.DEERFLOW_DASHBOARD_URL || 'https://deerflow.farringtondevelopment.com')
  const email = process.env.DEERFLOW_ADMIN_EMAIL || ''
  const password = process.env.DEERFLOW_ADMIN_PASSWORD || ''

  if (!email || !password) {
    return NextResponse.json({ ok: false, error: 'DeerFlow auto-login is not configured.' }, { status: 500 })
  }

  const login = await fetch(`${base}/api/v1/auth/login/local`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Origin: target,
      'User-Agent': 'Farrington-Command-Center/DeerFlowAutoLogin',
      'X-Forwarded-Proto': 'https',
    },
    body: new URLSearchParams({ username: email, password }),
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  }).catch(e => ({ ok: false, status: 502, error: e.message, headers: new Headers() }))

  if (!login.ok) {
    return NextResponse.json({ ok: false, error: login.error || `DeerFlow login failed with HTTP ${login.status}` }, { status: login.status || 502 })
  }

  const response = NextResponse.redirect(target)
  const cookieDomain = '.farringtondevelopment.com'
  for (const header of splitSetCookies(login.headers)) {
    const cookie = parseCookieHeader(header)
    if (!cookie || !['access_token', 'csrf_token'].includes(cookie.name)) continue
    response.cookies.set(cookie.name, cookie.value, {
      domain: cookieDomain,
      path: '/',
      httpOnly: cookie.name === 'access_token',
      secure: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
    })
  }

  return response
}
