import { NextResponse } from 'next/server'
import { generateAvatar, saveUploadedAvatar, clearAvatar } from '@/lib/avatar-gen'
import { requireCapability } from '@/lib/permissions'

export const runtime = 'nodejs'
export const maxDuration = 120

export async function POST(request) {
  const { error } = await requireCapability(request, 'agents:manage')
  if (error) return error

  try {
    const body = await request.json()
    const action = body.action || 'generate'

    if (action === 'generate') {
      const { id, prompt } = body
      if (!id || !prompt) return NextResponse.json({ ok: false, error: 'id and prompt required' }, { status: 400 })
      const meta = await generateAvatar({ id, prompt })
      return NextResponse.json({ ok: true, avatar: meta })
    }

    if (action === 'upload') {
      const { id, dataUrl } = body
      if (!id || !dataUrl) return NextResponse.json({ ok: false, error: 'id and dataUrl required' }, { status: 400 })
      const meta = await saveUploadedAvatar({ id, dataUrl })
      return NextResponse.json({ ok: true, avatar: meta })
    }

    if (action === 'clear') {
      clearAvatar(body.id)
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
