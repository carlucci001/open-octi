import { validateApiKey } from '@/lib/apiAuth'
import { NextResponse } from 'next/server'
import { Resend } from 'resend'

export async function POST(request) {
  const auth = validateApiKey(request)
  if (!auth.ok) return auth.response

  const body = await request.json()
  const { to, subject, html, text } = body

  if (!to || !subject) {
    return NextResponse.json({ error: 'Missing required fields: to, subject' }, { status: 400 })
  }

  const resend = new Resend(process.env.RESEND_API_KEY)
  const toArray = Array.isArray(to) ? to : [to]

  const { data, error } = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL || 'ContentStudio <redacted@example.invalid>',
    to: toArray,
    subject,
    html: html || undefined,
    text: text || undefined,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: data?.id })
}
