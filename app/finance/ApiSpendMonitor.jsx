'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, BellRing, ChevronDown, ChevronUp, Gauge, Pin, RefreshCw, Settings2, WalletCards, X } from 'lucide-react'
import styles from './ApiSpendMonitor.module.css'
import UsageAttribution from './UsageAttribution'

const SETTINGS_KEY = 'fcc-api-spend-settings-v1'
const BASELINE_KEY = 'fcc-api-spend-baseline-v1'
const DEFAULTS = { dailyLimit: 40, burstLimit: 40, warningPercent: 80, lowBalance: 10, refreshSeconds: 60, floating: true }
let sharedSnapshot = null
let sharedFetchedAt = 0
let sharedRequest = null

function money(value) {
  return Number.isFinite(Number(value)) ? `$${Number(value).toFixed(2)}` : '—'
}

function loadSettings() {
  if (typeof window === 'undefined') return DEFAULTS
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') } } catch { return DEFAULTS }
}

async function requestUsage(force = false) {
  if (!force && sharedSnapshot && Date.now() - sharedFetchedAt < 30_000) return sharedSnapshot
  if (sharedRequest) return sharedRequest
  sharedRequest = fetch(`/api/credentials/spend${force ? '?force=1' : ''}`, { method: 'GET', cache: 'no-store' })
    .then(async response => {
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body.error || 'Usage feed unavailable')
      sharedSnapshot = body
      sharedFetchedAt = Date.now()
      window.dispatchEvent(new CustomEvent('fcc:api-spend-updated', { detail: body }))
      return body
    })
    .finally(() => { sharedRequest = null })
  return sharedRequest
}

function providerMetric(record) {
  const usage = record.usage || {}
  const limits = record.limits || {}
  const today = Number(usage.costToday ?? usage.usageDaily ?? 0)
  const remaining = usage.creditsRemaining != null ? Number(usage.creditsRemaining) : null
  const spent = Number(usage.totalSpent ?? usage.costMonth ?? usage.cost30d ?? today ?? 0)
  const characterRemaining = usage.characterLimit != null
    ? Math.max(0, Number(usage.characterLimit) - Number(usage.charactersUsed || 0))
    : null
  let percent = usage.percentUsed != null ? Number(usage.percentUsed) : null
  if (percent == null && limits.creditLimit && usage.totalSpent != null) percent = (Number(usage.totalSpent) / Number(limits.creditLimit)) * 100
  return { today, remaining, spent, characterRemaining, percent: percent == null ? null : Math.max(0, Math.min(100, percent)) }
}

function updateBaseline(records) {
  if (typeof window === 'undefined') return {}
  const day = new Date().toISOString().slice(0, 10)
  let saved = {}
  try { saved = JSON.parse(localStorage.getItem(BASELINE_KEY) || '{}') } catch {}
  const next = saved.day === day ? { ...saved.values } : {}
  const bursts = {}
  for (const record of records) {
    const current = providerMetric(record).today
    if (!(record.id in next)) next[record.id] = current
    bursts[record.id] = Math.max(0, current - Number(next[record.id] || 0))
  }
  try { localStorage.setItem(BASELINE_KEY, JSON.stringify({ day, values: next })) } catch {}
  return bursts
}

function tone(percent, warningPercent) {
  if (percent == null) return 'var(--accent)'
  if (percent >= 95) return 'var(--red)'
  if (percent >= warningPercent) return 'var(--amber)'
  return 'var(--green)'
}

function ProviderRow({ record, settings, burst = 0 }) {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const metric = providerMetric(record)
  const color = tone(metric.percent, settings.warningPercent)
  const detail = metric.remaining != null
    ? `${money(metric.remaining)} left`
    : metric.characterRemaining != null
      ? `${metric.characterRemaining.toLocaleString()} chars left`
      : metric.today > 0
        ? `${money(metric.today)} today`
        : record.usage?.costMonth > 0
          ? `${money(record.usage.costMonth)} this month`
        : record.status === 'active' ? 'Connected' : record.error || record.note || record.status
  return (
    <div>
      <button type="button" className={`${styles.providerRow} ${styles.providerButton}`} onClick={() => setDetailsOpen(value => !value)} aria-expanded={detailsOpen} title={`Open ${record.provider || record.name} usage details`}>
        <div className="min-w-0 text-left">
          <div className="truncate text-sm font-semibold">{record.provider || record.name}</div>
          <div className="truncate text-[11px]" style={{ color: 'var(--text-muted)' }}>{detail}{burst > 0 ? ` · +${money(burst)}` : ''}</div>
        </div>
        <div>
          <div className={styles.track} aria-label={metric.percent == null ? 'No quota percentage reported' : `${Math.round(metric.percent)} percent used`}>
            <div className={styles.fill} style={{ width: `${metric.percent ?? (record.status === 'active' ? 8 : 0)}%`, '--meter-color': color }} />
          </div>
        </div>
        <div className="min-w-[44px] text-right text-xs font-bold" style={{ color }}>{metric.percent == null ? (record.status === 'active' ? 'LIVE' : '—') : `${Math.round(metric.percent)}%`}</div>
      </button>
      {detailsOpen && <div className={styles.providerDetails}>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <span style={{ color: 'var(--text-muted)' }}>Reporting scope</span><strong className="text-right">{record.scope || 'Provider credential'}</strong>
          <span style={{ color: 'var(--text-muted)' }}>Metric</span><strong className="text-right">{String(record.metricKind || 'status').replaceAll('_', ' ')}</strong>
          {metric.today > 0 && <><span style={{ color: 'var(--text-muted)' }}>Today</span><strong className="text-right">{money(metric.today)}</strong></>}
          {record.usage?.costMonth > 0 && <><span style={{ color: 'var(--text-muted)' }}>Month to date</span><strong className="text-right">{money(record.usage.costMonth)}</strong></>}
          {record.usage?.cost7d > 0 && <><span style={{ color: 'var(--text-muted)' }}>7 days</span><strong className="text-right">{money(record.usage.cost7d)}</strong></>}
          {record.usage?.cost30d > 0 && <><span style={{ color: 'var(--text-muted)' }}>30 days</span><strong className="text-right">{money(record.usage.cost30d)}</strong></>}
        </div>
        <div className="mt-3 rounded-lg p-3 text-xs" style={{ background: 'var(--amber-soft)', color: 'var(--text)' }}>
          <strong>Agent/workflow attribution: {record.attribution?.level === 'none' ? 'not reported by provider' : record.attribution?.level || 'unavailable'}.</strong>
          <div className="mt-1" style={{ color: 'var(--text-muted)' }}>{record.attribution?.note || 'Exact attribution requires local per-call logging with agent, workflow, automation, and run IDs.'}</div>
        </div>
        {record.note && <p className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>{record.note}</p>}
      </div>}
    </div>
  )
}

export default function ApiSpendMonitor({ mode = 'floating', onNavigate }) {
  const [settings, setSettings] = useState(loadSettings)
  const [snapshot, setSnapshot] = useState(sharedSnapshot)
  const [bursts, setBursts] = useState({})
  const [loading, setLoading] = useState(!sharedSnapshot)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState(mode === 'panel')
  const [providerFilter, setProviderFilter] = useState('active')
  const [panelView, setPanelView] = useState('providers')

  const refresh = useCallback(async (force = false) => {
    setLoading(true)
    setError('')
    try {
      const body = await requestUsage(force)
      setSnapshot(body)
      setBursts(updateBaseline(body.results || []))
    } catch (err) {
      setError(err.message || 'Usage feed unavailable')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => {
    refresh(false)
    const sync = event => setSnapshot(event.detail)
    window.addEventListener('fcc:api-spend-updated', sync)
    const timer = window.setInterval(() => refresh(false), Math.max(30, Number(settings.refreshSeconds) || 60) * 1000)
    return () => { window.removeEventListener('fcc:api-spend-updated', sync); window.clearInterval(timer) }
  }, [refresh, settings.refreshSeconds])

  const records = snapshot?.results || []
  const activeRecords = records.filter(record => record.status === 'active' || record.status === 'attention')
  const inactiveRecords = records.filter(record => record.status !== 'active' && record.status !== 'attention')
  const visibleRecords = mode !== 'panel' || providerFilter === 'active'
    ? activeRecords
    : providerFilter === 'inactive' ? inactiveRecords : records
  const dailySpend = activeRecords.reduce((sum, record) => sum + providerMetric(record).today, 0)
  const dailyPercent = settings.dailyLimit > 0 ? Math.min(100, (dailySpend / settings.dailyLimit) * 100) : 0
  const alarms = useMemo(() => activeRecords.flatMap(record => {
    const metric = providerMetric(record)
    const name = record.provider || record.name
    const items = []
    if (metric.today >= settings.dailyLimit) items.push(`${name} is at ${money(metric.today)} today`)
    if ((bursts[record.id] || 0) >= settings.burstLimit) items.push(`${name} increased ${money(bursts[record.id])} since this monitor started today`)
    if (metric.percent != null && metric.percent >= settings.warningPercent) items.push(`${name} has used ${Math.round(metric.percent)}% of its quota`)
    if (metric.remaining != null && metric.remaining <= settings.lowBalance) items.push(`${name} has ${money(metric.remaining)} remaining`)
    return items
  }), [activeRecords, settings, bursts])

  const saveSetting = useCallback((key, raw) => {
    const value = key === 'floating' ? Boolean(raw) : Math.max(0, Number(raw) || 0)
    const next = { ...settings, [key]: value }
    setSettings(next)
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)) } catch {}
    window.dispatchEvent(new CustomEvent('fcc:api-spend-settings', { detail: next }))
  }, [settings])

  useEffect(() => {
    const sync = event => setSettings({ ...DEFAULTS, ...event.detail })
    window.addEventListener('fcc:api-spend-settings', sync)
    return () => window.removeEventListener('fcc:api-spend-settings', sync)
  }, [])

  useEffect(() => {
    const handleVoiceCommand = event => {
      const action = String(event.detail?.action || event.detail || '').toLowerCase().trim()
      if (action === 'open' || action === 'expand') {
        saveSetting('floating', true)
        setExpanded(true)
        refresh(false)
      } else if (action === 'show') {
        saveSetting('floating', true)
        setExpanded(false)
      } else if (action === 'close' || action === 'collapse' || action === 'minimize') {
        setExpanded(false)
        if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
      } else if (action === 'hide' || action === 'unpin') {
        saveSetting('floating', false)
      } else if (action === 'toggle') {
        saveSetting('floating', true)
        setExpanded(value => !value)
      }
    }
    window.addEventListener('fcc:api-spend-command', handleVoiceCommand)
    return () => window.removeEventListener('fcc:api-spend-command', handleVoiceCommand)
  }, [refresh, saveSetting])

  const openPanel = () => {
    if (onNavigate) return onNavigate()
    window.dispatchEvent(new CustomEvent('fcc:navigate', { detail: { tab: 'finance', subtab: 'api-spend' } }))
    window.setTimeout(() => window.dispatchEvent(new CustomEvent('fcc:finance-sub', { detail: 'api-spend' })), 0)
  }

  if (mode === 'floating' && !settings.floating) return null

  if (mode === 'floating' && !expanded) {
    return (
      <aside className={styles.floatingShell} aria-label="API spend monitor">
        <button className={styles.meterButton} onClick={() => setExpanded(true)} aria-expanded="false">
          <span className={styles.ring} style={{ '--meter-value': dailyPercent, '--meter-color': tone(dailyPercent, settings.warningPercent) }} />
          <span className="min-w-0 flex-1 text-left">
            <span className="block text-xs font-bold">API meter · {money(dailySpend)} today</span>
            <span className="block truncate text-[11px]" style={{ color: alarms.length ? 'var(--amber)' : 'var(--text-muted)' }}>{alarms.length ? `${alarms.length} spend alert${alarms.length === 1 ? '' : 's'}` : `${activeRecords.length} live provider${activeRecords.length === 1 ? '' : 's'}`}</span>
          </span>
          <ChevronUp size={18} aria-hidden="true" />
        </button>
      </aside>
    )
  }

  const feed = (
    <>
      {error && <div role="alert" className="px-3 py-2 text-xs" style={{ color: 'var(--red)', background: 'var(--red-soft)' }}>{error}</div>}
      {alarms.length > 0 && <div role="alert" className="flex gap-2 px-3 py-2 text-xs" style={{ color: 'var(--amber)', background: 'var(--amber-soft)' }}><AlertTriangle size={16} className="shrink-0" /><span>{alarms[0]}{alarms.length > 1 ? ` · ${alarms.length - 1} more` : ''}</span></div>}
      {loading && visibleRecords.length === 0 && <div className="px-4 py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>Reading provider balances…</div>}
      {!loading && visibleRecords.length === 0 && !error && <div className="px-4 py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>No providers match this filter.</div>}
      {visibleRecords.map(record => <ProviderRow key={record.id} record={record} settings={settings} burst={bursts[record.id]} />)}
    </>
  )

  if (mode === 'panel') {
    return (
      <section className={styles.panel} aria-labelledby="api-spend-heading">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-3"><WalletCards size={21} style={{ color: 'var(--accent)' }} /><div><h2 id="api-spend-heading" className="text-base font-bold">Live API spend control</h2><p className="text-xs" style={{ color: 'var(--text-muted)' }}>Provider balances, quota consumption, and owner-set alarms.</p></div></div>
          <button onClick={() => refresh(true)} disabled={loading} aria-label="Refresh provider usage" data-tooltip="Refresh provider usage" className="flex min-h-12 min-w-12 items-center justify-center rounded-lg" style={{ color: 'var(--accent)', border: '1px solid var(--border)', background: 'var(--surface2)' }}><RefreshCw size={18} className={loading ? 'animate-spin' : ''} /></button>
        </div>
        <div role="tablist" aria-label="API spend views" className="flex gap-2 border-b px-4 py-3" style={{ borderColor: 'var(--border)' }}>
          <button type="button" role="tab" aria-selected={panelView === 'providers'} onClick={() => setPanelView('providers')} className="min-h-10 rounded-lg px-4 text-sm font-bold" style={{ border: '1px solid var(--border)', background: panelView === 'providers' ? 'var(--accent-soft)' : 'var(--surface)' }}>Providers</button>
          <button type="button" role="tab" aria-selected={panelView === 'attribution'} onClick={() => setPanelView('attribution')} className="min-h-10 rounded-lg px-4 text-sm font-bold" style={{ border: '1px solid var(--border)', background: panelView === 'attribution' ? 'var(--accent-soft)' : 'var(--surface)' }}>Attribution</button>
        </div>
        {panelView === 'providers' ? <div className={styles.panelGrid}>
          <div>
            <div className={styles.providerToolbar} aria-label="Provider status filter">
              {[
                ['active', `Active providers (${activeRecords.length})`],
                ['inactive', `Inactive providers (${inactiveRecords.length})`],
                ['all', `All providers (${records.length})`],
              ].map(([value, label]) => <button key={value} type="button" aria-pressed={providerFilter === value} onClick={() => setProviderFilter(value)}>{label}</button>)}
            </div>
            <div className={styles.providerList} role="region" aria-label="API providers" tabIndex={0}>{feed}</div>
          </div>
          <div className={styles.settings}>
            <div className="mb-3 flex items-center gap-2"><Settings2 size={17} /><h3 className="text-sm font-bold">Alarm thresholds</h3></div>
            <div className={styles.fieldGrid}>
              {[['dailyLimit', 'Daily spend $'], ['burstLimit', 'Burst increase $'], ['warningPercent', 'Quota warning %'], ['lowBalance', 'Low balance $']].map(([key, label]) => <div className={styles.field} key={key}><label htmlFor={`api-${key}`}>{label}</label><input id={`api-${key}`} type="number" min="0" step={key.includes('Limit') || key === 'lowBalance' ? '1' : '5'} value={settings[key]} onChange={event => saveSetting(key, event.target.value)} /></div>)}
            </div>
            <label className="mt-4 flex min-h-12 cursor-pointer items-center gap-3 rounded-lg px-3" style={{ border: '1px solid var(--border)', background: 'var(--surface)' }}><input type="checkbox" checked={settings.floating} onChange={event => saveSetting('floating', event.target.checked)} /><Pin size={16} /><span className="text-sm font-semibold">Float meter while I work</span></label>
            <div className="mt-3 flex gap-2 text-xs" style={{ color: 'var(--text-muted)' }}><BellRing size={15} className="shrink-0" /><span>Alerts stay visible in the meter. Data refreshes every {settings.refreshSeconds} seconds and credentials never leave the server.</span></div>
          </div>
        </div> : <UsageAttribution />}
      </section>
    )
  }

  return (
    <aside className={styles.floatingShell} aria-label="API spend monitor">
      <div className={styles.floatingCard}>
        <div className="flex min-h-12 items-center gap-2 px-3">
          <Gauge size={18} style={{ color: tone(dailyPercent, settings.warningPercent) }} />
          <button className="min-h-12 min-w-0 flex-1 text-left" onClick={openPanel}><span className="block text-xs font-bold">API meter · {money(dailySpend)} today</span><span className="block text-[11px]" style={{ color: 'var(--text-muted)' }}>{snapshot?.fetchedAt ? `Updated ${new Date(snapshot.fetchedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Connecting…'}</span></button>
          <button onClick={() => refresh(true)} disabled={loading} aria-label="Refresh API usage" data-tooltip="Refresh" className="flex min-h-12 min-w-12 items-center justify-center"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /></button>
          <button onClick={() => setExpanded(false)} aria-label="Collapse API spend monitor" data-tooltip="Collapse" className="flex min-h-12 min-w-12 items-center justify-center"><ChevronDown size={18} /></button>
          <button onClick={() => saveSetting('floating', false)} aria-label="Unpin API spend monitor" data-tooltip="Unpin; restore in Finance" className="flex min-h-12 min-w-12 items-center justify-center"><X size={17} /></button>
        </div>
        {feed}
        <button onClick={openPanel} className="flex min-h-12 w-full items-center justify-center gap-2 border-t text-xs font-bold" style={{ color: 'var(--accent)', borderColor: 'var(--border)' }}><Settings2 size={15} /> Open Finance control panel</button>
      </div>
    </aside>
  )
}
