'use client'

import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Cloud, ExternalLink, KeyRound, RefreshCw, ShieldCheck } from 'lucide-react'

const ENDPOINT = '/api/integrations/inmotion'
const CHECKS = [
  ['identity', 'Project identity'], ['instances', 'Instances'], ['computeQuotas', 'Compute quotas'],
  ['flavors', 'VM sizes'], ['networkQuotas', 'Network quotas'], ['volumeQuotas', 'Storage quotas'], ['volumes', 'Volumes'],
]
const STATUS_LABELS = {
  not_configured: 'Not configured', unchecked: 'Not checked', connected: 'Connected', partial: 'Some reads failed', error: 'Connection failed',
}
const CHECK_LABELS = { ok: 'Verified', denied: 'Access denied', error: 'Read failed', timeout: 'Timed out', unavailable: 'Unavailable' }
const panelStyle = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)' }
const mutedStyle = { color: 'var(--text-muted)' }
const actionStyle = { ...panelStyle, minWidth: 36, minHeight: 36 }

function dateText(value) {
  const date = value ? new Date(value) : null
  return date && Number.isFinite(date.getTime()) ? date.toLocaleString() : null
}

function count(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString() : '—'
}

function AllocationGauge({ label, quota, verified, unit = '', divisor = 1, shape = 'bar' }) {
  const validNumber = value => typeof value === 'number' && Number.isFinite(value) && value >= 0
  const available = verified && validNumber(quota?.inUse) && (validNumber(quota?.limit) || quota?.limit === -1)
  const scaled = value => `${count(value / divisor)}${unit ? ` ${unit}` : ''}`
  const hasScale = available && quota.limit > 0
  const percent = hasScale ? Math.min(100, Math.max(0, quota.inUse / quota.limit * 100)) : null
  const overage = available && quota.limit >= 0 ? Math.max(0, quota.inUse - quota.limit) : 0
  const tone = overage ? 'var(--yellow)' : 'var(--accent)'
  const valueText = hasScale ? `${scaled(quota.inUse)} allocated of ${scaled(quota.limit)} quota${overage ? `; ${scaled(overage)} over quota` : ''}` : undefined
  const meterProps = hasScale ? {
    role: 'meter', 'aria-label': `${label} allocation`, 'aria-valuemin': 0,
    'aria-valuemax': quota.limit / divisor, 'aria-valuenow': Math.min(quota.inUse, quota.limit) / divisor,
    'aria-valuetext': valueText,
  } : {}
  const gauge = shape === 'ring' ? (
    <div {...meterProps} className="shrink-0 flex items-center justify-center rounded-full" style={{ width: 60, height: 60, background: hasScale ? `conic-gradient(${tone} ${percent * 3.6}deg, var(--border) 0deg)` : 'var(--border)' }}>
      <span aria-hidden="true" className="flex items-center justify-center rounded-full text-xs font-semibold" style={{ width: 46, height: 46, background: 'var(--surface2)' }}>{hasScale ? `${Math.round(percent)}%` : 'N/A'}</span>
    </div>
  ) : (
    <div {...meterProps} className="mt-3 h-2 overflow-hidden rounded-full" style={{ background: 'var(--border)' }}>
      {hasScale && <div aria-hidden="true" className="h-full rounded-full" style={{ width: `${percent}%`, background: tone }} />}
    </div>
  )
  return (
    <div className="rounded-lg px-3 py-3" style={{ background: 'var(--surface2)' }}>
      <dt className="text-xs" style={mutedStyle}>{label}</dt>
      <dd className="mt-2">
        <div className="flex items-center gap-3">
          {shape === 'ring' && gauge}
          <div className="min-w-0">
            <div className="font-semibold text-sm">{available ? <><span>{scaled(quota.inUse)}</span><span style={mutedStyle}> / </span><span>{quota.limit === -1 ? 'No fixed quota' : scaled(quota.limit)}</span></> : 'Unavailable'}</div>
            <span className="block text-xs mt-1" style={mutedStyle}>{available ? 'Allocated / quota' : 'Allocation not verified'}</span>
          </div>
        </div>
        {shape === 'bar' && gauge}
        {available && <span className="block text-xs mt-2" style={mutedStyle}>{validNumber(quota.reserved) ? `${scaled(quota.reserved)} reserved` : 'Reservations unavailable'}</span>}
        {available && quota.limit === 0 && <span className="block text-xs mt-1" style={mutedStyle}>Zero quota; percentage unavailable</span>}
        {overage > 0 && <span className="block text-xs mt-1" style={{ color: 'var(--yellow)' }}>{scaled(overage)} over quota</span>}
      </dd>
    </div>
  )
}

function ReadTable({ label, columns, rows, emptyText, truncated }) {
  return (
    <div className="overflow-x-auto mt-2">
      <table className="w-full text-left text-xs" aria-label={label}>
        <thead><tr>{columns.map(column => <th key={column.key} scope="col" className="py-2 pr-4 font-semibold" style={mutedStyle}>{column.label}</th>)}</tr></thead>
        <tbody>{rows.map((row, index) => <tr key={row.id || `${row.name}-${index}`} style={{ borderTop: '1px solid var(--border)' }}>{columns.map(column => <td key={column.key} className="py-2 pr-4">{row[column.key] ?? '—'}</td>)}</tr>)}</tbody>
      </table>
      {!rows.length && <p className="text-sm py-2" style={mutedStyle}>{emptyText}</p>}
      {truncated && <p className="text-xs mt-1" style={{ color: 'var(--yellow)' }}>This list is incomplete; more results are available in the VPC dashboard.</p>}
    </div>
  )
}

export default function InMotionConnection() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const mounted = useRef(false)
  const refreshRequest = useRef(null)

  useEffect(() => {
    mounted.current = true
    const controller = new AbortController()
    async function load() {
      try {
        const response = await fetch(ENDPOINT, { cache: 'no-store', signal: controller.signal })
        if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? 'Administrator access is required to view this connection.' : 'Unable to load the saved VPC connection.')
        const result = await response.json()
        if (mounted.current && !controller.signal.aborted) setData(result)
      } catch (cause) {
        if (mounted.current && !controller.signal.aborted) setError(cause.message === 'Administrator access is required to view this connection.' ? cause.message : 'Unable to load the saved VPC connection. Try again.')
      } finally {
        if (mounted.current && !controller.signal.aborted) setLoading(false)
      }
    }
    load()
    return () => {
      mounted.current = false
      controller.abort()
      refreshRequest.current?.abort()
    }
  }, [])

  async function refresh() {
    if (refreshRequest.current) return
    const controller = new AbortController()
    refreshRequest.current = controller
    setRefreshing(true)
    setError('')
    try {
      const response = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'refresh' }), cache: 'no-store', signal: controller.signal })
      if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? 'Administrator access is required to refresh this connection.' : 'The VPC refresh failed. Try again.')
      const result = await response.json()
      if (mounted.current && !controller.signal.aborted) setData(result)
    } catch (cause) {
      if (mounted.current && !controller.signal.aborted) setError(cause.message === 'Administrator access is required to refresh this connection.' ? cause.message : 'The VPC refresh failed. Try again.')
    } finally {
      if (refreshRequest.current === controller) refreshRequest.current = null
      if (mounted.current && !controller.signal.aborted) setRefreshing(false)
    }
  }

  const checks = data?.checks || {}
  const connection = data?.connection || {}
  const checkedAt = dateText(data?.lastCheckedAt)
  const expiresAt = dateText(connection.credentialExpiresAt)
  const hasReaderRole = connection.roles?.includes('reader')
  const failedReads = CHECKS.filter(([key]) => checks[key] && checks[key].status !== 'ok')
  const connectionColor = data?.status === 'connected' ? 'var(--green)' : ['partial', 'error'].includes(data?.status) ? 'var(--yellow)' : 'var(--text-muted)'
  const busy = loading || refreshing

  return (
    <section aria-labelledby="inmotion-connection-title" aria-busy={busy} className="rounded-lg p-4 mb-5" style={panelStyle}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="inmotion-connection-title" className="font-semibold flex items-center gap-2"><Cloud size={18} aria-hidden="true" /> InMotion Explorer VPC</h2>
          <p className="text-xs mt-1" style={mutedStyle}>Saved cloud connection · Read operations run from Command Center</p>
        </div>
        <div className="flex items-center gap-2">
          <a href="https://iad4.inmotioncloud.net/" target="_blank" rel="noopener noreferrer" title="Open VPC dashboard" aria-label="Open VPC dashboard" className="inline-flex items-center justify-center rounded-lg" style={actionStyle}><ExternalLink size={16} aria-hidden="true" /></a>
          <a href="/?tab=credentials" title="Open Credentials" aria-label="Open Credentials" className="inline-flex items-center justify-center rounded-lg" style={actionStyle}><KeyRound size={16} aria-hidden="true" /></a>
          <button type="button" onClick={refresh} disabled={busy || data?.configured === false} title="Refresh VPC status" aria-label="Refresh VPC status" aria-busy={refreshing} className="inline-flex items-center justify-center rounded-lg disabled:opacity-50" style={actionStyle}><RefreshCw size={16} className={refreshing ? 'animate-spin motion-reduce:animate-none' : ''} aria-hidden="true" /></button>
        </div>
      </div>

      <div role="status" aria-live="polite" className="flex flex-wrap items-center gap-2 text-sm mt-3">
        {busy ? <><RefreshCw size={15} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /><span>{loading ? 'Loading saved VPC connection…' : 'Reading VPC resources and quotas…'}</span></> : <span style={{ color: connectionColor }}>{STATUS_LABELS[data?.status] || 'Status unavailable'}</span>}
        {!busy && hasReaderRole && <span className="inline-flex items-center gap-1 text-xs" style={mutedStyle}><ShieldCheck size={14} aria-hidden="true" /> Reader access</span>}
      </div>
      {error && <div role="alert" className="flex items-start gap-2 text-sm mt-3" style={{ color: 'var(--red)' }}><AlertTriangle size={16} aria-hidden="true" /><div>{error}{checkedAt && <p className="text-xs mt-1">Showing the previous check from {checkedAt}; these results are not current.</p>}</div></div>}
      {data?.status === 'error' && !error && <p role="alert" className="text-sm mt-3" style={{ color: 'var(--red)' }}>{data.error || 'The cloud connection could not be verified.'}</p>}
      {data?.configured === false && <p className="text-sm mt-3" style={mutedStyle}>Save the InMotion reader credential in <a href="/?tab=credentials" className="underline">Credentials → Cloud</a> to enable this connection.</p>}

      {data?.configured && (
        <>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs mt-3" style={mutedStyle}>
            <span>Region: {connection.region || 'Not available'}</span>
            <span className="break-all">Project: {connection.projectId || 'Not available'}</span>
            <span>{expiresAt ? `Credential expires ${expiresAt}` : 'Credential expiry not available'}</span>
          </div>
          <p className="text-xs mt-1" style={mutedStyle}>{checkedAt ? `Last checked ${checkedAt}${data.cached ? ' · Saved result; refresh for current readings' : ''}` : 'No current authenticated check is available. Refresh to verify the connection.'}</p>

          <h3 className="font-semibold text-sm mt-4">Resource allocation</h3>
          <dl className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2 mt-2">
            <AllocationGauge label="vCPU" shape="ring" quota={data.quotas?.compute?.cores} verified={checks.computeQuotas?.status === 'ok'} />
            <AllocationGauge label="RAM" quota={data.quotas?.compute?.ram} verified={checks.computeQuotas?.status === 'ok'} divisor={1024} unit="GiB" />
            <AllocationGauge label="Block storage" quota={data.quotas?.volume?.gigabytes} verified={checks.volumeQuotas?.status === 'ok'} unit="GiB" />
            <AllocationGauge label="Floating IP" shape="ring" quota={data.quotas?.network?.floating_ips} verified={checks.networkQuotas?.status === 'ok'} />
          </dl>
          <p className="text-xs mt-2" style={mutedStyle}>These gauges show allocated resources against quota. CPU load, memory consumption and egress telemetry are not connected.</p>
          <div className="flex flex-wrap gap-4 text-sm mt-3">
            <span>Instances: <strong>{checks.instances?.status === 'ok' ? `${count(data.instances?.length)}${data.truncated?.instances ? ' shown (more available)' : ''}` : 'Not verified'}</strong></span>
            <span>Volumes: <strong>{checks.volumes?.status === 'ok' ? `${count(data.volumes?.length)}${data.truncated?.volumes ? ' shown (more available)' : ''}` : 'Not verified'}</strong></span>
            <a href="https://central.inmotionhosting.com/projects/rgwvDGgyOk/cloud/overview" target="_blank" rel="noopener noreferrer" className="underline" style={mutedStyle}>InMotion Central</a>
          </div>

          {failedReads.length > 0 && <ul aria-label="Unsuccessful VPC reads" className="text-xs mt-3 space-y-1" style={{ color: 'var(--yellow)' }}>{failedReads.map(([key, label]) => <li key={key}>{label}: {CHECK_LABELS[checks[key].status] || 'Not verified'}{checks[key].httpStatus ? ` (HTTP ${checks[key].httpStatus})` : ''}</li>)}</ul>}

          <details className="mt-4 text-sm">
            <summary className="cursor-pointer font-semibold">Read operations and inventory</summary>
            <ul aria-label="VPC read operations" className="grid grid-cols-1 sm:grid-cols-2 gap-1 mt-3 text-xs" style={mutedStyle}>{CHECKS.map(([key, label]) => <li key={key}>{label}: {CHECK_LABELS[checks[key]?.status] || 'Not checked'}</li>)}</ul>
            {checks.instances?.status === 'ok' && <ReadTable label="VPC instances" columns={[{ key: 'name', label: 'Instance' }, { key: 'status', label: 'Status' }, { key: 'flavor', label: 'VM size' }]} rows={data.instances || []} emptyText="No instances in this project." truncated={data.truncated?.instances} />}
            {checks.volumes?.status === 'ok' && <ReadTable label="VPC volumes" columns={[{ key: 'name', label: 'Volume' }, { key: 'status', label: 'Status' }, { key: 'size', label: 'Size (GiB)' }]} rows={data.volumes || []} emptyText="No volumes in this project." truncated={data.truncated?.volumes} />}
            {checks.flavors?.status === 'ok' && <><ReadTable label="Available VM sizes" columns={[{ key: 'name', label: 'VM size' }, { key: 'vcpus', label: 'vCPUs' }, { key: 'ramMiB', label: 'RAM (MiB)' }, { key: 'diskGiB', label: 'Disk (GiB)' }]} rows={data.flavors || []} emptyText="No VM sizes returned." truncated={data.truncated?.flavors} /><p className="text-xs mt-1" style={mutedStyle}>Available sizes may exceed this project’s quota.</p></>}
          </details>
          {checks.identity?.status === 'ok' && <details className="mt-3 text-sm"><summary className="cursor-pointer font-semibold">Advertised API services ({data.services?.length || 0})</summary><p className="text-xs mt-2" style={mutedStyle}>Listed by the cloud catalog; only the operations above have been tested.</p><ul className="grid grid-cols-1 sm:grid-cols-2 gap-1 mt-2 text-xs" style={mutedStyle}>{(data.services || []).map(service => <li key={`${service.name}-${service.type}`}>{service.name} · {service.type}</li>)}</ul></details>}
        </>
      )}
    </section>
  )
}
