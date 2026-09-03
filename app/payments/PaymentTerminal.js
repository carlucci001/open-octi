'use client'
import ThemedSelect from '../components/ThemedSelect'
import { useState, useEffect, useMemo } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js'
import PageHeader from '../components/PageHeader'
import BulkActionsMenu from '../components/BulkActionsMenu'
import ItemActionsMenu from '../components/ItemActionsMenu'
import { isOpenOcti } from '@/lib/edition'
import { OpenOctiConfigurationLinks } from '../components/OpenOctiConfigurationNotice'

function api(url, body) { return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()) }
function logPaymentTerminalStage(stage, extra = {}) {
  try {
    fetch('/api/voice/transfer-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      credentials: 'same-origin',
      body: JSON.stringify({
        stage: `payment-terminal-${stage}`,
        to: 'Stripe',
        agentId: 'payments',
        provider: 'stripe',
        status: extra.status || '',
        reason: extra.reason || '',
      }),
    }).catch(() => {})
  } catch {}
}
const fmt = n => n.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
const isPaidPayment = p => ['succeeded', 'received', 'paid'].includes(String(p?.status || '').toLowerCase())

const CARD_ELEMENT_OPTIONS = {
  style: {
    base: {
      fontSize: '15px',
      lineHeight: '30px',
      color: '#cdd6f4',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      '::placeholder': { color: '#7f849c' },
    },
    invalid: { color: '#f38ba8' },
  },
  hidePostalCode: false,
}

function TerminalInner() {
  const stripe = useStripe()
  const elements = useElements()
  const [payments, setPayments] = useState([])
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [dateFilter, setDateFilter] = useState('all')
  const [showForm, setShowForm] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [toast, setToast] = useState({ msg: '', kind: 'info' })
  const [cardReady, setCardReady] = useState(false)
  const [form, setForm] = useState({ clientId: '', clientName: '', description: '', amount: '', email: '', type: 'one-time' })
  const [editPayment, setEditPayment] = useState(null)
  const [bulkSelected, setBulkSelected] = useState(new Set())
  const toggleBulk = (id) => setBulkSelected(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  const toggleBulkAll = () => setBulkSelected(prev => prev.size === filtered.length ? new Set() : new Set(filtered.map(p => p.id)))
  const bulkDelete = async () => {
    if (!confirm(`Delete ${bulkSelected.size} payment(s)?`)) return
    for (const id of bulkSelected) await api('/api/payments', { action: 'delete', id })
    const d = await fetch('/api/payments').then(r=>r.json()); setPayments(d.payments||[]); setBulkSelected(new Set()); flash('✅ Deleted')
  }

  useEffect(() => {
    Promise.all([fetch('/api/payments').then(r=>r.json()), fetch('/api/clients').then(r=>r.json())])
      .then(([p,c]) => { setPayments(p.payments||[]); setClients(c.clients||[]); setLoading(false) })
  }, [])

  const flash = (m, kind = 'info') => {
    setToast({ msg: m, kind })
    if (kind !== 'error') setTimeout(() => setToast({ msg: '', kind: 'info' }), 3000)
  }
  const clearToast = () => setToast({ msg: '', kind: 'info' })
  const u = (k,v) => setForm(f => ({ ...f, [k]: v }))
  const resetForm = () => { setForm({ clientId: '', clientName: '', description: '', amount: '', email: '', type: 'one-time' }); setCardReady(false) }

  const selectClient = (id) => {
    const c = clients.find(cl => cl.id === id)
    if (c) setForm(f => ({ ...f, clientId: id, clientName: c.name, email: c.email || f.email }))
    else setForm(f => ({ ...f, clientId: '', clientName: '' }))
  }

  const processPayment = async () => {
    if (!form.clientName || !form.amount) { logPaymentTerminalStage('blocked', { reason: 'missing client name or amount' }); flash('Need client name and amount', 'error'); return }
    if (!stripe || !elements) { logPaymentTerminalStage('blocked', { reason: 'stripe elements not loaded' }); flash('Stripe not loaded yet', 'error'); return }
    if (!cardReady) { logPaymentTerminalStage('blocked', { reason: 'card details incomplete' }); flash('Fill in card details first', 'error'); return }
    setProcessing(true)
    try {
      logPaymentTerminalStage('create-intent-requested')
      const intentRes = await api('/api/payments', { action: 'create_intent', clientName: form.clientName, clientId: form.clientId, description: form.description, amount: form.amount, email: form.email })
      console.log('[payment] create_intent →', intentRes)
      if (intentRes.error) { logPaymentTerminalStage('create-intent-failed', { reason: intentRes.error }); flash('Intent failed: ' + intentRes.error, 'error'); setProcessing(false); return }

      const cardElement = elements.getElement(CardElement)
      const result = await stripe.confirmCardPayment(intentRes.clientSecret, {
        payment_method: { card: cardElement, billing_details: { name: form.clientName, email: form.email || undefined } },
      })
      console.log('[payment] confirmCardPayment →', result)
      if (result.error) { logPaymentTerminalStage('charge-failed', { reason: result.error.message }); flash('Charge failed: ' + result.error.message, 'error'); setProcessing(false); return }
      if (result.paymentIntent?.status !== 'succeeded') { logPaymentTerminalStage('charge-status', { status: result.paymentIntent?.status || '', reason: 'payment intent not succeeded' }); flash('Status: ' + result.paymentIntent?.status, 'error'); setProcessing(false); return }

      const recordRes = await api('/api/payments', { action: 'record_from_intent', intentId: result.paymentIntent.id, email: form.email, type: form.type })
      console.log('[payment] record_from_intent →', recordRes)
      if (recordRes.error) { logPaymentTerminalStage('record-failed', { reason: recordRes.error }); flash('Charged but not saved locally: ' + recordRes.error, 'error'); setProcessing(false); return }

      logPaymentTerminalStage('succeeded')
      flash('Payment successful!', 'success')
      const d = await fetch('/api/payments').then(r=>r.json()); setPayments(d.payments||[]); resetForm(); setShowForm(false)
    } catch (e) { logPaymentTerminalStage('exception', { reason: e?.message || 'payment exception' }); console.error('[payment] exception:', e); flash(e.message, 'error') }
    setProcessing(false)
  }

  const recordManual = async () => {
    if (!form.clientName || !form.amount) { flash('Need client name and amount', 'error'); return }
    const d = await api('/api/payments', { action: 'record', ...form, amount: form.amount })
    if (d.error) { flash(d.error, 'error'); return }
    const next = d.payments ? d : await fetch('/api/payments').then(r=>r.json())
    setPayments(next.payments||[])
    window.dispatchEvent(new CustomEvent('fcc:payments-changed'))
    resetForm(); setShowForm(false); flash('Payment recorded', 'success')
  }

  const deletePayment = async (id) => {
    if (!confirm('Delete this payment record?')) return
    const d = await api('/api/payments', { action: 'delete', id })
    setPayments(d.payments||[]); flash('✅ Payment deleted')
  }

  const startEditPayment = (p) => {
    setEditPayment({ ...p })
  }

  const saveEditPayment = async () => {
    if (!editPayment) return
    const d = await api('/api/payments', { action: 'update', payment: editPayment })
    setPayments(d.payments||[]); setEditPayment(null); flash('✅ Payment updated')
  }

  const filtered = useMemo(() => payments.filter(p => {
    const s = !search || p.clientName?.toLowerCase().includes(search.toLowerCase()) || p.description?.toLowerCase().includes(search.toLowerCase())
    let md = true
    if (dateFilter !== 'all') { const pd = new Date(p.date), now = new Date()
      if (dateFilter === '7d') md = (now-pd) < 7*864e5; else if (dateFilter === '30d') md = (now-pd) < 30*864e5
      else if (dateFilter === '90d') md = (now-pd) < 90*864e5; else if (dateFilter === 'year') md = pd.getFullYear() === now.getFullYear() }
    return s && md
  }).sort((a,b) => new Date(b.date)-new Date(a.date)), [payments, search, dateFilter])

  const stats = useMemo(() => {
    const ok = payments.filter(isPaidPayment)
    const total = ok.reduce((s,p) => s + (Number(p.amount) || 0), 0)
    const now = new Date()
    const mo = ok.filter(p => { const d=new Date(p.date); return d.getMonth()===now.getMonth() && d.getFullYear()===now.getFullYear() }).reduce((s,p)=>s + (Number(p.amount) || 0),0)
    const yr = ok.filter(p => new Date(p.date).getFullYear()===now.getFullYear()).reduce((s,p)=>s + (Number(p.amount) || 0),0)
    return { total, thisMonth: mo, thisYear: yr, count: ok.length }
  }, [payments])

  const is = { background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 12px', borderRadius: 8, fontSize: 13, outline: 'none', width: '100%' }

  return (
    <div className="p-4 sm:p-5">
      {toast.msg && (
        <div className="fixed top-4 right-4 z-50 px-4 py-2 rounded-lg text-sm font-medium animate-fade-in flex items-center gap-3 max-w-md" style={{
          background: toast.kind === 'success' ? 'var(--green)' : toast.kind === 'error' ? 'var(--red)' : 'var(--amber)',
          color: 'var(--accent-text)',
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        }}>
          <span className="flex-1">{toast.kind === 'success' ? '✓ ' : toast.kind === 'error' ? '⚠ ' : ''}{toast.msg}</span>
          {toast.kind === 'error' && <button onClick={clearToast} className="opacity-80 hover:opacity-100 font-bold text-lg leading-none" aria-label="Dismiss">×</button>}
        </div>
      )}

      <PageHeader
        icon="💳"
        title="Payment Terminal"
        subtitle="Farrington Development — Phone payments & tracking"
        actions={<>
          <button className="px-3 py-2 rounded-lg text-sm font-semibold" style={{ background: 'var(--surface2)', color: 'var(--teal)', border: '1px solid var(--border)' }} onClick={() => window.open('/api/payments/export','_blank')}>⬇ Export CSV</button>
          <button className="px-3 py-2 rounded-lg text-sm font-semibold" style={{ background: 'var(--green)', color: 'var(--accent-text)' }} onClick={() => setShowForm(true)}>💳 New Payment</button>
        </>}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {[{l:'All Time',v:fmt(stats.total),c:'var(--accent)'},{l:'This Year',v:fmt(stats.thisYear),c:'var(--green)'},{l:'This Month',v:fmt(stats.thisMonth),c:'var(--teal)'},{l:'Transactions',v:stats.count,c:'var(--purple)'}].map(s => (
          <div key={s.l} className="rounded-lg p-3" style={{ background: 'var(--surface)', border: '1px solid #2a2d42' }}>
            <div className="text-lg font-bold font-mono" style={{ color: s.c }}>{s.v}</div>
            <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{s.l}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-3 mb-4">
        <input className="flex-1" style={is} placeholder="Search clients, descriptions..." value={search} onChange={e => setSearch(e.target.value)} />
        <ThemedSelect style={{ ...is, width: 'auto', minWidth: 130 }} value={dateFilter} onChange={e => setDateFilter(e.target.value)}>
          <option value="all">All Time</option><option value="7d">7 days</option><option value="30d">30 days</option><option value="90d">90 days</option><option value="year">This Year</option>
        </ThemedSelect>
      </div>

      {loading ? <div className="text-center py-10" style={{ color: 'var(--text-muted)' }}>Loading...</div> :
        filtered.length === 0 ? <div className="text-center py-10"><div className="text-4xl mb-3">💳</div><p style={{ color: 'var(--text-muted)' }}>{payments.length === 0 ? 'No payments yet.' : 'No matching payments.'}</p></div> : (
        <>
        {bulkSelected.size > 0 && (
          <div className="flex items-center gap-3 px-4 py-2 mb-2 rounded-lg" style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}>
            <BulkActionsMenu
              selectedCount={bulkSelected.size}
              totalCount={filtered.length}
              onSelectPage={() => setBulkSelected(new Set(filtered.map(payment => payment.id)))}
              onClearSelection={() => setBulkSelected(new Set())}
              onDeleteSelected={bulkDelete}
            />
          </div>
        )}
        <div className="rounded-xl overflow-hidden" style={{ background: 'var(--surface)', border: '1px solid #2a2d42' }}>
          <table className="w-full" style={{ borderCollapse: 'collapse' }}>
            <thead><tr style={{ borderBottom: '1px solid #2a2d42' }}>
              <th className="px-2 py-3 w-[36px]"><input type="checkbox" checked={filtered.length > 0 && bulkSelected.size === filtered.length} onChange={toggleBulkAll} /></th>
              {['Date','Client','Description','Amount','Type','Email','Status','Card',''].map(h => <th key={h} className="px-3 py-2 text-left text-xs font-medium uppercase" style={{ color: 'var(--text-muted)' }}>{h}</th>)}
            </tr></thead>
            <tbody>{filtered.map((p,i) => (
              <tr key={p.id} style={{ borderBottom: i<filtered.length-1 ? '1px solid #1a1d30' : 'none' }}>
                <td className="px-2 py-3"><input type="checkbox" checked={bulkSelected.has(p.id)} onChange={() => toggleBulk(p.id)} /></td>
                <td className="px-3 py-2 text-xs font-mono" style={{ color: 'var(--text)' }}>{new Date(p.date).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</td>
                <td className="px-3 py-2 text-sm font-medium" style={{ color: 'var(--text)' }}>{p.clientName}</td>
                <td className="px-3 py-2 text-xs" style={{ color: 'var(--text-muted)' }}>{p.description||'—'}</td>
                <td className="px-3 py-2 text-sm font-mono font-semibold" style={{ color: 'var(--green)' }}>{fmt(p.amount)}</td>
                <td className="px-3 py-2"><span className="text-xs px-2 py-0.5 rounded-full" style={{ background: p.type==='recurring' ? 'rgba(203,166,247,0.15)' : 'rgba(137,180,250,0.15)', color: p.type==='recurring' ? 'var(--purple)' : 'var(--accent)' }}>{p.type||'one-time'}</span></td>
                <td className="px-3 py-2 text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{p.email||'—'}</td>
                <td className="px-3 py-2"><span className="text-xs px-2 py-0.5 rounded-full" style={{ background: isPaidPayment(p)?'rgba(166,227,161,0.15)':'rgba(243,139,168,0.15)', color: isPaidPayment(p)?'var(--green)':'var(--red)' }}>{p.status}</span></td>
                <td className="px-3 py-2 text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{p.brand && p.last4 ? `${p.brand} ••${p.last4}` : '—'}</td>
                <td className="px-3 py-2">
                  <div className="flex gap-1">
                    <ItemActionsMenu
                      label={`Actions for payment ${p.id}`}
                      actions={[
                        { label: 'Edit payment', onClick: () => startEditPayment(p) },
                        { label: 'Delete payment', tone: 'danger', onClick: () => deletePayment(p.id) },
                      ]}
                    />
                  </div>
                </td>
              </tr>
            ))}</tbody>
          </table>
          <div className="flex justify-between px-3 py-2" style={{ borderTop: '1px solid #2a2d42', background: 'var(--surface2)' }}>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{filtered.length} payments</span>
            <span className="text-sm font-mono font-bold" style={{ color: 'var(--green)' }}>Total: {fmt(filtered.filter(isPaidPayment).reduce((s,p)=>s + (Number(p.amount) || 0),0))}</span>
          </div>
        </div>
        </>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }} onClick={() => setShowForm(false)}>
          <div className="w-full max-w-md rounded-xl p-5 animate-fade-in max-h-[90vh] overflow-auto" style={{ background: 'var(--surface)', border: '1px solid #2a2d42' }} onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-1" style={{ color: 'var(--text)' }}>💳 Process Payment</h2>
            <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>Farrington Development — Secure via Stripe Elements</p>

            {clients.length > 0 && <div className="mb-3"><label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-muted)' }}>Select Client</label>
              <ThemedSelect style={is} value={form.clientId} onChange={e => selectClient(e.target.value)}>
                <option value="">— Type name or select —</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </ThemedSelect></div>}

            <div className="mb-3"><label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-muted)' }}>Client Name *</label><input style={is} placeholder="John Smith" value={form.clientName} onChange={e => u('clientName', e.target.value)} /></div>
            <div className="mb-3"><label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-muted)' }}>Invoice / Project</label><input style={is} placeholder="Website redesign — Phase 1" value={form.description} onChange={e => u('description', e.target.value)} /></div>
            <div className="mb-3"><label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-muted)' }}>Amount (USD) *</label>
              <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold" style={{ color: 'var(--green)' }}>$</span>
              <input style={{ ...is, paddingLeft: 24 }} type="number" step="0.01" placeholder="0.00" value={form.amount} onChange={e => u('amount', e.target.value)} /></div></div>
            <div className="mb-3"><label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-muted)' }}>Email for Receipt</label><input style={is} type="email" placeholder="redacted@example.invalid" value={form.email} onChange={e => u('email', e.target.value)} /></div>
            <div className="mb-3"><label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-muted)' }}>Payment Type</label>
              <ThemedSelect style={is} value={form.type} onChange={e => u('type', e.target.value)}><option value="one-time">One-time</option><option value="recurring">Recurring</option></ThemedSelect></div>

            <div className="rounded-lg p-4 mb-3" style={{ background: 'var(--surface2)', border: '1px solid #2a2d42' }}>
              <div className="text-xs font-medium mb-3" style={{ color: 'var(--text-muted)' }}>💳 Card Details (secured by Stripe)</div>
              <div
                className="rounded-lg px-3 py-2 cursor-text"
                style={{ background: 'var(--surface)', border: '1px solid #2a2d42' }}
                onClick={() => { try { elements?.getElement(CardElement)?.focus() } catch {} }}
              >
                <CardElement options={CARD_ELEMENT_OPTIONS} onChange={e => setCardReady(e.complete)} />
              </div>
              <p className="text-[10px] mt-2" style={{ color: 'var(--text-muted)' }}>Card details never touch your server — encrypted directly to Stripe.</p>
            </div>

            <div className="flex gap-2">
              <button className="flex-1 py-2 rounded-lg text-sm font-semibold disabled:opacity-50" style={{ background: 'var(--green)', color: 'var(--accent-text)' }} onClick={processPayment} disabled={processing || !stripe}>{processing ? '⏳ Processing...' : `Charge ${form.amount ? fmt(parseFloat(form.amount)||0) : '$0.00'}`}</button>
              <button className="px-3 py-2 rounded-lg text-xs font-medium" style={{ background: 'var(--surface2)', color: 'var(--peach)', border: '1px solid #2a2d42' }} onClick={recordManual}>Record Only</button>
              <button className="px-3 py-2 rounded-lg text-sm" style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }} onClick={() => { setShowForm(false); resetForm() }}>Cancel</button>
            </div>
            <p className="text-xs mt-2 text-center" style={{ color: 'var(--text-muted)' }}>"Record Only" saves to history without charging</p>
          </div>
        </div>
      )}

      {editPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }} onClick={() => setEditPayment(null)}>
          <div className="w-full max-w-md rounded-xl p-5 animate-fade-in max-h-[90vh] overflow-auto" style={{ background: 'var(--surface)', border: '1px solid #2a2d42' }} onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text)' }}>Edit Payment</h2>
            <div className="mb-3"><label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-muted)' }}>Client Name</label>
              <input style={is} value={editPayment.clientName} onChange={e => setEditPayment(p => ({ ...p, clientName: e.target.value }))} /></div>
            <div className="mb-3"><label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-muted)' }}>Description</label>
              <input style={is} value={editPayment.description || ''} onChange={e => setEditPayment(p => ({ ...p, description: e.target.value }))} /></div>
            <div className="mb-3"><label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-muted)' }}>Amount (USD)</label>
              <input style={is} type="number" step="0.01" value={editPayment.amount} onChange={e => setEditPayment(p => ({ ...p, amount: parseFloat(e.target.value) || 0 }))} /></div>
            <div className="mb-3"><label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-muted)' }}>Email</label>
              <input style={is} value={editPayment.email || ''} onChange={e => setEditPayment(p => ({ ...p, email: e.target.value }))} /></div>
            <div className="mb-3"><label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-muted)' }}>Type</label>
              <ThemedSelect style={is} value={editPayment.type || 'one-time'} onChange={e => setEditPayment(p => ({ ...p, type: e.target.value }))}>
                <option value="one-time">One-time</option><option value="recurring">Recurring</option>
              </ThemedSelect></div>
            <div className="mb-3"><label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-muted)' }}>Status</label>
              <ThemedSelect style={is} value={editPayment.status} onChange={e => setEditPayment(p => ({ ...p, status: e.target.value }))}>
                <option value="succeeded">Succeeded</option><option value="received">Received</option><option value="paid">Paid</option><option value="pending">Pending</option><option value="failed">Failed</option><option value="refunded">Refunded</option>
              </ThemedSelect></div>
            <div className="flex gap-2 mt-4">
              <button className="flex-1 py-2 rounded-lg text-sm font-medium" style={{ background: 'var(--accent)', color: 'var(--accent-text)' }} onClick={saveEditPayment}>Save</button>
              <button className="px-4 py-2 rounded-lg text-sm" style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }} onClick={() => setEditPayment(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function PaymentTerminal() {
  const stripePromise = useMemo(() => {
    const pk = process.env.NEXT_PUBLIC_STRIPE_PK
    if (!pk) return null
    return loadStripe(pk)
  }, [])

  if (!stripePromise) {
    return (
      <div className="p-4 sm:p-5">
        <div className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--red)' }}>
          <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--red)' }}>Stripe not configured</h2>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{isOpenOcti()
            ? <OpenOctiConfigurationLinks needs={['NEXT_PUBLIC_STRIPE_PK']} prefix="Open settings for" />
            : <>Add <code>NEXT_PUBLIC_STRIPE_PK</code> to <code>.env.local</code> and restart the dev server.</>}</p>
        </div>
      </div>
    )
  }

  return (
    <Elements stripe={stripePromise}>
      <TerminalInner />
    </Elements>
  )
}
