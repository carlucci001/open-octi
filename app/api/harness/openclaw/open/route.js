import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import fs from 'fs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function readOpenClawGatewayToken() {
  const envToken = String(process.env.OPENCLAW_GATEWAY_TOKEN || '').trim()
  if (envToken) return envToken

  const configPath = process.env.OPENCLAW_CONFIG_PATH
    || process.env.OPENCLAW_REMOTE_CONFIG
    || '/root/.openclaw/openclaw.json'

  try {
    const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    return String(cfg?.gateway?.auth?.token || cfg?.gateway?.remote?.token || '').trim()
  } catch {
    return ''
  }
}

export async function GET(request) {
  const { error } = await requireAdmin(request)
  if (error) return error
  const origin = process.env.PUBLIC_TUNNEL_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://crm.company.example.com'
  const target = new URL('/api/harness/dashboard/openclaw-hetzner/', origin)
  const token = readOpenClawGatewayToken()
  if (token) target.hash = `token=${encodeURIComponent(token)}`
  return NextResponse.redirect(target)
}
