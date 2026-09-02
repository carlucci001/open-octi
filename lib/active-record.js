'use client'
import { useEffect } from 'react'

export function broadcastActiveRecord(type, data) {
  if (typeof window === 'undefined') return
  const payload = data ? { type, ...data } : null
  window.__fccActiveRecord = payload
  window.dispatchEvent(new CustomEvent('fcc:active-record', { detail: payload }))
}

export function useActiveRecord(type, data, deps = []) {
  useEffect(() => {
    broadcastActiveRecord(type, data)
    return () => broadcastActiveRecord(type, null)
  }, deps) // eslint-disable-line react-hooks/exhaustive-deps
}
