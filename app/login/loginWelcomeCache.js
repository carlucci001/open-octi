const CACHE_NAME = 'fcc-login-welcome-audio-v1'
const CACHE_ENTRY_LIMIT = 12
const CACHE_READ_TIMEOUT_MS = 120

function usableAudio(blob) {
  return blob?.size > 0 && /^audio\//i.test(blob.type || '')
}

async function cacheRequest({ user, fallbackUsername, provider, model, voiceName, agentId, text }) {
  if (!globalThis.caches || !globalThis.crypto?.subtle || typeof TextEncoder === 'undefined') return null
  // Hash the complete identity: cache URLs must not expose names or greeting text.
  const identity = JSON.stringify([
    user?.id || '', user?.username || fallbackUsername || '',
    provider, model, voiceName, agentId, text,
  ])
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity))
  const key = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
  return new Request(new URL(`/api/voice/login-welcome-cache/${key}`, window.location.origin))
}

export async function readLoginWelcomeAudio(identity) {
  let timer
  try {
    return await Promise.race([
      (async () => {
        const request = await cacheRequest(identity)
        if (!request) return null
        const cache = await globalThis.caches.open(CACHE_NAME)
        const response = await cache.match(request)
        if (!response?.ok) return null
        const blob = await response.blob()
        return usableAudio(blob) ? blob : null
      })(),
      new Promise(resolve => { timer = setTimeout(() => resolve(null), CACHE_READ_TIMEOUT_MS) }),
    ])
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export async function cacheLoginWelcomeAudio(identity, blob) {
  if (!usableAudio(blob)) return
  try {
    const request = await cacheRequest(identity)
    if (!request) return
    const cache = await globalThis.caches.open(CACHE_NAME)
    await cache.put(request, new Response(blob, { headers: { 'Content-Type': blob.type } }))
    const keys = await cache.keys()
    await Promise.all(keys.slice(0, Math.max(0, keys.length - CACHE_ENTRY_LIMIT)).map(key => cache.delete(key)))
  } catch {
    // Storage privacy settings, quota and browser failures must not block login audio.
  }
}
