import { describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

vi.mock('../lib/usage-events', () => ({ recordUsageEvent: vi.fn() }))

import {
  BUILD_BOARD_TENANT,
  appendBuildBoardHandoff,
  createBuildBoardCard,
  formatBuildBoardHandoff,
  listBuildBoardCards,
  moveBuildBoardCard,
  parseBuildBoardCommitTags,
} from '../lib/build-board'

function mockHermesKanban() {
  const tasks = new Map()
  const comments = []
  let sequence = 0
  const request = vi.fn(async ({ path, method = 'GET', body }) => {
    if (path === '/config') return { kanban: { orchestrator_profile: 'foreman' } }
    if (path === '/board') return { columns: [{ name: 'todo', tasks: [...tasks.values()].map(task => ({ id: task.id, title: task.title })) }] }
    if (path === '/tasks' && method === 'POST') {
      const task = { id: `t_${++sequence}`, title: body.title, body: body.body, tenant: body.tenant, created_at: '2026-08-23T10:00:00.000Z' }
      tasks.set(task.id, task)
      return { task }
    }
    const commentMatch = path.match(/^\/tasks\/([^/]+)\/comments$/)
    if (commentMatch && method === 'POST') {
      comments.push({ taskId: commentMatch[1], ...body })
      return { ok: true }
    }
    const taskMatch = path.match(/^\/tasks\/([^/]+)$/)
    if (taskMatch && method === 'GET') return { task: tasks.get(taskMatch[1]), comments: [] }
    if (taskMatch && method === 'PATCH') {
      const current = tasks.get(taskMatch[1])
      const task = { ...current, ...body, updated_at: '2026-08-23T11:00:00.000Z' }
      tasks.set(task.id, task)
      return { task }
    }
    throw new Error(`Unexpected Hermes request ${method} ${path}`)
  })
  return { request, tasks, comments }
}

const SPEC = `**Why:** The build loop needs one truthful surface.

**Scope**
1. Store cards in Hermes.
2. Show the six Command Center columns.

**Acceptance:**
- Hermes stores the card.
- The board renders the card.

**Review checkpoint:** Review on completion.`

describe('Build Board lifecycle', () => {
  it('creates a support-fed Idea in Hermes and advances it through Orca Spec and Checker Review', async () => {
    const hermes = mockHermesKanban()
    const idea = await createBuildBoardCard({
      title: 'Truthful build loop',
      summary: 'Productize the file-based build loop.',
      productId: 'command-center',
      source: 'support',
      size: 'M',
      linkedTicket: { id: 'st_1', ticketNumber: 'SUP-1', subject: 'Truthful build loop' },
    }, hermes)

    expect(idea).toMatchObject({ id: 't_1', column: 'Idea', source: 'support', linkedTicket: { id: 'st_1' } })
    expect(hermes.request).toHaveBeenCalledWith(expect.objectContaining({
      path: '/tasks', method: 'POST', body: expect.objectContaining({ tenant: BUILD_BOARD_TENANT, assignee: 'foreman' }),
    }))
    expect(hermes.request).toHaveBeenCalledWith(expect.objectContaining({
      path: '/tasks/t_1', method: 'PATCH', body: expect.objectContaining({ status: 'blocked' }),
    }))

    const spec = await moveBuildBoardCard(idea, 'Spec', {
      ...hermes,
      runOrca: vi.fn().mockResolvedValue({ status: 'done', result: SPEC }),
    })
    expect(spec.column).toBe('Spec')
    expect(spec.specText).toContain('**Acceptance:**')

    const executing = await moveBuildBoardCard({ ...spec, column: 'Executing', commits: [{ hash: 'abcdef1234567', subject: 'Implement board [bb-t_1]' }] }, 'Review', {
      ...hermes,
      chat: vi.fn().mockResolvedValue({
        text: JSON.stringify({ verdict: 'pass', summary: 'All criteria met.', criteria: [
          { criterion: 'Hermes stores the card.', verdict: 'pass', notes: 'Hermes adapter coverage.' },
          { criterion: 'The board renders the card.', verdict: 'pass', notes: 'UI implementation present.' },
        ] }),
        model: 'hermes-agent',
        usage: { prompt_tokens: 10, completion_tokens: 8 },
      }),
      git: vi.fn().mockReturnValue({ status: 0, stdout: 'commit evidence', stderr: '' }),
    })
    expect(executing.column).toBe('Review')
    expect(executing.reviewNotes.at(-1)).toMatchObject({ author: 'checker', verdict: 'pass' })
    expect(hermes.comments.at(-1).author).toBe('checker')

    const board = await listBuildBoardCards(hermes)
    expect(board.cards).toHaveLength(1)
    expect(board.orchestration).toMatchObject({ orchestratorProfile: 'foreman', matchesExpected: true })
  })

  it('attaches inventory:diff evidence when a reviewed card moves to Shipped', async () => {
    const hermes = mockHermesKanban()
    const card = await createBuildBoardCard({ title: 'Ready to ship', summary: 'Verified change.' }, hermes)
    const shipped = await moveBuildBoardCard({ ...card, column: 'Review' }, 'Shipped', {
      ...hermes,
      inventoryRun: vi.fn().mockReturnValue({ status: 0, stdout: 'Feature inventory diff: clean', stderr: '' }),
    })
    expect(shipped.column).toBe('Shipped')
    expect(shipped.inventoryDiff).toMatchObject({ ok: true, exitCode: 0 })
  })
})

describe('Build Board commit and handoff formatting', () => {
  it('parses every [bb-<id>] commit tag without accepting malformed hashes', () => {
    const parsed = parseBuildBoardCommitTags([
      'abcdef1234567\t2026-08-23T10:00:00Z\tImplement board [bb-t_1]',
      '1234567\t2026-08-23T10:01:00Z\tWire [bb-t_2] and [bb-t_3]',
      'not-a-hash\t2026-08-23T10:02:00Z\tIgnore [bb-t_4]',
    ].join('\n'))
    expect(parsed.map(row => [row.cardId, row.hash])).toEqual([
      ['t_1', 'abcdef1234567'], ['t_2', '1234567'], ['t_3', '1234567'],
    ])
  })

  it('formats the approved append in CODEX_HANDOFF.md section order with its stable card anchor', () => {
    const entry = formatBuildBoardHandoff({ id: 't_1', title: 'Truthful build loop', size: 'M', specText: SPEC })
    expect(entry).toContain('<a id="bb-t_1"></a>')
    expect(entry).toContain('## [bb-t_1] Build Board Handoff — Truthful build loop (M) — OPEN')
    expect(entry.indexOf('**Why:**')).toBeLessThan(entry.indexOf('**Scope**'))
    expect(entry.indexOf('**Scope**')).toBeLessThan(entry.indexOf('**Acceptance:**'))
    expect(entry.indexOf('**Acceptance:**')).toBeLessThan(entry.indexOf('**Review checkpoint:**'))
  })

  it('appends only the formatted handoff and commits it with the required message', () => {
    const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'fcc-build-board-'))
    const handoffPath = path.join(repoRoot, 'CODEX_HANDOFF.md')
    fs.writeFileSync(handoffPath, '# Coordination\n', 'utf8')
    const git = vi.fn((args) => {
      if (args[0] === 'status') return { status: 0, stdout: '', stderr: '' }
      if (args[0] === 'rev-parse') return { status: 0, stdout: 'abcdef1234567890\n', stderr: '' }
      return { status: 0, stdout: '', stderr: '' }
    })
    try {
      const result = appendBuildBoardHandoff({ id: 't_1', title: 'Truthful build loop', size: 'M', specText: SPEC }, { repoRoot, handoffPath, git })
      expect(result).toMatchObject({ appended: true, commit: 'abcdef1234567890', specRef: 'CODEX_HANDOFF.md#bb-t_1' })
      expect(fs.readFileSync(handoffPath, 'utf8')).toContain('## [bb-t_1] Build Board Handoff')
      expect(git).toHaveBeenCalledWith(
        ['commit', '--only', '-m', 'handoff: Truthful build loop', '--', 'CODEX_HANDOFF.md'],
        { cwd: repoRoot },
      )
    } finally {
      fs.rmSync(repoRoot, { recursive: true, force: true })
    }
  })
})
