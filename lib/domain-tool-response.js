export async function readDomainToolResponse(response, { purchase = false } = {}) {
  let data
  try { data = await response.json() } catch { data = null }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    const issue = [401, 403].includes(response.status)
      ? 'The Command Center session is not authorized for this domain request.'
      : `The Command Center domain endpoint returned HTTP ${response.status} without a readable response.`
    throw new Error(`${issue}${purchase ? ' Registration status is unknown; check Cloudflare before retrying the purchase.' : ' Domain availability has not been verified.'}`)
  }
  if (!response.ok && !data.error && !data.spoken) {
    throw new Error(`The Command Center domain request failed (HTTP ${response.status}).${purchase ? ' Check Cloudflare before retrying the purchase.' : ''}`)
  }
  return data
}

export function describeDomainAvailability(result) {
  if (result.error) return `Lookup failed: ${result.error}`
  if (result.available === false) {
    const parts = [`${result.domain} is registered`]
    if (result.registrar) parts.push(`through ${result.registrar}`)
    if (result.expires_at) parts.push(`expires ${result.expires_at.slice(0, 10)}`)
    return parts.join(', ') + '.'
  }
  if (result.registrable === false) {
    const availability = result.available === true ? 'is unregistered' : 'has not been verified as available'
    return `${result.domain} ${availability}, but I cannot buy it here — ${result.reason_text || 'Cloudflare does not offer registration for this name'}. Do not quote a price.`
  }
  if (result.available !== true) {
    return `I could not verify whether ${result.domain} is available. Do not say it is registered or available, and do not quote a price.`
  }
  if (result.price == null) {
    return `${result.domain} is available. I have NO price for it${result.pricing_error ? ` (${result.pricing_error})` : ''}. Tell Carl you do not have a price — do not guess one.`
  }
  return `${result.domain} is available at $${Number(result.price).toFixed(2)} ${result.currency || 'USD'} per year${result.premium ? ' (premium domain)' : ''}. Quote exactly that number.`
}

export async function requestDomainRegistration(input = {}, fetchImpl = fetch) {
  const { domain, period, years, privacy, autoRenew, action, confirmToken } = input
  try {
    const payload = {
      domain,
      years: Number(years || period) || 1,
      privacy: privacy !== false,
      autoRenew: autoRenew === true,
      // Preserve caller intent so the server can reject invalid actions and
      // quote requests carrying a purchase token instead of treating them as buys.
      ...(action !== undefined ? { action } : {}),
      ...(confirmToken ? { confirmToken } : {}),
    }
    const response = await fetchImpl('/api/domains/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    })
    const result = await readDomainToolResponse(response, { purchase: Boolean(confirmToken) })
    if (!result.ok) return result.spoken || result.error || 'The registration request failed. No successful registration was confirmed.'
    if (result.phase === 'quote') {
      return `${result.spoken} [confirmToken=${result.confirmToken}] — read the exact quote and terms, wait for Carl's confirmation, then call register_domain with that exact confirmToken.`
    }
    if (result.spoken) return result.spoken
    if (result.phase === 'registered' && result.status === 'active') return `${result.domain} is registered.`
    return `Registration of ${result.domain || domain} is not confirmed. Check its status before attempting another purchase.`
  } catch (error) {
    return `Registration request failed: ${error.message}${confirmToken ? ' Check Cloudflare before retrying; I cannot confirm whether the purchase completed.' : ' No purchase was requested.'}`
  }
}
