// Document attachment storage: real files (PDFs, images, office docs) that live IN a
// document's folder in the Documents module, e.g. a quote PDF filed under a client.
//
// STORAGE CONTRACT (other writers, such as an import script, must follow it exactly)
//
//   Root:   <cwd>/data/document-files          (override with the DOCUMENT_FILES_DIR env var)
//   File:   <root>/<documentId>/<attachmentId>.<ext>
//   Ids:    documentId and attachmentId must match /^[A-Za-z0-9_-]+$/ (no dots, no slashes)
//   Ext:    pdf | png | jpg | jpeg | docx | xlsx | txt | csv   (lower case, from the whitelist below)
//   Size:   at most 25 MB per file
//
//   Record: the owning document in documents.json (`{ documents: [] }` or a bare array)
//           carries `attachments: [{
//             id: 'att_<base36>',            // attachmentId, also the file's base name
//             name,                          // original file name, sanitized (no path parts)
//             ext, mimeType, sizeBytes,
//             sha256,                        // hex digest of the file bytes
//             createdAt,                     // ISO timestamp
//             createdBy,                     // user name / agent name / 'system'
//             url: '/api/documents/file/<documentId>/<id>',   // CRM-authenticated download
//           }]`
//
// A file with no matching record is invisible to the CRM; a record with no file 404s on download.

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { mutateData, readData } from '@/lib/dataStore'
import { logActivity } from '@/lib/entityStore'

const DOCUMENTS_FILE = 'documents.json'

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024
export const ID_PATTERN = /^[A-Za-z0-9_-]+$/

export const ATTACHMENT_MIME_TYPES = Object.freeze({
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  txt: 'text/plain; charset=utf-8',
  csv: 'text/csv; charset=utf-8',
})

export class DocumentFileError extends Error {
  constructor(message, status = 400) {
    super(message)
    this.name = 'DocumentFileError'
    this.status = status
  }
}

export function documentFilesRoot() {
  const override = String(process.env.DOCUMENT_FILES_DIR || '').trim()
  return path.resolve(override || path.join(process.cwd(), 'data', 'document-files'))
}

export function isValidStorageId(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 128 && ID_PATTERN.test(value)
}

export function attachmentUrl(documentId, attachmentId) {
  return `/api/documents/file/${documentId}/${attachmentId}`
}

function extOf(name) {
  const match = /\.([A-Za-z0-9]+)$/.exec(String(name || ''))
  return match ? match[1].toLowerCase() : ''
}

function extFromMime(mimeType) {
  const base = String(mimeType || '').split(';')[0].trim().toLowerCase()
  if (!base) return ''
  if (base === 'image/jpg') return 'jpg'
  for (const [ext, mime] of Object.entries(ATTACHMENT_MIME_TYPES)) {
    if (ext === 'jpeg') continue
    if (mime.split(';')[0] === base) return ext
  }
  return ''
}

// Strips any path component and characters that are unsafe in a header or file name.
export function sanitizeAttachmentName(fileName, ext) {
  const base = String(fileName || '').split(/[\\/]/).pop() || ''
  const cleaned = base
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/["<>:|?*\\]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
  let name = cleaned.slice(0, 120)
  if (!name) name = `attachment.${ext}`
  if (extOf(name) !== ext) name = `${name.replace(/\.+$/, '')}.${ext}`
  return name
}

function actorName(actor) {
  if (!actor) return 'system'
  if (typeof actor === 'string') return actor.slice(0, 80) || 'system'
  return String(actor.displayName || actor.username || actor.id || actor.name || 'system').slice(0, 80)
}

function newAttachmentId() {
  return 'att_' + Date.now().toString(36) + crypto.randomBytes(4).toString('hex')
}

function documentList(data) {
  if (Array.isArray(data)) return data
  if (data && Array.isArray(data.documents)) return data.documents
  return []
}

function findDocument(documentId) {
  return documentList(readData(DOCUMENTS_FILE)).find(d => d?.id === documentId) || null
}

// Applies `edit(document)` to one document inside a single read-modify-write, handling both
// the `{ documents: [] }` and bare-array shapes. Returns the updated document or null.
function mutateDocument(documentId, edit) {
  return mutateData(DOCUMENTS_FILE, (current) => {
    const data = current ?? { documents: [] }
    const list = documentList(data)
    const index = list.findIndex(d => d?.id === documentId)
    if (index < 0) return { data, result: null }
    const next = edit({ ...list[index] })
    list[index] = next
    if (!Array.isArray(data)) data.lastUpdated = new Date().toISOString()
    return { data, result: next }
  })
}

// Absolute path of a stored attachment; throws when the ids/ext could escape the root.
export function attachmentFilePath(documentId, attachmentId, ext) {
  if (!isValidStorageId(documentId)) throw new DocumentFileError('invalid document id')
  if (!isValidStorageId(attachmentId)) throw new DocumentFileError('invalid attachment id')
  const cleanExt = String(ext || '').toLowerCase()
  if (!Object.prototype.hasOwnProperty.call(ATTACHMENT_MIME_TYPES, cleanExt)) throw new DocumentFileError('unsupported file type')
  const root = documentFilesRoot()
  const full = path.resolve(root, documentId, `${attachmentId}.${cleanExt}`)
  if (!full.startsWith(root + path.sep)) throw new DocumentFileError('invalid path')
  return full
}

export function listDocumentAttachments(documentId) {
  if (!isValidStorageId(documentId)) return []
  const doc = findDocument(documentId)
  return Array.isArray(doc?.attachments) ? doc.attachments : []
}

export function attachDocumentFile({ documentId, buffer, fileName, mimeType, actor } = {}) {
  if (!isValidStorageId(documentId)) throw new DocumentFileError('invalid document id')
  if (!Buffer.isBuffer(buffer)) throw new DocumentFileError('file content required')
  if (!buffer.length) throw new DocumentFileError('file is empty')
  if (buffer.length > MAX_ATTACHMENT_BYTES) throw new DocumentFileError('file is larger than the 25 MB limit', 413)

  const ext = extOf(fileName) || extFromMime(mimeType)
  if (!Object.prototype.hasOwnProperty.call(ATTACHMENT_MIME_TYPES, ext)) {
    throw new DocumentFileError('unsupported file type (allowed: pdf, png, jpg, jpeg, docx, xlsx, txt, csv)')
  }
  const doc = findDocument(documentId)
  if (!doc) throw new DocumentFileError('Document not found', 404)

  const id = newAttachmentId()
  const filePath = attachmentFilePath(documentId, id, ext)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const tempPath = `${filePath}.${process.pid}.tmp`
  fs.writeFileSync(tempPath, buffer)
  fs.renameSync(tempPath, filePath)

  const attachment = {
    id,
    name: sanitizeAttachmentName(fileName, ext),
    ext,
    mimeType: ATTACHMENT_MIME_TYPES[ext],
    sizeBytes: buffer.length,
    sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
    createdAt: new Date().toISOString(),
    createdBy: actorName(actor),
    url: attachmentUrl(documentId, id),
  }

  let updated = null
  try {
    updated = mutateDocument(documentId, d => ({
      ...d,
      attachments: [...(Array.isArray(d.attachments) ? d.attachments : []), attachment],
      updatedAt: attachment.createdAt,
    }))
  } catch (error) {
    try { fs.unlinkSync(filePath) } catch {}
    throw error
  }
  if (!updated) {
    try { fs.unlinkSync(filePath) } catch {}
    throw new DocumentFileError('Document not found', 404)
  }

  try {
    logActivity({
      type: 'document',
      subject: `Attached ${attachment.name} to ${updated.title}`,
      body: `${attachment.name} (${Math.max(1, Math.round(attachment.sizeBytes / 1024))} KB) added to the document folder.`,
      linkedTo: { accountId: updated.clientId || updated.linkedTo?.accountId || undefined, documentId },
      meta: { documentId, attachmentId: id },
    })
  } catch {}
  return attachment
}

export function readDocumentAttachment(documentId, attachmentId) {
  if (!isValidStorageId(documentId) || !isValidStorageId(attachmentId)) return null
  const doc = findDocument(documentId)
  const attachment = (Array.isArray(doc?.attachments) ? doc.attachments : []).find(a => a?.id === attachmentId)
  if (!attachment) return null
  try {
    const buffer = fs.readFileSync(attachmentFilePath(documentId, attachmentId, attachment.ext))
    return { attachment, buffer }
  } catch {
    return null
  }
}

// Removes the record and the file. Returns the removed attachment, or null when not found.
export function removeDocumentAttachment(documentId, attachmentId, actor) {
  if (!isValidStorageId(documentId)) throw new DocumentFileError('invalid document id')
  if (!isValidStorageId(attachmentId)) throw new DocumentFileError('invalid attachment id')
  const doc = findDocument(documentId)
  if (!doc) throw new DocumentFileError('Document not found', 404)
  const existing = (Array.isArray(doc.attachments) ? doc.attachments : []).find(a => a?.id === attachmentId)
  if (!existing) throw new DocumentFileError('Attachment not found', 404)

  const updated = mutateDocument(documentId, d => ({
    ...d,
    attachments: (Array.isArray(d.attachments) ? d.attachments : []).filter(a => a?.id !== attachmentId),
    updatedAt: new Date().toISOString(),
  }))
  try { fs.unlinkSync(attachmentFilePath(documentId, attachmentId, existing.ext)) } catch {}

  try {
    logActivity({
      type: 'document',
      subject: `Removed ${existing.name} from ${updated?.title || doc.title}`,
      body: `Attachment removed by ${actorName(actor)}.`,
      linkedTo: { accountId: doc.clientId || doc.linkedTo?.accountId || undefined, documentId },
      meta: { documentId, attachmentId },
    })
  } catch {}
  return existing
}
