import { NextResponse } from 'next/server'
import { requireCrmWrite } from '@/lib/permissions'
import { processDomainRegistration } from '@/lib/domain-registration'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request) {
  const { error, user } = await requireCrmWrite(request)
  if (error) return error
  const input = await request.json().catch(() => ({}))
  const result = await processDomainRegistration(input, { user })
  return NextResponse.json(result.body, { status: result.status })
}
