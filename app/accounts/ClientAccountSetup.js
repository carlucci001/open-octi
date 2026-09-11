'use client'
import { useEffect, useRef, useState } from 'react'
import PortalAccessForm from './PortalAccessForm'
import { isOpenOcti } from '@/lib/edition'

export function ClientSetupAction({ accountName, onClick }) {
  const label = `Set up client account${isOpenOcti() ? '' : ' or complimentary access'} for ${accountName || 'this opportunity'}`
  return <button type="button" title={label} aria-label={label} onClick={onClick} onKeyDown={event => event.stopPropagation()}
    className="inline-flex items-center justify-center w-9 h-9 rounded-lg shrink-0"
    style={{ color: 'var(--green)', background: 'var(--green-soft)', border: '1px solid var(--border)' }}>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="9" cy="7" r="4" /><path d="M2 21v-2a7 7 0 0 1 12-5M19 13v8m-4-4h8" /></svg>
  </button>
}

export function EnablePortalButton({ account, onEnabled }) {
  const [open, setOpen] = useState(false)
  return <>
    <ClientSetupAction accountName={account.name} onClick={() => setOpen(true)} />
    {open && <ClientAccountSetup accountId={account.id} accountName={account.name} onChanged={onEnabled} onClose={() => setOpen(false)} />}
  </>
}

export default function ClientAccountSetup({ accountId, accountName, opportunityId, onClose, onChanged, onOpenAccount }) {
  const portalAvailable = !isOpenOcti()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [changed, setChanged] = useState(false)
  const panel = useRef(null)

  const load = async () => {
    setLoading(true); setError('')
    try {
      const response = await fetch(portalAvailable ? `/api/accounts/enable-portal?accountId=${encodeURIComponent(accountId)}` : `/api/accounts?id=${encodeURIComponent(accountId)}`)
      const body = await response.json()
      if (!response.ok || !body.account || (portalAvailable && !body.ok)) throw new Error(body.error || 'Could not load client setup.')
      setData(body)
    } catch (failure) { setError(failure.message || 'Could not load client setup.') }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [accountId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const previous = document.activeElement
    panel.current?.focus()
    return () => previous?.focus?.()
  }, [])

  const completed = body => {
    setResult(body); setEditing(false)
    setChanged(true)
    setData(current => ({ ...current, account: { ...current.account, ...body.account, ...(body.login?.email ? { email: body.login.email } : {}) }, login: body.login || current.login,
      portal: body.portalEnabled ? { ...current.portal, status: 'active', complimentary: body.complimentary, complimentaryDuration: body.complimentaryDuration, complimentaryReason: body.complimentaryReason, complimentaryExpiresAt: body.complimentaryExpiresAt, conciergeVoice: body.conciergeVoice } : current.portal }))
  }
  const finish = () => { if (changed) onChanged?.(result); onClose() }
  const existingReady = portalAvailable ? data?.portal?.status === 'active' && data?.login?.ready && data?.account?.type !== 'prospect' : data?.account?.type === 'client'
  const showSummary = !editing && (result || existingReady)
  const portalReady = portalAvailable && (result ? result.portalEnabled === true : existingReady)
  const login = result?.login || data?.login
  const comp = result ? result.complimentary : data?.portal?.complimentary
  const name = data?.account?.name || accountName || 'Client account'
  const openAccount = () => {
    try { sessionStorage.setItem('fcc.accounts.openId', accountId) } catch {}
    if (onOpenAccount) { finish(); onOpenAccount(data?.account || { id: accountId, name }); return }
    try { sessionStorage.setItem('fcc.accounts.prefillSearch', name) } catch {}
    window.location.assign('/?tab=accounts')
  }
  const trapFocus = event => {
    if (event.key !== 'Tab') return
    const controls = [...panel.current.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]')].filter(element => element.getClientRects().length)
    const first = controls[0], last = controls[controls.length - 1]
    if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last?.focus() }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
  }
  return <div className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-6" style={{ background: 'rgba(0,0,0,.65)', backdropFilter: 'blur(5px)' }}>
    <section role="dialog" aria-modal="true" aria-labelledby="client-setup-title" tabIndex={-1} ref={panel} onKeyDown={trapFocus}
      className="w-full max-w-2xl max-h-[90dvh] overflow-y-auto rounded-xl p-4 sm:p-6" style={{ background: 'var(--surface)', color: 'var(--text)', border: '1px solid var(--border)' }}>
      <h2 id="client-setup-title" className="text-lg font-semibold">{portalAvailable ? 'Client account & portal access' : 'Client account'}</h2>
      <p className="text-sm mt-1 mb-4" style={{ color: 'var(--text-muted)' }}>{name} · Lead → Pipeline prospect → Client account{portalAvailable ? ' → Portal access' : ''}</p>
      {loading ? <p role="status">{portalAvailable ? 'Checking account and sign-in readiness…' : 'Checking client account…'}</p> : error ? <div role="alert"><p>{error}</p><button type="button" className="mt-3 px-3 py-2 rounded-lg" onClick={load}>Retry</button></div> : showSummary ? <div role="status" className="grid gap-3 rounded-lg p-4" style={{ background: 'var(--accent-soft)' }}>
        <h3 className="font-semibold">{!portalAvailable ? 'Client account ready' : portalReady ? comp ? 'Complimentary account ready' : 'Client portal ready' : 'Client account created — portal setup still needed'}</h3>
        {portalReady ? <>
          <p className="text-sm">Sign-in email: <strong>{login?.email}</strong></p>
          <p className="text-sm">The client can open the sign-in page from a phone or computer and request a secure email link to access the service portal.</p>
          <a className="underline text-sm font-semibold" href={login?.url || '/portal/login'} target="_blank" rel="noopener noreferrer">Open client sign-in page</a>
          {comp && <p className="text-sm">Complimentary access: {(result?.complimentaryExpiresAt || data?.portal?.complimentaryExpiresAt) ? `through ${new Date(result?.complimentaryExpiresAt || data?.portal?.complimentaryExpiresAt).toLocaleDateString()}` : 'no expiration'}.</p>}
          {result?.grant && <p className="text-sm">Promotional credits issued: {Number(result.grant.credits).toLocaleString()}.</p>}
          {result?.creditGrantFailed && <p role="alert" className="text-sm" style={{ color: 'var(--amber)' }}>{result.creditGrantMessage}</p>}
        </> : <p className="text-sm">{portalAvailable ? 'The prospect is now a client. Enable complimentary or pay-as-you-go portal access to let them sign in.' : 'The client account keeps its contacts and opportunities. The deal remains in its current pipeline stage.'}</p>}
        {portalAvailable && !result?.creditGrantFailed && <button type="button" className="justify-self-start underline text-sm" onClick={() => { setResult(null); setEditing(true) }}>{portalReady ? 'Change access options' : 'Enable portal access now'}</button>}
        <button type="button" className="justify-self-start underline text-sm" onClick={openAccount}>Open account</button>
      </div> : data && <PortalAccessForm portalAvailable={portalAvailable} account={data.account} loginEmail={data.login?.email} opportunityId={opportunityId} initialPortal={data.portal} onEnabled={completed} onCancel={finish} />}
      {(loading || error || showSummary) && <div className="flex justify-end mt-4"><button type="button" onClick={finish} className="px-4 min-h-11 rounded-lg text-sm font-semibold" style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}>Done</button></div>}
    </section>
  </div>
}
