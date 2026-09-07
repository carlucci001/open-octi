'use client'
import { Children, cloneElement, isValidElement, useEffect, useState } from 'react'
import Link from 'next/link'
import { isOpenOcti } from '@/lib/edition'
import ThemedSelect from './ThemedSelect'

function useVoiceProviders() {
  const [providers, setProviders] = useState(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    let active = true
    const load = () => fetch('/api/voice/lab-tts', { cache: 'no-store' }).then(async response => {
      if (!response.ok) throw new Error('Could not check provider')
      const result = await response.json()
      if (active) { setProviders(result.providers || []); setError(false) }
    }).catch(() => { if (active) setError(true) })
    load(); window.addEventListener('openocti:key-saved', load)
    return () => { active = false; window.removeEventListener('openocti:key-saved', load) }
  }, [])
  return { providers, error }
}

export function useVoiceProviderReady(provider) {
  const { providers, error } = useVoiceProviders()
  return !error && Boolean(providers?.some(item => item.id === provider && item.enabled))
}

export function VoiceProviderSelect({ children, ...props }) {
  const { providers, error } = useVoiceProviders()
  return <ThemedSelect {...props}>{Children.map(children, child => {
    if (!isValidElement(child) || child.type !== 'option') return child
    const provider = providers?.find(item => item.id === child.props.value)
    const unavailable = !provider?.enabled || error
    const reason = !providers ? 'checking setup' : provider?.credential ? `needs ${provider.credential}` : 'needs service setup'
    return cloneElement(child, { disabled: child.props.disabled || unavailable }, <>{child.props.children}{unavailable ? ` — ${reason}` : ''}</>)
  })}</ThemedSelect>
}

export default function VoiceProviderNotice({ provider }) {
  const { providers, error } = useVoiceProviders()
  const selected = providers?.find(item => item.id === provider)
  const status = error ? 'Provider status could not be checked.' : !providers ? 'Checking required credentials…' : !selected ? 'This provider is not connected to this test.' : selected.enabled ? selected.credential ? `${selected.credential} configured. Ready for a test.` : 'Service configured. Ready for a test.' : selected.credential ? `Required: ${selected.credential}. No key is configured.` : 'Requires a separately installed voice service.'
  return <div role="status" className="mt-2 text-xs leading-5" style={{ color: selected?.enabled ? 'var(--text-muted)' : '#fbbf24' }}>
    <p>{status}</p>
    {selected?.note && <p style={{ color: 'var(--text-muted)' }}>{selected.note}</p>}
    {selected?.setupHref && !selected.enabled && <Link href={isOpenOcti() ? selected.setupHref : '/?tab=credentials'} className="font-semibold underline">Add the required key</Link>}
    {isOpenOcti() && <p><Link href="/settings/models" className="font-semibold underline">Manage model and voice keys</Link></p>}
  </div>
}
