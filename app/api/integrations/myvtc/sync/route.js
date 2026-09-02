import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { logAuditEvent } from '@/lib/auditLog'
import { syncContactMessages } from '@/lib/myvtc/sync'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request) {
  const { error, user } = await requireAdmin(request)
  if (error) return error
  try {
    const result = await syncContactMessages()
    logAuditEvent({
      request,
      user,
      action: 'myvtc_contacts_synced',
      area: 'integrations',
      targetName: 'MyVTC contact messages',
      meta: result,
    })
    return NextResponse.json({ ok: true, ...result })
  } catch (syncError) {
    const code = /^[A-Z0-9_:-]{1,80}$/.test(String(syncError?.code || '')) ? syncError.code : 'UPSTREAM_ERROR'
    return NextResponse.json({ error: code }, { status: syncError?.status === 503 ? 503 : 502 })
  }
}
