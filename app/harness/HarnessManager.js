'use client'

import ThemedSelect from '../components/ThemedSelect'
import { useEffect, useMemo, useRef, useState } from 'react'
import PageHeader from '../components/PageHeader'
import { Activity, Bot, Cable, Code2, ExternalLink, GitCompare, RefreshCw, Send, ShieldCheck, Terminal, Wrench } from 'lucide-react'

const COMMANDS = ['help', 'status', 'agents', 'tools', 'routes', 'pricing', 'health']

const card = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  borderRadius: 10,
}

const muted = { color: 'var(--text-muted)' }

function normalizeAgents(data) {
  const raw = data?.agents || data?.items || []
  if (Array.isArray(raw)) return raw
  return Object.entries(raw).map(([id, value]) => ({ id, ...(value || {}) }))
}

function StatusPill({ ok, label }) {
  const color = ok ? 'var(--green)' : 'var(--red)'
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-semibold" style={{ background: ok ? 'var(--green-soft)' : 'var(--red-soft)', color }}>
      <span style={{ width: 7, height: 7, borderRadius: 999, background: color, boxShadow: ok ? `0 0 8px ${color}` : 'none' }} />
      {label}
    </span>
  )
}

function MetricCard({ icon, label, value, detail, ok }) {
  return (
    <div className="p-4" style={card}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-bold uppercase tracking-wider" style={muted}>{label}</div>
          <div className="mt-1 text-2xl font-bold truncate" style={{ color: 'var(--text)', fontFamily: "'Outfit', sans-serif" }}>{value}</div>
          {detail && <div className="mt-1 text-xs truncate" style={muted}>{detail}</div>}
        </div>
        <div className="shrink-0 rounded-lg flex items-center justify-center" style={{ width: 38, height: 38, background: 'var(--accent-soft)', color: ok === false ? 'var(--red)' : 'var(--accent)' }}>
          {icon}
        </div>
      </div>
    </div>
  )
}

function RuntimeCard({ runtime, active, onSelect }) {
  const ok = !!runtime?.ok
  const dashboardUrl = ok ? runtime?.dashboardUrl : ''
  const openDashboard = e => {
    e.stopPropagation()
    if (!dashboardUrl) return
    openHarnessDashboard(dashboardUrl)
  }
  return (
    <div
      onClick={onSelect}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect()
        }
      }}
      role="button"
      tabIndex={0}
      aria-pressed={active}
      aria-label={`Select ${runtime?.label || 'Harness'} runtime`}
      className="p-4 text-left transition"
      style={{
        ...card,
        outline: active ? '2px solid var(--accent)' : 'none',
        boxShadow: active ? '0 0 0 4px var(--accent-soft)' : 'none',
        cursor: 'pointer',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-bold" style={{ color: 'var(--text)' }}>{runtime?.label || 'Harness'}</h3>
            <StatusPill ok={ok} label={ok ? 'Online' : 'Check'} />
          </div>
          <div className="mt-1 text-xs font-semibold uppercase" style={muted}>{runtime?.lane || 'Runtime lane'}</div>
        </div>
        <div className="shrink-0 rounded-lg flex items-center justify-center" style={{ width: 34, height: 34, background: ok ? 'var(--green-soft)' : 'var(--red-soft)', color: ok ? 'var(--green)' : 'var(--red)' }}>
          {runtime?.type === 'openclaw' ? <Bot size={17} /> : <Cable size={17} />}
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <div>
          <div className="font-bold uppercase" style={muted}>Provider</div>
          <div className="mt-1 truncate" style={{ color: 'var(--text)' }}>{runtime?.provider || 'Unknown'}</div>
        </div>
        <div>
          <div className="font-bold uppercase" style={muted}>Model</div>
          <div className="mt-1 truncate" style={{ color: 'var(--text)' }}>{runtime?.model || 'Not reported'}</div>
        </div>
        <div>
          <div className="font-bold uppercase" style={muted}>Surface</div>
          <div className="mt-1 truncate" style={{ color: 'var(--text)' }}>{runtime?.privateSurface || 'private'}</div>
        </div>
        <div>
          <div className="font-bold uppercase" style={muted}>Latency</div>
          <div className="mt-1 truncate" style={{ color: 'var(--text)' }}>{runtime?.ms ? `${runtime.ms}ms` : 'n/a'}</div>
        </div>
      </div>
      {!ok && runtime?.error && <div className="mt-3 text-xs" style={{ color: 'var(--red)' }}>{runtime.error}</div>}
      {dashboardUrl ? (
        <button
          type="button"
          onClick={openDashboard}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg px-3 text-xs font-bold"
          style={{ minHeight: 38, background: 'var(--surface2)', color: 'var(--accent)', border: '1px solid var(--border)' }}
        >
          <ExternalLink size={14} /> Open {runtime?.label || 'Harness'} Dashboard
        </button>
      ) : (
        <div className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg px-3 text-xs font-bold" style={{ minHeight: 38, background: 'var(--surface2)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
          {runtime?.type === 'deepseek' ? 'Use Harness Chat or Compare Task below' : 'Dashboard unavailable until runtime is online'}
        </div>
      )}
    </div>
  )
}

function isStandalonePwa() {
  if (typeof window === 'undefined') return false
  return window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator?.standalone === true
}

function openHarnessDashboard(url) {
  if (typeof window === 'undefined' || !url) return
  const callActive = !!window.__fccCallActive
  if (isStandalonePwa() && !callActive) {
    window.location.assign(url)
    return
  }
  const opened = window.open(url, '_blank', 'noopener,noreferrer')
  if (!opened && !callActive) window.location.assign(url)
}

function StepBadge({ number, label, active }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-xs font-bold" style={{ background: active ? 'var(--accent-soft)' : 'var(--surface2)', color: active ? 'var(--accent)' : 'var(--text)', border: '1px solid var(--border)' }}>
      <span className="inline-flex items-center justify-center rounded-full" style={{ width: 20, height: 20, background: active ? 'var(--accent)' : 'var(--surface)', color: active ? 'var(--accent-text)' : 'var(--text-muted)' }}>{number}</span>
      {label}
    </div>
  )
}

function ChatBubble({ message }) {
  const user = message.role === 'user'
  return (
    <div className={`flex ${user ? 'justify-end' : 'justify-start'}`}>
      <div
        className="rounded-lg px-3 py-2 text-sm"
        style={{
          maxWidth: '82%',
          whiteSpace: 'pre-wrap',
          background: user ? 'var(--accent)' : 'var(--surface)',
          color: user ? 'var(--accent-text)' : 'var(--text)',
          border: user ? '1px solid var(--accent)' : '1px solid var(--border)',
        }}
      >
        {message.content || (message.role === 'assistant' ? 'Thinking...' : '')}
      </div>
    </div>
  )
}

export default function HarnessManager() {
  const [status, setStatus] = useState(null)
  const [registry, setRegistry] = useState(null)
  const [apis, setApis] = useState(null)
  const [runtimes, setRuntimes] = useState(null)
  const [selectedRuntimeId, setSelectedRuntimeId] = useState('openclaw-hetzner')
  const [runtimeCheck, setRuntimeCheck] = useState(null)
  const [runtimeCheckBusy, setRuntimeCheckBusy] = useState(false)
  const [runtimeCheckError, setRuntimeCheckError] = useState('')
  const [sessionMode, setSessionMode] = useState('status')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const [selectedAgent, setSelectedAgent] = useState('main')
  const [messages, setMessages] = useState([])
  const [chatInput, setChatInput] = useState('')
  const [chatBusy, setChatBusy] = useState(false)
  const [chatError, setChatError] = useState('')
  const chatRef = useRef(null)

  const [compareTask, setCompareTask] = useState('Sasha, dry-run a 9:16 product reel concept for Farrington Development. Include the intended tool call JSON and the media-library folder.')
  const [compareMode, setCompareMode] = useState('dry-run')
  const [compareOpenClaw, setCompareOpenClaw] = useState(true)
  const [compareHermes, setCompareHermes] = useState(true)
  const [compareDeerFlow, setCompareDeerFlow] = useState(true)
  const [compareDeepSeek, setCompareDeepSeek] = useState(false)
  const [compareBusy, setCompareBusy] = useState(false)
  const [compareResult, setCompareResult] = useState(null)
  const [compareError, setCompareError] = useState('')

  const [actionConfig, setActionConfig] = useState(null)
  const [actionProvider, setActionProvider] = useState('openclaw-hetzner')
  const [actionBusy, setActionBusy] = useState(false)
  const [actionResult, setActionResult] = useState(null)
  const [actionError, setActionError] = useState('')
  const [sampleLead, setSampleLead] = useState('{"businessName":"Farrington Development sample lead","contact":"Owner","website":"","phone":"","address":"City, ST NC","notes":"Test the lead research action contract."}')

  const [terminalInput, setTerminalInput] = useState('status')
  const [terminalBusy, setTerminalBusy] = useState(false)
  const [terminalLog, setTerminalLog] = useState([
    { command: 'help', output: 'Harness ready. Run help, status, agents, tools, routes, pricing, or health.' },
  ])
  const terminalRef = useRef(null)

  const agents = useMemo(() => normalizeAgents(registry), [registry])
  const openclawOk = !!(status?.openclaw?.ok || registry?.ok)
  const tools = apis?.openclawTools || []
  const routes = apis?.crmRoutes || []
  const selected = agents.find(a => a.id === selectedAgent) || agents[0] || null
  const runtimeList = runtimes?.runtimes?.length ? runtimes.runtimes : [
    { id: 'openclaw-hetzner', label: 'OpenClaw', lane: 'Hetzner production', type: 'openclaw', ok: openclawOk, privateSurface: 'loopback', provider: 'runtime config', model: selected?.brain?.modelId || '', dashboardUrl: '/api/harness/dashboard/openclaw-hetzner/' },
    { id: 'hermes-hetzner', label: 'Hermes', lane: 'Hetzner sidecar', type: 'hermes', ok: false, privateSurface: 'loopback', dashboardUrl: '' },
    { id: 'deerflow-hetzner', label: 'DeerFlow', lane: 'Hetzner sidecar', type: 'deerflow', ok: false, privateSurface: 'loopback', provider: 'not configured', dashboardUrl: '' },
    { id: 'deepseek-harness', label: 'DeepSeek Harness', lane: 'Hetzner isolated sidecar', type: 'deepseek', ok: false, privateSurface: 'loopback', provider: 'DeepSeek official', model: 'deepseek-v4-flash', dashboardUrl: '' },
  ]
  const selectedRuntime = runtimeList.find(r => r.id === selectedRuntimeId) || runtimeList[0]
  const selectedRuntimeReady = !!selectedRuntime?.ok
  const deepSeekSelected = selectedRuntime?.type === 'deepseek'
  const chatAgentId = deepSeekSelected ? 'deepseek-lab-operator' : (selectedAgent || 'main')
  const chatRuntimeLabel = deepSeekSelected ? 'DeepSeek Harness' : 'OpenClaw'

  const load = async () => {
    setRefreshing(true)
    try {
      const [s, a, api, rt, action] = await Promise.all([
        fetch('/api/network/status', { cache: 'no-store' }).then(r => r.json()).catch(e => ({ error: e.message })),
        fetch('/api/openclaw/agents', { cache: 'no-store' }).then(r => r.json()).catch(e => ({ ok: false, error: e.message, agents: [] })),
        fetch('/api/network/apis', { cache: 'no-store' }).then(r => r.json()).catch(e => ({ ok: false, error: e.message })),
        fetch('/api/harness/runtimes', { cache: 'no-store' }).then(r => r.json()).catch(e => ({ ok: false, error: e.message, runtimes: [] })),
        fetch('/api/harness/actions/lead-research', { cache: 'no-store' }).then(r => r.json()).catch(e => ({ ok: false, error: e.message })),
      ])
      setStatus(s)
      setRegistry(a)
      setApis(api)
      setRuntimes(rt)
      setActionConfig(action)
      if (action?.settings?.leadResearchProvider) setActionProvider(action.settings.leadResearchProvider)
      const nextList = rt?.runtimes || []
      if (nextList.length && !nextList.some(runtime => runtime.id === selectedRuntimeId)) setSelectedRuntimeId(nextList[0].id)
      const list = normalizeAgents(a)
      if (list.length && !list.some(agent => agent.id === selectedAgent)) setSelectedAgent(list[0].id)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const runSelectedRuntimeCheck = async () => {
    if (!selectedRuntime?.id || runtimeCheckBusy) return
    setRuntimeCheckBusy(true)
    setRuntimeCheckError('')
    try {
      const res = await fetch('/api/harness/runtimes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'check', runtimeId: selectedRuntime.id }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setRuntimeCheck(data)
    } catch (e) {
      setRuntimeCheckError(e.message)
    } finally {
      setRuntimeCheckBusy(false)
    }
  }

  const saveLeadResearchProvider = async () => {
    if (actionBusy) return
    setActionBusy(true)
    setActionError('')
    setActionResult(null)
    try {
      const res = await fetch('/api/harness/actions/lead-research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_provider', provider: actionProvider }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setActionConfig(prev => ({ ...(prev || {}), settings: data.settings }))
      setActionResult({ ok: true, provider: data.settings?.leadResearchProvider, message: 'Lead Research provider switch saved.' })
    } catch (e) {
      setActionError(e.message)
    } finally {
      setActionBusy(false)
    }
  }

  const runLeadResearchAction = async () => {
    if (actionBusy) return
    setActionBusy(true)
    setActionError('')
    setActionResult(null)
    try {
      let lead
      try { lead = JSON.parse(sampleLead) } catch { throw new Error('Sample lead must be valid JSON.') }
      const res = await fetch('/api/harness/actions/lead-research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'run', provider: actionProvider, lead, save: false }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setActionResult(data)
    } catch (e) {
      setActionError(e.message)
    } finally {
      setActionBusy(false)
    }
  }

  useEffect(() => { load() }, [])
  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight
  }, [messages, chatBusy])
  useEffect(() => {
    if (terminalRef.current) terminalRef.current.scrollTop = terminalRef.current.scrollHeight
  }, [terminalLog, terminalBusy])

  const sendChat = async () => {
    const text = chatInput.trim()
    if (!text || chatBusy) return
    const next = [...messages, { role: 'user', content: text }]
    setMessages([...next, { role: 'assistant', content: '' }])
    setChatInput('')
    setChatBusy(true)
    setChatError('')
    try {
      const res = await fetch('/api/agent/openclaw-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: next,
          sessionKey: `agent:${chatAgentId}:harness`,
          section: 'harness',
          operatorTool: deepSeekSelected ? {
            runtimeProvider: 'deepseek-harness-local',
            agentId: 'deepseek-lab-operator',
            label: 'Dax',
            role: 'DeepSeek Harness Lab Operator',
            jobDescription: 'Run isolated conversation-only DeepSeek Harness experiments.',
            tools: [],
          } : undefined,
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      let streamError = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const blocks = buf.split('\n\n')
        buf = blocks.pop() || ''
        for (const block of blocks) {
          const line = block.split('\n').find(l => l.startsWith('data: '))
          if (!line) continue
          try {
            const data = JSON.parse(line.slice(6))
            if (data.error) streamError = data.error
            if (typeof data.text === 'string') setMessages([...next, { role: 'assistant', content: data.text }])
          } catch {}
        }
      }
      if (streamError) throw new Error(streamError)
    } catch (e) {
      setChatError(e.message)
      setMessages(next)
    } finally {
      setChatBusy(false)
    }
  }

  const runCompare = async () => {
    const task = compareTask.trim()
    if (!task || compareBusy) return
    const harnesses = [
      compareOpenClaw ? 'openclaw-hetzner' : '',
      compareHermes ? 'hermes-hetzner' : '',
      compareDeerFlow ? 'deerflow-hetzner' : '',
      compareDeepSeek ? 'deepseek-harness' : '',
    ].filter(Boolean)
    if (!harnesses.length) {
      setCompareError('Pick at least one harness.')
      return
    }
    setCompareBusy(true)
    setCompareError('')
    setCompareResult(null)
    try {
      const res = await fetch('/api/harness/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: selectedAgent || 'main',
          task,
          mode: compareMode,
          harnesses,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setCompareResult(data)
    } catch (e) {
      setCompareError(e.message)
    } finally {
      setCompareBusy(false)
    }
  }

  const runCommand = async (cmd = terminalInput) => {
    const command = String(cmd || '').trim() || 'help'
    setTerminalBusy(true)
    setTerminalInput(command)
    try {
      const r = await fetch('/api/harness/terminal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command }),
      }).then(r => r.json())
      setTerminalLog(log => [...log, {
        command,
        output: r.ok ? r.output : `Error: ${r.error || 'Command failed'}`,
      }].slice(-12))
    } catch (e) {
      setTerminalLog(log => [...log, { command, output: `Network error: ${e.message}` }].slice(-12))
    } finally {
      setTerminalBusy(false)
    }
  }

  const onChatKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat() }
  }

  const onTerminalKey = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); runCommand() }
  }

  if (loading) {
    return (
      <div className="harness-workspace command-workspace lab-mobile-dense p-6">
        <PageHeader icon={<Cable size={20} />} title="Harness" subtitle="Loading runtime checks..." />
      </div>
    )
  }

  return (
    <div className="harness-workspace command-workspace lab-mobile-dense p-6">
      <PageHeader
        icon={<Cable size={20} />}
        title="Harness"
        subtitle="Runtime, route, tool, and private gateway checks."
        actions={
          <button
            onClick={load}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-lg px-4 text-sm font-semibold disabled:opacity-60"
            style={{ minHeight: 44, background: 'var(--accent)', color: 'var(--accent-text)' }}
          >
            <RefreshCw size={16} /> {refreshing ? 'Refreshing' : 'Refresh'}
          </button>
        }
      />

      <div className="lab-summary-grid grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
        <MetricCard icon={<Activity size={20} />} label="OpenClaw" value={openclawOk ? 'Online' : 'Check'} detail={status?.openclaw?.ms ? `${status.openclaw.ms}ms bridge check` : registry?.error || 'Local gateway 127.0.0.1:18789'} ok={openclawOk} />
        <MetricCard icon={<Bot size={20} />} label="Agents" value={agents.length} detail={selected ? `Selected: ${selected.name || selected.id}` : 'No agents loaded'} />
        <MetricCard icon={<Wrench size={20} />} label="Tools" value={tools.length || 'Scan'} detail="FCC and OpenClaw registered tools" />
        <MetricCard icon={<Code2 size={20} />} label="Routes" value={routes.length || 'Scan'} detail="CRM API surface" />
      </div>

      <section className="mb-5 overflow-hidden" style={card}>
        <div className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2 min-w-0">
            <GitCompare size={18} style={{ color: 'var(--accent)' }} />
            <div>
              <h2 className="text-sm font-bold" style={{ color: 'var(--text)' }}>Harness Lab</h2>
              <p className="text-xs" style={muted}>Command Center orchestrates private Hetzner runtimes without opening harness ports.</p>
            </div>
          </div>
          <div className="text-xs font-semibold" style={muted}>
            {runtimes?.fetchedAt ? `Checked ${new Date(runtimes.fetchedAt).toLocaleTimeString()}` : 'Waiting for runtime scan'}
          </div>
        </div>
        <div className="p-4 space-y-4">
          <div className="flex flex-wrap gap-2">
            <StepBadge number="1" label="Select harness" active />
            <StepBadge number="2" label="Review configuration" active={!!selectedRuntime} />
            <StepBadge number="3" label="Check / launch" active={selectedRuntimeReady} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {runtimeList.map(runtime => (
              <RuntimeCard
                key={runtime.id}
                runtime={runtime}
                active={runtime.id === selectedRuntime?.id}
                onSelect={() => {
                  setSelectedRuntimeId(runtime.id)
                  if (runtime.type === 'deepseek') setSelectedAgent('deepseek-lab-operator')
                }}
              />
            ))}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_auto] gap-3 items-stretch">
            <div className="p-4" style={{ ...card, background: 'var(--surface2)' }}>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <h3 className="text-sm font-bold" style={{ color: 'var(--text)' }}>{selectedRuntime?.label || 'Harness'} Configuration</h3>
                  <p className="text-xs" style={muted}>{selectedRuntime?.lane || 'Hetzner runtime'} is selected for the next runtime health check.</p>
                </div>
                <StatusPill ok={selectedRuntimeReady} label={selectedRuntimeReady ? 'Online' : 'Check'} />
              </div>
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 text-sm">
                <label>
                  <div className="text-xs font-bold uppercase" style={muted}>Mode</div>
                  <ThemedSelect
                    value={sessionMode}
                    onChange={e => setSessionMode(e.target.value)}
                    className="mt-1 w-full rounded-lg px-3 text-sm"
                    style={{ minHeight: 40, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
                  >
                    <option value="status">Runtime health check</option>
                    <option value="chat" disabled={!['openclaw', 'deepseek'].includes(selectedRuntime?.type)}>Harness chat test</option>
                    <option value="config">Config review</option>
                  </ThemedSelect>
                </label>
                <label>
                  <div className="text-xs font-bold uppercase" style={muted}>{deepSeekSelected ? 'DeepSeek Operator' : 'OpenClaw Agent / Session'}</div>
                  <ThemedSelect
                    value={chatAgentId}
                    onChange={e => setSelectedAgent(e.target.value)}
                    disabled={!['openclaw', 'deepseek'].includes(selectedRuntime?.type) || deepSeekSelected}
                    className="mt-1 w-full rounded-lg px-3 text-sm disabled:opacity-60"
                    style={{ minHeight: 40, background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}
                  >
                    {(deepSeekSelected ? [{ id: 'deepseek-lab-operator', name: 'Dax' }] : (agents.length ? agents : [{ id: 'main', name: 'Main' }])).map(agent => (
                      <option key={agent.id} value={agent.id}>{agent.name || agent.id}</option>
                    ))}
                  </ThemedSelect>
                </label>
                <div><div className="text-xs font-bold uppercase" style={muted}>Provider</div><div className="mt-2 truncate" style={{ color: 'var(--text)' }}>{selectedRuntime?.provider || 'Unknown'}</div></div>
                <div><div className="text-xs font-bold uppercase" style={muted}>Model</div><div className="mt-2 truncate" style={{ color: 'var(--text)' }}>{selectedRuntime?.model || 'Not reported'}</div></div>
              </div>
              <div className="mt-4 rounded-lg p-3 text-xs" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <div><span style={muted}>Boundary:</span> {selectedRuntime?.privateSurface || 'private'}</div>
                  <div><span style={muted}>Runtime ID:</span> {selectedRuntime?.id || 'unknown'}</div>
                  <div><span style={muted}>Session key:</span> {['openclaw', 'deepseek'].includes(selectedRuntime?.type) ? `agent:${chatAgentId}:harness` : `${selectedRuntime?.label || 'Harness'} gateway session`}</div>
                </div>
                {runtimeCheck?.runtimeId === selectedRuntime?.id && (
                  <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
                    <div className="font-bold" style={{ color: runtimeCheck.runtime?.ok ? 'var(--green)' : 'var(--red)' }}>
                      Last runtime check: {runtimeCheck.runtime?.ok ? 'Online' : 'Failed'} {runtimeCheck.runtime?.ms ? `in ${runtimeCheck.runtime.ms}ms` : ''}
                    </div>
                    <div className="mt-1" style={muted}>Checked {new Date(runtimeCheck.checkedAt).toLocaleTimeString()}</div>
                    {runtimeCheck.runtime?.error && <div className="mt-1" style={{ color: 'var(--red)' }}>{runtimeCheck.runtime.error}</div>}
                  </div>
                )}
                {runtimeCheckError && <div className="mt-2" style={{ color: 'var(--red)' }}>{runtimeCheckError}</div>}
              </div>
            </div>
            <div className="p-4 flex flex-col justify-center gap-2" style={{ ...card, minWidth: 240 }}>
              <button
                onClick={load}
                disabled={refreshing}
                className="inline-flex items-center justify-center gap-2 rounded-lg px-4 text-sm font-bold disabled:opacity-60"
                style={{ minHeight: 42, background: 'var(--accent)', color: 'var(--accent-text)' }}
              >
                <RefreshCw size={16} /> Refresh Status
              </button>
              {selectedRuntimeReady && selectedRuntime?.dashboardUrl && (
                <button
                  type="button"
                  onClick={() => openHarnessDashboard(selectedRuntime.dashboardUrl)}
                  className="inline-flex items-center justify-center gap-2 rounded-lg px-4 text-sm font-bold"
                  style={{ minHeight: 42, background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}
                >
                  <ExternalLink size={16} /> Open Dashboard
                </button>
              )}
              <button
                onClick={runSelectedRuntimeCheck}
                disabled={runtimeCheckBusy}
                className="inline-flex items-center justify-center gap-2 rounded-lg px-4 text-sm font-bold disabled:opacity-60"
                style={{ minHeight: 42, background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}
              >
                <Terminal size={16} /> {runtimeCheckBusy ? 'Checking' : 'Check Selected Runtime'}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="overflow-hidden" style={card}>
        <div className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2 min-w-0">
            <ShieldCheck size={18} style={{ color: 'var(--accent)' }} />
            <div>
              <h2 className="text-sm font-bold" style={{ color: 'var(--text)' }}>Deployable Action: Lead Research</h2>
              <p className="text-xs" style={muted}>One CRM action contract with a switchable runtime provider.</p>
            </div>
          </div>
          <StatusPill ok={!!actionConfig?.ok} label={actionBusy ? 'Running' : actionConfig?.ok ? 'Contract Ready' : 'Check'} />
        </div>
        <div className="p-4 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-4">
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label>
                <div className="text-xs font-bold uppercase" style={muted}>Active Provider</div>
                <ThemedSelect
                  value={actionProvider}
                  onChange={e => setActionProvider(e.target.value)}
                  className="mt-1 w-full rounded-lg px-3 text-sm"
                  style={{ minHeight: 40, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}
                >
                  <option value="auto">Auto</option>
                  <option value="openclaw-hetzner">OpenClaw</option>
                  <option value="hermes-hetzner">Hermes</option>
                  <option value="deerflow-hetzner">DeerFlow</option>
                </ThemedSelect>
              </label>
              <div>
                <div className="text-xs font-bold uppercase" style={muted}>Provider Readiness</div>
                <div className="mt-1 flex flex-wrap gap-2">
                  {(actionConfig?.providers || []).map(provider => (
                    <span key={provider.id} className="inline-flex items-center gap-2 rounded-lg px-3 text-xs font-semibold" style={{ minHeight: 40, background: 'var(--surface2)', border: '1px solid var(--border)', color: provider.liveCapable ? 'var(--green)' : 'var(--text-muted)' }}>
                      <span style={{ width: 7, height: 7, borderRadius: 999, background: provider.liveCapable ? 'var(--green)' : 'var(--text-muted)' }} />
                      {provider.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <label className="block">
              <div className="text-xs font-bold uppercase" style={muted}>Sample Lead JSON</div>
              <textarea
                value={sampleLead}
                onChange={e => setSampleLead(e.target.value)}
                className="mt-1 w-full rounded-lg px-3 py-2 text-sm font-mono"
                rows={5}
                style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', resize: 'vertical', minHeight: 120 }}
              />
            </label>
          </div>
          <div className="flex flex-col gap-3">
            <div className="rounded-lg p-3 text-xs" style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}>
              <div><span style={muted}>Live button route:</span> /api/harness/actions/lead-research</div>
              <div className="mt-1"><span style={muted}>Outputs:</span> summary, phone, website, address, objections, next steps.</div>
              <div className="mt-1"><span style={muted}>Saved switch:</span> {actionConfig?.settings?.leadResearchProvider || 'openclaw-hetzner'}</div>
            </div>
            <button
              type="button"
              onClick={saveLeadResearchProvider}
              disabled={actionBusy}
              className="inline-flex items-center justify-center gap-2 rounded-lg px-4 text-sm font-bold disabled:opacity-60"
              style={{ minHeight: 42, background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}
            >
              <ShieldCheck size={16} /> Save Provider Switch
            </button>
            <button
              type="button"
              onClick={runLeadResearchAction}
              disabled={actionBusy}
              className="inline-flex items-center justify-center gap-2 rounded-lg px-4 text-sm font-bold disabled:opacity-60"
              style={{ minHeight: 44, background: 'var(--accent)', color: 'var(--accent-text)' }}
            >
              <GitCompare size={16} /> {actionBusy ? 'Running Action' : 'Test Lead Research Action'}
            </button>
          </div>
        </div>
        {actionError && <div className="mx-4 mb-4 rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--red-soft)', color: 'var(--red)' }}>{actionError}</div>}
        {actionResult && (
          <div className="px-4 pb-4">
            <pre className="rounded-lg p-3 whitespace-pre-wrap text-sm" style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', maxHeight: 300, overflow: 'auto' }}>
              {JSON.stringify(actionResult.contract || actionResult, null, 2)}
            </pre>
          </div>
        )}
      </section>

      <section className="overflow-hidden" style={card}>
        <div className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2 min-w-0">
            <GitCompare size={18} style={{ color: 'var(--accent)' }} />
            <div>
              <h2 className="text-sm font-bold" style={{ color: 'var(--text)' }}>Compare Agent Task</h2>
              <p className="text-xs" style={muted}>Run the same injected CRM agent prompt and task through selected harnesses.</p>
            </div>
          </div>
          <StatusPill ok={compareResult?.results?.some(r => r.ok)} label={compareBusy ? 'Running' : compareResult ? 'Compared' : 'Ready'} />
        </div>
        <div className="p-4 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px] gap-4">
          <div className="space-y-3">
            <label className="block">
              <div className="text-xs font-bold uppercase" style={muted}>Task</div>
              <textarea
                value={compareTask}
                onChange={e => setCompareTask(e.target.value)}
                className="mt-1 w-full rounded-lg px-3 py-2 text-sm"
                rows={4}
                style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', resize: 'vertical', minHeight: 104 }}
                placeholder="Give Sasha, Maggie, Craig, or another agent a task to compare across harnesses."
              />
            </label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <label>
                <div className="text-xs font-bold uppercase" style={muted}>Agent</div>
                <ThemedSelect
                  value={selectedAgent}
                  onChange={e => setSelectedAgent(e.target.value)}
                  className="mt-1 w-full rounded-lg px-3 text-sm"
                  style={{ minHeight: 40, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}
                >
                  {(agents.length ? agents : [{ id: 'main', name: 'Main' }]).map(agent => (
                    <option key={agent.id} value={agent.id}>{agent.name || agent.id}</option>
                  ))}
                </ThemedSelect>
              </label>
              <label>
                <div className="text-xs font-bold uppercase" style={muted}>Mode</div>
                <ThemedSelect
                  value={compareMode}
                  onChange={e => setCompareMode(e.target.value)}
                  className="mt-1 w-full rounded-lg px-3 text-sm"
                  style={{ minHeight: 40, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}
                >
                  <option value="dry-run">Dry compare</option>
                  <option value="approved-live">Approved live action</option>
                </ThemedSelect>
              </label>
              <div>
                <div className="text-xs font-bold uppercase" style={muted}>Harnesses</div>
                <div className="mt-1 flex flex-wrap gap-2">
                  <label className="inline-flex items-center gap-2 rounded-lg px-3 text-sm" style={{ minHeight: 40, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                    <input type="checkbox" checked={compareOpenClaw} onChange={e => setCompareOpenClaw(e.target.checked)} />
                    OpenClaw
                  </label>
                  <label className="inline-flex items-center gap-2 rounded-lg px-3 text-sm" style={{ minHeight: 40, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                    <input type="checkbox" checked={compareHermes} onChange={e => setCompareHermes(e.target.checked)} />
                    Hermes
                  </label>
                  <label className="inline-flex items-center gap-2 rounded-lg px-3 text-sm" style={{ minHeight: 40, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                    <input type="checkbox" checked={compareDeerFlow} onChange={e => setCompareDeerFlow(e.target.checked)} />
                    DeerFlow
                  </label>
                  <label className="inline-flex items-center gap-2 rounded-lg px-3 text-sm" style={{ minHeight: 40, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}>
                    <input type="checkbox" checked={compareDeepSeek} onChange={e => setCompareDeepSeek(e.target.checked)} />
                    DeepSeek
                  </label>
                </div>
              </div>
            </div>
          </div>
          <div className="flex flex-col justify-between gap-3">
            <div className="rounded-lg p-3 text-xs" style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}>
              <div><span style={muted}>Dry compare:</span> no paid/external/destructive tools.</div>
              <div className="mt-1"><span style={muted}>Live mode:</span> only for tasks Carl explicitly approved.</div>
              <div className="mt-1"><span style={muted}>Hermes:</span> needs API Server for real task output.</div>
              <div className="mt-1"><span style={muted}>DeepSeek:</span> isolated, owner-only, conversation-only comparison.</div>
            </div>
            <button
              type="button"
              onClick={runCompare}
              disabled={compareBusy || !compareTask.trim()}
              className="inline-flex items-center justify-center gap-2 rounded-lg px-4 text-sm font-bold disabled:opacity-60"
              style={{ minHeight: 44, background: 'var(--accent)', color: 'var(--accent-text)' }}
            >
              <GitCompare size={16} /> {compareBusy ? 'Running Compare' : 'Run Compare'}
            </button>
          </div>
        </div>
        {compareError && <div className="mx-4 mb-4 rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--red-soft)', color: 'var(--red)' }}>{compareError}</div>}
        {compareResult && (
          <div className="px-4 pb-4">
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {(compareResult.results || []).map(result => (
                <div key={result.id} className="rounded-lg p-4" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-bold" style={{ color: 'var(--text)' }}>{result.label || result.id}</h3>
                      <p className="text-xs" style={muted}>
                        {result.ok ? `Output in ${result.ms || 0}ms` : result.setup || result.error || 'No output'}
                      </p>
                    </div>
                    <StatusPill ok={result.ok} label={result.ok ? 'Output' : 'Pending'} />
                  </div>
                  {result.runId && <div className="mt-2 text-xs" style={muted}>Run ID: {result.runId}</div>}
                  <pre className="mt-3 whitespace-pre-wrap text-sm" style={{ color: 'var(--text)', fontFamily: 'inherit', maxHeight: 360, overflow: 'auto' }}>
                    {result.output || result.error || result.setup || 'No response yet.'}
                  </pre>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)] gap-5">
        <section className="overflow-hidden" style={card}>
          <div className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap" style={{ borderBottom: '1px solid var(--border)' }}>
            <div className="flex items-center gap-2 min-w-0">
              <Bot size={18} style={{ color: 'var(--accent)' }} />
              <div>
                <h2 className="text-sm font-bold" style={{ color: 'var(--text)' }}>Harness Chat</h2>
                <p className="text-xs" style={muted}>{deepSeekSelected ? 'Talk directly to Dax through the isolated DeepSeek Harness sidecar.' : 'OpenClaw chat output appears here. Select DeepSeek Harness above to test Dax directly.'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <StatusPill ok={deepSeekSelected ? selectedRuntimeReady : openclawOk} label={(deepSeekSelected ? selectedRuntimeReady : openclawOk) ? 'Ready' : 'Check'} />
              <ThemedSelect
                value={chatAgentId}
                onChange={e => setSelectedAgent(e.target.value)}
                disabled={deepSeekSelected}
                className="rounded-lg px-3 text-sm"
                style={{ minHeight: 40, maxWidth: 240, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}
              >
                {(deepSeekSelected ? [{ id: 'deepseek-lab-operator', name: 'Dax' }] : (agents.length ? agents : [{ id: 'main', name: 'Main' }])).map(agent => (
                  <option key={agent.id} value={agent.id}>{agent.name || agent.id}</option>
                ))}
              </ThemedSelect>
            </div>
          </div>

          <div ref={chatRef} className="p-4 space-y-3 overflow-auto" style={{ minHeight: 420, maxHeight: 560, background: 'var(--surface2)' }}>
            {messages.length === 0 && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {(deepSeekSelected ? [
                  'Explain the DeepSeek Harness safety boundary.',
                  'Reply with exactly: DEEPSEEK_HARNESS_OK',
                  'Compare two approaches to a Command Center task without using tools.',
                ] : [
                  'List your available tools.',
                  'Explain how an OpenClaw agent calls Command Center tools.',
                  'Check what Maggie can do inside the Command Center.',
                ]).map(prompt => (
                  <button
                    key={prompt}
                    onClick={() => setChatInput(prompt)}
                    className="text-left rounded-lg p-3 text-sm"
                    style={{ ...card, color: 'var(--text)', minHeight: 78 }}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            )}
            {messages.map((m, i) => <ChatBubble key={i} message={m} />)}
            {chatBusy && <div className="text-xs" style={muted}>Streaming from {chatRuntimeLabel}...</div>}
          </div>

          {chatError && <div className="mx-4 mt-3 rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--red-soft)', color: 'var(--red)' }}>{chatError}</div>}
          <div className="p-4 flex gap-2 items-end" style={{ borderTop: '1px solid var(--border)' }}>
            <textarea
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={onChatKey}
              rows={2}
              placeholder={`Message ${deepSeekSelected ? 'Dax in DeepSeek Harness' : 'the selected OpenClaw agent'}...`}
              className="flex-1 rounded-lg px-3 py-2 text-sm"
              style={{ minHeight: 56, resize: 'vertical', background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', outline: 'none' }}
              disabled={chatBusy}
            />
            <button
              onClick={sendChat}
              disabled={chatBusy || !chatInput.trim()}
              className="inline-flex items-center justify-center rounded-lg disabled:opacity-50"
              style={{ width: 56, height: 56, background: 'var(--accent)', color: 'var(--accent-text)' }}
              aria-label="Send chat message"
              title="Send"
            >
              <Send size={19} />
            </button>
          </div>
        </section>

        <aside className="space-y-5">
          <section className="overflow-hidden" style={card}>
            <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: '1px solid var(--border)' }}>
              <ShieldCheck size={18} style={{ color: 'var(--green)' }} />
              <div>
                <h2 className="text-sm font-bold" style={{ color: 'var(--text)' }}>Runtime Snapshot</h2>
                <p className="text-xs" style={muted}>Runtime checker state without secrets; not an agent response transcript.</p>
              </div>
            </div>
            <div className="p-4 space-y-3 text-sm">
              <div className="flex justify-between gap-3"><span style={muted}>Selected</span><code style={{ color: 'var(--text)' }}>{selectedRuntime?.id || 'openclaw-hetzner'}</code></div>
              <div className="flex justify-between gap-3"><span style={muted}>Session</span><code style={{ color: 'var(--text)' }}>{`agent:${chatAgentId}:harness`}</code></div>
              <div className="flex justify-between gap-3"><span style={muted}>Providers</span><span style={{ color: 'var(--text)' }}>{registry?.availableProviders?.length || 0}</span></div>
              <div className="flex justify-between gap-3"><span style={muted}>Models</span><span style={{ color: 'var(--text)' }}>{registry?.modelCatalog?.length || 0}</span></div>
            </div>
          </section>

          <section className="overflow-hidden" style={card}>
            <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: '1px solid var(--border)' }}>
              <Terminal size={18} style={{ color: 'var(--accent)' }} />
              <div>
                <h2 className="text-sm font-bold" style={{ color: 'var(--text)' }}>Diagnostics</h2>
                <p className="text-xs" style={muted}>Approved commands only.</p>
              </div>
            </div>
            <div className="p-3 flex flex-wrap gap-2">
              {COMMANDS.map(cmd => (
                <button
                  key={cmd}
                  onClick={() => runCommand(cmd)}
                  className="rounded-md px-2.5 py-1.5 text-xs font-semibold"
                  style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}
                >
                  {cmd}
                </button>
              ))}
            </div>
            <div ref={terminalRef} className="mx-3 rounded-lg overflow-auto" style={{ minHeight: 260, maxHeight: 360, background: '#090d14', color: '#d6e2ff', border: '1px solid rgba(148,163,184,0.28)' }}>
              <div className="p-3 font-mono text-xs leading-relaxed">
                {terminalLog.map((entry, i) => (
                  <div key={i} className="mb-4">
                    <div style={{ color: '#7dd3fc' }}>fcc:harness$ {entry.command}</div>
                    <pre style={{ whiteSpace: 'pre-wrap', margin: '4px 0 0', color: '#d6e2ff', fontFamily: 'inherit' }}>{entry.output}</pre>
                  </div>
                ))}
                {terminalBusy && <div style={{ color: '#facc15' }}>running...</div>}
              </div>
            </div>
            <div className="p-3 flex gap-2">
              <input
                value={terminalInput}
                onChange={e => setTerminalInput(e.target.value)}
                onKeyDown={onTerminalKey}
                className="flex-1 rounded-lg px-3 text-sm font-mono"
                style={{ minHeight: 44, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', outline: 'none' }}
                placeholder="status"
              />
              <button
                onClick={() => runCommand()}
                disabled={terminalBusy}
                className="rounded-lg px-4 text-sm font-bold disabled:opacity-60"
                style={{ minHeight: 44, background: 'var(--accent)', color: 'var(--accent-text)' }}
              >
                Run
              </button>
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}
