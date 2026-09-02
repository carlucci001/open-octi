import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

function read(file) {
  return fs.readFileSync(path.join(process.cwd(), file), 'utf8')
}

describe('DeepSeek Harness production sidecar', () => {
  it('pins the isolated dependency graph and keeps it out of the CRM package', () => {
    const crmPackage = JSON.parse(read('package.json'))
    const sidecarPackage = JSON.parse(read('ops/deepseek-harness/package.json'))

    expect(crmPackage.dependencies?.['@deepseek-ai/dsh-sdk-client']).toBeUndefined()
    expect(sidecarPackage.dependencies).toMatchObject({
      '@deepseek-ai/dsh-sdk-client': '0.1.0-rc.7',
      '@deepseek-ai/dsh-sdk-jsonrpc-demo': '0.1.0-rc.7',
      '@deepseek-ai/dsh-sdk-jsonrpc-server': '0.1.0-rc.7',
    })
    expect(read('ops/deepseek-harness/package-lock.json')).toContain('"lockfileVersion": 3')
  })

  it('uses a conversation-only profile with no model-facing tools', () => {
    const config = read('ops/deepseek-harness/cordis.yml')
    const forbiddenPlugins = [
      'dsh-tool-fs',
      'dsh-tool-bash',
      'dsh-tool-subagent',
      'dsh-tool-todo',
      'dsh-tool-str-replace-editor',
      'dsh-web-search',
      'dsh-skill',
    ]

    for (const plugin of forbiddenPlugins) expect(config).not.toContain(`name: '@deepseek-ai/${plugin}'`)
    expect(config).toContain('toolBash: false')
    expect(config).toContain('skills:')
    expect(config).toContain('enabled: false')
  })

  it('enforces loopback, strict child env, single-flight, ephemeral sessions, and redacted errors', () => {
    const server = read('ops/deepseek-harness/server.mjs')

    expect(server).toContain("HOST !== '127.0.0.1'")
    expect(server).toContain('const childEnv = {')
    expect(server).not.toContain('env: process.env')
    expect(server).toContain('if (busy)')
    expect(server).toContain('MAX_REQUESTS_PER_MINUTE')
    expect(server).toContain("path.join(REQUESTS_DIR, requestId)")
    expect(server).toContain('removeEphemeralDirectory(requestRoot)')
    expect(server).toContain('fs.rmSync(REQUESTS_DIR, { recursive: true, force: true })')
    expect(server).toContain('activeOperation = { requestId, close: closeHarness, cleanup }')
    expect(server).toContain("activeOperation?.cleanup?.()")
    expect(server).toContain("error: 'harness-unavailable'")
    expect(server).not.toContain('error?.message')
  })

  it('ships a hardened service with a separate user and cgroup cleanup', () => {
    const unit = read('deploy/systemd/farrington-deepseek-harness.service')

    expect(unit).toContain('User=fcc-deepseek')
    expect(unit).toContain('NoNewPrivileges=true')
    expect(unit).toContain('ProtectSystem=strict')
    expect(unit).toContain('KillMode=control-group')
    expect(unit).toContain('LoadCredential=deepseek_api_key:')
    expect(unit).toContain('LoadCredential=bridge_token:')
  })
})
