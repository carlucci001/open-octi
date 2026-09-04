import dns from 'node:dns/promises'
import net from 'node:net'
import { mutateData } from '../dataStore'
import { update } from '../entityStore'
import { fetchPressJson, fetchPressText } from './fetch'

export const HUNTER_MONTHLY_CAP = 50
export const SMTP_DOMAIN_COOLDOWN_MS = 24 * 60 * 60 * 1000

function cleanEmail(value) {
  const email = String(value || '').trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : ''
}

function emailDomain(value) {
  return cleanEmail(value).split('@')[1] || ''
}

export function extractPublishedEmails(text) {
  const matches = String(text || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []
  return [...new Set(matches.map(cleanEmail).filter(Boolean))]
}

function nameParts(name) {
  const parts = String(name || '').toLowerCase().replace(/[^a-z\s'-]/g, '').split(/\s+/).filter(Boolean)
  return { first: parts[0] || '', last: parts.at(-1) || '' }
}

const PATTERNS = [
  ['{first}.{last}', ({ first, last }) => first + '.' + last],
  ['{first}{last}', ({ first, last }) => first + last],
  ['{f}{last}', ({ first, last }) => first.slice(0, 1) + last],
  ['{first}{l}', ({ first, last }) => first + last.slice(0, 1)],
  ['{first}', ({ first }) => first],
  ['{last}', ({ last }) => last],
]

export function inferOutletEmailPattern(examples, domain) {
  const normalizedDomain = String(domain || '').toLowerCase()
  const usable = (examples || []).map(example => ({
    parts: nameParts(example.name),
    email: cleanEmail(example.email || example.email?.value),
  })).filter(example => example.parts.first && example.parts.last && emailDomain(example.email) === normalizedDomain)
  if (usable.length < 3) return { pattern: '', confidence: 0, examples: usable.length }
  const ranked = PATTERNS.map(([pattern, render]) => ({
    pattern,
    matches: usable.filter(example => example.email.split('@')[0] === render(example.parts)).length,
  })).sort((a, b) => b.matches - a.matches)
  const best = ranked[0]
  return {
    pattern: best.matches ? best.pattern : '',
    confidence: best.matches / usable.length,
    examples: usable.length,
  }
}

export function applyOutletEmailPattern(pattern, name, domain) {
  const parts = nameParts(name)
  if (!parts.first || !parts.last || !pattern || !domain) return ''
  const local = String(pattern)
    .replaceAll('{first}', parts.first)
    .replaceAll('{last}', parts.last)
    .replaceAll('{f}', parts.first.slice(0, 1))
    .replaceAll('{l}', parts.last.slice(0, 1))
  return cleanEmail(local + '@' + domain)
}

function bestNamedEmail(contact, emails) {
  const { first, last } = nameParts(contact?.name)
  if (!first || !last) return ''
  return emails.find(email => {
    const local = email.split('@')[0].replace(/[._-]/g, '')
    return local.includes(last) && (local.includes(first) || local.startsWith(first[0]))
  }) || ''
}

export function consumeHunterCredit(now = new Date()) {
  const month = now.toISOString().slice(0, 7)
  return mutateData('press-hunter-usage.json', current => {
    const data = current?.month === month ? current : { month, used: 0 }
    if (data.used >= HUNTER_MONTHLY_CAP) return { data, result: false }
    const next = { month, used: data.used + 1, updatedAt: now.toISOString() }
    return { data: next, result: true }
  })
}

async function hunterDomainSearch(contact, domain, options = {}) {
  if (!process.env.HUNTER_API_KEY) return ''
  if (!consumeHunterCredit(options.now || new Date())) return ''
  const url = 'https://api.hunter.io/v2/domain-search?domain=' + encodeURIComponent(domain)
    + '&limit=10&api_key=' + encodeURIComponent(process.env.HUNTER_API_KEY)
  const payload = await (options.fetchJson || fetchPressJson)(url, { respectRobots: false })
  const emails = payload?.data?.emails || []
  const target = nameParts(contact.name)
  const match = emails.find(item => {
    const first = String(item.first_name || '').toLowerCase()
    const last = String(item.last_name || '').toLowerCase()
    return first === target.first && last === target.last
  })
  return cleanEmail(match?.value)
}

export async function resolveMailExchange(domain, resolver = dns.resolveMx) {
  try {
    const records = await resolver(domain)
    return [...records].sort((a, b) => a.priority - b.priority)[0]?.exchange || ''
  } catch {
    return ''
  }
}

export function probeSmtpRecipient(email, exchange, options = {}) {
  if (!email || !exchange) return Promise.resolve(false)
  const timeoutMs = Math.max(1000, Number(options.timeoutMs || 8000))
  return new Promise(resolve => {
    let settled = false
    let stage = 0
    const finish = result => {
      if (settled) return
      settled = true
      try { socket.end('QUIT\r\n') } catch {}
      socket.destroy()
      resolve(result)
    }
    const socket = net.createConnection({ host: exchange, port: 25 })
    socket.setTimeout(timeoutMs)
    socket.on('timeout', () => finish(false))
    socket.on('error', () => finish(false))
    socket.on('data', chunk => {
      const line = chunk.toString('utf8')
      if (!/^\d{3}[ -]/m.test(line)) return
      if (stage === 0 && /^220/m.test(line)) {
        stage = 1
        socket.write('EHLO press.company.example.com\r\n')
      } else if (stage === 1 && /^250/m.test(line)) {
        stage = 2
        socket.write('MAIL FROM:<>\r\n')
      } else if (stage === 2 && /^250/m.test(line)) {
        stage = 3
        socket.write('RCPT TO:<' + email + '>\r\n')
      } else if (stage === 3) {
        finish(/^250|^251/m.test(line))
      } else if (/^[45]\d\d/m.test(line)) {
        finish(false)
      }
    })
  })
}

function smtpCooldown(domain, now = new Date()) {
  const at = now.toISOString()
  return mutateData('press-smtp-probes.json', current => {
    const probes = current?.probes || {}
    const last = Date.parse(probes[domain] || '')
    if (Number.isFinite(last) && now.getTime() - last < SMTP_DOMAIN_COOLDOWN_MS) {
      return { data: current, result: false }
    }
    const data = { probes: { ...probes, [domain]: at }, updatedAt: at }
    return { data, result: true }
  })
}

export async function verifyDiscoveredEmail(email, status, options = {}) {
  const domain = emailDomain(email)
  if (!domain) return { value: '', status: 'unknown', source: '', verifiedAt: null }
  const exchange = await resolveMailExchange(domain, options.resolveMx || dns.resolveMx)
  if (!exchange) return { value: email, status, source: options.source || '', verifiedAt: null }
  const cooldownAllows = status !== 'tips-fallback' && options.smtp !== false && (
    options.cooldownCheck
      ? options.cooldownCheck(domain, options.now || new Date())
      : smtpCooldown(domain, options.now || new Date())
  )
  if (status === 'tips-fallback' || options.smtp === false || !cooldownAllows) {
    return { value: email, status, source: options.source || '', verifiedAt: null, mx: true }
  }
  const accepted = await (options.smtpProbe || probeSmtpRecipient)(email, exchange, options)
  return {
    value: email,
    status: accepted ? 'verified' : status,
    source: options.source || '',
    verifiedAt: accepted ? (options.now || new Date()).toISOString() : null,
    mx: true,
  }
}

export async function discoverPressEmail(contact, outlet, peerContacts = [], options = {}) {
  const existing = cleanEmail(contact?.email?.value || contact?.legacyEmail)
  if (existing && ['verified', 'published'].includes(contact?.email?.status)) {
    return verifyDiscoveredEmail(existing, contact.email.status, { ...options, source: contact.email.source })
  }

  const domain = outlet?.domain || emailDomain(existing)
  let value = ''
  let status = 'unknown'
  let source = ''
  let publishedEmails = []

  if (outlet?.mastheadUrl) {
    try {
      const html = await (options.fetchText || fetchPressText)(outlet.mastheadUrl)
      publishedEmails = extractPublishedEmails(html)
      value = bestNamedEmail(contact, publishedEmails)
      if (value) {
        status = 'published'
        source = outlet.mastheadUrl
      }
    } catch {}
  }

  const publicExamples = peerContacts
    .map(peer => ({ name: peer.name, email: peer.email?.value || peer.legacyEmail }))
    .filter(example => cleanEmail(example.email))
  for (const email of publishedEmails) publicExamples.push({ name: email.split('@')[0].replace(/[._-]/g, ' '), email })
  const inferred = inferOutletEmailPattern(publicExamples, domain)
  if (outlet?.id && inferred.examples >= 3) {
    update('pressOutlets', outlet.id, {
      emailPattern: { pattern: inferred.pattern, confidence: inferred.confidence, examples: publicExamples.slice(0, 10) },
    })
  }
  const storedPattern = outlet?.emailPattern || inferred
  if (!value && storedPattern.pattern && storedPattern.confidence >= 0.6) {
    value = applyOutletEmailPattern(storedPattern.pattern, contact.name, domain)
    status = 'pattern'
    source = 'outlet-pattern'
  }

  if (!value && Number(storedPattern.confidence || 0) < 0.6) {
    try {
      value = await hunterDomainSearch(contact, domain, options)
      if (value) {
        status = 'published'
        source = 'hunter-domain-search'
      }
    } catch {}
  }

  if (!value) {
    const bio = String(contact?.social?.bio || '')
    value = extractPublishedEmails(bio)[0] || ''
    if (value) {
      status = 'published'
      source = 'bluesky-bio'
    }
  }

  if (!value && domain) {
    value = 'tips@' + domain
    status = 'tips-fallback'
    source = 'outlet-fallback'
  }

  return verifyDiscoveredEmail(value, status, { ...options, source })
}

export async function discoverEmailsForList(contacts, outlets, options = {}) {
  const outletMap = new Map(outlets.map(outlet => [outlet.id, outlet]))
  const byOutlet = new Map()
  for (const contact of contacts) {
    const list = byOutlet.get(contact.outletId) || []
    list.push(contact)
    byOutlet.set(contact.outletId, list)
  }
  const results = []
  for (const contact of contacts) {
    const outlet = outletMap.get(contact.outletId) || {}
    const email = await discoverPressEmail(contact, outlet, byOutlet.get(contact.outletId) || [], options)
    results.push({ ...contact, email })
    if (contact.id) update('pressContacts', contact.id, { email })
  }
  return results
}
