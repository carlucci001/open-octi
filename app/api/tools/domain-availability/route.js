import { NextResponse } from 'next/server'
import { lookupDomainAvailability } from '@/lib/domain-availability'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
  const domain = new URL(request.url).searchParams.get('domain')
  try {
    // Authentication remains enforced by the CRM API middleware.
    return NextResponse.json(await lookupDomainAvailability(domain))
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: error.status === 400 ? 400 : 503 })
  }
}
