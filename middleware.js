import { NextResponse } from 'next/server'
import { clearSessionCookie, verifySession, SESSION_COOKIE } from '@/lib/authEdge'
import { isClosedSurface } from '@/lib/edition'
import { capabilityForPath, notConfiguredPayload } from '@/lib/feature-manifest'

// Paths that bypass auth.
const PUBLIC_PREFIXES = [
  '/login',
  '/api/auth/',
  '/api/build-info',
  '/portal',
  '/api/portal/',
  '/invoice/',
  '/api/twilio/',
  '/api/voice/',
  '/api/leads/inbound',
  '/api/stripe/',
  // Privacy.com transaction webhooks are server-to-server advice messages.
  // Keep the Finance API protected, but let Privacy POST lifecycle events here.
  '/api/privacy/transaction-webhook',
  // Invoice payment return flow. The route itself still enforces CRM auth for
  // staff actions; only Stripe session-verified payment checks are public.
  '/api/invoices',
  // Public lease/pricing display on farringtondevelopment.com — the marketing
  // site's lease.html fetches tiers from here to render the "Pick a tier" grid.
  // Read-only; ?withMargin=1 is gated inside the route, not here.
  '/api/pricing',
  // Public website-to-Command-Center bridge routes. Each route must enforce its
  // own server-to-server secret; the session middleware would block Vercel
  // functions before those route-level checks run.
  '/api/public/',
  // Public website-agent embed. The launcher, iframe panel, and chat endpoint
  // are intentionally callable from client websites; the chat route exposes
  // only public-facing agent behavior and does not grant CRM/OpenClaw tools.
  '/agent-widget',
  '/api/agent-widget',
  // Public signer-facing e-signature flow. Creating/sending documents stays
  // protected under /api/documents; only the tokenized signing page is public.
  '/sign/',
  '/api/signatures/',
  // ElevenLabs agent tools (Maggie/Doreen webhooks). These guard themselves
  // with Bearer CONCIERGE_TOOL_SECRET, so they don't need the admin session
  // cookie. Without this exclusion, every report_to_carl, doreen-post-call,
  // book-demo, find-contact, and send-email call from a voice agent fails
  // with 401 and the activity log stays empty.
  '/api/concierge/',
  // Agent execution endpoints — called by ElevenLabs voice agents (Maggie,
  // Doreen, etc.) as their tool URLs. Some of these check their own Bearer
  // token; others were designed for trusted local-network use and have no
  // explicit auth. Either way, putting the admin-cookie middleware in front
  // of them broke every voice agent's tool dispatch.
  '/api/agent/',
  '/api/agents/',
  // OpenClaw plugin's CRM bridge — the OpenClaw runtime calls these routes
  // to read leads/clients/credentials/etc. and to dispatch actions back to
  // the CRM. Required for the OpenClaw integration to work at all.
  '/api/openclaw/',
  // ElevenLabs platform callbacks (agent-sync events, usage reports).
  '/api/elevenlabs/',
  // Platform Admin contract resources authenticate with their own constant-time
  // bearer check. Allow every current and future v1 resource to reach it.
  '/api/platform-admin/v1/',
  // Jules voice-task webhook — Craig (and any other voice agent) hits this
  // with Bearer CONCIERGE_TOOL_SECRET to delegate coding tasks to Jules.
  '/api/jules/',
  '/_next',
  '/favicon',
  '/robots.txt',
  '/sitemap',
]

const PUBLIC_EXACT = [
  '/api/build-info',
  // Builder exchanges a short-lived signed owner handoff here before it has a
  // CRM session cookie. The route validates and consumes the one-time code.
  '/api/builder/handoff',
  // Release automation authenticates with FCC_RELEASE_REPORT_TOKEN. Let the
  // route enforce that bearer token without requiring a CRM browser session.
  '/api/releases/report',
  // Hermes/Nightwatch calls the incident poll with its dedicated bearer.
  '/api/ops/incidents/poll',
  // Public platform capability manifest used for registration and discovery.
  '/.well-known/farrington-platform.json',
  // Sanitized public status surface; incident publication remains Carl-only.
  '/status',
  // GetFound3 signs every request with its dedicated HMAC secret. Let the
  // receiver perform that authentication instead of requiring a CRM session.
  '/api/integrations/seo-visibility',
  // MyVTC signs this one webhook receiver with its dedicated HMAC secret.
  '/api/integrations/myvtc/webhook',
  '/api/products',
  '/api/products/bridge.js',
  '/api/products/inquiry',
  // ElevenLabs Lucci booking tool posts here. The route itself now accepts
  // either a logged-in CRM session or Bearer CONCIERGE_TOOL_SECRET.
  '/api/calendar/book',
  '/api/website/intake',
  '/api/licenses/verify',
]

function isPublic(pathname) {
  if (PUBLIC_EXACT.includes(pathname)) return true
  if (/^\/api\/products\/[^/]+$/.test(pathname)) return true
  return PUBLIC_PREFIXES.some(p => pathname === p || pathname.startsWith(p))
}

// Build the /login redirect on the PUBLIC origin. Behind the Cloudflare
// tunnel, request.nextUrl reflects the internal binding (localhost:3000), so a
// cloned-nextUrl redirect sent browsers and the installed PWA to
// https://localhost:3000/login. Prefer forwarded headers, refuse to ever emit
// a localhost redirect in production.
export function loginRedirectUrl(request, pathname, env = process.env) {
  const proto = request.headers.get('x-forwarded-proto') || request.nextUrl.protocol.replace(':', '')
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || request.nextUrl.host
  const isInternal = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host)
  const base = isInternal && env.NODE_ENV === 'production'
    ? (env.PUBLIC_APP_URL || env.NEXT_PUBLIC_APP_URL || `${proto}://${host}`)
    : `${proto}://${host}`
  const url = new URL('/login', base)
  url.searchParams.set('next', pathname + (request.nextUrl.search || ''))
  return url
}

function authGateUrl(request) {
  const configured = process.env.FCC_AUTH_GATE_ORIGIN || process.env.CRM_INTERNAL_ORIGIN
  const productionLocal = request.nextUrl.hostname === 'openocti.local'
    ? 'http://127.0.0.1:3000'
    : ''
  return new URL('/api/auth/me', configured || productionLocal || request.url)
}

export async function middleware(request) {
  const { pathname } = request.nextUrl
  if (isClosedSurface(pathname)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  if (pathname.startsWith('/api/')) {
    const capabilityId = capabilityForPath(pathname)
    const unavailable = capabilityId ? notConfiguredPayload(capabilityId) : null
    if (unavailable) return NextResponse.json(unavailable, { status: 503 })
  }
  if (isPublic(pathname)) return NextResponse.next()

  const token = request.cookies.get(SESSION_COOKIE)?.value
  const session = token ? await verifySession(token) : null

  if (!session) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
    }
    return NextResponse.redirect(loginRedirectUrl(request, pathname))
  }

  const gate = await fetch(authGateUrl(request), {
    headers: {
      cookie: `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
      'x-fcc-auth-gate': 'middleware',
      'user-agent': 'Farrington-Command-Center/AuthGate',
    },
    cache: 'no-store',
  }).catch(() => null)

  if (!gate?.ok) {
    const gateContentType = gate?.headers?.get?.('content-type') || ''
    const gateIsCrmJson = gateContentType.includes('application/json')
    if (!gate || !gateIsCrmJson || ![401, 403].includes(gate.status)) {
      return NextResponse.next()
    }

    if (pathname.startsWith('/api/')) {
      const res = NextResponse.json(
        { ok: false, error: gate?.status === 403 ? 'solo mode active' : 'unauthorized' },
        { status: gate?.status === 403 ? 403 : 401 }
      )
      res.headers.set('Set-Cookie', clearSessionCookie())
      return res
    }
    const res = NextResponse.redirect(loginRedirectUrl(request, pathname))
    res.headers.set('Set-Cookie', clearSessionCookie())
    return res
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|gesture-lab\\.html|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|mp4|mov|webm|m4v|css|js|woff|woff2|ttf|eot)).*)'],
}
