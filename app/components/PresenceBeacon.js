'use client'
// Invisible client component that keeps the user's presence fresh.
// Pings /api/auth/me every few seconds. The /me route bumps lastSeenAt server-side,
// which is what powers the "online now" green dots throughout the CRM.
// If /me ever returns 401 (booted, suspended, session expired), the user is
// redirected to /login so they get the right error message.
import { useEffect } from 'react'

export default function PresenceBeacon() {
  useEffect(() => {
    let stop = false
    const ping = async () => {
      try {
        const r = await fetch('/api/auth/me', { cache: 'no-store' })
        if (stop) return
        if (r.status === 401 || r.status === 403) {
          // Booted, suspended, or session expired — kick to login.
          window.location.href = '/login?next=' + encodeURIComponent(window.location.pathname)
        }
      } catch {}
    }
    ping()
    const t = setInterval(ping, 5000)
    return () => { stop = true; clearInterval(t) }
  }, [])
  return null
}
