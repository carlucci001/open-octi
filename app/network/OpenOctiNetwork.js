'use client'

import { useCallback, useEffect, useState } from 'react'
import { RefreshCw, Network, Server, GitBranch, Bot, Monitor } from 'lucide-react'
import PageHeader from '../components/PageHeader'

const labels = { active: 'Running', unavailable: 'Unavailable', 'not configured': 'Not configured' }

function Service({ title, status, detail, icon: Icon }) {
  return <div className="rounded-xl border p-4" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
    <div className="flex items-center gap-2"><Icon size={18} /><strong>{title}</strong></div>
    <div className="mt-3 text-sm" style={{ color: status === 'active' ? 'var(--green, #22c55e)' : 'var(--text-muted)' }}>{labels[status] || 'Checking'}</div>
    <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>{detail}</p>
  </div>
}

export default function OpenOctiNetwork() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState('topology')
  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/network/status', { cache: 'no-store', signal: AbortSignal.timeout(6000) })
      if (!response.ok) throw new Error('Network status could not be loaded.')
      const result = await response.json()
      if (result.edition !== 'openocti') throw new Error('Installation status is not available yet.')
      setData(result)
      setError('')
    } catch (e) { setError(e.message || 'Network status could not be loaded.') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { refresh() }, [refresh])
  return <div className="command-workspace space-y-4 p-6">
    <PageHeader icon={<Network size={20} />} title="Network" subtitle="Connections for this OpenOcti installation" />
    <div className="flex items-center justify-between gap-3">
      <div className="flex gap-2" role="group" aria-label="Network view">
        {['topology', 'services'].map(value => <button key={value} type="button" aria-pressed={view === value} className="rounded-lg border px-3 py-1.5 text-sm" style={{ borderColor: 'var(--border)', background: view === value ? 'var(--surface2)' : 'transparent' }} onClick={() => setView(value)}>{value === 'topology' ? 'Topology' : 'Services'}</button>)}
      </div>
      <button type="button" title="Refresh network status" aria-label="Refresh network status" disabled={loading} onClick={refresh} className="rounded-lg border p-2" style={{ borderColor: 'var(--border)' }}><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /></button>
    </div>
    {error && <p role="alert">{error}</p>}
    {!data && !error && <p role="status">Checking this installation…</p>}
    {data && <>
      {view === 'topology' && <div className="rounded-xl border p-6" style={{ background: 'var(--surface)', borderColor: 'var(--border)' }} aria-label="This installation topology">
        <div className="flex flex-wrap items-center justify-center gap-4 text-center">
          <div><Monitor className="mx-auto mb-2" size={26} /><strong>Your browser</strong></div>
          <span aria-hidden="true">→</span>
          <div><Server className="mx-auto mb-2" size={26} /><strong>OpenOcti</strong><p className="text-xs">{data.crm.runtime}</p></div>
          {(data.openclaw.status !== 'not configured' || data.gitea.status !== 'not configured') && <><span aria-hidden="true">→</span><div className="space-y-3">
            {data.openclaw.status !== 'not configured' && <div className="flex items-center gap-2"><Bot size={20} /> OpenClaw <span className="text-xs">{labels[data.openclaw.status]}</span></div>}
            {data.gitea.status !== 'not configured' && <div className="flex items-center gap-2"><GitBranch size={20} /> Gitea <span className="text-xs">{labels[data.gitea.status]}</span></div>}
          </div></>}
        </div>
        <p className="mt-6 text-center text-sm" style={{ color: 'var(--text-muted)' }}>OpenOcti connects to its configured services on the server.</p>
      </div>}
      <div className="grid gap-3 sm:grid-cols-3">
        <Service title="OpenOcti" icon={Server} status={data.crm.status} detail={`Application running in ${data.crm.runtime}`} />
        <Service title="OpenClaw" icon={Bot} status={data.openclaw.status} detail="Agent runtime · connection reachability" />
        <Service title="Gitea" icon={GitBranch} status={data.gitea.status} detail="Repository service · health check" />
      </div>
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Provider keys and integrations are managed in Settings. A listed provider is not evidence of a configured connection.</p>
    </>}
  </div>
}
