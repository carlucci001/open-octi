import { NextResponse } from 'next/server'
import { loadAll } from '@/lib/entityStore'
import { requireCapability } from '@/lib/permissions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function configuredSecret(value) {
  const v = String(value || '').trim()
  if (!v) return null
  if (['missing', 'changeme', 'change-me', 'undefined', 'null'].includes(v.toLowerCase())) return null
  return v
}

function internalAgentHeaders() {
  const key = configuredSecret(process.env.AGENT_API_KEY) || configuredSecret(process.env.OPENCLAW_API_KEY)
  return {
    'Content-Type': 'application/json',
    ...(key ? { 'x-agent-key': key } : {}),
  }
}

function hasInvoiceContext(message, messages = [], section = '') {
  const lc = String(message || '').toLowerCase()
  if (section === 'finance' && /\$|\bdollars?\b|\binvoice\b|\bemail\b|\bsend\b/.test(lc)) return true
  if (/\binvoice\b|\bpayment request\b/.test(lc)) return true
  return (messages || []).slice(-8).some(m => {
    const text = String(m?.content || '').toLowerCase()
    return text.includes('i can draft the invoice')
      || text.includes('help me draft a clean invoice')
      || text.includes('draft invoice')
      || text.includes('payment request')
  })
}

function isStarter(message) {
  const lc = String(message || '').toLowerCase()
  return /\b(invoice|payment request)\b/.test(lc)
    && /\b(draft|create|start|help|prepare|write|new)\b/.test(lc)
    && !/\$|\bdollars?\b/.test(lc)
}

function extractAmount(message) {
  const raw = String(message || '')
  const match = raw.match(/\$\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)|\b([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*(?:dollars?|usd)\b/i)
  const amount = Number(String(match?.[1] || match?.[2] || '').replace(/,/g, ''))
  return Number.isFinite(amount) && amount > 0 ? { amount, match } : null
}

function coercePositiveAmount(value) {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : null
  const amount = Number(String(value || '').replace(/[$,\s]/g, ''))
  return Number.isFinite(amount) && amount > 0 ? amount : null
}

function resolveAccountByQuery(query) {
  const lc = String(query || '').toLowerCase().replace(/[^\w\s.'-]/g, ' ')
  const accounts = (loadAll('accounts') || [])
    .filter(a => a?.type === 'client' && a?.name)
    .sort((a, b) => String(b.name).length - String(a.name).length)
  return accounts.find(a => lc.includes(String(a.name).toLowerCase())) || null
}

function resolveAccount(message) {
  return resolveAccountByQuery(message)
}

function extractClientName(message, account) {
  if (account?.name) return account.name
  const raw = String(message || '')
  const beforeAmount = raw.split(/\$\s*[0-9]|\b[0-9][0-9,]*(?:\.[0-9]{1,2})?\s*(?:dollars?|usd)\b/i)[0] || raw
  const match = beforeAmount.match(/\b(?:to|for|client|customer|send|email|mail)\s+([a-z][a-z .'-]{2,80})$/i)
    || raw.match(/\b(?:to|for|client|customer)\s+([a-z][a-z .'-]{2,80}?)(?=\s+(?:for\s+\$|\$|and\s+email|email|mail|via|with|miscellaneous|services|send)\b|$)/i)
  return String(match?.[1] || '').replace(/\b(an?|the|invoice|payment|request|email|send|mail)\b/gi, ' ').replace(/\s+/g, ' ').trim()
}

function extractDescription(message, amountMatch, account, clientName) {
  const raw = String(message || '')
  let description = 'Miscellaneous services'
  const amountText = amountMatch?.[0] || ''
  const amountIdx = amountMatch?.index ?? -1
  if (amountIdx >= 0) {
    const after = raw.slice(amountIdx + amountText.length)
      .replace(/\b(and\s+)?(send|email|mail|invoice|payment|request|to|for|client|customer|it|her|him|them|now|draft|leave)\b/gi, ' ')
      .replace(/[.?!]+$/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    const accountName = String(account?.name || clientName || '').toLowerCase()
    if (after && !(accountName && after.toLowerCase().includes(accountName))) description = after.slice(0, 120)
  }
  if (/misc/i.test(raw)) description = 'Miscellaneous services'
  return description
}

function parseInvoiceCommand(message, messages, section) {
  if (!hasInvoiceContext(message, messages, section)) return null
  if (isStarter(message)) return { starter: true }
  const amountInfo = extractAmount(message)
  if (!amountInfo) return null
  const account = resolveAccount(message)
  const clientName = extractClientName(message, account)
  const description = extractDescription(message, amountInfo.match, account, clientName)
  const shouldSend = /\b(send|email|mail)\b/i.test(message)
  return { account, clientName, amount: amountInfo.amount, description, shouldSend }
}

function parseStructuredInvoiceCommand(payload) {
  const hasStructuredFields = ['clientName', 'client', 'customerName', 'amount', 'description', 'send', 'emailNow']
    .some(key => Object.prototype.hasOwnProperty.call(payload || {}, key))
  if (!hasStructuredFields) return null

  const rawClientName = String(payload.clientName || payload.client || payload.customerName || '').trim()
  const amount = coercePositiveAmount(payload.amount)
  if (!rawClientName) return { missing: 'I need the client name before I can create that invoice.' }
  if (!amount) return { missing: 'I need the invoice amount before I can create that invoice.' }

  const account = resolveAccountByQuery(rawClientName)
  const description = String(payload.description || payload.memo || payload.service || '').trim() || 'Miscellaneous services'
  const shouldSend = payload.send === true || payload.emailNow === true || /\b(send|email|mail)\b/i.test(payload.message || '')
  return {
    account,
    clientName: account?.name || rawClientName,
    amount,
    description: description.slice(0, 120),
    shouldSend,
  }
}

async function postInvoice(body) {
  const res = await fetch('http://localhost:3000/api/invoices', {
    method: 'POST',
    headers: internalAgentHeaders(),
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok || json.error) throw new Error(json.error || `Invoice API failed (${res.status})`)
  return json
}

export async function POST(request) {
  const { error } = await requireCapability(request, 'agents:use')
  if (error) return error
  try {
    const payload = await request.json()
    const { message, messages = [], section = '' } = payload || {}
    const parsed = parseStructuredInvoiceCommand(payload) || parseInvoiceCommand(message, messages, section)
    if (!parsed) return NextResponse.json({ ok: true, handled: false })
    if (parsed.starter) {
      return NextResponse.json({
        ok: true,
        handled: true,
        text: 'I can draft the invoice. Tell me the client name, amount, what the charge is for, due date if you want one, and whether to email it now or leave it as a draft.',
      })
    }
    if (parsed.missing) {
      return NextResponse.json({ ok: true, handled: true, text: parsed.missing })
    }
    if (!parsed.account && !parsed.clientName) {
      return NextResponse.json({ ok: true, handled: true, text: 'I need the client name before I can create that invoice.' })
    }

    console.log(`[invoice-command] create amount=${parsed.amount.toFixed(2)} client=${String(parsed.account?.name || parsed.clientName || 'unknown').slice(0, 80)} send=${parsed.shouldSend}`)
    const created = await postInvoice({
      action: 'create',
      clientId: parsed.account?.id || '',
      clientName: parsed.account?.name || parsed.clientName,
      items: [{ description: parsed.description, qty: 1, rate: parsed.amount }],
      notes: 'Created from AI Wizard invoice command.',
    })
    const invoice = created.invoice
    if (!parsed.shouldSend) {
      return NextResponse.json({
        ok: true,
        handled: true,
        text: `Draft invoice ${invoice.number || invoice.id} created for ${invoice.clientName || parsed.clientName} for $${(Number(invoice.amount) || parsed.amount).toFixed(2)}.`,
      })
    }

    try {
      const sent = await postInvoice({ action: 'send', id: invoice.id })
      const sentInvoice = sent.invoice || invoice
      return NextResponse.json({
        ok: true,
        handled: true,
        text: `Invoice ${sentInvoice.number || sentInvoice.id} was created and emailed to ${sent.sentTo || parsed.account?.email || 'the client'} for $${(Number(sentInvoice.amount) || parsed.amount).toFixed(2)}.`,
      })
    } catch (err) {
      return NextResponse.json({
        ok: true,
        handled: true,
        text: `Draft invoice ${invoice.number || invoice.id} was created for ${invoice.clientName || parsed.clientName} for $${(Number(invoice.amount) || parsed.amount).toFixed(2)}, but email sending failed: ${err.message}.`,
      })
    }
  } catch (err) {
    console.warn('[invoice-command] failed:', String(err.message || err).slice(0, 180))
    return NextResponse.json({
      ok: false,
      handled: true,
      error: err.message || 'Invoice command failed',
      text: `Invoice command failed: ${err.message || 'unknown error'}.`,
    }, { status: 500 })
  }
}
