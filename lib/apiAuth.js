import { NextResponse } from 'next/server'
import { configuredMachineSecret, machineSecretMatches } from './machine-secret'

export function validateApiKey(request) {
  const apiKey = configuredMachineSecret(process.env.OPENCLAW_API_KEY)
  if (!apiKey) return { ok: false, response: NextResponse.json({ error: 'OPENCLAW_API_KEY is not securely configured' }, { status: 503 }) }
  const key = request.headers.get('x-api-key')
  if (!machineSecretMatches(key, apiKey)) return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  return { ok: true }
}
