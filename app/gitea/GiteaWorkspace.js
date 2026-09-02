'use client'

import { useEffect, useMemo, useState } from 'react'
import { ExternalLink, GitBranch, RefreshCw } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import { resolveRepositoryLinks } from '@/lib/repository-links'

function Badge({ children, tone = 'accent' }) {
  const colors = {
    accent: ['var(--accent-soft)', 'var(--accent)'],
    green: ['var(--green-soft)', 'var(--green)'],
    red: ['var(--red-soft)', 'var(--red)'],
    muted: ['var(--surface2)', 'var(--text-muted)'],
  }[tone] || ['var(--surface2)', 'var(--text-muted)']
  return (
    <span className="inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold" style={{ background: colors[0], color: colors[1], border: '1px solid var(--border)' }}>
      {children}
    </span>
  )
}

function ActionButton({ children, onClick, href, primary = false }) {
  const style = {
    minHeight: 44,
    background: primary ? 'var(--accent)' : 'var(--surface2)',
    color: primary ? 'var(--accent-text)' : 'var(--text)',
    border: primary ? '1px solid transparent' : '1px solid var(--border)',
  }
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold" style={style}>
        {children}
      </a>
    )
  }
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold" style={style}>
      {children}
    </button>
  )
}

export default function GiteaWorkspace() {
  const [ops, setOps] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [frameReady, setFrameReady] = useState(false)
  const [theme, setTheme] = useState('codex-dark')

  const giteaUrl = resolveRepositoryLinks({ giteaUrl: ops?.system?.gitea?.url || '/api/repository/gitea/' }).gitea || '/api/repository/gitea/'
  const repositoryFrameTheme = ['command', 'codex-blue', 'codex', 'codex-dark'].includes(theme) ? theme : 'command'
  const repositoryFrameDark = repositoryFrameTheme === 'command' || repositoryFrameTheme === 'codex-dark'
  const embeddedUrl = `/api/repository/gitea/?fccTheme=${encodeURIComponent(repositoryFrameTheme)}&fccThemeVersion=2`
  const fullFrameUrl = embeddedUrl
  const repo = useMemo(() => (ops?.cicdItems || []).find(item => item.id === 'cicd-fcc') || (ops?.cicdItems || [])[0], [ops])
  const repoName = repo?.repo || 'farrington-command-center'
  const repoBranch = ops?.system?.repo?.branch || repo?.branch || 'codex/finish-cicd'
  const repoPath = ops?.system?.repo?.path || repo?.localPath || 'production deployment copy'

  const load = async () => {
    setBusy(true)
    setError('')
    try {
      const res = await fetch('/api/ops', { cache: 'no-store' })
      const text = await res.text()
      let json = null
      try {
        json = JSON.parse(text)
      } catch {
        const type = text.trim().startsWith('<') ? 'HTML' : 'non-JSON'
        throw new Error(`Ops API returned ${type} instead of JSON (${res.status}).`)
      }
      if (!res.ok || !json?.ok) throw new Error(json?.error || `Ops API failed (${res.status}).`)
      setOps(json)
    } catch (err) {
      setError(err?.message || 'Repository status could not be loaded.')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    if (typeof document === 'undefined') return
    const readTheme = () => setTheme(document.documentElement.getAttribute('data-theme') || 'codex-dark')
    readTheme()
    const observer = new MutationObserver(readTheme)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => observer.disconnect()
  }, [])

  return (
    <div className="repository-workspace command-workspace min-h-full p-6 space-y-4" style={{ background: 'var(--base)', color: 'var(--text)' }}>
      <PageHeader
        icon={<GitBranch size={20} />}
        title="Repository"
        subtitle={`${repoName} on ${repoBranch} at ${repoPath}`}
        actions={(
          <div className="flex flex-wrap gap-2">
            <ActionButton onClick={load}><RefreshCw size={16} /> {busy ? 'Checking' : 'Refresh'}</ActionButton>
            <ActionButton href={fullFrameUrl} primary><ExternalLink size={16} /> Open Full Frame</ActionButton>
          </div>
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={ops?.system?.gitea?.status === 'active' ? 'green' : 'red'}>{ops?.system?.gitea?.status || 'checking'}</Badge>
          <Badge tone={ops?.system?.crm?.status === 'active' ? 'green' : 'red'}>CRM {ops?.system?.crm?.status || 'unknown'}</Badge>
        </div>
        {error ? (
          <div className="mt-3 rounded-md px-3 py-2 text-sm" style={{ background: 'var(--red-soft)', color: 'var(--red)', border: '1px solid var(--border)' }}>
            {error}
          </div>
        ) : null}
      </PageHeader>

      <div className="grid grid-cols-1 gap-4">
        <section className="repository-frame-shell rounded-lg overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)', minHeight: 'calc(100vh - 230px)' }}>
          <div className="repository-frame-header flex items-center justify-between gap-3 px-4 py-3" style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
            <div className="min-w-0">
              <div className="font-semibold" style={{ color: 'var(--text)' }}>Embedded repository console</div>
              <div className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{giteaUrl} through Command Center SSO</div>
            </div>
            <Badge tone={frameReady ? 'green' : 'muted'}>{frameReady ? 'frame loaded' : 'frame pending'}</Badge>
          </div>
          <iframe
            title="Repository"
            key={embeddedUrl}
            src={embeddedUrl}
            onLoad={() => setFrameReady(true)}
            className="w-full"
            style={{ height: 'calc(100vh - 285px)', minHeight: 520, border: 0, background: 'var(--base)', colorScheme: repositoryFrameDark ? 'dark' : 'light' }}
          />
        </section>
      </div>
    </div>
  )
}
