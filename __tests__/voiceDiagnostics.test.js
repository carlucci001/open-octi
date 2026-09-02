import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'

const root = process.cwd()
const read = file => fs.readFileSync(path.join(root, file), 'utf8')

describe('Voice diagnostics guardrails', () => {
  it('exposes a provider readiness endpoint without returning signed URLs', () => {
    const route = read('app/api/voice/diagnostics/route.js')

    expect(route).toContain("requireCapability(request, 'voice:use')")
    expect(route).toContain('voice-agent-roster.json')
    expect(route).toContain('voice-transfer-log.json')
    expect(route).toContain('get-signed-url')
    expect(route).toContain('Boolean(data.signed_url)')
    expect(route).not.toContain('signedUrl:')
    expect(route).not.toContain('signed_url:')
  })

  it('adds a visible diagnostics runner to the voice guide', () => {
    const guide = read('app/voice-guide/VoiceGuide.js')

    expect(guide).toContain('/api/voice/diagnostics')
    expect(guide).toContain('Voice transfer diagnostics')
    expect(guide).toContain('Run diagnostics')
    expect(guide).toContain('Passing:')
    expect(guide).toContain('Slow provider checks')
  })
})
