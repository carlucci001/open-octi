import { NextResponse } from 'next/server'
import { isOpenOcti } from '@/lib/edition'
import { requireCrmRead, requireCrmWrite } from '@/lib/permissions'
import { commitOpenOctiImport, detectImportMapping, exportOpenOctiCsv, IMPORT_OBJECTS, IMPORT_PRESETS, importPresets, previewOpenOctiImport, saveImportPreset, undoOpenOctiImport } from '@/lib/openocti-import'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function unavailable() { return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 }) }
function ownerOnly(user) { return user?.role === 'owner' ? null : NextResponse.json({ ok: false, error: 'Owner access required' }, { status: 403 }) }

export async function GET(request) {
  const { user, error } = await requireCrmRead(request)
  if (error) return error
  if (!isOpenOcti()) return unavailable()
  const { searchParams } = new URL(request.url)
  const objectType = searchParams.get('export')
  if (objectType) {
    const forbidden = ownerOnly(user); if (forbidden) return forbidden
    try {
      return new NextResponse(exportOpenOctiCsv(objectType), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="openocti-${objectType}.csv"` } })
    } catch (reason) { return NextResponse.json({ ok: false, error: reason.message }, { status: 400 }) }
  }
  return NextResponse.json({ ok: true, objects: IMPORT_OBJECTS, builtInPresets: IMPORT_PRESETS, savedPresets: importPresets() })
}

export async function POST(request) {
  const { error } = await requireCrmWrite(request)
  if (error) return error
  if (!isOpenOcti()) return unavailable()
  try {
    const body = await request.json()
    if (body.action === 'detect') return NextResponse.json({ ok: true, mapping: detectImportMapping(body.headers, body.objectType) })
    if (body.action === 'preview') return NextResponse.json({ ok: true, ...previewOpenOctiImport(body.objectType, body.rows) })
    if (body.action === 'commit') return NextResponse.json(commitOpenOctiImport(body.objectType, body.rows, { skipDuplicates: body.skipDuplicates !== false }))
    if (body.action === 'undo') return NextResponse.json(undoOpenOctiImport(body.batchId))
    if (body.action === 'save-preset') return NextResponse.json({ ok: true, presets: saveImportPreset(body.preset) })
    return NextResponse.json({ ok: false, error: 'Unsupported import action' }, { status: 400 })
  } catch (reason) { return NextResponse.json({ ok: false, error: reason.message }, { status: 400 }) }
}
