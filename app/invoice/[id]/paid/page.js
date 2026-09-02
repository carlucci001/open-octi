'use client'
import { useEffect, useState } from 'react'

export default function InvoicePaidPage({ params }) {
  const [status, setStatus] = useState('checking')
  const [invoice, setInvoice] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const sessionId = new URLSearchParams(window.location.search).get('session_id') || ''
    fetch('/api/invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'check_payment', id: params.id, sessionId }),
    })
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); setStatus('error'); return }
        setInvoice(d.invoice)
        setStatus(d.paymentStatus === 'paid' ? 'paid' : 'pending')
      })
      .catch(e => { setError(e.message); setStatus('error') })
  }, [params.id])

  const fmtUSD = (n) => Number(n || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0A0B0D', color: '#F5F1EA', fontFamily: 'system-ui, sans-serif', padding: 24 }}>
      <div style={{ maxWidth: 480, width: '100%', background: '#15171C', border: '1px solid #2A2D35', borderRadius: 16, padding: 40, textAlign: 'center' }}>
        <img src="/brand/fd-brand-light.png" alt="Farrington Development" style={{ height: 40, marginBottom: 32 }} />

        {status === 'checking' && (
          <>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⏳</div>
            <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 8 }}>Verifying payment...</h1>
            <p style={{ color: '#8B8F98' }}>Just a moment.</p>
          </>
        )}

        {status === 'paid' && invoice && (
          <>
            <div style={{ fontSize: 56, marginBottom: 16 }}>✓</div>
            <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 8, color: '#22c55e' }}>Payment received</h1>
            <p style={{ color: '#C8CBD1', marginBottom: 24 }}>Thank you! A receipt has been emailed to you.</p>
            <div style={{ background: '#0A0B0D', borderRadius: 8, padding: 16, marginBottom: 24, textAlign: 'left' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#8B8F98', marginBottom: 4 }}><span>Invoice</span><span>{invoice.number}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#8B8F98', marginBottom: 4 }}><span>Amount</span><span style={{ color: '#F5F1EA', fontWeight: 600 }}>{fmtUSD(invoice.paidAmount || invoice.amount)}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#8B8F98' }}><span>Paid</span><span>{invoice.paidAt ? new Date(invoice.paidAt).toLocaleString() : 'Just now'}</span></div>
            </div>
            <p style={{ fontSize: 13, color: '#8B8F98' }}>You can close this tab.</p>
          </>
        )}

        {status === 'pending' && (
          <>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⏸</div>
            <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 8 }}>Payment not yet complete</h1>
            <p style={{ color: '#8B8F98' }}>If you just paid, refresh this page in a moment.</p>
          </>
        )}

        {status === 'error' && (
          <>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⚠</div>
            <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 8, color: '#ef4444' }}>Something went wrong</h1>
            <p style={{ color: '#8B8F98' }}>{error || 'Please contact Farrington Development.'}</p>
          </>
        )}
      </div>
    </div>
  )
}
