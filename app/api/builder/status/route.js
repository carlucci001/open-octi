import { NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUILDER_LOCAL_URL = process.env.BUILDER_LOCAL_URL || 'http://localhost:5173/api/health'

export async function GET(request) {
  const { error } = await requireOwner(request)
  if (error) return error

  const startedAt = Date.now()
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 1800)

  try {
    const response = await fetch(BUILDER_LOCAL_URL, {
      method: 'GET',
      cache: 'no-store',
      redirect: 'manual',
      signal: controller.signal,
      headers: { 'user-agent': 'Farrington-Command-Center/Builder-Health' },
    })
    return NextResponse.json({
      ok: true,
      live: response.status >= 200 && response.status < 500,
      responseMs: Date.now() - startedAt,
      checkedAt: new Date().toISOString(),
    })
  } catch {
    return NextResponse.json({
      ok: true,
      live: false,
      responseMs: Date.now() - startedAt,
      checkedAt: new Date().toISOString(),
    })
  } finally {
    clearTimeout(timeout)
  }
}
