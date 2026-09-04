const DENIED_DOMAINS = Object.freeze([
  'muckrack.com',
  'cision.com',
  'prnewswire.com',
  'linkedin.com',
  'x.com',
  'twitter.com',
])

const domainLastRequest = new Map()
const domainQueues = new Map()
const robotsCache = new Map()

export const PRESS_CRAWL_DENYLIST = DENIED_DOMAINS
export const PRESS_USER_AGENT = 'FarringtonPressDesk/1.0 (+https://company.example.com/contact)'

export function isDeniedPressDomain(value) {
  let hostname
  try { hostname = new URL(value).hostname.toLowerCase() } catch {
    hostname = String(value || '').trim().toLowerCase().replace(/^www\./, '')
  }
  return DENIED_DOMAINS.some(domain => hostname === domain || hostname.endsWith('.' + domain))
}

export function assertPressCrawlAllowed(value) {
  const url = new URL(value)
  if (!/^https?:$/.test(url.protocol)) throw new Error('Press Desk only fetches HTTP(S) public sources')
  if (isDeniedPressDomain(url.href)) throw new Error('Press Desk crawl denylist blocked ' + url.hostname)
  return url
}

function sleep(ms) {
  return ms > 0 ? new Promise(resolve => setTimeout(resolve, ms)) : Promise.resolve()
}

async function pacedFetch(url, options = {}) {
  const host = url.hostname.toLowerCase()
  const minimumDelayMs = Math.max(1000, Number(options.minimumDelayMs || 1000))
  const previous = domainQueues.get(host) || Promise.resolve()
  const request = previous.catch(() => {}).then(async () => {
    const elapsed = Date.now() - (domainLastRequest.get(host) || 0)
    await sleep(minimumDelayMs - elapsed)
    domainLastRequest.set(host, Date.now())
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), Math.max(1000, Number(options.timeoutMs || 15000)))
    try {
      return await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          accept: options.accept || '*/*',
          'user-agent': PRESS_USER_AGENT,
          ...(options.headers || {}),
        },
      })
    } finally {
      clearTimeout(timeout)
    }
  })
  domainQueues.set(host, request)
  request.finally(() => {
    if (domainQueues.get(host) === request) domainQueues.delete(host)
  }).catch(() => {})
  return request
}

function retryDelayMs(response, attempt, options = {}) {
  const retryAfter = Number(response.headers.get('retry-after'))
  if (Number.isFinite(retryAfter) && retryAfter >= 0) return retryAfter * 1000
  const initial = Math.max(1000, Number(options.initialBackoffMs || 60_000))
  return Math.min(900_000, initial * (2 ** attempt))
}

async function fetchWithBackoff(url, options = {}) {
  const retries = Math.max(0, Number(options.maxRetries ?? 4))
  for (let attempt = 0; ; attempt += 1) {
    const response = await pacedFetch(url, options)
    if (response.status !== 429 || attempt >= retries) return response
    const delayMs = retryDelayMs(response, attempt, options)
    options.onBackoff?.({ url: url.href, attempt: attempt + 1, delayMs })
    await (options.sleepFn || sleep)(delayMs)
  }
}

export function robotsAllowsPath(robotsText, pathname, userAgent = PRESS_USER_AGENT) {
  const groups = []
  let current = null
  for (const rawLine of String(robotsText || '').split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim()
    if (!line) continue
    const match = line.match(/^([^:]+):\s*(.*)$/)
    if (!match) continue
    const key = match[1].trim().toLowerCase()
    const value = match[2].trim()
    if (key === 'user-agent') {
      if (!current || current.rules.length) {
        current = { agents: [], rules: [] }
        groups.push(current)
      }
      current.agents.push(value.toLowerCase())
    } else if (current && (key === 'allow' || key === 'disallow')) {
      current.rules.push({ type: key, path: value })
    }
  }
  const agent = String(userAgent).toLowerCase()
  const matching = groups.filter(group => group.agents.some(value => value === '*' || agent.includes(value)))
  const rules = matching.flatMap(group => group.rules)
    .filter(rule => rule.path && pathname.startsWith(rule.path.replace(/\*.*$/, '')))
    .sort((a, b) => b.path.length - a.path.length)
  return rules[0]?.type !== 'disallow'
}

async function robotsAllows(url, options = {}) {
  const origin = url.origin
  if (robotsCache.has(origin)) return robotsCache.get(origin)
  const promise = (async () => {
    try {
      const response = await fetchWithBackoff(new URL('/robots.txt', origin), {
        timeoutMs: options.timeoutMs,
        minimumDelayMs: options.minimumDelayMs,
        accept: 'text/plain',
      })
      if (response.status === 404) return true
      if (!response.ok) return false
      return robotsAllowsPath(await response.text(), url.pathname)
    } catch {
      return false
    }
  })()
  robotsCache.set(origin, promise)
  return promise
}

export async function politePressFetch(value, options = {}) {
  const url = assertPressCrawlAllowed(value)
  if (options.respectRobots !== false && !(await robotsAllows(url, options))) {
    throw new Error('robots.txt disallows Press Desk access to ' + url.hostname + url.pathname)
  }
  const response = await fetchWithBackoff(url, options)
  assertPressCrawlAllowed(response.url || url.href)
  if (!response.ok) throw new Error('Public source returned HTTP ' + response.status + ' for ' + url.hostname)
  return response
}

export async function fetchPressText(value, options = {}) {
  const response = await politePressFetch(value, options)
  const text = await response.text()
  const maxBytes = Math.max(1024, Number(options.maxBytes || 2_000_000))
  return text.slice(0, maxBytes)
}

export async function fetchPressJson(value, options = {}) {
  const response = await politePressFetch(value, { ...options, accept: 'application/json' })
  return response.json()
}

export function resetPressFetchStateForTests() {
  domainLastRequest.clear()
  domainQueues.clear()
  robotsCache.clear()
}
