import { NextResponse } from 'next/server'
import { getPublicProducts } from '@/lib/productCatalog'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
  }
}

export async function GET(_request, { params }) {
  const slug = String(params?.slug || '').trim()
  const product = getPublicProducts().find(p => p.slug === slug || p.id === slug)
  if (!product) {
    return NextResponse.json({ ok: false, error: 'Product not found' }, { status: 404, headers: corsHeaders() })
  }
  return NextResponse.json({
    ok: true,
    apiVersion: 1,
    product,
    fetchedAt: new Date().toISOString(),
  }, { headers: corsHeaders() })
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() })
}
