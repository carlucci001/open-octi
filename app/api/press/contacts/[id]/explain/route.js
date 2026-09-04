import { NextResponse } from 'next/server'
import { requireCrmRead } from '@/lib/permissions'
import { explainPressContact } from '@/lib/press/query'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request, { params }) {
  const { error } = await requireCrmRead(request)
  if (error) return error
  const { id } = await params
  const result = explainPressContact(String(id || ''))
  if (!result) return NextResponse.json({ ok: false, error: 'Press contact not found' }, { status: 404 })
  return NextResponse.json({ ok: true, ...result })
}
