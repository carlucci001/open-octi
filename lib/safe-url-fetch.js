import { lookup } from 'node:dns/promises'
import net from 'node:net'
import { Agent } from 'undici'
import { isPrivateAddress } from './platforms/ssrf'

const BLOCKED_HOST_RE = /^(localhost|.*\.localhost|.*\.local|.*\.internal|metadata\.google\.internal)$/i

async function resolveSafePublicHttpUrl(value, lookupFn = lookup) {
  let url
  try {
    url = new URL(String(value || ''))
  } catch {
    throw new Error('URL is not valid.')
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only HTTP and HTTPS URLs are allowed.')
  if (url.username || url.password) throw new Error('URL credentials are not allowed.')
  if (BLOCKED_HOST_RE.test(url.hostname)) throw new Error('URL host is not publicly reachable.')

  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (net.isIP(host)) {
    if (isPrivateAddress(host)) throw new Error('URL address is in a blocked network range.')
    return { url, addresses: [{ address: host, family: net.isIP(host) }] }
  }

  let addresses
  try {
    addresses = await lookupFn(host, { all: true, verbatim: true })
  } catch {
    throw new Error('URL host could not be resolved.')
  }
  if (!addresses?.length) throw new Error('URL host returned no addresses.')
  if (addresses.some(entry => isPrivateAddress(entry.address))) throw new Error('URL host resolves to a blocked network range.')
  return { url, addresses }
}

export async function assertSafePublicHttpUrl(value, lookupFn = lookup) {
  return (await resolveSafePublicHttpUrl(value, lookupFn)).url
}

export function createPinnedDispatcher(addresses) {
  let cursor = 0
  return new Agent({
    connect: {
      lookup(_hostname, options, callback) {
        const family = Number(options?.family || 0)
        const eligible = family ? addresses.filter(entry => entry.family === family) : addresses
        if (!eligible.length) return callback(new Error('No validated address matches the requested family.'))
        if (options?.all) return callback(null, eligible.map(entry => ({ address: entry.address, family: entry.family })))
        const selected = eligible[cursor++ % eligible.length]
        return callback(null, selected.address, selected.family)
      },
    },
  })
}

async function readCappedText(response, maxBytes) {
  const declared = Number(response.headers.get('content-length') || 0)
  if (declared > maxBytes) throw new Error(`Response exceeded the ${Math.round(maxBytes / 1024)} KB size cap.`)

  const reader = response.body?.getReader?.()
  if (!reader) {
    const text = await response.text()
    if (Buffer.byteLength(text, 'utf8') > maxBytes) throw new Error(`Response exceeded the ${Math.round(maxBytes / 1024)} KB size cap.`)
    return text
  }

  const decoder = new TextDecoder()
  let received = 0
  let text = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    received += value.byteLength
    if (received > maxBytes) {
      try { await reader.cancel() } catch {}
      throw new Error(`Response exceeded the ${Math.round(maxBytes / 1024)} KB size cap.`)
    }
    text += decoder.decode(value, { stream: true })
  }
  return text + decoder.decode()
}

export async function safeFetchText(value, {
  fetchImpl = fetch,
  lookupFn = lookup,
  timeoutMs = 12_000,
  maxBytes = 2 * 1024 * 1024,
  maxRedirects = 4,
  headers = {},
  dispatcherFactory = createPinnedDispatcher,
} = {}) {
  let current = new URL(String(value))
  for (let redirects = 0; redirects <= maxRedirects; redirects += 1) {
    const resolved = await resolveSafePublicHttpUrl(current, lookupFn)
    current = resolved.url
    const dispatcher = dispatcherFactory(resolved.addresses)
    try {
      const response = await fetchImpl(current, {
        headers,
        redirect: 'manual',
        cache: 'no-store',
        signal: AbortSignal.timeout(timeoutMs),
        dispatcher,
      })
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location')
        if (!location) throw new Error('Redirect response did not include a destination.')
        if (redirects === maxRedirects) throw new Error('URL exceeded the redirect limit.')
        current = new URL(location, current)
        continue
      }
      return {
        ok: response.ok,
        status: response.status,
        text: await readCappedText(response, maxBytes),
        finalUrl: current.toString(),
      }
    } finally {
      await dispatcher?.close?.()
    }
  }
  throw new Error('URL exceeded the redirect limit.')
}
