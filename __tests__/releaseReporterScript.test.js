import { describe, expect, it } from 'vitest'
import { buildReleasePayload, parseReporterArgs } from '../scripts/report-release.mjs'

describe('scripts/report-release.mjs', () => {
  it('parses explicit reporter flags without accepting unknown flags', () => {
    expect(parseReporterArgs(['--version', '2.4.0', '--commit', 'abc1234', '--status', 'failed', '--deployer', 'codex'])).toEqual({
      version: '2.4.0', commit: 'abc1234', status: 'failed', deployer: 'codex',
    })
    expect(() => parseReporterArgs(['--surprise', 'value'])).toThrow(/unknown option/i)
  })

  it('builds the five-field release contract from flags and deploy environment', () => {
    expect(buildReleasePayload({
      args: { version: '2.4.0', status: 'live' },
      env: { FCC_RELEASE_DEPLOYER: 'codex' },
      gitCommit: () => '621180b\n',
      now: () => new Date('2026-08-22T20:00:00.000Z'),
    })).toEqual({
      version: '2.4.0', commit: '621180b', deployer: 'codex', deployedAt: '2026-08-22T20:00:00.000Z', status: 'live',
    })
  })
})
