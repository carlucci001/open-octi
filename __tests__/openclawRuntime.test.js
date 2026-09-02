import { describe, expect, it } from 'vitest'

import { resolveOpenclawConfigTransport } from '../lib/openclaw-config'
import { resolveOpenclawGateway } from '../lib/openclaw-client'

describe('OpenClaw runtime configuration', () => {
  it('uses a mounted local config when no SSH target is configured', () => {
    expect(resolveOpenclawConfigTransport({
      env: { OPENCLAW_CONFIG_PATH: '/data/openclaw.json' },
      platform: 'win32',
      homeDir: 'C:\\Users\\tester',
    })).toMatchObject({
      mode: 'local',
      sshTarget: '',
      configPath: '/data/openclaw.json',
    })
  })

  it('keeps the explicit SSH transport for the private installation', () => {
    expect(resolveOpenclawConfigTransport({
      env: {
        OPENCLAW_SSH_TARGET: 'operator@example.invalid',
        OPENCLAW_SSH_KEY: 'C:\\keys\\openclaw',
        OPENCLAW_REMOTE_CONFIG: '/srv/openclaw.json',
      },
      platform: 'win32',
      homeDir: 'C:\\Users\\tester',
    })).toMatchObject({
      mode: 'ssh',
      sshTarget: 'operator@example.invalid',
      sshKey: 'C:\\keys\\openclaw',
      configPath: '/srv/openclaw.json',
    })
  })

  it('builds the network gateway endpoint and takes its token from the environment', () => {
    const gateway = resolveOpenclawGateway({
      OPENCLAW_HOST: 'openclaw',
      OPENCLAW_PORT: '18789',
      OPENCLAW_GATEWAY_TOKEN: 'test-token',
    })

    expect(gateway.wsUrl).toBe('ws://openclaw:18789/__openclaw__/gateway/ws')
    expect(gateway.origin).toBe('http://openclaw:18789')
    expect(gateway.token).toBe('test-token')
  })
})
