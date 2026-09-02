// Node-runtime auth helpers for API routes.
// Cookie HMAC + verify is delegated to lib/authEdge.js so the same code paths
// run in middleware (Edge runtime) and routes (Node runtime).
import bcrypt from 'bcryptjs'
import { NextResponse } from 'next/server'
import { readData, writeData } from './dataStore'
import { isOpenOcti } from './edition'
import { logAuditEvent } from './auditLog'
import {
  signSession, verifySession,
  buildSessionCookie, clearSessionCookie,
  SESSION_COOKIE, SESSION_TTL_MS,
} from './authEdge'
import { isAdminLike, isOwner, normalizeRoleValue, publicUser } from './roles'
import { isAvatarRef } from './avatars'

export { signSession, verifySession, buildSessionCookie, clearSessionCookie, SESSION_COOKIE, SESSION_TTL_MS }

// ---------- User store (backed by users.json via dataStore) ----------

function loadUsers() {
  const data = readData('users.json') || { users: [] }
  return data.users || []
}
function saveUsers(list) {
  writeData('users.json', { lastUpdated: new Date().toISOString(), users: list })
}

export function listUsers() {
  return loadUsers().map(publicUser)
}

export function findUserById(id) {
  return loadUsers().find(u => u.id === id) || null
}

export function findUserByUsername(username) {
  if (!username) return null
  const norm = username.trim().toLowerCase()
  return loadUsers().find(u => (u.username || '').toLowerCase() === norm) || null
}

export async function createUser({ username, password, displayName, role = 'member', location = 'public', email }) {
  const list = loadUsers()
  if (list.some(u => (u.username || '').toLowerCase() === username.toLowerCase())) {
    throw new Error('username already exists')
  }
  const passwordHash = await bcrypt.hash(password, 10)
  const now = new Date().toISOString()
  const id = 'usr_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  const rec = {
    id, username, displayName: displayName || username, email: email || '',
    role: normalizeRoleValue(role), location, passwordHash,
    suspended: false,
    tokenVersion: 1,  // bumped by bootUser to invalidate every cookie that user owns
    createdAt: now, updatedAt: now, lastLoginAt: null,
  }
  list.push(rec)
  saveUsers(list)
  return publicUser(rec)
}

// Force-logout: invalidate every active session for a user by bumping their tokenVersion.
// Their existing cookies stop verifying on the next request.
export function bootUser(id) {
  const list = loadUsers()
  const i = list.findIndex(u => u.id === id)
  if (i === -1) return false
  list[i].tokenVersion = (list[i].tokenVersion || 1) + 1
  list[i].updatedAt = new Date().toISOString()
  saveUsers(list)
  return true
}

export async function updateUser(id, patch) {
  const list = loadUsers()
  const i = list.findIndex(u => u.id === id)
  if (i === -1) return null
  const u = list[i]
  if (isOwner(u)) {
    if (patch.username !== undefined && patch.username !== u.username) throw new Error('owner username cannot be changed')
    if (patch.role !== undefined && patch.role !== 'owner') throw new Error('owner role cannot be changed')
    if (patch.suspended === true) throw new Error('owner cannot be suspended')
  }
  if (patch.password) {
    u.passwordHash = await bcrypt.hash(patch.password, 10)
  }
  for (const k of ['username', 'displayName', 'email', 'role', 'location', 'suspended']) {
    if (patch[k] !== undefined) u[k] = k === 'role' ? normalizeRoleValue(patch[k]) : patch[k]
  }
  // Suspending a user must also invalidate their active sessions immediately.
  if (patch.suspended === true) u.tokenVersion = (u.tokenVersion || 1) + 1
  u.updatedAt = new Date().toISOString()
  list[i] = u
  saveUsers(list)
  return publicUser(u)
}

export async function updateCurrentUserProfile(id, patch = {}) {
  const list = loadUsers()
  const i = list.findIndex(u => u.id === id)
  if (i === -1) return null
  const u = list[i]

  if (patch.newPassword) {
    if (!patch.currentPassword) throw new Error('current password required')
    const ok = await bcrypt.compare(patch.currentPassword, u.passwordHash || '')
    if (!ok) throw new Error('current password is incorrect')
    if (String(patch.newPassword).length < 6) throw new Error('password must be at least 6 chars')
    u.passwordHash = await bcrypt.hash(patch.newPassword, 10)
  }

  for (const k of ['displayName', 'email', 'avatarUrl']) {
    if (patch[k] === undefined) continue
    if (k === 'avatarUrl') {
      // The client was handed a /api/users/avatar reference, not the stored data
      // URL. Echoing it back means "unchanged" — never overwrite the real image
      // with a pointer to itself.
      if (isAvatarRef(patch[k])) continue
      u.avatarUrl = String(patch[k] || '')
      continue
    }
    u[k] = String(patch[k] || '').slice(0, 240)
  }

  u.updatedAt = new Date().toISOString()
  list[i] = u
  saveUsers(list)
  return publicUser(u)
}

export function deleteUser(id) {
  const list = loadUsers()
  const target = list.find(u => u.id === id)
  if (target && isOwner(target)) throw new Error('owner cannot be deleted')
  const next = list.filter(u => u.id !== id)
  if (next.length === list.length) return false
  saveUsers(next)
  return true
}

// Bump the user's lastSeenAt — called from auth/me. Used for presence ("online now").
export function touchUser(id) {
  if (!id) return
  const list = loadUsers()
  const i = list.findIndex(u => u.id === id)
  if (i === -1) return
  list[i].lastSeenAt = new Date().toISOString()
  saveUsers(list)
}

export async function verifyPassword(username, password) {
  let u = findUserByUsername(username)
  // Also accept email in the username field so people don't get locked out
  // typing their email by habit.
  if (!u && typeof username === 'string' && username.includes('@')) {
    const norm = username.trim().toLowerCase()
    u = loadUsers().find(x => (x.email || '').toLowerCase() === norm) || null
  }
  if (!u) return null
  if (u.suspended) return { suspendedReject: true }
  const ok = await bcrypt.compare(password, u.passwordHash || '')
  if (!ok) return null
  const list = loadUsers()
  const i = list.findIndex(x => x.id === u.id)
  if (i >= 0) { list[i].lastLoginAt = new Date().toISOString(); saveUsers(list) }
  return publicUser(u)
}

// Returns { user, error }. If error is non-null, return it from the route handler:
//   const { user, error } = await requireAdmin(request); if (error) return error
export async function requireAdmin(request) {
  const u = await getCurrentUser(request)
  if (!u) return { user: null, error: NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 }) }
  if (!isAdminLike(u)) return { user: null, error: NextResponse.json({ ok: false, error: 'admin only' }, { status: 403 }) }
  return { user: u, error: null }
}

export async function requireOwner(request) {
  const u = await getCurrentUser(request)
  if (!u) {
    try {
      logAuditEvent({
        request,
        user: null,
        action: 'owner_gate_denied_unauthenticated',
        area: 'security',
        severity: 'warn',
        targetName: new URL(request.url).pathname,
      })
    } catch {}
    return { user: null, error: NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 }) }
  }
  if (!isOwner(u)) {
    try {
      logAuditEvent({
        request,
        user: u,
        action: 'owner_gate_denied',
        area: 'security',
        severity: 'warn',
        targetName: new URL(request.url).pathname,
      })
    } catch {}
    return { user: u, error: NextResponse.json({ ok: false, error: 'owner only' }, { status: 403 }) }
  }
  return { user: u, error: null }
}

export async function getCurrentUser(request) {
  const cookie = request.headers.get('cookie') || ''
  const m = cookie.match(new RegExp('(?:^|; )' + SESSION_COOKIE + '=([^;]+)'))
  if (!m) return null
  const session = await verifySession(decodeURIComponent(m[1]))
  if (!session) return null
  const u = findUserById(session.uid)
  if (!u) return null
  if (u.suspended) return null
  // Boot/suspend invalidates by bumping tokenVersion. Reject any cookie whose
  // ver doesn't match the user's current tokenVersion. Legacy cookies (no ver
  // claim) are treated as ver=1, so the FIRST boot still invalidates them.
  const userVer = u.tokenVersion || 1
  const sessionVer = session.ver !== undefined ? session.ver : 1
  if (sessionVer !== userVer) return null
  return publicUser(u)
}

export async function seedInitialAdminIfEmpty() {
  const list = loadUsers()
  if (list.length > 0) return null
  const password = process.env.INITIAL_ADMIN_PASSWORD
  if (!password) {
    throw new Error('INITIAL_ADMIN_PASSWORD must be set before seeding the first admin user')
  }
  const openOcti = isOpenOcti()
  return createUser({
    username: openOcti ? 'admin' : 'carl',
    password,
    displayName: openOcti ? 'OpenOcti Admin' : 'Carl Farrington',
    role: 'owner',
    location: 'local',
    email: openOcti ? '' : 'redacted@example.invalid',
  })
}
