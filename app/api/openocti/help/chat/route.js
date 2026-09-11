import { NextResponse } from 'next/server'
import { isOpenOcti } from '@/lib/edition'
import { requireCapability } from '@/lib/permissions'
import { inspectPostiz } from '@/lib/postiz-diagnostics'
import { openOctiHelpChat } from '@/lib/openocti-help-chat'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function POST(request) {
  if (!isOpenOcti()) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { error } = await requireCapability(request, 'agents:use')
  if (error) return error
  const body = await request.json().catch(() => null)
  if (typeof body?.message !== 'string' || !body.message.trim() || body.message.length > 2000) return NextResponse.json({ error: 'Enter a question of 1–2000 characters.' }, { status: 400 })
  try {
    const history = Array.isArray(body.history) ? body.history.filter(item => ['user', 'assistant'].includes(item?.role) && typeof item.content === 'string').slice(-12).map(item => ({ role: item.role, content: item.content.slice(0, 2000) })) : []
    const result = await openOctiHelpChat(body.message.trim(), await inspectPostiz(), { history })
    return NextResponse.json({ ok: true, ...result }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ ok: false, error: 'Conversational help is unavailable. Check Models & Keys; built-in setup help still works.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}
