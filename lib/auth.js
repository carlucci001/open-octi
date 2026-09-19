// Node-runtime auth helpers for API routes.
// Cookie HMAC + verify is delegated to lib/authEdge.js so the same code paths
// run in middleware (Edge runtime) and routes (Node runtime).
import bcrypt from 'bcryptjs'
import { NextResponse } from 'next/server'
import { readData, mutateData } from './dataStore'
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

// ---------- User store (backed by users.json via dataStore, transactional writes) ----------

function parseCreatedAtMs(u) {
  const t = Date.parse(u && u.createdAt || '')
  return Number.isFinite(t) ? t : Infinity
}

// Picks exactly one user to promote to owner when the store has users but no
// owner. Precedence: FCC_OWNER_USERNAME env match, else earliest-created
// non-suspended admin, else earliest-created user.
function pickOwnerCandidate(users) {
  const envUsername = (process.env.FCC_OWNER_USERNAME || '').trim().toLowerCase()
  if (envUsername) {
    const match = users.find(u => (u.username || '').toLowerCase() === envUsername)
    if (match) return match
  }
  const admins = users.filter(u => normalizeRoleValue(u.role) === 'admin' && !u.suspended)
  if (admins.length) return admins.slice().sort((a, b) => parseCreatedAtMs(a) - parseCreatedAtMs(b))[0]
  return users.slice().sort((a, b) => parseCreatedAtMs(a) - parseCreatedAtMs(b))[0]
}

// One-time, idempotent self-heal: if the store has users but none carries
// role 'owner' (e.g. after the hard-coded "carl is owner" rule was removed),
// promote exactly one. Fast path is a plain read with no write when an owner
// already exists (or the store is empty), so this never writes on every
// read — only mutateData's own transaction re-checks and writes when needed.
function ensureOwnerAssigned() {
  const seen = readData('users.json')
  const seenUsers = (seen && seen.users) || []
  if (seenUsers.length === 0) return seenUsers
  if (seenUsers.some(u => normalizeRoleValue(u.role) === 'owner')) return seenUsers
  return mutateData('users.json', (data) => {
    const users = (data && data.users) || []
    if (users.length === 0 || users.some(u => normalizeRoleValue(u.role) === 'owner')) {
      return { data: data || { users }, result: users }
    }
    const promoted = pickOwnerCandidate(users)
    const now = new Date().toISOString()
    const next = users.map(u => (u.id === promoted.id ? { ...u, role: 'owner', updatedAt: now } : u))
    return { data: { ...(data || {}), lastUpdated: now, users: next }, result: next }
  })
}

function loadUsers() {
  return ensureOwnerAssigned()
}

export function listUsers() {
  return loadUsers().map(publicUser)
}

// The current owner (role === 'owner'), if any. Runs the self-heal above.
export function getOwnerUser() {
  return loadUsers().find(u => normalizeRoleValue(u.role) === 'owner') || null
}

// Runtime identity to use anywhere code previously hard-coded "carl": the
// stored owner's username, falling back to FCC_OWNER_USERNAME, then 'admin'.
export function getOwnerUsername() {
  return getOwnerUser()?.username || (process.env.FCC_OWNER_USERNAME || '').trim() || 'admin'
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
  // Hashing is async and must finish before the (synchronous) mutator runs.
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
  const created = mutateData('users.json', (data) => {
    const list = (data && data.users) || []
    // Duplicate-username check must happen inside the transaction against
    // the current on-disk state, not the (possibly stale) state read earlier.
    if (list.some(u => (u.username || '').toLowerCase() === username.toLowerCase())) {
      throw new Error('username already exists')
    }
    const next = [...list, rec]
    return { data: { ...(data || {}), lastUpdated: now, users: next }, result: rec }
  })
  return publicUser(created)
}

// Force-logout: invalidate every active session for a user by bumping their tokenVersion.
// Their existing cookies stop verifying on the next request.
export function bootUser(id) {
  const now = new Date().toISOString()
  return mutateData('users.json', (data) => {
    const list = (data && data.users) || []
    const i = list.findIndex(u => u.id === id)
    if (i === -1) return { data: data || { users: list }, result: false }
    const next = list.slice()
    next[i] = { ...next[i], tokenVersion: (next[i].tokenVersion || 1) + 1, updatedAt: now }
    return { data: { ...(data || {}), lastUpdated: now, users: next }, result: true }
  })
}

export async function updateUser(id, patch) {
  // Hashing is async and must finish before the (synchronous) mutator runs.
  const newPasswordHash = patch.password ? await bcrypt.hash(patch.password, 10) : undefined
  const now = new Date().toISOString()
  const updated = mutateData('users.json', (data) => {
    const list = (data && data.users) || []
    const i = list.findIndex(u => u.id === id)
    if (i === -1) return { data: data || { users: list }, result: null }
    const u = { ...list[i] }
    // Owner-protection rules must be checked against the current transactional
    // state, not a snapshot read before the write.
    if (isOwner(u)) {
      if (patch.username !== undefined && patch.username !== u.username) throw new Error('owner username cannot be changed')
      if (patch.role !== undefined && patch.role !== 'owner') throw new Error('owner role cannot be changed')
      if (patch.suspended === true) throw new Error('owner cannot be suspended')
    }
    if (newPasswordHash !== undefined) u.passwordHash = newPasswordHash
    for (const k of ['username', 'displayName', 'email', 'role', 'location', 'suspended']) {
      if (patch[k] !== undefined) u[k] = k === 'role' ? normalizeRoleValue(patch[k]) : patch[k]
    }
    // Suspending a user must also invalidate their active sessions immediately.
    if (patch.suspended === true) u.tokenVersion = (u.tokenVersion || 1) + 1
    u.updatedAt = now
    const next = list.slice()
    next[i] = u
    return { data: { ...(data || {}), lastUpdated: now, users: next }, result: u }
  })
  return updated ? publicUser(updated) : null
}

export async function updateCurrentUserProfile(id, patch = {}) {
  // Password verification needs the CURRENT stored hash and is async, so it
  // happens against a snapshot read before the transactional write below.
  // The write itself re-checks the user still exists inside the mutator.
  let newPasswordHash
  if (patch.newPassword) {
    if (!patch.currentPassword) throw new Error('current password required')
    const currentRecord = loadUsers().find(u => u.id === id)
    if (!currentRecord) return null
    const ok = await bcrypt.compare(patch.currentPassword, currentRecord.passwordHash || '')
    if (!ok) throw new Error('current password is incorrect')
    if (String(patch.newPassword).length < 6) throw new Error('password must be at least 6 chars')
    newPasswordHash = await bcrypt.hash(patch.newPassword, 10)
  }

  const now = new Date().toISOString()
  const updated = mutateData('users.json', (data) => {
    const list = (data && data.users) || []
    const i = list.findIndex(u => u.id === id)
    if (i === -1) return { data: data || { users: list }, result: null }
    const u = { ...list[i] }

    if (newPasswordHash !== undefined) u.passwordHash = newPasswordHash

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

    u.updatedAt = now
    const next = list.slice()
    next[i] = u
    return { data: { ...(data || {}), lastUpdated: now, users: next }, result: u }
  })
  return updated ? publicUser(updated) : null
}

export function deleteUser(id) {
  const now = new Date().toISOString()
  return mutateData('users.json', (data) => {
    const list = (data && data.users) || []
    const target = list.find(u => u.id === id)
    if (target && isOwner(target)) throw new Error('owner cannot be deleted')
    const next = list.filter(u => u.id !== id)
    const removed = next.length !== list.length
    return { data: { ...(data || {}), lastUpdated: now, users: next }, result: removed }
  })
}

// Bump the user's lastSeenAt — called from auth/me. Used for presence ("online now").
export function touchUser(id) {
  if (!id) return
  mutateData('users.json', (data) => {
    const list = (data && data.users) || []
    const i = list.findIndex(u => u.id === id)
    if (i === -1) return { data: data || { users: list }, result: null }
    const next = list.slice()
    next[i] = { ...next[i], lastSeenAt: new Date().toISOString() }
    return { data: { ...(data || {}), users: next }, result: null }
  })
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
  const now = new Date().toISOString()
  mutateData('users.json', (data) => {
    const list = (data && data.users) || []
    const i = list.findIndex(x => x.id === u.id)
    if (i === -1) return { data: data || { users: list }, result: null }
    const next = list.slice()
    next[i] = { ...next[i], lastLoginAt: now }
    return { data: { ...(data || {}), users: next }, result: null }
  })
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
  // FCC edition ships as Office/Team packages to other customers, so the
  // seeded first owner must not default to Carl's personal identity. An
  // installer/operator sets FCC_OWNER_USERNAME; the prod deploy gate sets it
  // (or confirms users.json already has carl as owner) before any FCC deploy.
  const ownerUsername = (process.env.FCC_OWNER_USERNAME || '').trim() || 'admin'
  return createUser({
    username: openOcti ? 'admin' : ownerUsername,
    password,
    displayName: openOcti ? 'OpenOcti Admin' : ownerUsername,
    role: 'owner',
    location: 'local',
    email: '',
  })
}
