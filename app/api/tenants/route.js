// Tenants — companies that own/lease agents.
// In-house tenants are Carl's own brands (Farrington Development, ContentHub).
// Leased tenants are external customers paying a monthly fee for their agent fleet.
//
// GET → return all tenants + per-tenant agent count, derived from data/agents.json + data/leases.json.

import { NextResponse } from 'next/server'
import { readData } from '@/lib/dataStore'
import { requireAdmin } from '@/lib/auth'
import { listInternalLineAssignments } from '@/lib/communicationLines'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
  const { error: __adminError } = await requireAdmin(request); if (__adminError) return __adminError
  const tenantsFile = readData('tenants.json') || { tenants: {} }
  const agentsFile = readData('agents.json') || { agents: {} }
  const leasesFile = readData('leases.json') || { leases: [] }
  const accountsFile = readData('accounts.json') || { accounts: [] }

  // Count agents per tenant
  const agentCounts = {}
  for (const ag of Object.values(agentsFile.agents || {})) {
    const t = ag.tenantId || 'farrington-development'
    agentCounts[t] = (agentCounts[t] || 0) + 1
  }

  // Active leases per tenant (a leased tenant has an entry in leases.json with status=active)
  const leasesByTenant = {}
  for (const lease of (leasesFile.leases || [])) {
    if (lease.status !== 'active') continue
    leasesByTenant[lease.tenantId] = lease
  }

  // Build the tenant list — in-house tenants from tenants.json, leased tenants from leases.json
  const all = []
  for (const t of Object.values(tenantsFile.tenants || {})) {
    all.push({
      ...t,
      agentCount: agentCounts[t.id] || 0,
      isLeased: false,
    })
  }
  // Also add any tenants that exist as a lease but weren't pre-declared (auto-create on first lease)
  for (const lease of (leasesFile.leases || [])) {
    if (lease.status !== 'active') continue
    if (all.some(x => x.id === lease.tenantId)) continue
    const account = (accountsFile.accounts || []).find(a => a.id === lease.clientAccountId)
    all.push({
      id: lease.tenantId,
      name: lease.tenantName || account?.name || lease.tenantId,
      kind: 'leased',
      isLeased: true,
      lease,
      agentCount: agentCounts[lease.tenantId] || 0,
    })
  }

  return NextResponse.json({
    ok: true,
    tenants: all,
    communicationLines: listInternalLineAssignments(agentsFile.agents || {}),
  })
}
