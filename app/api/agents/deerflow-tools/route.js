import { NextResponse } from 'next/server'
import { requireCapability } from '@/lib/permissions'
import { listDeerFlowReadOnlyTools } from '@/lib/deerflow-tools'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
  const { error } = await requireCapability(request, 'agents:use')
  if (error) return error

  try {
    const result = await listDeerFlowReadOnlyTools()
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({
      ok: false,
      provider: 'deerflow-hetzner',
      error: e.message || 'Could not list DeerFlow tools',
    }, { status: 502 })
  }
}
