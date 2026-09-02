import { NextResponse } from 'next/server'
import { readData, writeData } from '@/lib/dataStore'
import { requireAdmin } from '@/lib/auth'
import { requireCrmRead } from '@/lib/permissions'

export async function GET(request) {
  const { error } = await requireCrmRead(request)
  if (error) return error
  const cfg = readData('calendar-config.json') || {}
  return NextResponse.json(cfg)
}

export async function POST(request) {
  const { error } = await requireAdmin(request)
  if (error) return error
  const body = await request.json()
  const existing = readData('calendar-config.json') || {}
  const clean = {
    ...existing,
    icalUrl: (body.icalUrl ?? existing.icalUrl ?? '').trim(),
    embedUrl: (body.embedUrl ?? existing.embedUrl ?? '').trim(),
    bookingLink: (body.bookingLink ?? existing.bookingLink ?? '').trim(),
    timezone: (body.timezone || existing.timezone || 'America/New_York').trim(),
    updatedAt: new Date().toISOString(),
  }
  writeData('calendar-config.json', clean)
  return NextResponse.json({ ok: true, config: clean })
}
