#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import Database from 'better-sqlite3'
import { isVaultEnvelope, openVault, openVaultJson, sealVaultJson, vaultKeyConfigured } from '../lib/vault-crypto.js'

const VAULT_FILE = 'credentials.json'
const DEFAULT_BACKUP_DIR = '/root/backups/crm-sqlite'

function parseJson(raw) {
  try { return JSON.parse(raw) } catch { throw new Error('The credential vault is not valid JSON.') }
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function fingerprint(value) {
  return createHash('sha256').update(canonicalJson(value)).digest('hex').slice(0, 10)
}

function counts(value) {
  const entries = Array.isArray(value?.credentials) ? value.credentials : []
  return {
    entryCount: entries.length,
    fieldCount: entries.reduce((sum, entry) => sum + (Array.isArray(entry?.fields) ? entry.fields.length : 0), 0),
  }
}

function timestamp() {
  return new Date().toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-')
}

function purgePlaintextPages(db) {
  // Cutover runs with the app stopped. Rebuild to discard historical free pages,
  // then truncate the WAL so future physical backups cannot retain old values.
  db.exec('VACUUM')
  const checkpoint = db.pragma('wal_checkpoint(TRUNCATE)')[0]
  if (checkpoint?.busy) throw new Error('Vault page cleanup is blocked; stop other database connections and retry --apply.')
}

/** Operate on a caller-owned SQLite connection; never log vault contents or keys. */
export async function encryptVault({ db, key = process.env.FCC_VAULT_KEY, apply = false, decrypt = false, backupDir = DEFAULT_BACKUP_DIR }) {
  if (!vaultKeyConfigured(key)) throw new Error('FCC_VAULT_KEY is required.')
  const read = db.prepare('SELECT data FROM kv_store WHERE filename = ?')
  const row = read.get(VAULT_FILE)
  if (!row) throw new Error('The credential vault row was not found.')
  const stored = parseJson(row.data)
  const encrypted = isVaultEnvelope(stored)
  const originalJson = encrypted ? openVaultJson(stored, key) : row.data
  const original = parseJson(originalJson)
  const beforeHash = fingerprint(original)
  const report = { ...counts(original), beforeHash, afterHash: beforeHash, backupPath: null }

  if (decrypt && !encrypted) return { status: 'already-plaintext', ...report }
  if (!decrypt && encrypted) {
    if (apply) purgePlaintextPages(db)
    return { status: 'already-encrypted', ...report }
  }
  if (!apply && !decrypt) return { status: 'dry-run', ...report }

  let backupPath = null
  if (!decrypt) {
    fs.mkdirSync(backupDir, { recursive: true, mode: 0o700 })
    backupPath = path.resolve(backupDir, `pre-vaultenc-${timestamp()}.sqlite`)
    // Reserve with restrictive permissions before SQLite writes the plaintext backup.
    const backupFd = fs.openSync(backupPath, 'wx', 0o600)
    fs.closeSync(backupFd)
    try {
      await db.backup(backupPath)
    } catch {
      throw new Error('The vault backup failed; the credential vault was not changed.')
    }
  }

  const write = db.prepare('UPDATE kv_store SET data = ?, updated_at = ? WHERE filename = ?')
  let verified
  if (!decrypt) db.pragma('secure_delete = ON')
  db.transaction(() => {
    if (read.get(VAULT_FILE)?.data !== row.data) {
      throw new Error('The credential vault changed during backup; retry the operation.')
    }
    const next = decrypt ? originalJson : JSON.stringify(sealVaultJson(originalJson, key))
    write.run(next, Date.now(), VAULT_FILE)
    const saved = read.get(VAULT_FILE).data
    verified = decrypt ? parseJson(saved) : openVault(parseJson(saved), key)
    if (!isDeepStrictEqual(verified, original) || (decrypt && saved !== originalJson)) {
      throw new Error('Vault verification failed; the transaction was rolled back.')
    }
  }).immediate()

  if (!decrypt) purgePlaintextPages(db)

  return {
    status: decrypt ? 'decrypted' : 'encrypted',
    ...report,
    afterHash: fingerprint(verified),
    backupPath,
  }
}

function parseArguments(args) {
  const options = { dbPath: path.resolve('data/crm.sqlite'), mode: 'dry-run' }
  let modeSet = false
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (['--dry-run', '--apply', '--decrypt'].includes(arg)) {
      if (modeSet) throw new Error('Choose only one of --dry-run, --apply, or --decrypt.')
      options.mode = arg.slice(2)
      modeSet = true
    } else if (['--db', '--key-file', '--backup-dir'].includes(arg)) {
      const value = args[++index]
      if (!value || value.startsWith('--')) throw new Error('A required path argument is missing.')
      options[{ '--db': 'dbPath', '--key-file': 'keyFile', '--backup-dir': 'backupDir' }[arg]] = value
    } else {
      throw new Error('Unsupported argument. Use --dry-run, --apply, --decrypt, --db, --key-file, or --backup-dir.')
    }
  }
  return options
}

function readKeyFile(filename) {
  const stat = fs.lstatSync(filename)
  if (!stat.isFile() || stat.isSymbolicLink() || (process.platform !== 'win32' && (stat.mode & 0o777) !== 0o600)) {
    throw new Error('The vault key file must be a regular file with permissions 0600.')
  }
  const match = /^FCC_VAULT_KEY=([^\r\n]+)$/.exec(fs.readFileSync(filename, 'utf8').trim())
  if (!match) throw new Error('The vault key file must contain FCC_VAULT_KEY=<base64>.')
  return match[1]
}

async function main() {
  const options = parseArguments(process.argv.slice(2))
  const key = options.keyFile ? readKeyFile(options.keyFile) : process.env.FCC_VAULT_KEY
  if (!vaultKeyConfigured(key)) throw new Error('FCC_VAULT_KEY is required.')
  const db = new Database(options.dbPath, { fileMustExist: true })
  try {
    const report = await encryptVault({
      db,
      key,
      apply: options.mode === 'apply',
      decrypt: options.mode === 'decrypt',
      backupDir: options.backupDir,
    })
    process.stdout.write(`${JSON.stringify(report)}\n`)
  } finally {
    db.close()
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    // External errors can contain input or paths; keep CLI failure output fixed.
    process.stderr.write('Vault operation failed. Check the key, database, permissions, and backup directory; no secret values were logged.\n')
    process.exitCode = 1
  })
}
