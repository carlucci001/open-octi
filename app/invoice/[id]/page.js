import { notFound } from 'next/navigation'
import { readData } from '@/lib/dataStore'
import { invoiceAmount } from '@/lib/invoice-checkout'

export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'Invoice | Your organization',
  robots: { index: false, follow: false },
}

const PHONE_DISPLAY = 'PHONE_REDACTED'
const PHONE_HREF = 'tel:PHONE_REDACTED'

function fmtUSD(n) {
  return Number(n || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

function fmtDate(value) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? 'UTC' : 'America/New_York',
  })
}

function findInvoice(id) {
  const list = readData('invoices.json')?.invoices || []
  return list.find(i => i.id === id) || null
}

const row = { display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#8B8F98', marginBottom: 4 }

export default function InvoicePage({ params }) {
  const invoice = findInvoice(params.id)
  if (!invoice) notFound()

  const paid = invoice.status === 'paid' || Boolean(invoice.paidAt)
  const voided = invoice.status === 'void' || invoice.status === 'cancelled'
  const due = fmtDate(invoice.dueDate)

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0A0B0D', color: '#F5F1EA', fontFamily: 'system-ui, sans-serif', padding: 24 }}>
      <div style={{ maxWidth: 480, width: '100%', background: '#15171C', border: '1px solid #2A2D35', borderRadius: 16, padding: 40, textAlign: 'center' }}>
        <img src="/brand/fd-brand-light.png" alt="Your organization" style={{ height: 40, marginBottom: 32 }} />
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Invoice {invoice.number}</h1>
        {invoice.clientName && <p style={{ color: '#C8CBD1', marginBottom: 24 }}>{invoice.clientName}</p>}

        <div style={{ background: '#0A0B0D', borderRadius: 8, padding: 16, marginBottom: 24, textAlign: 'left' }}>
          <div style={row}>
            <span>{paid ? 'Amount paid' : 'Amount due'}</span>
            <span style={{ color: '#F5F1EA', fontWeight: 600 }}>{fmtUSD(invoiceAmount(invoice))}</span>
          </div>
          {due && !paid && <div style={row}><span>Due</span><span>{due}</span></div>}
        </div>

        {paid && (
          <p style={{ color: '#22c55e', fontWeight: 600, marginBottom: 24 }}>This invoice has been paid. Thank you.</p>
        )}
        {voided && (
          <p style={{ color: '#ef4444', marginBottom: 24 }}>This invoice is no longer payable.</p>
        )}
        {!paid && !voided && (
          <a
            href={`/pay/${encodeURIComponent(invoice.id)}`}
            style={{ display: 'inline-block', background: '#16a34a', color: '#fff', padding: '14px 32px', borderRadius: 8, textDecoration: 'none', fontWeight: 600, fontSize: 16, marginBottom: 24 }}
          >
            Pay online
          </a>
        )}

        <p style={{ fontSize: 13, color: '#8B8F98', marginBottom: 4 }}>Prefer to pay by check? Contact Your organization.</p>
        <p style={{ fontSize: 13, margin: 0 }}>
          <a href={PHONE_HREF} style={{ color: '#C8CBD1', textDecoration: 'none' }}>{PHONE_DISPLAY}</a>
        </p>
      </div>
    </div>
  )
}
