import fs from 'fs'
import path from 'path'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const APP_BUILD_FALLBACK = '2026.06.11-api-lab-mobile'

function readBuildId() {
  try {
    return fs.readFileSync(path.join(process.cwd(), '.next', 'BUILD_ID'), 'utf8').trim()
  } catch {
    return ''
  }
}

export async function GET() {
  const buildId = readBuildId()
  const fallback = process.env.NEXT_PUBLIC_APP_VERSION || process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA || ''
  const code = (buildId || fallback || 'unknown').slice(-10)
  return NextResponse.json({
    ok: true,
    buildId,
    code,
    fallback: APP_BUILD_FALLBACK,
  })
}
