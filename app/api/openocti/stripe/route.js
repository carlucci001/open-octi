import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { isOpenOcti } from '@/lib/edition'
import { saveStripeConfiguration, stripeConfigurationStatus } from '@/lib/stripe-configuration'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const json = (body, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })

async function authorize(request) {
  if (!isOpenOcti()) return json({ error: 'Not found' }, 404)
  const user = await getCurrentUser(request)
  if (!user) return json({ error: 'Sign in required' }, 401)
  if (user.role !== 'owner') return json({ error: 'Only the installation owner can configure Stripe.' }, 403)
  return null
}

export async function GET(request) {
  const denied = await authorize(request)
  if (denied) return denied
  return json({ ok: true, stripe: stripeConfigurationStatus() })
}

export async function POST(request) {
  const denied = await authorize(request)
  if (denied) return denied
  const origin = request.headers.get('origin')
  // Docker retains the browser Host even when Next's internal URL uses port 3000.
  // Do not trust arbitrary forwarded-host values. Browsers cannot forge Host or Fetch Metadata.
  const host = request.headers.get('host') || new URL(request.url).host
  const site = request.headers.get('sec-fetch-site')
  let sameHost = !origin
  try { sameHost = !origin || (['http:', 'https:'].includes(new URL(origin).protocol) && new URL(origin).host === host.toLowerCase()) } catch {}
  if (!sameHost || (site && site !== 'same-origin' && site !== 'none')) return json({ error: 'Request origin does not match this installation.' }, 403)
  try {
    const input = await request.json()
    return json({ ok: true, stripe: await saveStripeConfiguration(input) })
  } catch (error) {
    // The configuration helper emits fixed messages, never Stripe response bodies or keys.
    return json({ ok: false, error: error instanceof SyntaxError ? 'Invalid setup request.' : error.message }, 400)
  }
}
