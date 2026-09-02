import { NextResponse } from 'next/server'
import {
  clientIp,
  findDocumentBySignatureToken,
  hashDocumentForSignature,
  saveDocumentData,
} from '@/lib/documentSignatures'
import { logActivity } from '@/lib/entityStore'
import { archiveSignedDocumentPdf } from '@/lib/signedDocumentArchive'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function publicDocument(document) {
  return {
    id: document.id,
    title: document.title,
    clientName: document.clientName,
    body: document.body,
    status: document.status,
    requiresSignature: !!document.requiresSignature,
    signature: {
      status: document.signature?.status || null,
      signerName: document.signature?.signerName || '',
      signerEmail: document.signature?.signerEmail || '',
      requestedAt: document.signature?.requestedAt || '',
      expiresAt: document.signature?.expiresAt || '',
      signedAt: document.signature?.signedAt || '',
      documentHash: document.signature?.documentHash || '',
      eventId: document.signature?.eventId || '',
      signedPdf: document.signature?.signedPdf || null,
    },
  }
}

export async function GET(_request, { params }) {
  const { document } = findDocumentBySignatureToken(params.token)
  if (!document) return NextResponse.json({ ok: false, error: 'Invalid signing link' }, { status: 404 })
  if (document.signature?.expiresAt && new Date(document.signature.expiresAt) < new Date() && document.signature.status !== 'signed') {
    return NextResponse.json({ ok: false, error: 'This signing link has expired' }, { status: 410 })
  }
  return NextResponse.json({ ok: true, document: publicDocument(document) })
}

export async function POST(request, { params }) {
  const { data, document } = findDocumentBySignatureToken(params.token)
  if (!document) return NextResponse.json({ ok: false, error: 'Invalid signing link' }, { status: 404 })
  if (document.signature?.status === 'signed') {
    return NextResponse.json({ ok: true, document: publicDocument(document), alreadySigned: true })
  }
  if (document.signature?.status !== 'pending') {
    return NextResponse.json({ ok: false, error: 'This document is not pending signature' }, { status: 409 })
  }
  if (document.signature?.expiresAt && new Date(document.signature.expiresAt) < new Date()) {
    return NextResponse.json({ ok: false, error: 'This signing link has expired' }, { status: 410 })
  }

  const body = await request.json().catch(() => ({}))
  const signerName = String(body.signerName || '').trim()
  const signerEmail = String(body.signerEmail || '').trim()
  const signatureText = String(body.signatureText || '').trim()
  const consent = !!body.consent
  if (!consent) return NextResponse.json({ ok: false, error: 'Electronic signature consent is required' }, { status: 400 })
  if (!signerName || !signatureText) return NextResponse.json({ ok: false, error: 'Typed name and signature are required' }, { status: 400 })
  if (signerEmail && signerEmail.toLowerCase() !== String(document.signature.signerEmail || '').toLowerCase()) {
    return NextResponse.json({ ok: false, error: 'Signer email does not match this signing request' }, { status: 400 })
  }

  const currentHash = hashDocumentForSignature(document)
  if (currentHash !== document.signature.documentHash) {
    return NextResponse.json({ ok: false, error: 'Document changed after the signing request. Create a new signing request.' }, { status: 409 })
  }

  const now = new Date().toISOString()
  const eventId = 'sig_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  const signedSignature = {
    ...document.signature,
    status: 'signed',
    signedAt: now,
    eventId,
    signerName,
    signerEmail: document.signature.signerEmail,
    signatureText,
    consentAccepted: true,
    consentAcceptedAt: now,
    ip: clientIp(request),
    userAgent: request.headers.get('user-agent') || '',
    events: [
      ...(document.signature.events || []),
      {
        id: eventId,
        type: 'signed',
        at: now,
        ip: clientIp(request),
        userAgent: request.headers.get('user-agent') || '',
      },
    ],
  }

  let signedDocument = {
    ...document,
    status: 'signed',
    signature: signedSignature,
    updatedAt: now,
  }
  let archive = null
  try {
    archive = await archiveSignedDocumentPdf(signedDocument)
    signedDocument = {
      ...signedDocument,
      signature: {
        ...signedDocument.signature,
        signedPdf: archive,
      },
    }
  } catch (error) {
    signedDocument = {
      ...signedDocument,
      signature: {
        ...signedDocument.signature,
        signedPdfError: error.message,
      },
    }
  }

  data.documents = (data.documents || []).map(d => d.id === document.id ? signedDocument : d)
  saveDocumentData(data)
  logActivity({
    type: 'document',
    subject: `Document signed: ${document.title}`,
    body: archive
      ? `${signerName} signed electronically. SHA-256: ${document.signature.documentHash}. Archived PDF: ${archive.relativePath}`
      : `${signerName} signed electronically. SHA-256: ${document.signature.documentHash}. PDF archive could not be created automatically.`,
    linkedTo: { accountId: document.clientId || undefined, documentId: document.id },
    meta: { documentId: document.id, signatureStatus: 'signed', eventId, signedPdf: archive },
  })
  const signedDoc = data.documents.find(d => d.id === document.id)
  return NextResponse.json({ ok: true, document: publicDocument(signedDoc) })
}
