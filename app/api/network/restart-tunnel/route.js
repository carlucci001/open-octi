import { NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'
import { requireAdmin } from '@/lib/auth'

const run = promisify(exec)
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request) {
  const { error: __adminError } = await requireAdmin(request); if (__adminError) return __adminError
  try {
    // Kill stale cloudflared then re-trigger the boot task which re-establishes the tunnel.
    await run('powershell -NoProfile -Command "Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force"', { timeout: 5000 }).catch(() => {})
    await run('powershell -NoProfile -Command "Start-ScheduledTask -TaskName \\"Farrington Command Boot\\""', { timeout: 5000 })
    return NextResponse.json({ ok: true, message: 'Tunnel restart triggered. Give it ~10 seconds.' })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
