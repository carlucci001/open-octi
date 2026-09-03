import { NextResponse } from 'next/server'
import { isOpenOcti } from '@/lib/edition'
import { requireCrmRead, requireCrmWrite } from '@/lib/permissions'
import { openOctiSampleStatus, setOpenOctiSamples } from '@/lib/openocti-sample-data'

export async function GET(request) {
  const { error } = await requireCrmRead(request); if (error) return error
  if (!isOpenOcti()) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ok: true, ...openOctiSampleStatus() })
}
export async function POST(request) {
  const { error } = await requireCrmWrite(request); if (error) return error
  if (!isOpenOcti()) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const body = await request.json()
  return NextResponse.json({ ok: true, ...setOpenOctiSamples(body.enabled === true) })
}
