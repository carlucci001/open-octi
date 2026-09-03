import fs from 'fs'
import path from 'path'
import { brandAssetsFor } from '@/lib/brand-assets'

const BRAND_ASSETS = brandAssetsFor()
const OPENOCTI_EMAIL_LOGOS = { light: 'openocti/logo-horizontal.png', dark: 'openocti/logo-horizontal.png' }

// Standardized font stack used across every outgoing brand email.
const FONT_STACK = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`

// Public tunnel URL — used to give email clients a stable absolute URL for embedded images
// so Gmail can proxy and display them automatically (data: URIs are unreliable in some clients).
const TUNNEL_URL = process.env.PUBLIC_TUNNEL_URL || 'https://openocti.local'

function publicAbsoluteUrl(pathLike) {
  if (!pathLike) return null
  if (/^https?:\/\//i.test(pathLike)) return pathLike
  return TUNNEL_URL.replace(/\/$/, '') + (pathLike.startsWith('/') ? pathLike : '/' + pathLike)
}

// Brand registry. Keyed by short identifier passed into wrapEmailBody(body, brand).
// Defaults to 'farrington' when no brand is specified.
const BRANDS = {
  farrington: {
    name: 'Farrington Development LLC',
    person: 'Carl Farrington',
    // Carl's NEW logos uploaded to his Firebase Storage bucket (newsroomasios.firebasestorage.app)
    // — public URLs Gmail can proxy. Light theme shows the dark logo (dark text on light bg).
    localLogos: BRAND_ASSETS.openOcti ? OPENOCTI_EMAIL_LOGOS : null,
    hostedLogo: BRAND_ASSETS.openOcti ? null : 'https://storage.googleapis.com/newsroomasios.firebasestorage.app/logos/fd-brand-dark.png',
    hostedLogoDark: BRAND_ASSETS.openOcti ? null : 'https://storage.googleapis.com/newsroomasios.firebasestorage.app/logos/fd-brand-light.png',
    logoSize: BRAND_ASSETS.openOcti ? 220 : 180,
    accent: '#3b7dd8',
    textColor: '#1a1c2e',
    mutedColor: '#6b7084',
    altText: BRAND_ASSETS.openOcti ? 'OpenOcti Command Center' : 'Farrington Development',
    phoneHref: 'tel:+18287709227',
    phoneDisplay: 'PHONE_REDACTED',
    email: 'personal@example.invalid',
    website: 'farringtondevelopment.com',
    websiteUrl: 'https://farringtondevelopment.com',
    location: 'Asheville, NC',
    social: [],
  },
  newsroom: {
    name: 'NewsroomAIOS',
    person: 'The NewsroomAIOS Team',
    localLogos: null,
    hostedLogo: 'https://newsroomaios.com/newsroom-logo.png',
    logoSize: 120,
    accent: '#2563eb',
    textColor: '#0f172a',
    mutedColor: '#475569',
    altText: 'NewsroomAIOS',
    phoneHref: 'tel:+18287709227',
    phoneDisplay: 'PHONE_REDACTED',
    email: 'redacted@example.invalid',
    website: 'newsroomaios.com',
    websiteUrl: 'https://newsroomaios.com',
    location: 'Asheville, NC',
    social: [
      { label: 'Facebook', url: 'https://www.facebook.com/profile.php?id=61573323189381', icon: 'facebook', color: '1877F2' },
      { label: 'X',        url: 'https://x.com/newsroomaios', icon: 'x', color: '000000' },
      { label: 'TikTok',   url: 'https://www.tiktok.com/@newsroomaios', icon: 'tiktok', color: '000000' },
      { label: 'YouTube',  url: 'https://www.youtube.com/@newsroomaios', icon: 'youtube', color: 'FF0000' },
    ],
  },
  wnctimes: {
    name: 'WNC Times',
    person: 'The WNC Times Team',
    localLogos: null,
    hostedLogo: 'https://storage.googleapis.com/gen-lang-client-0242565142.firebasestorage.app/logos/1771036412771-lightlogo.jpeg',
    logoSize: 120,
    accent: '#0f172a',
    textColor: '#0f172a',
    mutedColor: '#475569',
    altText: 'WNC Times',
    phoneHref: 'tel:+18286242408',
    phoneDisplay: 'PHONE_REDACTED',
    email: 'redacted@example.invalid',
    website: 'wnctimes.com',
    websiteUrl: 'https://wnctimes.com',
    location: 'Western North Carolina',
    social: [
      { label: 'X',        url: 'https://x.com/wnctimes', icon: 'x', color: '000000' },
      { label: 'Facebook', url: 'https://www.facebook.com/wnctimes', icon: 'facebook', color: '1877F2' },
      { label: 'Bluesky',  url: 'https://bsky.app/profile/wnctimes.bsky.social', icon: 'bluesky', color: '0A7AFF' },
    ],
  },
}

// Base64-cache for local-file logos so we don't re-read from disk on every email.
const logoCache = {}
function localLogoPair(paths) {
  if (!paths) return null
  const key = paths.light + '|' + paths.dark
  if (logoCache[key]) return logoCache[key]
  try {
    const light = fs.readFileSync(path.join(process.cwd(), paths.light))
    const dark = fs.readFileSync(path.join(process.cwd(), paths.dark))
    logoCache[key] = {
      light: `data:image/png;base64,${light.toString('base64')}`,
      dark: `data:image/png;base64,${dark.toString('base64')}`,
    }
    return logoCache[key]
  } catch { return null }
}

// Read a local public file and return a CID-attachment spec, or null on failure.
function readPublicAsAttachment(publicRelPath, contentId) {
  if (!publicRelPath) return null
  const cleaned = publicRelPath.replace(/^public[\\/]/, '').replace(/^\//, '')
  const filePath = path.join(process.cwd(), 'public', cleaned)
  if (!fs.existsSync(filePath)) return null
  const buf = fs.readFileSync(filePath)
  const ext = (cleaned.match(/\.(png|jpe?g|webp|gif)$/i)?.[1] || 'png').toLowerCase().replace('jpeg', 'jpg')
  const mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`
  return { filename: path.basename(cleaned), content: buf, content_id: contentId, contentType: mime }
}

function logoCell(brand, sink) {
  const size = brand.logoSize
  const style = `display:block;border:0;width:${size}px;height:auto;max-width:${size}px;object-fit:contain`
  const borderCell = `padding:0 18px 0 0;vertical-align:middle;border-right:2px solid ${brand.accent}`

  // 1. CID inline attachments from local files — works in every email client.
  if (brand.localLogos) {
    const lightAtt = readPublicAsAttachment(brand.localLogos.light, 'fd-logo-light')
    const darkAtt = readPublicAsAttachment(brand.localLogos.dark, 'fd-logo-dark')
    if (lightAtt && darkAtt) {
      sink.push(lightAtt, darkAtt)
      return `<td style="${borderCell}">
        <img src="cid:fd-logo-light" width="${size}" alt="${brand.altText}" class="fd-logo-light" style="${style}"/>
        <img src="cid:fd-logo-dark"  width="${size}" alt="${brand.altText}" class="fd-logo-dark"  style="display:none;border:0;width:${size}px;height:auto;max-width:${size}px;object-fit:contain"/>
      </td>`
    }
  }
  // 2. Hosted URL — already a full URL (ships as-is, Gmail will proxy)
  if (brand.hostedLogo) {
    if (brand.hostedLogoDark) {
      return `<td style="${borderCell}">
        <img src="${brand.hostedLogo}" width="${size}" alt="${brand.altText}" class="fd-logo-light" style="${style}"/>
        <img src="${brand.hostedLogoDark}" width="${size}" alt="${brand.altText}" class="fd-logo-dark" style="display:none;border:0;width:${size}px;height:auto;max-width:${size}px;object-fit:contain"/>
      </td>`
    }
    return `<td style="${borderCell}">
      <img src="${brand.hostedLogo}" width="${size}" alt="${brand.altText}" style="${style}"/>
    </td>`
  }
  // 3. Brand initials — last-resort
  const initials = brand.name.split(/\s+/).map(w => w[0]).join('').slice(0, 3).toUpperCase()
  return `<td style="${borderCell};font-weight:700;color:${brand.accent};font-size:22px;letter-spacing:0.5px">${initials}</td>`
}

// Resolve an avatar URL/path to a Gmail-friendly absolute URL via the tunnel.
// Email clients display proxied http URLs reliably; data: URIs often get stripped.
function avatarSrc(urlOrPath) {
  if (!urlOrPath) return null
  if (/^https?:\/\//i.test(urlOrPath)) return urlOrPath
  return publicAbsoluteUrl(urlOrPath)
}

// Optional agent block — small avatar + name + role + "on behalf of [brand]".
// Renders ABOVE the brand logo/info block so the recipient sees who actually wrote the email.
function agentBlock(agent, brand, sink) {
  if (!agent || !agent.name) return ''
  let avatarImg
  // Only render an image if the avatar is at a publicly-fetchable URL. Local /avatars/*
  // paths need to go through the tunnel which is gated by Cloudflare Access, so they fail
  // silently in email clients — using a colored-initial circle is more reliable until we
  // upload avatars to a public host.
  if (agent.avatarUrl && /^https?:\/\//i.test(agent.avatarUrl) && !/crm\.farringtondevelopment\.com/.test(agent.avatarUrl)) {
    avatarImg = `<img src="${agent.avatarUrl}" alt="${agent.name}" width="44" height="44" style="display:block;border:0;width:44px;height:44px;border-radius:50%;object-fit:cover"/>`
  }
  if (!avatarImg) {
    avatarImg = `<div style="width:44px;height:44px;border-radius:50%;background:${brand.accent};color:#fff;text-align:center;line-height:44px;font-weight:700;font-size:16px;font-family:Arial,Helvetica,sans-serif">${(agent.name[0] || '').toUpperCase()}</div>`
  }
  return `<table cellpadding="0" cellspacing="0" border="0" style="margin:0 0 12px 0;font-family:${FONT_STACK};color:${brand.textColor}">
    <tr>
      <td style="padding-right:12px;vertical-align:middle">${avatarImg}</td>
      <td style="vertical-align:middle;font-size:13px;line-height:1.4">
        <div style="font-weight:700;color:${brand.textColor}">${agent.name}</div>
        ${agent.role ? `<div style="color:${brand.mutedColor};font-size:12px">${agent.role}</div>` : ''}
        <div style="color:${brand.mutedColor};font-size:11px;margin-top:2px">on behalf of ${brand.person || brand.name}</div>
      </td>
    </tr>
  </table>`
}

const SOCIAL_GLYPHS = {
  facebook: 'f',
  x:        'X',
  twitter:  't',
  tiktok:   'T',
  youtube:  '▶',
  bluesky:  'B',
  instagram: 'ig',
  linkedin: 'in',
}

function socialRow(brand) {
  if (!brand.social || brand.social.length === 0) return ''
  const badges = brand.social.map(s => {
    const bg = `#${s.color || '475569'}`
    const glyph = s.glyph || SOCIAL_GLYPHS[s.icon] || s.label.charAt(0).toUpperCase()
    return `<a href="${s.url}" aria-label="${s.label}" style="display:inline-block;width:28px;height:28px;line-height:28px;background:${bg};color:#ffffff;text-align:center;border-radius:50%;font-family:Arial,Helvetica,sans-serif;font-weight:700;font-size:15px;text-decoration:none;margin-right:8px">${glyph}</a>`
  }).join('')
  return `<div style="margin-top:12px">${badges}</div>`
}

function signatureHtmlInternal(brandKey, opts, sink) {
  const brand = BRANDS[brandKey] || BRANDS.farrington
  const agent = opts.agent || null
  const nameLine = brand.person
    ? `<div style="font-weight:700;font-size:15px;color:${brand.textColor}">${brand.person}</div>
       <div style="color:${brand.mutedColor}">${brand.name}</div>`
    : `<div style="font-weight:700;font-size:15px;color:${brand.textColor}">${brand.name}</div>`

  return `${agentBlock(agent, brand, sink)}<table cellpadding="0" cellspacing="0" border="0" style="margin-top:8px;font-family:${FONT_STACK};color:${brand.textColor}">
    <tr>
      ${logoCell(brand, sink)}
      <td style="padding:0 0 0 18px;vertical-align:middle;font-size:13px;line-height:1.5">
        ${nameLine}
        <div style="margin-top:6px;color:${brand.mutedColor}">
          <a href="${brand.phoneHref}" style="color:${brand.accent};text-decoration:none">${brand.phoneDisplay}</a>
          &nbsp;·&nbsp;
          <a href="mailto:${brand.email}" style="color:${brand.accent};text-decoration:none">${brand.email}</a>
        </div>
        <div style="color:${brand.mutedColor}">
          <a href="${brand.websiteUrl}" style="color:${brand.accent};text-decoration:none">${brand.website}</a>
          &nbsp;·&nbsp;${brand.location}
        </div>
        ${socialRow(brand)}
      </td>
    </tr>
  </table>`
}

export function signatureHtml(brandKey = 'farrington', opts = {}) {
  return signatureHtmlInternal(brandKey, opts, [])
}

// Build full email HTML AND collect inline attachments (logo, avatar) so the caller can ship
// them as CID-referenced attachments. Returns { html, inlineAttachments }.
export function buildEmail(bodyHtml, brandKey = 'farrington', opts = {}) {
  const brand = BRANDS[brandKey] || BRANDS.farrington
  const sink = []
  const sigHtml = signatureHtmlInternal(brandKey, opts, sink)
  const html = `<style>
    @media (prefers-color-scheme: dark) {
      .fd-logo-light { display: none !important; }
      .fd-logo-dark { display: block !important; }
    }
  </style>
  <div style="max-width:600px;margin:0 auto;font-family:${FONT_STACK};padding:24px;color:${brand.textColor};line-height:1.55;font-size:14px">
    ${bodyHtml}
    <hr style="border:none;border-top:1px solid #eceef2;margin:28px 0"/>
    ${sigHtml}
  </div>`
  return { html, inlineAttachments: sink }
}

// Backward-compatible: returns just HTML. Used by code that doesn't need inline images.
export function wrapEmailBody(bodyHtml, brandKey = 'farrington', opts = {}) {
  return buildEmail(bodyHtml, brandKey, opts).html
}

// Helper: load an agent's signature info (name, role, avatarUrl) from CRM data.
// Prefers the public Firebase Storage URL (from data/avatar-public-urls.json) so emails
// can fetch the image without hitting Cloudflare Access on the tunnel.
export function getAgentEmailIdentity(agentIdOrName) {
  if (!agentIdOrName) return null
  try {
    const agentsFile = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'agents.json'), 'utf-8'))
    const agents = agentsFile.agents || {}
    let agent = agents[agentIdOrName]
    let agentId = agentIdOrName
    if (!agent) {
      const lc = String(agentIdOrName).toLowerCase()
      const entry = Object.entries(agents).find(([k, v]) => k.toLowerCase() === lc || (v.name || '').toLowerCase() === lc)
      if (entry) { agentId = entry[0]; agent = entry[1] }
    }
    if (!agent) return null
    let avatarUrl = null
    // First choice: public Firebase Storage URL
    const publicUrlsFile = path.join(process.cwd(), 'data', 'avatar-public-urls.json')
    if (fs.existsSync(publicUrlsFile)) {
      const publicUrls = JSON.parse(fs.readFileSync(publicUrlsFile, 'utf-8'))
      if (publicUrls[agentId]) avatarUrl = publicUrls[agentId]
    }
    // Fallback: local /avatars/* path (will fail in email but works in CRM UI)
    if (!avatarUrl) {
      const avatarsFile = path.join(process.cwd(), 'data', 'avatars.json')
      if (fs.existsSync(avatarsFile)) {
        const avatars = JSON.parse(fs.readFileSync(avatarsFile, 'utf-8'))
        if (avatars[agentId]?.url) avatarUrl = avatars[agentId].url
      }
    }
    return { name: agent.name, role: agent.title || agent.role || '', avatarUrl }
  } catch { return null }
}
