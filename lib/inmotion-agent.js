import { getRequestTenantContext } from './entityStore'
import { getInMotionStatus } from './inmotion-openstack'

/** Keep the private infrastructure reader out of client and leased-agent sessions. */
export async function readInMotionForAgent({ principal } = {}) {
  // Shared machine keys do not prove which tenant is calling. Require the
  // administrator's verified session rather than caller-supplied agent metadata.
  const authorized = principal?.kind === 'session' && ['owner', 'admin'].includes(principal.role)
  const tenant = getRequestTenantContext()
  if (!authorized || tenant?.tenantId !== 'farrington-development' || tenant?.leaseId) {
    throw new Error('Private VPC access requires an internal administrator session')
  }
  return getInMotionStatus({ refresh: true })
}
