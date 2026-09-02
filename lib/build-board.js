import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

import { hermesChat, hermesKanbanRequest } from './hermes-client'
import { createRun, ensureOrcaAgent, executeRun } from './orca-handoff'
import { recordUsageEvent } from './usage-events'

export const BUILD_BOARD_COLUMNS = Object.freeze(['Idea', 'Spec', 'Handoff', 'Executing', 'Review', 'Shipped'])
export const BUILD_BOARD_TENANT = 'command-center-build'
export const BUILD_BOARD_BODY_VERSION = 'command-center-build-board/v1'

const VALID_SOURCES = new Set(['support', 'manual', 'agent'])
const VALID_SIZES = new Set(['S', 'M', 'L'])
const OPERATOR_TRANSITIONS = Object.freeze({
  Idea: new Set(['Spec']),
  Spec: new Set(['Idea']),
  Handoff: new Set(['Spec']),
  Executing: new Set(['Review']),
  Review: new Set(['Executing', 'Shipped']),
  Shipped: new Set(['Review']),
})

function cleanText(value, max = 20000) {
  return String(value ?? '').replace(/\r\n/g, '\n').trim().slice(0, max)
}

function isoNow() {
  return new Date().toISOString()
}

export function buildBoardTag(id) {
  return `bb-${cleanText(id, 120).replace(/^bb-/, '')}`
}

export function normalizeBuildBoardCard(input = {}) {
  const column = BUILD_BOARD_COLUMNS.includes(input.column) ? input.column : 'Idea'
  const source = VALID_SOURCES.has(input.source) ? input.source : 'manual'
  const size = VALID_SIZES.has(String(input.size || '').toUpperCase()) ? String(input.size).toUpperCase() : 'M'
  return {
    id: cleanText(input.id, 120),
    title: cleanText(input.title, 200),
    summary: cleanText(input.summary, 5000),
    productId: cleanText(input.productId, 160),
    source,
    size,
    column,
    specRef: cleanText(input.specRef, 500),
    specText: cleanText(input.specText, 30000),
    commits: Array.isArray(input.commits) ? input.commits.map(normalizeCommit).filter(Boolean) : [],
    reviewNotes: Array.isArray(input.reviewNotes) ? input.reviewNotes.map(normalizeReviewNote).filter(Boolean) : [],
    linkedTicket: input.linkedTicket && typeof input.linkedTicket === 'object' ? {
      id: cleanText(input.linkedTicket.id, 120),
      ticketNumber: cleanText(input.linkedTicket.ticketNumber, 120),
      subject: cleanText(input.linkedTicket.subject, 300),
    } : null,
    inventoryDiff: input.inventoryDiff && typeof input.inventoryDiff === 'object' ? {
      ok: Boolean(input.inventoryDiff.ok),
      exitCode: Number.isInteger(input.inventoryDiff.exitCode) ? input.inventoryDiff.exitCode : 1,
      output: cleanText(input.inventoryDiff.output, 6000),
      ranAt: cleanText(input.inventoryDiff.ranAt, 80),
    } : null,
    handoffCommit: cleanText(input.handoffCommit, 80),
    createdAt: cleanText(input.createdAt, 80),
    updatedAt: cleanText(input.updatedAt, 80),
  }
}

function normalizeCommit(value) {
  const commit = typeof value === 'string' ? { hash: value } : value
  const hash = cleanText(commit?.hash, 80)
  if (!hash) return null
  return { hash, subject: cleanText(commit?.subject, 500), at: cleanText(commit?.at, 80) }
}

function normalizeReviewNote(note) {
  if (!note || typeof note !== 'object') return null
  return {
    id: cleanText(note.id, 120) || `review-${Date.now().toString(36)}`,
    author: cleanText(note.author, 80) || 'checker',
    at: cleanText(note.at, 80) || isoNow(),
    verdict: note.verdict === 'pass' ? 'pass' : 'fail',
    summary: cleanText(note.summary, 5000),
    criteria: Array.isArray(note.criteria) ? note.criteria.map(row => ({
      criterion: cleanText(row?.criterion, 3000),
      verdict: row?.verdict === 'pass' ? 'pass' : 'fail',
      notes: cleanText(row?.notes, 3000),
    })).filter(row => row.criterion) : [],
  }
}

function cardBody(card) {
  const normalized = normalizeBuildBoardCard(card)
  return JSON.stringify({ kind: BUILD_BOARD_BODY_VERSION, card: normalized })
}

export function buildBoardCardFromHermes(detail = {}) {
  const task = detail.task || detail
  let decoded
  try { decoded = JSON.parse(String(task?.body || '')) } catch { return null }
  if (decoded?.kind !== BUILD_BOARD_BODY_VERSION || !decoded.card) return null
  return normalizeBuildBoardCard({
    ...decoded.card,
    id: task.id,
    title: decoded.card.title || task.title,
    createdAt: decoded.card.createdAt || task.created_at,
    updatedAt: task.updated_at || decoded.card.updatedAt,
  })
}

export async function listBuildBoardCards({ request = hermesKanbanRequest } = {}) {
  const board = await request({ path: '/board', query: { tenant: BUILD_BOARD_TENANT, include_archived: false } })
  const tasks = (board?.columns || []).flatMap(column => Array.isArray(column?.tasks) ? column.tasks : [])
  const details = await Promise.all(tasks.map(task => request({ path: `/tasks/${encodeURIComponent(task.id)}` })))
  const cards = details.map(buildBoardCardFromHermes).filter(Boolean)
  cards.sort((a, b) => BUILD_BOARD_COLUMNS.indexOf(a.column) - BUILD_BOARD_COLUMNS.indexOf(b.column)
    || String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)))
  return { cards, orchestration: await readOrchestration(request) }
}

async function readOrchestration(request) {
  // The dashboard kanban REST surface does not expose the server's configured
  // kanban.orchestrator_profile (GET /config returns display settings only).
  // Truth order: (1) an explicit orchestrator field from the API if a Hermes
  // version provides one; (2) HERMES_KANBAN_ORCHESTRATOR_PROFILE, set by the
  // deploy run after verifying kanban.orchestrator_profile in the Hermes
  // config.yaml on the host — labeled as deploy-verified, not live.
  const declared = cleanText(process.env.HERMES_KANBAN_ORCHESTRATOR_PROFILE || '', 120)
  try {
    const value = await request({ path: '/config' })
    const apiProfile = value?.kanban?.orchestrator_profile
      || value?.orchestrator_profile
      || value?.effective_orchestrator_profile
      || ''
    if (apiProfile) {
      return {
        orchestratorProfile: cleanText(apiProfile, 120),
        expectedProfile: 'foreman',
        matchesExpected: String(apiProfile).toLowerCase() === 'foreman',
        verifiedVia: 'api',
      }
    }
    if (declared) {
      return {
        orchestratorProfile: declared,
        expectedProfile: 'foreman',
        matchesExpected: declared.toLowerCase() === 'foreman',
        verifiedVia: 'deploy-config',
      }
    }
    return { orchestratorProfile: '', expectedProfile: 'foreman', matchesExpected: false, verifiedVia: 'none' }
  } catch (error) {
    return { orchestratorProfile: '', expectedProfile: 'foreman', matchesExpected: false, error: cleanText(error?.message || error, 300) }
  }
}

export async function getBuildBoardCard(id, { request = hermesKanbanRequest } = {}) {
  const detail = await request({ path: `/tasks/${encodeURIComponent(cleanText(id, 120))}` })
  return buildBoardCardFromHermes(detail)
}

export async function createBuildBoardCard(input, { request = hermesKanbanRequest } = {}) {
  const now = isoNow()
  const card = normalizeBuildBoardCard({ ...input, id: '', column: 'Idea', createdAt: now, updatedAt: now })
  if (!card.title) throw new Error('Build Board title is required')
  const response = await request({
    path: '/tasks',
    method: 'POST',
    body: {
      title: card.title,
      body: cardBody(card),
      assignee: 'foreman',
      tenant: BUILD_BOARD_TENANT,
      priority: card.size === 'L' ? 2 : card.size === 'M' ? 1 : 0,
      triage: false,
      idempotency_key: cleanText(input?.idempotencyKey, 240) || undefined,
    },
  })
  const taskId = response?.task?.id || response?.task_id
  if (!taskId) throw new Error('Hermes kanban did not return a task id')
  // The Command Center owns this six-column lifecycle. Keep the backing Hermes
  // task blocked so the dispatcher cannot auto-run a Build Board card.
  const parked = await request({
    path: `/tasks/${encodeURIComponent(taskId)}`,
    method: 'PATCH',
    body: { status: 'blocked', block_reason: 'Command Center Build Board owns lifecycle' },
  })
  return buildBoardCardFromHermes(parked?.task || response?.task || response) || normalizeBuildBoardCard({ ...card, id: taskId })
}

export async function saveBuildBoardCard(card, { request = hermesKanbanRequest } = {}) {
  const normalized = normalizeBuildBoardCard({ ...card, updatedAt: isoNow() })
  if (!normalized.id) throw new Error('Build Board card id is required')
  const response = await request({
    path: `/tasks/${encodeURIComponent(normalized.id)}`,
    method: 'PATCH',
    body: { title: normalized.title, body: cardBody(normalized), assignee: 'foreman' },
  })
  return buildBoardCardFromHermes(response?.task || response) || normalized
}

export async function addBuildBoardComment(cardId, body, author = 'Command Center', { request = hermesKanbanRequest } = {}) {
  return request({
    path: `/tasks/${encodeURIComponent(cleanText(cardId, 120))}/comments`,
    method: 'POST',
    body: { author: cleanText(author, 120), body: cleanText(body, 10000) },
  })
}

export async function draftBuildBoardSpec(card, { runOrca } = {}) {
  const execute = runOrca || (async (input) => {
    try { ensureOrcaAgent() } catch {}
    const run = createRun(input)
    return executeRun(run.id)
  })
  const result = await execute({
    fromAgentId: 'build-board-spec',
    productId: card.productId || null,
    requestId: card.linkedTicket?.id || null,
    task: 'Draft a Command Center CODEX_HANDOFF.md entry. Return exactly these four sections and no title or preamble: **Why:** one concise paragraph; **Scope** followed by a numbered list; **Acceptance:** concrete testable criteria; **Review checkpoint:** sized to the work. Do not claim approval or deployment.',
    context: `Build Board card ${buildBoardTag(card.id)}\nTitle: ${card.title}\nSize: ${card.size}\nProduct: ${card.productId || 'Command Center'}\nSource: ${card.source}\nSummary:\n${card.summary}`,
    complexity: 'standard',
    outputFormat: 'markdown',
    maxTokens: 4000,
  })
  if (result?.status !== 'done' || !cleanText(result?.result)) throw new Error(result?.error || 'Orca did not return a completed Build Board specification')
  return cleanText(result.result, 30000)
}

function section(draft, name, nextNames = []) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const next = nextNames.length ? `(?=\\n\\s*(?:\\*\\*)?(?:${nextNames.map(value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?:\\*\\*)?\\s*:?)` : '$'
  const match = cleanText(draft, 30000).match(new RegExp(`(?:^|\\n)\\s*(?:\\*\\*)?${escaped}(?:\\*\\*)?\\s*:?\\s*([\\s\\S]*?)${next}`, 'i'))
  return cleanText(match?.[1], 20000)
}

export function formatBuildBoardHandoff(card, draft = card?.specText) {
  const why = section(draft, 'Why', ['Scope', 'Acceptance', 'Review checkpoint'])
  const scope = section(draft, 'Scope', ['Acceptance', 'Review checkpoint'])
  const acceptance = section(draft, 'Acceptance', ['Review checkpoint'])
  const reviewCheckpoint = section(draft, 'Review checkpoint')
  if (!why || !scope || !acceptance || !reviewCheckpoint) {
    throw new Error('The handoff draft must include Why, Scope, Acceptance, and Review checkpoint sections')
  }
  const title = cleanText(card?.title, 200).replace(/[\r\n#]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!title) throw new Error('The handoff title is required')
  const tag = buildBoardTag(card?.id)
  return `<a id="${tag}"></a>\n\n## [${tag}] Build Board Handoff — ${title} (${card?.size || 'M'}) — OPEN\n\n**Why:** ${why}\n\n**Scope**\n${scope}\n\n**Acceptance:** ${acceptance}\n\n**Review checkpoint:** ${reviewCheckpoint}`
}

function runGit(args, { cwd = process.cwd(), allowFailure = false } = {}) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true, maxBuffer: 2 * 1024 * 1024 })
  if (!allowFailure && result.status !== 0) throw new Error(cleanText(result.stderr || result.stdout || `git ${args[0]} failed`, 1000))
  return { status: result.status ?? 1, stdout: result.stdout || '', stderr: result.stderr || '' }
}

export function appendBuildBoardHandoff(card, {
  repoRoot = process.cwd(),
  handoffPath = path.join(process.cwd(), 'CODEX_HANDOFF.md'),
  git = runGit,
} = {}) {
  const relative = path.relative(repoRoot, handoffPath).replace(/\\/g, '/')
  if (!relative || relative.startsWith('../') || path.isAbsolute(relative)) throw new Error('CODEX_HANDOFF.md must be inside the repository')
  const marker = `[${buildBoardTag(card.id)}]`
  const current = fs.readFileSync(handoffPath, 'utf8')
  if (current.includes(marker)) {
    const existing = git(['log', '-1', '--format=%H', '--', relative], { cwd: repoRoot })
    return { appended: false, commit: cleanText(existing.stdout, 80), specRef: `CODEX_HANDOFF.md#${buildBoardTag(card.id)}` }
  }
  const dirty = git(['status', '--porcelain', '--', relative], { cwd: repoRoot })
  if (cleanText(dirty.stdout)) throw new Error('CODEX_HANDOFF.md has uncommitted changes; approval stopped to protect the coordination file')

  const entry = formatBuildBoardHandoff(card)
  const originalBytes = fs.statSync(handoffPath).size
  fs.appendFileSync(handoffPath, `${current.endsWith('\n') ? '\n' : '\n\n'}${entry}\n`, 'utf8')
  try {
    git(['add', '--', relative], { cwd: repoRoot })
    git(['commit', '--only', '-m', `handoff: ${cleanText(card.title, 160).replace(/[\r\n]/g, ' ')}`, '--', relative], { cwd: repoRoot })
    const committed = git(['rev-parse', 'HEAD'], { cwd: repoRoot })
    return { appended: true, commit: cleanText(committed.stdout, 80), specRef: `CODEX_HANDOFF.md#${buildBoardTag(card.id)}` }
  } catch (error) {
    fs.truncateSync(handoffPath, originalBytes)
    git(['add', '--', relative], { cwd: repoRoot, allowFailure: true })
    throw error
  }
}

export function parseBuildBoardCommitTags(log = '') {
  const found = []
  for (const line of String(log).split(/\r?\n/)) {
    const [hash = '', at = '', ...subjectParts] = line.split('\t')
    const subject = subjectParts.join('\t').trim()
    if (!/^[a-f0-9]{7,40}$/i.test(hash)) continue
    const tags = subject.matchAll(/\[bb-([a-z0-9_-]+)\]/gi)
    for (const match of tags) found.push({ cardId: match[1], hash, at, subject })
  }
  return found
}

export async function syncBuildBoardCommits({ request = hermesKanbanRequest, git = runGit, repoRoot = process.cwd() } = {}) {
  const { cards, orchestration } = await listBuildBoardCards({ request })
  const log = git(['log', '--max-count=500', '--format=%H%x09%cI%x09%s'], { cwd: repoRoot })
  const refs = parseBuildBoardCommitTags(log.stdout)
  const updated = []
  for (const card of cards) {
    const matches = refs.filter(ref => ref.cardId === card.id || ref.cardId === buildBoardTag(card.id))
    if (!matches.length) continue
    const byHash = new Map(card.commits.map(commit => [commit.hash, commit]))
    for (const match of matches) byHash.set(match.hash, normalizeCommit(match))
    const nextColumn = card.column === 'Handoff' ? 'Executing' : card.column
    const next = { ...card, column: nextColumn, commits: [...byHash.values()] }
    if (JSON.stringify(next.commits) !== JSON.stringify(card.commits) || nextColumn !== card.column) updated.push(await saveBuildBoardCard(next, { request }))
  }
  const refreshed = await listBuildBoardCards({ request })
  return { ...refreshed, orchestration, synced: updated.length }
}

export function parseCheckerVerdict(text, criteria = []) {
  const raw = cleanText(text, 20000).replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  let payload
  try { payload = JSON.parse(raw) } catch { payload = null }
  const rows = Array.isArray(payload?.criteria) ? payload.criteria : criteria.map(criterion => ({ criterion, verdict: 'fail', notes: 'Checker returned an invalid structured verdict.' }))
  const normalized = normalizeReviewNote({
    id: `checker-${Date.now().toString(36)}`,
    author: 'checker',
    at: isoNow(),
    verdict: payload?.verdict,
    summary: payload?.summary || (payload ? '' : raw),
    criteria: rows,
  })
  normalized.verdict = normalized.criteria.length && normalized.criteria.every(row => row.verdict === 'pass') ? 'pass' : 'fail'
  return normalized
}

export function acceptanceCriteriaFromSpec(specText = '') {
  const acceptance = section(specText, 'Acceptance', ['Review checkpoint'])
  if (!acceptance) return []
  const bullets = acceptance.split(/\n+/).map(row => row.replace(/^\s*(?:[-*]|\d+[.)])\s*/, '').trim()).filter(Boolean)
  return bullets.length > 1 ? bullets : acceptance.split(/;\s+/).map(row => row.trim()).filter(Boolean)
}

function commitEvidence(card, { git = runGit, repoRoot = process.cwd() } = {}) {
  const chunks = []
  for (const commit of card.commits.slice(0, 20)) {
    if (!/^[a-f0-9]{7,40}$/i.test(commit.hash)) continue
    const result = git(['show', '--no-ext-diff', '--format=fuller', '--stat', '--patch', '--unified=2', '--max-count=1', commit.hash], { cwd: repoRoot, allowFailure: true })
    chunks.push(cleanText(result.stdout || result.stderr, 20000))
  }
  return chunks.join('\n\n').slice(0, 60000)
}

export async function runBuildBoardChecker(card, { chat = hermesChat, git = runGit, repoRoot = process.cwd() } = {}) {
  const criteria = acceptanceCriteriaFromSpec(card.specText)
  if (!criteria.length) throw new Error('The card has no acceptance criteria for Checker')
  if (!card.commits.length) throw new Error('The card has no commits for Checker')
  const response = await chat({
    profile: 'checker',
    messages: [
      { role: 'system', content: 'You are Checker. Review only the supplied commit evidence against every acceptance criterion. Return strict JSON: {"verdict":"pass|fail","summary":"...","criteria":[{"criterion":"...","verdict":"pass|fail","notes":"evidence"}]}. Never omit a criterion.' },
      { role: 'user', content: `Card: ${card.title}\nAcceptance criteria:\n${criteria.map((value, index) => `${index + 1}. ${value}`).join('\n')}\n\nCommit evidence:\n${commitEvidence(card, { git, repoRoot })}` },
    ],
  })
  const usage = response?.usage || {}
  recordUsageEvent({
    agentId: 'checker', provider: 'hermes', model: response?.model || 'hermes-agent',
    promptTokens: usage.prompt_tokens ?? usage.promptTokens,
    completionTokens: usage.completion_tokens ?? usage.completionTokens,
    estCostUsd: 0, unknown: true, source: 'other', productId: card.productId || 'command-center',
    requestId: card.linkedTicket?.id || undefined, runId: `${buildBoardTag(card.id)}-review-${Date.now().toString(36)}`,
  })
  return parseCheckerVerdict(response?.text, criteria)
}

export function runBuildBoardInventoryDiff({ repoRoot = process.cwd(), run = spawnSync } = {}) {
  const command = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const result = run(command, ['run', 'inventory:diff'], { cwd: repoRoot, encoding: 'utf8', windowsHide: true, maxBuffer: 4 * 1024 * 1024 })
  return {
    ok: result.status === 0,
    exitCode: result.status ?? 1,
    output: cleanText([result.stdout, result.stderr].filter(Boolean).join('\n'), 6000),
    ranAt: isoNow(),
  }
}

export async function moveBuildBoardCard(card, targetColumn, {
  request = hermesKanbanRequest,
  runOrca,
  chat = hermesChat,
  git = runGit,
  repoRoot = process.cwd(),
  inventoryRun = spawnSync,
  reason = 'operator',
} = {}) {
  if (!BUILD_BOARD_COLUMNS.includes(targetColumn)) throw new Error('Unknown Build Board column')
  if (targetColumn === 'Handoff') throw new Error('Use Approve → Handoff so CODEX_HANDOFF.md stays the approval gate')
  if (card.column === 'Handoff' && targetColumn === 'Executing' && reason !== 'commit-sync') throw new Error(`A commit tagged [${buildBoardTag(card.id)}] moves this card to Executing`)
  if (reason === 'operator' && !OPERATOR_TRANSITIONS[card.column]?.has(targetColumn)) {
    throw new Error(`Build Board cards move in order; ${card.column} cannot move directly to ${targetColumn}`)
  }

  let next = normalizeBuildBoardCard({ ...card, column: targetColumn })
  if (targetColumn === 'Spec' && !next.specText) next.specText = await draftBuildBoardSpec(next, { runOrca })
  if (targetColumn === 'Review') {
    next = await saveBuildBoardCard(next, { request })
    let verdict
    try {
      verdict = await runBuildBoardChecker(next, { chat, git, repoRoot })
    } catch (checkerError) {
      const criteria = acceptanceCriteriaFromSpec(next.specText)
      verdict = normalizeReviewNote({
        id: `checker-${Date.now().toString(36)}`,
        author: 'checker',
        at: isoNow(),
        verdict: 'fail',
        summary: `Checker could not complete: ${cleanText(checkerError?.message || checkerError, 1000)}`,
        criteria: criteria.map(criterion => ({ criterion, verdict: 'fail', notes: 'Checker did not complete this check.' })),
      })
    }
    next = { ...next, reviewNotes: [...next.reviewNotes, verdict] }
    await addBuildBoardComment(next.id, `Checker verdict: ${verdict.verdict.toUpperCase()}\n${verdict.criteria.map(row => `- ${row.verdict.toUpperCase()}: ${row.criterion} — ${row.notes}`).join('\n')}`, 'checker', { request })
  }
  if (targetColumn === 'Shipped') next.inventoryDiff = runBuildBoardInventoryDiff({ repoRoot, run: inventoryRun })
  return saveBuildBoardCard(next, { request })
}

export async function approveBuildBoardHandoff(card, {
  request = hermesKanbanRequest,
  repoRoot = process.cwd(),
  handoffPath = path.join(process.cwd(), 'CODEX_HANDOFF.md'),
  git = runGit,
} = {}) {
  const approval = appendBuildBoardHandoff(card, { repoRoot, handoffPath, git })
  const updated = await saveBuildBoardCard({ ...card, column: 'Handoff', specRef: approval.specRef, handoffCommit: approval.commit }, { request })
  await addBuildBoardComment(card.id, `Approved handoff committed as ${approval.commit}. Spec: ${approval.specRef}`, 'Command Center', { request })
  return { card: updated, approval }
}
