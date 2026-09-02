// Module-scoped, stale-while-revalidate cache for client-side fetches.
// Persists last-known data to localStorage so navigating between menu items —
// or even a hard refresh — paints instantly with cached data while a quiet
// background refetch updates anything that changed.
//
// API:
//   cache.snapshot(url)              → { data, fetchedAt, refreshing, error }
//   cache.subscribe(url, fn)         → unsubscribe()
//   cache.refresh(url, opts?)        → starts a fetch, returns a promise
//   cache.invalidate(url)            → drops entry; next snapshot triggers refresh
//   cache.invalidateAll()            → e.g. after switching demo/real mode
//
// Use via the useCachedData() hook in lib/useCachedData.js.

const STORAGE_KEY = 'fcc:dataCache:v1'
const PERSIST_DEBOUNCE_MS = 250
const FRESHNESS_MS = 0   // 0 = always refetch in background; tune per call site

// localStorage is ~5MB per origin, shared with every other fcc:* key. This cache
// is disposable — everything in it can be refetched — so it must never be the
// reason an unrelated write (theme, active tab, draft) throws QuotaExceededError.
// Chars, not bytes: localStorage stores UTF-16, so ~2 bytes per char.
const MAX_ENTRY_CHARS = 120_000    // ~240KB — one huge response can't crowd out the rest
const MAX_TOTAL_CHARS = 750_000    // ~1.5MB total budget for the whole cache

const store = new Map()      // url → { data, fetchedAt, refreshing, error }
const subscribers = new Map() // url → Set<fn>
const inflight = new Map()    // url → Promise (dedupe concurrent fetches)

let persistTimer = null
function schedulePersist() {
  if (typeof window === 'undefined') return
  if (persistTimer) return
  persistTimer = setTimeout(() => {
    persistTimer = null
    try {
      // Only persist data + fetchedAt — never persist transient flags.
      // Newest-first, skipping oversized responses, until the budget is spent.
      const candidates = []
      for (const [url, entry] of store.entries()) {
        if (entry.data == null) continue
        let chars
        try { chars = JSON.stringify(entry.data).length } catch { continue }
        if (chars > MAX_ENTRY_CHARS) continue
        candidates.push({ url, chars, fetchedAt: entry.fetchedAt || 0, data: entry.data })
      }
      candidates.sort((a, b) => b.fetchedAt - a.fetchedAt)

      const out = {}
      let total = 0
      let dropped = 0
      for (const c of candidates) {
        if (total + c.chars > MAX_TOTAL_CHARS) { dropped++; continue }
        total += c.chars
        out[c.url] = { data: c.data, fetchedAt: c.fetchedAt }
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(out))
      if (dropped) console.debug(`[dataCache] persisted ${Object.keys(out).length} entries; dropped ${dropped} over budget`)
    } catch {}
  }, PERSIST_DEBOUNCE_MS)
}

// Hydrate from localStorage on first import in the browser.
if (typeof window !== 'undefined') {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      for (const [url, entry] of Object.entries(parsed || {})) {
        if (entry && typeof entry === 'object') {
          store.set(url, { ...entry, refreshing: false, error: null })
        }
      }
    }
  } catch {}
}

function notify(url) {
  const subs = subscribers.get(url)
  if (!subs) return
  for (const fn of subs) {
    try { fn() } catch (e) { console.error('[dataCache] subscriber error', e) }
  }
}

function setEntry(url, patch) {
  const cur = store.get(url) || { data: null, fetchedAt: 0, refreshing: false, error: null }
  const next = { ...cur, ...patch }
  store.set(url, next)
  notify(url)
  if ('data' in patch || 'fetchedAt' in patch) schedulePersist()
}

export const cache = {
  snapshot(url) {
    return store.get(url) || { data: null, fetchedAt: 0, refreshing: false, error: null }
  },

  subscribe(url, fn) {
    let subs = subscribers.get(url)
    if (!subs) { subs = new Set(); subscribers.set(url, subs) }
    subs.add(fn)
    return () => {
      subs.delete(fn)
      if (subs.size === 0) subscribers.delete(url)
    }
  },

  async refresh(url, { force = false } = {}) {
    if (typeof window === 'undefined') return
    const existing = store.get(url)
    if (!force && existing && Date.now() - (existing.fetchedAt || 0) < FRESHNESS_MS) return existing.data
    if (inflight.has(url)) return inflight.get(url)

    setEntry(url, { refreshing: true, error: null })
    const p = (async () => {
      try {
        const r = await fetch(url, { cache: 'no-store' })
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const data = await r.json()
        setEntry(url, { data, fetchedAt: Date.now(), refreshing: false, error: null })
        return data
      } catch (e) {
        setEntry(url, { refreshing: false, error: e.message || String(e) })
        throw e
      } finally {
        inflight.delete(url)
      }
    })()
    inflight.set(url, p)
    return p
  },

  invalidate(url) {
    store.delete(url)
    schedulePersist()
    notify(url)
  },

  invalidateAll() {
    const urls = Array.from(store.keys())
    store.clear()
    schedulePersist()
    for (const url of urls) notify(url)
  },
}
