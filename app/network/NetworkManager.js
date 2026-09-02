'use client'
import { useState, useEffect, useCallback } from 'react'
import PageHeader from '../components/PageHeader'

function StatusDot({ ok, unknown, size = 8 }) {
  const color = unknown ? 'var(--text-muted)' : ok ? 'var(--green)' : 'var(--red)'
  return (
    <span style={{
      display: 'inline-block',
      width: size, height: size,
      borderRadius: '50%',
      background: color,
      boxShadow: ok ? `0 0 8px ${color}` : 'none',
      animation: ok ? 'pulse 2s ease-in-out infinite' : 'none',
    }} />
  )
}

function StatusCard({ title, ok, unknown, detail, meta, ms, action }) {
  const color = unknown ? 'var(--text-muted)' : ok ? 'var(--green)' : 'var(--red)'
  const bg = unknown ? 'var(--surface2)' : ok ? 'var(--green-soft)' : 'var(--red-soft)'
  return (
    <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: `1px solid ${ok ? 'var(--green)' : unknown ? 'var(--border)' : 'var(--red)'}` }}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <StatusDot ok={ok} unknown={unknown} size={10} />
          <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{title}</div>
        </div>
        {ms > 0 && <div className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>{ms}ms</div>}
      </div>
      <div className="text-[11px] font-bold uppercase tracking-widest mb-1" style={{ color }}>
        {unknown ? 'Checking…' : ok ? 'Online' : 'Offline'}
      </div>
      {detail && <div className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>{detail}</div>}
      {meta && <div className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>{meta}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

// Build a multi-line tooltip string from arbitrary stats. Browser native SVG <title>
// renders this on hover with line breaks preserved.
function tipText(...lines) { return lines.filter(Boolean).join('\n') }

// Simple ring topology — production CRM in center, public/private services around it.
// Node colors reflect health. Arrows animate when traffic is flowing (i.e. ok).
function TopologyView({ data }) {
  if (!data) return null
  const W = 900, H = 620
  const cx = W / 2, cy = 280

  const statusOf = (v) => v == null ? 'unknown' : v.ok ? 'online' : 'offline'
  const colorOf = (s) => s === 'online' ? 'var(--green)' : s === 'offline' ? 'var(--red)' : 'var(--text-muted)'

  const elevenlabs = (data.externals || []).find(e => e.name === 'ElevenLabs')
  const center = {
    x: cx, y: cy, label: 'CRM · Next.js', status: statusOf(data.local),
    tip: tipText(
      'Farrington Command Center',
      'Runtime: Hetzner · Node.js · Next.js',
      data.crmService?.workingDirectory ? `Path: ${data.crmService.workingDirectory}` : 'Path: /root/farrington-command-center',
      data.local?.ms != null ? `Health ping: ${data.local.ms}ms` : null,
      `Status: ${statusOf(data.local) === 'online' ? 'All systems go' : statusOf(data.local).toUpperCase()}`,
    ),
  }
  const nodes = [
    {
      x: cx, y: 80, label: 'Browser', status: 'online', icon: 'WEB',
      tip: tipText('Your browser session', 'Public HTTPS connection', 'Entry: openocti.local', 'Status: Online'),
    },
    {
      x: cx - 340, y: 80, label: 'Cloudflare', status: statusOf(data.cloudflared), icon: 'CF', sub: data.cloudflared?.state,
      tip: tipText(
        'Cloudflare public ingress',
        'Service: cloudflared.service',
        'Routes public CRM traffic to Hetzner',
        `Status: ${statusOf(data.cloudflared) === 'online' ? 'Active' : 'Inactive'}`,
      ),
    },
    {
      x: cx + 340, y: 80, label: 'Public CRM', status: statusOf(data.publicCrm), icon: 'WWW', sub: data.publicCrm?.status ? `HTTP ${data.publicCrm.status}` : '',
      tip: tipText(
        'openocti.local',
        'Public HTTPS app surface',
        data.publicCrm?.ms != null ? `Edge ping: ${data.publicCrm.ms}ms` : null,
        `Status: ${data.publicCrm?.ok ? 'Serving traffic' : 'Offline'}`,
      ),
    },
    {
      x: cx - 360, y: cy + 20, label: 'OpenClaw', status: statusOf(data.openclaw), icon: 'OC',
      tip: tipText(
        'OpenClaw runtime',
        'Private server-side tool runtime',
        'Reached by CRM server routes only',
        data.openclaw?.ms != null ? `Route ping: ${data.openclaw.ms}ms` : null,
        `Status: ${statusOf(data.openclaw) === 'online' ? 'All systems go' : statusOf(data.openclaw).toUpperCase()}`,
      ),
    },
    {
      x: cx + 360, y: cy + 20, label: 'Lucci (ElevenLabs)', status: elevenlabs?.ok ? 'online' : 'offline', icon: '📞',
      tip: tipText(
        'Lucci voice agent (ElevenLabs)',
        'Conversational AI · realtime TTS+STT',
        elevenlabs?.ms ? `API ping: ${elevenlabs.ms}ms` : null,
        elevenlabs?.status ? `HTTP: ${elevenlabs.status}` : null,
        `Status: ${elevenlabs?.ok ? 'All systems go' : 'Offline'}`,
      ),
    },
    ...(data.externals || []).map((e, i, arr) => {
      const spacing = 820 / (arr.length + 1)
      return {
        x: 40 + spacing * (i + 1),
        y: cy + 240,
        label: e.name,
        status: e.ok ? 'online' : 'offline',
        icon: 'API',
        ms: e.ms,
        tip: tipText(
          `${e.name} API`,
          'Reached over public internet (HTTPS)',
          e.status > 0 ? `HTTP ${e.status}` : null,
          e.ms > 0 ? `Latency: ${e.ms}ms` : null,
          `Status: ${e.ok ? 'All systems go' : 'Offline'}`,
        ),
      }
    }),
  ]
  const visibleNodes = nodes

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="xMidYMid meet" style={{ maxHeight: 680 }}>
      <defs>
        <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
          <path d="M 0,0 L 8,4 L 0,8 L 2,4 Z" fill="var(--text-muted)" />
        </marker>
        <filter id="glow">
          <feGaussianBlur stdDeviation="2.5" result="blur" />
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>

      {/* Connections from center to each node */}
      {visibleNodes.map((n, i) => (
        <line key={'l' + i} x1={cx} y1={cy} x2={n.x} y2={n.y}
          stroke={n.status === 'online' ? 'rgba(166,227,161,0.35)' : 'rgba(127,132,156,0.2)'}
          strokeWidth={n.status === 'online' ? 1.5 : 1}
          strokeDasharray={n.status === 'online' ? '0' : '4 3'}
        />
      ))}

      {/* Center server */}
      <g style={{ cursor: 'help' }}>
        <title>{center.tip}</title>
        <circle cx={cx} cy={cy} r="48" fill="var(--surface)" stroke={colorOf(center.status)} strokeWidth="2.5" filter="url(#glow)" />
        <text x={cx} y={cy - 8} textAnchor="middle" fontSize="22" fill="var(--text)">🖥️</text>
        <text x={cx} y={cy + 14} textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--text)">CRM</text>
        <text x={cx} y={cy + 26} textAnchor="middle" fontSize="8" fill={colorOf(center.status)}>●</text>
      </g>

      {/* Surrounding nodes */}
      {visibleNodes.map((n, i) => (
        <g key={'n' + i} style={{ cursor: 'help' }}>
          <title>{n.tip}</title>
          <circle cx={n.x} cy={n.y} r="28" fill="var(--surface2)" stroke={colorOf(n.status)} strokeWidth="2" />
          <text x={n.x} y={n.y - 2} textAnchor="middle" fontSize="14">{n.icon}</text>
          <text x={n.x} y={n.y + 10} textAnchor="middle" fontSize="7" fill={colorOf(n.status)} fontWeight="700">●</text>
          <text x={n.x} y={n.y + 44} textAnchor="middle" fontSize="10" fill="var(--text)" fontWeight="600">{n.label}</text>
          {n.sub && <text x={n.x} y={n.y + 56} textAnchor="middle" fontSize="8" fill="var(--text-muted)">{n.sub}</text>}
          {n.ms != null && <text x={n.x} y={n.y + 56} textAnchor="middle" fontSize="8" fill="var(--text-muted)">{n.ms}ms</text>}
        </g>
      ))}
    </svg>
  )
}

// Production topology — public browser traffic enters through Cloudflare,
// then reaches the Hetzner-hosted CRM and private server-side services.
function NetworkTopologyView({ data }) {
  if (!data) return null
  const W = 1000, H = 640
  const statusOf = (v) => v == null ? 'unknown' : v.ok ? 'online' : 'offline'
  const colorOf = (s) => s === 'online' ? 'var(--green)' : s === 'offline' ? 'var(--red)' : 'var(--text-muted)'

  const elevenlabs = (data.externals || []).find(e => e.name === 'ElevenLabs')

  // Zone rectangles
  const Z = {
    public:      { x: 30, y: 60, w: 220, h: 230, label: 'PUBLIC WEB', color: '#3b7dd8' },
    edge:        { x: 290, y: 60, w: 220, h: 230, label: 'CLOUDFLARE EDGE', color: '#f59e0b' },
    hetzner:     { x: 550, y: 60, w: 420, h: 230, label: 'HETZNER PRODUCTION', color: '#22c55e' },
    private:     { x: 550, y: 340, w: 420, h: 110, label: 'PRIVATE SERVER SERVICES', color: '#14b8a6' },
    internet:    { x: 30, y: 500, w: 940, h: 120, label: 'PUBLIC INTERNET · EXTERNAL APIS', color: '#f59e0b' },
  }

  // Nodes positioned within zones
  const browser = { x: Z.public.x + 110, y: Z.public.y + 115, label: 'Browser', icon: 'WEB',
    status: 'online',
    tip: tipText('Your browser session', 'Public HTTPS', 'Connects through openocti.local', 'Status: Online') }
  const cloudflare = { x: Z.edge.x + 110, y: Z.edge.y + 115, label: 'Cloudflare', icon: 'CF',
    status: statusOf(data.cloudflared),
    tip: tipText(
      'Cloudflare public ingress',
      'Service: cloudflared.service',
      'Public ingress routes through Cloudflare',
      `Status: ${statusOf(data.cloudflared) === 'online' ? 'Active' : statusOf(data.cloudflared).toUpperCase()}`,
    ) }
  const crm = { x: Z.hetzner.x + 140, y: Z.hetzner.y + 115, label: 'CRM (Next.js)', icon: 'CRM',
    status: statusOf(data.local),
    tip: tipText(
      'Farrington Command Center',
      'Next.js 14 (App Router) · React · Tailwind',
      'Runtime: Hetzner · Node.js',
      data.crmService?.workingDirectory ? `Path: ${data.crmService.workingDirectory}` : 'Path: /root/farrington-command-center',
      data.local?.ms != null ? `Health ping: ${data.local.ms}ms` : null,
      `Status: ${statusOf(data.local) === 'online' ? 'All systems go' : statusOf(data.local).toUpperCase()}`,
    ) }
  const publicCrm = { x: Z.hetzner.x + 300, y: Z.hetzner.y + 115, label: 'Public CRM', icon: 'WWW',
    status: statusOf(data.publicCrm),
    tip: tipText(
      'openocti.local',
      'Public HTTPS application surface',
      data.publicCrm?.status ? `HTTP ${data.publicCrm.status}` : null,
      data.publicCrm?.ms != null ? `Edge ping: ${data.publicCrm.ms}ms` : null,
      `Status: ${data.publicCrm?.ok ? 'Serving traffic' : 'Offline'}`,
    ) }
  const openclaw = { x: Z.private.x + 210, y: Z.private.y + 58, label: 'OpenClaw', icon: 'OC',
    status: statusOf(data.openclaw),
    tip: tipText(
      'OpenClaw runtime',
      'Plugin sandbox + tool registry',
      'Stack: Bun · TypeScript · ESM',
      'Private localhost service reached by CRM routes',
      data.openclaw?.ms != null ? `Route ping: ${data.openclaw.ms}ms` : null,
      `Status: ${statusOf(data.openclaw) === 'online' ? 'All systems go' : statusOf(data.openclaw).toUpperCase()}`,
    ) }

  // External APIs in the internet zone
  const externals = (data.externals || []).map((e, i, arr) => {
    const spacing = (Z.internet.w - 80) / Math.max(1, arr.length)
    return {
      x: Z.internet.x + 60 + spacing * i,
      y: Z.internet.y + 80,
      label: e.name,
      icon: 'API',
      status: e.ok ? 'online' : 'offline',
      ms: e.ms,
      tip: tipText(
        `${e.name}`,
        'Public HTTPS API',
        e.status > 0 ? `HTTP ${e.status}` : null,
        e.ms > 0 ? `Latency: ${e.ms}ms` : null,
        `Status: ${e.ok ? 'All systems go' : 'Offline'}`,
      ),
    }
  })

  const lucci = { x: Z.internet.x + 60, y: Z.internet.y + 70, label: 'Lucci · ElevenLabs', icon: 'TEL',
    status: elevenlabs?.ok ? 'online' : 'offline',
    tip: tipText('Lucci voice agent', 'ElevenLabs Conversational AI', 'Realtime TTS + STT over WebSocket', `Status: ${elevenlabs?.ok ? 'All systems go' : 'Offline'}`) }

  const nodes = [browser, cloudflare, crm, publicCrm, openclaw, lucci, ...externals.filter(e => e.label !== 'ElevenLabs')]

  // Connection lines: [fromNode, toNode, label]
  const links = [
    [browser, cloudflare, 'HTTPS'],
    [cloudflare, publicCrm, 'HTTPS'],
    [publicCrm, crm, 'local app'],
    [crm, openclaw, 'localhost'],
    [crm, lucci, 'WebSocket'],
    ...externals.filter(e => e.label !== 'ElevenLabs').map(e => [crm, e, 'HTTPS']),
  ]
  const visibleLinks = links

  const Zone = ({ z }) => (
    <g>
      <rect x={z.x} y={z.y} width={z.w} height={z.h} rx="14"
        fill="var(--surface2)" fillOpacity="0.4"
        stroke={z.color} strokeOpacity="0.5" strokeWidth="1.5" strokeDasharray="6 4" />
      <text x={z.x + 12} y={z.y + 18} fontSize="10" fontWeight="700" fill={z.color} letterSpacing="1.5">{z.label}</text>
    </g>
  )

  const Node = ({ n }) => (
    <g style={{ cursor: 'help' }}>
      <title>{n.tip}</title>
      <circle cx={n.x} cy={n.y} r="26" fill="var(--surface)" stroke={colorOf(n.status)} strokeWidth="2" />
      <text x={n.x} y={n.y - 2} textAnchor="middle" fontSize="14">{n.icon}</text>
      <text x={n.x} y={n.y + 10} textAnchor="middle" fontSize="7" fill={colorOf(n.status)} fontWeight="700">●</text>
      <text x={n.x} y={n.y + 42} textAnchor="middle" fontSize="9.5" fill="var(--text)" fontWeight="600">{n.label}</text>
    </g>
  )

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="xMidYMid meet" style={{ maxHeight: 700 }}>
      <defs>
        <marker id="arr2" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
          <path d="M 0,0 L 8,4 L 0,8 Z" fill="var(--text-muted)" />
        </marker>
      </defs>

      <Zone z={Z.public} />
      <Zone z={Z.edge} />
      <Zone z={Z.hetzner} />
      <Zone z={Z.private} />
      <Zone z={Z.internet} />

      {visibleLinks.map(([a, b, label], i) => {
        const ok = a.status === 'online' && b.status === 'online'
        return (
          <g key={'L' + i}>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke={ok ? 'rgba(166,227,161,0.5)' : 'rgba(127,132,156,0.25)'}
              strokeWidth={ok ? 1.4 : 1}
              strokeDasharray={ok ? '0' : '4 3'}
              markerEnd="url(#arr2)" />
            {label && (
              <text x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 4}
                textAnchor="middle" fontSize="8" fill="var(--text-muted)" style={{ pointerEvents: 'none' }}>{label}</text>
            )}
          </g>
        )
      })}

      {nodes.map((n, i) => <Node key={'n' + i} n={n} />)}
    </svg>
  )
}

// Tab 3: APIs & Tools — list of CRM endpoints, OpenClaw tools, and external SDKs.
function ApisToolsView() {
  const [data, setData] = useState(null)
  const [err, setErr] = useState(null)
  useEffect(() => {
    fetch('/api/network/apis').then(r => r.json()).then(j => {
      if (j.ok) setData(j); else setErr(j.error || 'Failed')
    }).catch(e => setErr(e.message))
  }, [])
  if (err) return <div className="text-sm p-6" style={{ color: 'var(--red)' }}>Error: {err}</div>
  if (!data) return <div className="text-sm p-6 text-center" style={{ color: 'var(--text-muted)' }}>Scanning…</div>

  const SectionHeader = ({ title, count, blurb }) => (
    <div className="px-4 py-2 flex items-center gap-3 flex-wrap" style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
      <h3 className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text)' }}>{title}</h3>
      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>{count}</span>
      <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{blurb}</span>
    </div>
  )

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* CRM endpoints */}
      <div className="rounded-xl overflow-hidden flex flex-col" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <SectionHeader title="CRM Endpoints" count={data.counts.crm} blurb="Next.js HTTP routes inside the CRM" />
        <div className="overflow-auto" style={{ maxHeight: 600 }}>
          {data.crmRoutes.map(r => (
            <div key={r.path} className="px-4 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="flex items-center gap-2 flex-wrap">
                <code className="text-[12px] font-mono" style={{ color: 'var(--text)' }}>{r.path}</code>
                {r.methods.map(m => (
                  <span key={m} className="text-[9px] px-1.5 py-0.5 rounded font-bold tracking-wider" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>{m}</span>
                ))}
              </div>
              <div className="text-[10px] mt-0.5 font-mono" style={{ color: 'var(--text-muted)' }}>{r.file}</div>
            </div>
          ))}
        </div>
      </div>

      {/* OpenClaw tools */}
      <div className="rounded-xl overflow-hidden flex flex-col" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <SectionHeader title="OpenClaw Tools" count={data.counts.openclaw} blurb="What Matilda can call via OpenClaw" />
        <div className="overflow-auto" style={{ maxHeight: 600 }}>
          {data.openclawTools.length === 0 && (
            <div className="px-4 py-6 text-sm" style={{ color: 'var(--text-muted)' }}>No tools detected. Run the unified plugin or check scripts/fcc-unified-plugin-index.ts.</div>
          )}
          {data.openclawTools.map(t => (
            <div key={t.name} className="px-4 py-2" style={{ borderBottom: '1px solid var(--border)' }}>
              <code className="text-[12px] font-mono font-semibold" style={{ color: 'var(--accent)' }}>{t.name}</code>
              {t.description && <div className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>{t.description}</div>}
            </div>
          ))}
        </div>
      </div>

      {/* External SDKs */}
      <div className="rounded-xl overflow-hidden flex flex-col" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <SectionHeader title="External SDKs" count={Object.values(data.externalSdks).reduce((s, l) => s + l.length, 0)} blurb="Third-party packages we depend on" />
        <div className="overflow-auto" style={{ maxHeight: 600 }}>
          {Object.entries(data.externalSdks).map(([group, items]) => (
            <div key={group}>
              <div className="px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>{group}</div>
              {items.map(it => (
                <div key={it.name} className="px-4 py-2 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
                  <code className="text-[12px] font-mono" style={{ color: 'var(--text)' }}>{it.name}</code>
                  <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>{it.version}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const STATUS_CACHE_KEY = 'fcc-network-status-cache'

export default function NetworkManager() {
  const [data, setData] = useState(() => {
    // Hydrate from localStorage so the topology paints instantly instead of waiting 5s.
    if (typeof window === 'undefined') return null
    try { return JSON.parse(localStorage.getItem(STATUS_CACHE_KEY) || 'null') } catch { return null }
  })
  const [loading, setLoading] = useState(false) // we have cached data — no blocking load state
  const [refreshing, setRefreshing] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [restarting, setRestarting] = useState(false)
  const [restartMsg, setRestartMsg] = useState('')
  const [watchdog, setWatchdog] = useState(null)
  const [togglingWatchdog, setTogglingWatchdog] = useState(false)
  // Diagram view: 'services' (existing hub-and-spoke) or 'topology' (zoned schematic)
  const [view, setView] = useState(() => {
    if (typeof window === 'undefined') return 'services'
    try { return sessionStorage.getItem('fcc.network.view') || 'services' } catch { return 'services' }
  })
  useEffect(() => {
    if (typeof window === 'undefined') return
    try { sessionStorage.setItem('fcc.network.view', view) } catch {}
  }, [view])

  const loadWatchdog = useCallback(async () => {
    try {
      const r = await fetch('/api/network/watchdog').then(r => r.json())
      setWatchdog(r)
    } catch {}
  }, [])

  useEffect(() => { loadWatchdog() }, [loadWatchdog])

  // ---- Solo / Multi-user mode --------------------------------------------
  // Solo blocks public-internet logins for everyone except admin.
  // Webhooks and outbound calls are unaffected.
  const [networkMode, setNetworkMode] = useState(null) // null = loading
  const [flippingMode, setFlippingMode] = useState(false)
  const loadMode = useCallback(async () => {
    try {
      const r = await fetch('/api/network/mode', { cache: 'no-store' }).then(r => r.json())
      if (r?.ok) setNetworkMode(r.mode)
    } catch {}
  }, [])
  useEffect(() => { loadMode() }, [loadMode])

  const flipMode = async () => {
    const next = networkMode === 'solo' ? 'multi' : 'solo'
    const msg = next === 'solo'
      ? 'Switch to SOLO MODE?\n\nNon-admin users will be logged out immediately and cannot log back in via the public web while Solo is on. Webhooks and outbound calls are unaffected.\n\nProceed?'
      : 'Switch back to MULTI-USER MODE?\n\nMembers (Steve, Chad) will be able to log in via the public web again.'
    if (!confirm(msg)) return
    setFlippingMode(true)
    try {
      const r = await fetch('/api/network/mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: next }),
      }).then(r => r.json())
      if (r?.ok) {
        setNetworkMode(r.mode)
        if (r.mode === 'solo' && r.booted > 0) {
          setRestartMsg(`✓ Solo mode on · booted ${r.booted} member session${r.booted === 1 ? '' : 's'}`)
        } else {
          setRestartMsg(`✓ Switched to ${r.mode === 'solo' ? 'Solo' : 'Multi-user'} mode`)
        }
      } else {
        setRestartMsg('⚠ ' + (r?.error || 'failed to flip mode'))
      }
    } catch (e) {
      setRestartMsg('⚠ ' + e.message)
    }
    setFlippingMode(false)
  }

  const toggleWatchdog = async () => {
    const running = watchdog?.exists && watchdog?.state !== 'Disabled'
    const action = running ? 'disable' : 'enable'
    const verb = running ? 'disable' : 're-enable'
    if (!confirm(`${verb[0].toUpperCase() + verb.slice(1)} the watchdog task? ${running ? 'The popup every 2 min will stop. Tunnel won\'t auto-recover — use the Restart button when needed.' : 'Tunnel will auto-recover every 2 min, but the boot popup will come back.'}`)) return
    setTogglingWatchdog(true)
    const r = await fetch('/api/network/watchdog', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) }).then(r => r.json())
    setRestartMsg(r.ok ? '✓ ' + r.message : '⚠ ' + (r.error || 'failed'))
    setTogglingWatchdog(false)
    loadWatchdog()
  }

  const [pingFlash, setPingFlash] = useState('')
  const [manualPinging, setManualPinging] = useState(false)
  const ping = useCallback(async (manual = false) => {
    if (manual) setManualPinging(true)
    setRefreshing(true)
    try {
      const ctl = new AbortController()
      const timer = setTimeout(() => ctl.abort(), 8000)
      const r = await fetch('/api/network/status', { cache: 'no-store', signal: ctl.signal }).then(r => r.json())
      clearTimeout(timer)
      setData(r)
      try { localStorage.setItem(STATUS_CACHE_KEY, JSON.stringify(r)) } catch {}
      if (manual) {
        setPingFlash(`✓ Refreshed ${new Date().toLocaleTimeString()}`)
        setTimeout(() => setPingFlash(''), 1800)
      }
    } catch (e) {
      setData(prev => prev || { fetchedAt: new Date().toISOString(), local: { ok: false, error: e.name === 'AbortError' ? 'timed out' : e.message }, publicCrm: {}, cloudflared: {}, crmService: {}, externals: [] })
      if (manual) {
        setPingFlash('⚠ Ping failed')
        setTimeout(() => setPingFlash(''), 2500)
      }
    }
    setRefreshing(false)
    if (manual) setManualPinging(false)
    setLoading(false)
  }, [])

  useEffect(() => { ping() }, [ping])
  useEffect(() => {
    if (!autoRefresh) return
    const id = setInterval(ping, 15000)
    return () => clearInterval(id)
  }, [autoRefresh, ping])

  const restartTunnel = async () => {
    if (!confirm('Restart the cloudflared tunnel? Takes ~10 seconds.')) return
    setRestarting(true); setRestartMsg('')
    const r = await fetch('/api/network/restart-tunnel', { method: 'POST' }).then(r => r.json()).catch(e => ({ error: e.message }))
    setRestartMsg(r.ok ? '✓ ' + r.message : '⚠ ' + (r.error || 'failed'))
    setRestarting(false)
    setTimeout(ping, 12000)
  }

  if (loading) {
    return (
      <div className="command-workspace p-6">
        <PageHeader icon="🛰️" title="Network" subtitle="Pinging everything…" />
        <div className="text-center py-20" style={{ color: 'var(--text-muted)' }}>
          <div className="text-3xl mb-3 animate-pulse">🛰️</div>
          Checking all services…
        </div>
      </div>
    )
  }

  const stats = {
    local: data?.local,
    publicCrm: data?.publicCrm,
    cloudflared: data?.cloudflared,
    crmService: data?.crmService,
    openclaw: data?.openclaw,
  }
  const externals = data?.externals || []

  return (
    <div className="command-workspace p-6">
      <PageHeader
        icon="🛰️"
        title="Network"
        subtitle={`Last ping ${data ? new Date(data.fetchedAt).toLocaleTimeString() : 'never'} · Auto-refresh ${autoRefresh ? 'on' : 'off'}`}
        actions={
          <div className="flex gap-2">
            <button onClick={() => setAutoRefresh(a => !a)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium"
              style={{ background: 'var(--surface2)', color: autoRefresh ? 'var(--green)' : 'var(--text-muted)', border: '1px solid var(--border)' }}>
              {autoRefresh ? '● Auto-refresh' : '○ Auto-refresh'}
            </button>
            {pingFlash && <span className="text-xs mr-2" style={{ color: pingFlash.startsWith('✓') ? 'var(--green)' : 'var(--red)' }}>{pingFlash}</span>}
            <button onClick={() => ping(true)} disabled={manualPinging}
              className="px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50"
              style={{ background: 'var(--accent-soft)', color: 'var(--accent)', border: '1px solid var(--accent)' }}>
              {manualPinging ? '⟳ Pinging…' : '⟳ Ping Now'}
            </button>
          </div>
        }
      />

      {/* Solo / Multi-user — small inline switch */}
      <div className="command-toolbar flex items-center gap-3 mb-4" style={{ fontSize: 14 }}>
        <span style={{ color: 'var(--text-muted)' }}>Mode:</span>
        <button
          onClick={flipMode}
          disabled={flippingMode || networkMode === null}
          role="switch"
          aria-checked={networkMode === 'multi'}
          title={networkMode === 'solo' ? 'Solo — public-web logins blocked' : 'Multi-user — public-web logins open'}
          style={{
            position: 'relative',
            width: 52, height: 26,
            borderRadius: 13,
            border: 'none',
            background: networkMode === 'solo' ? 'rgb(239, 68, 68)' : 'rgb(34, 197, 94)',
            cursor: flippingMode || networkMode === null ? 'wait' : 'pointer',
            transition: 'background 0.2s ease',
            padding: 0,
            opacity: networkMode === null ? 0.5 : 1,
          }}
        >
          <span style={{
            position: 'absolute',
            top: 3, left: networkMode === 'solo' ? 3 : 29,
            width: 20, height: 20,
            borderRadius: 10,
            background: 'white',
            transition: 'left 0.2s ease',
            boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
          }} />
        </button>
        <span style={{ fontWeight: 600, color: networkMode === 'solo' ? 'rgb(239, 68, 68)' : 'rgb(34, 197, 94)', minWidth: 70 }}>
          {networkMode === null ? '...' : networkMode === 'solo' ? 'Solo' : 'Multi-user'}
        </span>
      </div>

      {/* Top status bar */}
      <div className="command-stat-grid grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
        <StatusCard title="Public CRM" ok={stats.publicCrm?.ok} detail="openocti.local" ms={stats.publicCrm?.ms} />
        <StatusCard title="Hetzner CRM" ok={stats.crmService?.ok && stats.local?.ok} detail="/root/farrington-command-center" ms={stats.local?.ms} />
        <StatusCard title="OpenClaw" ok={stats.openclaw?.ok} detail="private server-side runtime" ms={stats.openclaw?.ms} />
      </div>

      {/* Watchdog control */}
      <div className="rounded-xl p-4 mb-5 flex items-center gap-4 flex-wrap" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="flex items-center gap-2">
          <StatusDot ok={watchdog?.exists && watchdog?.state === 'Ready'} unknown={!watchdog} size={10} />
          <div>
            <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Tunnel Watchdog</div>
            <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
              {watchdog?.exists
                ? `Running every 2 min · ${watchdog.state} · triggers boot-task popup on restart`
                : 'Disabled — no auto-recovery, but no popup either'}
            </div>
          </div>
        </div>
        <button onClick={toggleWatchdog} disabled={togglingWatchdog}
          className="ml-auto px-3 py-1.5 rounded-lg text-xs font-medium disabled:opacity-50"
          style={{
            background: watchdog?.exists ? 'var(--red-soft)' : 'var(--green-soft)',
            color: watchdog?.exists ? 'var(--red)' : 'var(--green)',
            border: `1px solid ${watchdog?.exists ? 'var(--red)' : 'var(--green)'}`,
          }}>
          {togglingWatchdog ? '⟳ Working…' : watchdog?.exists ? '⏸ Disable watchdog' : '▶ Enable watchdog'}
        </button>
      </div>

      {restartMsg && (
        <div className="mb-4 px-3 py-2 rounded-lg text-xs font-medium" style={{ background: restartMsg.startsWith('⚠') ? 'var(--red-soft)' : 'var(--green-soft)', color: restartMsg.startsWith('⚠') ? 'var(--red)' : 'var(--green)' }}>
          {restartMsg}
        </div>
      )}

      {/* Topology — switchable view */}
      <div className="rounded-xl mb-5 overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="px-5 py-3 flex items-center justify-between flex-wrap gap-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <div>
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text)', fontFamily: "'Outfit', sans-serif" }}>
              {view === 'topology' ? 'Network Topology · How it connects'
                : view === 'apis' ? 'APIs & Tools · What the CRM can do'
                : 'Services · What’s alive'}
            </h2>
            <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
              {view === 'topology' ? 'Real placement: public web, Cloudflare, Hetzner, private services'
                : view === 'apis' ? 'CRM endpoints · OpenClaw tools · external SDK dependencies'
                : 'Production service health · hover any icon for stats'}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg overflow-hidden" style={{ border: '1px solid var(--border)' }}>
              {[
                { id: 'services', label: 'Services' },
                { id: 'topology', label: 'Topology' },
                { id: 'apis', label: 'APIs & Tools' },
              ].map(t => (
                <button key={t.id} onClick={() => setView(t.id)}
                  className="px-3 py-1.5 text-xs font-medium"
                  style={{
                    background: view === t.id ? 'var(--accent)' : 'var(--surface2)',
                    color: view === t.id ? 'var(--accent-text)' : 'var(--text-muted)',
                    border: 'none',
                    minHeight: 32,
                  }}>
                  {t.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3 text-[10px]">
              <span className="flex items-center gap-1" style={{ color: 'var(--green)' }}><StatusDot ok /> Online</span>
              <span className="flex items-center gap-1" style={{ color: 'var(--red)' }}><StatusDot ok={false} /> Offline</span>
              <span className="flex items-center gap-1" style={{ color: 'var(--text-muted)' }}><StatusDot unknown /> Unknown</span>
            </div>
          </div>
        </div>
        <div className="p-4">
          {view === 'topology' ? <NetworkTopologyView data={data} />
            : view === 'apis' ? <ApisToolsView />
            : <TopologyView data={data} />}
        </div>
      </div>

      {/* Grid: external APIs + internal services */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
        {/* External APIs */}
        <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="px-5 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text)', fontFamily: "'Outfit', sans-serif" }}>External APIs</h2>
            <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{externals.filter(e => e.ok).length} of {externals.length} responsive</div>
          </div>
          <div>
            {externals.map(e => (
              <div key={e.name} className="flex items-center justify-between px-5 py-2.5" style={{ borderBottom: '1px solid var(--border)' }}>
                <div className="flex items-center gap-3">
                  <StatusDot ok={e.ok} />
                  <div className="text-sm" style={{ color: 'var(--text)' }}>{e.name}</div>
                </div>
                <div className="flex items-center gap-3 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  {e.status > 0 && <span className="font-mono">HTTP {e.status}</span>}
                  {e.ms > 0 && <span className="font-mono">{e.ms}ms</span>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Internal services */}
        <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="px-5 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <h2 className="text-sm font-semibold" style={{ color: 'var(--text)', fontFamily: "'Outfit', sans-serif" }}>Production Services</h2>
            <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Hetzner runtime, Cloudflare ingress, and private tools</div>
          </div>
          <div>
            {[
              { name: 'Farrington CRM service', detail: stats.crmService?.workingDirectory || '/root/farrington-command-center', ok: stats.crmService?.ok && stats.local?.ok, ms: stats.local?.ms },
              { name: 'Cloudflare ingress', detail: stats.cloudflared?.state || 'cloudflared.service', ok: stats.cloudflared?.ok, ms: stats.publicCrm?.ms },
              { name: 'OpenClaw gateway', detail: 'private server-side tool runtime', ok: stats.openclaw?.ok, ms: stats.openclaw?.ms },
            ].map(service => (
              <div key={service.name} className="flex items-center justify-between px-5 py-2.5" style={{ borderBottom: '1px solid var(--border)' }}>
                <div className="flex items-center gap-3">
                  <StatusDot ok={service.ok} unknown={service.ok == null} />
                  <div>
                    <div className="text-sm" style={{ color: 'var(--text)' }}>{service.name}</div>
                    <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{service.detail}</div>
                  </div>
                </div>
                {service.ms > 0 && <div className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>{service.ms}ms</div>}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Watchdog log */}
      {data?.recentLog?.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
            <div>
              <h2 className="text-sm font-semibold" style={{ color: 'var(--text)', fontFamily: "'Outfit', sans-serif" }}>Watchdog Log</h2>
              <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>Most recent first · tunnel-logs/watchdog.log</div>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>{data.recentLog.length} entries</span>
          </div>
          <div className="max-h-60 overflow-auto font-mono text-[11px]" style={{ background: 'var(--base)' }}>
            {data.recentLog.map((line, i) => (
              <div key={i} className="px-5 py-1" style={{ color: line.toLowerCase().includes('unreach') || line.toLowerCase().includes('fail') ? 'var(--red)' : 'var(--text-muted)' }}>
                {line}
              </div>
            ))}
          </div>
        </div>
      )}

      <style jsx global>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  )
}
