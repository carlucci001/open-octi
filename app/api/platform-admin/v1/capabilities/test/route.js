import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { OPENOCTI_MODEL_PROVIDERS, resolveProviderKey } from '@/lib/openocti-keys'
import { capabilityStatus } from '@/lib/feature-manifest'
import { testIntegrationConnection } from '@/lib/integration-probes'
import { recordIntegrationTest } from '@/lib/integration-test-status'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request) {
  const user = await getCurrentUser(request)
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  if (!['owner', 'admin'].includes(user.role)) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 })

  const { capability } = await request.json().catch(() => ({}))
  if (!capability) return NextResponse.json({ ok: false, error: 'capability_required' }, { status: 400 })
  const env = { ...process.env }
  for (const provider of OPENOCTI_MODEL_PROVIDERS) {
    const resolved = resolveProviderKey(provider.id, env)
    if (resolved.key) env[provider.envKeys[0]] = resolved.key
  }
  const status = capabilityStatus(capability, env)
  if (!status) return NextResponse.json({ ok: false, error: 'unknown_capability' }, { status: 400 })
  if (status.status !== 'configured') return NextResponse.json({
    ok: false, error: 'not_configured', capability, keys: status.missing, needs: status.missing,
  }, { status: 503 })

  const result = await testIntegrationConnection(capability, env)
  const lastTest = recordIntegrationTest(capability, result)
  return NextResponse.json({ ...result, capability, lastTest }, { status: result.ok ? 200 : 502 })
}
