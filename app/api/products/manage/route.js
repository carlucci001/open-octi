import { NextResponse } from 'next/server'
import { requireCrmRead, requireCrmWrite } from '@/lib/permissions'
import { getProductCatalog, normalizeProduct, saveProductCatalog } from '@/lib/productCatalog'
import { copyCatalogItem } from '@/lib/productCatalogEditing'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
  const { error } = await requireCrmRead(request)
  if (error) return error
  return NextResponse.json({ ok: true, catalog: getProductCatalog() })
}

export async function POST(request) {
  const { error } = await requireCrmWrite(request)
  if (error) return error

  try {
    const body = await request.json()
    const action = body.action || 'save'
    const catalog = getProductCatalog()

    if (action === 'copy-item') {
      const target = catalog.products.find(product => product.id === body.targetProductId)
      if (!target) throw new Error('Target product not found')
      const source = normalizeProduct(body.sourceProduct || {})
      const copied = copyCatalogItem(source, target, body.kind, body.itemId)
      const saved = saveProductCatalog({ ...catalog, products: catalog.products.map(product => product.id === target.id ? copied : product) })
      return NextResponse.json({ ok: true, catalog: saved })
    }

    if (action === 'replace-catalog') {
      const saved = saveProductCatalog(body.catalog || {})
      return NextResponse.json({ ok: true, catalog: saved })
    }

    if (action === 'bulk_delete') {
      const ids = new Set((body.ids || []).filter(Boolean))
      const saved = saveProductCatalog({ ...catalog, products: catalog.products.filter(product => !ids.has(product.id)) })
      return NextResponse.json({ ok: true, catalog: saved, deleted: ids.size })
    }

    const product = normalizeProduct(body.product || {})
    if (!product.id) return NextResponse.json({ ok: false, error: 'Product id required' }, { status: 400 })

    const products = [...catalog.products]
    const idx = products.findIndex(p => p.id === product.id)
    if (action === 'delete') {
      if (idx >= 0) products.splice(idx, 1)
    } else if (idx >= 0) {
      products[idx] = product
    } else {
      products.unshift(product)
    }

    const saved = saveProductCatalog({ ...catalog, products })
    return NextResponse.json({ ok: true, catalog: saved })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
  }
}
