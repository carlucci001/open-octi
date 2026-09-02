/**
 * Resolve agent-provided attachment specs into Resend-compatible attachment objects.
 *
 * Accepts an array of:
 *   - "media-xxxxx-yyyy"     → media library ID; we look up the file on disk
 *   - "/media/foo.png"       → public URL path under public/; read as file
 *   - "https://..."          → external URL; pass to Resend as { path: url }
 *   - { filename, content }  → already a Resend attachment; pass through
 *
 * Returns an array suitable for resend.emails.send({ attachments: [...] }).
 */
import fs from 'fs'
import path from 'path'

export async function resolveAttachments(specs) {
  if (!Array.isArray(specs)) return []
  const out = []
  for (const s of specs) {
    if (!s) continue
    // Already in Resend format
    if (typeof s === 'object' && s.filename && (s.content || s.path)) {
      out.push(s)
      continue
    }
    if (typeof s !== 'string') continue
    const str = s.trim()

    // External URL — let Resend fetch it directly
    if (/^https?:\/\//i.test(str)) {
      const filename = decodeURIComponent(str.split('/').pop().split('?')[0]) || 'attachment'
      out.push({ filename, path: str })
      continue
    }

    // Media library id — look up from data/media.json
    if (/^media-[a-z0-9]+/i.test(str)) {
      try {
        const meta = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'media.json'), 'utf-8'))
        const item = (meta.items || []).find(i => i.id === str)
        if (!item) { console.warn('attachment: media id not found:', str); continue }
        const filePath = path.join(process.cwd(), 'public', 'media', item.file)
        if (!fs.existsSync(filePath)) { console.warn('attachment: file missing on disk:', item.file); continue }
        const buf = fs.readFileSync(filePath)
        const niceName = (item.title || item.file).replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 60)
        const ext = item.file.split('.').pop()
        out.push({ filename: niceName.endsWith('.' + ext) ? niceName : `${niceName}.${ext}`, content: buf })
      } catch (e) {
        console.warn('attachment lookup err:', e.message)
      }
      continue
    }

    // API file route like /api/media/file/foo.png → public/media/foo.png
    const apiFile = str.match(/^\/api\/media\/file\/(.+)$/)
    if (apiFile) {
      const name = path.basename(decodeURIComponent(apiFile[1]))
      const filePath = path.join(process.cwd(), 'public', 'media', name)
      if (fs.existsSync(filePath)) {
        out.push({ filename: name, content: fs.readFileSync(filePath) })
        continue
      }
      console.warn('attachment: media file not found:', filePath)
      continue
    }

    // Public-relative path like /media/foo.png or /avatars/bar.jpg
    if (str.startsWith('/')) {
      const filePath = path.join(process.cwd(), 'public', str.replace(/^\//, ''))
      if (fs.existsSync(filePath)) {
        out.push({ filename: path.basename(filePath), content: fs.readFileSync(filePath) })
        continue
      }
      console.warn('attachment: public file not found:', filePath)
      continue
    }

    // Bare filename — try public/media/ first
    const fallback = path.join(process.cwd(), 'public', 'media', str)
    if (fs.existsSync(fallback)) {
      out.push({ filename: path.basename(fallback), content: fs.readFileSync(fallback) })
      continue
    }
    console.warn('attachment spec not resolved:', str)
  }
  return out
}
