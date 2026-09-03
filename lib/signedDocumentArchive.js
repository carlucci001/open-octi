import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import PDFDocument from 'pdfkit'
import { signatureCertificateLines } from './documentSignatures'
import { brandAssetsFor } from './brand-assets'

const ARCHIVE_DIR = path.join(process.cwd(), 'data', 'signed-documents')

function safeFilePart(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'document'
}

function writeBody(doc, body) {
  const lines = String(body || '').split('\n')
  for (const raw of lines) {
    const line = raw
    if (!line.trim()) {
      doc.moveDown(0.5)
    } else if (line.startsWith('# ')) {
      doc.fontSize(16).font('Helvetica-Bold').fillColor('#0A0B0D').text(line.slice(2))
      doc.moveDown(0.3)
    } else if (line.startsWith('## ')) {
      doc.fontSize(13).font('Helvetica-Bold').fillColor('#0A0B0D').text(line.slice(3))
      doc.moveDown(0.2)
    } else if (line.startsWith('### ')) {
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#333').text(line.slice(4))
      doc.moveDown(0.1)
    } else if (line.startsWith('> ')) {
      doc.fontSize(9).font('Helvetica-Oblique').fillColor('#6B6F78').text(line.slice(2), { width: 512 })
      doc.moveDown(0.2)
    } else if (/^\s*[-*]\s/.test(line)) {
      doc.fontSize(10).font('Helvetica').fillColor('#0A0B0D').text('- ' + line.replace(/^\s*[-*]\s/, ''), { width: 500, indent: 10 })
    } else if (line === '---') {
      doc.moveDown(0.3)
      const y = doc.y
      doc.moveTo(50, y).lineTo(562, y).strokeColor('#6B6F78').lineWidth(0.5).stroke()
      doc.moveDown(0.3)
    } else {
      const hasBold = /\*\*[^*]+\*\*/.test(line)
      if (hasBold) {
        const parts = line.split(/(\*\*[^*]+\*\*)/)
        doc.fontSize(10).fillColor('#0A0B0D')
        parts.forEach((part, index) => {
          if (part.startsWith('**') && part.endsWith('**')) {
            doc.font('Helvetica-Bold').text(part.slice(2, -2), { continued: index < parts.length - 1 })
          } else {
            doc.font('Helvetica').text(part, { continued: index < parts.length - 1 })
          }
        })
        doc.text('')
      } else {
        doc.fontSize(10).font('Helvetica').fillColor('#0A0B0D').text(line, { width: 512 })
      }
    }
  }
}

export function buildSignedDocumentPdfBuffer({ title, body, signature }) {
  return new Promise((resolve) => {
    const doc = new PDFDocument({ size: 'letter', margin: 50 })
    const chunks = []
    doc.on('data', chunk => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))

    const brand = brandAssetsFor()
    const logoPath = path.join(process.cwd(), 'public', ...(brand.openOcti ? ['openocti', 'logo-horizontal.png'] : ['brand', 'fd-brand-dark.png']))
    if (fs.existsSync(logoPath)) doc.image(logoPath, 50, 40, { width: 240 })
    doc.fontSize(9).font('Helvetica').fillColor('#6B6F78')
    doc.text('Farrington Development LLC', 50, 115)
    doc.text('Asheville, North Carolina')
    doc.text('company.example.com')
    doc.moveTo(50, 150).lineTo(562, 150).strokeColor('#6B6F78').lineWidth(0.5).stroke()

    doc.fontSize(18).font('Helvetica-Bold').fillColor('#0A0B0D').text(title || 'Signed Document', 50, 170, { width: 512 })
    doc.moveDown(1)
    writeBody(doc, body)

    const certificate = signatureCertificateLines(signature)
    if (certificate.length) {
      doc.addPage()
      doc.fontSize(15).font('Helvetica-Bold').fillColor('#0A0B0D').text(certificate[0])
      doc.moveDown(0.8)
      doc.fontSize(10).font('Helvetica').fillColor('#0A0B0D')
      for (const line of certificate.slice(1)) doc.text(line, { width: 512 })
    }

    doc.end()
  })
}

export async function archiveSignedDocumentPdf(document) {
  fs.mkdirSync(ARCHIVE_DIR, { recursive: true })
  const eventId = document?.signature?.eventId || Date.now().toString(36)
  const fileName = `${safeFilePart(document?.id)}-${safeFilePart(eventId)}-signed.pdf`
  const absolutePath = path.join(ARCHIVE_DIR, fileName)
  const buffer = await buildSignedDocumentPdfBuffer({
    title: document?.title,
    body: document?.body,
    signature: document?.signature,
  })
  fs.writeFileSync(absolutePath, buffer)
  return {
    fileName,
    relativePath: path.relative(process.cwd(), absolutePath).replace(/\\/g, '/'),
    sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
    bytes: buffer.length,
    createdAt: new Date().toISOString(),
  }
}
