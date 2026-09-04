import { NextResponse } from 'next/server'
import { consumePressUnsubscribeToken, suppressPressAddress } from '@/lib/press/send-gate'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
  const token = new URL(request.url).searchParams.get('token') || ''
  const record = token ? consumePressUnsubscribeToken(token) : null
  if (!record) {
    return new NextResponse('<h1>Unsubscribe link is invalid or already used.</h1>', {
      status: 400,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    })
  }
  suppressPressAddress({
    email: record.email,
    contactId: record.contactId,
    reason: 'unsubscribe',
  })
  return new NextResponse('<h1>You are unsubscribed.</h1><p>This address will not receive future Press Desk pitches.</p>', {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })
}
