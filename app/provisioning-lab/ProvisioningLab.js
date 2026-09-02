'use client'

import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Loader2, PhoneCall, RefreshCw, Search, ShieldCheck } from 'lucide-react'
import PageHeader from '../components/PageHeader'
import ThemedSelect from '../components/ThemedSelect'
import ProvisionedTwilioLines from './ProvisionedTwilioLines'
import { resolveCommunicationLineForLease } from '../../lib/communicationLines'

const inputStyle = {
  minHeight: 40,
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  color: 'var(--text)',
  padding: '0 10px',
  fontSize: 13,
  outline: 'none',
}

const buttonBase = {
  minHeight: 40,
  borderRadius: 8,
  padding: '0 12px',
  fontSize: 13,
  fontWeight: 750,
  border: '1px solid var(--border)',
  cursor: 'pointer',
}

function fmtPhone(value = '') {
  const d = String(value).replace(/\D/g, '').slice(-10)
  if (d.length !== 10) return value || 'No number'
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
}

function leaseLabel(lease) {
  return `${lease.tenantName || 'Client'} / ${lease.agentName || lease.agentId}`
}

export default function ProvisioningLab() {
  const [leases, setLeases] = useState([])
  const [agents, setAgents] = useState([])
  const [tenants, setTenants] = useState([])
  const [communicationLines, setCommunicationLines] = useState([])
  const [selectedLeaseId, setSelectedLeaseId] = useState('')
  const [areaCode, setAreaCode] = useState('828')
  const [numbers, setNumbers] = useState([])
  const [selectedNumber, setSelectedNumber] = useState('')
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const [provisioning, setProvisioning] = useState(false)
  const [message, setMessage] = useState(null)

  const reload = async () => {
    setLoading(true)
    setMessage(null)
    try {
      const [leasesRes, agentsRes, tenantsRes] = await Promise.all([
        fetch('/api/leases', { cache: 'no-store' }).then(r => r.json()),
        fetch('/api/openclaw/agents', { cache: 'no-store' }).then(r => r.json()),
        fetch('/api/tenants', { cache: 'no-store' }).then(r => r.json()),
      ])
      if (!leasesRes.ok) throw new Error(leasesRes.error || 'Could not load leases')
      setLeases(leasesRes.leases || [])
      setAgents(agentsRes.agents || [])
      setTenants(tenantsRes.tenants || [])
      setCommunicationLines(tenantsRes.communicationLines || [])
      const active = (leasesRes.leases || []).filter(l => l.status === 'active')
      if (!selectedLeaseId && active[0]) setSelectedLeaseId(active[0].id)
    } catch (e) {
      setMessage({ kind: 'err', text: e.message || 'Provisioning Lab failed to load' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { reload() }, [])

  const activeLeases = useMemo(() => leases.filter(l => l.status === 'active'), [leases])
  const selectedLease = activeLeases.find(l => l.id === selectedLeaseId) || activeLeases[0] || null
  const selectedAgent = selectedLease ? agents.find(a => a.id === selectedLease.agentId) : null
  const selectedTenant = selectedLease ? tenants.find(t => t.id === selectedLease.tenantId) : null
  const selectedAssignedLine = resolveCommunicationLineForLease(selectedLease, { assignments: communicationLines })
  const selectedPhone = selectedLease?.twilioPhoneNumber || selectedAssignedLine?.phoneNumber || ''

  const searchNumbers = async () => {
    setSearching(true)
    setMessage(null)
    setNumbers([])
    setSelectedNumber('')
    try {
      const res = await fetch(`/api/twilio/available-numbers?areaCode=${encodeURIComponent(areaCode)}&limit=10`, { cache: 'no-store' })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error || 'Could not search Twilio numbers')
      setNumbers(json.numbers || [])
      if (json.numbers?.[0]?.phoneNumber) setSelectedNumber(json.numbers[0].phoneNumber)
      setMessage({ kind: 'ok', text: `Found ${json.count || 0} available ${json.areaCode} number${json.count === 1 ? '' : 's'}.` })
    } catch (e) {
      setMessage({ kind: 'err', text: e.message || 'Number search failed' })
    } finally {
      setSearching(false)
    }
  }

  const provision = async () => {
    if (!selectedLease) return
    if (selectedPhone) return
    if (!selectedNumber && !confirm(`No prepared number is selected. Buy the first available ${areaCode} number instead?`)) return
    if (!confirm(`Provision ${selectedNumber ? fmtPhone(selectedNumber) : `an ${areaCode} number`} for ${leaseLabel(selectedLease)}? This buys a Twilio number and attempts to bind it to the agent voice runtime.`)) return

    setProvisioning(true)
    setMessage(null)
    try {
      const res = await fetch('/api/twilio/provision-number', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leaseId: selectedLease.id, areaCode, phoneNumber: selectedNumber || undefined }),
      })
      const json = await res.json()
      if (!json.ok) throw new Error(json.error || 'Provisioning failed')
      setMessage({ kind: json.partial ? 'warn' : 'ok', text: json.message || 'Phone provisioned.' })
      setNumbers([])
      setSelectedNumber('')
      await reload()
    } catch (e) {
      setMessage({ kind: 'err', text: e.message || 'Provisioning failed' })
    } finally {
      setProvisioning(false)
    }
  }

  return (
    <div className="provisioning-lab-workspace command-workspace lab-mobile-dense p-6">
      <PageHeader
        icon={<PhoneCall size={20} />}
        title="Provisioning Lab"
        subtitle={`${activeLeases.length} active lease${activeLeases.length === 1 ? '' : 's'} / Area ${areaCode || 'n/a'}`}
        actions={(
          <button type="button" onClick={reload} disabled={loading} aria-label="Refresh provisioning data" data-tooltip="Refresh provisioning data" data-tooltip-side="bottom" style={{ ...buttonBase, background: 'var(--surface2)', color: 'var(--text-muted)' }}>
            {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
          </button>
        )}
      />

      {message && (
        <div className="mb-3 rounded-lg px-3 py-2 text-sm" style={{
          background: message.kind === 'err' ? 'rgba(220,38,38,0.12)' : message.kind === 'warn' ? 'rgba(245,158,11,0.12)' : 'var(--accent-soft)',
          color: message.kind === 'err' ? 'var(--red)' : message.kind === 'warn' ? '#b45309' : 'var(--text)',
          border: '1px solid var(--border)',
        }}>{message.text}</div>
      )}

      <ProvisionedTwilioLines lines={communicationLines} />

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)] gap-3">
        <section className="rounded-lg" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="flex items-center justify-between gap-2 px-3 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <div>
              <h2 className="text-sm font-bold" style={{ color: 'var(--text)' }}>Client Agent Queue</h2>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Active leases that can receive infrastructure.</p>
            </div>
            <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>{loading ? 'Refreshing...' : 'Live queue'}</span>
          </div>

          <div className="overflow-x-auto">
            <div className="grid" style={{ minWidth: 760 }}>
              <div className="grid grid-cols-[1.2fr_1fr_130px_150px] gap-3 px-3 py-2 text-[10px] font-bold uppercase" style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
                <div>Owner</div>
                <div>Agent</div>
                <div>Phone</div>
                <div>Runtime</div>
              </div>
              {activeLeases.map(lease => {
                const active = lease.id === selectedLease?.id
                const agent = agents.find(a => a.id === lease.agentId)
                const assignedLine = resolveCommunicationLineForLease(lease, { assignments: communicationLines })
                const assignedPhone = lease.twilioPhoneNumber || assignedLine?.phoneNumber || ''
                return (
                  <button
                    key={lease.id}
                    type="button"
                    onClick={() => {
                      setSelectedLeaseId(lease.id)
                      setNumbers([])
                      setSelectedNumber('')
                    }}
                    className="grid grid-cols-[1.2fr_1fr_130px_150px] gap-3 px-3 py-3 text-left"
                    style={{
                      minWidth: 760,
                      borderBottom: '1px solid var(--border)',
                      background: active ? 'var(--accent-soft)' : 'transparent',
                      color: 'var(--text)',
                    }}
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{lease.tenantName || lease.clientAccountId}</div>
                      <div className="truncate text-xs" style={{ color: 'var(--text-muted)' }}>{lease.tierName || 'Custom lease'} · ${lease.monthlyFee || 0}/mo</div>
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{lease.agentName || lease.agentId}</div>
                      <div className="truncate text-xs" style={{ color: 'var(--text-muted)' }}>{agent?.role || agent?.category || 'Agent'}</div>
                    </div>
                    <div className="text-xs font-semibold" style={{ color: assignedPhone ? 'var(--accent)' : 'var(--text-muted)' }}>
                      {assignedPhone ? fmtPhone(assignedPhone) : 'No phone'}
                    </div>
                    <div className="text-xs" style={{ color: lease.elevenLabsImportStatus === 'live' ? 'var(--accent)' : 'var(--text-muted)' }}>
                      {lease.elevenLabsImportStatus === 'live' ? 'ElevenLabs live' : lease.elevenLabsImportStatus === 'pending-manual' ? 'EL manual bind' : assignedPhone ? 'Twilio live' : 'Needs bind'}
                    </div>
                  </button>
                )
              })}
              {!activeLeases.length && (
                <div className="px-3 py-8 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
                  No active leases yet. Lease an agent from Agent Lab or Agents first.
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-lg p-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2 mb-3">
            <ShieldCheck size={18} style={{ color: 'var(--accent)' }} />
            <div>
              <h2 className="text-sm font-bold" style={{ color: 'var(--text)' }}>Phone Prep</h2>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Search, select, buy, and bind a number.</p>
            </div>
          </div>

          <label className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>Lease</label>
          <ThemedSelect value={selectedLease?.id || ''} onChange={e => setSelectedLeaseId(e.target.value)} style={{ ...inputStyle, width: '100%', marginBottom: 10 }}>
            {activeLeases.map(lease => <option key={lease.id} value={lease.id}>{leaseLabel(lease)}</option>)}
          </ThemedSelect>

          <div className="rounded-lg p-3 mb-3" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Selected owner</div>
            <div className="text-sm font-bold" style={{ color: 'var(--text)' }}>{selectedTenant?.name || selectedLease?.tenantName || 'No lease selected'}</div>
            <div className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>Agent</div>
            <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{selectedAgent?.name || selectedLease?.agentName || 'No agent'}</div>
            <div className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>Current phone</div>
            <div className="text-sm font-semibold" style={{ color: selectedPhone ? 'var(--accent)' : 'var(--text)' }}>{fmtPhone(selectedPhone)}</div>
          </div>

          <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-2 mb-3">
            <input value={areaCode} onChange={e => setAreaCode(e.target.value.replace(/\D/g, '').slice(0, 3))} aria-label="Area code" style={inputStyle} />
            <button type="button" onClick={searchNumbers} disabled={!selectedLease || !!selectedPhone || searching} style={{ ...buttonBase, background: 'var(--surface2)', color: 'var(--text)' }}>
              {searching ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />} Search Numbers
            </button>
          </div>

          <div className="grid gap-2 mb-3">
            {numbers.map(number => {
              const selected = selectedNumber === number.phoneNumber
              return (
                <button
                  key={number.phoneNumber}
                  type="button"
                  onClick={() => setSelectedNumber(number.phoneNumber)}
                  className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-left"
                  style={{
                    background: selected ? 'var(--accent-soft)' : 'var(--surface2)',
                    color: 'var(--text)',
                    border: selected ? '1px solid var(--accent)' : '1px solid var(--border)',
                  }}
                >
                  <span>
                    <span className="block text-sm font-bold">{fmtPhone(number.phoneNumber)}</span>
                    <span className="block text-xs" style={{ color: 'var(--text-muted)' }}>{number.locality || 'US local'} {number.region || ''} · voice {number.sms ? '+ SMS' : ''}</span>
                  </span>
                  {selected && <CheckCircle2 size={17} style={{ color: 'var(--accent)' }} />}
                </button>
              )
            })}
          </div>

          <button
            type="button"
            disabled={!selectedLease || !!selectedPhone || provisioning}
            onClick={provision}
            style={{
              ...buttonBase,
              width: '100%',
              background: selectedPhone ? 'var(--surface2)' : 'var(--accent)',
              color: selectedPhone ? 'var(--text-muted)' : 'var(--accent-text)',
              borderColor: selectedPhone ? 'var(--border)' : 'var(--accent)',
              opacity: provisioning ? 0.7 : 1,
            }}
          >
            {provisioning ? 'Provisioning...' : selectedPhone ? 'Phone already provisioned' : 'Provision Selected Number'}
          </button>
        </section>
      </div>
    </div>
  )
}
