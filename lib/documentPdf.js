// Renders a Documents-module document (markdown-ish body) to a letterhead PDF.
// Shared by the `pdf` action in app/api/documents/route.js and by lib/documentEmail.js
// (the one-click "Email to client" path renders a PDF when no PDF is filed on the document).

import PDFDocument from 'pdfkit'
import path from 'path'
import fs from 'fs'
import { brandAssetsFor } from '@/lib/brand-assets'
import { signatureCertificateLines } from '@/lib/documentSignatures'

export const DOCUMENT_PDF_FOOTER = 'Your organization · company.example.com · PHONE_REDACTED'

// Documents that were authored as HTML (email drafts) are flattened to text so the PDF does
// not print raw tags. Markdown bodies never start with '<' and pass through untouched.
export function documentBodyToPlainText(body) {
  const text = String(body || '')
  if (!/^\s*</.test(text)) return text
  return text
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr|table|ul|ol|blockquote)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// meta.footerText overrides the default footer line (never shown for OpenOcti).
export async function renderDocumentPdf({ title, body, signature, meta } = {}) {
  const brand = brandAssetsFor()
  const footerText = String(meta?.footerText || DOCUMENT_PDF_FOOTER)

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'letter', margin: 50, bufferPages: true })
    const chunks = []
    doc.on('data', c => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    try {
      const logoPath = path.join(process.cwd(), 'public', ...(brand.openOcti ? ['openocti', 'logo-horizontal.png'] : ['brand', 'fd-brand-dark.png']))
      if (fs.existsSync(logoPath)) doc.image(logoPath, 50, 40, { width: 240 })
      doc.fontSize(9).font('Helvetica').fillColor('#6B6F78')
      doc.text(brand.openOcti ? 'OpenOcti' : 'Your organization', 50, 115)
      if (!brand.openOcti) doc.text('City, STrth Carolina')
      doc.text(brand.openOcti ? 'openocti.com' : 'company.example.com')

      doc.moveTo(50, 150).lineTo(562, 150).strokeColor('#6B6F78').lineWidth(0.5).stroke()

      doc.fontSize(18).font('Helvetica-Bold').fillColor('#0A0B0D').text(title || 'Document', 50, 170, { width: 512 })

      // Render body. Markdown-ish: handle headings and plain text lines.
      doc.moveDown(1)
      const lines = documentBodyToPlainText(body).split('\n')
      for (const raw of lines) {
        const line = raw
        if (!line.trim()) { doc.moveDown(0.5); continue }
        if (line.startsWith('# ')) {
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
          doc.fontSize(10).font('Helvetica').fillColor('#0A0B0D').text('• ' + line.replace(/^\s*[-*]\s/, ''), { width: 500, indent: 10 })
        } else if (line === '---') {
          doc.moveDown(0.3)
          const y = doc.y
          doc.moveTo(50, y).lineTo(562, y).strokeColor('#6B6F78').lineWidth(0.5).stroke()
          doc.moveDown(0.3)
        } else {
          // Bold handling for **...**
          const hasBold = /\*\*[^*]+\*\*/.test(line)
          if (hasBold) {
            const parts = line.split(/(\*\*[^*]+\*\*)/)
            doc.fontSize(10).fillColor('#0A0B0D')
            parts.forEach((p, i) => {
              if (p.startsWith('**') && p.endsWith('**')) {
                doc.font('Helvetica-Bold').text(p.slice(2, -2), { continued: i < parts.length - 1 })
              } else {
                doc.font('Helvetica').text(p, { continued: i < parts.length - 1 })
              }
            })
            doc.text('')
          } else {
            doc.fontSize(10).font('Helvetica').fillColor('#0A0B0D').text(line, { width: 512 })
          }
        }
      }

      const cert = signatureCertificateLines(signature)
      if (cert.length) {
        doc.addPage()
        doc.fontSize(15).font('Helvetica-Bold').fillColor('#0A0B0D').text(cert[0])
        doc.moveDown(0.8)
        doc.fontSize(10).font('Helvetica').fillColor('#0A0B0D')
        for (const line of cert.slice(1)) doc.text(line, { width: 512 })
      }

      // Footer on every page. The bottom margin is zeroed while drawing so the footer line
      // can never push pdfkit onto a fresh page.
      if (!brand.openOcti) {
        const range = doc.bufferedPageRange()
        for (let i = range.start; i < range.start + range.count; i += 1) {
          doc.switchToPage(i)
          const savedBottom = doc.page.margins.bottom
          doc.page.margins.bottom = 0
          doc.fontSize(8).font('Helvetica').fillColor('#6B6F78')
          doc.text(footerText, 50, doc.page.height - 38, { width: 512, align: 'center', lineBreak: false })
          doc.page.margins.bottom = savedBottom
        }
      }

      doc.end()
    } catch (error) {
      reject(error)
    }
  })
}
