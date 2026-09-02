import { readData } from '@/lib/dataStore'
import { NextResponse } from 'next/server'
import { requireCrmRead } from '@/lib/permissions'

export async function GET(request) {
  const { error } = await requireCrmRead(request)
  if (error) return error
  const data = readData('payments.json') || { payments: [] }
  const hdr = 'Date,Client,Description,Amount,Type,Email,Status,Card,Stripe ID'
  const rows = data.payments.map(p => {
    const d = new Date(p.date).toLocaleDateString('en-US')
    return `${d},"${p.clientName}","${p.description}",${p.amount.toFixed(2)},${p.type || 'one-time'},"${p.email}",${p.status},"${p.brand ? p.brand + ' ****' + p.last4 : ''}","${p.stripeId}"`
  })
  return new NextResponse([hdr, ...rows].join('\n'), {
    headers: { 'Content-Type': 'text/csv', 'Content-Disposition': `attachment; filename="farrington-payments-${new Date().toISOString().slice(0,10)}.csv"` },
  })
}
