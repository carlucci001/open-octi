import { isOpenOcti } from './edition'
import { readData } from './dataStore'
import { readInstallationIntegration, writeInstallationIntegration } from './openocti-keys'

export function stripeKeyMode(key, kind = 'secret') {
  const match = String(key || '').trim().match(kind === 'secret' ? /^(?:sk|rk)_(test|live)_[A-Za-z0-9]+$/ : /^pk_(test|live)_[A-Za-z0-9]+$/)
  return match?.[1] || null
}

function vaultConfiguration(readCredentials, openOcti) {
  const entries = readCredentials('credentials.json')?.credentials || []
  const candidates = entries.filter(entry => /stripe/i.test(entry.name || ''))
  if (openOcti && candidates.length > 1) return { issue: 'Choose the owner Stripe account in Admin → Stripe.' }
  const fields = candidates[0]?.fields || []
  const secrets = fields.filter(field => /secret/i.test(field.label || '') && stripeKeyMode(field.value)).map(field => String(field.value).trim())
  if (openOcti && new Set(secrets).size > 1) return { issue: 'Choose test or live keys explicitly in Admin → Stripe.' }
  const preferred = fields.find(field => /secret.*\(p\)/i.test(field.label || '')) || fields.find(field => /secret.*\(s\)/i.test(field.label || '')) || fields.find(field => /secret/i.test(field.label || ''))
  const secretKey = openOcti ? secrets[0] || '' : String(preferred?.value || '').trim()
  const mode = stripeKeyMode(secretKey)
  const publishableKey = fields.map(field => String(field.value || '').trim()).find(value => stripeKeyMode(value, 'public') === mode) || ''
  return { secretKey, publishableKey, mode, source: secretKey ? 'vault' : null }
}

export function resolveStripeConfiguration(env = process.env, { readCredentials = readData, readSaved = readInstallationIntegration } = {}) {
  const openOcti = isOpenOcti(env)
  let config
  try { config = openOcti ? readSaved('stripe', env) : null } catch {
    return { secretKey: '', publishableKey: '', mode: null, source: 'app', issue: 'Saved Stripe configuration could not be opened. Check the installation session secret.' }
  }
  if (config) config = { ...config, source: 'app' }
  else if (String(env.STRIPE_SECRET_KEY || '').trim()) config = { secretKey: String(env.STRIPE_SECRET_KEY).trim(), publishableKey: String(env.NEXT_PUBLIC_STRIPE_PK || '').trim(), source: 'env' }
  else {
    config = vaultConfiguration(readCredentials, openOcti)
    if (!config.publishableKey && !openOcti) config.publishableKey = String(env.NEXT_PUBLIC_STRIPE_PK || '').trim()
  }
  if (!openOcti) return config
  const mode = stripeKeyMode(config.secretKey)
  if (config.issue || (config.secretKey && !mode) || (config.mode && config.mode !== mode)) {
    return { source: config.source, secretKey: '', publishableKey: '', mode: null, issue: config.issue || 'Stripe secret key and selected mode do not match.' }
  }
  const publicMode = stripeKeyMode(config.publishableKey, 'public')
  if (config.publishableKey && publicMode !== mode) return { ...config, mode, publishableKey: '', issue: 'Stripe publishable and secret keys must use the same mode.' }
  return { ...config, secretKey: config.secretKey || '', publishableKey: config.publishableKey || '', mode }
}

export function stripeConfigurationStatus(config = resolveStripeConfiguration()) {
  return {
    configured: Boolean(config.secretKey), browserReady: Boolean(config.secretKey && config.publishableKey && !config.issue),
    mode: config.mode || stripeKeyMode(config.secretKey), source: config.source || null, issue: config.issue || null,
    accountId: config.accountId || null, accountName: config.accountName || null, checkedAt: config.checkedAt || null,
    chargesEnabled: config.chargesEnabled ?? null,
  }
}

export function stripeConfigurationEnv(env = process.env) {
  if (!isOpenOcti(env)) return env
  const config = resolveStripeConfiguration(env)
  return { ...env, STRIPE_SECRET_KEY: config.secretKey || '', NEXT_PUBLIC_STRIPE_PK: config.publishableKey || '' }
}

export async function saveStripeConfiguration(input, env = process.env, { fetchImpl = fetch, readCurrent = resolveStripeConfiguration, writeSaved = writeInstallationIntegration } = {}) {
  if (!isOpenOcti(env)) throw new Error('Stripe setup is available in OpenOcti.')
  if (!['test', 'live'].includes(input.mode)) throw new Error('Choose test or live mode.')
  const current = readCurrent(env)
  if (current.source === 'app' && current.issue && !current.secretKey) throw new Error('Repair the saved encrypted configuration before changing Stripe keys. No credentials were changed.')
  const replacement = String(input.secretKey || '').trim()
  const secretKey = replacement || current.secretKey
  // A replacement account always needs a fresh matching publishable key.
  const publishableKey = String(input.publishableKey || '').trim() || (!replacement ? current.publishableKey : '')
  if (stripeKeyMode(secretKey) !== input.mode || stripeKeyMode(publishableKey, 'public') !== input.mode) {
    throw new Error('Enter the secret and publishable keys from the same Stripe account and selected mode.')
  }
  let response
  try {
    response = await fetchImpl('https://api.stripe.com/v1/account', { headers: { Authorization: `Bearer ${secretKey}` }, cache: 'no-store', signal: AbortSignal.timeout(10000) })
  } catch { throw new Error('Stripe could not be reached. Your saved keys were not changed.') }
  if (!response.ok) throw new Error(`Stripe rejected the account check (${response.status}). Your saved keys were not changed.`)
  const account = await response.json().catch(() => null)
  if (!account?.id?.startsWith('acct_')) throw new Error('Stripe did not return an account. Your saved keys were not changed.')
  const saved = { secretKey, publishableKey, mode: input.mode, accountId: account.id, accountName: account.business_profile?.name || account.settings?.dashboard?.display_name || '', chargesEnabled: Boolean(account.charges_enabled), checkedAt: new Date().toISOString() }
  writeSaved('stripe', saved, env)
  return stripeConfigurationStatus({ ...saved, source: 'app' })
}
