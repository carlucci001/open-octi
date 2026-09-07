import bcrypt from 'bcryptjs'
import { randomUUID } from 'node:crypto'
import { readData, mutateData } from './dataStore'
import { isOpenOcti } from './edition'
import { publicUser } from './roles'

export function needsFirstRunAccount() {
  return isOpenOcti() && !process.env.INITIAL_ADMIN_PASSWORD && !(readData('users.json')?.users?.length)
}

export function isLocalSetupRequest(request, requireOrigin = false) {
  try {
    const host = request.headers.get('host') || new URL(request.url).host
    const url = new URL(`http://${host}`)
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return false
    const origin = request.headers.get('origin')
    if (requireOrigin && !origin) return false
    return !origin || new URL(origin).host === host
  } catch { return false }
}

export async function createFirstRunAccount({ username, password, displayName }) {
  if (!needsFirstRunAccount()) throw Object.assign(new Error('Account setup is already complete or managed by the installer.'), { status: 409 })
  if (typeof username !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_.@-]{2,63}$/.test(username)) {
    throw Object.assign(new Error('Choose a username of 3–64 letters, numbers, dots, dashes, or underscores.'), { status: 400 })
  }
  if (typeof password !== 'string' || password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) {
    throw Object.assign(new Error('Use a password of at least 12 characters and no more than 72 bytes.'), { status: 400 })
  }
  const passwordHash = await bcrypt.hash(password, 10)
  const now = new Date().toISOString()
  const user = {
    id: `usr_${randomUUID()}`, username, passwordHash,
    displayName: typeof displayName === 'string' ? displayName.trim().slice(0,80) || username : username,
    email: '', role: 'owner', location: 'local', suspended: false, tokenVersion: 1,
    createdAt: now, updatedAt: now, lastLoginAt: now,
  }
  // Check and insert in one SQLite transaction, including after password hashing.
  return mutateData('users.json', current => {
    if (current?.users?.length) throw Object.assign(new Error('Account setup is already complete. Sign in with your account.'), { status: 409 })
    return { data: { lastUpdated: now, users: [user] }, result: publicUser(user) }
  })
}
