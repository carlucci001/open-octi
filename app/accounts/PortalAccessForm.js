'use client'
import { useState } from 'react'

export default function PortalAccessForm({ account, onEnabled, onCancel, loginEmail: suggestedEmail = '', opportunityId, initialPortal, portalAvailable = true }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [accessMode, setAccessMode] = useState(!portalAvailable ? 'account_only' : initialPortal?.complimentary ? 'complimentary' : 'payg')
  const complimentary = accessMode === 'complimentary'
  const [loginEmail, setLoginEmail] = useState(account.email || suggestedEmail)
  const [requestId] = useState(() => globalThis.crypto?.randomUUID?.() || `portal-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`)
  const [complimentaryDuration, setComplimentaryDuration] = useState(initialPortal?.complimentaryDuration || (initialPortal?.complimentary ? initialPortal?.complimentaryExpiresAt ? 'custom' : 'never' : '30_days'))
  const [complimentaryExpiresAt, setComplimentaryExpiresAt] = useState(initialPortal?.complimentaryExpiresAt?.slice(0, 10) || '')
  const [complimentaryReason, setComplimentaryReason] = useState(initialPortal?.complimentaryReason || '30-day concierge introduction')
  const [grantCredits, setGrantCredits] = useState(false)
  const [credits, setCredits] = useState(10000)
  const [creditExpiration, setCreditExpiration] = useState('30_days')
  const [creditExpiresAt, setCreditExpiresAt] = useState('')
  const [creditReason, setCreditReason] = useState('30-day concierge trial')
  const [voiceEnabled, setVoiceEnabled] = useState(initialPortal?.conciergeVoice?.enabled === true)
  const [dailyVoiceMinutes, setDailyVoiceMinutes] = useState((initialPortal?.conciergeVoice?.dailySeconds || 900) / 60)
  const [maxSessionMinutes, setMaxSessionMinutes] = useState((initialPortal?.conciergeVoice?.maxSessionSeconds || 600) / 60)
  const [idleTimeoutSeconds, setIdleTimeoutSeconds] = useState(initialPortal?.conciergeVoice?.idleTimeoutSeconds || 90)

  const enable = async event => {
    event.preventDefault()
    if (busy) return
    setError('')
    if (accessMode !== 'account_only' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(loginEmail.trim())) { setError('Enter a valid email for portal sign-in.'); return }
    if (complimentary && complimentaryReason.trim().length < 3) {
      setError('Enter a reason for complimentary status.')
      return
    }
    if (complimentary && complimentaryDuration === 'custom' && !complimentaryExpiresAt) {
      setError('Choose a complimentary expiration date.')
      return
    }
    if (accessMode !== 'account_only' && grantCredits && (!Number.isSafeInteger(Number(credits)) || Number(credits) < 1)) {
      setError('Enter a whole promotional credit amount greater than zero.')
      return
    }
    if (accessMode !== 'account_only' && grantCredits && creditReason.trim().length < 3) {
      setError('Enter a reason for the promotional credit audit trail.')
      return
    }
    if (accessMode !== 'account_only' && grantCredits && creditExpiration === 'custom' && !creditExpiresAt) {
      setError('Choose a promotional credit expiration date.')
      return
    }
    setBusy(true)
    try {
      const r = await fetch(accessMode === 'account_only' ? '/api/accounts' : '/api/accounts/enable-portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(accessMode === 'account_only' ? {
          action: 'promote_to_client', accountId: account.id, opportunityId,
          note: portalAvailable ? 'Client account created from client setup; portal access deferred.' : 'Client account created from the pipeline without changing the opportunity stage.',
        } : {
          accountId: account.id,
          loginEmail: loginEmail.trim().toLowerCase(),
          promoteToClient: true,
          opportunityId,
          complimentary,
          ...(complimentary ? {
            complimentaryDuration,
            complimentaryReason: complimentaryReason.trim(),
            ...(complimentaryDuration === 'custom' ? { complimentaryExpiresAt } : {}),
          } : {}),
          promotionalCreditGrant: {
            enabled: grantCredits,
            ...(grantCredits ? {
              credits: Number(credits),
              expiration: creditExpiration,
              ...(creditExpiration === 'custom' ? { expiresAt: creditExpiresAt } : {}),
              reason: creditReason.trim(),
              requestId,
            } : {}),
          },
          conciergeVoice: {
            enabled: voiceEnabled,
            ...(voiceEnabled ? {
              dailySeconds: Number(dailyVoiceMinutes) * 60,
              maxSessionSeconds: Number(maxSessionMinutes) * 60,
              idleTimeoutSeconds: Number(idleTimeoutSeconds),
              warningThresholds: [50, 75, 90, 100],
            } : {}),
          },
        }),
      })
      const j = await r.json()
      if (!r.ok || !j.ok) throw new Error(j.error || 'Could not set up the client account')
      onEnabled?.(j)
    } catch (e) {
      setError(e.message || 'Could not set up the client account')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={enable} className="w-full rounded-xl p-4 grid gap-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow)' }} aria-label={`${portalAvailable ? 'Portal access' : 'Client account'} options for ${account.name}`}>
      <fieldset className="grid gap-2">
        <legend className="text-sm font-semibold mb-2">Choose the client relationship</legend>
        {(portalAvailable ? [
          ['payg', 'Pay as you go', 'Enable the client portal to explore services and request work without a monthly subscription.'],
          ['complimentary', 'Complimentary account', 'Give portal access for marketing, an introduction, or an ongoing relationship. Choose the duration below.'],
          ...(account.type === 'prospect' ? [['account_only', 'Client account only', 'Promote the prospect now and set up portal access later.']] : []),
        ] : [['account_only', 'Client account', 'Convert this prospect while keeping its contacts, opportunities, and pipeline stage.']]).map(([value, label, detail]) => (
          <label key={value} className="flex items-start gap-3 rounded-lg p-3 cursor-pointer" style={{ border: `1px solid ${accessMode === value ? 'var(--accent)' : 'var(--border)'}`, background: accessMode === value ? 'var(--accent-soft)' : 'var(--surface2)' }}>
            <input type="radio" name="client-access-mode" value={value} checked={accessMode === value} onChange={() => setAccessMode(value)} className="mt-1" />
            <span><strong className="text-sm block">{label}</strong><span className="text-xs" style={{ color: 'var(--text-muted)' }}>{detail}</span></span>
          </label>
        ))}
      </fieldset>
      {error && <div role="alert" className="rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--red-dim)', color: 'var(--red)' }}>{error}</div>}
      {accessMode !== 'account_only' && <>
      <label className="grid gap-1 text-sm">Portal sign-in email
        <input type="email" required readOnly={initialPortal?.status === 'active' && Boolean(account.email)} value={loginEmail} onChange={event => setLoginEmail(event.target.value)} className="rounded-lg px-3 min-h-12" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }} />
      </label>
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>This email becomes the account's sign-in address. Customers request a secure email link from the client sign-in page on their phone or computer.</p>
      {complimentary && (
        <div className="grid sm:grid-cols-2 gap-2 pl-6">
          <label className="grid gap-1 text-xs">Duration
            <select value={complimentaryDuration} onChange={event => setComplimentaryDuration(event.target.value)} className="rounded-lg px-3 min-h-12" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
              <option value="30_days">30 days</option>
              <option value="custom">Custom date</option>
              <option value="never">No expiration</option>
            </select>
          </label>
          {complimentaryDuration === 'custom' && <label className="grid gap-1 text-xs">Expires
            <input type="date" value={complimentaryExpiresAt} onChange={event => setComplimentaryExpiresAt(event.target.value)} className="rounded-lg px-3 min-h-12" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }} />
          </label>}
          <label className="grid gap-1 text-xs sm:col-span-2">Authorization reason
            <input value={complimentaryReason} maxLength={300} onChange={event => setComplimentaryReason(event.target.value)} className="rounded-lg px-3 min-h-12" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }} />
          </label>
        </div>
      )}

      <label className="flex items-start gap-3 min-h-12">
        <input type="checkbox" checked={grantCredits} onChange={event => setGrantCredits(event.target.checked)} className="mt-1" />
        <span><strong className="text-sm block">Grant promotional credits</strong><span className="text-xs" style={{ color: 'var(--text-muted)' }}>Separate from portal and comp status.</span></span>
      </label>
      {grantCredits && (
        <div className="grid sm:grid-cols-2 gap-2 pl-6">
          <label className="grid gap-1 text-xs">Credits
            <input type="number" min="1" max="1000000" step="1" value={credits} onChange={event => setCredits(Number(event.target.value))} className="rounded-lg px-3 min-h-12" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }} />
          </label>
          <label className="grid gap-1 text-xs">Expiration
            <select value={creditExpiration} onChange={event => setCreditExpiration(event.target.value)} className="rounded-lg px-3 min-h-12" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
              <option value="30_days">30 days</option>
              <option value="custom">Custom date</option>
              <option value="never">Never</option>
            </select>
          </label>
          {creditExpiration === 'custom' && <label className="grid gap-1 text-xs sm:col-span-2">Credit expiration date
            <input type="date" value={creditExpiresAt} onChange={event => setCreditExpiresAt(event.target.value)} className="rounded-lg px-3 min-h-12" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }} />
          </label>}
          <label className="grid gap-1 text-xs sm:col-span-2">Grant reason
            <input value={creditReason} maxLength={300} onChange={event => setCreditReason(event.target.value)} className="rounded-lg px-3 min-h-12" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }} />
          </label>
        </div>
      )}

      <label className="flex items-start gap-3 min-h-12">
        <input type="checkbox" checked={voiceEnabled} onChange={event => setVoiceEnabled(event.target.checked)} className="mt-1" />
        <span><strong className="text-sm block">Include premium Cheryl voice allowance</strong><span className="text-xs" style={{ color: 'var(--text-muted)' }}>Usage-limited and independent from credits.</span></span>
      </label>
      {voiceEnabled && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pl-6">
          <label className="grid gap-1 text-xs">Daily minutes
            <input type="number" min="1" step="1" value={dailyVoiceMinutes} onChange={event => setDailyVoiceMinutes(Number(event.target.value))} className="rounded-lg px-3 min-h-12" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }} />
          </label>
          <label className="grid gap-1 text-xs">Session minutes
            <input type="number" min="1" step="1" value={maxSessionMinutes} onChange={event => setMaxSessionMinutes(Number(event.target.value))} className="rounded-lg px-3 min-h-12" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }} />
          </label>
          <label className="grid gap-1 text-xs">Idle seconds
            <input type="number" min="1" step="1" value={idleTimeoutSeconds} onChange={event => setIdleTimeoutSeconds(Number(event.target.value))} className="rounded-lg px-3 min-h-12" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }} />
          </label>
        </div>
      )}

      </>}
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{accessMode === 'account_only' ? `The opportunity stays in its current pipeline stage.${portalAvailable ? ' Portal access will still need setup.' : ''}` : 'Service purchases and metered usage follow the account’s subscriptions, credits, and allowances. Creating this account does not place an order.'}</p>
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} disabled={busy} className="px-3 min-h-12 rounded-lg text-sm" style={{ border: '1px solid var(--border)', color: 'var(--text-muted)' }}>Cancel</button>
        <button type="submit" disabled={busy} aria-busy={busy} className="px-4 min-h-12 rounded-lg text-sm font-semibold disabled:opacity-60" style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}>{busy ? 'Setting up…' : accessMode === 'account_only' ? 'Create client account' : complimentary ? 'Create complimentary account' : 'Enable pay-as-you-go access'}</button>
      </div>
    </form>
  )
}
