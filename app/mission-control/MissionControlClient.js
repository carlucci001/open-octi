'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  Bot,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  Command,
  FileText,
  FolderKanban,
  Mail,
  Moon,
  Phone,
  Radio,
  Radar,
  Rocket,
  Settings,
  ShieldCheck,
  Sparkles,
  TimerReset,
  Users,
  Zap,
} from 'lucide-react'
import { COMMAND_CENTER_SECTIONS } from '@/lib/commandCenterNavigation'
import styles from './MissionControl.module.css'

const MODES = [
  { id: 'pilot', label: 'Pilot', icon: Rocket },
  { id: 'briefing', label: 'Briefing', icon: Sparkles },
  { id: 'nightwatch', label: 'Nightwatch', icon: Moon },
]

const SOURCE_MAP = [
  { key: 'accounts', url: '/api/accounts', arrayKey: 'accounts' },
  { key: 'projects', url: '/api/projects', arrayKey: 'projects' },
  { key: 'tasks', url: '/api/tasks', arrayKey: 'tasks' },
  { key: 'leads', url: '/api/leads', arrayKey: 'leads' },
  { key: 'activities', url: '/api/activities', arrayKey: 'activities' },
  { key: 'payments', url: '/api/payments', arrayKey: 'payments' },
  { key: 'money', url: '/api/ops/money', objectKey: 'snapshot' },
  { key: 'pulse', url: '/api/dashboard/pulse', arrayKey: 'pulse' },
  { key: 'agents', url: '/api/openclaw/agents', arrayKey: 'agents' },
]

const LAUNCH_GROUPS = [
  {
    title: 'Revenue',
    items: ['leads', 'pipelines', 'accounts', 'contacts', 'finance', 'payments', 'invoices'],
    icon: CircleDollarSign,
  },
  {
    title: 'Operations',
    items: ['projects', 'tasks', 'documents', 'media', 'feed', 'switchboard'],
    icon: FolderKanban,
  },
  {
    title: 'Agents',
    items: ['agents', 'agent-labs', 'voice-labs', 'ops', 'repository'],
    icon: Bot,
  },
  {
    title: 'Tools',
    items: ['phone', 'conference', 'calendar', 'notes', 'network', 'domains', 'credentials', 'settings'],
    icon: Settings,
  },
]

const SECTION_BY_ID = new Map(COMMAND_CENTER_SECTIONS.map(section => [section.id, section]))

function safeArray(payload, arrayKey) {
  if (!payload) return []
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload[arrayKey])) return payload[arrayKey]
  if (arrayKey === 'pulse' && payload.pulse) return payload.pulse.d14 || payload.pulse.d7 || []
  if (arrayKey === 'agents' && Array.isArray(payload.agents)) return payload.agents
  if (Array.isArray(payload.items)) return payload.items
  return []
}

function sourceValue(payload, source) {
  if (source.objectKey) return payload?.[source.objectKey] || null
  return safeArray(payload, source.arrayKey)
}

function money(value) {
  const n = Number(value || 0)
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
}

function daysUntil(value) {
  if (!value) return null
  const d = new Date(value)
  if (!Number.isFinite(d.getTime())) return null
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  d.setHours(0, 0, 0, 0)
  return Math.ceil((d.getTime() - now.getTime()) / 86400000)
}

function statusTone(value) {
  const text = String(value || '').toLowerCase()
  if (/overdue|failed|risk|late|error|blocked|urgent/.test(text)) return 'danger'
  if (/done|paid|complete|healthy|active|live/.test(text)) return 'green'
  if (/new|pending|todo|open|sent|in_progress|working/.test(text)) return 'amber'
  return 'cyan'
}

function useMissionData() {
  const [state, setState] = useState({ loading: true, data: {}, errors: {} })

  useEffect(() => {
    let alive = true

    async function load() {
      const results = await Promise.allSettled(
        SOURCE_MAP.map(async source => {
          const res = await fetch(source.url, { cache: 'no-store' })
          if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
          const json = await res.json()
          return [source.key, sourceValue(json, source)]
        })
      )

      if (!alive) return
      const data = {}
      const errors = {}
      results.forEach((result, index) => {
        const key = SOURCE_MAP[index].key
        if (result.status === 'fulfilled') data[key] = result.value[1]
        else {
          data[key] = []
          errors[key] = result.reason?.message || 'Unavailable'
        }
      })
      setState({ loading: false, data, errors })
    }

    load()
    const id = setInterval(load, 45000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [])

  return state
}

export function buildSnapshot(data) {
  const accounts = data.accounts || []
  const projects = data.projects || []
  const tasks = data.tasks || []
  const leads = data.leads || []
  const activities = data.activities || []
  const payments = data.payments || []
  const agents = data.agents || []

  const openTasks = tasks.filter(t => !['done', 'complete', 'completed'].includes(String(t.status || '').toLowerCase()))
  const overdueTasks = openTasks.filter(t => {
    const due = daysUntil(t.dueDate || t.dueAt)
    return due !== null && due < 0
  })
  const hotLeads = leads.filter(l => !['closed', 'lost', 'qualified'].includes(String(l.status || '').toLowerCase()))
  const activeProjects = projects.filter(p => !['done', 'complete', 'completed', 'archived'].includes(String(p.status || '').toLowerCase()))
  const pipelineValue = [...projects, ...leads].reduce((sum, item) => {
    return sum + Number(item.value || item.amount || item.estimatedValue || item.budget || 0)
  }, 0)
  const paymentTotal = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0)
  const portfolioMrr = Number(data.money?.portfolio?.mrr)

  const recent = [...activities]
    .sort((a, b) => String(b.at || b.createdAt || b.updatedAt || '').localeCompare(String(a.at || a.createdAt || a.updatedAt || '')))
    .slice(0, 9)

  const dispatches = recent
    .filter(event => /email|mail|call|message|note|agent|voice|invoice/i.test(`${event.type || ''} ${event.subject || ''} ${event.title || ''}`))
    .slice(0, 5)

  const priorityQueue = [
    ...overdueTasks.map(t => ({
      id: `task-${t.id}`,
      label: t.title || t.subject || 'Overdue task',
      meta: 'Overdue task',
      tone: 'danger',
      kind: 'Task',
    })),
    ...openTasks.slice(0, 6).map(t => ({
      id: `task-${t.id}`,
      label: t.title || t.subject || 'Open task',
      meta: t.dueDate ? `Due ${t.dueDate}` : 'Next action',
      tone: statusTone(t.priority || t.status),
      kind: 'Task',
    })),
    ...hotLeads.slice(0, 5).map(l => ({
      id: `lead-${l.id}`,
      label: l.businessName || l.name || 'New lead',
      meta: l.source || l.status || 'Lead signal',
      tone: 'cyan',
      kind: 'Lead',
    })),
  ].slice(0, 8)

  const blips = [
    ...activeProjects.slice(0, 8).map((p, index) => ({
      id: `project-${p.id || index}`,
      label: p.name || p.title || 'Active project',
      type: 'Project',
      tone: statusTone(p.priority || p.status),
      x: 18 + ((index * 23) % 68),
      y: 22 + ((index * 31) % 58),
      size: 12 + (Number(p.value || p.budget || 0) > 0 ? 7 : 0),
    })),
    ...hotLeads.slice(0, 7).map((l, index) => ({
      id: `lead-${l.id || index}`,
      label: l.businessName || l.name || 'Lead',
      type: 'Lead',
      tone: 'cyan',
      x: 12 + ((index * 29 + 8) % 72),
      y: 18 + ((index * 19 + 14) % 62),
      size: 10,
    })),
    ...overdueTasks.slice(0, 4).map((t, index) => ({
      id: `risk-${t.id || index}`,
      label: t.title || 'Overdue task',
      type: 'Risk',
      tone: 'danger',
      x: 28 + ((index * 17 + 11) % 52),
      y: 28 + ((index * 23 + 9) % 48),
      size: 14,
    })),
  ].slice(0, 18)

  return {
    counts: {
      accounts: accounts.length,
      activeProjects: activeProjects.length,
      openTasks: openTasks.length,
      overdueTasks: overdueTasks.length,
      hotLeads: hotLeads.length,
      agents: agents.length,
      revenue: Number.isFinite(portfolioMrr) ? portfolioMrr : paymentTotal,
      pipeline: pipelineValue,
    },
    priorityQueue,
    blips,
    recent,
    dispatches,
    agents: agents.slice(0, 8),
  }
}

export default function MissionControlClient() {
  const [mode, setMode] = useState('pilot')
  const [selected, setSelected] = useState(null)
  const { loading, data, errors } = useMissionData()
  const snapshot = useMemo(() => buildSnapshot(data), [data])
  const activeMode = MODES.find(m => m.id === mode) || MODES[0]
  const ModeIcon = activeMode.icon
  const unavailable = Object.keys(errors).length

  const openSection = (tabId) => {
    try {
      localStorage.setItem('fcc-tab', tabId)
      if (['payments', 'invoices', 'overhead'].includes(tabId)) localStorage.setItem('fcc-finance-sub', tabId)
    } catch {}
    window.location.href = `/?tab=${encodeURIComponent(tabId)}`
  }

  return (
    <main className={styles.shell} data-mode={mode}>
      <div className={styles.scanline} />
      <header className={styles.topbar}>
        <div>
          <p className={styles.eyebrow}>Operational interface · all CRM sections reachable</p>
          <h1>Farrington Mission Control</h1>
        </div>
        <button className={styles.returnButton} type="button" onClick={() => openSection('dashboard')}>
          <Command size={17} />
          Open Classic CRM
        </button>
        <div className={styles.modeSwitch} aria-label="Mission control mode">
          {MODES.map(item => {
            const Icon = item.icon
            return (
              <button
                key={item.id}
                className={mode === item.id ? styles.modeActive : ''}
                onClick={() => setMode(item.id)}
                type="button"
              >
                <Icon size={16} />
                <span>{item.label}</span>
              </button>
            )
          })}
        </div>
      </header>

      <section className={styles.statusStrip} aria-label="Command status">
        <Metric icon={ShieldCheck} label="CRM Live" value={loading ? 'Syncing' : 'Online'} tone="green" />
        <Metric icon={Bot} label="Agents" value={snapshot.counts.agents} tone="cyan" />
        <Metric icon={Rocket} label="Projects" value={snapshot.counts.activeProjects} tone="amber" />
        <Metric icon={AlertTriangle} label="Overdue" value={snapshot.counts.overdueTasks} tone={snapshot.counts.overdueTasks ? 'danger' : 'green'} />
        <Metric icon={CircleDollarSign} label="Pipeline" value={money(snapshot.counts.pipeline)} tone="green" />
      </section>

      <section className={styles.cockpit}>
        <aside className={styles.leftRail}>
          <Panel title="Launch Deck" icon={Command}>
            <div className={styles.launchDeck}>
              {LAUNCH_GROUPS.map(group => {
                const Icon = group.icon
                return (
                  <div key={group.title} className={styles.launchGroup}>
                    <div className={styles.launchTitle}>
                      <Icon size={14} />
                      <span>{group.title}</span>
                    </div>
                    <div className={styles.launchGrid}>
                      {group.items.map(id => {
                        const section = SECTION_BY_ID.get(id)
                        if (!section) return null
                        return (
                          <button key={id} type="button" onClick={() => openSection(id)}>
                            {section.label.replace('Finance > ', '').replace('Labs > ', '').replace('Tools > ', '')}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </Panel>

          <Panel title="Mode Stack" icon={ModeIcon}>
            <div className={styles.modeBrief}>
              <strong>{activeMode.label}</strong>
              <span>{mode === 'pilot' ? 'Fast decisions and priority action.' : mode === 'briefing' ? 'Situation summary for the next move.' : 'Quiet monitoring with risk emphasis.'}</span>
            </div>
            <div className={styles.miniGrid}>
              <Signal label="Open tasks" value={snapshot.counts.openTasks} />
              <Signal label="Hot leads" value={snapshot.counts.hotLeads} />
              <Signal label="Accounts" value={snapshot.counts.accounts} />
              <Signal label="Revenue" value={money(snapshot.counts.revenue)} />
            </div>
          </Panel>

          <Panel title="Priority Queue" icon={Zap}>
            <div className={styles.queue}>
              {snapshot.priorityQueue.length ? snapshot.priorityQueue.map(item => (
                <button key={item.id} className={`${styles.queueItem} ${styles[item.tone]}`} onClick={() => setSelected(item)} type="button">
                  <span>{item.kind}</span>
                  <strong>{item.label}</strong>
                  <em>{item.meta}</em>
                </button>
              )) : <Empty label="No priority signals found" />}
            </div>
          </Panel>
        </aside>

        <section className={styles.stage}>
          <Panel title="Signal Radar" icon={Radar} large>
            <div className={styles.radar} aria-label="CRM signal radar">
              <div className={styles.radarSweep} />
              <div className={styles.ringOne} />
              <div className={styles.ringTwo} />
              <div className={styles.crosshairH} />
              <div className={styles.crosshairV} />
              <svg className={styles.constellation} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                {snapshot.blips.slice(0, 8).map((blip, index, list) => {
                  const next = list[(index + 1) % list.length]
                  if (!next || list.length < 2) return null
                  return <line key={`${blip.id}-${next.id}`} x1={blip.x} y1={blip.y} x2={next.x} y2={next.y} />
                })}
              </svg>
              {snapshot.blips.map(blip => (
                <button
                  key={blip.id}
                  type="button"
                  className={`${styles.blip} ${styles[blip.tone]}`}
                  style={{ left: `${blip.x}%`, top: `${blip.y}%`, width: blip.size, height: blip.size }}
                  onClick={() => setSelected(blip)}
                  aria-label={`${blip.type}: ${blip.label}`}
                >
                  <span />
                </button>
              ))}
              <div className={styles.radarCore}>
                <Radio size={28} />
                <strong>{snapshot.blips.length}</strong>
                <span>signals</span>
              </div>
            </div>
            <div className={styles.stageFooter}>
              <span>Read-only data scope</span>
              <strong>{selected ? `${selected.type || selected.kind}: ${selected.label}` : 'Select a signal for details'}</strong>
            </div>
          </Panel>
        </section>

        <aside className={styles.rightRail}>
          <Panel title="Agent Telemetry" icon={Bot}>
            <div className={styles.agents}>
              {snapshot.agents.length ? snapshot.agents.map((agent, index) => (
                <div key={agent.id || agent.name || index} className={styles.agentRow}>
                  <span className={styles.agentLight} />
                  <div>
                    <strong>{agent.name || agent.id || `Agent ${index + 1}`}</strong>
                    <em>{agent.role || agent.description || agent.model || 'Ready'}</em>
                  </div>
                </div>
              )) : <Empty label={errors.agents ? 'Agent feed unavailable' : 'No agents reported'} />}
            </div>
          </Panel>

          <Panel title="Transmission Lane" icon={Mail}>
            <div className={styles.transmissionLane} aria-label="Animated message dispatch lane">
              <div className={styles.dispatchTrack}>
                {(snapshot.dispatches.length ? snapshot.dispatches : [{ subject: 'Standing by', type: 'idle' }]).map((item, index) => (
                  <span
                    key={item.id || `${item.subject}-${index}`}
                    className={styles.packet}
                    style={{ animationDelay: `${index * 0.7}s` }}
                    title={item.subject || item.title || item.type || 'dispatch'}
                  />
                ))}
              </div>
              <div className={styles.dispatchList}>
                {(snapshot.dispatches.length ? snapshot.dispatches : [{ subject: 'No dispatches moving', type: 'idle' }]).map((item, index) => (
                  <div key={item.id || `${item.subject}-${index}`}>
                    <strong>{item.subject || item.title || item.type || 'Dispatch signal'}</strong>
                    <span>{item.at || item.createdAt || 'read-only lane'}</span>
                  </div>
                ))}
              </div>
            </div>
          </Panel>

          <Panel title="Live Mission Log" icon={Activity}>
            <div className={styles.feed}>
              {snapshot.recent.length ? snapshot.recent.map((event, index) => (
                <div key={event.id || index} className={styles.feedItem}>
                  <span className={styles.feedDot} />
                  <div>
                    <strong>{event.subject || event.title || event.type || 'CRM activity'}</strong>
                    <em>{event.at || event.createdAt || event.updatedAt || 'recent signal'}</em>
                  </div>
                </div>
              )) : <Empty label="No recent activity found" />}
            </div>
          </Panel>
        </aside>
      </section>

      <footer className={styles.ticker}>
        <Command size={16} />
        <span>Mission Control is a cockpit shell. Use Launch Deck buttons to jump into the existing Command Center tools and workflows.</span>
        {unavailable ? <strong>{unavailable} source{unavailable === 1 ? '' : 's'} unavailable</strong> : <strong>All read channels checked</strong>}
      </footer>
    </main>
  )
}

function Metric({ icon: Icon, label, value, tone }) {
  return (
    <div className={`${styles.metric} ${styles[tone]}`}>
      <Icon size={18} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function Panel({ title, icon: Icon, children, large }) {
  return (
    <section className={`${styles.panel} ${large ? styles.panelLarge : ''}`}>
      <header className={styles.panelHead}>
        <div>
          <Icon size={17} />
          <span>{title}</span>
        </div>
        <i />
      </header>
      {children}
    </section>
  )
}

function Signal({ label, value }) {
  return (
    <div className={styles.signalBox}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function Empty({ label }) {
  return (
    <div className={styles.empty}>
      <TimerReset size={18} />
      <span>{label}</span>
    </div>
  )
}
