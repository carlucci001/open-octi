import { NextResponse } from 'next/server'
import { requireCrmRead, requireCrmWrite } from '@/lib/permissions'
import { deleteLicense, getLicenseStore, publicLicense, upsertLicense } from '@/lib/licenseManager'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
  const { error } = await requireCrmRead(request)
  if (error) return error
  const store = getLicenseStore()
  return NextResponse.json({
    ok: true,
    updatedAt: store.updatedAt,
    licenses: store.licenses.map(publicLicense),
  })
}

export async function POST(request) {
  const { error } = await requireCrmWrite(request)
  if (error) return error

  try {
    const body = await request.json()
    if (body.action === 'delete') {
      return NextResponse.json({ ok: true, store: deleteLicense(body.id) })
    }
    if (body.action === 'bulk_delete') {
      let store = getLicenseStore()
      for (const id of body.ids || []) store = deleteLicense(id)
      return NextResponse.json({ ok: true, store, licenses: store.licenses.map(publicLicense) })
    }
    const store = upsertLicense(body.license || {})
    return NextResponse.json({ ok: true, store, licenses: store.licenses.map(publicLicense) })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
  }
}
