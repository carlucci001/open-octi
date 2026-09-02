import { NextResponse } from 'next/server'
import { checkoutCorsHeaders, createProductCheckoutSession } from '@/lib/productCheckout'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request) {
  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Bad JSON' }, { status: 400, headers: checkoutCorsHeaders() })
  }

  try {
    const origin = request.headers.get('origin') || process.env.NEXT_PUBLIC_MARKETING_URL || 'https://farringtondevelopment.com'
    const returnPath = String(body.returnPath || '/products.html').startsWith('/') ? String(body.returnPath || '/products.html') : '/products.html'
    const result = await createProductCheckoutSession({ body, origin, returnPath })
    return NextResponse.json(result, { headers: checkoutCorsHeaders() })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: error.status || 500, headers: checkoutCorsHeaders() })
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      ...checkoutCorsHeaders(),
      'Access-Control-Max-Age': '86400',
    },
  })
}
