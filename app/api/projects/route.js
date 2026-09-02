// Projects API - standalone store keyed by accountId.
// Each project belongs to an Account (required). Optionally linked to an Opportunity.
import fs from 'fs'
import { rm, readFile } from 'fs/promises'
import path from 'path'
import { NextResponse } from 'next/server'
import { loadAll, create, update, remove, removeMany, findById, logActivity } from '@/lib/entityStore'
import { requireCrmRead, requireCrmWrite } from '@/lib/permissions'
import { maybeSendProjectCompletionEmail } from '@/lib/project-completion-email'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const IN_HOUSE_ACCOUNT_ID = '__in_house__'
const IN_HOUSE_LABEL = 'Farrington Development'
const GITEA_API = 'http://127.0.0.1:3001/api/v1'
const GITEA_AUTH_HEADER = '/home/carl/.config/fcc/gitea-auth-header'
const PROTECTED_FOLDERS = new Set(['farrington-command-center', 'farrington-command-center-preview', 'farrington-command-center-ship'])

function enrich(projects) {
  const accounts = loadAll('accounts')
  const byId = new Map(accounts.map(a => [a.id, a]))
  return projects.map(p => {
    const isInternal = !!p.isInternal || p.ownerOrganization === 'farrington-development' || (!p.accountId && p.scope === 'in_house')
    const account = byId.get(p.accountId)
    const accountName = isInternal ? IN_HOUSE_LABEL : (account?.name || '(no account)')
    return {
      ...p,
      isInternal,
      ownerOrganization: isInternal ? 'farrington-development' : (p.ownerOrganization || null),
      clientId: p.clientId || p.accountId || (isInternal ? IN_HOUSE_ACCOUNT_ID : null),
      accountName,
      clientName: p.clientName || accountName,
    }
  })
}

function normalizeProject(project = {}, body = {}) {
  const accountId = project.accountId || project.clientId || body.accountId || body.clientId
  const isInternal = project.isInternal || project.ownerOrganization === 'farrington-development' || accountId === IN_HOUSE_ACCOUNT_ID || body.scope === 'in_house'
  const { clientId, clientName, accountName, ...rest } = project
  if (isInternal) {
    return {
      ...rest,
      accountId: null,
      isInternal: true,
      ownerOrganization: 'farrington-development',
      scope: 'in_house',
    }
  }
  if (!accountId && project.accountId !== null && !('isInternal' in project) && !project.ownerOrganization && !body.scope) {
    return rest
  }
  return {
    ...rest,
    ...(accountId ? { accountId } : {}),
    isInternal: false,
    ownerOrganization: rest.ownerOrganization || null,
    scope: null,
  }
}

function accountExists(accountId) {
  return !!findById('accounts', accountId)
}

function safeWorkspacePath(project) {
  const root = process.platform === 'win32' ? 'C:\\dev' : '/home/carl/dev'
  const raw = process.platform === 'win32'
    ? (project.windowsPath || project.localPath)
    : (project.ubuntuPath || project.repositoryPath)
  if (!raw) return null
  const resolved = path.resolve(raw)
  const rootResolved = path.resolve(root)
  const folder = path.basename(resolved)
  if (PROTECTED_FOLDERS.has(folder) || resolved === rootResolved || !resolved.startsWith(rootResolved + path.sep)) {
    throw new Error('Project workspace path is protected or outside the approved dev root')
  }
  return resolved
}

function parseGiteaRepo(project) {
  const raw = project.giteaRepo || project.repoName || project.repositoryUrl || project.giteaSshUrl || ''
  const match = String(raw).match(/(?:^|[:/])([^/:]+)\/([A-Za-z0-9._-]+?)(?:\.git)?$/)
  if (!match) return null
  const owner = match[1]
  const repo = match[2]
  if (!/^[A-Za-z0-9._-]+$/.test(owner) || !/^[A-Za-z0-9._-]+$/.test(repo)) return null
  if (PROTECTED_FOLDERS.has(repo)) throw new Error('Project repository is protected')
  return { owner, repo }
}

async function deleteGiteaRepo(project) {
  const repo = parseGiteaRepo(project)
  if (!repo) return { skipped: true, reason: 'no gitea repo' }
  const header = await readFile(GITEA_AUTH_HEADER, 'utf8')
  const [name, ...valueParts] = header.trim().split(':')
  const res = await fetch(`${GITEA_API}/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.repo)}`, {
    method: 'DELETE',
    headers: { [name.trim()]: valueParts.join(':').trim() },
  })
  if (res.status === 404) return { skipped: true, reason: 'gitea repo not found' }
  if (!res.ok) throw new Error(`Gitea repo delete failed with status ${res.status}`)
  return { deleted: `${repo.owner}/${repo.repo}` }
}

async function deleteWorkspace(project) {
  const workspace = safeWorkspacePath(project)
  if (!workspace) return { skipped: true, reason: 'no workspace path' }
  if (!fs.existsSync(workspace)) return { skipped: true, reason: 'workspace not found', path: workspace }
  await rm(workspace, { recursive: true, force: true })
  return { deleted: workspace }
}

export async function GET(request) {
  const { error } = await requireCrmRead(request)
  if (error) return error
  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (id) {
    const rec = findById('projects', id)
    if (!rec) return NextResponse.json({ error: 'not found' }, { status: 404 })
    return NextResponse.json({ project: enrich([rec])[0] })
  }
  const accountId = searchParams.get('accountId') || searchParams.get('clientId')
  const scope = searchParams.get('scope')
  const status = searchParams.get('status')
  const priority = searchParams.get('priority')
  const q = (searchParams.get('q') || '').trim().toLowerCase()
  const tag = searchParams.get('tag')
  let list = enrich(loadAll('projects'))
  if (scope === 'in_house') list = list.filter(p => p.isInternal)
  if (scope === 'account') list = list.filter(p => !p.isInternal)
  if (accountId === IN_HOUSE_ACCOUNT_ID) list = list.filter(p => p.isInternal)
  else if (accountId) list = list.filter(p => p.accountId === accountId || p.clientId === accountId)
  if (status) list = list.filter(p => p.status === status)
  if (priority) list = list.filter(p => p.priority === priority)
  if (tag) list = list.filter(p => (p.tags || []).includes(tag))
  if (q) {
    list = list.filter(p => (
      (p.name || '').toLowerCase().includes(q) ||
      (p.accountName || '').toLowerCase().includes(q) ||
      (p.description || '').toLowerCase().includes(q) ||
      (p.tags || []).some(t => String(t).toLowerCase().includes(q))
    ))
  }
  return NextResponse.json({ projects: list })
}

export async function POST(request) {
  const { error } = await requireCrmWrite(request)
  if (error) return error
  const body = await request.json()

  if (body.action === 'add') {
    const project = normalizeProject(body.project, body)
    if (!project.isInternal && !project.accountId) return NextResponse.json({ error: 'accountId or Farrington Development owner required' }, { status: 400 })
    if (project.accountId && !accountExists(project.accountId)) return NextResponse.json({ error: 'account not found' }, { status: 404 })
    const rec = create('projects', {
      name: '',
      description: '',
      status: 'active',
      priority: 'medium',
      progress: 0,
      budget: '',
      rate: '',
      estimatedHours: '',
      actualHours: 0,
      startDate: null,
      dueDate: null,
      tags: [],
      opportunityId: null,
      ...project,
    })
    logActivity({ type: 'note', subject: `Project created: ${rec.name}`, linkedTo: { projectId: rec.id, accountId: rec.accountId || null, ownerOrganization: rec.ownerOrganization || null } })
    return NextResponse.json({ ok: true, project: enrich([rec])[0] })
  }

  if (body.action === 'update') {
    const patch = normalizeProject(body.project, body)
    const id = patch.id
    if (!id) return NextResponse.json({ error: 'project id required' }, { status: 400 })
    const prev = findById('projects', id)
    if (!prev) return NextResponse.json({ error: 'not found' }, { status: 404 })
    if (!patch.isInternal && patch.accountId && !accountExists(patch.accountId)) return NextResponse.json({ error: 'account not found' }, { status: 404 })
    const rec = update('projects', id, patch)
    if (!rec) return NextResponse.json({ error: 'not found' }, { status: 404 })
    const statusChanged = patch.status && patch.status !== prev.status
    logActivity({
      type: statusChanged ? 'status_change' : 'note',
      subject: statusChanged ? `Project status changed: ${prev.status || 'none'} to ${rec.status}` : `Project updated: ${rec.name}`,
      linkedTo: { projectId: rec.id, accountId: rec.accountId || null, ownerOrganization: rec.ownerOrganization || null },
    })
    // Project crossed the finish line? Client gets the thank-you + Google
    // review email, exactly once. Never throws; outcome is in the response.
    const completionEmail = await maybeSendProjectCompletionEmail({ prev, rec })
    return NextResponse.json({ ok: true, project: enrich([rec])[0], completionEmail })
  }

  if (body.action === 'delete') {
    const rec = findById('projects', body.id)
    if (!rec) return NextResponse.json({ error: 'not found' }, { status: 404 })
    const deleteMode = body.deleteMode || 'record_only'
    const results = { workspace: null, gitea: null }

    if (deleteMode === 'server_and_gitea') {
      if (body.confirmText !== `DELETE ${rec.name}`) {
        return NextResponse.json({ error: 'confirmation text mismatch' }, { status: 400 })
      }
      try {
        safeWorkspacePath(rec)
        parseGiteaRepo(rec)
        results.workspace = await deleteWorkspace(rec)
        results.gitea = await deleteGiteaRepo(rec)
      } catch (err) {
        return NextResponse.json({ error: err.message || 'delete everywhere failed', results }, { status: 500 })
      }
    } else if (deleteMode !== 'record_only') {
      return NextResponse.json({ error: 'unknown delete mode' }, { status: 400 })
    }

    const ok = remove('projects', body.id)
    if (!ok) return NextResponse.json({ error: 'not found' }, { status: 404 })
    logActivity({
      type: 'note',
      subject: deleteMode === 'server_and_gitea' ? `Project deleted everywhere: ${rec.name}` : `Project deleted: ${rec.name}`,
      linkedTo: { projectId: rec.id, accountId: rec.accountId || null, ownerOrganization: rec.ownerOrganization || null },
      meta: { deleteMode, results },
    })
    return NextResponse.json({ ok: true, deleteMode, results })
  }

  if (body.action === 'bulk_delete') {
    const ids = Array.isArray(body.ids) ? body.ids.map(String).filter(Boolean) : []
    if (!ids.length) return NextResponse.json({ error: 'no projects selected' }, { status: 400 })
    const existing = loadAll('projects').filter(p => ids.includes(p.id))
    removeMany('projects', ids)
    existing.forEach(rec => logActivity({
      type: 'note',
      subject: `Project deleted: ${rec.name}`,
      linkedTo: { projectId: rec.id, accountId: rec.accountId || null, ownerOrganization: rec.ownerOrganization || null },
      meta: { deleteMode: 'record_only', bulk: true },
    }))
    return NextResponse.json({ ok: true, deleted: existing.length, deleteMode: 'record_only' })
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 })
}
