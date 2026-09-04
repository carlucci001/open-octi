import { NextResponse } from 'next/server'
import { requireCrmRead } from '@/lib/permissions'
import { getLeadSource } from '@/lib/lead-signals/registry'
import { pullFecTopCampaigns } from '@/lib/lead-signals/adapters/fec'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
  const { error } = await requireCrmRead(request)
  if (error) return error
  try {
    const params = new URL(request.url).searchParams
    const state = String(params.get('state') || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2)
    const district = String(params.get('district') || '').replace(/[^0-9]/g, '').slice(0, 2)
    const limit = Math.min(Math.max(Number(params.get('limit')) || 50, 1), 50)
    const manifest = getLeadSource('fec-campaigns-2026')
    if (!manifest) return NextResponse.json({ ok: false, error: 'FEC campaign manifest is unavailable' }, { status: 404 })
    const rows = await pullFecTopCampaigns({ manifest, state, district, limit })
    return NextResponse.json({ ok: true, scope: state || 'US', state, district, count: rows.length, rows })
  } catch (cause) {
    return NextResponse.json({ ok: false, error: cause.message || 'Could not load campaign signals', code: cause.code || 'campaign-signals-error' }, { status: cause.code === 'needs-key' ? 424 : 500 })
  }
}

