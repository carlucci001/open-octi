'use client'

import { useEffect, useMemo, useState } from 'react'
import { Coins, Gift, RefreshCw, ShieldCheck } from 'lucide-react'

const PRESETS = [500, 2500, 5000, 10000]

function number(value) {
  return new Intl.NumberFormat('en-US').format(Number(value || 0))
}

export default function CreditGrantManager({ onToast }) {
  const [clients, setClients] = useState([])
  const [leaseId, setLeaseId] = useState('')
  const [credits, setCredits] = useState(2500)
  const [reason, setReason] = useState('Launch and demonstration capacity')
  const [expiration, setExpiration] = useState('never')
  const [expiresAt, setExpiresAt] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [lastGrant, setLastGrant] = useState(null)

  const selected = useMemo(() => clients.find(client => client.leaseId === leaseId) || null, [clients, leaseId])

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/admin/credit-grants', { cache: 'no-store' })
      const result = await response.json()
      if (!response.ok || !result.ok) throw new Error(result.error || 'Could not load client wallets.')
      setClients(result.clients || [])
      setLeaseId(current => current || result.clients?.[0]?.leaseId || '')
    } catch (loadError) {
      setError(loadError.message || 'Could not load client wallets.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const issue = async event => {
    event.preventDefault()
    if (!selected || saving) return
    const wholeCredits = Number(credits)
    if (!Number.isSafeInteger(wholeCredits) || wholeCredits < 1) {
      setError('Enter a whole credit amount greater than zero.')
      return
    }
    if (reason.trim().length < 3) {
      setError('Enter a reason for the audit trail.')
      return
    }
    if (expiration === 'custom' && (!expiresAt || new Date(expiresAt).getTime() <= Date.now())) {
      setError('Choose a custom expiration date in the future.')
      return
    }
    const expiryDescription = expiration === 'never'
      ? 'that do not expire'
      : expiration === '30_days'
        ? 'that expire after 30 days'
        : `that expire on ${new Date(expiresAt).toLocaleDateString()}`
    if (!window.confirm(`Issue ${number(wholeCredits)} credits ${expiryDescription} to ${selected.accountName}?\n\nReason: ${reason.trim()}`)) return

    setSaving(true)
    setError('')
    try {
      const requestId = globalThis.crypto?.randomUUID?.()
        || `grant-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
      const response = await fetch('/api/admin/credit-grants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leaseId,
          credits: wholeCredits,
          reason: reason.trim(),
          expiration,
          ...(expiration === 'custom' ? { expiresAt } : {}),
          requestId,
        }),
      })
      const result = await response.json()
      if (!response.ok || !result.ok) throw new Error(result.error || 'Credits could not be issued.')
      setClients(result.clients || clients)
      setLastGrant({ ...result.grant, accountName: selected.accountName })
      onToast?.(`${number(wholeCredits)} credits issued to ${selected.accountName}`)
    } catch (saveError) {
      setError(saveError.message || 'Credits could not be issued.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div role="status" aria-busy="true" className="rounded-xl p-6" style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}>Loading client wallets…</div>

  return (
    <div className="grid gap-5">
      <section className="rounded-2xl p-5 sm:p-6" style={{ background: 'linear-gradient(145deg, color-mix(in srgb, var(--surface) 94%, var(--accent) 6%), var(--surface))', border: '1px solid var(--border)', boxShadow: '0 18px 42px rgba(0,0,0,0.08)' }}>
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-6">
          <div className="flex items-start gap-3">
            <span className="inline-flex items-center justify-center w-12 h-12 rounded-xl" style={{ background: 'color-mix(in srgb, var(--accent) 14%, var(--surface2))', color: 'var(--accent)' }}>
              <Coins size={24} aria-hidden="true" />
            </span>
            <div>
              <div className="text-xs uppercase tracking-widest font-semibold" style={{ color: 'var(--text-muted)' }}>Owner credit console</div>
              <h2 className="text-2xl font-semibold mt-1">Issue client service credits</h2>
              <p className="text-sm mt-2 max-w-2xl" style={{ color: 'var(--text-muted)' }}>Add permanent or time-limited capacity for any active client. Every grant is tenant-scoped and written to the billing audit trail.</p>
            </div>
          </div>
          <button type="button" onClick={load} className="inline-flex items-center justify-center rounded-lg w-12 h-12" style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }} title="Refresh client balances" aria-label="Refresh client balances">
            <RefreshCw size={18} aria-hidden="true" />
          </button>
        </div>

        {error && <div role="alert" className="rounded-lg px-4 py-3 mb-4 text-sm" style={{ background: 'var(--red-dim)', color: 'var(--red)' }}>{error}</div>}

        <form onSubmit={issue} className="grid gap-5">
          <label className="grid gap-2">
            <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: 'var(--text-muted)' }}>Client</span>
            <select value={leaseId} onChange={event => setLeaseId(event.target.value)} className="rounded-lg px-3 min-h-12" style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}>
              {clients.length === 0 && <option value="">No active portal clients</option>}
              {clients.map(client => <option key={client.leaseId} value={client.leaseId}>{client.accountName} · {client.tierName}</option>)}
            </select>
          </label>

          <fieldset className="grid gap-2">
            <legend className="text-xs uppercase tracking-wider font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>Expiration</legend>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {[
                ['never', 'Never'],
                ['30_days', '30 days'],
                ['custom', 'Custom date'],
              ].map(([value, label]) => (
                <label key={value} className="min-h-12 rounded-lg px-3 flex items-center gap-2 cursor-pointer" style={{ border: expiration === value ? '1px solid var(--accent)' : '1px solid var(--border)', background: 'var(--surface2)', color: expiration === value ? 'var(--accent)' : 'var(--text)' }}>
                  <input type="radio" name="credit-expiration" value={value} checked={expiration === value} onChange={() => setExpiration(value)} />
                  <span className="text-sm font-semibold">{label}</span>
                </label>
              ))}
            </div>
            {expiration === 'custom' && (
              <label className="grid gap-2 mt-1">
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Credits become unavailable at the start of this date.</span>
                <input type="date" value={expiresAt} onChange={event => setExpiresAt(event.target.value)} className="rounded-lg px-3 min-h-12" style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }} aria-label="Custom credit expiration date" />
              </label>
            )}
          </fieldset>

          {selected && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Balance label="Available now" value={selected.availableCredits} />
              <Balance label="Included plan" value={selected.includedCredits} />
              <Balance label="Issued / purchased" value={selected.issuedCredits} />
            </div>
          )}

          <fieldset className="grid gap-2">
            <legend className="text-xs uppercase tracking-wider font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>Credit amount</legend>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {PRESETS.map(preset => (
                <button key={preset} type="button" onClick={() => setCredits(preset)} className="rounded-lg min-h-12 px-3 text-sm font-semibold" style={{ border: credits === preset ? '1px solid var(--accent)' : '1px solid var(--border)', background: credits === preset ? 'color-mix(in srgb, var(--accent) 12%, var(--surface2))' : 'var(--surface2)', color: credits === preset ? 'var(--accent)' : 'var(--text)' }}>{number(preset)}</button>
              ))}
            </div>
            <input type="number" min="1" max="1000000" step="1" value={credits} onChange={event => setCredits(Number(event.target.value))} className="rounded-lg px-3 min-h-12 mt-1" style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }} aria-label="Custom credit amount" />
          </fieldset>

          <label className="grid gap-2">
            <span className="text-xs uppercase tracking-wider font-semibold" style={{ color: 'var(--text-muted)' }}>Reason</span>
            <input value={reason} maxLength={300} onChange={event => setReason(event.target.value)} className="rounded-lg px-3 min-h-12" style={{ background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }} placeholder="Launch credit, service recovery, promotion…" />
          </label>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-1">
            <span className="inline-flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}><ShieldCheck size={16} aria-hidden="true" /> Owner-only · optional expiry · fully audited</span>
            <button type="submit" disabled={!selected || saving} className="inline-flex items-center justify-center gap-2 rounded-lg px-5 min-h-12 text-sm font-semibold disabled:opacity-50" style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}>
              <Gift size={18} aria-hidden="true" /> {saving ? 'Issuing credits…' : `Issue ${number(credits)} credits`}
            </button>
          </div>
        </form>
      </section>

      {lastGrant && (
        <section className="rounded-xl p-4 flex items-start gap-3" style={{ background: 'var(--green-dim)', color: 'var(--green)', border: '1px solid color-mix(in srgb, var(--green) 32%, transparent)' }} aria-live="polite">
          <ShieldCheck size={20} aria-hidden="true" />
          <div><strong>{number(lastGrant.credits)} credits issued to {lastGrant.accountName}</strong><div className="text-sm mt-1">{lastGrant.reason} · {lastGrant.expiresAt ? `Expires ${new Date(lastGrant.expiresAt).toLocaleDateString()} · ` : 'No expiration · '}{new Date(lastGrant.createdAt).toLocaleString()}</div></div>
        </section>
      )}
    </div>
  )
}

function Balance({ label, value }) {
  return <div className="rounded-xl p-4" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}><div className="text-xs uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>{label}</div><strong className="block text-2xl mt-1">{number(value)}</strong><span className="text-xs" style={{ color: 'var(--text-muted)' }}>credits</span></div>
}
