import { NextResponse } from 'next/server'
import { requireCapability } from '@/lib/permissions'
import { runDeepResearchDossier } from '@/lib/deep-research'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request) {
  const { error } = await requireCapability(request, 'agents:use')
  if (error) return error

  try {
    const body = await request.json().catch(() => ({}))
    const result = await runDeepResearchDossier({
      target: body.target || body.person || body.company || body.query,
      context: body.context || body.notes || '',
      subjectType: body.subjectType || body.type || 'person_or_company',
      usePerplexity: body.usePerplexity !== false,
      source: body.source || 'api',
      accountId: body.accountId || '',
      clientId: body.clientId || body.accountId || '',
      productId: body.productId || 'research',
      requestId: body.requestId || '',
      agentId: body.agentId || 'deep-research-analyst',
    })
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message || 'Deep research failed' }, { status: 502 })
  }
}
