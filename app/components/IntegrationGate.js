'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { PlugZap, RefreshCw } from 'lucide-react'
import { useCapabilities } from '@/lib/client-capabilities'
import { integrationDirectoryEntry } from '@/lib/integration-directory'

let userPromise = null
function loadCurrentUser() {
  if (!userPromise) userPromise = fetch('/api/auth/me', { cache: 'no-store' }).then(response => response.ok ? response.json() : null).catch(() => null)
  return userPromise
}

export default function IntegrationGate({ capability, title, description, children, mode = 'all' }) {
  const requested = useMemo(() => (Array.isArray(capability) ? capability : [capability]).filter(Boolean), [capability])
  const { capabilities, loading, refresh } = useCapabilities()
  const [user, setUser] = useState(null)
  const [testing, setTesting] = useState('')
  const [results, setResults] = useState({})

  useEffect(() => { let active = true; loadCurrentUser().then(data => { if (active) setUser(data?.user || null) }); return () => { active = false } }, [])

  const matches = requested.map(id => capabilities.find(item => item.id === id) || { id, label: id, status: 'not_configured', missing: [], requirementGroups: [] })
  const enabled = mode === 'any' ? matches.some(item => item.status === 'configured') : matches.every(item => item.status === 'configured')
  if (loading) return <div role="status" className="rounded-xl p-5" style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}>Checking integration…</div>
  if (enabled) return children

  const missing = mode === 'any' ? matches : matches.filter(item => item.status !== 'configured')
  if (user && !['owner', 'admin'].includes(user.role)) {
    return <div role="status" className="rounded-xl p-5" style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}>Not set up yet — ask your administrator.</div>
  }

  async function test(id) {
    setTesting(id)
    setResults(current => ({ ...current, [id]: null }))
    const response = await fetch('/api/platform-admin/v1/capabilities/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ capability: id }) }).catch(() => null)
    const data = await response?.json().catch(() => ({})) || {}
    const message = data.message || (data.error === 'not_configured' ? 'Add the required environment values before testing.' : 'Connection test failed cleanly.')
    setResults(current => ({ ...current, [id]: { ok: Boolean(response?.ok && data.ok), message } }))
    await refresh()
    setTesting('')
  }

  return (
    <section data-integration-gate={requested.join(',')} className="rounded-xl p-5" style={{ background: 'var(--surface)', border: '1px solid rgba(245,158,11,.42)' }}>
      <div className="flex items-start gap-3">
        <PlugZap size={22} color="#f59e0b" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold">Connect {title || missing.map(item => item.label).join(' or ')}</h2>
          <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>{description || integrationDirectoryEntry(missing[0]?.id).description}</p>
        </div>
      </div>
      <div className="mt-4 grid gap-3">
        {missing.map(item => {
          const directory = integrationDirectoryEntry(item.id)
          const groups = item.requirementGroups?.length ? item.requirementGroups : (item.missing || []).map(key => [key])
          const result = results[item.id] || item.lastTest
          return (
            <div key={item.id} className="rounded-lg p-4" style={{ border: '1px solid var(--border)' }}>
              <div className="font-semibold">{item.label}</div>
              <div className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>Environment values:</div>
              <div className="mt-1 flex flex-wrap gap-2">{groups.map((group, index) => <code key={`${item.id}-${index}`} className="rounded px-2 py-1 text-xs" style={{ background: 'var(--bg)' }}>{group.join(' or ')}</code>)}</div>
              <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>{directory.freeTier}</p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <a href={directory.signupUrl} target={directory.signupUrl.startsWith('http') ? '_blank' : undefined} rel="noreferrer" className="text-sm font-semibold underline">Get credentials</a>
                <button type="button" onClick={() => test(item.id)} disabled={testing === item.id} className="rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-60" style={{ minHeight: 44, border: '1px solid var(--border)' }}>
                  <span className="inline-flex items-center gap-2"><RefreshCw size={15} className={testing === item.id ? 'animate-spin' : ''} />{testing === item.id ? 'Testing…' : 'Test connection'}</span>
                </button>
                {result && <span role="status" className="text-sm" style={{ color: result.ok ? '#10b981' : '#f87171' }}>{result.message}</span>}
              </div>
            </div>
          )
        })}
      </div>
      <Link href="/?tab=settings&settings=integrations" className="mt-4 inline-block text-sm font-semibold underline">Settings → Integrations</Link>
    </section>
  )
}
