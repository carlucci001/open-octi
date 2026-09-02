import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'

function configuredKey() {
  return String(process.env.FCC_PLATFORM_ADMIN_API_KEY || process.env.PLATFORM_ADMIN_API_KEY || '').trim()
}

function equalSecret(left, right) {
  const a = Buffer.from(String(left || ''))
  const b = Buffer.from(String(right || ''))
  return a.length === b.length && timingSafeEqual(a, b)
}

function errorResponse(code, message, status) {
  return NextResponse.json({ error: { code, message } }, { status, headers: { 'Cache-Control': 'no-store' } })
}

export async function authorizePlatformAdminRequest(request) {
  const expected = configuredKey()
  if (!expected) return errorResponse('NOT_CONFIGURED', 'Platform Admin authentication is not configured.', 503)
  const authorization = String(request.headers.get('authorization') || '')
  const presented = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
  if (!presented || !equalSecret(presented, expected)) {
    return errorResponse('UNAUTHORIZED', 'A valid Platform Admin bearer credential is required.', 401)
  }
  return null
}
