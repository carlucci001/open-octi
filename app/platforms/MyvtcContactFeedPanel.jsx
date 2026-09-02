'use client'

import { useCallback, useEffect, useState } from 'react'
import { Link2, RefreshCw, RotateCcw, Unplug, Webhook } from 'lucide-react'
import styles from './platforms.module.css'

function IconButton({ label, onClick, disabled, children }) {
  return (
    <button
      type="button"
      className={styles.iconButton}
      aria-label={label}
      data-tooltip={label}
      data-tooltip-side="bottom"
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  )
}

function when(value) {
  if (!value) return 'Not available'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? 'Not available' : date.toLocaleString()
}

function resultLine(state) {
  const result = state?.sync?.lastResult
  if (!result) return 'No reconcile run recorded.'
  if (result.error) return `${when(state.sync.lastRunAt)} · ${result.error}`
  return `${when(state.sync.lastRunAt)} · ${result.scanned} scanned · ${result.created} created · ${result.skipped} skipped · ${result.pages} pages${result.stoppedEarly ? ' · page cap reached' : ''}`
}

function ConfirmationDialog({ action, busy, onClose, onConfirm }) {
  const [reason, setReason] = useState('')
  const label = action === 'replace' ? 'Replace webhook' : 'Revoke webhook'
  const valid = reason.trim().length >= 3
  return (
    <div className={styles.wsConfirmOverlay} role="dialog" aria-modal="true" aria-label={label}>
      <form className={styles.wsConfirmDialog} onSubmit={event => { event.preventDefault(); if (valid) onConfirm(reason.trim()) }}>
        <strong>{label}</strong>
        <p className={styles.muted}>This changes the live MyVTC webhook registration and is audit-logged.</p>
        <label>
          Reason (required, min 3 characters)
          <textarea rows={2} value={reason} onChange={event => setReason(event.target.value)} autoFocus />
        </label>
        <div className={styles.formActions}>
          <button type="button" className={styles.secondaryButton} onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className={action === 'revoke' ? styles.dangerButton : styles.primaryButton} disabled={!valid || busy}>
            {busy ? 'Working…' : label}
          </button>
        </div>
      </form>
    </div>
  )
}

export default function MyvtcContactFeedPanel({ onNavigate }) {
  const [state, setState] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [confirmAction, setConfirmAction] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/integrations/myvtc/webhook-registration', { cache: 'no-store' })
      const body = await response.json()
      if (!response.ok) throw new Error(body?.error || 'MyVTC contact-feed status could not be loaded.')
      setState(body)
    } catch (loadError) {
      setError(loadError.message || 'MyVTC contact-feed status could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const mutate = async (action, reason = '') => {
    if (busy) return
    setBusy(action)
    setError('')
    setNotice('')
    try {
      const registrationAction = action === 'register' || action === 'replace' || action === 'revoke'
      const response = await fetch(
        registrationAction ? '/api/integrations/myvtc/webhook-registration' : '/api/integrations/myvtc/sync',
        {
          method: action === 'revoke' ? 'DELETE' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(action === 'replace' ? { replace: true, reason } : action === 'revoke' ? { reason } : {}),
        },
      )
      const body = await response.json()
      if (!response.ok) throw new Error(body?.error || 'The MyVTC action failed.')
      setNotice(action === 'sync' ? 'MyVTC contacts reconciled.' : action === 'revoke' ? 'MyVTC webhook revoked.' : 'MyVTC webhook registered.')
      setConfirmAction('')
      await load()
    } catch (actionError) {
      setError(actionError.message || 'The MyVTC action failed.')
    } finally {
      setBusy('')
    }
  }

  const openLead = leadId => {
    try { sessionStorage.setItem('fcc.leads.openId', leadId) } catch {}
    if (onNavigate) onNavigate('leads')
    else window.location.assign('/?tab=leads')
  }

  return (
    <section className={styles.myvtcPanel} aria-label="MyVTC contact feed">
      <div className={styles.myvtcHeader}>
        <div>
          <span className={styles.sectionLabelSmall}>Contact feed</span>
          <strong>MyVTC leads</strong>
        </div>
        <div className={styles.myvtcActions}>
          {!state?.registered && (
            <IconButton label="Register MyVTC webhook" onClick={() => mutate('register')} disabled={loading || busy || !state?.keyConfigured}>
              <Webhook size={16} />
            </IconButton>
          )}
          {state?.registered && (
            <>
              <IconButton label="Replace MyVTC webhook" onClick={() => setConfirmAction('replace')} disabled={loading || Boolean(busy)}>
                <RotateCcw size={16} />
              </IconButton>
              <IconButton label="Revoke MyVTC webhook" onClick={() => setConfirmAction('revoke')} disabled={loading || Boolean(busy)}>
                <Unplug size={16} />
              </IconButton>
            </>
          )}
          <IconButton label="Sync MyVTC contacts now" onClick={() => mutate('sync')} disabled={loading || busy || !state?.keyConfigured}>
            <RefreshCw size={16} className={busy === 'sync' ? styles.spinning : ''} />
          </IconButton>
        </div>
      </div>

      {loading && <p className={styles.muted}>Loading MyVTC contact-feed status…</p>}
      {!loading && error && <div className={styles.error} role="alert">{error}</div>}
      {!loading && notice && <div className={styles.success} role="status">{notice}</div>}
      {!loading && state && !state.keyConfigured && (
        <p className={styles.muted}>Add the MyVTC integration key to the Command Vault as 'MyVTC Platform Admin' (field: API Key) to enable this.</p>
      )}
      {!loading && state?.keyConfigured && (
        <>
          <div className={styles.myvtcStatus}>
            <span>{state.registered ? `Registered since ${when(state.registeredAt)}` : 'Not registered'}</span>
            {state.remote?.checked && <span>{state.remote.endpoint ? `MyVTC status: ${state.remote.endpoint.status || 'registered'}` : 'MyVTC did not report this endpoint.'}</span>}
            {!state.remote?.checked && state.remote?.error && <span>MyVTC status unavailable.</span>}
          </div>
          <p className={styles.muted}>Last reconcile: {resultLine(state)}</p>
          <div className={styles.myvtcEvents}>
            {(state.recentEvents || []).map(event => (
              <div key={event.id} className={styles.myvtcEvent}>
                <span><strong>{event.type}</strong><small>{when(event.receivedAt)}</small></span>
                <span className={styles.chip}>{event.outcome || 'received'}</span>
                {event.leadId ? (
                  <button type="button" className={styles.myvtcLeadLink} onClick={() => openLead(event.leadId)}>
                    <Link2 size={13} /> Open lead
                  </button>
                ) : <span className={styles.muted}>No lead</span>}
              </div>
            ))}
            {!state.recentEvents?.length && <p className={styles.muted}>No MyVTC webhook events recorded.</p>}
          </div>
        </>
      )}

      {confirmAction && (
        <ConfirmationDialog
          action={confirmAction}
          busy={Boolean(busy)}
          onClose={() => setConfirmAction('')}
          onConfirm={reason => mutate(confirmAction, reason)}
        />
      )}
    </section>
  )
}
