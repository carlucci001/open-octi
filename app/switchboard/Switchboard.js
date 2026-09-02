'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import PageHeader from '../components/PageHeader'
import ThemedSelect from '../components/ThemedSelect'
import ViewModeToggle from '../components/ViewModeToggle'
import { Paginator, usePagination } from '../components/Paginator'
import BulkActionsMenu from '../components/BulkActionsMenu'
import { Activity, CircleDot, Headphones, Lock, Mic2, PhoneCall, PhoneOff, RefreshCw, Search, ShieldCheck, ShieldOff, Square, Users, Volume2 } from 'lucide-react'

function statusColor(agent) {
  if (!agent.enabled) return 'var(--text-muted)'
  if (agent.call) return 'var(--green)'
  return 'var(--accent)'
}

function fmtTime(value) {
  if (!value) return ''
  try { return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) } catch { return '' }
}

function fmtDateTime(value) {
  if (!value) return ''
  try { return new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) } catch { return '' }
}

function policyLabel(agent) {
  if (agent.monitoring.scope === 'internal') return 'Internal'
  if (agent.monitoring.consent === 'opted_in') return 'QA allowed'
  if (agent.monitoring.consent === 'opted_out') return 'Opted out'
  return 'Needs terms'
}

function eventLabel(action = '') {
  return String(action || '')
    .replace(/^switchboard_/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

async function logMonitorEvent(event, payload = {}) {
  try {
    await fetch('/api/switchboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'monitor_event', event, ...payload }),
    })
  } catch {}
}

export default function Switchboard() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')
  const [listening, setListening] = useState(null)
  const [busyCall, setBusyCall] = useState('')
  const [endingCall, setEndingCall] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [tenantFilter, setTenantFilter] = useState('all')
  const [providerFilter, setProviderFilter] = useState('all')
  const [viewMode, setViewMode] = useState('list')
  const [selected, setSelected] = useState(new Set())
  const [activityFilter, setActivityFilter] = useState('all')
  const deviceRef = useRef(null)
  const callRef = useRef(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch('/api/switchboard', { cache: 'no-store' }).then(res => res.json())
      if (!r.ok) throw new Error(r.error || 'Switchboard unavailable')
      setData(r)
    } catch (e) {
      setToast(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 5000)
    return () => clearInterval(id)
  }, [refresh])

  const stopListening = useCallback(async (reason = 'stopped') => {
    const current = listening
    try { callRef.current?.disconnect() } catch {}
    try { deviceRef.current?.destroy() } catch {}
    callRef.current = null
    deviceRef.current = null
    setListening(null)
    if (current) {
      await logMonitorEvent(reason === 'failed' ? 'failed' : 'stopped', {
        callRoute: current.route,
        conference: current.friendlyName,
        callName: current.label,
      })
    }
  }, [listening])

  const startListening = async (call) => {
    if (!call?.friendlyName || busyCall) return
    if (listening?.friendlyName === call.friendlyName) {
      await stopListening()
      return
    }
    if (listening) await stopListening()
    setBusyCall(call.friendlyName)
    await logMonitorEvent('attempt', { callRoute: call.route, conference: call.friendlyName, callName: call.label || call.friendlyName })
    try {
      const { Device } = await import('@twilio/voice-sdk')
      const identity = `monitor-${Date.now().toString(36)}`
      const tokenRes = await fetch(`/api/twilio/token?identity=${encodeURIComponent(identity)}`).then(r => r.json())
      if (tokenRes.error) throw new Error(tokenRes.error)
      const device = new Device(tokenRes.token, { codecPreferences: ['opus', 'pcmu'] })
      deviceRef.current = device
      const connection = await device.connect({ params: { ListenConf: call.friendlyName } })
      callRef.current = connection
      setListening(call)
      await logMonitorEvent('started', { callRoute: call.route, conference: call.friendlyName, callName: call.label || call.friendlyName })
      connection.on('disconnect', () => stopListening())
      connection.on('cancel', () => stopListening())
      connection.on('reject', () => stopListening('failed'))
      connection.on('error', () => stopListening('failed'))
    } catch (e) {
      setToast(e.message || 'Could not join call')
      await logMonitorEvent('failed', { callRoute: call.route, conference: call.friendlyName, callName: call.label || call.friendlyName })
      await stopListening('failed')
    } finally {
      setBusyCall('')
    }
  }

  const endManagedCall = async (call) => {
    if (!call?.sid || endingCall) return
    if (!confirm(`End the managed phone call "${call.label}"? Everyone in this phone conference will be disconnected.`)) return

    setEndingCall(call.sid)
    try {
      const response = await fetch('/api/twilio/hangup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conferenceSid: call.sid }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.ok) throw new Error(result.error || 'Could not end this phone call')
      if (listening?.friendlyName === call.friendlyName) await stopListening()
      await refresh()
    } catch (e) {
      setToast(e.message || 'Could not end this phone call')
    } finally {
      setEndingCall('')
    }
  }

  useEffect(() => {
    return () => {
      try { callRef.current?.disconnect() } catch {}
      try { deviceRef.current?.destroy() } catch {}
    }
  }, [])

  const agents = data?.agents || []
  const activeCalls = useMemo(() => (data?.activeCalls || []).map(c => ({
    ...c,
    label: c.friendlyName || c.sid,
    parties: (c.participants || []).filter(p => !p.muted).length,
  })), [data])
  const recentEvents = data?.recentEvents || []
  const recentLiveEvents = useMemo(() => {
    const cutoff = Date.now() - 2 * 60 * 1000
    return recentEvents.filter(e => {
      const at = Date.parse(e.at || '')
      return Number.isFinite(at) && at >= cutoff
    })
  }, [recentEvents])
  const isSwitchboardActive = activeCalls.length > 0 || !!listening || recentLiveEvents.length > 0

  const tenantOptions = useMemo(() => {
    const values = new Map()
    agents.forEach(a => values.set(a.tenantId || a.tenantName || 'unknown', a.tenantName || a.tenantId || 'Unknown tenant'))
    return [...values.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [agents])
  const providerOptions = useMemo(() => {
    return [...new Set(agents.map(a => a.voiceProvider || 'unknown'))].sort()
  }, [agents])
  const liveCallText = useMemo(
    () => activeCalls.map(c => `${c.label || ''} ${c.friendlyName || ''}`.toLowerCase()).join(' '),
    [activeCalls]
  )

  const filteredAgents = useMemo(() => {
    const q = search.trim().toLowerCase()
    return agents.filter(agent => {
      if (q) {
        const haystack = [
          agent.name,
          agent.title,
          agent.tenantName,
          agent.tenantId,
          agent.voiceProvider,
          agent.monitoring?.consent,
          agent.monitoring?.reason,
        ].filter(Boolean).join(' ').toLowerCase()
        if (!haystack.includes(q)) return false
      }
      if (tenantFilter !== 'all' && (agent.tenantId || agent.tenantName || 'unknown') !== tenantFilter) return false
      if (providerFilter !== 'all' && (agent.voiceProvider || 'unknown') !== providerFilter) return false
      if (statusFilter === 'live' && !liveCallText.includes(String(agent.name || agent.id || '').toLowerCase())) return false
      if (statusFilter === 'available' && (!agent.enabled || !agent.monitoring?.allowed)) return false
      if (statusFilter === 'locked' && agent.monitoring?.allowed) return false
      if (statusFilter === 'disabled' && agent.enabled !== false) return false
      return true
    })
  }, [agents, liveCallText, providerFilter, search, statusFilter, tenantFilter])

  const visibleEvents = useMemo(() => {
    if (activityFilter === 'live') return recentLiveEvents
    if (activityFilter === 'warn') return recentEvents.filter(e => e.severity === 'warn')
    return recentEvents
  }, [activityFilter, recentEvents, recentLiveEvents])
  const { page, setPage, pageSize, setPageSize, paginated } = usePagination(filteredAgents, 25)

  const counts = {
    agents: agents.length,
    live: activeCalls.length,
    locked: agents.filter(a => a.monitoring.scope === 'leased' && !a.monitoring.allowed).length,
  }

  const toggleSelected = (id) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  return (
    <div className="command-workspace p-4 sm:p-6">
      <PageHeader
        icon={<Headphones size={22} />}
        title="Switchboard"
        subtitle={`${counts.agents} agents / ${counts.live} live managed call${counts.live === 1 ? '' : 's'} / ${counts.locked} leased locked`}
        viewToggle={<ViewModeToggle value={viewMode} onChange={setViewMode} modes={['list', 'card']} />}
        actions={
          <div className="inline-flex items-center gap-2 flex-wrap justify-end">
            <span
              className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold ${isSwitchboardActive ? 'animate-pulse' : ''}`}
              style={{
                background: isSwitchboardActive ? 'rgba(34,197,94,0.14)' : 'var(--surface2)',
                color: isSwitchboardActive ? 'var(--green)' : 'var(--text-muted)',
                border: `1px solid ${isSwitchboardActive ? 'rgba(34,197,94,0.35)' : 'var(--border)'}`,
                minHeight: 40,
              }}
            >
              <CircleDot size={14} /> {isSwitchboardActive ? 'Active' : 'Idle'}
            </span>
            <button onClick={refresh} disabled={loading} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold"
              style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', minHeight: 40 }}>
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>
        }
      />

      {toast && (
        <button onClick={() => setToast('')} className="mb-4 rounded-lg px-3 py-2 text-sm text-left"
          style={{ background: 'rgba(220,38,38,0.12)', border: '1px solid rgba(220,38,38,0.35)', color: 'var(--red)' }}>
          {toast}
        </button>
      )}

      <div className="command-toolbar mb-4 flex items-center gap-2 flex-wrap">
        <div className="relative min-w-[220px] flex-1 max-w-md">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search agents, tenants, providers..."
            className="w-full rounded-lg text-sm"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', minHeight: 40, padding: '0 12px 0 34px', outline: 'none' }}
          />
        </div>
        <ThemedSelect value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', minHeight: 40, padding: '0 10px', borderRadius: 8, fontSize: 13 }}>
          <option value="all">All statuses</option>
          <option value="available">Available</option>
          <option value="locked">Locked</option>
          <option value="live">Live call match</option>
          <option value="disabled">Disabled</option>
        </ThemedSelect>
        <ThemedSelect value={tenantFilter} onChange={e => setTenantFilter(e.target.value)}
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', minHeight: 40, padding: '0 10px', borderRadius: 8, fontSize: 13 }}>
          <option value="all">All tenants</option>
          {tenantOptions.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </ThemedSelect>
        <ThemedSelect value={providerFilter} onChange={e => setProviderFilter(e.target.value)}
          style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', minHeight: 40, padding: '0 10px', borderRadius: 8, fontSize: 13 }}>
          <option value="all">All providers</option>
          {providerOptions.map(provider => <option key={provider} value={provider}>{provider}</option>)}
        </ThemedSelect>
        <BulkActionsMenu
          selectedCount={selected.size}
          totalCount={paginated.length}
          onSelectPage={() => setSelected(new Set(paginated.map(agent => agent.id)))}
          onClearSelection={() => setSelected(new Set())}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-4">
        <section className="rounded-xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="px-4 py-3 flex items-center justify-between gap-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <div>
              <h2 className="font-semibold" style={{ color: 'var(--text)' }}>Agents</h2>
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {filteredAgents.length} visible / {agents.length} total. Monitoring follows ownership and lease consent.
              </div>
            </div>
            <span className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold" style={{ background: 'var(--surface2)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
              <Users size={14} /> {selected.size} selected
            </span>
          </div>
          <div className={viewMode === 'card' ? 'grid grid-cols-1 lg:grid-cols-2 gap-3 p-3' : 'divide-y'} style={{ borderColor: 'var(--border)' }}>
            {loading && !data ? (
              <div className="p-4 text-sm" style={{ color: 'var(--text-muted)' }}>Loading switchboard...</div>
            ) : filteredAgents.length === 0 ? (
              <div className="p-4 text-sm" style={{ color: 'var(--text-muted)' }}>No agents match the current controls.</div>
            ) : paginated.map(agent => (
              <AgentRow
                key={agent.id}
                agent={agent}
                viewMode={viewMode}
                selected={selected.has(agent.id)}
                onToggleSelected={() => toggleSelected(agent.id)}
                onConsentChanged={refresh}
              />
            ))}
          </div>
          <div className="px-2 pb-3">
            <Paginator total={filteredAgents.length} page={page} pageSize={pageSize} onPage={setPage} onPageSize={setPageSize} label="agents" />
          </div>
        </section>

        <aside className="flex flex-col gap-4">
          <section className="rounded-xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <h2 className="font-semibold" style={{ color: 'var(--text)' }}>Live Calls</h2>
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Managed Twilio conferences only.</div>
            </div>
            <div className="p-3 flex flex-col gap-3">
              {activeCalls.length === 0 ? (
                <div className="text-sm rounded-lg p-3" style={{ color: 'var(--text-muted)', background: 'var(--surface2)' }}>No managed calls are live.</div>
              ) : activeCalls.map(call => (
                <div key={call.sid} className="rounded-lg p-3" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold truncate" style={{ color: 'var(--text)' }}>{call.label}</div>
                      <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{call.parties} active voice leg{call.parties === 1 ? '' : 's'} {fmtTime(call.dateCreated) && `/ ${fmtTime(call.dateCreated)}`}</div>
                    </div>
                    <span className="inline-flex items-center gap-1 text-xs font-semibold" style={{ color: 'var(--green)' }}>
                      <PhoneCall size={13} /> Live
                    </span>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button onClick={() => startListening(call)} disabled={!!busyCall || endingCall === call.sid}
                      aria-label={listening?.friendlyName === call.friendlyName ? `Stop listening to ${call.label}` : `Listen to ${call.label}`}
                      className="inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold flex-1"
                      style={{
                        background: listening?.friendlyName === call.friendlyName ? 'var(--surface)' : 'var(--accent)',
                        color: listening?.friendlyName === call.friendlyName ? 'var(--text)' : 'var(--accent-text)',
                        border: listening?.friendlyName === call.friendlyName ? '1px solid var(--accent)' : '1px solid transparent',
                        minHeight: 48,
                      }}>
                      {listening?.friendlyName === call.friendlyName ? <Square size={14} /> : <Volume2 size={14} />}
                      {listening?.friendlyName === call.friendlyName ? 'Stop listening' : busyCall === call.friendlyName ? 'Joining...' : 'Listen'}
                    </button>
                    <button disabled className="inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold"
                      title="Whisper needs managed coach routing"
                      style={{ background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border)', opacity: 0.65, minHeight: 48 }}>
                      <Mic2 size={14} /> Whisper
                    </button>
                    <button
                      onClick={() => endManagedCall(call)}
                      disabled={!!endingCall}
                      aria-label={`End call ${call.label}`}
                      title={`End call ${call.label}`}
                      className="inline-flex items-center justify-center rounded-lg"
                      style={{
                        background: 'rgba(220,38,38,0.12)',
                        color: 'var(--red)',
                        border: '1px solid rgba(220,38,38,0.4)',
                        minHeight: 48,
                        minWidth: 48,
                        opacity: endingCall && endingCall !== call.sid ? 0.55 : 1,
                      }}
                    >
                      {endingCall === call.sid ? <RefreshCw size={18} className="animate-spin" /> : <PhoneOff size={18} />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="px-4 py-3 flex items-center justify-between gap-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <div>
                <h2 className="font-semibold flex items-center gap-2" style={{ color: 'var(--text)' }}>
                  <Activity size={16} className={isSwitchboardActive ? 'animate-pulse' : ''} style={{ color: isSwitchboardActive ? 'var(--green)' : 'var(--text-muted)' }} />
                  Activity
                </h2>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{recentLiveEvents.length} live pulse / {recentEvents.length} recent events</div>
              </div>
              <ThemedSelect value={activityFilter} onChange={e => setActivityFilter(e.target.value)}
                style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', minHeight: 34, padding: '0 8px', borderRadius: 8, fontSize: 12 }}>
                <option value="all">All</option>
                <option value="live">Live pulse</option>
                <option value="warn">Warnings</option>
              </ThemedSelect>
            </div>
            <div className="p-3 flex flex-col gap-2 max-h-[320px] overflow-auto">
              {isSwitchboardActive && (
                <div className="rounded-lg p-3" style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.28)' }}>
                  <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--green)' }}>
                    <CircleDot size={14} className="animate-pulse" /> Switchboard is active
                  </div>
                  <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                    {activeCalls.length} managed call{activeCalls.length === 1 ? '' : 's'} / {recentLiveEvents.length} recent monitor event{recentLiveEvents.length === 1 ? '' : 's'}.
                  </div>
                </div>
              )}
              {visibleEvents.length === 0 ? (
                <div className="text-sm rounded-lg p-3" style={{ color: 'var(--text-muted)', background: 'var(--surface2)' }}>No switchboard activity in this filter.</div>
              ) : visibleEvents.map(event => (
                <div key={event.id} className="rounded-lg p-3" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>{eventLabel(event.action)}</div>
                      <div className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{event.targetName || event.meta?.conference || event.targetId || 'Switchboard event'}</div>
                    </div>
                    <span className="text-[11px] whitespace-nowrap" style={{ color: event.severity === 'warn' ? 'var(--amber)' : 'var(--text-muted)' }}>{fmtDateTime(event.at)}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2 font-semibold mb-2" style={{ color: 'var(--text)' }}><ShieldCheck size={16} /> Guardrails</div>
            <ul className="space-y-2 text-sm" style={{ color: 'var(--text-muted)' }}>
              <li>Internal agents are monitorable.</li>
              <li>Leased agents unlock only after opt-in terms.</li>
              <li>Opted-out leased agents stay locked.</li>
              <li>Listen attempts are written to the security audit log.</li>
            </ul>
          </section>
        </aside>
      </div>
    </div>
  )
}

function AgentRow({ agent, onConsentChanged, selected, onToggleSelected, viewMode = 'list' }) {
  const [saving, setSaving] = useState(false)
  const color = statusColor(agent)
  const canEditLease = !!agent.leaseId
  const card = viewMode === 'card'

  const updateConsent = async (consent) => {
    if (!agent.leaseId || saving) return
    setSaving(true)
    try {
      const r = await fetch('/api/switchboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_monitoring_consent',
          leaseId: agent.leaseId,
          consent,
          noticePolicy: 'conditional',
        }),
      }).then(res => res.json())
      if (!r.ok) throw new Error(r.error || 'Consent update failed')
      onConsentChanged()
    } catch (e) {
      alert(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className={card ? 'p-4 rounded-lg flex flex-col gap-4' : 'p-4 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_220px_240px] gap-3 items-center'}
      style={card ? { background: 'var(--surface2)', border: '1px solid var(--border)' } : undefined}
    >
      <div className="min-w-0 flex items-center gap-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelected}
          aria-label={`Select ${agent.name}`}
          style={{ width: 16, height: 16, accentColor: 'var(--accent)', flex: '0 0 auto' }}
        />
        <span style={{ width: 10, height: 10, borderRadius: 999, background: color, boxShadow: agent.enabled ? `0 0 10px ${color}` : 'none' }} />
        <div className="min-w-0">
          <div className="font-semibold truncate" style={{ color: 'var(--text)' }}>{agent.name}</div>
          <div className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{agent.tenantName || agent.tenantId} / {agent.voiceProvider}</div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {agent.monitoring.allowed ? <ShieldCheck size={16} style={{ color: 'var(--green)' }} /> : <ShieldOff size={16} style={{ color: 'var(--amber)' }} />}
        <div>
          <div className="text-sm font-semibold" style={{ color: agent.monitoring.allowed ? 'var(--green)' : 'var(--amber)' }}>{policyLabel(agent)}</div>
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{agent.monitoring.noticePolicy || 'conditional'} notice</div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 lg:justify-end">
        {!canEditLease ? (
          <span className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold"
            style={{ background: 'var(--surface2)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
            <Lock size={13} /> In-house
          </span>
        ) : (
          <>
            <button onClick={() => updateConsent('opted_in')} disabled={saving || agent.monitoring.consent === 'opted_in'}
              className="rounded-lg px-3 py-2 text-xs font-semibold"
              style={{ background: agent.monitoring.consent === 'opted_in' ? 'rgba(34,197,94,0.16)' : 'var(--surface2)', color: agent.monitoring.consent === 'opted_in' ? 'var(--green)' : 'var(--text)', border: '1px solid var(--border)' }}>
              Opt in
            </button>
            <button onClick={() => updateConsent('opted_out')} disabled={saving || agent.monitoring.consent === 'opted_out'}
              className="rounded-lg px-3 py-2 text-xs font-semibold"
              style={{ background: agent.monitoring.consent === 'opted_out' ? 'rgba(245,158,11,0.15)' : 'var(--surface2)', color: agent.monitoring.consent === 'opted_out' ? 'var(--amber)' : 'var(--text)', border: '1px solid var(--border)' }}>
              Opt out
            </button>
          </>
        )}
      </div>
    </div>
  )
}
