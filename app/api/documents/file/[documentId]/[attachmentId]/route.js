// Authenticated download of a file attached to a document (see lib/documentFiles.js).
//
// CRM staff only (crm:read). Portal users are deliberately NOT allowed here: portal sessions
// are a different auth system and portal document routes never expose attachments, so a
// client only ever receives a file when staff emails it to them.

import { NextResponse } from 'next/server'
import { requireCrmRead } from '@/lib/permissions'
import { readDocumentAttachment } from '@/lib/documentFiles'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function notFound() {
  return NextResponse.json({ error: 'Attachment not found' }, { status: 404 })
}

function contentDisposition(disposition, name) {
  const raw = String(name || 'attachment')
  const ascii = raw.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
  const header = `${disposition}; filename="${ascii}"`
  return ascii === raw ? header : `${header}; filename*=UTF-8''${encodeURIComponent(raw)}`
}

export async function GET(request, { params }) {
  const { error } = await requireCrmRead(request)
  if (error) return error

  const stored = readDocumentAttachment(params?.documentId, params?.attachmentId)
  if (!stored) return notFound()

  const { attachment, buffer } = stored
  const download = new URL(request.url).searchParams.get('download') === '1'
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': attachment.mimeType || 'application/octet-stream',
      'Content-Length': String(buffer.length),
      'Content-Disposition': contentDisposition(download ? 'attachment' : 'inline', attachment.name),
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    },
  })
}
