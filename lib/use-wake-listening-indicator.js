'use client'

import { useEffect, useState } from 'react'

export const WAKE_RESTART_GRACE_MS = 1000

function publishListening(listening) {
  if (typeof window === 'undefined') return
  window.__fccVoiceListening = listening
  window.dispatchEvent(new CustomEvent('fcc:voice-listening', { detail: listening }))
}

// Presentation only: a recognizer that has actually started may briefly renew
// without swapping the header controls. Raw capture state remains independent.
export function useWakeListeningIndicator({ listening, enabled }) {
  const receiving = Boolean(listening)
  const allowed = Boolean(enabled)
  const [established, setEstablished] = useState(false)

  useEffect(() => {
    if (!allowed || receiving) {
      setEstablished(allowed && receiving)
      return
    }
    if (!established) return
    const timer = setTimeout(() => setEstablished(false), WAKE_RESTART_GRACE_MS)
    return () => clearTimeout(timer)
  }, [allowed, receiving, established])

  const visible = allowed && established
  useEffect(() => { publishListening(visible) }, [visible])
  useEffect(() => () => publishListening(false), [])

  return visible
}
