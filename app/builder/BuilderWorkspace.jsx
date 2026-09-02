'use client'

import { useCallback, useEffect, useState } from 'react'
import { Hammer, KeyRound, LockKeyhole, MonitorUp, Power, RefreshCw, Router, Server } from 'lucide-react'
import PageHeader from '../components/PageHeader'

function reserveCallSafeBuilderWindow() {
  const required = !!(window.__fccCallActive || window.__fccConferenceActive)
  const popup = required
    ? window.open('about:blank', 'fcc-builder', 'popup=yes,width=1440,height=960,resizable=yes,scrollbars=yes')
    : null

  return { required, popup }
}

function StatusPill({ state }) {
  const live = state === 'live'
  const checking = state === 'checking'
  const starting = state === 'starting'
  const label = starting ? 'Starting' : checking ? 'Checking' : live ? 'Ready' : 'Offline'
  const color = checking ? 'var(--amber)' : live ? 'var(--green)' : 'var(--red)'
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-bold"
      style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color }}
      role="status"
      aria-live="polite"
    >
      <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 999, background: color, boxShadow: `0 0 12px ${color}` }} />
      {label}
    </span>
  )
}

function DetailCard({ icon, eyebrow, title, children }) {
  return (
    <section className="rounded-lg p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="mb-3 flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-lg" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
          {icon}
        </span>
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: 'var(--text-muted)' }}>{eyebrow}</div>
          <h2 className="text-sm font-bold" style={{ color: 'var(--text)' }}>{title}</h2>
        </div>
      </div>
      <div className="text-xs leading-5" style={{ color: 'var(--text-muted)' }}>{children}</div>
    </section>
  )
}

function IconButton({ label, onClick, disabled, children }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      data-tooltip={label}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-10 w-10 items-center justify-center rounded-lg"
      style={{
        background: 'var(--surface2)',
        border: '1px solid var(--border)',
        color: 'var(--text)',
        cursor: disabled ? 'wait' : 'pointer',
        opacity: disabled ? 0.55 : 1,
      }}
    >
      {children}
    </button>
  )
}

export default function BuilderWorkspace() {
  const [status, setStatus] = useState({ state: 'checking', checkedAt: null, responseMs: null })

  const checkStatus = useCallback(async () => {
    setStatus(current => ({ ...current, state: 'checking' }))
    try {
      const response = await fetch('/api/builder/status', { cache: 'no-store' })
      const result = await response.json()
      setStatus({
        state: response.ok && result.live ? 'live' : 'offline',
        checkedAt: result.checkedAt || new Date().toISOString(),
        responseMs: result.responseMs ?? null,
      })
    } catch {
      setStatus({ state: 'offline', checkedAt: new Date().toISOString(), responseMs: null })
    }
  }, [])

  useEffect(() => {
    checkStatus()
    const timer = window.setInterval(checkStatus, 30000)
    return () => window.clearInterval(timer)
  }, [checkStatus])

  const openBuilder = async (reservedWindow = null) => {
    const launchWindow = reservedWindow || reserveCallSafeBuilderWindow()
    try {
      if (launchWindow.required && !launchWindow.popup) {
        throw new Error('Builder window was blocked')
      }
      const response = await fetch('/api/builder/launch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ theme: document.documentElement.getAttribute('data-theme') || 'command' }),
      })
      const result = await response.json()
      if (!response.ok || !result.url) throw new Error(result.error || 'launch failed')
      if (launchWindow.popup) {
        launchWindow.popup.opener = null
        launchWindow.popup.location.replace(result.url)
      } else {
        window.location.assign(result.url)
      }
    } catch {
      launchWindow.popup?.close()
      setStatus(current => ({ ...current, state: 'offline' }))
    }
  }
  const startBuilder = async () => {
    const launchWindow = reserveCallSafeBuilderWindow()
    if (launchWindow.required && !launchWindow.popup) {
      setStatus(current => ({ ...current, state: 'offline' }))
      return
    }
    setStatus(current => ({ ...current, state: 'starting' }))
    try {
      const response = await fetch('/api/builder/start', { method: 'POST' })
      if (!response.ok) throw new Error('start failed')
      for (let attempt = 0; attempt < 15; attempt += 1) {
        await new Promise(resolve => window.setTimeout(resolve, 1500))
        const health = await fetch('/api/builder/status', { cache: 'no-store' })
        const result = await health.json()
        if (health.ok && result.live) {
          setStatus({ state: 'live', checkedAt: result.checkedAt, responseMs: result.responseMs ?? null })
          await openBuilder(launchWindow)
          return
        }
      }
      launchWindow.popup?.close()
      setStatus({ state: 'offline', checkedAt: new Date().toISOString(), responseMs: null })
    } catch {
      launchWindow.popup?.close()
      setStatus({ state: 'offline', checkedAt: new Date().toISOString(), responseMs: null })
    }
  }
  const checkedLabel = status.checkedAt
    ? new Date(status.checkedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })
    : 'Not checked yet'

  return (
    <div className="command-workspace p-4 sm:p-5">
      <PageHeader
        icon={<Hammer size={20} />}
        title="Builder"
        subtitle="Your private, owner-only workspace for creating and running full applications."
        actions={
          <div className="flex items-center gap-2">
            <StatusPill state={status.state} />
            <IconButton label="Check Builder status" onClick={checkStatus} disabled={status.state === 'checking'}>
              <RefreshCw size={16} className={status.state === 'checking' ? 'animate-spin' : ''} />
            </IconButton>
          </div>
        }
      />

      <section
        className="relative mb-4 overflow-hidden rounded-xl p-5 sm:p-7"
        style={{
          background: 'linear-gradient(135deg, color-mix(in srgb, var(--accent-soft) 78%, var(--surface2)), var(--surface) 66%)',
          border: '1px solid var(--border)',
          boxShadow: '0 18px 48px color-mix(in srgb, var(--accent) 9%, transparent)',
        }}
      >
        <div aria-hidden="true" className="absolute right-[-70px] top-[-90px] h-64 w-64 rounded-full" style={{ background: 'var(--accent-soft)', filter: 'blur(8px)' }} />
        <div className="relative grid items-center gap-6 lg:grid-cols-[1.35fr_0.65fr]">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.12em]" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--accent)' }}>
              <LockKeyhole size={13} /> Owner workspace
            </div>
            <h2 className="max-w-2xl text-2xl font-black leading-tight sm:text-3xl" style={{ color: 'var(--text)' }}>Turn an idea into a working application.</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6" style={{ color: 'var(--text-muted)' }}>
              Builder runs in your private Hetzner owner workspace, uses secured provider credentials, and stays separate from tenant operations.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={status.state === 'live' ? () => openBuilder() : startBuilder}
                disabled={status.state === 'checking' || status.state === 'starting'}
                className="inline-flex min-h-12 items-center gap-2 rounded-lg px-5 text-sm font-black"
                style={{ background: 'var(--accent)', color: 'var(--accent-text)', boxShadow: '0 10px 24px var(--accent-soft)' }}
              >
                {status.state === 'live' ? <MonitorUp size={18} /> : <Power size={18} />}
                {status.state === 'starting' ? 'Starting Builder…' : status.state === 'live' ? 'Open Builder' : 'Start Builder'}
              </button>
              <button
                type="button"
                onClick={checkStatus}
                className="inline-flex min-h-12 items-center gap-2 rounded-lg px-5 text-sm font-bold"
                style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}
              >
                <RefreshCw size={17} /> Refresh status
              </button>
            </div>
          </div>

          <div className="rounded-xl p-4" style={{ background: 'color-mix(in srgb, var(--surface) 88%, transparent)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--text-muted)' }}>Hetzner runtime</div>
                <div className="mt-1 text-xl font-black" style={{ color: status.state === 'live' ? 'var(--green)' : 'var(--text)' }}>
                  {status.state === 'checking' ? 'Checking…' : status.state === 'live' ? 'Ready to build' : 'Not running'}
                </div>
              </div>
              <Server size={30} style={{ color: 'var(--accent)' }} />
            </div>
            <div className="mt-4 grid gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
              <div className="flex justify-between gap-4"><span>Last check</span><strong style={{ color: 'var(--text)' }}>{checkedLabel}</strong></div>
              <div className="flex justify-between gap-4"><span>Response</span><strong style={{ color: 'var(--text)' }}>{status.responseMs == null ? '—' : `${status.responseMs} ms`}</strong></div>
              <div className="flex justify-between gap-4"><span>Access</span><strong style={{ color: 'var(--text)' }}>Owner only</strong></div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <DetailCard icon={<Router size={19} />} eyebrow="AI routing" title="Multi-provider">
          Every compatible stored provider is injected from the secure vault. Keys are never displayed here or written into this screen.
        </DetailCard>
        <DetailCard icon={<KeyRound size={19} />} eyebrow="Credentials" title="Vault-backed">
          Provider credentials stay behind the Command Center vault workflow and are held only by the private Builder service while it runs.
        </DetailCard>
        <DetailCard icon={<LockKeyhole size={19} />} eyebrow="Visibility" title="Owner only">
          Builder is excluded from member and admin navigation. It is not a tenant feature and does not inherit tenant data access.
        </DetailCard>
        <DetailCard icon={<MonitorUp size={19} />} eyebrow="Workspace" title="Private development">
          Generated applications run in a separate browser workspace. Nothing is pushed, deployed, or connected to production automatically.
        </DetailCard>
      </div>
    </div>
  )
}
