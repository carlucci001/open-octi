'use client'

import { useCallback, useEffect, useState } from 'react'

let manifestPromise = null

export async function loadCapabilityManifest() {
  if (typeof window === 'undefined') return { capabilities: [] }
  if (!manifestPromise) {
    manifestPromise = fetch('/api/platform-admin/v1/capabilities', { cache: 'no-store' })
      .then(response => response.ok ? response.json() : Promise.reject(new Error(`capabilities ${response.status}`)))
      .catch(() => ({ capabilities: [] }))
  }
  return manifestPromise
}

export async function clientCapabilityStatus(id) {
  if (typeof window === 'undefined') return { status: 'not_configured', missing: [] }
  const manifest = await loadCapabilityManifest()
  return manifest.capabilities?.find(item => item.id === id)
    || { id, status: 'not_configured', missing: [] }
}

export function clearClientCapabilityCache() {
  manifestPromise = null
}

export function useCapabilities() {
  const [manifest, setManifest] = useState(null)
  const [error, setError] = useState(null)

  const refresh = useCallback(async () => {
    clearClientCapabilityCache()
    setError(null)
    try {
      const next = await loadCapabilityManifest()
      setManifest(next)
      return next
    } catch (nextError) {
      setError(nextError)
      return null
    }
  }, [])

  useEffect(() => {
    let active = true
    loadCapabilityManifest()
      .then(next => { if (active) setManifest(next) })
      .catch(nextError => { if (active) setError(nextError) })
    return () => { active = false }
  }, [])

  return {
    manifest,
    capabilities: manifest?.capabilities || [],
    loading: !manifest && !error,
    error,
    refresh,
  }
}
