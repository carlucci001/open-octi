import { NextResponse } from 'next/server'
import { isOpenOcti } from '@/lib/edition'
import { requireCapability } from '@/lib/permissions'
import {
  listOpenOctiKeyStatus,
  removeOpenOctiProviderKey,
  storeOpenOctiProviderKey,
  syncOpenOctiKeysToOpenClaw,
  validateOpenOctiProviderKey,
} from '@/lib/openocti-keys'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ACTIVATED_AGENTS = Object.freeze([
  { id: 'main', name: 'Maggie' },
  { id: 'coding', name: 'Craig' },
  { id: 'social-media', name: 'Sasha' },
  { id: 'legal', name: 'Linda' },
  { id: 'matilda', name: 'Matilda' },
  { id: 'octi', name: 'Octi' },
])

async function authorize(request) {
  const auth = await requireCapability(request, 'system:manage')
  if (auth.error) return auth
  if (!isOpenOcti()) return { user: null, error: NextResponse.json({ error: 'Not found' }, { status: 404 }) }
  return auth
}

export async function GET(request) {
  const { error } = await authorize(request)
  if (error) return error
  return NextResponse.json({ ok: true, providers: listOpenOctiKeyStatus() }, {
    headers: { 'Cache-Control': 'no-store' },
  })
}

export async function POST(request) {
  const { error } = await authorize(request)
  if (error) return error
  try {
    const body = await request.json()
    const provider = String(body.provider || '').trim().toLowerCase()
    const key = String(body.key || '').trim()
    await validateOpenOctiProviderKey(provider, key)
    const status = storeOpenOctiProviderKey(provider, key)
    const openClaw = syncOpenOctiKeysToOpenClaw()
    return NextResponse.json({
      ok: true,
      provider: status,
      activatedAgents: provider === 'elevenlabs' ? [] : ACTIVATED_AGENTS,
      openClaw,
    })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
  }
}

export async function DELETE(request) {
  const { error } = await authorize(request)
  if (error) return error
  try {
    const body = await request.json()
    const status = removeOpenOctiProviderKey(body.provider)
    const openClaw = syncOpenOctiKeysToOpenClaw()
    return NextResponse.json({ ok: true, provider: status, openClaw })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 })
  }
}
