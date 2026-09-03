import { readData } from './dataStore'

const PUBLIC_API_SUFFIX = /\/(?:api\/)?public\/v1$/

export class PostizPublishError extends Error {
  constructor(message, { status = 502, stage = 'postiz-publish', code = '', detail = null, contentType = '' } = {}) {
    super(message)
    this.name = 'PostizPublishError'
    this.status = status
    this.stage = stage
    this.code = code
    this.detail = detail
    this.contentType = contentType
  }
}

export function getPostizPublishConfig(env = process.env) {
  let base = String(env.POSTIZ_API_URL || '').trim().replace(/\/$/, '')
  if (base === 'https://postiz.company.example.com/api/public/v1') {
    base = 'http://127.0.0.1:5005/api/public/v1'
  }
  const key = String(env.POSTIZ_API_KEY || '').trim()
  if (!base || !key) return null
  if (!PUBLIC_API_SUFFIX.test(base)) {
    return { error: 'POSTIZ_API_URL must point to the Postiz Public API, ending in /api/public/v1 or /public/v1' }
  }
  const publicUrl = String(env.NEXT_PUBLIC_POSTIZ_URL || base.replace(/\/api\/public\/v1$/, '')).replace(/\/$/, '')
  return { base, key, publicUrl }
}

export function getPostizPublishReadiness(env = process.env) {
  const config = getPostizPublishConfig(env)
  if (!config) {
    return {
      configured: false,
      connected: false,
      reason: 'Postiz env not configured (POSTIZ_API_URL / POSTIZ_API_KEY)',
    }
  }
  if (config.error) {
    return { configured: false, connected: false, reason: config.error }
  }
  return {
    configured: true,
    connected: true,
    publicUrl: config.publicUrl,
  }
}

export function normalizePostizMediaUrl(mediaUrl, requestUrl) {
  const raw = String(mediaUrl || '').trim()
  if (!raw) return ''
  try {
    return requestUrl ? new URL(raw, requestUrl).toString() : new URL(raw).toString()
  } catch {
    return raw
  }
}

function summarizePostizBody(text, contentType) {
  const raw = String(text || '')
  if (!raw) return null
  if (/html/i.test(contentType || '') || /^\s*<!doctype\s+html/i.test(raw) || /^\s*<html[\s>]/i.test(raw)) {
    return 'Postiz returned HTML instead of JSON. Check POSTIZ_API_URL; it should be the Public API URL, usually ending in /api/public/v1 on the self-hosted instance.'
  }
  return raw.slice(0, 600)
}

async function postizFetch(config, path, init = {}) {
  const url = `${config.base}${path}`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), init.timeoutMs || 15000)
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        Authorization: config.key,
        'User-Agent': 'fcc-campaign-studio/1',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers || {}),
      },
      cache: 'no-store',
    })
    const text = await response.text()
    const contentType = response.headers.get('content-type') || ''
    let body = null
    try { body = JSON.parse(text) } catch {}
    return {
      ok: response.ok,
      status: response.status,
      contentType,
      body,
      detail: body || summarizePostizBody(text, contentType),
    }
  } catch (error) {
    return {
      ok: false,
      status: 0,
      contentType: '',
      body: null,
      detail: String(error?.message || error),
    }
  } finally {
    clearTimeout(timeout)
  }
}

function resolveConfig(config) {
  const resolved = config || getPostizPublishConfig()
  if (!resolved) {
    throw new PostizPublishError('Postiz env not configured (POSTIZ_API_URL / POSTIZ_API_KEY)', {
      status: 503,
      stage: 'configuration',
    })
  }
  if (resolved.error) {
    throw new PostizPublishError(resolved.error, { status: 503, stage: 'configuration' })
  }
  return resolved
}

function enforceTenantChannels(channels, tenantId, tenantAssignments, brandId = '') {
  const raw = tenantAssignments || readData('postiz-channel-tenants.json') || {}
  const map = raw.map && typeof raw.map === 'object' ? raw.map : {}
  const defaultTenantId = raw.defaultTenantId || 'farrington-development'
  const wrongTenant = channels.filter(id => (map[id] || defaultTenantId) !== tenantId)
  if (wrongTenant.length) {
    throw new PostizPublishError(`Channel(s) not assigned to tenant ${tenantId}: ${wrongTenant.join(', ')}`, {
      status: 403,
      stage: 'tenant-validation',
      code: 'channel_tenant_mismatch',
    })
  }
  const cleanBrandId = String(brandId || '').trim()
  if (cleanBrandId) {
    const brandMap = raw.brandMap && typeof raw.brandMap === 'object' ? raw.brandMap : {}
    const defaultBrandId = raw.defaultBrandId || 'farrington-development'
    const wrongBrand = channels.filter(id => (brandMap[id] || defaultBrandId) !== cleanBrandId)
    if (wrongBrand.length) {
      throw new PostizPublishError(`Channel(s) not assigned to brand ${cleanBrandId}: ${wrongBrand.join(', ')}`, {
        status: 403,
        stage: 'brand-validation',
        code: 'channel_brand_mismatch',
      })
    }
  }
}

export async function publishPostizPost({
  content,
  mediaUrl = '',
  channels = [],
  publishAt = '',
  tenantId = 'farrington-development',
  brandId = '',
  requestUrl = '',
  config,
  tenantAssignments,
} = {}) {
  const resolvedConfig = resolveConfig(config)
  const cleanContent = String(content || '').trim()
  const cleanChannels = Array.isArray(channels) ? channels.filter(Boolean) : []
  const cleanTenantId = String(tenantId || 'farrington-development').trim()

  if (!cleanContent) throw new PostizPublishError('content is required', { status: 400, stage: 'validation' })
  if (!cleanChannels.length) throw new PostizPublishError('At least one channel is required', { status: 400, stage: 'validation' })
  enforceTenantChannels(cleanChannels, cleanTenantId, tenantAssignments, brandId)

  let when = publishAt ? new Date(publishAt) : new Date(Date.now() + 60000)
  if (Number.isNaN(when.getTime()) || when.getTime() < Date.now() + 30000) {
    when = new Date(Date.now() + 60000)
  }
  const scheduledFor = when.toISOString()
  const normalizedMediaUrl = normalizePostizMediaUrl(mediaUrl, requestUrl)
  let media = null

  if (normalizedMediaUrl) {
    const upload = await postizFetch(resolvedConfig, '/upload-from-url', {
      method: 'POST',
      body: JSON.stringify({ url: normalizedMediaUrl }),
      timeoutMs: 12000,
    })
    if (!upload.ok) {
      console.warn('[postiz-publish] media upload skipped', { status: upload.status, detail: upload.detail })
    } else {
      media = upload.body || null
    }
  }

  const image = media?.id && media?.path ? [{ id: media.id, path: media.path }] : []
  const response = await postizFetch(resolvedConfig, '/posts', {
    method: 'POST',
    body: JSON.stringify({
      type: 'schedule',
      shortLink: false,
      date: scheduledFor,
      tags: [],
      posts: cleanChannels.map(integrationId => ({
        integration: { id: integrationId },
        value: [{ content: cleanContent, image }],
        settings: {},
      })),
    }),
  })

  if (!response.ok) {
    throw new PostizPublishError(`Postiz posts ${response.status}`, {
      status: 502,
      stage: 'create-post',
      detail: response.detail,
      contentType: response.contentType,
    })
  }

  const posts = Array.isArray(response.body) ? response.body : (response.body ? [response.body] : [])
  return {
    ok: true,
    postId: posts[0]?.postId || posts[0]?.id || '',
    group: posts[0]?.group || '',
    scheduleUrl: `${resolvedConfig.publicUrl}/launches`,
    scheduledFor,
    count: posts.length,
    integrationIds: posts.map(post => post?.integration?.id || post?.integration).filter(Boolean),
  }
}
