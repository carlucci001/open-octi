import { describe, expect, it } from 'vitest'
import { classifyMirrorStatus, getGiteaMirrorStatus, nextMirrorRunAt } from '../lib/gitea-mirror-status'

const githubHead = 'a'.repeat(40)
const giteaHead = 'b'.repeat(40)

describe('Gitea backup mirror status', () => {
  it('reports matching GitHub and Gitea refs as in sync', () => {
    expect(classifyMirrorStatus({ githubHead, giteaHead: githubHead })).toBe('in-sync')
  })

  it('treats a GitHub commit after the last mirror run as scheduled lag', () => {
    expect(classifyMirrorStatus({
      githubHead,
      giteaHead,
      githubCommitAt: '2026-08-29T18:23:21.000Z',
      lastRunAt: '2026-08-29T03:30:03.000Z',
    })).toBe('awaiting-next-scheduled-run')
  })

  it('flags mismatched refs when the mirror already ran after the GitHub commit', () => {
    expect(classifyMirrorStatus({
      githubHead,
      giteaHead,
      githubCommitAt: '2026-08-29T02:00:00.000Z',
      lastRunAt: '2026-08-29T03:30:03.000Z',
    })).toBe('out-of-sync')
  })

  it('returns the next nightly 03:30 UTC run', () => {
    expect(nextMirrorRunAt(new Date('2026-08-29T18:00:00.000Z'))).toBe('2026-08-30T03:30:00.000Z')
  })

  it('returns Craig-safe mirror facts without exposing the cron command', () => {
    const command = (args) => {
      if (args[0] === 'ls-remote' && args[1] === 'origin') return { ok: true, output: `${githubHead}\trefs/heads/master` }
      if (args[0] === 'ls-remote' && args[1] === 'gitea') return { ok: true, output: `${giteaHead}\trefs/heads/master` }
      if (args[0] === 'show') return { ok: true, output: '2026-08-29T14:23:21-04:00' }
      return { ok: false, output: '' }
    }
    const readFile = (filePath) => filePath.includes('crontabs')
      ? '30 3 * * * /root/bin/mirror-fcc-to-gitea.sh || notify-private-topic'
      : 'Everything up-to-date\n'
    const statFile = () => ({ mtime: new Date('2026-08-29T03:30:03.000Z') })

    const result = getGiteaMirrorStatus({
      cwd: '/root/farrington-command-center',
      now: new Date('2026-08-29T18:00:00.000Z'),
      command,
      readFile,
      statFile,
    })

    expect(result).toMatchObject({
      sourceOfTruth: 'GitHub (origin)',
      backupMirror: 'Gitea (gitea)',
      direction: 'GitHub-to-Gitea only',
      schedule: '30 3 * * *',
      scheduleTimezone: 'UTC',
      lastRunResult: 'success',
      status: 'awaiting-next-scheduled-run',
    })
    expect(JSON.stringify(result)).not.toContain('notify-private-topic')
  })
})
