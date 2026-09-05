import { requireAdmin } from '@/lib/auth'
import { takeVoiceOperatorRun } from '@/lib/operator-agent/voice-queue'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
  const { error } = await requireAdmin(request)
  if (error) return error
  return Response.json({ ok: true, pending: takeVoiceOperatorRun() })
}
