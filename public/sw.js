// Minimal service worker: installability without stale API/login responses.
const FCC_SW_VERSION = '2026-09-04-operator-agent'

async function clearOldCaches() {
  if (!self.caches) return
  const keys = await self.caches.keys()
  await Promise.all(keys.map(key => self.caches.delete(key)))
}

self.addEventListener('install', (event) => {
  event.waitUntil(clearOldCaches().then(() => self.skipWaiting()))
})
self.addEventListener('activate', (event) => event.waitUntil(
  clearOldCaches()
    .then(() => self.clients.claim())
    .then(() => self.clients.matchAll({ type: 'window' }))
    .then((clients) => {
      clients.forEach((client) => {
        if (client.url && client.navigate) client.navigate(client.url)
      })
    })
))
self.addEventListener('message', (event) => {
  if (event.data?.type === 'FCC_CLEAR_RUNTIME_CACHES') {
    event.waitUntil(clearOldCaches())
  }
})
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request))
  }
})
