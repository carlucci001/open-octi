import { NextResponse } from 'next/server'
import {
  listAutomations, getAutomation, createAutomation, updateAutomation,
  toggleAutomation, runAutomation, cloneAutomation, deleteAutomation,
  listAutomationTemplates, createAutomationFromTemplate,
} from '@/lib/automations-store'
import { requireCrmRead, requireCrmWrite } from '@/lib/permissions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
  const { error } = await requireCrmRead(request)
  if (error) return error
  try {
    const url = new URL(request.url)
    const scope = url.searchParams.get('scope') || undefined
    const tenantId = url.searchParams.get('tenantId') || undefined
    return NextResponse.json({
      ok: true,
      automations: listAutomations({ scope, tenantId }),
      templates: listAutomationTemplates(),
    })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}

export async function POST(request) {
  const { user, error } = await requireCrmWrite(request)
  if (error) return error
  try {
    const body = await request.json()
    const action = body.action

    if (action === 'create') return NextResponse.json({ ok: true, automation: createAutomation(body.automation || {}) })
    if (action === 'createFromTemplate') return NextResponse.json({ ok: true, automation: createAutomationFromTemplate(body.templateId, body.patch || {}) })
    if (action === 'update') return NextResponse.json({ ok: true, automation: updateAutomation(body.id, body.patch || {}) })
    if (action === 'toggle') return NextResponse.json({ ok: true, automation: toggleAutomation(body.id) })
    if (action === 'run')    return NextResponse.json({ ok: true, automation: await runAutomation(body.id, { user, recipientEmail: body.recipientEmail }) })
    if (action === 'clone')  return NextResponse.json({ ok: true, automation: cloneAutomation(body.id, body.patch || {}) })
    if (action === 'delete') return NextResponse.json(deleteAutomation(body.id))
    if (action === 'get')    return NextResponse.json({ ok: true, automation: getAutomation(body.id) })

    return NextResponse.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
