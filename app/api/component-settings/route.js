import { NextResponse } from 'next/server'
import { requireCapability, requireCrmRead } from '@/lib/permissions'
import {
  ComponentSettingsError,
  getScopeOverrides,
  listComponentSchema,
  listRegisteredComponents,
  resolveComponentSettings,
  setScopeOverrides,
} from '@/lib/component-settings'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function errorResponse(error) {
  if (error instanceof ComponentSettingsError) {
    return NextResponse.json({ ok: false, error: error.message }, { status: error.status })
  }
  console.error('[component-settings] failed', error?.message || error)
  return NextResponse.json({ ok: false, error: error?.message || 'component settings failed' }, { status: 500 })
}

function contextFromParams(params) {
  return {
    brandId: params.get('brandId') || '',
    accountId: params.get('accountId') || '',
    campaignId: params.get('campaignId') || '',
  }
}

export async function GET(request) {
  const { error } = await requireCrmRead(request)
  if (error) return error
  const url = new URL(request.url)
  const componentId = url.searchParams.get('componentId') || ''
  if (!componentId) return NextResponse.json({ ok: true, components: listRegisteredComponents() })
  try {
    const scope = url.searchParams.get('scope')
    if (scope) {
      return NextResponse.json({ ok: true, componentId, scope, overrides: getScopeOverrides(componentId, scope) })
    }
    const resolved = resolveComponentSettings(componentId, contextFromParams(url.searchParams))
    return NextResponse.json({ ok: true, ...resolved, schema: listComponentSchema(componentId) })
  } catch (e) {
    return errorResponse(e)
  }
}

export async function POST(request) {
  const { error } = await requireCapability(request, 'settings:manage')
  if (error) return error
  const body = await request.json().catch(() => ({}))
  const componentId = String(body.componentId || '')
  try {
    const overrides = setScopeOverrides(componentId, String(body.scope || ''), {
      set: body.set && typeof body.set === 'object' ? body.set : {},
      unset: Array.isArray(body.unset) ? body.unset : [],
    })
    const context = body.context && typeof body.context === 'object' ? body.context : {}
    const resolved = resolveComponentSettings(componentId, context)
    return NextResponse.json({ ok: true, scope: body.scope, overrides, ...resolved })
  } catch (e) {
    return errorResponse(e)
  }
}
