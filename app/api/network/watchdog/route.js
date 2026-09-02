import { NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'
import { requireAdmin } from '@/lib/auth'

const run = promisify(exec)
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const TASK_NAME = 'Farrington Tunnel Watchdog'
const INSTALL_SCRIPT = 'c:\\dev\\farrington-command-center\\scripts\\install-watchdog-task.ps1'

async function taskState() {
  try {
    const { stdout } = await run(`powershell -NoProfile -Command "(Get-ScheduledTask -TaskName '${TASK_NAME}' -ErrorAction SilentlyContinue).State"`, { timeout: 5000 })
    const state = stdout.trim()
    return { exists: !!state, state: state || 'Not registered' }
  } catch (e) {
    return { exists: false, state: 'Unknown', error: e.message }
  }
}

export async function GET(request) {
  const { error: __adminError } = await requireAdmin(request); if (__adminError) return __adminError
  return NextResponse.json(await taskState())
}

export async function POST(request) {
  const { error: __adminError } = await requireAdmin(request); if (__adminError) return __adminError
  try {
    const { action } = await request.json()

    if (action === 'disable') {
      await run(`powershell -NoProfile -Command "Unregister-ScheduledTask -TaskName '${TASK_NAME}' -Confirm:$false"`, { timeout: 8000 })
      return NextResponse.json({ ok: true, message: 'Watchdog disabled. The popup every 2 min will stop.', ...(await taskState()) })
    }

    if (action === 'enable') {
      await run(`powershell -NoProfile -ExecutionPolicy Bypass -File "${INSTALL_SCRIPT}"`, { timeout: 10000 })
      return NextResponse.json({ ok: true, message: 'Watchdog enabled — runs every 2 min.', ...(await taskState()) })
    }

    return NextResponse.json({ ok: false, error: 'unknown action' }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
