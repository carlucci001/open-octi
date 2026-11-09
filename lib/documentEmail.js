// One-click "email this document to the client" with the OpenOcti letterhead.
//
// Used by the Documents module (Email to client icon / drawer button, POST /api/documents
// action 'email') and by the agent `send_document` tool. Recipient resolution, sender
// identity, and the retry-with-fallback-sender behavior mirror sendSignatureEmail in
// app/api/documents/route.js.

import { Resend } from 'resend'
import { buildEmail, resolveEmailSignatureBrand } from '@/lib/emailSignature'
import { isOpenOcti } from '@/lib/edition'
import { mutateData, readData } from '@/lib/dataStore'
import { findById, loadAll, logActivity } from '@/lib/entityStore'
import { readDocumentAttachment } from '@/lib/documentFiles'
import { renderDocumentPdf } from '@/lib/documentPdf'

const DOCUMENTS_FILE = 'documents.json'
const EMAIL_LOG_LIMIT = 20
const EMAIL_PATTERN = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/

function documentList(data) {
  if (Array.isArray(data)) return data
  if (data && Array.isArray(data.documents)) return data.documents
  return []
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function cleanEmail(value) {
  const email = String(value || '').trim()
  return EMAIL_PATTERN.test(email) ? email : ''
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'document'
}

function firstName(name) {
  const first = String(name || '').trim().split(/\s+/)[0] || ''
  return first.replace(/[^\p{L}\p{N}'.-]/gu, '')
}

// explicit `to` -> account email -> primary contact of the account -> values.client_email.
function resolveRecipient(doc, explicitTo) {
  const contacts = loadAll('contacts')
  const accountId = doc.clientId || doc.linkedTo?.accountId || ''
  const account = accountId ? findById('accounts', accountId) : null
  const accountContacts = accountId ? contacts.filter(c => c.accountId === accountId) : []
  const primary = accountContacts.find(c => c.primary && cleanEmail(c.email))
    || accountContacts.find(c => cleanEmail(c.email))
    || null
  const contactFor = (email) => {
    const lower = email.toLowerCase()
    return contacts.find(c => String(c.email || '').trim().toLowerCase() === lower) || null
  }
  const clientLabel = doc.clientName || account?.name || doc.values?.client_name || 'this client'

  const explicit = String(explicitTo || '').trim()
  if (explicit) {
    const email = cleanEmail(explicit)
    if (!email) return { error: `invalid email address: ${explicit}`, clientLabel }
    return { email, contact: contactFor(email), account, clientLabel }
  }
  const accountEmail = cleanEmail(account?.email)
  if (accountEmail) return { email: accountEmail, contact: primary || contactFor(accountEmail), account, clientLabel }
  if (primary) return { email: cleanEmail(primary.email), contact: primary, account, clientLabel }
  const valuesEmail = cleanEmail(doc.values?.client_email)
  if (valuesEmail) return { email: valuesEmail, contact: contactFor(valuesEmail), account, clientLabel }
  return { error: `no email on file for ${clientLabel}`, account, clientLabel }
}

function senderIdentity() {
  const openEdition = isOpenOcti()
  const from = process.env.RESEND_FROM || (openEdition ? 'OpenOcti <noreply@openocti.com>' : 'Your organization <redacted@example.invalid>')
  const fallbackFrom = process.env.RESEND_FALLBACK_FROM || from
  const replyTo = openEdition ? (process.env.OWNER_EMAIL || '') : (process.env.CARL_EMAIL || 'personal@example.invalid')
  return { openEdition, from, fallbackFrom, replyTo }
}

function buildBodyHtml({ greetingName, title, note }) {
  const noteHtml = String(note || '').trim()
    ? `<p>${escapeHtml(String(note).trim()).replace(/\r?\n/g, '<br/>')}</p>`
    : ''
  return `
    <p>Hi ${escapeHtml(greetingName || 'there')},</p>
    <p>Attached is <strong>${escapeHtml(title)}</strong> for your records.</p>
    ${noteHtml}
    <p>Reply to this email with any questions.</p>
  `
}

// Every PDF filed on the document; otherwise the document itself rendered on the letterhead.
async function collectPdfAttachments(doc) {
  const filed = []
  for (const attachment of Array.isArray(doc.attachments) ? doc.attachments : []) {
    if (String(attachment?.ext || '').toLowerCase() !== 'pdf') continue
    const stored = readDocumentAttachment(doc.id, attachment.id)
    if (stored) filed.push({ filename: attachment.name || `${attachment.id}.pdf`, content: stored.buffer })
  }
  if (filed.length) return filed
  const rendered = await renderDocumentPdf({ title: doc.title, body: doc.body, signature: doc.signature })
  return [{ filename: `${slugify(doc.title)}.pdf`, content: rendered }]
}

export async function emailDocumentToClient({ documentId, to, note, actor, request } = {}) {
  void actor
  void request
  const doc = documentId ? documentList(readData(DOCUMENTS_FILE)).find(d => d?.id === documentId) : null
  if (!doc) return { ok: false, error: 'Document not found', status: 404 }

  const recipient = resolveRecipient(doc, to)
  if (recipient.error) return { ok: false, error: recipient.error }

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY not set' }

  const title = String(doc.title || doc.templateName || 'Document')
  const { openEdition, from, fallbackFrom, replyTo } = senderIdentity()
  const businessName = openEdition
    ? (resolveEmailSignatureBrand('farrington').name || process.env.OPENOCTI_BUSINESS_NAME || 'Your business')
    : 'Your organization'

  let pdfs
  try {
    pdfs = await collectPdfAttachments(doc)
  } catch (error) {
    return { ok: false, error: `could not prepare the PDF: ${error.message}` }
  }
  const { html, inlineAttachments } = buildEmail(
    buildBodyHtml({ greetingName: firstName(recipient.contact?.name), title, note }),
    'farrington',
  )

  const payload = {
    from,
    to: [recipient.email],
    cc: replyTo && replyTo.toLowerCase() !== recipient.email.toLowerCase() ? [replyTo] : undefined,
    replyTo: replyTo || undefined,
    subject: `${title} — ${businessName}`,
    html,
    attachments: [...pdfs, ...(inlineAttachments || [])],
  }

  let messageId = ''
  try {
    const resend = new Resend(apiKey)
    let result = await resend.emails.send(payload)
    const message = result?.error?.message || ''
    if (result?.error && fallbackFrom !== from && /domain|verify|authorization|permission|sender/i.test(message)) {
      result = await resend.emails.send({ ...payload, from: fallbackFrom })
    }
    if (result?.error) return { ok: false, error: result.error.message || 'email send failed' }
    messageId = result?.data?.id || ''
  } catch (error) {
    return { ok: false, error: error?.message || 'email send failed' }
  }

  const names = pdfs.map(p => p.filename)
  const now = new Date().toISOString()
  const accountId = doc.clientId || doc.linkedTo?.accountId || undefined
  const contactId = recipient.contact?.id || doc.contactId || doc.linkedTo?.contactId || undefined

  // The email is already out; a bookkeeping failure must not report the send as failed.
  try {
    mutateData(DOCUMENTS_FILE, (current) => {
      const data = current ?? { documents: [] }
      const list = documentList(data)
      const index = list.findIndex(d => d?.id === doc.id)
      if (index < 0) return { data, result: null }
      const prior = list[index]
      const keepStatus = prior.status === 'signed'
      list[index] = {
        ...prior,
        status: keepStatus ? prior.status : 'sent',
        sentAt: keepStatus ? (prior.sentAt || now) : now,
        lastEmailedAt: now,
        lastEmailedTo: recipient.email,
        emailLog: [
          ...(Array.isArray(prior.emailLog) ? prior.emailLog : []),
          { at: now, to: recipient.email, messageId, attachments: names },
        ].slice(-EMAIL_LOG_LIMIT),
        updatedAt: now,
      }
      if (!Array.isArray(data)) data.lastUpdated = now
      return { data, result: list[index] }
    })
  } catch {}

  try {
    logActivity({
      type: 'email',
      subject: `Emailed: ${title}`,
      body: `To: ${recipient.email}\nAttachments: ${names.join(', ')}`,
      linkedTo: { accountId, contactId, documentId: doc.id },
      meta: { documentId: doc.id, messageId },
    })
  } catch {}

  return { ok: true, to: recipient.email, messageId, attachments: names, documentId: doc.id }
}
