/**
 * Generic image generation + media library.
 * Same provider fallback chain as avatar-gen, but saves to /public/media/
 * and tracks all generated images in data/media.json so agents can recall them.
 */
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { fal } from '@fal-ai/client'
import { getCred } from './agent-creds'
import { getImageProviderChain } from './image-provider-chain'

const PUBLIC_DIR = path.join(process.cwd(), 'public', 'media')
const META_FILE = path.join(process.cwd(), 'data', 'media.json')
export const MAX_MEDIA_UPLOAD_BYTES = 100 * 1024 * 1024
const SUPPORTED_MEDIA = {
  png: { mediaType: 'image', mimeType: 'image/png' },
  jpg: { mediaType: 'image', mimeType: 'image/jpeg' },
  jpeg: { mediaType: 'image', mimeType: 'image/jpeg' },
  webp: { mediaType: 'image', mimeType: 'image/webp' },
  svg: { mediaType: 'image', mimeType: 'image/svg+xml' },
  gif: { mediaType: 'image', mimeType: 'image/gif' },
  mp4: { mediaType: 'video', mimeType: 'video/mp4' },
  mov: { mediaType: 'video', mimeType: 'video/quicktime' },
  webm: { mediaType: 'video', mimeType: 'video/webm' },
  m4v: { mediaType: 'video', mimeType: 'video/x-m4v' },
}
const MEDIA_EXTENSIONS = new Set(Object.keys(SUPPORTED_MEDIA))
const GENERIC_UPLOAD_MIMES = new Set(['', 'application/octet-stream', 'binary/octet-stream'])
const OPENAI_LOGO_REFERENCE_BYTES = 14 * 1024 * 1024
const OPENAI_REFERENCE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp'])
const BRAND_REFERENCE_TERMS = /\b(brand|branded|logo|farrington|facebook|linkedin|instagram|social|post|campaign|ad|flyer|poster|banner|openclaw|command center|crm|marketing)\b/i
const LOGO_TERMS = /logo|brand mark|wordmark/i

function ensureDir() {
  if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true })
  if (!fs.existsSync(path.dirname(META_FILE))) fs.mkdirSync(path.dirname(META_FILE), { recursive: true })
}

function readMeta() {
  if (!fs.existsSync(META_FILE)) return { items: [] }
  try { return JSON.parse(fs.readFileSync(META_FILE, 'utf-8')) } catch { return { items: [] } }
}
function writeMeta(d) { fs.writeFileSync(META_FILE, JSON.stringify(d, null, 2), 'utf-8') }

function upsertMediaItem(item) {
  const meta = readMeta()
  meta.items = meta.items || []
  meta.items.unshift(item)
  meta.lastUpdated = new Date().toISOString()
  writeMeta(meta)
  return item
}

function getKey(name, envName) {
  const fromVault = getCred(name)?.key
  if (fromVault) return fromVault
  if (envName && process.env[envName]) return process.env[envName]
  return null
}

function getOpenAIImageKey() {
  return getKey('openai images', 'OPENAI_IMAGE_API_KEY')
    || getKey('openai image', 'OPENAI_IMAGES_API_KEY')
    || getKey('openai-images', null)
    || getKey('openai', 'OPENAI_API_KEY')
}

function normalizeSecret(value) {
  return String(value || '')
    .trim()
    .replace(/^Bearer\s+/i, '')
    .replace(/^(?:FAL_KEY|FAL_API_KEY)\s*=\s*/i, '')
    .trim()
}

function falAspectRatio(size) {
  if (size === '1536x1024') return '3:2'
  if (size === '1024x1536') return '2:3'
  if (size === '1792x1024') return '16:9'
  if (size === '1024x1792') return '9:16'
  return '1:1'
}

function imagenAspectRatio(size) {
  if (size === '1536x1024') return '4:3'
  if (size === '1024x1536') return '3:4'
  if (size === '1792x1024') return '16:9'
  if (size === '1024x1792') return '9:16'
  return '1:1'
}

function extFromContentType(contentType, fallback = 'png') {
  const type = String(contentType || '').toLowerCase()
  if (type.includes('jpeg') || type.includes('jpg')) return 'jpg'
  if (type.includes('webp')) return 'webp'
  if (type.includes('png')) return 'png'
  return fallback
}

function openAIImageSize(size) {
  if (size === '1792x1024') return '1536x1024'
  if (size === '1024x1792') return '1024x1536'
  if (['1024x1024', '1536x1024', '1024x1536', 'auto'].includes(size)) return size
  return '1024x1024'
}

function mediaFilePath(fileName) {
  if (!fileName) return ''
  return path.join(PUBLIC_DIR, path.basename(fileName))
}

function mediaFileExt(fileName) {
  return String(fileName || '').split('.').pop()?.toLowerCase() || ''
}

function mediaMimeType(fileName) {
  return SUPPORTED_MEDIA[mediaFileExt(fileName)]?.mimeType || 'image/png'
}

function mediaSearchText(item) {
  return [
    item?.title,
    item?.file,
    item?.originalName,
    item?.prompt,
    item?.folder,
    ...(Array.isArray(item?.tags) ? item.tags : []),
  ].filter(Boolean).join(' ')
}

function shouldUseBrandReference({ prompt, title, tags, folder }) {
  return BRAND_REFERENCE_TERMS.test([prompt, title, folder, ...(Array.isArray(tags) ? tags : [])].filter(Boolean).join(' '))
}

function mediaTime(item) {
  return Date.parse(item?.updatedAt || item?.createdAt || item?.generatedAt || 0) || 0
}

function findBrandReferenceImages(limit = 2, scope = null) {
  const items = readMeta().items || []
  const scopeFolders = Array.isArray(scope?.folders) ? scope.folders.filter(Boolean) : []
  const scopeTags = Array.isArray(scope?.tags) ? scope.tags.filter(Boolean).map(t => String(t).toLowerCase()) : []
  const scoped = !!(scopeFolders.length || scopeTags.length)
  return items
    .filter(item => {
      if (scoped) {
        // Brand-scoped: only assets filed in this brand/client's folders or
        // tagged for it. No match means NO reference — never borrow another
        // brand's logo.
        const inFolder = scopeFolders.includes(item?.folder)
        const itemTags = (Array.isArray(item?.tags) ? item.tags : []).map(t => String(t).toLowerCase())
        const hasTag = scopeTags.some(tag => itemTags.includes(tag))
        if (!inFolder && !hasTag) return false
      }
      const file = item?.file || item?.filename || ''
      const ext = mediaFileExt(file)
      const filePath = mediaFilePath(file)
      if (!OPENAI_REFERENCE_EXTENSIONS.has(ext)) return false
      if (item?.provider && item.provider !== 'upload' && item.provider !== 'library') return false
      if (!LOGO_TERMS.test(mediaSearchText(item))) return false
      if (!fs.existsSync(filePath)) return false
      const stat = fs.statSync(filePath)
      return stat.isFile() && stat.size > 0 && stat.size <= OPENAI_LOGO_REFERENCE_BYTES
    })
    .sort((a, b) => mediaTime(b) - mediaTime(a))
    .slice(0, limit)
    .map(item => ({
      file: path.basename(item.file || item.filename || ''),
      path: mediaFilePath(item.file || item.filename || ''),
      mimeType: item.mimeType || mediaMimeType(item.file || item.filename || ''),
      title: item.title || item.originalName || item.file || 'Brand reference',
    }))
}

function imageDataUrl(reference) {
  const b64 = fs.readFileSync(reference.path).toString('base64')
  return `data:${reference.mimeType || 'image/png'};base64,${b64}`
}

function socialPostPrompt(prompt, hasBrandReference = false) {
  const guardrails = [
    'Create a finished, polished image asset, not a design spec or implementation artifact.',
    'Do not render source code, SVG markup, CSS properties, wireframe notes, measurement labels, lorem ipsum, or screenshot-like document pages.',
    'Use clean composition, real visual hierarchy, high contrast, and readable short text only when the prompt calls for text.',
  ]
  if (hasBrandReference) {
    guardrails.push('Use the attached logo/brand image as the brand reference and incorporate it cleanly as a visual brand mark.')
  }
  return `${prompt}\n\nQuality requirements:\n- ${guardrails.join('\n- ')}`
}

async function tryFal({ prompt, size = '1024x1024', model = 'fal-ai/flux-pro/v1.1-ultra' }) {
  const key = normalizeSecret(getKey('fal.ai', 'FAL_KEY')
    || getKey('fal', 'FAL_API_KEY')
  )
  if (!key) return { ok: false, reason: 'no Fal.ai key' }
  if (key.length < 30 || !key.includes(':')) return { ok: false, reason: 'Fal.ai key is not in the expected key_id:key_secret format' }
  try {
    fal.config({ credentials: key })
    const result = await fal.subscribe(model, {
      input: {
        prompt,
        aspect_ratio: falAspectRatio(size),
        num_images: 1,
        output_format: 'png',
        safety_tolerance: '2',
        enhance_prompt: true,
      },
    })
    const image = result?.data?.images?.[0] || result?.images?.[0]
    const url = image?.url
    if (!url) return { ok: false, reason: 'Fal.ai no image url' }
    const ir = await fetch(url)
    if (!ir.ok) return { ok: false, reason: `Fal.ai image fetch ${ir.status}` }
    const buf = Buffer.from(await ir.arrayBuffer())
    return {
      ok: true,
      buffer: buf,
      ext: extFromContentType(image.content_type, 'png'),
      provider: 'fal',
      model,
      width: image.width,
      height: image.height,
      requestId: result?.requestId,
    }
  } catch (e) {
    return { ok: false, reason: 'Fal.ai threw: ' + e.message }
  }
}

async function tryOpenAI({ prompt, size = '1024x1024', model = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1', referenceImages = [], quality: qualityOverride = '' }) {
  // Prefer a dedicated image-gen key if Carl set one up. It keeps chat-token
  // billing separate from image-gen billing.
  const key = getOpenAIImageKey()
  if (!key) return { ok: false, reason: 'no OpenAI key' }
  try {
    const endpoint = referenceImages.length ? 'edits' : 'generations'
    const quality = qualityOverride || process.env.OPENAI_IMAGE_QUALITY || 'high'
    const body = referenceImages.length
      ? {
          model,
          prompt,
          size: openAIImageSize(size),
          n: 1,
          output_format: 'png',
          quality,
          input_fidelity: 'high',
          images: referenceImages.map(reference => ({ image_url: imageDataUrl(reference) })),
        }
      : { model, prompt, size: openAIImageSize(size), n: 1, output_format: 'png', quality }
    const r = await fetch(`https://api.openai.com/v1/images/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
    })
    if (!r.ok) {
      const text = await r.text().catch(() => '')
      return { ok: false, reason: `OpenAI ${r.status}: ${text.slice(0, 200)}` }
    }
    const j = await r.json()
    const item = j.data?.[0]
    if (!item) return { ok: false, reason: 'OpenAI no image' }
    let buf
    if (item.b64_json) buf = Buffer.from(item.b64_json, 'base64')
    else if (item.url) { const ir = await fetch(item.url); buf = Buffer.from(await ir.arrayBuffer()) }
    else return { ok: false, reason: 'OpenAI no data' }
    return { ok: true, buffer: buf, ext: 'png', provider: 'openai', model, brandReferences: referenceImages.map(reference => reference.file) }
  } catch (e) {
    return { ok: false, reason: 'OpenAI threw: ' + e.message }
  }
}

async function tryImagen({ prompt, size = '1024x1024', model = process.env.GOOGLE_IMAGEN_MODEL || 'imagen-4.0-generate-001' }) {
  const key = getKey('imagen', 'GOOGLE_IMAGEN_API_KEY')
    || getKey('google imagen', null)
    || getKey('gemini', 'GEMINI_API_KEY')
    || getKey('google', 'GOOGLE_API_KEY')
    || getKey('google ai', 'GOOGLE_AI_API_KEY')
  if (!key) return { ok: false, reason: 'no Google Imagen/Gemini key' }
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:predict`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        instances: [{ prompt }],
        parameters: {
          sampleCount: 1,
          aspectRatio: imagenAspectRatio(size),
          imageSize: '1K',
          personGeneration: 'allow_adult',
        },
      }),
    })
    if (!r.ok) {
      const text = await r.text().catch(() => '')
      return { ok: false, reason: `Imagen ${model} ${r.status}: ${text.slice(0, 180)}` }
    }
    const j = await r.json()
    const image = j?.predictions?.[0] || j?.generatedImages?.[0] || j?.generated_images?.[0]
    const b64 = image?.bytesBase64Encoded || image?.bytes_base64_encoded || image?.image?.imageBytes || image?.image?.image_bytes
    if (!b64) return { ok: false, reason: `Imagen ${model}: no image in response` }
    return {
      ok: true,
      buffer: Buffer.from(b64, 'base64'),
      ext: extFromContentType(image?.mimeType || image?.mime_type, 'png'),
      provider: 'imagen',
      model,
    }
  } catch (e) {
    return { ok: false, reason: 'Imagen threw: ' + e.message }
  }
}

// Nano Banana = Google's Gemini image model. Strong photographic quality and,
// unlike FLUX, renders legible text — so it can honor copy in the brief.
async function tryGemini({ prompt }) {
  const key = getKey('gemini', 'GEMINI_API_KEY') || getKey('google', 'GOOGLE_API_KEY') || getKey('google ai', 'GOOGLE_AI_API_KEY')
  if (!key) return { ok: false, reason: 'no Gemini key' }
  const models = ['gemini-2.5-flash-image', 'gemini-2.5-flash-image-preview']
  let lastReason = 'no Gemini model responded'
  for (const model of models) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ['IMAGE'] } }),
      })
      if (!r.ok) { lastReason = `Gemini ${model} ${r.status}: ${(await r.text().catch(() => '')).slice(0, 160)}`; continue }
      const j = await r.json()
      const part = (j?.candidates?.[0]?.content?.parts || []).find(p => p.inlineData || p.inline_data)
      const b64 = part?.inlineData?.data || part?.inline_data?.data
      if (!b64) { lastReason = `Gemini ${model}: no image in response`; continue }
      return { ok: true, buffer: Buffer.from(b64, 'base64'), ext: 'png', provider: 'gemini', model }
    } catch (e) {
      lastReason = `Gemini ${model} threw: ${e.message}`
    }
  }
  return { ok: false, reason: lastReason }
}

async function tryOpenRouter({ prompt, size = '1024x1024' }) {
  const key = getKey('openrouter', 'OPENROUTER_API_KEY')
  if (!key) return { ok: false, reason: 'no OpenRouter key' }
  const model = 'black-forest-labs/flux-1.1-pro'
  try {
    const r = await fetch('https://openrouter.ai/api/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
        'HTTP-Referer': 'https://openocti.local',
        'X-Title': 'Farrington Command Center',
      },
      body: JSON.stringify({ model, prompt, size, n: 1 }),
    })
    if (!r.ok) {
      const text = await r.text().catch(() => '')
      return { ok: false, reason: `OpenRouter ${r.status}: ${text.slice(0, 200)}` }
    }
    const j = await r.json()
    const item = j.data?.[0]
    if (!item) return { ok: false, reason: 'OpenRouter no image' }
    let buf
    if (item.b64_json) buf = Buffer.from(item.b64_json, 'base64')
    else if (item.url) { const ir = await fetch(item.url); buf = Buffer.from(await ir.arrayBuffer()) }
    else return { ok: false, reason: 'OpenRouter no data' }
    return { ok: true, buffer: buf, ext: 'png', provider: 'openrouter', model }
  } catch (e) {
    return { ok: false, reason: 'OpenRouter threw: ' + e.message }
  }
}

async function tryPexels({ prompt }) {
  const key = getKey('pexels', 'PEXELS_API_KEY')
  if (!key) return { ok: false, reason: 'no Pexels key' }
  try {
    const query = prompt.slice(0, 100).replace(/[^a-z0-9 ]/gi, ' ').replace(/\s+/g, ' ').trim()
    const r = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=10`, {
      headers: { Authorization: key },
    })
    if (!r.ok) return { ok: false, reason: `Pexels ${r.status}` }
    const j = await r.json()
    const photos = j.photos || []
    if (!photos.length) return { ok: false, reason: `Pexels: no results for "${query}"` }
    const pick = photos[Math.floor(Math.random() * Math.min(photos.length, 5))]
    const url = pick.src?.large || pick.src?.medium || pick.src?.original
    if (!url) return { ok: false, reason: 'Pexels no url' }
    const ir = await fetch(url)
    const buf = Buffer.from(await ir.arrayBuffer())
    const ext = (url.match(/\.(jpg|jpeg|png|webp)/i)?.[1] || 'jpg').toLowerCase().replace('jpeg', 'jpg')
    return { ok: true, buffer: buf, ext, provider: 'pexels', model: 'pexels-stock', searchQuery: query, pexelsId: pick.id, photographer: pick.photographer }
  } catch (e) {
    return { ok: false, reason: 'Pexels threw: ' + e.message }
  }
}

function slugify(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40) || 'image' }
function extFromName(name, fallback = 'bin') {
  const ext = path.extname(String(name || '')).slice(1).toLowerCase().replace(/[^a-z0-9]/g, '')
  return ext || fallback
}
function safeOriginalName(name) { return path.basename(String(name || 'upload')).replace(/[^\w.\- ()]/g, '_').slice(0, 180) || 'upload' }
function normalizeMime(mimeType) { return String(mimeType || '').toLowerCase().split(';')[0].trim() }
// Serve through the API route, not the static /public path: files written at
// runtime (generated/uploaded after the build) are NOT served from /media/ in
// production, but /api/media/file/<name> reads from disk on every request.
function mediaUrl(file) { return file ? `/api/media/file/${encodeURIComponent(file)}` : '' }
function mediaTypeFromExt(ext) { return SUPPORTED_MEDIA[ext]?.mediaType || 'image' }
function mimeFromExt(ext) { return SUPPORTED_MEDIA[ext]?.mimeType || 'application/octet-stream' }
function uploadError(message, status = 400) {
  const e = new Error(message)
  e.status = status
  return e
}
export function inspectUploadMedia({ originalName, mimeType, sizeBytes } = {}) {
  const cleanName = safeOriginalName(originalName)
  const ext = extFromName(cleanName, '')
  const normalizedMime = normalizeMime(mimeType)
  const size = Number(sizeBytes || 0)
  if (!size || size < 0) throw uploadError('file is empty', 400)
  if (size > MAX_MEDIA_UPLOAD_BYTES) throw uploadError('file too large; maximum upload size is 100 MB', 413)
  if (!ext || !SUPPORTED_MEDIA[ext]) throw uploadError('unsupported media type; upload png, jpg, jpeg, webp, gif, mp4, mov, webm, or m4v', 400)
  const byExt = SUPPORTED_MEDIA[ext]
  if (!GENERIC_UPLOAD_MIMES.has(normalizedMime)) {
    const mimeFamily = normalizedMime.split('/')[0]
    if (mimeFamily !== byExt.mediaType) {
      throw uploadError(`media type mismatch: ${cleanName} looks like ${byExt.mediaType} but browser reported ${normalizedMime}`, 400)
    }
  }
  return {
    originalName: cleanName,
    ext,
    mediaType: byExt.mediaType,
    mimeType: GENERIC_UPLOAD_MIMES.has(normalizedMime) ? byExt.mimeType : normalizedMime,
    sizeBytes: size,
  }
}
function normalizeItem(item) {
  const file = item.file || path.basename(String(item.url || '').replace(/^\/api\/media\/file\//, '').replace(/^\/media\//, ''))
  const ext = extFromName(file)
  return {
    ...item,
    file,
    url: file ? mediaUrl(file) : item.url,
    mediaType: item.mediaType || mediaTypeFromExt(ext),
    mimeType: item.mimeType || mimeFromExt(ext),
  }
}
function reconcileMediaFiles(meta) {
  ensureDir()
  const before = JSON.stringify(meta.items || [])
  meta.items = (meta.items || []).map(normalizeItem)
  let changed = JSON.stringify(meta.items) !== before
  const known = new Set(meta.items.map(i => i.file).filter(Boolean))
  const recovered = []
  for (const file of fs.readdirSync(PUBLIC_DIR)) {
    const full = path.join(PUBLIC_DIR, file)
    if (!fs.statSync(full).isFile()) continue
    const ext = extFromName(file)
    if (!MEDIA_EXTENSIONS.has(ext) || known.has(file)) continue
    const title = file.replace(/\.[^.]+$/, '').replace(/-media-[a-z0-9]+-[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').trim() || file
    const hash = crypto.createHash('sha1').update(file).digest('hex').slice(0, 8)
    const stat = fs.statSync(full)
    recovered.push({
      id: `media-recovered-${hash}`,
      title,
      prompt: '',
      tags: ['recovered'],
      folder: 'unsorted',
      file,
      url: mediaUrl(file),
      mediaType: mediaTypeFromExt(ext),
      mimeType: mimeFromExt(ext),
      provider: 'recovered',
      originalName: file,
      createdAt: stat.mtime.toISOString(),
    })
    known.add(file)
  }
  if (recovered.length) {
    meta.items.unshift(...recovered.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))))
    changed = true
  }
  if (changed) {
    meta.lastUpdated = new Date().toISOString()
    writeMeta(meta)
  }
  return meta
}

// Static folders that ship with the install. Custom folders Carl adds via the UI also live in meta.folders.
const STATIC_FOLDERS = [
  { id: 'marketing', name: 'Marketing', parent: null, system: true },
  { id: 'farrington-development-marketing', name: 'Farrington Development Marketing', parent: 'marketing', system: true },
  { id: 'newsroomaios-marketing', name: 'Newsroom and iOS Marketing', parent: 'marketing', system: true },
  { id: 'social-posts', name: 'Social Posts', parent: 'marketing', system: true },
  { id: 'memes', name: 'Memes', parent: 'marketing', system: true },
  { id: 'clients', name: 'Clients', parent: null, system: true },
  { id: 'unsorted', name: 'Unsorted', parent: null, system: true },
]

function getClientFolders() {
  // Derive a per-client folder dynamically from accounts. Folder id = `client:<accountId>`.
  try {
    const accountsPath = path.join(process.cwd(), 'data', 'accounts.json')
    if (!fs.existsSync(accountsPath)) return []
    const data = JSON.parse(fs.readFileSync(accountsPath, 'utf-8'))
    const accounts = data.accounts || data.list || (Array.isArray(data) ? data : [])
    return accounts
      .filter(a => a && a.id && (a.type === 'client' || a.stage === 'active' || a.stage === 'signed' || true))
      .map(a => ({ id: 'client:' + a.id, name: a.name || a.id, parent: 'clients', system: true, accountId: a.id }))
  } catch (e) { return [] }
}

export function listFolders() {
  const meta = reconcileMediaFiles(readMeta())
  const custom = (meta.folders || []).filter(f => !f.system)
  return [...STATIC_FOLDERS, ...getClientFolders(), ...custom]
}

export function addFolder({ id, name, parent = null }) {
  if (!id || !name) throw new Error('id and name required')
  const meta = readMeta()
  meta.folders = meta.folders || []
  if (meta.folders.find(f => f.id === id)) return meta.folders.find(f => f.id === id)
  meta.folders.push({ id, name, parent })
  writeMeta(meta)
  return { id, name, parent }
}

export function removeFolder(id) {
  const meta = readMeta()
  meta.folders = (meta.folders || []).filter(f => f.id !== id)
  // Move any items in this folder to 'unsorted'
  meta.items = (meta.items || []).map(i => i.folder === id ? { ...i, folder: 'unsorted' } : i)
  writeMeta(meta)
  return true
}

export function moveMedia(id, folder) {
  const meta = readMeta()
  const idx = (meta.items || []).findIndex(i => i.id === id)
  if (idx < 0) return false
  meta.items[idx].folder = folder
  writeMeta(meta)
  return meta.items[idx]
}

// Rename or re-tag a media item. Pass any subset of { title, tags } to update.
// Other fields (folder, file, url, dimensions, provenance) are left untouched.
export function renameMedia(id, { title, tags } = {}) {
  const meta = readMeta()
  const idx = (meta.items || []).findIndex(i => i.id === id)
  if (idx < 0) return false
  if (typeof title === 'string') {
    const trimmed = title.trim()
    if (trimmed) meta.items[idx].title = trimmed
  }
  if (Array.isArray(tags)) {
    meta.items[idx].tags = tags.map(t => String(t).trim()).filter(Boolean)
  }
  meta.items[idx].updatedAt = new Date().toISOString()
  writeMeta(meta)
  return meta.items[idx]
}

// Image-generation model + approximate per-image USD cost, surfaced in the UI
// so cost is never hidden. Verified pricing 2026-07 against Carl's actual
// OpenAI invoice: gpt-image-1 high quality ~$0.17/image bare, ~$0.40/image
// when brand-reference logos are attached (high-fidelity image inputs bill
// too). Set OPENAI_IMAGE_QUALITY=medium in env to cut to roughly $0.04-0.06.
// Fal FLUX1.1 [pro] ultra ~$0.06; OpenRouter FLUX1.1 pro ~$0.04; Pexels free.
export const IMAGE_GEN_MODELS = {
  imagen: { model: process.env.GOOGLE_IMAGEN_MODEL || 'imagen-4.0-generate-001', label: 'Google Imagen', vendor: 'Google', costPerImage: 0 },
  'google-imagen': { model: process.env.GOOGLE_IMAGEN_MODEL || 'imagen-4.0-generate-001', label: 'Google Imagen', vendor: 'Google', costPerImage: 0 },
  gemini: { model: 'gemini-2.5-flash-image', label: 'Nano Banana', vendor: 'Google Gemini', costPerImage: 0.04 },
  'nano-banana': { model: 'gemini-2.5-flash-image', label: 'Nano Banana', vendor: 'Google Gemini', costPerImage: 0.04 },
  fal: { model: 'fal-ai/flux-pro/v1.1-ultra', label: 'FLUX1.1 [pro] ultra', vendor: 'Fal', costPerImage: 0.06 },
  openai: { model: 'gpt-image-1', label: 'GPT Image 1', vendor: 'OpenAI', costPerImage: 0.17, costPerImageWithReference: 0.4 },
  openrouter: { model: 'flux-1.1-pro', label: 'FLUX1.1 pro', vendor: 'OpenRouter', costPerImage: 0.04 },
  pexels: { model: 'pexels-stock', label: 'Pexels stock', vendor: 'Pexels', costPerImage: 0 },
}

// Map a result provider OR a campaign creationEndpoint to its model + cost.
// Carl's current preferred still-image engine is OpenAI/ChatGPT. Keep explicit
// provider ids available for the selector, but make auto resolve to OpenAI.
export function describeImageGen(providerOrEndpoint) {
  const key = !providerOrEndpoint || providerOrEndpoint === 'auto' ? 'openai' : providerOrEndpoint
  return IMAGE_GEN_MODELS[key] || IMAGE_GEN_MODELS.openai
}

export async function generateMedia({ prompt, title, tags = [], folder = 'unsorted', size = '1024x1024', provider = 'auto', referenceScope = null, quality = '', useBrandReferences = null }) {
  if (!prompt) throw new Error('prompt required')
  ensureDir()
  // Initialize default folders on first use
  listFolders()

  // Component-settings layer: explicit true/false overrides the heuristic gate.
  const wantBrandReferences = useBrandReferences === false
    ? false
    : (useBrandReferences === true ? true : shouldUseBrandReference({ prompt, title, tags, folder }))
  const referenceImages = wantBrandReferences ? findBrandReferenceImages(2, referenceScope) : []
  let usedPrompt = socialPostPrompt(prompt, false)
  const tried = []
  const providers = getImageProviderChain(provider)
  let result = { ok: false, reason: 'not started' }
  for (const name of providers) {
    const providerPrompt = socialPostPrompt(prompt, name === 'openai' && referenceImages.length > 0)
    if (name === 'imagen') result = await tryImagen({ prompt: providerPrompt, size })
    if (name === 'gemini') result = await tryGemini({ prompt: providerPrompt })
    if (name === 'fal') result = await tryFal({ prompt: providerPrompt, size })
    if (name === 'openai') result = await tryOpenAI({ prompt: providerPrompt, size, referenceImages, quality })
    if (name === 'openrouter') result = await tryOpenRouter({ prompt: providerPrompt, size })
    if (name === 'pexels') result = await tryPexels({ prompt: providerPrompt })
    tried.push({ provider: name, ok: result.ok, reason: result.reason })
    if (result.ok) {
      usedPrompt = providerPrompt
      break
    }
  }
  if (!result.ok) {
    throw new Error('All image providers failed: ' + tried.map(t => `${t.provider}=${t.reason}`).join(' | '))
  }

  const id = `media-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
  const fileName = `${slugify(title || prompt)}-${id}.${result.ext}`
  fs.writeFileSync(path.join(PUBLIC_DIR, fileName), result.buffer)

  const item = {
    id,
    title: title || prompt.slice(0, 80),
    prompt: usedPrompt,
    ...(usedPrompt !== prompt ? { originalPrompt: prompt } : {}),
    tags: Array.isArray(tags) ? tags : [],
    folder: folder || 'unsorted',
    file: fileName,
    url: mediaUrl(fileName),
    width: result.width || 1024,
    height: result.height || 1024,
    provider: result.provider,
    model: result.model,
    ...(result.brandReferences?.length ? { brandReferences: result.brandReferences } : {}),
    ...(result.provider === 'fal' ? { falRequestId: result.requestId } : {}),
    ...(result.provider === 'pexels' ? { searchQuery: result.searchQuery, pexelsId: result.pexelsId, photographer: result.photographer } : {}),
    fallbackChain: tried,
    createdAt: new Date().toISOString(),
  }

  return upsertMediaItem(item)
}

export function uploadMedia({ buffer, originalName, mimeType, title, tags = [], folder = 'unsorted', sizeBytes, prompt = '' }) {
  if (!buffer || !buffer.length) throw new Error('file required')
  ensureDir()
  listFolders()

  const info = inspectUploadMedia({ originalName, mimeType, sizeBytes: sizeBytes || buffer.length })
  const id = `media-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
  const baseTitle = title || info.originalName.replace(/\.[^.]+$/, '') || 'Uploaded media'
  const fileName = `${slugify(baseTitle)}-${id}.${info.ext}`
  fs.writeFileSync(path.join(PUBLIC_DIR, fileName), buffer)

  const item = {
    id,
    title: baseTitle,
    prompt,
    tags: Array.isArray(tags) ? tags : [],
    folder: folder || 'unsorted',
    file: fileName,
    url: mediaUrl(fileName),
    mediaType: info.mediaType,
    mimeType: info.mimeType,
    sizeBytes: info.sizeBytes,
    provider: 'upload',
    originalName: info.originalName || fileName,
    createdAt: new Date().toISOString(),
  }

  const meta = readMeta()
  meta.items = meta.items || []
  meta.items.unshift(item)
  meta.lastUpdated = new Date().toISOString()
  writeMeta(meta)
  return item
}

export function listMedia({ tag, folder, q, limit = 50 } = {}) {
  const meta = reconcileMediaFiles(readMeta())
  let items = (meta.items || []).slice()
  if (folder) items = items.filter(i => (i.folder || 'unsorted') === folder)
  if (tag) items = items.filter(i => (i.tags || []).includes(tag))
  if (q) {
    const lq = q.toLowerCase()
    const folders = new Map([...(meta.folders || []), ...STATIC_FOLDERS].map(f => [f.id, f.name]))
    items = items.filter(i => [
      i.title,
      i.prompt,
      i.provider,
      i.model,
      i.folder,
      folders.get(i.folder),
      i.file,
      i.originalName,
      i.accountName,
      i.clientName,
      i.ownerName,
      i.contactName,
      i.campaignName,
      i.projectName,
      i.accountId,
      i.clientId,
      ...(i.tags || []),
    ].some(value => String(value || '').toLowerCase().includes(lq)))
  }
  return items.slice(0, limit)
}

export function getMedia(id) {
  const meta = reconcileMediaFiles(readMeta())
  return (meta.items || []).find(i => i.id === id) || null
}

export function deleteMedia(id) {
  const meta = readMeta()
  const item = (meta.items || []).find(i => i.id === id)
  if (!item) return false
  try { fs.unlinkSync(path.join(PUBLIC_DIR, item.file)) } catch {}
  meta.items = meta.items.filter(i => i.id !== id)
  meta.lastUpdated = new Date().toISOString()
  writeMeta(meta)
  return true
}
