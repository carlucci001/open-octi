'use client'
import { useEffect } from 'react'

const SERVICE_WORKER_VERSION = '2026-06-23-voice-routing-hotfix'

async function clearStaleCaches() {
  try {
    if ('caches' in window) {
      const keys = await window.caches.keys()
      await Promise.all(keys.map(key => window.caches.delete(key)))
    }
  } catch {}
}

export default function PWARegister() {
  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      let refreshing = false
      const handleControllerChange = () => {
        if (refreshing) return
        refreshing = true
        window.location.reload()
      }
      const localDevelopment = process.env.NODE_ENV !== 'production'
        && ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname)

      if (localDevelopment) {
        clearStaleCaches()
        navigator.serviceWorker.getRegistrations()
          .then(registrations => Promise.all(registrations.map(registration => registration.unregister())))
          .catch(() => {})
        return undefined
      }

      navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange)
      clearStaleCaches()
      fetch('/api/build-info', { cache: 'no-store' })
        .then(r => r.ok ? r.json() : null)
        .catch(() => null)
        .then(info => {
          const version = encodeURIComponent(`${info?.code || 'local'}-${SERVICE_WORKER_VERSION}`)
          return navigator.serviceWorker.register(`/sw.js?v=${version}`, { updateViaCache: 'none' })
        })
        .then(reg => reg.update().catch(() => {}))
        .catch(() => {})

      return () => navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange)
    }
    return undefined
  }, [])
  return null
}
