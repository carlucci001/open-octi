'use client'

import ThemedSelect from '../components/ThemedSelect'
import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, CheckCircle2, ExternalLink, FileText, RefreshCw, Search, Trash2, UserPlus } from 'lucide-react'

const FIELD = {
  background: 'var(--surface2)',
  color: 'var(--text)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '10px 12px',
  width: '100%',
  minHeight: 44,
  fontSize: 14,
}

function money(value) {
  return Number(value || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

function dateLabel(value) {
  if (!value) return 'No date'
  try {
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(value))
  } catch {
    return String(value)
  }
}

function statusLabel(status) {
  return {
    checkout_started: 'Checkout started',
    financing_requested: 'Financing requested',
    terms_requested: 'Terms requested',
    paid: 'Paid',
    needs_follow_up: 'Needs follow-up',
    converted: 'Converted',
    cancelled: 'Cancelled',
  }[status] || status || 'Unknown'
}

function statusTone(status) {
  if (status === 'paid' || status === 'converted') return { background: 'rgba(34,197,94,0.14)', color: 'var(--green)' }
  if (['needs_follow_up', 'financing_requested', 'terms_requested'].includes(status)) return { background: 'rgba(245,158,11,0.16)', color: 'var(--amber)' }
  if (status === 'cancelled') return { background: 'rgba(220,38,38,0.14)', color: 'var(--red)' }
  return { background: 'rgba(59,130,246,0.14)', color: 'var(--accent)' }
}

function productFamily(order) {
  const haystack = `${order.product || ''} ${order.productName || ''} ${order.offerName || ''}`.toLowerCase()
  if (haystack.includes('newsroom')) return 'NewsroomAIOS'
  if (haystack.includes('command')) return 'Command Center'
  return order.productName || 'Product'
}

function Metric({ label, value, detail }) {
  return (
    <div className="rounded-lg p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
      <div className="text-xs uppercase mb-1" style={{ color: 'var(--text-muted)', letterSpacing: '0.06em' }}>{label}</div>
      <div className="text-2xl font-bold" style={{ color: 'var(--text)' }}>{value}</div>
      <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{detail}</div>
    </div>
  )
}

export default function ProductOrdersInbox({ onToast }) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('open')
  const [busyId, setBusyId] = useState('')
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const data = await fetch('/api/products/orders?limit=200', { cache: 'no-store' }).then(r => r.json())
      if (!data.ok) throw new Error(data.error || 'Orders failed to load')
      setOrders(data.orders || [])
      setSelectedIds(new Set())
    } catch (e) {
      onToast?.(e.message || 'Orders failed to load')
    } finally {
      setLoading(false)
    }
  }

  async function updateOrder(order, action, body = {}) {
    setBusyId(order.id)
    try {
      const data = await fetch('/api/products/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, id: order.id, ...body }),
      }).then(r => r.json())
      if (!data.ok) throw new Error(data.error || 'Order update failed')
      setOrders(prev => prev.map(item => item.id === order.id ? data.order : item))
      onToast?.('Order updated')
      return data.order
    } catch (e) {
      onToast?.(e.message || 'Order update failed')
      return null
    } finally {
      setBusyId('')
    }
  }

  async function createAccountContactProject(order) {
    setBusyId(order.id)
    try {
      const buyer = order.buyer || {}
      const accountData = await fetch('/api/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add',
          account: {
            name: buyer.company || buyer.name || 'New product buyer',
            type: 'prospect',
            stage: order.status === 'paid' ? 'active' : 'new',
            priority: 'high',
            email: buyer.email || '',
            phone: buyer.phone || '',
            industry: productFamily(order),
            notes: [
              `Product order ${order.id}`,
              `${order.productName || ''} ${order.packageName || ''}`.trim(),
              order.notes || '',
            ].filter(Boolean).join('\n'),
            tags: ['product-order', productFamily(order).toLowerCase().replace(/\s+/g, '-')],
          },
        }),
      }).then(r => r.json())
      if (!accountData.ok) throw new Error(accountData.error || 'Account create failed')

      const contactData = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add',
          contact: {
            name: buyer.name || buyer.company || 'Product buyer',
            email: buyer.email || '',
            phone: buyer.phone || '',
            title: order.qualification?.decisionRole || '',
            accountId: accountData.account.id,
            primary: true,
            tags: ['product-order'],
            notes: `Created from product order ${order.id}`,
          },
        }),
      }).then(r => r.json())
      if (!contactData.ok) throw new Error(contactData.error || 'Contact create failed')

      const projectData = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add',
          project: {
            accountId: accountData.account.id,
            name: `${productFamily(order)} - ${buyer.company || buyer.name || 'New buyer'}`,
            description: `${order.productName || 'Product'} ${order.packageName || ''} order. Due today ${money(order.dueToday || order.checkoutAmount)}. ${order.notes || ''}`.trim(),
            status: order.status === 'paid' ? 'active' : 'planning',
            priority: 'high',
            budget: String(order.estimatedBuildHigh || order.setupPrice || order.checkoutAmount || ''),
            tags: ['product-order', order.product || 'product'],
          },
        }),
      }).then(r => r.json())
      if (!projectData.ok) throw new Error(projectData.error || 'Project create failed')

      await updateOrder(order, 'converted', {
        accountId: accountData.account.id,
        contactId: contactData.contact.id,
        projectId: projectData.project.id,
        note: 'Created account, primary contact, and project.',
      })
      onToast?.('Account, contact, and project created')
    } catch (e) {
      onToast?.(e.message || 'Conversion failed')
    } finally {
      setBusyId('')
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return orders.filter(order => {
      const orderStatus = order.status || 'checkout_started'
      const statusOk = status === 'all'
        || (status === 'open' && !['converted', 'cancelled'].includes(orderStatus))
        || status === orderStatus
      const haystack = [
        order.id,
        order.productName,
        order.packageName,
        order.offerName,
        order.buyer?.name,
        order.buyer?.company,
        order.buyer?.email,
        productFamily(order),
      ].join(' ').toLowerCase()
      return statusOk && (!q || haystack.includes(q))
    })
  }, [orders, query, status])
  const filteredIds = useMemo(() => filtered.map(order => order.id), [filtered])
  useEffect(() => {
    setSelectedIds(prev => new Set([...prev].filter(id => filteredIds.includes(id))))
  }, [filteredIds])

  function toggleSelected(id, event) {
    event?.stopPropagation?.()
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    setSelectedIds(prev => prev.size === filteredIds.length ? new Set() : new Set(filteredIds))
  }

  async function deleteOrders(ids) {
    if (!ids.length || !confirm(`Delete ${ids.length} selected order${ids.length === 1 ? '' : 's'}?`)) return
    setBulkDeleting(true)
    try {
      const data = await fetch('/api/products/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'bulk_delete', ids }),
      }).then(r => r.json())
      if (!data.ok) throw new Error(data.error || 'Order delete failed')
      setOrders(prev => prev.filter(order => !ids.includes(order.id)))
      setSelectedIds(new Set())
      onToast?.('Orders deleted')
    } catch (e) {
      onToast?.(e.message || 'Order delete failed')
    } finally {
      setBulkDeleting(false)
    }
  }

  const paid = orders.filter(order => order.status === 'paid' || order.status === 'converted')
  const open = orders.filter(order => !['converted', 'cancelled'].includes(order.status || 'checkout_started'))
  const started = orders.filter(order => (order.status || 'checkout_started') === 'checkout_started')
  const revenue = paid.reduce((sum, order) => sum + Number(order.amountPaid || 0), 0)

  return (
    <div className="grid gap-5">
      <section className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <Metric label="Open orders" value={open.length} detail="Started, paid, or follow-up" />
        <Metric label="Started carts" value={started.length} detail="Buyer reached checkout" />
        <Metric label="Paid/converted" value={paid.length} detail="Confirmed revenue path" />
        <Metric label="Captured revenue" value={money(revenue)} detail="Paid or converted orders" />
      </section>

      <section className="rounded-xl p-4" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(220px,1fr)_220px_auto] gap-3 items-end">
          <label>
            <span className="block text-xs uppercase mb-1" style={{ color: 'var(--text-muted)', letterSpacing: '0.06em' }}>Search orders</span>
            <div className="relative">
              <Search size={16} style={{ position: 'absolute', left: 12, top: 14, color: 'var(--text-muted)' }} />
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buyer, company, product, email..."
                style={{ ...FIELD, paddingLeft: 36 }} />
            </div>
          </label>
          <label>
            <span className="block text-xs uppercase mb-1" style={{ color: 'var(--text-muted)', letterSpacing: '0.06em' }}>Status</span>
            <ThemedSelect value={status} onChange={e => setStatus(e.target.value)} style={FIELD}>
              <option value="open">Open orders</option>
              <option value="checkout_started">Checkout started</option>
              <option value="financing_requested">Financing requested</option>
              <option value="terms_requested">Terms requested</option>
              <option value="paid">Paid</option>
              <option value="needs_follow_up">Needs follow-up</option>
              <option value="converted">Converted</option>
              <option value="all">All orders</option>
            </ThemedSelect>
          </label>
          <button onClick={load} className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 font-semibold"
            style={{ minHeight: 44, background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}>
            <RefreshCw size={16} /> Refresh
          </button>
        </div>
      </section>

      {loading ? (
        <section className="rounded-xl p-6" style={{ background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>
          Loading orders...
        </section>
      ) : filtered.length === 0 ? (
        <section className="rounded-xl p-8 text-center" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="font-semibold mb-1" style={{ color: 'var(--text)' }}>No orders in this view</div>
          <div className="text-sm" style={{ color: 'var(--text-muted)' }}>When a buyer starts checkout, they will appear here immediately.</div>
        </section>
      ) : (
        <>
          <section className="rounded-xl p-3 flex items-center gap-3 flex-wrap" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
            <label className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--text)' }}>
              <input type="checkbox" checked={selectedIds.size === filteredIds.length && filteredIds.length > 0} onChange={toggleAll} style={{ width: 20, height: 20 }} />
              {selectedIds.size === 0 ? 'Select all' : `${selectedIds.size} selected`}
            </label>
            {selectedIds.size > 0 && (
              <>
                <button type="button" onClick={() => setSelectedIds(new Set())} className="rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>Clear</button>
                <button type="button" onClick={() => deleteOrders(Array.from(selectedIds))} disabled={bulkDeleting} className="ml-auto inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold" style={{ background: 'var(--red)', color: 'white', border: '1px solid var(--red)', opacity: bulkDeleting ? 0.6 : 1 }}>
                  <Trash2 size={15} /> {bulkDeleting ? 'Deleting...' : `Delete ${selectedIds.size}`}
                </button>
              </>
            )}
          </section>
          <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {filtered.map(order => {
            const isSelected = selectedIds.has(order.id)
            const paymentVerified = order.status === 'paid'
            return (
            <article key={order.id} className="rounded-xl p-4 grid gap-4" style={{ background: isSelected ? 'var(--accent-soft)' : 'var(--surface)', border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}` }}>
              <div className="flex items-start justify-between gap-3">
                <input type="checkbox" aria-label={`Select order ${order.id}`} checked={isSelected} onChange={e => toggleSelected(order.id, e)} style={{ width: 20, height: 20, flexShrink: 0, marginTop: 3 }} />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    <span className="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold" style={statusTone(order.status)}>{statusLabel(order.status)}</span>
                    <span className="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>{productFamily(order)}</span>
                    {order.fulfillmentStatus === 'queued' && <span className="inline-flex rounded-full px-2.5 py-1 text-xs font-semibold" style={{ background: 'rgba(59,130,246,0.14)', color: 'var(--accent)' }}>Onboarding queued</span>}
                  </div>
                  <h3 className="text-lg font-bold truncate" style={{ color: 'var(--text)' }}>{order.buyer?.company || order.buyer?.name || 'Unknown buyer'}</h3>
                  <div className="text-sm truncate" style={{ color: 'var(--text-muted)' }}>{order.buyer?.name || 'No contact'} · {order.buyer?.email || 'No email'}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-lg font-bold" style={{ color: 'var(--text)' }}>{money(order.amountPaid || order.checkoutAmount || order.dueToday)}</div>
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{dateLabel(order.createdAt)}</div>
                </div>
              </div>

              <div className="rounded-lg p-3 grid gap-2" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{order.productName || 'Product'} · {order.packageName || 'Package'}</div>
                <div className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  {order.offerName || order.paymentOptionLabel || order.dueTodayType || 'Checkout order'}
                  {order.estimatedBuildLow || order.estimatedBuildHigh ? ` · Estimate ${money(order.estimatedBuildLow)}-${money(order.estimatedBuildHigh)}` : ''}
                </div>
                {order.notes && <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{order.notes}</div>}
                {['financing_requested', 'terms_requested'].includes(order.status) && (
                  <div className="text-xs font-semibold" style={{ color: 'var(--amber)' }}>Follow-up request only - no payment collected, lender submission, or service activation.</div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2">
                <button disabled={busyId === order.id} onClick={() => updateOrder(order, 'follow-up')}
                  className="inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold"
                  style={{ minHeight: 44, background: 'rgba(245,158,11,0.14)', color: 'var(--amber)', border: '1px solid rgba(245,158,11,0.35)' }}>
                  <AlertCircle size={16} /> Follow up
                </button>
                <button disabled={busyId === order.id || !paymentVerified} title={paymentVerified ? 'Create CRM onboarding records' : 'Available only after verified Stripe payment'} onClick={() => createAccountContactProject(order)}
                  className="inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold"
                  style={{ minHeight: 44, background: 'var(--accent)', color: 'var(--accent-text)', border: '1px solid var(--accent)', opacity: paymentVerified ? 1 : 0.45 }}>
                  <UserPlus size={16} /> Convert
                </button>
                <button disabled={busyId === order.id || !paymentVerified} title={paymentVerified ? 'Mark paid onboarding complete' : 'Available only after verified Stripe payment'} onClick={() => updateOrder(order, 'status', { status: 'converted', note: 'Paid onboarding marked converted.' })}
                  className="inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold"
                  style={{ minHeight: 44, background: 'rgba(34,197,94,0.14)', color: 'var(--green)', border: '1px solid rgba(34,197,94,0.35)', opacity: paymentVerified ? 1 : 0.45 }}>
                  <CheckCircle2 size={16} /> Done
                </button>
                <button disabled={busyId === order.id} onClick={() => deleteOrders([order.id])}
                  className="inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold"
                  style={{ minHeight: 44, background: 'rgba(220,38,38,0.12)', color: 'var(--red)', border: '1px solid rgba(220,38,38,0.35)' }}>
                  <Trash2 size={16} /> Delete
                </button>
              </div>

              <div className="flex items-center justify-between gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                <span className="truncate">Order {order.id}</span>
                <span className="inline-flex items-center gap-1"><FileText size={13} /> {order.stripeSessionId || 'No Stripe session'}</span>
                {order.stripeSessionId && <span className="inline-flex items-center gap-1"><ExternalLink size={13} /> Stripe</span>}
              </div>
            </article>
            )
          })}
          </section>
        </>
      )}
    </div>
  )
}
