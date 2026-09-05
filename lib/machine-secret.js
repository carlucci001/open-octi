import { timingSafeEqual } from 'node:crypto'
import { isOpenOcti } from './edition.js'

const UNSAFE_SECRET_MARKERS = [
  'missing',
  'changeme',
  'change-me',
  'replace-me',
  'undefined',
  'null',
  'local-only',
]

export function configuredMachineSecret(value, env = process.env) {
  const secret = String(value || '').trim()
  if (!secret) return null

  const normalized = secret.toLowerCase()
  if (UNSAFE_SECRET_MARKERS.some(marker => normalized === marker || normalized.includes(marker))) return null
  if (isOpenOcti(env) && secret.length < 32) return null

  return secret
}

export function machineSecretMatches(received, expected) {
  const actual = Buffer.from(String(received || ''), 'utf8')
  const wanted = Buffer.from(String(expected || ''), 'utf8')
  return actual.length === wanted.length && actual.length > 0 && timingSafeEqual(actual, wanted)
}
