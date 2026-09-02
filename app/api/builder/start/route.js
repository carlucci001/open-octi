import { spawn } from 'node:child_process'
import { NextResponse } from 'next/server'
import { requireOwner } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BUILDER_HEALTH_URL = 'http://localhost:5173/api/health'
const BUILDER_ROOT = 'C:\\dev\\farrington-builder'
const BUILDER_LAUNCHER = 'C:\\dev\\farrington-builder\\Start-Farrington-Builder.ps1'

async function builderIsLive() {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 1000)
  try {
    const response = await fetch(BUILDER_HEALTH_URL, { cache: 'no-store', signal: controller.signal })
    return response.ok
  } catch {
    return false
  } finally {
    clearTimeout(timeout)
  }
}

export async function POST(request) {
  const { error } = await requireOwner(request)
  if (error) return error

  if (process.env.NODE_ENV === 'production' || process.platform !== 'win32') {
    return NextResponse.json({ ok: false, error: 'Local Builder start is available only on the Windows development workstation.' }, { status: 409 })
  }

  if (await builderIsLive()) {
    return NextResponse.json({ ok: true, alreadyRunning: true })
  }

  const child = spawn(
    'powershell.exe',
    ['-NoLogo', '-ExecutionPolicy', 'Bypass', '-File', BUILDER_LAUNCHER],
    { cwd: BUILDER_ROOT, detached: true, stdio: 'ignore', windowsHide: true }
  )
  child.unref()

  return NextResponse.json({ ok: true, starting: true })
}
