import { NextResponse } from 'next/server'
import { requireCapability } from '@/lib/permissions'
import bridge from '@/lib/twilio-agent-bridge'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
  const { error } = await requireCapability(request, 'voice:use')
  if (error) return error
  return NextResponse.json(bridge.bridgeStatus())
}
