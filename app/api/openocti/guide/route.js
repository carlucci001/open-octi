import { NextResponse } from 'next/server'
import { isOpenOcti } from '@/lib/edition'
import { requireCapability } from '@/lib/permissions'
import { directProviderChat } from '@/lib/direct-provider-chat'
import { OPENOCTI_GUIDE_INSTRUCTIONS } from '@/lib/openocti-assistant'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request) {
  if (!isOpenOcti()) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { error } = await requireCapability(request, 'agents:use')
  if (error) return error
  let body
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }
  if (!Array.isArray(body.messages)) return NextResponse.json({ error: 'A message is required' }, { status: 400 })
  const messages = body.messages.filter(message => ['user', 'assistant'].includes(message?.role) && typeof message.content === 'string').slice(-16)
  if (!messages.some(message => message.role === 'user' && message.content.trim())) return NextResponse.json({ error: 'A message is required' }, { status: 400 })
  const message = messages.map(message => `${message.role}: ${message.content.slice(0,6000)}`).join('\n\n')
  try {
    const result = await directProviderChat({ message, system: OPENOCTI_GUIDE_INSTRUCTIONS })
    return NextResponse.json({ text: result.text, provider: result.provider }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (reason) {
    return NextResponse.json({ error: reason.code === 'not_configured' ? 'Add a model key in Models & Keys to start your setup assistant.' : 'The model provider could not answer. Check the key and available credit in Models & Keys, then try again.' }, { status: reason.code === 'not_configured' ? 400 : 502 })
  }
}
