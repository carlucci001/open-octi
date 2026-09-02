import { NextResponse } from 'next/server'
import { verifyLicense } from '@/lib/licenseManager'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
  }
}

export async function POST(request) {
  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ valid: false, status: 'bad_request', reason: 'Bad JSON' }, { status: 400, headers: corsHeaders() })
  }

  return NextResponse.json(verifyLicense({
    licenseKey: body.licenseKey,
    productId: body.productId,
    domain: body.domain,
    version: body.version,
  }), { headers: corsHeaders() })
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() })
}
