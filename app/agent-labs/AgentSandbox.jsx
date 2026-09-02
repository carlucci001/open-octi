'use client'

import { useMemo, useState } from 'react'
import {
  Bot,
  Box,
  CheckCircle2,
  ExternalLink,
  Filter,
  FlaskConical,
  LockKeyhole,
  PackageCheck,
  Search,
  ShieldCheck,
} from 'lucide-react'
import PageHeader from '../components/PageHeader'
import {
  PRODUCT_MODULES,
  SANDBOX_GATES,
  SANDBOX_STAGES,
  THIRD_PARTY_AGENT_TEMPLATES,
  findProductModuleForAgent,
  getSandboxMetrics,
} from '../../lib/agent-sandbox-catalog'

const riskTone = {
  low: { text: 'var(--green, #22c55e)', bg: 'rgba(34,197,94,0.12)', border: 'rgba(34,197,94,0.35)' },
  medium: { text: 'var(--amber, #f59e0b)', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.35)' },
  high: { text: 'var(--red, #ef4444)', bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.35)' },
}

function Pill({ children, tone = 'neutral' }) {
  const colors = riskTone[tone] || { text: 'var(--text-muted)', bg: 'var(--surface2)', border: 'var(--border)' }
  return (
    <span
      className="inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold"
      style={{ color: colors.text, background: colors.bg, border: `1px solid ${colors.border}` }}
    >
      {children}
    </span>
  )
}

function IconButton({ label, children, onClick, disabled = false }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      data-tooltip={label}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg"
      style={{
        background: disabled ? 'rgba(148,163,184,0.08)' : 'var(--surface2)',
        border: '1px solid var(--border)',
        color: disabled ? 'var(--text-muted)' : 'var(--text)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
      }}
    >
      {children}
    </button>
  )
}

function Metric({ label, value, detail }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div className="text-lg font-bold" style={{ color: 'var(--text)' }}>{value}</div>
      <div className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>{label}</div>
      {detail && <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{detail}</div>}
    </div>
  )
}

export default function AgentSandbox() {
  const [query, setQuery] = useState('')
  const [stageFilter, setStageFilter] = useState('all')
  const [selectedId, setSelectedId] = useState(THIRD_PARTY_AGENT_TEMPLATES[0]?.id || '')

  const metrics = useMemo(() => getSandboxMetrics(), [])
  const filteredAgents = useMemo(() => {
    const q = query.trim().toLowerCase()
    return THIRD_PARTY_AGENT_TEMPLATES.filter(agent => {
      if (stageFilter !== 'all' && agent.stage !== stageFilter) return false
      if (!q) return true
      return [
        agent.id,
        agent.name,
        agent.division,
        agent.module,
        agent.summary,
        agent.bestUse,
        agent.sourceRepo,
      ].filter(Boolean).join(' ').toLowerCase().includes(q)
    })
  }, [query, stageFilter])

  const selected = filteredAgents.find(agent => agent.id === selectedId)
    || THIRD_PARTY_AGENT_TEMPLATES.find(agent => agent.id === selectedId)
    || filteredAgents[0]
    || THIRD_PARTY_AGENT_TEMPLATES[0]
  const selectedModule = selected ? findProductModuleForAgent(selected.id) : null

  return (
    <div className="agent-sandbox-workspace command-workspace p-4 sm:p-5">
      <PageHeader
        icon={<FlaskConical size={20} />}
        title="Agent Sandbox"
        subtitle="Third-party agent templates stay quarantined here until they pass scenario tests and promotion gates."
        actions={
          <div className="flex items-center gap-2">
            <IconButton label="Import repo" disabled><Box size={16} /></IconButton>
            <IconButton label="Create draft agent" disabled><PackageCheck size={16} /></IconButton>
          </div>
        }
      />

      <div className="grid gap-3 md:grid-cols-4" style={{ marginBottom: 16 }}>
        <section className="rounded-lg p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <Metric label="Templates" value={metrics.total} detail="Imported as sandbox inventory" />
        </section>
        <section className="rounded-lg p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <Metric label="Avg readiness" value={`${metrics.averageReadiness}%`} detail="Before live tools or voice" />
        </section>
        <section className="rounded-lg p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <Metric label="High risk" value={metrics.highRisk} detail="Finance or sensitive workflow" />
        </section>
        <section className="rounded-lg p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <Metric label="Lives under" value="Labs" detail="Labs > Agent Sandbox" />
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(280px,0.95fr)_minmax(380px,1.35fr)_minmax(280px,0.9fr)]">
        <section className="rounded-lg p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--text)' }}>
              <Bot size={16} />
              Import inventory
            </div>
            <Pill>{filteredAgents.length} shown</Pill>
          </div>

          <div className="mb-3 grid gap-2">
            <label className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
              <Search size={15} style={{ color: 'var(--text-muted)' }} />
              <input
                value={query}
                onChange={event => setQuery(event.target.value)}
                placeholder="Search templates"
                className="w-full bg-transparent text-sm outline-none"
                style={{ color: 'var(--text)' }}
              />
            </label>
            <label className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
              <Filter size={15} style={{ color: 'var(--text-muted)' }} />
              <select
                value={stageFilter}
                onChange={event => setStageFilter(event.target.value)}
                className="w-full bg-transparent text-sm outline-none"
                style={{ color: 'var(--text)' }}
              >
                <option value="all">All stages</option>
                {SANDBOX_STAGES.map(stage => <option key={stage.id} value={stage.id}>{stage.label}</option>)}
              </select>
            </label>
          </div>

          <div className="grid gap-2" role="list" aria-label="Third-party agent templates">
            {filteredAgents.map(agent => {
              const active = selected?.id === agent.id
              return (
                <button
                  key={agent.id}
                  type="button"
                  onClick={() => setSelectedId(agent.id)}
                  className="rounded-lg p-3 text-left"
                  style={{
                    background: active ? 'rgba(37,99,235,0.16)' : 'var(--surface2)',
                    border: `1px solid ${active ? 'rgba(59,130,246,0.55)' : 'var(--border)'}`,
                    color: 'var(--text)',
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{agent.name}</div>
                      <div className="truncate text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{agent.module}</div>
                    </div>
                    <Pill tone={agent.risk}>{agent.risk}</Pill>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ background: 'rgba(148,163,184,0.18)' }}>
                    <div style={{ width: `${agent.readiness}%`, height: '100%', background: 'var(--accent)' }} />
                  </div>
                </button>
              )
            })}
          </div>
        </section>

        <section className="rounded-lg p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          {selected && (
            <>
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-bold" style={{ color: 'var(--text)' }}>{selected.name}</h2>
                    <Pill>{selected.division}</Pill>
                    <Pill tone={selected.risk}>{selected.risk} risk</Pill>
                  </div>
                  <p className="mt-2 max-w-2xl text-sm" style={{ color: 'var(--text-muted)' }}>{selected.summary}</p>
                </div>
                <a
                  href={selected.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold"
                  style={{ color: 'var(--text)', background: 'var(--surface2)', border: '1px solid var(--border)' }}
                >
                  Source <ExternalLink size={14} />
                </a>
              </div>

              <div className="mb-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-lg p-3" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                  <div className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Stage</div>
                  <div className="mt-1 text-sm font-bold" style={{ color: 'var(--text)' }}>
                    {SANDBOX_STAGES.find(stage => stage.id === selected.stage)?.label || selected.stage}
                  </div>
                </div>
                <div className="rounded-lg p-3" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                  <div className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>License</div>
                  <div className="mt-1 text-sm font-bold" style={{ color: 'var(--text)' }}>{selected.license}</div>
                </div>
                <div className="rounded-lg p-3" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                  <div className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Default runtime</div>
                  <div className="mt-1 text-sm font-bold" style={{ color: 'var(--text)' }}>{selected.defaultRuntime}</div>
                </div>
              </div>

              <div className="mb-4 rounded-lg p-4" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--text)' }}>
                  <LockKeyhole size={16} />
                  Sandbox policy
                </div>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{selected.toolPolicy}</p>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <div className="mb-2 text-sm font-semibold" style={{ color: 'var(--text)' }}>Mock scenarios</div>
                  <div className="grid gap-2">
                    {selected.scenarios.map((scenario, index) => (
                      <div key={scenario} className="flex gap-2 rounded-lg p-3 text-sm" style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                        <span className="font-bold" style={{ color: 'var(--accent)' }}>{index + 1}</span>
                        <span>{scenario}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-2 text-sm font-semibold" style={{ color: 'var(--text)' }}>Promotion checklist</div>
                  <div className="grid gap-2">
                    {selected.promotionChecklist.map(item => (
                      <div key={item} className="flex gap-2 rounded-lg p-3 text-sm" style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                        <CheckCircle2 size={15} style={{ color: 'var(--green, #22c55e)', marginTop: 2, flexShrink: 0 }} />
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </section>

        <aside className="grid gap-4 content-start">
          <section className="rounded-lg p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--text)' }}>
              <ShieldCheck size={16} />
              Quarantine gates
            </div>
            <div className="grid gap-2">
              {SANDBOX_GATES.map(gate => (
                <div key={gate} className="flex gap-2 text-sm" style={{ color: 'var(--text-muted)' }}>
                  <CheckCircle2 size={15} style={{ color: 'var(--green, #22c55e)', marginTop: 2, flexShrink: 0 }} />
                  <span>{gate}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--text)' }}>
              <PackageCheck size={16} />
              Product module packs
            </div>
            <div className="grid gap-2">
              {PRODUCT_MODULES.map(module => {
                const active = selectedModule?.id === module.id
                return (
                  <div
                    key={module.id}
                    className="rounded-lg p-3"
                    style={{
                      background: active ? 'rgba(37,99,235,0.16)' : 'var(--surface2)',
                      border: `1px solid ${active ? 'rgba(59,130,246,0.55)' : 'var(--border)'}`,
                    }}
                  >
                    <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{module.name}</div>
                    <div className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>{module.outcome}</div>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <Pill>{module.owner}</Pill>
                      <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>{module.status}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        </aside>
      </div>
    </div>
  )
}
