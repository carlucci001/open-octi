import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { requireCrmRead, requireCrmWrite } from '@/lib/permissions'
import { SKIP_DIRS, getVaults, isInside, pickVault, resolveVaultFile, safeJoin, walkVaultMd } from '@/lib/obsidianVaults'
import { listAgents, saveAgent } from '@/lib/agents-store'
import { getFKLNotesGraph } from '@/lib/fkl-index'
import { buildTruthDiffGraph } from '@/lib/truthdiff-adapter'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SKILL_ROOT_CANDIDATES = [
  { id: 'fcc', name: 'Command Center', path: '/home/carl/dev/farrington-command-center/.claude/skills' },
  { id: 'ContentHub', name: 'ContentHub', path: '/home/carl/dev/ContentHub/.claude/skills' },
  { id: 'openclaw-workspace', name: 'OpenClaw Workspace', path: '/home/carl/.openclaw/workspace/skills' },
  { id: 'openclaw-system', name: 'OpenClaw System', path: '/home/carl/.local/lib/node_modules/openclaw/skills' },
  { id: 'win-ContentHub', name: 'ContentHub', path: 'C:/dev/ContentHub/.claude/skills' },
  { id: 'codex-user', name: 'Codex User Skills', path: 'C:/Users/carlf/.codex/skills' },
  { id: 'codex-system', name: 'Codex System Skills', path: 'C:/Users/carlf/.codex/skills/.system' },
]

function getSkillRoots(vault) {
  const candidates = [
    { id: 'vault-claude', name: 'Vault Skills', path: path.join(vault, '.claude', 'skills') },
    ...SKILL_ROOT_CANDIDATES,
  ]
  const seen = new Set()
  return candidates
    .map(root => ({ ...root, abs: path.resolve(root.path) }))
    .filter(root => {
      if (!fs.existsSync(root.abs)) return false
      const key = root.abs.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

function walkSkillFiles(root, out = []) {
  if (!fs.existsSync(root.abs)) return out
  const stack = [root.abs]
  while (stack.length) {
    const dir = stack.pop()
    for (const name of fs.readdirSync(dir)) {
      if (SKIP_DIRS.has(name)) continue
      const full = path.join(dir, name)
      const stat = fs.statSync(full)
      if (stat.isDirectory()) {
        stack.push(full)
      } else if (name.toLowerCase().endsWith('.md')) {
        const rel = path.relative(root.abs, full).replace(/\\/g, '/')
        out.push({
          path: `skill:${root.id}/${rel}`,
          name: name.replace(/\.md$/i, ''),
          size: stat.size,
          modifiedAt: stat.mtime.toISOString(),
          source: root.name,
        })
      }
    }
  }
  return out
}

function resolveSkillPath(vault, skillPath) {
  const m = String(skillPath || '').match(/^skill:([^/]+)\/(.+)$/)
  if (!m) throw new Error('Invalid skill path')
  const [, rootId, rel] = m
  const root = getSkillRoots(vault).find(r => r.id === rootId)
  if (!root) throw new Error('Unknown skill root')
  const full = path.resolve(root.abs, rel)
  if (!isInside(root.abs, full)) throw new Error('Path escapes skill root')
  if (!full.toLowerCase().endsWith('.md')) throw new Error('Only markdown skills can be read')
  return full
}

function buildTree(files) {
  const root = { name: '', path: '', children: {}, files: [] }
  for (const f of files) {
    const parts = f.path.split('/')
    let node = root
    for (let i = 0; i < parts.length - 1; i++) {
      const seg = parts[i]
      if (!node.children[seg]) node.children[seg] = { name: seg, path: parts.slice(0, i + 1).join('/'), children: {}, files: [] }
      node = node.children[seg]
    }
    node.files.push(f)
  }
  const toArray = (n) => ({
    name: n.name,
    path: n.path,
    files: n.files.sort((a, b) => a.name.localeCompare(b.name)),
    folders: Object.values(n.children).map(toArray).sort((a, b) => a.name.localeCompare(b.name)),
  })
  return toArray(root)
}

const WIKILINK = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g
const MDLINK = /\[([^\]]+)\]\(([^)]+\.md)\)/g

function extractLinks(content) {
  const links = new Set()
  let m
  while ((m = WIKILINK.exec(content)) !== null) links.add(m[1].trim())
  while ((m = MDLINK.exec(content)) !== null) {
    const target = m[2].replace(/\.md$/i, '').split('/').pop()
    links.add(target.trim())
  }
  return [...links]
}

// Per-vault caches. Keyed by vault id so switching vaults is instant after first build.
const linkCacheByVault = new Map()   // vaultId -> Map(path:mtime, links[])
const listCacheByVault = new Map()   // vaultId -> { fp, files, tree }
const graphCacheByVault = new Map()  // vaultId -> { fp, nodes, edges }

function fingerprint(files) {
  const raw = files.map(f => f.path + '|' + f.modifiedAt).join(';')
  return crypto.createHash('sha1').update(raw).digest('hex').slice(0, 16)
}

function sha(value) {
  return crypto.createHash('sha1').update(String(value || '')).digest('hex')
}

function promptSlug(value) {
  return String(value || 'agent')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'agent'
}

function liveAgentPromptPath(agent) {
  return `Prompt Workshop/Live Agent Prompts/${promptSlug(agent.id || agent.name)}.md`
}

function extractPromptSection(content) {
  const raw = String(content || '')
  const marker = raw.match(/^## Prompt\s*$/mi)
  if (!marker) return raw.trim()
  const start = marker.index + marker[0].length
  const rest = raw.slice(start).replace(/^\s+/, '')
  const next = rest.search(/^##\s+/m)
  return (next >= 0 ? rest.slice(0, next) : rest).trim()
}

function importedLiveHash(content) {
  return String(content || '').match(/^Imported live hash:\s*([a-f0-9]{40})\s*$/mi)?.[1] || ''
}

function managedPromptDocument(agent, prompt, liveHash, note = 'Imported from live agent') {
  const agentName = agent.name || agent.id || 'Agent'
  return [
    `# ${agentName} Live Agent Prompt`,
    '',
    `Status: ${note}`,
    `Agent ID: ${agent.id || ''}`,
    `Agent title: ${agent.title || ''}`,
    `Agent category: ${agent.category || ''}`,
    `Live source: CRM agent jobDescription`,
    `Imported live hash: ${liveHash}`,
    `Last sync: ${new Date().toISOString()}`,
    '',
    '## Prompt',
    '',
    prompt || '',
    '',
    '## Source Of Truth Notes',
    '',
    '- This managed file is the editable source candidate for the live agent prompt.',
    '- Use Sync from Live to refresh it from the live agent.',
    '- Use Promote to Live only when this file should replace the live agent prompt.',
    '- Save a version before important edits or promotions.',
    '',
  ].join('\n')
}

function syncStatus(liveHash, sourceHash, baselineHash) {
  if (!sourceHash) return 'NOT_IMPORTED'
  if (liveHash === sourceHash) return 'SYNCED'
  if (baselineHash && baselineHash === liveHash) return 'WORKSHOP_EDITED'
  if (baselineHash && baselineHash === sourceHash) return 'LIVE_CHANGED'
  return 'CONFLICT'
}

async function buildPromptSyncRows(picked) {
  const data = await listAgents()
  const agents = Array.isArray(data.agents) ? data.agents : []
  return agents.map(agent => {
    const sourcePath = liveAgentPromptPath(agent)
    const livePrompt = String(agent.jobDescription || '')
    const liveHash = sha(livePrompt)
    let sourcePrompt = ''
    let sourceHash = ''
    let baselineHash = ''
    let exists = false
    try {
      const full = resolveVaultFile(picked, sourcePath)
      exists = fs.existsSync(full)
      if (exists) {
        const content = fs.readFileSync(full, 'utf-8')
        sourcePrompt = extractPromptSection(content)
        sourceHash = sha(sourcePrompt)
        baselineHash = importedLiveHash(content)
      }
    } catch {}
    return {
      agentId: agent.id,
      name: agent.name || agent.id,
      title: agent.title || agent.role || '',
      category: agent.category || '',
      enabled: agent.enabled !== false,
      sourcePath,
      status: syncStatus(liveHash, sourceHash, baselineHash),
      hasSource: exists,
      promptLength: livePrompt.length,
      sourcePromptLength: sourcePrompt.length,
      baselineKnown: !!baselineHash,
      toolsCount: Array.isArray(agent.tools) ? agent.tools.length : 0,
    }
  }).sort((a, b) => a.name.localeCompare(b.name))
}

async function buildGraph(picked, vaultId, files) {
  const byName = new Map()
  const byPath = new Map()
  for (const f of files) {
    byName.set(f.name.toLowerCase(), f.path)
    byPath.set(f.path.replace(/\.md$/i, '').toLowerCase(), f.path)
  }

  const nodes = files.map(f => ({ id: f.path, name: f.name, links: 0, sourceRoot: f.sourceRoot || '', sourceName: f.sourceName || '', sourceColor: f.sourceColor || '' }))
  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  const edges = []

  if (!linkCacheByVault.has(vaultId)) linkCacheByVault.set(vaultId, new Map())
  const linkCache = linkCacheByVault.get(vaultId)

  // Read uncached files concurrently in batches of 100 so the event loop stays free
  const toRead = files.filter(f => !linkCache.has(f.path + ':' + f.modifiedAt))
  const CHUNK = 10
  for (let i = 0; i < toRead.length; i += CHUNK) {
    await Promise.all(toRead.slice(i, i + CHUNK).map(async f => {
      const cacheKey = f.path + ':' + f.modifiedAt
      try {
        const content = await fs.promises.readFile(resolveVaultFile(picked, f.path), 'utf-8')
        linkCache.set(cacheKey, extractLinks(content))
      } catch { linkCache.set(cacheKey, []) }
    }))
  }

  // Build edges from cache
  const edgeSet = new Set()
  for (const f of files) {
    const linkNames = linkCache.get(f.path + ':' + f.modifiedAt) || []
    for (const raw of linkNames) {
      const key = raw.toLowerCase()
      const targetPath = byPath.get(key) || byName.get(key)
      if (targetPath && targetPath !== f.path) {
        const ek = f.path + '\0' + targetPath
        if (!edgeSet.has(ek)) {
          edgeSet.add(ek)
          edges.push({ source: f.path, target: targetPath })
          nodeMap.get(f.path).links++
          nodeMap.get(targetPath).links++
        }
      }
    }
  }

  if (linkCache.size > 5000) {
    const keep = new Set(files.map(f => f.path + ':' + f.modifiedAt))
    for (const k of linkCache.keys()) if (!keep.has(k)) linkCache.delete(k)
  }


  return { nodes, edges }
}

export async function GET(request) {
  const { error } = await requireCrmRead(request)
  if (error) return error
  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action') || 'list'

    if (action === 'vaults') {
      return NextResponse.json({ vaults: getVaults() })
    }

    const picked = pickVault(searchParams)
    const vault = picked.path

    if (!picked.available) {
      return NextResponse.json({ error: `Vault not found at ${vault}`, vaultId: picked.id }, { status: 404 })
    }

    if (action === 'list') {
      const files = walkVaultMd(picked)
      const fp = fingerprint(files)
      const clientFp = searchParams.get('fp')
      if (clientFp && clientFp === fp) {
        return NextResponse.json({ unchanged: true, fp, vaultId: picked.id })
      }
      const cached = listCacheByVault.get(picked.id)
      if (!cached || cached.fp !== fp) {
        listCacheByVault.set(picked.id, { fp, files, tree: buildTree(files) })
      }
      const out = listCacheByVault.get(picked.id)
      return NextResponse.json({ vault, vaultId: picked.id, vaultName: picked.name, fp, tree: out.tree, count: files.length, cached: true })
    }

    if (action === 'read') {
      const rel = searchParams.get('path')
      if (!rel) return NextResponse.json({ error: 'path required' }, { status: 400 })
      const full = rel.startsWith('skill:') ? resolveSkillPath(vault, rel) : resolveVaultFile(picked, rel)
      if (!fs.existsSync(full)) return NextResponse.json({ error: 'file not found' }, { status: 404 })
      const content = fs.readFileSync(full, 'utf-8')
      const stat = fs.statSync(full)
      return NextResponse.json({ path: rel, content, size: stat.size, modifiedAt: stat.mtime.toISOString() })
    }

    if (action === 'skills') {
      const skills = getSkillRoots(vault).flatMap(root => walkSkillFiles(root))
        .sort((a, b) => a.path.localeCompare(b.path))
      return NextResponse.json({ ok: true, vaultId: picked.id, count: skills.length, skills })
    }

    if (action === 'promptSync') {
      const rows = await buildPromptSyncRows(picked)
      return NextResponse.json({ ok: true, vaultId: picked.id, count: rows.length, rows })
    }

    if (action === 'graph') {
      const files = walkVaultMd(picked)
      const requestedMode = searchParams.get('mode')
      const mode = requestedMode === 'semantic' || requestedMode === 'impact'
        ? requestedMode
        : 'wikilink'

      if (mode === 'impact') {
        const impact = await buildTruthDiffGraph(picked, {
          files,
          range: searchParams.get('range'),
        })
        return NextResponse.json({
          vault,
          vaultId: picked.id,
          vaultName: picked.name,
          ...impact,
        })
      }

      const fp = mode + ':' + fingerprint(files)
      const clientFp = searchParams.get('fp')
      if (clientFp && clientFp === fp) {
        return NextResponse.json({ unchanged: true, fp, vaultId: picked.id, mode })
      }

      if (mode === 'semantic') {
        const roots = Array.isArray(picked.roots) ? picked.roots : []
        let g = getFKLNotesGraph(picked.id)
        let semanticScope = picked.id

        if ((!g.nodes || g.nodes.length === 0) && roots.length) {
          const nodes = []
          const edges = []
          for (const root of roots) {
            const rg = getFKLNotesGraph(root.id)
            if (!rg.nodes?.length) continue
            const prefix = (value) => String(value || '').startsWith(`${root.id}/`)
              ? String(value || '')
              : `${root.id}/${value}`
            nodes.push(...rg.nodes.map(n => ({ ...n, id: prefix(n.id) })))
            edges.push(...rg.edges.map(e => ({ ...e, source: prefix(e.source), target: prefix(e.target) })))
          }
          if (nodes.length) {
            g = { nodes, edges }
            semanticScope = 'roots'
          }
        }

        if (!g.nodes || g.nodes.length === 0) {
          g = getFKLNotesGraph()
          semanticScope = 'all'
        }

        const colorByRoot = new Map(roots.map(r => [r.id, r.color]))
        const nameByRoot = new Map(roots.map(r => [r.id, r.name]))
        const nodes = g.nodes.map(n => {
          const seg = n.id.split('/')[0]
          const isRoot = colorByRoot.has(seg)
          return { ...n, sourceRoot: isRoot ? seg : '', sourceName: isRoot ? nameByRoot.get(seg) : '', sourceColor: isRoot ? colorByRoot.get(seg) : '' }
        })
        return NextResponse.json({ vault, vaultId: picked.id, vaultName: picked.name, fp, nodes, edges: g.edges, mode, semantic: true, semanticScope })
      }

      const cached = graphCacheByVault.get(picked.id)
      if (!cached || cached.fp !== fp) {
        const { nodes, edges } = await buildGraph(picked, picked.id, files)
        graphCacheByVault.set(picked.id, { fp, nodes, edges })
      }
      const out = graphCacheByVault.get(picked.id)
      return NextResponse.json({ vault, vaultId: picked.id, vaultName: picked.name, fp, nodes: out.nodes, edges: out.edges, cached: true, mode })
    }

    if (action === 'insights') {
      const files = walkVaultMd(picked)
      const fp = fingerprint(files)
      const cached = graphCacheByVault.get(picked.id)
      if (!cached || cached.fp !== fp) {
        const { nodes, edges } = await buildGraph(picked, picked.id, files)
        graphCacheByVault.set(picked.id, { fp, nodes, edges })
      }
      const graph = graphCacheByVault.get(picked.id)
      const rootStats = {}
      for (const f of files) {
        const root = f.sourceRoot || f.path.split('/')[0] || 'vault'
        if (!rootStats[root]) rootStats[root] = { id: root, count: 0, size: 0, latest: null }
        rootStats[root].count++
        rootStats[root].size += Number(f.size || 0)
        if (!rootStats[root].latest || String(f.modifiedAt) > String(rootStats[root].latest)) rootStats[root].latest = f.modifiedAt
      }
      const recent = files.slice().sort((a, b) => String(b.modifiedAt).localeCompare(String(a.modifiedAt))).slice(0, 12)
      const topLinked = graph.nodes.slice().sort((a, b) => Number(b.links || 0) - Number(a.links || 0)).slice(0, 12)
      const allOrphans = graph.nodes.filter(n => !Number(n.links || 0))
      const orphans = allOrphans.slice(0, 20)
      const mountedRoots = Array.isArray(picked.roots)
        ? picked.roots.map(r => ({ id: r.id, name: r.name, available: r.available, color: r.color || '', path: r.available ? r.path : r.configuredPath }))
        : [{ id: picked.id, name: picked.name, available: picked.available, path: picked.path }]
      return NextResponse.json({
        ok: true,
        vault,
        vaultId: picked.id,
        vaultName: picked.name,
        fp,
        mountedRoots,
        stats: {
          notes: files.length,
          links: graph.edges.length,
          connectedNotes: graph.nodes.filter(n => Number(n.links || 0) > 0).length,
          orphanNotes: allOrphans.length,
          roots: Object.values(rootStats).sort((a, b) => b.count - a.count),
        },
        recent,
        topLinked,
        orphans,
      })
    }

    if (action === 'search') {
      const q = (searchParams.get('q') || '').toLowerCase()
      if (!q) return NextResponse.json({ matches: [] })
      const files = walkVaultMd(picked)
      const matches = []
      for (const f of files) {
        try {
          const content = fs.readFileSync(resolveVaultFile(picked, f.path), 'utf-8')
          const contentLower = content.toLowerCase()
          if (f.name.toLowerCase().includes(q) || contentLower.includes(q)) {
            const idx = contentLower.indexOf(q)
            const snippet = idx >= 0
              ? content.slice(Math.max(0, idx - 40), idx + q.length + 60)
              : ''
            matches.push({ path: f.path, name: f.name, snippet })
          }
        } catch {}
        if (matches.length >= 40) break
      }
      return NextResponse.json({ matches })
    }

    return NextResponse.json({ error: 'unknown action' }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(request) {
  const { error } = await requireCrmWrite(request)
  if (error) return error
  try {
    const { searchParams } = new URL(request.url)
    const body = await request.json()
    // Allow vault id in body or query string
    const params = new URLSearchParams(searchParams)
    if (body.vault && !params.get('vault')) params.set('vault', body.vault)
    const picked = pickVault(params)
    const vault = picked.path

    if (body.action === 'save') {
      const full = resolveVaultFile(picked, body.path)
      fs.mkdirSync(path.dirname(full), { recursive: true })
      fs.writeFileSync(full, body.content || '', 'utf-8')
      return NextResponse.json({ ok: true, path: body.path })
    }

    if (body.action === 'snapshot') {
      const source = resolveVaultFile(picked, body.path)
      if (!fs.existsSync(source)) return NextResponse.json({ ok: false, error: 'file not found' }, { status: 404 })
      const rel = String(body.path || '').replace(/\\/g, '/')
      const base = rel.replace(/\.md$/i, '').split('/').pop() || 'prompt'
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      const targetRel = `Prompt Workshop/Versions/${base}/${stamp}.md`
      const target = resolveVaultFile(picked, targetRel)
      const note = [
        `# ${base} - ${stamp}`,
        '',
        `Source: ${rel}`,
        '',
        fs.readFileSync(source, 'utf-8'),
      ].join('\n')
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, note, 'utf-8')
      return NextResponse.json({ ok: true, path: targetRel })
    }

    if (body.action === 'prompt-sync-import') {
      const agentId = body.agentId
      const data = await listAgents()
      const agent = (data.agents || []).find(a => a.id === agentId)
      if (!agent) return NextResponse.json({ ok: false, error: 'agent not found' }, { status: 404 })
      const prompt = String(agent.jobDescription || '')
      const sourcePath = liveAgentPromptPath(agent)
      const full = resolveVaultFile(picked, sourcePath)
      fs.mkdirSync(path.dirname(full), { recursive: true })
      fs.writeFileSync(full, managedPromptDocument(agent, prompt, sha(prompt), 'Imported from live agent'), 'utf-8')
      return NextResponse.json({ ok: true, path: sourcePath })
    }

    if (body.action === 'prompt-sync-promote') {
      const agentId = body.agentId
      const data = await listAgents()
      const agent = (data.agents || []).find(a => a.id === agentId)
      if (!agent) return NextResponse.json({ ok: false, error: 'agent not found' }, { status: 404 })
      const sourcePath = body.path || liveAgentPromptPath(agent)
      const full = resolveVaultFile(picked, sourcePath)
      if (!fs.existsSync(full)) return NextResponse.json({ ok: false, error: 'managed prompt not found' }, { status: 404 })
      const sourceContent = fs.readFileSync(full, 'utf-8')
      const prompt = extractPromptSection(sourceContent)
      if (!prompt.trim()) return NextResponse.json({ ok: false, error: 'managed prompt is empty' }, { status: 422 })
      const snapshotStamp = new Date().toISOString().replace(/[:.]/g, '-')
      const beforeRel = `Prompt Workshop/Versions/${promptSlug(agent.id)}-live-before-promote/${snapshotStamp}.md`
      const beforeFull = resolveVaultFile(picked, beforeRel)
      fs.mkdirSync(path.dirname(beforeFull), { recursive: true })
      fs.writeFileSync(beforeFull, managedPromptDocument(agent, String(agent.jobDescription || ''), sha(String(agent.jobDescription || '')), 'Live prompt before promotion'), 'utf-8')
      const result = await saveAgent(agent.id, { jobDescription: prompt }, { reason: 'prompt-workshop-promote' })
      fs.writeFileSync(full, managedPromptDocument(agent, prompt, sha(prompt), 'Synced after promotion to live'), 'utf-8')
      return NextResponse.json({ ok: true, path: sourcePath, backup: result.backup, snapshot: beforeRel })
    }

    if (body.action === 'create') {
      const name = (body.name || 'Untitled').replace(/[\\/:*?"<>|]/g, '')
      const folder = body.folder || ''
      const rel = (folder ? folder + '/' : '') + name + '.md'
      const full = resolveVaultFile(picked, rel)
      if (fs.existsSync(full)) return NextResponse.json({ ok: false, error: 'file already exists' }, { status: 409 })
      fs.mkdirSync(path.dirname(full), { recursive: true })
      fs.writeFileSync(full, body.content || `# ${name}\n\n`, 'utf-8')
      return NextResponse.json({ ok: true, path: rel })
    }

    if (body.action === 'delete') {
      const full = resolveVaultFile(picked, body.path)
      if (fs.existsSync(full)) fs.unlinkSync(full)
      return NextResponse.json({ ok: true })
    }

    if (body.action === 'rename') {
      const fromFull = resolveVaultFile(picked, body.from)
      const toFull = resolveVaultFile(picked, body.to)
      fs.mkdirSync(path.dirname(toFull), { recursive: true })
      fs.renameSync(fromFull, toFull)
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'unknown action' }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
