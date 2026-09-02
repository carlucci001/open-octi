import { NextResponse } from 'next/server'
import { findById, update, logActivity } from '@/lib/entityStore'
import { requireCrmWrite } from '@/lib/permissions'
import { generateOpportunityRequirements } from '@/lib/opportunity-requirements'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request) {
  const { error } = await requireCrmWrite(request)
  if (error) return error

  const body = await request.json()
  const opportunityId = body.opportunityId
  if (!opportunityId) return NextResponse.json({ error: 'opportunityId required' }, { status: 400 })

  const opportunity = findById('opportunities', opportunityId)
  if (!opportunity) return NextResponse.json({ error: 'opportunity not found' }, { status: 404 })

  const account = opportunity.accountId ? findById('accounts', opportunity.accountId) : null
  const contact = opportunity.contactId ? findById('contacts', opportunity.contactId) : null
  const lead = opportunity.fromLeadId ? findById('leads', opportunity.fromLeadId) : (opportunity.leadId ? findById('leads', opportunity.leadId) : null)

  try {
    const leadRequirements = await generateOpportunityRequirements({
      opportunity,
      account,
      contact,
      lead,
      instructions: body.instructions || opportunity.notes || '',
      runResearch: body.runResearch !== false,
    })
    const updated = update('opportunities', opportunity.id, { leadRequirements })
    logActivity({
      type: 'note',
      subject: 'Lead requirements generated',
      body: leadRequirements.requirements?.summary || '',
      linkedTo: { opportunityId: opportunity.id, accountId: opportunity.accountId, contactId: opportunity.contactId, leadId: opportunity.fromLeadId || opportunity.leadId },
      meta: { parserProvider: leadRequirements.parserProvider, researchProvider: leadRequirements.research?.provider || '', researchError: leadRequirements.researchError || '' },
    })
    return NextResponse.json({ ok: true, opportunity: updated, leadRequirements })
  } catch (e) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 502 })
  }
}
