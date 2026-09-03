/**
 * Avatar generation — saves to public/avatars/{id}.png AND uploads to Firebase Storage
 * at the stable path avatars/{id}.{ext} so public surfaces (the farringtondev concierge
 * widget, etc.) read the latest face automatically — no cache-busting needed.
 *
 * Provider chain (first one that succeeds wins):
 *   1. OpenAI gpt-image-1     — best custom output, but limited by billing/rate limits
 *   2. OpenRouter FLUX        — cheap generative fallback, separate billing from OpenAI
 *   3. Pexels stock photo     — real human portraits, free, never rate-limited
 *
 * Meta records which provider produced each avatar.
 */
import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'
import { getCred } from './agent-creds'
import { readData, writeData } from './dataStore'

const FIREBASE_BUCKET = 'newsroomasios.firebasestorage.app'
const require = createRequire(import.meta.url)
let _storageBucket = null
function getStorageBucket() {
  if (_storageBucket) return _storageBucket
  try {
    const saPath = path.join(process.cwd(), 'data', 'firebase-service-account.json')
    if (!fs.existsSync(saPath)) return null
    const sa = JSON.parse(fs.readFileSync(saPath, 'utf-8'))
    // Lazy require so the cold path doesn't load firebase-admin
    const { initializeApp, cert, getApps } = require('firebase-admin/app')
    const { getStorage } = require('firebase-admin/storage')
    const APP_NAME = 'avatar-public'
    const existing = getApps().find(a => a.name === APP_NAME)
    const app = existing || initializeApp({ credential: cert(sa), projectId: sa.project_id, storageBucket: FIREBASE_BUCKET }, APP_NAME)
    _storageBucket = getStorage(app).bucket()
    return _storageBucket
  } catch (e) {
    console.warn('[avatar] Firebase Storage init failed:', e.message)
    return null
  }
}

// Upload an avatar to a stable Firebase Storage path. Fire-and-forget — failures don't
// break the local avatar pipeline. cacheControl: no-cache so the GCS edge re-validates
// every request, making CRM regens reflect publicly within seconds.
async function uploadToPublicStorage(id, buffer, ext) {
  const bucket = getStorageBucket()
  if (!bucket) return null
  const remoteExt = ext === 'jpeg' ? 'jpg' : (ext || 'png')
  const remote = `avatars/${id}.${remoteExt}`
  const contentType = remoteExt === 'jpg' ? 'image/jpeg' : (remoteExt === 'webp' ? 'image/webp' : (remoteExt === 'svg' ? 'image/svg+xml' : 'image/png'))
  try {
    const file = bucket.file(remote)
    await file.save(buffer, {
      resumable: false,
      public: true,
      metadata: { contentType, cacheControl: 'no-cache, max-age=0' },
    })
    // Public URL that loads in any browser — works in production where
    // runtime-written files under /public are NOT served by `next start`.
    return `https://storage.googleapis.com/${bucket.name}/${remote}`
  } catch (e) {
    console.warn(`[avatar] Storage upload failed for ${id}:`, e.message)
    return null
  }
}

const PUBLIC_DIR = path.join(process.cwd(), 'public', 'avatars')
const META_FILE = path.join(process.cwd(), 'data', 'avatars.json')

function ensureDir() {
  if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true })
  if (!fs.existsSync(path.dirname(META_FILE))) fs.mkdirSync(path.dirname(META_FILE), { recursive: true })
}

function readMeta() {
  const stored = readData('avatars.json')
  if (stored && typeof stored === 'object' && !Array.isArray(stored)) return stored
  if (!fs.existsSync(META_FILE)) return {}
  try { return JSON.parse(fs.readFileSync(META_FILE, 'utf-8')) } catch { return {} }
}
function writeMeta(d) {
  writeData('avatars.json', d)
  try {
    ensureDir()
    fs.writeFileSync(META_FILE, JSON.stringify(d, null, 2), 'utf-8')
  } catch {}
}

const STYLE_SUFFIX = ', photorealistic candid portrait, real human, natural skin texture, slight imperfections, looking near camera, headshot crop, no logo no text no watermark, distinctly not a stock photo, distinctly not a cartoon'

function getKey(name, envName) {
  const fromVault = getCred(name)?.key
  if (fromVault) return fromVault
  if (envName && process.env[envName]) return process.env[envName]
  return null
}

// Boil a long descriptive prompt down to the kind of search keywords Pexels expects.
// "Photorealistic candid headshot of a professional woman in her early 30s, warm smile..."
//   → "professional woman 30s headshot"
function extractSearchTerms(prompt) {
  const cleaned = prompt
    .toLowerCase()
    .replace(/photorealistic|candid|portrait|headshot|natural lighting|shallow depth of field|stock photo|cartoon/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  // Pull out gender, age range, profession-y nouns, key descriptors
  const words = cleaned.split(' ')
  const keep = new Set()
  const targets = [
    /^(man|woman|guy|girl|male|female|person)$/,
    /^(young|middle|aged|old|early|mid|late|professional|casual|warm|friendly|serious|focused)$/,
    /^(\d{2}s?|teen|twenty|thirty|forty|fifty)$/,
    /^(designer|developer|engineer|lawyer|attorney|manager|marketer|writer|coder|operator|coordinator|advisor|assistant|receptionist)$/,
    /^(headshot|portrait|face|photo)$/,
  ]
  for (const w of words) {
    if (w.length < 3) continue
    if (targets.some(re => re.test(w))) keep.add(w)
  }
  // Always ensure at least one anchor noun
  if (![...keep].some(k => /man|woman|person/.test(k))) keep.add('person')
  if (![...keep].some(k => /headshot|portrait/.test(k))) keep.add('portrait')
  return [...keep].slice(0, 6).join(' ') || 'professional headshot portrait'
}

async function tryOpenAI({ prompt, model = 'gpt-image-1', size = '1024x1024' }) {
  // Prefer a dedicated image-gen key if available (separate billing from chat).
  const key = getKey('openai images', 'OPENAI_IMAGE_API_KEY')
    || getKey('openai image', 'OPENAI_IMAGES_API_KEY')
    || getKey('openai-images', null)
    || getKey('openai', 'OPENAI_API_KEY')
  if (!key) return { ok: false, reason: 'no OpenAI key' }
  try {
    const r = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, prompt: prompt + STYLE_SUFFIX, size, n: 1 }),
    })
    if (!r.ok) {
      const text = await r.text().catch(() => '')
      return { ok: false, reason: `OpenAI ${r.status}: ${text.slice(0, 200)}`, retriable: r.status === 429 || r.status === 402 || /hard.?limit|billing/i.test(text) }
    }
    const j = await r.json()
    const item = j.data?.[0]
    if (!item) return { ok: false, reason: 'OpenAI returned no image' }
    let buf
    if (item.b64_json) buf = Buffer.from(item.b64_json, 'base64')
    else if (item.url) { const ir = await fetch(item.url); buf = Buffer.from(await ir.arrayBuffer()) }
    else return { ok: false, reason: 'OpenAI no image data' }
    return { ok: true, buffer: buf, ext: 'png', provider: 'openai', model }
  } catch (e) {
    return { ok: false, reason: 'OpenAI threw: ' + e.message }
  }
}

async function tryOpenRouter({ prompt, size = '1024x1024' }) {
  const key = getKey('openrouter', 'OPENROUTER_API_KEY')
  if (!key) return { ok: false, reason: 'no OpenRouter key' }
  // FLUX schnell is the cheap reliable image model on OpenRouter (~$0.003/image).
  // OpenRouter exposes an OpenAI-compatible /images/generations endpoint.
  const model = 'black-forest-labs/flux-1.1-pro'
  try {
    const r = await fetch('https://openrouter.ai/api/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
        'HTTP-Referer': 'https://crm.company.example.com',
        'X-Title': 'Farrington Command Center',
      },
      body: JSON.stringify({ model, prompt: prompt + STYLE_SUFFIX, size, n: 1 }),
    })
    if (!r.ok) {
      const text = await r.text().catch(() => '')
      return { ok: false, reason: `OpenRouter ${r.status}: ${text.slice(0, 200)}` }
    }
    const j = await r.json()
    const item = j.data?.[0]
    if (!item) return { ok: false, reason: 'OpenRouter returned no image' }
    let buf
    if (item.b64_json) buf = Buffer.from(item.b64_json, 'base64')
    else if (item.url) { const ir = await fetch(item.url); buf = Buffer.from(await ir.arrayBuffer()) }
    else return { ok: false, reason: 'OpenRouter no image data' }
    return { ok: true, buffer: buf, ext: 'png', provider: 'openrouter', model }
  } catch (e) {
    return { ok: false, reason: 'OpenRouter threw: ' + e.message }
  }
}

async function tryPexels({ prompt }) {
  const key = getKey('pexels', 'PEXELS_API_KEY')
  if (!key) return { ok: false, reason: 'no Pexels key' }
  try {
    const query = extractSearchTerms(prompt)
    const r = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=10&orientation=portrait`, {
      headers: { Authorization: key },
    })
    if (!r.ok) return { ok: false, reason: `Pexels search ${r.status}` }
    const j = await r.json()
    const photos = j.photos || []
    if (!photos.length) return { ok: false, reason: `Pexels: no results for "${query}"` }
    // Random pick from top results so two agents with similar prompts don't collide.
    const pick = photos[Math.floor(Math.random() * Math.min(photos.length, 5))]
    const url = pick.src?.large || pick.src?.medium || pick.src?.original
    if (!url) return { ok: false, reason: 'Pexels returned no image url' }
    const ir = await fetch(url)
    if (!ir.ok) return { ok: false, reason: `Pexels download ${ir.status}` }
    const buf = Buffer.from(await ir.arrayBuffer())
    const ext = (url.match(/\.(jpg|jpeg|png|webp)/i)?.[1] || 'jpg').toLowerCase().replace('jpeg', 'jpg')
    return { ok: true, buffer: buf, ext, provider: 'pexels', model: 'pexels-stock', searchQuery: query, pexelsId: pick.id, photographer: pick.photographer }
  } catch (e) {
    return { ok: false, reason: 'Pexels threw: ' + e.message }
  }
}

function hashString(value) {
  let hash = 0
  const text = String(value || '')
  for (let i = 0; i < text.length; i++) hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0
  return Math.abs(hash)
}

function localAvatarSvg({ id, prompt }) {
  const seed = hashString(`${id}:${prompt}`)
  const palettes = [
    ['#2563eb', '#14b8a6', '#f8fafc', '#1e293b'],
    ['#7c3aed', '#06b6d4', '#f5f3ff', '#111827'],
    ['#0f766e', '#84cc16', '#ecfeff', '#134e4a'],
    ['#be123c', '#f59e0b', '#fff7ed', '#3f1d2b'],
    ['#4338ca', '#0ea5e9', '#eef2ff', '#172554'],
  ]
  const [a, b, skin, ink] = palettes[seed % palettes.length]
  const hair = ['#111827', '#3f2f24', '#4b5563', '#78350f'][seed % 4]
  const jacket = ['#0f172a', '#1f2937', '#164e63', '#312e81'][Math.floor(seed / 3) % 4]
  const initial = String(id || 'A').replace(/[^a-z0-9]/gi, '').charAt(0).toUpperCase() || 'A'
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024" role="img" aria-label="Generated avatar">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${a}"/>
      <stop offset="1" stop-color="${b}"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="34%" r="62%">
      <stop offset="0" stop-color="#ffffff" stop-opacity="0.42"/>
      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="18" stdDeviation="24" flood-color="#0f172a" flood-opacity="0.25"/>
    </filter>
  </defs>
  <rect width="1024" height="1024" rx="220" fill="url(#bg)"/>
  <rect width="1024" height="1024" rx="220" fill="url(#glow)"/>
  <circle cx="246" cy="202" r="118" fill="#fff" opacity="0.14"/>
  <circle cx="812" cy="248" r="164" fill="#fff" opacity="0.11"/>
  <g filter="url(#shadow)">
    <path d="M220 902c28-191 142-292 292-292s264 101 292 292H220z" fill="${jacket}"/>
    <path d="M360 902l80-210h144l80 210H360z" fill="#f8fafc" opacity="0.92"/>
    <circle cx="512" cy="392" r="184" fill="${skin}"/>
    <path d="M338 384c26-132 118-218 252-192 92 18 156 86 164 192-74-36-150-54-228-54-62 0-124 18-188 54z" fill="${hair}"/>
    <path d="M336 398c28-56 81-82 158-78 89 5 160-10 214-45 36 58 48 122 38 190-34-56-78-91-132-104-82-20-174-8-278 37z" fill="${hair}" opacity="0.92"/>
    <circle cx="448" cy="420" r="14" fill="${ink}"/>
    <circle cx="576" cy="420" r="14" fill="${ink}"/>
    <path d="M462 526c32 28 68 42 108 0" fill="none" stroke="${ink}" stroke-width="16" stroke-linecap="round" opacity="0.72"/>
    <path d="M512 446c-10 34-16 58-18 72h48" fill="none" stroke="${ink}" stroke-width="13" stroke-linecap="round" stroke-linejoin="round" opacity="0.36"/>
  </g>
  <circle cx="828" cy="816" r="76" fill="#0f172a" opacity="0.22"/>
  <circle cx="828" cy="816" r="62" fill="#ffffff" opacity="0.88"/>
  <text x="828" y="839" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="64" font-weight="800" fill="${a}">${initial}</text>
</svg>`
}

async function tryLocalFallback({ id, prompt }) {
  return {
    ok: true,
    buffer: Buffer.from(localAvatarSvg({ id, prompt }), 'utf8'),
    ext: 'svg',
    provider: 'local',
    model: 'fcc-local-avatar',
  }
}

function isLikelyImageBuffer(buffer, ext) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 32) return false
  const head = buffer.subarray(0, 16)
  const asText = buffer.subarray(0, 128).toString('utf8').trimStart().toLowerCase()
  if (ext === 'svg') return asText.startsWith('<?xml') || asText.startsWith('<svg')
  if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) return true
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return true
  if (head.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return true
  return /^<svg[\s>]/.test(asText) || asText.startsWith('<?xml')
}

export async function generateAvatar({ id, prompt, model = 'gpt-image-1', size = '1024x1024' }) {
  if (!id || !prompt) throw new Error('generateAvatar requires id + prompt')
  ensureDir()

  const fullPrompt = prompt.trim()
  const tried = []

  // Tier 1: OpenAI (best, but rate-limited / hard-billing-capped)
  let result = await tryOpenAI({ prompt: fullPrompt, model, size })
  tried.push({ provider: 'openai', ok: result.ok, reason: result.reason })

  // Tier 2: OpenRouter FLUX (separate billing from OpenAI)
  if (!result.ok) {
    result = await tryOpenRouter({ prompt: fullPrompt, size })
    tried.push({ provider: 'openrouter', ok: result.ok, reason: result.reason })
  }

  // Tier 3: Pexels stock photo (always works if any results match)
  if (!result.ok) {
    result = await tryPexels({ prompt: fullPrompt })
    tried.push({ provider: 'pexels', ok: result.ok, reason: result.reason })
  }

  if (!result.ok) {
    result = await tryLocalFallback({ id, prompt: fullPrompt })
    tried.push({ provider: 'local', ok: true, reason: 'generated local fallback' })
  }

  if (!isLikelyImageBuffer(result.buffer, result.ext)) {
    tried.push({ provider: result.provider || 'unknown', ok: false, reason: 'provider returned a non-renderable image buffer' })
    result = await tryLocalFallback({ id, prompt: fullPrompt })
    tried.push({ provider: 'local', ok: true, reason: 'generated local fallback after invalid image' })
  }

  const fileName = `${sanitize(id)}-${Date.now()}.${result.ext}`
  const filePath = path.join(PUBLIC_DIR, fileName)
  fs.writeFileSync(filePath, result.buffer)

  // Mirror to Firebase Storage at the stable path so public surfaces auto-update.
  // Awaited so callers know the public URL is fresh by the time they get the result.
  const publicUrl = await uploadToPublicStorage(id, result.buffer, result.ext)

  const meta = readMeta()
  meta[id] = {
    file: fileName,
    // Prefer the Firebase public URL (loads everywhere); the local /avatars path
    // is a dev-only fallback and 404s under `next start` in production.
    url: publicUrl ? `${publicUrl}?v=${Date.now()}` : `/avatars/${fileName}`,
    localUrl: `/avatars/${fileName}`,
    prompt: fullPrompt + (result.provider === 'openai' ? STYLE_SUFFIX : ''),
    model: result.model,
    provider: result.provider,
    fallback: result.provider === 'local',
    generatedAt: new Date().toISOString(),
    ...(result.provider === 'pexels' ? { searchQuery: result.searchQuery, pexelsId: result.pexelsId, photographer: result.photographer } : {}),
    fallbackChain: tried,
  }
  writeMeta(meta)

  return meta[id]
}

export function getAvatarMeta(id) {
  const meta = readMeta()
  const item = meta[id]
  if (!item) return null
  try {
    const publicUrls = readData('avatar-public-urls.json')
    const stableUrl = publicUrls?.[id]
    if (stableUrl && String(item.url || '').startsWith('/avatars/')) {
      return { ...item, localUrl: item.localUrl || item.url, url: stableUrl }
    }
  } catch {}
  return item
}

export function listAvatars() {
  return readMeta()
}

export async function saveUploadedAvatar({ id, dataUrl }) {
  if (!id || !dataUrl) throw new Error('saveUploadedAvatar requires id + dataUrl')
  ensureDir()
  const m = dataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/)
  if (!m) throw new Error('Invalid data URL — expected image/* base64')
  const ext = m[1].split('/')[1].replace('jpeg', 'jpg')
  const buf = Buffer.from(m[2], 'base64')
  const fileName = `${sanitize(id)}-uploaded-${Date.now()}.${ext}`
  fs.writeFileSync(path.join(PUBLIC_DIR, fileName), buf)

  // Mirror to Firebase Storage at the stable path
  const publicUrl = await uploadToPublicStorage(id, buf, ext)

  const meta = readMeta()
  meta[id] = { file: fileName, url: publicUrl ? `${publicUrl}?v=${Date.now()}` : `/avatars/${fileName}`, localUrl: `/avatars/${fileName}`, source: 'upload', generatedAt: new Date().toISOString() }
  writeMeta(meta)
  return meta[id]
}

export function clearAvatar(id) {
  const meta = readMeta()
  delete meta[id]
  writeMeta(meta)
}

function sanitize(s) { return String(s).toLowerCase().replace(/[^a-z0-9-_]/g, '-').slice(0, 60) }
