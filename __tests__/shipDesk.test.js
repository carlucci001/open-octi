import { describe, expect, it, vi } from 'vitest'
import { buildRollbackCommand, collectCommitMessages, parseReleaseList, selectReleaseState } from '../lib/ship-desk'
import { resolveRepositoryLinks } from '../lib/repository-links'

describe('Ship Desk release parsing', () => {
  const releases = [
    { id: 'bad', version: '', commit: '', status: 'live', deployedAt: 'nope', deployer: '' },
    { id: 'old', version: '2.3.0', commit: '1111111', status: 'previous', deployedAt: '2026-08-21T20:00:00.000Z', deployer: 'carl' },
    { id: 'live', version: '2.4.0', commit: '2222222', status: 'live', deployedAt: '2026-08-22T20:00:00.000Z', deployer: 'codex' },
  ]

  it('filters malformed rows, sorts newest first, and selects live/previous', () => {
    const parsed = parseReleaseList(releases)
    expect(parsed.map(row => row.id)).toEqual(['live', 'old'])
    expect(selectReleaseState(parsed)).toMatchObject({ live: { id: 'live' }, previous: { id: 'old' } })
  })

  it('renders a read-only exact rollback command from the registered CI/CD command', () => {
    expect(buildRollbackCommand({
      previousRelease: releases[1],
      cicd: { localPath: '/root/farrington-command-center', deployCommand: 'npm run build && systemctl restart farrington-crm.service' },
    })).toBe("git -C '/root/farrington-command-center' checkout --detach '1111111' && npm run build && systemctl restart farrington-crm.service")
  })

  it('reads commit subjects strictly between the previous and live release', () => {
    const runGit = vi.fn(() => 'Ship Desk UI\nRelease receiver\n')
    expect(collectCommitMessages({ repoPath: '/root/fcc', fromCommit: '1111111', toCommit: '2222222', runGit })).toEqual(['Ship Desk UI', 'Release receiver'])
    expect(runGit).toHaveBeenCalledWith('/root/fcc', ['log', '--format=%s', '--max-count=50', '1111111..2222222'])
  })

  it('resolves the same registered repository links for Repository and Ship Desk', () => {
    expect(resolveRepositoryLinks({ giteaUrl: '/api/repository/gitea/', githubUrl: 'https://github.com/carlucci001/farrington-command-center' })).toEqual({
      gitea: '/api/repository/gitea/', github: 'https://github.com/carlucci001/farrington-command-center',
    })
  })
})
