function jsonError(code, message, status) {
  return Response.json({ error: { code, message } }, { status, headers: { 'Cache-Control': 'no-store' } })
}

export function createBearerMiddleware({ getBearerKey, verifyHmac = null } = {}) {
  const middleware = async request => {
    const expected = String(await getBearerKey?.() || '').trim()
    if (!expected) return jsonError('NOT_CONFIGURED', 'Platform Admin authentication is not configured.', 503)
    const authorization = String(request.headers.get('authorization') || '')
    const presented = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
    if (!presented || presented !== expected) return jsonError('UNAUTHORIZED', 'A valid Platform Admin bearer credential is required.', 401)
    return null
  }
  // Phase 3 extension point. The scaffold intentionally ships no HMAC algorithm.
  middleware.verifyHmac = typeof verifyHmac === 'function' ? verifyHmac : null
  return middleware
}
