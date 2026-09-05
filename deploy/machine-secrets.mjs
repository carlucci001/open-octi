import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { configuredMachineSecret } from '../lib/machine-secret.js'

const NAMES = ['OPENCLAW_GATEWAY_TOKEN', 'OPENCLAW_API_KEY']
const strictSecret = value => configuredMachineSecret(value, { FCC_EDITION: 'openocti' })

export function machineSecretsPath(env = process.env) {
  return path.join(path.resolve(env.CRM_DATA_DIR || 'data'), 'openclaw', 'machine-secrets.json')
}

function readSecrets(file) {
  let descriptor
  try {
    descriptor = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0))
    const stat = fs.fstatSync(descriptor)
    if (!stat.isFile() || stat.size > 4096) throw new Error('Invalid machine secrets file')
    if (process.platform !== 'win32') {
      if (stat.uid !== process.getuid()) throw new Error('Machine secrets must be owned by the app user')
      fs.fchmodSync(descriptor, 0o600)
    }
    let stored
    try { stored = JSON.parse(fs.readFileSync(descriptor, 'utf8')) } catch {
      throw new Error('Invalid machine secrets file; restore it from a secure backup')
    }
    for (const name of NAMES) {
      if (!strictSecret(stored[name])) throw new Error(`Machine secrets file contains an invalid ${name}`)
    }
    return Object.fromEntries(NAMES.map(name => [name, stored[name]]))
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor)
  }
}

function explicitSecrets(env) {
  return Object.fromEntries(NAMES.map(name => [name, strictSecret(env[name])]))
}

export function resolveMachineSecrets(file, env = process.env) {
  const explicit = explicitSecrets(env)
  if (NAMES.every(name => explicit[name])) return explicit
  const stored = readSecrets(file)
  return Object.fromEntries(NAMES.map(name => [name, explicit[name] || stored[name]]))
}

export function ensureMachineSecrets(file, env = process.env) {
  const explicit = explicitSecrets(env)
  if (NAMES.every(name => explicit[name])) return { secrets: explicit, file, generated: false, persisted: false }
  try {
    return { secrets: resolveMachineSecrets(file, env), file, generated: false, persisted: true }
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }

  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
  const temporary = `${file}.${process.pid}.${crypto.randomBytes(12).toString('hex')}.tmp`
  let generated = false
  try {
    const descriptor = fs.openSync(temporary, 'wx', 0o600)
    try {
      const values = Object.fromEntries(NAMES.map(name => [name, crypto.randomBytes(48).toString('hex')]))
      fs.writeFileSync(descriptor, `${JSON.stringify(values)}\n`, 'utf8')
      fs.fsyncSync(descriptor)
    } finally {
      fs.closeSync(descriptor)
    }
    // A hard link publishes the complete, private file atomically without replacing
    // another starter's winner. Readers never see an empty or partially written file.
    try { fs.linkSync(temporary, file); generated = true } catch (error) {
      if (error.code !== 'EEXIST') throw error
    }
  } finally {
    fs.rmSync(temporary, { force: true })
  }
  return { secrets: resolveMachineSecrets(file, env), file, generated, persisted: true }
}

export async function waitForMachineSecrets(file, env = process.env, { timeoutMs = 60_000, intervalMs = 200 } = {}) {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    try { return resolveMachineSecrets(file, env) } catch (error) {
      if (error.code !== 'ENOENT') throw error
      if (Date.now() >= deadline) throw new Error('Timed out waiting for the app to initialize machine secrets')
      await delay(Math.min(intervalMs, Math.max(1, deadline - Date.now())))
    }
  }
}
