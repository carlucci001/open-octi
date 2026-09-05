'use client'

import { useEffect, useState } from 'react'
import { ExternalLink, RefreshCw } from 'lucide-react'
import { useCapabilities } from '@/lib/client-capabilities'
import { integrationDirectoryEntry } from '@/lib/integration-directory'

export default function IntegrationsSettings() {
  const { capabilities, loading, refresh } = useCapabilities()
  const [role, setRole] = useState('')
  const [testing, setTesting] = useState('')
  const [localResults, setLocalResults] = useState({})

  useEffect(() => {
    fetch('/api/auth/me', { cache: 'no-store' }).then(response => response.json()).then(data => setRole(data.user?.role || '')).catch(() => {})
  }, [])

  const canTest = ['owner', 'admin'].includes(role)
  async function test(capability) {
    setTesting(capability)
    const response = await fetch('/api/platform-admin/v1/capabilities/test', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ capability }),
    }).catch(() => null)
    const data = await response?.json().catch(() => ({})) || {}
    setLocalResults(current => ({ ...current, [capability]: {
      ok: Boolean(response?.ok && data.ok),
      message: data.message || (data.error === 'not_configured' ? 'Add the required environment values before testing.' : 'Connection test failed cleanly.'),
    } }))
    await refresh()
    setTesting('')
  }

  if (loading) return <div role="status" className="rounded-xl p-5" style={{ border: '1px solid var(--border)' }}>Loading integrations…</div>

  return (
    <section aria-labelledby="integrations-title">
      <div className="mb-5">
        <h2 id="integrations-title" className="text-xl font-semibold">Integrations</h2>
        <p className="mt-1 text-sm" style={{ color: 'var(--text-muted)' }}>Configuration is read from the server environment. Credential values are never displayed or stored here.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid="integration-grid">
        {capabilities.map(capability => {
          const directory = integrationDirectoryEntry(capability.id)
          const result = localResults[capability.id] || capability.lastTest
          const state = result && !result.ok ? 'Failing' : capability.status === 'configured' ? 'Configured' : 'Not configured'
          const color = state === 'Configured' ? '#10b981' : state === 'Failing' ? '#f87171' : '#f59e0b'
          return (
            <article key={capability.id} data-capability={capability.id} className="rounded-xl p-4 flex flex-col" style={{ minHeight: 240, background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-semibold">{capability.label}</h3>
                <span className="rounded-full px-2 py-1 text-xs font-semibold whitespace-nowrap" style={{ color, border: `1px solid ${color}` }}>{state}</span>
              </div>
              <p className="mt-2 text-sm" style={{ color: 'var(--text-muted)' }}>{directory.description}</p>
              <div className="mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>Required environment values</div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {(capability.requirementGroups || []).map((group, index) => <code key={index} className="rounded px-2 py-1 text-[11px]" style={{ background: 'var(--bg)' }}>{group.join(' or ')}</code>)}
              </div>
              {result?.message && <div role="status" className="mt-3 text-xs" style={{ color }}>{result.message}</div>}
              <div className="mt-auto pt-4 flex items-center gap-2">
                <a href={directory.signupUrl} target={directory.signupUrl.startsWith('http') ? '_blank' : undefined} rel="noreferrer" title={`Open ${capability.label} setup`} className="inline-flex items-center justify-center rounded-lg" style={{ width: 48, height: 48, border: '1px solid var(--border)' }}><ExternalLink size={18} /><span className="sr-only">Open vendor setup</span></a>
                {canTest && <button type="button" title={`Test ${capability.label} connection`} onClick={() => test(capability.id)} disabled={testing === capability.id} className="inline-flex items-center justify-center rounded-lg disabled:opacity-60" style={{ width: 48, height: 48, border: '1px solid var(--border)' }}><RefreshCw size={18} className={testing === capability.id ? 'animate-spin' : ''} /><span className="sr-only">Test connection</span></button>}
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
