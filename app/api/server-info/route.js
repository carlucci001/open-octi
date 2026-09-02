import { NextResponse } from 'next/server'
import { getServerEndpoints } from '@/lib/serverInfo'
import { requireAdmin } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
  const { error } = await requireAdmin(request)
  if (error) return error
  const port = Number(process.env.PORT) || 3000
  const endpoints = await getServerEndpoints({ port })
  return NextResponse.json({ ok: true, endpoints })
}
