import { NextResponse } from 'next/server'
import { isOpenOcti } from '@/lib/edition'
import { requireUserManagement } from '@/lib/permissions'
import { getPostizConfig } from '@/lib/postiz-config'
import { inspectPostiz } from '@/lib/postiz-diagnostics'
import { saveOpenOctiPostizSettings } from '@/lib/openocti-postiz-settings'
import { confirmPostizSetupPublished } from '@/lib/openocti-postiz-progress'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const json = (data, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } })
function settingsUrl(value) {
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password && !url.search && !url.hash ? String(value) : ''
  } catch { return '' }
}

export async function GET(request) {
  if (!isOpenOcti()) return json({ error: 'Not found' }, 404)
  const { error } = await requireUserManagement(request)
  if (error) return error
  const config = getPostizConfig()
  return json({ ok: true, settings: { base: settingsUrl(config?.base || process.env.POSTIZ_API_URL), publicUrl: settingsUrl(config?.publicUrl || process.env.NEXT_PUBLIC_POSTIZ_URL), keyPresent: Boolean(config?.key) }, diagnostics: await inspectPostiz() })
}

export async function POST(request) {
  if (!isOpenOcti()) return json({ error: 'Not found' }, 404)
  const { error } = await requireUserManagement(request)
  if (error) return error
  try {
    const input = await request.json()
    saveOpenOctiPostizSettings({ base: input.base, publicUrl: input.publicUrl, key: input.key })
    return json({ ok: true, diagnostics: await inspectPostiz() })
  } catch (error) {
    const message = /^(Enter a valid|The Public API|The installation secret|Postiz setup)/.test(error.message) ? error.message : 'Postiz settings could not be saved. Check the installation secret and storage permissions.'
    return json({ ok: false, error: message }, 400)
  }
}

export async function PATCH(request) {
  if (!isOpenOcti()) return json({ error: 'Not found' }, 404)
  const { error } = await requireUserManagement(request)
  if (error) return error
  const input = await request.json().catch(() => null)
  if (input?.action !== 'confirm-published') return json({ error: 'Unknown setup action.' }, 400)
  try {
    confirmPostizSetupPublished(getPostizConfig())
    return json({ ok: true, diagnostics: await inspectPostiz() })
  } catch { return json({ error: 'Schedule a test post from this installation before confirming it.' }, 400) }
}
