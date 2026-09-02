'use client'
import { useEffect, useState, useCallback } from 'react'
import { cache } from './dataCache'

// Returns { data, refreshing, error, fetchedAt, refresh, invalidate } for a URL.
// On mount, paints whatever was cached previously (instant), then quietly refetches.
// `extract` lets call sites pull a sub-key out of the response without rewriting the cache,
// e.g. useCachedData('/api/leads', { extract: j => j.leads }).
export function useCachedData(url, { extract } = {}) {
  const [snap, setSnap] = useState(() => cache.snapshot(url))

  useEffect(() => {
    const onChange = () => setSnap(cache.snapshot(url))
    const unsub = cache.subscribe(url, onChange)
    setSnap(cache.snapshot(url))
    cache.refresh(url).catch(() => {})
    return unsub
  }, [url])

  const refresh = useCallback(() => cache.refresh(url, { force: true }), [url])
  const invalidate = useCallback(() => cache.invalidate(url), [url])

  const raw = snap.data
  const data = raw == null ? null : (extract ? extract(raw) : raw)
  return { data, raw, refreshing: snap.refreshing, error: snap.error, fetchedAt: snap.fetchedAt, refresh, invalidate }
}
