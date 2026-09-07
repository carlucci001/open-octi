import { createHash } from 'crypto'

// Immutable app user IDs keep repository ownership stable when display names change.
export function giteaIdentity(user) {
  if (!user?.id) throw new Error('A signed-in account is required for Repository.')
  const name = `octi-${createHash('sha256').update(String(user.id)).digest('hex').slice(0, 24)}`
  return { name, fullName: String(user.displayName || user.username || 'OpenOcti user').replace(/[\r\n]/g, ' ') }
}
