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

export async function GET() {
  return NextResponse.json({
    ok: true,
    apiVersion: 1,
    products: getPublicProducts(),
    endpoints: {
      list: '/api/products',
      product: '/api/products/{slugOrId}',
      checkout: '/api/products/checkout',
      orders: '/api/products/orders',
      manage: '/api/products/manage',
      bridge: '/api/products/bridge.js',
      licenseVerify: '/api/licenses/verify',
    },
    bridgeExample: '<div data-openocti-hostucts></div><script src="https://crm.example.com/api/products/bridge.js" data-api-base="https://crm.example.com" data-target="[data-openocti-hostucts]"></script>',
    fetchedAt: new Date().toISOString(),
  }, { headers: corsHeaders() })
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() })
}
