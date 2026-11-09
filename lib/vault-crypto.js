import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'

export class VaultLockedError extends Error {
  constructor() {
    super('The credential vault is encrypted. Configure FCC_VAULT_KEY to unlock it.')
    this.name = 'VaultLockedError'
  }
}

function keyBytes(key) {
  // Buffer.from(base64) is permissive; require the canonical encoding too.
  if (typeof key !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(key)) {
    throw new Error('FCC_VAULT_KEY must be base64 encoding exactly 32 bytes.')
  }
  const decoded = Buffer.from(key, 'base64')
  if (decoded.length !== 32 || decoded.toString('base64') !== key) {
    throw new Error('FCC_VAULT_KEY must be base64 encoding exactly 32 bytes.')
  }
  return decoded
}

export function vaultKeyConfigured(key = process.env.FCC_VAULT_KEY) {
  if (key === undefined || key === '') return false
  keyBytes(key)
  return true
}

export function isVaultEnvelope(value) {
  // Recognize the marker even when damaged, so malformed envelopes fail closed.
  return Boolean(value && typeof value === 'object' && !Array.isArray(value)
    && Object.prototype.hasOwnProperty.call(value, '__fccVault'))
}

function decodeField(value, length) {
  if (typeof value !== 'string' || !value || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error('Invalid encrypted credential vault.')
  }
  const decoded = Buffer.from(value, 'base64')
  if (decoded.toString('base64') !== value || (length && decoded.length !== length)) {
    throw new Error('Invalid encrypted credential vault.')
  }
  return decoded
}

// The migration uses the raw JSON form so rollback preserves whitespace and bytes.
export function sealVaultJson(json, key = process.env.FCC_VAULT_KEY) {
  const secret = keyBytes(key)
  try { JSON.parse(json) } catch { throw new Error('The credential vault is not valid JSON.') }
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGORITHM, secret, iv)
  const ciphertext = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()])
  return {
    __fccVault: 1,
    alg: ALGORITHM,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  }
}

export function sealVault(obj, key = process.env.FCC_VAULT_KEY) {
  return sealVaultJson(JSON.stringify(obj), key)
}

export function openVaultJson(envelope, key = process.env.FCC_VAULT_KEY) {
  if (key === undefined || key === '') throw new VaultLockedError()
  const secret = keyBytes(key)
  if (!isVaultEnvelope(envelope) || envelope.__fccVault !== 1 || envelope.alg !== ALGORITHM) {
    throw new Error('Invalid encrypted credential vault.')
  }
  try {
    const decipher = createDecipheriv(ALGORITHM, secret, decodeField(envelope.iv, 12))
    decipher.setAuthTag(decodeField(envelope.tag, 16))
    const json = Buffer.concat([
      decipher.update(decodeField(envelope.ciphertext)),
      decipher.final(),
    ]).toString('utf8')
    JSON.parse(json)
    return json
  } catch {
    throw new Error('The credential vault could not be decrypted. Check FCC_VAULT_KEY and vault integrity.')
  }
}

export function openVault(envelope, key = process.env.FCC_VAULT_KEY) {
  return JSON.parse(openVaultJson(envelope, key))
}
