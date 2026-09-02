// Avatars are stored inline in users.json as base64 data URLs. A 512px PNG is
// ~600KB, and shipping that in every /api/users and /api/auth/me response was
// enough on its own to blow the browser's 5MB localStorage budget.
//
// So: never send the data URL in a JSON payload. Send a reference to
// /api/users/avatar instead — the browser fetches the bytes once and caches
// them immutably. Every existing <img src={user.avatarUrl}> keeps working
// unchanged, because the reference is still just a URL.

export const AVATAR_ROUTE = '/api/users/avatar'

export function isStoredAvatar(value) {
  return String(value || '').startsWith('data:')
}

export function isAvatarRef(value) {
  return String(value || '').startsWith(AVATAR_ROUTE)
}

// Data URL → route reference. Anything else (an external https URL, empty)
// passes through untouched.
export function avatarRef(user) {
  const raw = user?.avatarUrl || ''
  if (!isStoredAvatar(raw)) return raw
  const version = String(user?.updatedAt || '').replace(/[^0-9]/g, '').slice(0, 14)
  return `${AVATAR_ROUTE}?id=${encodeURIComponent(user.id)}${version ? `&v=${version}` : ''}`
}

// Splits "data:image/png;base64,AAAA" into { contentType, buffer }.
export function decodeDataUrl(value) {
  const match = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(String(value || ''))
  if (!match) return null
  const [, contentType, isBase64, payload] = match
  try {
    const buffer = isBase64
      ? Buffer.from(payload, 'base64')
      : Buffer.from(decodeURIComponent(payload), 'utf-8')
    return { contentType: contentType || 'application/octet-stream', buffer }
  } catch {
    return null
  }
}
