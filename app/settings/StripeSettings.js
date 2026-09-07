'use client'
import { useEffect, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { notifyCapabilitiesChanged } from '@/lib/client-capabilities'

const fieldStyle = { background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }
const panelStyle = { background: 'var(--surface)', border: '1px solid var(--border)' }
const stripePath = (mode, path) => `https://dashboard.stripe.com/${mode === 'test' ? 'test/' : ''}${path}`

function StripeLink({ href, children }) {
  return <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm underline" style={{ color: 'var(--accent)' }}>{children}<ExternalLink size={14} /></a>
}

export default function StripeSettings() {
  const [status, setStatus] = useState(null)
  const [mode, setMode] = useState('test')
  const [secretKey, setSecretKey] = useState('')
  const [publishableKey, setPublishableKey] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    fetch('/api/openocti/stripe', { cache: 'no-store' }).then(async response => {
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Stripe settings could not be loaded.')
      if (active) { setStatus(data.stripe); setMode(data.stripe.mode || 'test') }
    }).catch(error => { if (active) setError(error.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  async function save(event) {
    event.preventDefault()
    setSaving(true); setError(''); setMessage('')
    try {
      const response = await fetch('/api/openocti/stripe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode, secretKey, publishableKey }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Stripe settings could not be saved.')
      setStatus(data.stripe); setSecretKey(''); setPublishableKey('')
      setMessage('Account connection checked and keys saved. Continue with products and checkout below.')
      notifyCapabilitiesChanged()
    } catch (error) { setError(error.message) } finally { setSaving(false) }
  }

  if (loading) return <p role="status">Loading Stripe setup…</p>
  return <div className="space-y-5 max-w-4xl" style={{ color: 'var(--text)' }}>
    <div>
      <h2 className="text-xl font-semibold">Stripe setup</h2>
      <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Connect your account, create your offers, then accept payments. You can always return here through System → Admin → Stripe.</p>
    </div>
    {error && <p role="alert" className="rounded-lg p-3" style={{ color: 'var(--red)', background: 'var(--surface)' }}>{error}</p>}
    {message && <p role="status" className="rounded-lg p-3" style={panelStyle}>{message}</p>}
    <section className="rounded-xl p-5 space-y-4" style={panelStyle}>
      <h3 className="font-semibold">1. Connect your Stripe account</h3>
      {status?.configured && <p className="text-sm">Saved connection: <strong>{status.mode === 'live' ? 'Live — real payments' : 'Test — no real payments'}</strong>{status.accountName ? ` · ${status.accountName}` : ''}{status.accountId ? ` · ${status.accountId}` : ''}. {status.browserReady ? 'Browser payment keys are configured.' : 'A matching publishable key is still needed.'}</p>}
      {status?.issue && <p role="status" className="text-sm">{status.issue}</p>}
      {status?.chargesEnabled === false && <p role="status" className="text-sm">Stripe has not enabled live charges on this account. Complete the account requirements in your Stripe Dashboard before accepting real payments.</p>}
      <form onSubmit={save} className="space-y-4">
        <div className="flex flex-wrap gap-4 items-end">
          <label className="text-sm">Payment mode
            <select value={mode} onChange={event => { setMode(event.target.value); setSecretKey(''); setPublishableKey('') }} className="block rounded-lg p-2 mt-1" style={fieldStyle} disabled={saving}>
              <option value="test">Test — no real payments</option><option value="live">Live — real payments</option>
            </select>
          </label>
          <StripeLink href={stripePath(mode, 'apikeys')}>Get your {mode} keys</StripeLink>
        </div>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Copy both keys from the same account and mode. Your secret stays encrypted on this installation. Saved keys are never displayed. Leaving both fields blank keeps the saved pair.</p>
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="text-sm">Secret key
            <input type="password" autoComplete="off" spellCheck={false} value={secretKey} onChange={event => setSecretKey(event.target.value)} placeholder={status?.configured ? 'Saved — enter to replace' : `sk_${mode}_…`} className="block w-full rounded-lg p-2 mt-1" style={fieldStyle} disabled={saving} />
          </label>
          <label className="text-sm">Publishable key
            <input type="password" autoComplete="off" spellCheck={false} value={publishableKey} onChange={event => setPublishableKey(event.target.value)} placeholder={status?.browserReady ? 'Saved — enter to replace' : `pk_${mode}_…`} className="block w-full rounded-lg p-2 mt-1" style={fieldStyle} disabled={saving} />
          </label>
        </div>
        <button type="submit" disabled={saving || !status} className="rounded-lg px-4 py-2 font-semibold" style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}>{saving ? 'Checking connection…' : 'Check connection & save keys'}</button>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>This checks access to your Stripe account. It does not create products, subscriptions, or charges. The publishable key must belong to that same account; confirm it during a test checkout.</p>
      </form>
    </section>
    <section className="rounded-xl p-5 space-y-3" style={panelStyle}>
      <h3 className="font-semibold">2. Create products and prices in Stripe</h3>
      <p className="text-sm">Use your Stripe product catalog to create each offer and its price. Choose a recurring monthly or yearly price for a subscription, or a one-time price for a single purchase. Test and live catalogs are separate.</p>
      <StripeLink href={stripePath(mode, 'products')}>Open {mode} product catalog</StripeLink>
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>OpenOcti’s local product definitions do not automatically create Stripe products or prices. This public build does not include automatic catalog synchronization.</p>
    </section>
    <section className="rounded-xl p-5 space-y-3" style={panelStyle}>
      <h3 className="font-semibold">3. Create checkout and confirm the result</h3>
      <p className="text-sm">Create a Payment Link in Stripe for the price you selected. A recurring price starts a subscription when the customer completes checkout. Stripe records the customer, payment, and subscription in your account.</p>
      <div className="flex flex-wrap gap-4"><StripeLink href={stripePath(mode, 'payment-links')}>Create a payment link</StripeLink><StripeLink href={stripePath(mode, 'subscriptions')}>View Stripe subscriptions</StripeLink><StripeLink href={stripePath(mode, 'payments')}>View Stripe payments</StripeLink></div>
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Stripe Dashboard is the source of truth for this workflow. Payment Links and recurring subscription changes are not imported automatically into OpenOcti. Signed webhook reconciliation is not included in this public build.</p>
    </section>
    <section className="rounded-xl p-5 space-y-3" style={panelStyle}>
      <h3 className="font-semibold">Use payments inside OpenOcti</h3>
      <p className="text-sm">The payment terminal and invoice checkout use your saved secret key. The payment terminal also uses your saved publishable key without a rebuild. Start in test mode and verify both the Stripe record and the OpenOcti payment history before switching to live mode.</p>
      <a href="/?tab=payments" className="text-sm underline" style={{ color: 'var(--accent)' }}>Open payment terminal</a>
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Keep checkout open until it finishes. If interrupted, verify the payment in Stripe before trying again; background recovery of payment records is not automatic. Invoice links also require your installation’s public return URL to be configured.</p>
    </section>
  </div>
}
