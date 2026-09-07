'use client'
import { useEffect, useMemo, useState } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { isOpenOcti } from './edition'

export function useStripeClient() {
  const [key, setKey] = useState(isOpenOcti() ? '' : process.env.NEXT_PUBLIC_STRIPE_PK || '')
  const [loading, setLoading] = useState(isOpenOcti())
  useEffect(() => {
    if (!isOpenOcti()) return
    let active = true
    let revision = 0
    const refresh = () => {
      const requestRevision = ++revision
      setLoading(true); setKey('')
      fetch('/api/payments/config', { cache: 'no-store' }).then(response => response.ok ? response.json() : null)
        .then(data => { if (active && revision === requestRevision) setKey(data?.publishableKey || '') })
        .catch(() => { if (active && revision === requestRevision) setKey('') })
        .finally(() => { if (active && revision === requestRevision) setLoading(false) })
    }
    refresh()
    window.addEventListener('openocti-capabilities-changed', refresh)
    return () => { active = false; window.removeEventListener('openocti-capabilities-changed', refresh) }
  }, [])
  const stripePromise = useMemo(() => key ? loadStripe(key) : null, [key])
  return { stripePromise, loading }
}
