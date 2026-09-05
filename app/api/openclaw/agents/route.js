import { NextResponse } from 'next/server'
import { listAgents, saveAgent, deleteAgent, cloneAgent, enablePreset, getBackups } from '@/lib/agents-store'
import { restoreOpenclawBackup } from '@/lib/openclaw-config'
import { requireCapability } from '@/lib/permissions'
import { configuredMachineSecret, machineSecretMatches } from '@/lib/machine-secret'

function hasOpenClawKey(request) {
  const allowed = [
    configuredMachineSecret(process.env.OPENCLAW_API_KEY),
    configuredMachineSecret(process.env.AGENT_API_KEY),
  ].filter(Boolean)
  if (!allowed.length) return false
  const header = request.headers.get('x-api-key') || request.headers.get('x-agent-key')
  return allowed.some(secret => machineSecretMatches(header, secret))
}

async function requireOpenClawAccess(request, capability) {
  if (hasOpenClawKey(request)) return null
  const { error } = await requireCapability(request, capability)
  return error
}

export async function GET(request) {
  const error = await requireOpenClawAccess(request, 'agents:use')
  if (error) return error

  try {
    const data = await listAgents()
    return NextResponse.json(data)
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}

export async function POST(request) {
  const error = await requireOpenClawAccess(request, 'agents:manage')
  if (error) return error

  try {
    const body = await request.json()
    const action = body.action

    if (action === 'save') {
      const r = await saveAgent(body.id, body.payload || {}, { reason: body.reason })
      return NextResponse.json(r)
    }
    if (action === 'delete') {
      const r = await deleteAgent(body.id)
      return NextResponse.json(r)
    }
    if (action === 'clone') {
      const r = await cloneAgent(body.sourceId, body.newId, body.name)
      return NextResponse.json(r)
    }
    if (action === 'enable_preset') {
      const r = await enablePreset(body.presetId, { customId: body.customId })
      return NextResponse.json(r)
    }
    if (action === 'list_backups') {
      const r = await getBackups()
      return NextResponse.json({ ok: true, backups: r })
    }
    if (action === 'restore_backup') {
      const r = await restoreOpenclawBackup(body.backupPath)
      return NextResponse.json(r)
    }

    return NextResponse.json({ ok: false, error: `Unknown action: ${action}` }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
