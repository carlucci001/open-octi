import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { runMindStudioFlow } from '@/lib/mindstudio'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request) {
  const { error } = await requireAdmin(request)
  if (error) return error
  let body
  try { body = await request.json() } catch { return NextResponse.json({ ok: false, error: 'invalid JSON' }, { status: 400 }) }
  try {
    const result = await runMindStudioFlow(body || {})
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || 'MindStudio flow failed' }, { status: 400 })
  }
}
