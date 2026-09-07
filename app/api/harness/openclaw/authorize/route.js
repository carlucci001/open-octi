import { requireAdmin } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
  const { error } = await requireAdmin(request)
  return error || new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } })
}
