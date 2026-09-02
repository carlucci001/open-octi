// Lease records — when Carl leases an agent (or fleet) to a client account.
// GET → list all leases.
// POST { agentId, clientAccountId, monthlyFee, startDate, notes? } → create a lease.
//
// Side effect: when a lease is created, the agent's tenantId flips from in-house to a
// tenant id derived from the client account, and a new tenant entry is auto-derivable
// (the /api/tenants endpoint reads leases.json and produces the leased tenants on the fly).

import { NextResponse } from 'next/server'
import { readData, writeData } from '@/lib/dataStore'
import { requireAdmin } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function tenantIdFromAccount(account) {
  // Stable, slug-style id derived from account name. Lowercase, hyphenated.
  const slug = (account.name || account.id || 'tenant')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `lease-${account.id || slug}`
}

export async function GET(request) {
  const { error } = await requireAdmin(request)
  if (error) return error
  const lf = readData('leases.json') || { leases: [] }
  return NextResponse.json({ ok: true, leases: lf.leases || [] })
}

export async function POST(request) {
  const { error } = await requireAdmin(request)
  if (error) return error
  let body
  try { body = await request.json() } catch { return NextResponse.json({ ok: false, error: 'Bad JSON' }, { status: 400 }) }

  if (body.action === 'update') {
    const leaseId = body.id || body.lease?.id
    if (!leaseId) return NextResponse.json({ ok: false, error: 'lease id required' }, { status: 400 })
    const leasesFile = readData('leases.json') || { leases: [] }
    const lease = (leasesFile.leases || []).find(l => l.id === leaseId)
    if (!lease) return NextResponse.json({ ok: false, error: 'lease not found' }, { status: 404 })

    const patch = body.lease || {}
    for (const key of [
      'tierId', 'tierName', 'monthlyFee', 'startDate', 'status', 'notes',
      'addons', 'twilioPhoneNumber', 'stripeCustomerId', 'stripeSubscriptionId',
      'supportStatus', 'supportEndsAt', 'billingNotes',
    ]) {
      if (patch[key] !== undefined) lease[key] = key === 'monthlyFee' ? Number(patch[key]) || 0 : patch[key]
    }
    lease.updatedAt = new Date().toISOString()
    leasesFile.lastUpdated = lease.updatedAt
    writeData('leases.json', leasesFile)
    return NextResponse.json({ ok: true, lease, leases: leasesFile.leases || [] })
  }

  const { agentId, clientAccountId, tierId, tierName, monthlyFee, startDate, notes, addons } = body
  if (!agentId) return NextResponse.json({ ok: false, error: 'agentId required' }, { status: 400 })
  if (!clientAccountId) return NextResponse.json({ ok: false, error: 'clientAccountId required' }, { status: 400 })

  const agentsFile = readData('agents.json') || { agents: {} }
  const agent = agentsFile.agents?.[agentId]
  if (!agent) return NextResponse.json({ ok: false, error: `agent ${agentId} not found` }, { status: 404 })

  const accountsFile = readData('accounts.json') || { accounts: [] }
  const account = (accountsFile.accounts || []).find(a => a.id === clientAccountId)
  if (!account) return NextResponse.json({ ok: false, error: `account ${clientAccountId} not found` }, { status: 404 })

  const tenantId = tenantIdFromAccount(account)
  const leaseId = `lease-${Date.now().toString(36)}`
  const lease = {
    id: leaseId,
    agentId,
    agentName: agent.name,
    tenantId,
    tenantName: account.name,
    clientAccountId,
    tierId: tierId || null,
    tierName: tierName || null,
    monthlyFee: Number(monthlyFee) || 0,
    startDate: startDate || new Date().toISOString().slice(0, 10),
    status: 'active',
    notes: notes || '',
    addons: addons || { tools: [], specialties: [], premiumModels: [] },
    createdAt: new Date().toISOString(),
  }

  const leasesFile = readData('leases.json') || { leases: [] }
  leasesFile.leases = leasesFile.leases || []
  leasesFile.leases.push(lease)
  leasesFile.lastUpdated = new Date().toISOString()
  writeData('leases.json', leasesFile)

  // Flip agent's tenantId to the leased tenant
  agent.tenantId = tenantId
  agent.leaseId = leaseId
  agentsFile.lastUpdated = new Date().toISOString()
  writeData('agents.json', agentsFile)

  return NextResponse.json({ ok: true, lease, tenantId })
}

export async function DELETE(request) {
  const { error } = await requireAdmin(request)
  if (error) return error
  // Cancel a lease — flips agent back to in-house and marks lease as cancelled
  const url = new URL(request.url)
  const leaseId = url.searchParams.get('id')
  if (!leaseId) return NextResponse.json({ ok: false, error: 'lease id required' }, { status: 400 })

  const leasesFile = readData('leases.json') || { leases: [] }
  const lease = (leasesFile.leases || []).find(l => l.id === leaseId)
  if (!lease) return NextResponse.json({ ok: false, error: 'lease not found' }, { status: 404 })

  lease.status = 'cancelled'
  lease.cancelledAt = new Date().toISOString()
  leasesFile.lastUpdated = new Date().toISOString()
  writeData('leases.json', leasesFile)

  // Flip the agent back to in-house (Farrington Development by default)
  const agentsFile = readData('agents.json') || { agents: {} }
  const ag = agentsFile.agents?.[lease.agentId]
  if (ag) {
    ag.tenantId = 'farrington-development'
    delete ag.leaseId
    agentsFile.lastUpdated = new Date().toISOString()
    writeData('agents.json', agentsFile)
  }

  return NextResponse.json({ ok: true, lease })
}
