'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, ExternalLink, KeyRound, Loader2, Trash2 } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import { clearClientCapabilityCache } from '@/lib/client-capabilities'

const PROVIDER_COPY = {
  anthropic: 'Claude models for reasoning, drafting, and your agent team.',
  openai: 'GPT models for agent chat, generation, and fallback runtime.',
  gemini: 'Gemini models for long context, multimodal work, and live voice.',
  openrouter: 'One key for routed access to multiple model providers.',
  elevenlabs: 'Optional natural voice for Maggie and other voice agents.',
}

function statusCopy(provider) {
  if (provider.source === 'app') return `Configured in OpenOcti ••••${provider.last4}`
  if (provider.source === 'env') return `Configured through ${provider.envKey}`
  return `Not configured — add ${provider.envKey}`
}

export default function OpenOctiModelsSettings({ standalone = false }) {
  const [providers, setProviders] = useState([])
  const [values, setValues] = useState({})
  const [busy, setBusy] = useState({})
  const [error, setError] = useState('')
  const [notice, setNotice] = useState(null)
  const [allowed, setAllowed] = useState(null)

  const load = useCallback(async () => {
    setError('')
    const [meResponse, keysResponse] = await Promise.all([
      fetch('/api/auth/me', { cache: 'no-store' }),
      fetch('/api/openocti/keys', { cache: 'no-store' }),
    ])
    const me = await meResponse.json().catch(() => ({}))
    const canManage = ['owner', 'admin'].includes(me.user?.role)
    setAllowed(canManage)
    if (!canManage) return
    const keys = await keysResponse.json().catch(() => ({}))
    if (!keysResponse.ok) throw new Error(keys.error || 'Could not load model key status')
    setProviders(keys.providers || [])
  }, [])

  useEffect(() => { load().catch(error => setError(error.message)) }, [load])

  const save = async provider => {
    const key = String(values[provider.id] || '').trim()
    if (!key) {
      setError(`Paste the ${provider.name} key before saving.`)
      return
    }
    setBusy(current => ({ ...current, [provider.id]: 'save' }))
    setError('')
    setNotice(null)
    try {
      const response = await fetch('/api/openocti/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: provider.id, key }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || `${provider.name} could not be saved`)
      clearClientCapabilityCache()
      setValues(current => ({ ...current, [provider.id]: '' }))
      setNotice({ provider: provider.name, agents: result.activatedAgents || [], openClaw: result.openClaw })
      window.dispatchEvent(new CustomEvent('openocti:key-saved', { detail: { provider: provider.id } }))
      await load()
    } catch (error) {
      setError(error.message)
    } finally {
      setBusy(current => ({ ...current, [provider.id]: '' }))
    }
  }

  const remove = async provider => {
    setBusy(current => ({ ...current, [provider.id]: 'remove' }))
    setError('')
    setNotice(null)
    try {
      const response = await fetch('/api/openocti/keys', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: provider.id }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || `${provider.name} could not be removed`)
      clearClientCapabilityCache()
      await load()
    } catch (error) {
      setError(error.message)
    } finally {
      setBusy(current => ({ ...current, [provider.id]: '' }))
    }
  }

  if (allowed === false) {
    return <div className={standalone ? 'command-workspace p-6' : ''} style={{ color: 'var(--text-muted)' }}>Models &amp; Keys is available to owners and admins.</div>
  }

  return (
    <div className={standalone ? 'command-workspace p-6' : ''}>
      <PageHeader
        icon={<KeyRound size={22} />}
        title="Models & Keys"
        subtitle="Add one model key to bring your OpenOcti agents online. Keys are tested before encrypted storage."
        actions={standalone ? <Link href="/" className="rounded-lg px-4 py-3 font-semibold" style={{ minHeight: 48, color: 'var(--text)', border: '1px solid var(--border)', display: 'inline-flex', alignItems: 'center' }}>Back to OpenOcti</Link> : null}
      />

      {error && <div role="alert" className="mb-4 rounded-xl p-4" style={{ color: '#fecaca', background: 'rgba(127,29,29,.35)', border: '1px solid rgba(239,68,68,.45)' }}>{error}</div>}

      {notice && (
        <div className="mb-5 rounded-xl p-4" style={{ color: 'var(--text)', background: 'rgba(16,185,129,.12)', border: '1px solid rgba(16,185,129,.38)' }}>
          <div className="flex items-center gap-2 font-semibold"><CheckCircle2 size={18} color="#34d399" /> {notice.provider} tested and saved.</div>
          {notice.agents.length > 0 && (
            <div className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>
              Now available: {notice.agents.map(agent => agent.name).join(', ')}. OpenClaw picked up the model configuration automatically.
              {' '}<Link href="/?tab=agents" style={{ color: '#30c0f0', fontWeight: 700 }}>Talk to Craig <ExternalLink size={14} style={{ display: 'inline' }} /></Link>
            </div>
          )}
        </div>
      )}

      {!providers.length && allowed !== false ? (
        <div className="p-8 text-center" style={{ color: 'var(--text-muted)' }}><Loader2 className="animate-spin" style={{ display: 'inline' }} /> Loading provider status…</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {providers.map(provider => (
            <section id={provider.id} key={provider.id} className="rounded-2xl p-5 scroll-mt-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>{provider.name}</h2>
                  <p className="mt-1 text-sm leading-6" style={{ color: 'var(--text-muted)' }}>{PROVIDER_COPY[provider.id]}</p>
                </div>
                <span className="rounded-full px-2.5 py-1 text-xs font-semibold" style={{ color: provider.status === 'configured' ? '#34d399' : '#fbbf24', background: provider.status === 'configured' ? 'rgba(16,185,129,.12)' : 'rgba(245,158,11,.12)' }}>
                  {provider.status === 'configured' ? 'Configured' : 'Needs key'}
                </span>
              </div>

              <div className="mt-4 text-xs" style={{ color: 'var(--text-muted)' }}>{statusCopy(provider)}</div>
              <label className="mt-4 block text-sm font-semibold" htmlFor={`openocti-key-${provider.id}`}>API key</label>
              <input
                id={`openocti-key-${provider.id}`}
                type="password"
                value={values[provider.id] || ''}
                onChange={event => setValues(current => ({ ...current, [provider.id]: event.target.value }))}
                placeholder={`Paste ${provider.name} key`}
                autoComplete="off"
                spellCheck={false}
                className="mt-2 w-full rounded-lg px-3 py-3"
                style={{ minHeight: 48, color: 'var(--text)', background: 'var(--surface2)', border: '1px solid var(--border)' }}
              />

              <div className="mt-3 flex gap-2">
                <button type="button" onClick={() => save(provider)} disabled={Boolean(busy[provider.id])} className="flex-1 rounded-lg px-4 py-3 font-semibold" style={{ minHeight: 48, color: '#001040', background: '#30c0f0', opacity: busy[provider.id] ? .65 : 1 }}>
                  {busy[provider.id] === 'save' ? 'Testing…' : 'Save & test'}
                </button>
                <button type="button" onClick={() => remove(provider)} disabled={Boolean(busy[provider.id]) || provider.source !== 'app'} aria-label={`Remove ${provider.name} app key`} title={provider.source === 'env' ? `Remove ${provider.envKey} from the environment to disable it` : `Remove ${provider.name} key`} className="rounded-lg px-3 py-3" style={{ minWidth: 48, minHeight: 48, color: provider.source === 'app' ? '#f87171' : 'var(--text-muted)', border: '1px solid var(--border)', opacity: provider.source === 'app' ? 1 : .45 }}>
                  <Trash2 size={18} />
                </button>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
