import { NextResponse } from 'next/server'
import { generateMedia, inspectUploadMedia, uploadMedia, listMedia, getMedia, deleteMedia, listFolders, addFolder, removeFolder, moveMedia, renameMedia } from '@/lib/media-gen'
import { requireCrmRead, requireCrmWrite } from '@/lib/permissions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function safeLogName(name) {
  return String(name || 'upload').replace(/[^\w.\- ()]/g, '_').slice(0, 180)
}

function logUpload(event, details = {}) {
  console.info('[media-upload]', JSON.stringify({
    event,
    name: safeLogName(details.name),
    sizeBytes: Number(details.sizeBytes || 0),
    mimeType: details.mimeType || '',
    mediaType: details.mediaType || '',
    file: details.file || '',
    folder: details.folder || '',
    reason: details.reason || '',
  }))
}

export async function GET(request) {
  const { error } = await requireCrmRead(request)
  if (error) return error
  const url = new URL(request.url)
  const folder = url.searchParams.get('folder') || ''
  const q = url.searchParams.get('q') || ''
  const id = url.searchParams.get('id') || ''
  if (id) {
    const item = getMedia(id)
    if (!item) return NextResponse.json({ error: 'not found' }, { status: 404 })
    return NextResponse.json({ ok: true, item })
  }
  return NextResponse.json({
    ok: true,
    folders: listFolders(),
    items: listMedia({ folder: folder || undefined, q: q || undefined, limit: 500 }),
  })
}

export async function POST(request) {
  const { error } = await requireCrmWrite(request)
  if (error) return error

  const contentType = request.headers.get('content-type') || ''
  if (contentType.includes('multipart/form-data')) {
    const uploadLogContext = {}
    try {
      const form = await request.formData()
      const file = form.get('file')
      if (!file || typeof file.arrayBuffer !== 'function') {
        logUpload('rejected', { reason: 'file required' })
        return NextResponse.json({ error: 'file required' }, { status: 400 })
      }
      const originalName = file.name || 'upload'
      const mimeType = file.type || ''
      const sizeBytes = Number(file.size || 0)
      Object.assign(uploadLogContext, { name: originalName, mimeType, sizeBytes })
      const info = inspectUploadMedia({ originalName, mimeType, sizeBytes })
      const item = uploadMedia({
        buffer: Buffer.from(await file.arrayBuffer()),
        originalName,
        mimeType,
        sizeBytes,
        title: String(form.get('title') || '').trim(),
        folder: String(form.get('folder') || 'unsorted'),
        tags: String(form.get('tags') || '').split(',').map(t => t.trim()).filter(Boolean),
        prompt: String(form.get('prompt') || '').trim(),
      })
      logUpload('accepted', { name: info.originalName, sizeBytes: info.sizeBytes, mimeType: item.mimeType, mediaType: item.mediaType, file: item.file, folder: item.folder })
      return NextResponse.json({ ok: true, item })
    } catch (e) {
      const status = e.status || 500
      logUpload('rejected', { ...uploadLogContext, reason: e.message })
      return NextResponse.json({ error: e.message }, { status })
    }
  }

  const body = await request.json().catch(() => ({}))
  const action = body.action

  try {
    if (action === 'generate') {
      const item = await generateMedia({
        prompt: body.prompt,
        title: body.title,
        tags: body.tags,
        folder: body.folder,
        size: body.size,
        provider: body.provider,
      })
      return NextResponse.json({ ok: true, item })
    }
    if (action === 'add_folder') {
      const f = addFolder({ id: body.id, name: body.name, parent: body.parent })
      return NextResponse.json({ ok: true, folder: f })
    }
    if (action === 'remove_folder') {
      removeFolder(body.id)
      return NextResponse.json({ ok: true })
    }
    if (action === 'move') {
      const updated = moveMedia(body.id, body.folder)
      if (!updated) return NextResponse.json({ error: 'not found' }, { status: 404 })
      return NextResponse.json({ ok: true, item: updated })
    }
    if (action === 'rename') {
      const updated = renameMedia(body.id, { title: body.title, tags: body.tags })
      if (!updated) return NextResponse.json({ error: 'not found' }, { status: 404 })
      return NextResponse.json({ ok: true, item: updated })
    }
    if (action === 'delete') {
      const ok = deleteMedia(body.id)
      return NextResponse.json({ ok })
    }
    return NextResponse.json({ error: 'unknown action: ' + action }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: e.status || 500 })
  }
}
