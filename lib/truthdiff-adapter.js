import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import {
  analyzeImpact,
  buildIdentifierStatus,
  normalizeDocument,
  readGitChangeSet,
  removedVerifiableIdentifiers,
} from 'truthdiff'

import { resolveVaultFile, walkVaultMd } from './obsidianVaults'

function gitRoot(candidatePath) {
  try {
    return execFileSync(
      'git',
      ['-C', candidatePath, 'rev-parse', '--show-toplevel'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim()
  } catch {
    return ''
  }
}

function availableRoots(vault) {
  const configured = Array.isArray(vault?.roots)
    ? vault.roots.filter(root => root.available !== false && root.path)
    : []
  if (configured.length) return configured
  return vault?.path
    ? [{
        id: vault.id || 'vault',
        name: vault.name || 'Vault',
        color: '',
        path: vault.path,
        available: true,
      }]
    : []
}

function prefixChangeSet(changeSet, rootId) {
  return {
    ...changeSet,
    files: changeSet.files.map(file => ({
      ...file,
      path: `${rootId}/@source/${file.path}`,
      previousPath: file.previousPath
        ? `${rootId}/@source/${file.previousPath}`
        : '',
    })),
  }
}

function mergeIdentifierStatus(target, next) {
  for (const [key, state] of Object.entries(next)) {
    if (state === 'present' || !target[key]) target[key] = state
  }
}

function semanticDocumentId(match, root, documentIds) {
  const candidates = [
    match.filePath,
    `${root.id}/${match.filePath}`,
  ].filter(Boolean)
  return candidates.find(candidate => documentIds.has(candidate)) || ''
}

async function defaultSemanticSearch(query, options) {
  const { searchFKL } = await import('./fkl-index')
  return searchFKL(query, options)
}

async function semanticCandidatesForChanges(
  changeSet,
  rootsById,
  documentIds,
  search,
) {
  const candidates = []
  for (const file of changeSet.files.slice(0, 8)) {
    const match = file.path.match(/^([^/]+)\/@source\/(.+)$/)
    const root = match ? rootsById.get(match[1]) : null
    if (!root) continue
    const query = [...file.removedLines, ...file.addedLines]
      .join('\n')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 1800)
    if (query.length < 24) continue

    const result = await search(query, {
      vault: root.id,
      limit: 8,
      minScore: 0.45,
    })
    for (const semanticMatch of result.matches || []) {
      const documentId = semanticDocumentId(
        semanticMatch,
        root,
        documentIds,
      )
      if (!documentId) continue
      candidates.push({
        sourceId: file.path,
        documentId,
        score: semanticMatch.score,
        snippet: semanticMatch.snippet,
      })
    }
  }
  return candidates
}

function readRange(repoPath, range, allowFallback) {
  const working = readGitChangeSet({
    repoPath,
    base: range === 'last-commit' ? 'HEAD~1' : 'HEAD',
    head: range === 'last-commit' ? 'HEAD' : null,
  })
  if (working.files.length || !allowFallback || range === 'last-commit') {
    return { changeSet: working, rangeUsed: range }
  }
  try {
    return {
      changeSet: readGitChangeSet({
        repoPath,
        base: 'HEAD~1',
        head: 'HEAD',
      }),
      rangeUsed: 'last-commit',
    }
  } catch {
    return { changeSet: working, rangeUsed: range }
  }
}

export async function buildTruthDiffGraph(vault, options = {}) {
  const files = options.files || walkVaultMd(vault)
  const documents = []
  for (const file of files) {
    try {
      const content = fs.readFileSync(resolveVaultFile(vault, file.path), 'utf8')
      documents.push(normalizeDocument({
        id: file.path,
        title: file.name,
        content,
        sourceRoot: file.sourceRoot || '',
        sourceName: file.sourceName || '',
        sourceColor: file.sourceColor || '',
      }))
    } catch {
      // A note may disappear between the vault walk and read.
    }
  }

  const roots = availableRoots(vault)
    .map(root => ({ ...root, gitRoot: gitRoot(root.path) }))
    .filter(root => root.gitRoot)
  const uniqueRoots = [
    ...new Map(roots.map(root => [root.gitRoot.toLowerCase(), root])).values(),
  ]
  const range = options.range === 'last-commit' ? 'last-commit' : 'working'
  const aggregate = { base: 'HEAD', head: 'WORKTREE', files: [] }
  const identifierStatus = {}
  const repositories = []

  for (const root of uniqueRoots) {
    let analyzed
    try {
      analyzed = readRange(
        root.gitRoot,
        range,
        options.fallbackToLastCommit !== false,
      )
    } catch (error) {
      repositories.push({
        id: root.id,
        name: root.name,
        path: root.gitRoot,
        error: error.message,
      })
      continue
    }

    const status = await buildIdentifierStatus(
      root.gitRoot,
      removedVerifiableIdentifiers(analyzed.changeSet),
    )
    mergeIdentifierStatus(identifierStatus, status)
    const prefixed = prefixChangeSet(analyzed.changeSet, root.id)
    aggregate.files.push(...prefixed.files)
    repositories.push({
      id: root.id,
      name: root.name,
      path: root.gitRoot,
      range: analyzed.rangeUsed,
      changedFiles: prefixed.files.length,
    })
  }

  aggregate.fingerprint = crypto
    .createHash('sha256')
    .update(JSON.stringify(repositories.map(repository => ({
      id: repository.id,
      path: repository.path,
      range: repository.range,
      changedFiles: repository.changedFiles,
    }))))
    .update(JSON.stringify(aggregate.files))
    .digest('hex')

  const rootsById = new Map(uniqueRoots.map(root => [root.id, root]))
  const documentIds = new Set(documents.map(document => document.id))
  const semanticCandidates = options.semantic === false
    ? []
    : await semanticCandidatesForChanges(
        aggregate,
        rootsById,
        documentIds,
        options.semanticSearch || defaultSemanticSearch,
      )

  const graph = analyzeImpact({
    changeSet: aggregate,
    documents,
    identifierStatus,
    semanticCandidates,
  })

  return {
    ...graph,
    mode: 'impact',
    repositories,
    semanticCandidates: semanticCandidates.length,
    notice: aggregate.files.length
      ? ''
      : 'No Git changes were available in the mounted vault repositories.',
  }
}
