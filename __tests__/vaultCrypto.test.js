// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isVaultEnvelope, openVault, sealVault, vaultKeyConfigured, VaultLockedError } from '../lib/vault-crypto.js'

const key = Buffer.alloc(32, 7).toString('base64')
const fixture = { credentials: [{ id: 'synthetic', fields: [{ label: 'API Key', value: 'synthetic-crypto-value' }] }] }

afterEach(() => vi.unstubAllEnvs())

describe('credential vault encryption', () => {
  it('round trips with a fresh IV and no plaintext fields in the envelope', () => {
    vi.stubEnv('FCC_VAULT_KEY', key)
    const envelope = sealVault(fixture)
    expect(envelope).toMatchObject({ __fccVault: 1, alg: 'aes-256-gcm' })
    expect(Buffer.from(envelope.iv, 'base64')).toHaveLength(12)
    expect(Buffer.from(envelope.tag, 'base64')).toHaveLength(16)
    expect(openVault(envelope)).toEqual(fixture)
    expect(sealVault(fixture).iv).not.toBe(envelope.iv)
    expect(JSON.stringify(envelope)).not.toContain('synthetic-crypto-value')
  })

  it('rejects ciphertext tampering', () => {
    const envelope = sealVault(fixture, key)
    const bytes = Buffer.from(envelope.ciphertext, 'base64')
    bytes[0] ^= 1
    expect(() => openVault({ ...envelope, ciphertext: bytes.toString('base64') }, key)).toThrow('could not be decrypted')
  })

  it('rejects a wrong key', () => {
    expect(() => openVault(sealVault(fixture, key), Buffer.alloc(32, 8).toString('base64'))).toThrow('could not be decrypted')
  })

  it.each(['not base64!', Buffer.alloc(31).toString('base64'), Buffer.alloc(33).toString('base64'), `${key}\n`, key.slice(0, -1), `${key.slice(0, -2)}B=`])('rejects invalid key encoding case %#', invalid => {
    expect(() => sealVault(fixture, invalid)).toThrow('exactly 32 bytes')
    expect(() => vaultKeyConfigured(invalid)).toThrow('exactly 32 bytes')
  })

  it('detects absent keys and fails locked for encrypted rows', () => {
    vi.stubEnv('FCC_VAULT_KEY', '')
    expect(vaultKeyConfigured()).toBe(false)
    expect(() => openVault(sealVault(fixture, key))).toThrow(VaultLockedError)
  })

  it('detects envelopes and keeps damaged markers fail-closed', () => {
    expect(isVaultEnvelope(sealVault(fixture, key))).toBe(true)
    expect(isVaultEnvelope({ __fccVault: 2 })).toBe(true)
    expect(isVaultEnvelope(fixture)).toBe(false)
    expect(isVaultEnvelope(null)).toBe(false)
    expect(isVaultEnvelope([])).toBe(false)
    expect(() => openVault({ __fccVault: 2 }, key)).toThrow('Invalid encrypted')
  })
})
