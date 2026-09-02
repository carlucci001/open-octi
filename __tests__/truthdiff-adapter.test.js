import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { buildTruthDiffGraph } from '@/lib/truthdiff-adapter'

const temporaryDirectories = []

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' })
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

describe('Command Vault TruthDiff adapter', () => {
  it('produces a proven contradiction from a mounted Git-backed vault', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fcc-truthdiff-'))
    temporaryDirectories.push(root)
    git(root, ['init'])
    git(root, ['config', 'user.email', 'redacted@example.invalid'])
    git(root, ['config', 'user.name', 'TruthDiff Test'])
    fs.writeFileSync(
      path.join(root, 'routes.js'),
      "export const retired = '/api/retired';\n",
    )
    git(root, ['add', 'routes.js'])
    git(root, ['commit', '-m', 'baseline'])
    fs.writeFileSync(
      path.join(root, 'routes.js'),
      'export const active = true;\n',
    )
    fs.writeFileSync(
      path.join(root, 'runbook.md'),
      'The runbook still calls `/api/retired`.',
    )

    const vault = {
      id: 'fixture',
      name: 'Fixture',
      path: root,
      available: true,
    }
    const graph = await buildTruthDiffGraph(vault, {
      semantic: false,
      fallbackToLastCommit: false,
    })

    expect(graph.mode).toBe('impact')
    expect(graph.summary.counts.contradicted).toBe(1)
    expect(graph.findings[0]).toMatchObject({
      state: 'contradicted',
      documentId: 'runbook.md',
      deterministic: true,
    })
    expect(graph.repositories[0].changedFiles).toBe(1)
  }, 15_000)
})
