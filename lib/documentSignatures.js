import crypto from 'crypto'
import { readData, writeData } from './dataStore'
import { isOpenOcti } from './edition'

const DATA_FILE = 'documents.json'

export function loadDocumentData() {
  return readData(DATA_FILE) || { documents: [], lastUpdated: null }
}

export function saveDocumentData(data) {
  writeData(DATA_FILE, { ...data, lastUpdated: new Date().toISOString() })
}

export function createSignatureToken() {
  return crypto.randomBytes(32).toString('base64url')
}

export function hashSignatureToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex')
}

export function hashDocumentForSignature(document) {
  const stable = {
    id: document?.id || '',
    templateId: document?.templateId || '',
    title: document?.title || '',
    clientId: document?.clientId || '',
    clientName: document?.clientName || '',
    body: document?.body || '',
    values: document?.values || {},
  }
  return crypto.createHash('sha256').update(JSON.stringify(stable)).digest('hex')
}

export function isSignatureRequired(template, body = '') {
  if (typeof template?.requiresSignature === 'boolean') return template.requiresSignature
  return /signature\s*:/i.test(body) || /signed by both parties/i.test(body)
}

export function findDocumentBySignatureToken(token) {
  const tokenHash = hashSignatureToken(token)
  const data = loadDocumentData()
  const document = (data.documents || []).find(d => d.signature?.tokenHash === tokenHash) || null
  return { data, document, tokenHash }
}

export function clientIp(request) {
  const forwarded = request?.headers?.get('x-forwarded-for') || ''
  if (forwarded) return forwarded.split(',')[0].trim()
  return request?.headers?.get('cf-connecting-ip') || request?.headers?.get('x-real-ip') || ''
}

export function publicOrigin(request) {
  if (process.env.SIGNING_PUBLIC_URL) return process.env.SIGNING_PUBLIC_URL.replace(/\/$/, '')
  if (process.env.CRM_PUBLIC_URL) return process.env.CRM_PUBLIC_URL.replace(/\/$/, '')
  // Signing links should always go to the public CRM host. NEXT_PUBLIC_APP_URL
  // can point at the client portal, which is not the canonical signing origin.
  if (process.env.PUBLIC_APP_URL) return process.env.PUBLIC_APP_URL.replace(/\/$/, '')
  if (!request) return isOpenOcti() ? 'http://localhost:3000' : 'https://crm.company.example.com'
  const proto = request?.headers?.get('x-forwarded-proto') || 'https'
  const host = request?.headers?.get('x-forwarded-host') || request?.headers?.get('host') || 'crm.company.example.com'
  const origin = `${proto}://${host}`.replace(/\/$/, '')
  return /portal\.farringtondevelopment\.com/i.test(origin) ? 'https://crm.company.example.com' : origin
}

export function signingConfiguration(env = process.env) {
  const missing = []
  if (!String(env.SIGNING_PUBLIC_URL || '').trim()) missing.push('SIGNING_PUBLIC_URL')
  if (!String(env.RESEND_API_KEY || '').trim()) missing.push('RESEND_API_KEY')
  return {
    configured: missing.length === 0,
    status: missing.length === 0 ? 'configured' : 'not_configured',
    missing,
    message: missing.length === 0
      ? 'E-signature is configured.'
      : 'Not configured — add SIGNING_PUBLIC_URL and RESEND_API_KEY to enable e-signature.',
  }
}

export function signatureCertificateLines(signature = {}) {
  if (signature.status !== 'signed') return []
  return [
    'Electronic Signature Certificate',
    `Signer: ${signature.signerName || ''} <${signature.signerEmail || ''}>`,
    `Signed at: ${signature.signedAt || ''}`,
    `Document SHA-256: ${signature.documentHash || ''}`,
    `Signature event id: ${signature.eventId || ''}`,
    `IP address: ${signature.ip || ''}`,
    `User agent: ${signature.userAgent || ''}`,
  ]
}
