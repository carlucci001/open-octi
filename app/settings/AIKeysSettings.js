'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'

/**
 * Provider directory: how each AI provider is matched to a vault credential
 * (case-insensitive includes — same logic /api/credentials/test uses), what
 * it powers, and which env var name backs it.
 */
const PROVIDERS = [
  { id: 'anthropic',  name: 'Anthropic',     emoji: '🟧', match: 'anthropic',  envKey: 'ANTHROPIC_API_KEY',  use: 'Claude — main reasoning, document drafting, agent chat' },
  { id: 'openai',     name: 'OpenAI',        emoji: '🟢', match: 'openai',     envKey: 'OPENAI_API_KEY',     use: 'GPT models, image generation, embeddings, voice realtime' },
  { id: 'elevenlabs', name: 'ElevenLabs',    emoji: '🔊', match: 'elevenlabs', envKey: 'ELEVENLABS_API_KEY', use: 'Voice synthesis (Matilda, Lucci, agent voices)' },
  { id: 'gemini',     name: 'Google Gemini', emoji: '🟦', match: 'gemini',     envKey: 'GOOGLE_API_KEY',     use: 'Multimodal tasks, long-context analysis, alternate reasoning' },
  { id: 'kimi',       name: 'Kimi',          emoji: 'K2', match: 'kimi',       envKey: 'KIMI_API_KEY',       use: 'Kimi K2.6 long-context coding, agent, and multimodal model tests' },
  { id: 'perplexity', name: 'Perplexity',    emoji: '🔍', match: 'perplexity', envKey: 'PERPLEXITY_API_KEY', use: 'Live web research and lead enrichment' },
  { id: 'deepseek',   name: 'DeepSeek',      emoji: '🔷', match: 'deepseek',   envKey: 'DEEPSEEK_API_KEY',   use: 'Budget LLM — OpenClaw fallback, high-volume tasks' },
  { id: 'openrouter', name: 'OpenRouter',    emoji: '🟪', match: 'openrouter', envKey: 'OPENROUTER_API_KEY', use: 'Model routing layer & multi-provider fallback' },
  { id: 'nvidia',     name: 'NVIDIA NIM',    emoji: '🟢', match: 'nvidia',     envKey: 'NVIDIA_API_KEY',     use: 'Llama / Nemotron-class hosted models' },
]

export default function AIKeysSettings() {
  const [creds, setCreds] = useState([])
  const [agents, setAgents] = useState([])
  const [loading, setLoading] = useState(true)
  const [testing, setTesting] = useState({})
  const [usage, setUsage] = useState({})
  const [usageLoading, setUsageLoading] = useState(false)
  const [toast, setToast] = useState(null)

  const flash = (msg, kind = 'ok') => { setToast({ msg, kind }); setTimeout(() => setToast(null), 4000) }

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      const [cr, ag] = await Promise.all([
        fetch('/api/credentials', { cache: 'no-store' }).then(r => r.json()).catch(() => null),
        fetch('/api/openclaw/agents', { cache: 'no-store' }).then(r => r.json()).catch(() => null),
      ])
      setCreds(cr?.credentials || [])
      setAgents(ag?.agents || [])
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { reload() }, [reload])

  const loadUsage = async () => {
    setUsageLoading(true)
    try {
      const r = await fetch('/api/credentials/usage', { cache: 'no-store' }).then(r => r.json()).catch(() => null)
      const map = {}
      for (const item of (r?.results || [])) {
        const key = (item.provider || item.name || '').toLowerCase()
        map[key] = item
      }
      setUsage(map)
    } finally { setUsageLoading(false) }
  }

  const testProvider = async (credId) => {
    if (!credId) return
    setTesting(t => ({ ...t, [credId]: true }))
    try {
      const r = await fetch('/api/credentials/test', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: credId }),
      }).then(r => r.json())
      const ok = r.ok === true
      const fail = r.ok === false
      flash(ok ? `✓ ${r.message || 'Working'}` : fail ? `✗ ${r.message || 'Failed'}` : (r.message || 'No automated test for this provider'), fail ? 'err' : 'ok')
      await reload()
    } catch (e) { flash(`Test failed: ${e.message}`, 'err') }
    finally { setTesting(t => ({ ...t, [credId]: false })) }
  }

  const providerData = useMemo(() => {
    return PROVIDERS.map(p => {
      const cred = creds.find(c => (c.name || '').toLowerCase().includes(p.match))
      const usingAgents = agents.filter(a => {
        const modelId = a.brain?.modelId || ''
        return modelId.toLowerCase().startsWith(p.id + '/')
      })
      const u = usage[p.id] || usage[p.match] || null
      return { ...p, cred, agents: usingAgents, usage: u }
    })
  }, [creds, agents, usage])

  const stats = useMemo(() => {
    const total = providerData.length
    const ready = providerData.filter(p => p.cred).length
    const missing = total - ready
    const failing = providerData.filter(p => p.cred?.lastTest?.ok === false).length
    return { total, ready, missing, failing }
  }, [providerData])

  if (loading) return <div style={{ padding: 32, color: 'var(--text-muted)' }}>Loading providers…</div>

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 18, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 280 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>AI Provider Health</div>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.5 }}>
            One card per provider — key status, last test, agents that depend on it, and recent spend where the provider exposes it.
          </div>
          <div style={{ display: 'flex', gap: 14, marginTop: 10, fontSize: 13, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
            <span>✓ <strong style={{ color: '#10b981' }}>{stats.ready}</strong> ready</span>
            <span>✗ <strong style={{ color: stats.missing ? '#f59e0b' : 'var(--text-muted)' }}>{stats.missing}</strong> missing</span>
            <span>⚠️ <strong style={{ color: stats.failing ? '#ef4444' : 'var(--text-muted)' }}>{stats.failing}</strong> failing</span>
            <span>🤖 <strong>{agents.length}</strong> agents</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={reload} style={btn('ghost')}>↻ Refresh</button>
          <button onClick={loadUsage} disabled={usageLoading} style={btn('secondary')}>{usageLoading ? 'Loading…' : '$ Load spend'}</button>
        </div>
      </div>

      {toast && (
        <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 8,
                      background: toast.kind === 'err' ? '#fef2f2' : '#dcfce7',
                      color: toast.kind === 'err' ? '#7f1d1d' : '#064e3b',
                      border: '2px solid ' + (toast.kind === 'err' ? '#ef4444' : '#10b981'),
                      fontSize: 14, fontWeight: 500 }}>{toast.msg}</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 12 }}>
        {providerData.map(p => (
          <ProviderCard key={p.id} p={p} testing={!!testing[p.cred?.id]} onTest={() => testProvider(p.cred?.id)} />
        ))}
      </div>

      <div style={{ marginTop: 18, padding: 14, background: 'var(--surface2, #f8fafc)', borderRadius: 10, fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.6 }}>
        Keys live in the <strong style={{ color: 'var(--text)' }}>Credentials Vault</strong> under Tools — click a provider's "Manage" button to jump there.
        Test buttons hit each provider's real API to confirm the key still works. Spend numbers come from each provider's own
        usage endpoint and may take a few seconds to load.
      </div>
    </div>
  )
}

function ProviderCard({ p, testing, onTest }) {
  const lastTest = p.cred?.lastTest
  const lastTestAge = lastTest?.at ? humanAge(lastTest.at) : null

  let statusBadge, statusColor
  if (!p.cred) { statusBadge = '✗ Not in vault'; statusColor = '#f59e0b' }
  else if (lastTest?.ok === false) { statusBadge = '⚠️ Failing'; statusColor = '#ef4444' }
  else if (lastTest?.ok === true) { statusBadge = '✓ Working'; statusColor = '#10b981' }
  else { statusBadge = '✓ Key set'; statusColor = '#3b82f6' }

  return (
    <div style={{
      padding: 16, borderRadius: 14, border: '1px solid var(--border)',
      background: 'var(--surface, #fff)', display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontSize: 28 }}>{p.emoji}</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{p.name}</div>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', fontFamily: 'monospace', marginTop: 2 }}>{p.envKey}</div>
          </div>
        </div>
        <span style={{ padding: '4px 10px', fontSize: 11.5, fontWeight: 700, borderRadius: 999, background: statusColor + '22', color: statusColor, whiteSpace: 'nowrap' }}>
          {statusBadge}
        </span>
      </div>

      <div style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.45 }}>{p.use}</div>

      {lastTest && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          Last test: <strong style={{ color: lastTest.ok === false ? '#ef4444' : 'var(--text)' }}>{lastTest.message || (lastTest.ok ? 'OK' : '—')}</strong>
          {lastTestAge && <span> — {lastTestAge}</span>}
        </div>
      )}

      {p.usage?.usage && (p.usage.usage.cost30d != null || p.usage.usage.costToday != null || p.usage.usage.cost7d != null) && (
        <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
          {p.usage.usage.costToday != null && <span>Today: <strong style={{ color: 'var(--text)' }}>${p.usage.usage.costToday.toFixed(2)}</strong></span>}
          {p.usage.usage.cost7d != null && <span>7d: <strong style={{ color: 'var(--text)' }}>${p.usage.usage.cost7d.toFixed(2)}</strong></span>}
          {p.usage.usage.cost30d != null && <span>30d: <strong style={{ color: 'var(--text)' }}>${p.usage.usage.cost30d.toFixed(2)}</strong></span>}
        </div>
      )}

      {p.agents.length > 0 ? (
        <div style={{ fontSize: 12.5, color: 'var(--text)' }}>
          <span style={{ color: 'var(--text-muted)' }}>Used by</span>{' '}
          <strong>{p.agents.length}</strong> agent{p.agents.length > 1 ? 's' : ''}{': '}
          {p.agents.slice(0, 3).map((a, i) => (
            <span key={a.id}>
              {i > 0 && ', '}
              <span style={{ fontWeight: 500 }}>{a.name}</span>
            </span>
          ))}
          {p.agents.length > 3 && <span> +{p.agents.length - 3}</span>}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>No agents using this provider</div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
        <button onClick={onTest} disabled={!p.cred || testing} style={{ ...btn('primary'), flex: 1, minWidth: 120, opacity: !p.cred ? 0.5 : 1 }}>
          {testing ? 'Testing…' : 'Test now'}
        </button>
        <button
          onClick={() => { try { localStorage.setItem('fcc-tab', 'credentials') } catch {}; window.location.reload() }}
          style={btn('ghost')}>
          Manage
        </button>
      </div>
    </div>
  )
}

function humanAge(iso) {
  const then = new Date(iso).getTime()
  if (!then) return ''
  const diff = Date.now() - then
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

function btn(kind) {
  const base = { padding: '9px 14px', minHeight: 40, fontSize: 13.5, fontWeight: 600, borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit' }
  if (kind === 'primary') return { ...base, background: 'var(--accent, #3b82f6)', color: 'var(--accent-text, #fff)' }
  if (kind === 'secondary') return { ...base, background: 'var(--surface2, #e2e8f0)', color: 'var(--text)' }
  if (kind === 'ghost') return { ...base, background: 'transparent', color: 'var(--text)', border: '1px solid var(--border)' }
  return base
}
