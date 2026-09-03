import { NextResponse } from 'next/server'
import { isOpenOcti } from '@/lib/edition'
import { getOpenOctiProfile, markOpenOctiFirstLoginComplete, saveOpenOctiProfile, updateOpenOctiFirstRun } from '@/lib/openocti-profile'
import { requireCrmRead, requireCrmWrite } from '@/lib/permissions'

export async function GET(request) {
  const { error } = await requireCrmRead(request)
  if (error) return error
  if (!isOpenOcti()) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ ok: true, profile: getOpenOctiProfile() })
}

export async function POST(request) {
  const { error } = await requireCrmWrite(request)
  if (error) return error
  if (!isOpenOcti()) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  try {
    const body = await request.json()
    return NextResponse.json({ ok: true, profile: saveOpenOctiProfile(body) })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
  }
}

export async function PATCH(request) {
  const { error } = await requireCrmWrite(request)
  if (error) return error
  if (!isOpenOcti()) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  try {
    const body = await request.json()
    const profile = body.action === 'complete-first-login'
      ? markOpenOctiFirstLoginComplete()
      : updateOpenOctiFirstRun(body.action)
    return NextResponse.json({ ok: true, profile })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
  }
}
