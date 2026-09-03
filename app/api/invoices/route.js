import { readData, writeData } from '@/lib/dataStore'
import { findClient as findClientRecord } from '@/lib/clients'
import { findById as findEntityById, loadAll as loadEntities, logActivity } from '@/lib/entityStore'
import { NextResponse } from 'next/server'
import PDFDocument from 'pdfkit'
import path from 'path'
import fs from 'fs'
import Stripe from 'stripe'
import { Resend } from 'resend'
import { wrapEmailBody } from '@/lib/emailSignature'
import { requireCrmRead, requireCrmWrite } from '@/lib/permissions'
import { recordCheckoutSessionPayment } from '@/lib/paymentLedger'

const DATA_FILE = 'invoices.json'

// Lazy migration: for invoices with a legacy `project` string but no `projectId`,
// match by case-insensitive project name and persist. Returns the (possibly mutated) data.
function hydrateProjectLinks(data) {
  if (!Array.isArray(data?.invoices) || data.invoices.length === 0) return data
  const unlinked = data.invoices.filter(i => !i.projectId && typeof i.project === 'string' && i.project.trim())
  if (unlinked.length === 0) return data
  let projects = []
  try { projects = loadEntities('projects') || [] } catch { projects = [] }
  if (projects.length === 0) return data
  const byName = new Map(projects.map(p => [String(p.name || '').trim().toLowerCase(), p.id]))
  let mutated = false
  for (const inv of unlinked) {
    const hit = byName.get(inv.project.trim().toLowerCase())
    if (hit) { inv.projectId = hit; mutated = true }
  }
  if (mutated) { data.lastUpdated = new Date().toISOString(); writeData(DATA_FILE, data) }
  return data
}

function getStripeKeyFromVault() {
  const creds = readData('credentials.json') || { credentials: [] }
  const entry = (creds.credentials || []).find(c => /stripe/i.test(c.name || ''))
  if (!entry) return ''
  const fields = entry.fields || []
  const prod = fields.find(f => /secret.*\(p\)/i.test(f.label || ''))
  const test = fields.find(f => /secret.*\(s\)/i.test(f.label || ''))
  const fallback = fields.find(f => /secret/i.test(f.label || ''))
  return (prod || test || fallback)?.value?.trim() || ''
}

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY || getStripeKeyFromVault()
  if (!key) return null
  return new Stripe(key)
}

function getBaseUrl() {
  const configured = process.env.INVOICE_BASE_URL
  if (configured) return configured.trim().replace(/\/$/, '')
  return 'https://crm.company.example.com'
}

function genId() { return 'inv_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8) }
function genInvoiceNum() { return `FD-${Date.now().toString().slice(-6)}` }

function loadInvoices() { return readData(DATA_FILE) || { invoices: [], lastUpdated: null } }
function saveInvoices(data) { data.lastUpdated = new Date().toISOString(); writeData(DATA_FILE, data) }

function findClient(clientId) {
  return findClientRecord(clientId) || findEntityById('accounts', clientId)
}

function configuredSecret(value) {
  const v = String(value || '').trim()
  if (!v) return null
  if (['missing', 'changeme', 'change-me', 'undefined', 'null'].includes(v.toLowerCase())) return null
  return v
}

async function requireCrmWriteOrAgentKey(request) {
  const allowed = [
    configuredSecret(process.env.AGENT_API_KEY),
    configuredSecret(process.env.OPENCLAW_API_KEY),
  ].filter(Boolean)
  const header = request.headers.get('x-agent-key') || request.headers.get('x-api-key')
  if (allowed.length && allowed.includes(header)) return { error: null }
  return requireCrmWrite(request)
}

function computeSubtotal(items) {
  return (items || []).reduce((s, it) => s + (Number(it.qty) || 1) * (Number(it.rate) || 0), 0)
}

async function checkStripePayment(body, data, { requireSessionMatch = false } = {}) {
  const idx = data.invoices.findIndex(i => i.id === body.id)
  if (idx < 0) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
  const invoice = data.invoices[idx]
  if (!invoice.stripeSessionId) return NextResponse.json({ error: 'Invoice has not been sent yet' }, { status: 400 })
  if (requireSessionMatch && body.sessionId !== invoice.stripeSessionId) {
    return NextResponse.json({ error: 'Payment session required' }, { status: 401 })
  }
  const stripe = getStripe()
  if (!stripe) return NextResponse.json({ error: 'Stripe not configured' }, { status: 400 })
  try {
    const session = await stripe.checkout.sessions.retrieve(invoice.stripeSessionId, { expand: ['payment_intent'] })
    const result = session.payment_status === 'paid'
      ? recordCheckoutSessionPayment(session, { source: 'invoice_check' })
      : null
    return NextResponse.json({ ok: true, invoice: result?.invoice || data.invoices[idx], payment: result?.payment || null, paymentStatus: session.payment_status })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

function markTimeActivitiesInvoiced(activityIds, invoice) {
  const ids = [...new Set((activityIds || []).filter(Boolean))]
  if (ids.length === 0 || !invoice?.clientId) return 0

  const data = readData('activities.json') || { activities: [] }
  let changed = 0
  data.activities = (data.activities || []).map(activity => {
    if (!ids.includes(activity.id)) return activity
    if (activity.type !== 'time_tracked') return activity
    if (activity.linkedTo?.accountId !== invoice.clientId) return activity
    if (activity.meta?.invoiceId) return activity
    changed += 1
    return {
      ...activity,
      updatedAt: new Date().toISOString(),
      meta: {
        ...(activity.meta || {}),
        invoiceId: invoice.id,
        invoiceNumber: invoice.number,
        invoicedAt: new Date().toISOString(),
      },
    }
  })
  if (changed > 0) {
    data.lastUpdated = new Date().toISOString()
    writeData('activities.json', data)
  }
  return changed
}

function buildPdf(invoice, client) {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ size: 'letter', margin: 50 })
    const chunks = []
    doc.on('data', c => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))

    const logoPath = path.join(process.cwd(), 'public', 'brand', 'fd-brand-dark.png')
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, 50, 40, { width: 240 })
    } else {
      doc.fontSize(20).font('Helvetica-Bold').fillColor('#0A0B0D').text('Farrington Development', 50, 50)
    }

    doc.fontSize(9).font('Helvetica').fillColor('#6B6F78')
    doc.text('Farrington Development LLC', 50, 115)
    doc.text('Asheville, North Carolina')
    doc.text('www.company.example.com')

    doc.fontSize(28).font('Helvetica-Bold').fillColor('#0A0B0D')
    doc.text('INVOICE', 400, 50, { align: 'right' })
    doc.fontSize(10).font('Helvetica').fillColor('#6B6F78')
    doc.text(`Invoice: ${invoice.number}`, 400, 85, { align: 'right' })
    const dateStr = new Date(invoice.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    doc.text(`Date: ${dateStr}`, { align: 'right' })
    if (invoice.dueDate) {
      const dueStr = new Date(invoice.dueDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      doc.text(`Due: ${dueStr}`, { align: 'right' })
    }

    doc.moveTo(50, 165).lineTo(562, 165).strokeColor('#6B6F78').lineWidth(0.5).stroke()

    doc.fontSize(10).font('Helvetica-Bold').fillColor('#0A0B0D').text('BILL TO:', 50, 180)
    doc.fontSize(11).font('Helvetica').fillColor('#0A0B0D')
    doc.text(client?.name || invoice.clientName || 'Client', 50, 195)
    if (client?.email) doc.text(client.email)
    if (client?.phone) doc.text(client.phone)
    if (client?.address) doc.text(client.address)

    if (invoice.project) {
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#0A0B0D').text('PROJECT:', 300, 180)
      doc.fontSize(11).font('Helvetica').fillColor('#0A0B0D').text(invoice.project, 300, 195, { width: 250 })
    }

    const tableTop = 280
    doc.rect(50, tableTop, 512, 25).fill('#0A0B0D')
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#F5F1EA')
    doc.text('Description', 60, tableTop + 7)
    doc.text('Qty', 350, tableTop + 7, { width: 50, align: 'center' })
    doc.text('Rate', 400, tableTop + 7, { width: 70, align: 'right' })
    doc.text('Amount', 480, tableTop + 7, { width: 70, align: 'right' })

    let y = tableTop + 30
    let subtotal = 0
    const items = invoice.items?.length ? invoice.items : [{ description: 'Professional Services', qty: 1, rate: 0 }]
    items.forEach((item, i) => {
      const qty = Number(item.qty) || 1
      const rate = Number(item.rate) || 0
      const amt = qty * rate
      subtotal += amt
      const bg = i % 2 === 0 ? '#F5F1EA' : '#ffffff'
      doc.rect(50, y - 3, 512, 22).fill(bg)
      doc.fontSize(10).font('Helvetica').fillColor('#0A0B0D')
      doc.text(item.description || '', 60, y, { width: 280 })
      doc.text(String(qty), 350, y, { width: 50, align: 'center' })
      doc.text(`$${rate.toFixed(2)}`, 400, y, { width: 70, align: 'right' })
      doc.text(`$${amt.toFixed(2)}`, 480, y, { width: 70, align: 'right' })
      y += 22
    })

    y += 10
    doc.moveTo(350, y).lineTo(562, y).strokeColor('#6B6F78').stroke()
    y += 10
    doc.fontSize(11).font('Helvetica').fillColor('#0A0B0D')
    doc.text('Subtotal:', 400, y, { width: 70, align: 'right' })
    doc.text(`$${subtotal.toFixed(2)}`, 480, y, { width: 70, align: 'right' })
    y += 25
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#0A0B0D')
    doc.text('Total Due:', 380, y, { width: 90, align: 'right' })
    doc.text(`$${subtotal.toFixed(2)}`, 480, y, { width: 70, align: 'right' })

    if (invoice.notes) {
      y += 50
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#0A0B0D').text('Notes:', 50, y)
      doc.fontSize(10).font('Helvetica').fillColor('#6B6F78').text(invoice.notes, 50, y + 15, { width: 500 })
    }

    doc.fontSize(8).font('Helvetica').fillColor('#6B6F78')
    doc.text('Thank you for your business!', 50, 720, { align: 'center', width: 512 })
    doc.text('Farrington Development LLC — Asheville, NC', { align: 'center', width: 512 })

    doc.end()
  })
}

export async function GET(request) {
  const { error } = await requireCrmRead(request)
  if (error) return error
  const data = hydrateProjectLinks(loadInvoices())
  const { searchParams } = new URL(request.url)
  const projectId = searchParams.get('projectId')
  const clientId = searchParams.get('clientId') || searchParams.get('accountId')
  let invoices = data.invoices || []
  if (projectId) invoices = invoices.filter(i => i.projectId === projectId)
  if (clientId) invoices = invoices.filter(i => i.clientId === clientId)
  if (projectId || clientId) return NextResponse.json({ invoices, lastUpdated: data.lastUpdated })
  return NextResponse.json(data)
}

export async function POST(request) {
  const body = await request.json()
  const data = loadInvoices()

  if (body.action === 'check_payment') {
    const { error } = await requireCrmWriteOrAgentKey(request)
    return checkStripePayment(body, data, { requireSessionMatch: !!error })
  }

  const { error } = await requireCrmWriteOrAgentKey(request)
  if (error) return error

  if (body.action === 'create') {
    const client = findClient(body.clientId)
    if (!client && !body.clientName) return NextResponse.json({ error: 'Client not found' }, { status: 404 })
    const invoice = {
      id: genId(),
      number: genInvoiceNum(),
      clientId: body.clientId || '',
      clientName: client?.name || body.clientName || '',
      project: body.project || '',
      projectId: body.projectId || '',
      items: body.items || [],
      timeActivityIds: body.timeActivityIds || [],
      notes: body.notes || '',
      date: body.date || new Date().toISOString(),
      dueDate: body.dueDate || null,
      status: 'draft',
      amount: computeSubtotal(body.items),
      stripeInvoiceId: null,
      hostedUrl: null,
      createdAt: new Date().toISOString(),
    }
    data.invoices.push(invoice)
    saveInvoices(data)
    const timeActivitiesMarked = markTimeActivitiesInvoiced(invoice.timeActivityIds, invoice)
    if (invoice.clientId) {
      try {
        logActivity({
          type: 'invoice_created',
          subject: `Invoice ${invoice.number} created for ${invoice.clientName || 'client'}`,
          body: `Amount: $${(Number(invoice.amount) || 0).toFixed(2)}. Status: draft.`,
          linkedTo: { accountId: invoice.clientId },
          meta: { invoiceId: invoice.id, invoiceNumber: invoice.number, amount: invoice.amount },
        })
      } catch (err) {
        console.warn('[invoice] activity log failed on create:', String(err.message || err).slice(0, 160))
      }
    }
    return NextResponse.json({ ok: true, invoice, timeActivitiesMarked })
  }

  if (body.action === 'update') {
    const idx = data.invoices.findIndex(i => i.id === body.invoice?.id)
    if (idx < 0) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    data.invoices[idx] = { ...data.invoices[idx], ...body.invoice, amount: computeSubtotal(body.invoice.items || data.invoices[idx].items) }
    saveInvoices(data)
    return NextResponse.json({ ok: true, invoice: data.invoices[idx] })
  }

  if (body.action === 'delete') {
    data.invoices = data.invoices.filter(i => i.id !== body.id)
    saveInvoices(data)
    return NextResponse.json({ ok: true })
  }

  if (body.action === 'bulk_delete') {
    const ids = new Set(body.ids || [])
    data.invoices = data.invoices.filter(i => !ids.has(i.id))
    saveInvoices(data)
    return NextResponse.json({ ok: true, deleted: ids.size })
  }

  if (body.action === 'set_status') {
    const idx = data.invoices.findIndex(i => i.id === body.id)
    if (idx < 0) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    data.invoices[idx].status = body.status
    data.invoices[idx].updatedAt = new Date().toISOString()
    saveInvoices(data)
    return NextResponse.json({ ok: true, invoice: data.invoices[idx] })
  }

  if (body.action === 'pdf') {
    const invoice = data.invoices.find(i => i.id === body.id)
    if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    const client = findClient(invoice.clientId)
    const buf = await buildPdf(invoice, client)
    return new NextResponse(buf, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="invoice-${invoice.number}.pdf"`,
        'X-Content-Type-Options': 'nosniff',
      },
    })
  }

  if (body.action === 'send') {
    const idx = data.invoices.findIndex(i => i.id === body.id)
    if (idx < 0) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    const invoice = data.invoices[idx]
    const client = findClient(invoice.clientId)
    const email = body.to || client?.email
    if (!email || !email.includes('@')) return NextResponse.json({ error: 'Client has no email on file' }, { status: 400 })

    const stripe = getStripe()
    if (!stripe) return NextResponse.json({ error: 'Stripe not configured (STRIPE_SECRET_KEY missing)' }, { status: 400 })
    const resendKey = process.env.RESEND_API_KEY
    if (!resendKey) return NextResponse.json({ error: 'RESEND_API_KEY not set' }, { status: 400 })

    const amount = computeSubtotal(invoice.items)
    if (amount <= 0) return NextResponse.json({ error: 'Invoice amount must be greater than zero' }, { status: 400 })

    const baseUrl = getBaseUrl()
    try {
      const lineItems = (invoice.items || []).filter(it => (Number(it.rate) || 0) > 0).map(it => ({
        quantity: Math.max(1, Math.round(Number(it.qty) || 1)),
        price_data: {
          currency: 'usd',
          unit_amount: Math.round((Number(it.rate) || 0) * 100),
          product_data: { name: String(it.description || 'Service').slice(0, 250) },
        },
      }))
      if (lineItems.length === 0) lineItems.push({
        quantity: 1,
        price_data: { currency: 'usd', unit_amount: Math.round(amount * 100), product_data: { name: `Invoice ${invoice.number}` } },
      })

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        customer_email: email,
        line_items: lineItems,
        success_url: `${baseUrl}/invoice/${invoice.id}/paid?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${baseUrl}/invoice/${invoice.id}`,
        payment_intent_data: {
          description: `Invoice ${invoice.number} — ${client?.name || invoice.clientName}`,
          receipt_email: email,
          metadata: { invoiceId: invoice.id, invoiceNumber: invoice.number, clientId: invoice.clientId || '' },
        },
        metadata: { invoiceId: invoice.id, invoiceNumber: invoice.number, clientId: invoice.clientId || '' },
      })

      const nextInvoice = {
        ...invoice,
        stripeSessionId: session.id,
        stripeSessionUrl: session.url,
        amount,
      }

      const pdfBuf = await buildPdf(nextInvoice, client)
      const fmtUSD = (n) => Number(n || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
      const dueStr = invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : ''
      const bodyHtml = `
        <p>Hi ${client?.name || invoice.clientName || 'there'},</p>
        <p>Your invoice <strong>${invoice.number}</strong> is ready.</p>
        <table style="margin:16px 0;font-size:14px">
          <tr><td style="padding:4px 16px 4px 0;color:#6b7084">Amount due:</td><td style="font-weight:600">${fmtUSD(amount)}</td></tr>
          ${dueStr ? `<tr><td style="padding:4px 16px 4px 0;color:#6b7084">Due:</td><td>${dueStr}</td></tr>` : ''}
          ${invoice.project ? `<tr><td style="padding:4px 16px 4px 0;color:#6b7084">Project:</td><td>${invoice.project}</td></tr>` : ''}
        </table>
        <p style="text-align:center;margin:28px 0">
          <a href="${session.url}" style="background:#16a34a;color:white;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block;font-size:16px">Pay ${fmtUSD(amount)} Now</a>
        </p>
        <p style="font-size:13px;color:#6b7084;text-align:center">Secure payment by Stripe. A receipt will be emailed automatically after payment.</p>
        <p style="font-size:12px;color:#6b7084">The full invoice PDF is attached for your records.</p>
      `

      const resend = new Resend(resendKey)
      const fromAddr = process.env.FARRINGTON_FROM_EMAIL || process.env.RESEND_FROM || 'Farrington Development <redacted@example.invalid>'
      const fallbackFromAddr = process.env.RESEND_FALLBACK_FROM || process.env.RESEND_FROM || 'Farrington Development <redacted@example.invalid>'
      const timeTag = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
      let result = await resend.emails.send({
        from: fromAddr,
        to: [email],
        replyTo: 'personal@example.invalid',
        subject: `Invoice ${invoice.number} from Farrington Development · ${timeTag}`,
        html: wrapEmailBody(bodyHtml),
        attachments: [{ filename: `invoice-${invoice.number}.pdf`, content: pdfBuf.toString('base64') }],
      })
      if (result.error && fallbackFromAddr !== fromAddr) {
        result = await resend.emails.send({
          from: fallbackFromAddr,
          to: [email],
          replyTo: 'personal@example.invalid',
          subject: `Invoice ${invoice.number} from Farrington Development - ${timeTag}`,
          html: wrapEmailBody(bodyHtml),
          attachments: [{ filename: `invoice-${invoice.number}.pdf`, content: pdfBuf.toString('base64') }],
        })
      }
      if (result.error) {
        data.invoices[idx] = {
          ...nextInvoice,
          status: invoice.status || 'draft',
          lastSendError: result.error.message,
          lastSendErrorAt: new Date().toISOString(),
        }
        saveInvoices(data)
        return NextResponse.json({ error: result.error.message }, { status: 502 })
      }

      const resendEmailId = result.data?.id || result.id || null
      data.invoices[idx] = {
        ...nextInvoice,
        status: 'sent',
        sentAt: new Date().toISOString(),
        sentTo: email,
        resendEmailId,
        lastSendError: null,
        lastSendErrorAt: null,
      }
      saveInvoices(data)
      if (data.invoices[idx].clientId) {
        try {
          logActivity({
            type: 'invoice_sent',
            subject: `Invoice ${data.invoices[idx].number || data.invoices[idx].id} sent to ${data.invoices[idx].clientName || 'client'}`,
            body: `Amount: $${(Number(data.invoices[idx].amount) || 0).toFixed(2)}. Sent to ${email}.`,
            linkedTo: { accountId: data.invoices[idx].clientId },
            meta: { invoiceId: data.invoices[idx].id, invoiceNumber: data.invoices[idx].number, hostedUrl: data.invoices[idx].hostedUrl || data.invoices[idx].stripeSessionUrl },
          })
        } catch (err) {
          console.warn('[invoice] activity log failed on send:', String(err.message || err).slice(0, 160))
        }
      }

      return NextResponse.json({ ok: true, invoice: data.invoices[idx], payUrl: session.url, sentTo: email, resendEmailId })
    } catch (err) {
      return NextResponse.json({ error: err.message }, { status: 500 })
    }
  }

  if (body.action === 'mark_paid_manual') {
    const idx = data.invoices.findIndex(i => i.id === body.id)
    if (idx < 0) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    data.invoices[idx] = {
      ...data.invoices[idx],
      status: 'paid',
      paidAt: new Date().toISOString(),
      paidAmount: Number(body.amount) || data.invoices[idx].amount,
      paymentRef: body.paymentId || null,
      paymentMethod: body.method || 'manual',
    }
    saveInvoices(data)
    return NextResponse.json({ ok: true, invoice: data.invoices[idx] })
  }

  if (body.action === 'list_unpaid_for_client') {
    const unpaid = (data.invoices || []).filter(i => i.clientId === body.clientId && i.status !== 'paid')
    return NextResponse.json({ ok: true, invoices: unpaid })
  }

  // Legacy one-shot PDF (no save) — kept for backward compat with older UI code
  const client = findClient(body.clientId)
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 })
  const invoice = {
    number: genInvoiceNum(),
    clientName: client.name,
    project: body.project || '',
    items: body.items || [],
    notes: body.notes || '',
    date: new Date().toISOString(),
    dueDate: body.dueDate || null,
  }
  const buf = await buildPdf(invoice, client)
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="invoice-${invoice.number}.pdf"`,
    },
  })
}
