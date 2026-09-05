import { configuredMachineSecret, machineSecretMatches } from './machine-secret'

export function configuredSecret(value) {
  const secret = String(value || '').trim()
  if (!secret) return null
  if (['missing', 'changeme', 'change-me', 'undefined', 'null'].includes(secret.toLowerCase())) return null
  return secret
}

export function expectedSecret() {
  return configuredSecret(process.env.AUTOMATION_BRIDGE_SECRET)
    || configuredSecret(process.env.PUBLIC_AUTOMATION_RUN_SECRET)
    || configuredSecret(process.env.CONCIERGE_TOOL_SECRET)
    || configuredMachineSecret(process.env.AGENT_API_KEY)
    || configuredMachineSecret(process.env.OPENCLAW_API_KEY)
}

export function bearerToken(request) {
  const auth = request.headers.get('authorization') || ''
  return auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
}

export function bridgeToken(request) {
  return request.headers.get('x-fd-bridge-token')
    || request.headers.get('x-automation-bridge-secret')
    || request.headers.get('x-automation-secret')
    || bearerToken(request)
}

export function authorized(request) {
  const secret = expectedSecret()
  if (!secret) return { ok: false, status: 503, error: 'automation bridge secret is not configured' }
  const received = bridgeToken(request)
  if (!machineSecretMatches(received, secret)) {
    const debug = request.headers.get('x-fd-debug-bridge') === '1'
      ? {
          expectedLength: secret.length,
          receivedLength: String(received || '').length,
          hasXFd: Boolean(request.headers.get('x-fd-bridge-token')),
          hasXAutomation: Boolean(request.headers.get('x-automation-bridge-secret')),
          hasXAutomationSecret: Boolean(request.headers.get('x-automation-secret')),
          hasBearer: Boolean(bearerToken(request)),
        }
      : undefined
    return { ok: false, status: 401, error: 'bridge unauthorized', debug }
  }
  return { ok: true }
}
