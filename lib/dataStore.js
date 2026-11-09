import fs from 'fs'
import path from 'path'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
import { dirForFile, getMode, REAL_DIR, DEMO_DIR, PINNED_TO_REAL } from './mode.js'
import { isOpenOcti } from './edition.js'
import { isVaultEnvelope, openVault, sealVault, vaultKeyConfigured } from './vault-crypto.js'

const DEFAULT_BACKEND = 'sqlite'
const BACKEND = (process.env.DATA_BACKEND || DEFAULT_BACKEND).toLowerCase()
const VAULT_FILE = 'credentials.json'
let warnedPlaintextVault = false

function decodeData(filename, value) {
  if (filename !== VAULT_FILE) return value
  if (isVaultEnvelope(value)) return openVault(value)
  if (value !== null && value !== undefined && vaultKeyConfigured() && !warnedPlaintextVault) {
    warnedPlaintextVault = true
    console.warn('[vault] credentials.json is still plaintext; run scripts/encrypt-vault.mjs --apply')
  }
  return value
}

function encodeData(filename, value) {
  return filename === VAULT_FILE && vaultKeyConfigured() ? sealVault(value) : value
}

function cacheKey(filename) {
  return filename === VAULT_FILE ? process.env.FCC_VAULT_KEY : undefined
}

// In-memory cache for the JSON backend, keyed by absolute path.
// Invalidated by file mtime so external edits to data/*.json are picked up.
// Returns shared references — callers may mutate then writeData; the writer
// refreshes the cache. Don't mutate without writing back.
const cache = new Map()

function readJson(f) {
  const dir = dirForFile(f)
  const p = path.join(dir, f)
  let stat
  try { stat = fs.statSync(p) } catch {
    if (!isOpenOcti()) return null
    const seedPath = path.join(DEMO_DIR, f)
    let seed
    try { seed = JSON.parse(fs.readFileSync(seedPath, 'utf-8')) } catch { return null }
    return decodeData(f, seed)
  }
  const hit = cache.get(p)
  if (hit && hit.mtime === stat.mtimeMs && hit.size === stat.size && hit.key === cacheKey(f)) return hit.data
  const data = decodeData(f, JSON.parse(fs.readFileSync(p, 'utf-8')))
  cache.set(p, { mtime: stat.mtimeMs, size: stat.size, data, key: cacheKey(f) })
  return data
}

function writeJson(f, d) {
  const stored = encodeData(f, d)
  const dir = dirForFile(f)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const p = path.join(dir, f)
  const tempPath = `${p}.${process.pid}.${randomUUID()}.tmp`
  try {
    fs.writeFileSync(tempPath, JSON.stringify(stored, null, 2), 'utf-8')
    fs.renameSync(tempPath, p)
  } finally {
    try {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath)
    } catch {}
  }
  const stat = fs.statSync(p)
  cache.set(p, { mtime: stat.mtimeMs, size: stat.size, data: d, key: cacheKey(f) })
}

function cloneJson(value) {
  if (value === null || value === undefined) return value
  return JSON.parse(JSON.stringify(value))
}

// Lazy-load the SQLite adapter so that when DATA_BACKEND=json the
// better-sqlite3 native module never gets touched.
let _sqlite
function sqlite() {
  if (!_sqlite) {
    _sqlite = typeof require === 'function'
      ? require('./dataStoreSqlite.js')
      : createRequire(import.meta.url)('./dataStoreSqlite.js')
  }
  return _sqlite
}

export function readData(f) {
  if (BACKEND === 'sqlite') return decodeData(f, sqlite().readDataSqlite(f, { prepareImport: value => encodeData(f, value) }))
  return readJson(f)
}

export function writeData(f, d) {
  if (BACKEND === 'sqlite') return sqlite().writeDataSqlite(f, encodeData(f, d))
  return writeJson(f, d)
}

/**
 * Read-modify-write a logical JSON document. SQLite executes the mutator in
 * one immediate transaction. The JSON fallback works on a defensive clone
 * and uses an atomic temp-file rename so a thrown mutator cannot corrupt the
 * cached or on-disk value.
 */
export function mutateData(f, mutator) {
  if (typeof mutator !== 'function') throw new TypeError('mutator must be a function')
  if (BACKEND === 'sqlite') return sqlite().mutateDataSqlite(f, current => {
    const outcome = mutator(decodeData(f, current))
    if (!outcome || typeof outcome !== 'object' || !Object.prototype.hasOwnProperty.call(outcome, 'data')) {
      throw new TypeError('mutator must return an object containing data')
    }
    return { ...outcome, data: encodeData(f, outcome.data) }
  })
  const outcome = mutator(cloneJson(readJson(f)))
  if (!outcome || typeof outcome !== 'object' || !Object.prototype.hasOwnProperty.call(outcome, 'data')) {
    throw new TypeError('mutator must return an object containing data')
  }
  writeJson(f, outcome.data)
  return outcome.result
}

export function readRealData(f) {
  if (BACKEND === 'sqlite') return decodeData(f, sqlite().readDataSqlite(f, { forceReal: true, prepareImport: value => encodeData(f, value) }))
  const p = path.join(REAL_DIR, f)
  let stat
  try { stat = fs.statSync(p) } catch { return null }
  const hit = cache.get(p)
  if (hit && hit.mtime === stat.mtimeMs && hit.size === stat.size && hit.key === cacheKey(f)) return hit.data
  const data = decodeData(f, JSON.parse(fs.readFileSync(p, 'utf-8')))
  cache.set(p, { mtime: stat.mtimeMs, size: stat.size, data, key: cacheKey(f) })
  return data
}

export function clearDataCache() {
  cache.clear()
}

export function currentBackend() {
  return BACKEND
}

function statJson(filename, dir) {
  const jsonPath = path.join(dir, filename)
  try {
    const stat = fs.statSync(jsonPath)
    return {
      jsonPath,
      jsonExists: true,
      jsonBytes: stat.size,
      jsonMtimeMs: stat.mtimeMs,
      ...(filename === VAULT_FILE ? { encrypted: isVaultEnvelope(JSON.parse(fs.readFileSync(jsonPath, 'utf8'))) } : {}),
    }
  } catch {
    return {
      jsonPath,
      jsonExists: false,
      jsonBytes: 0,
      jsonMtimeMs: null,
      ...(filename === VAULT_FILE ? { encrypted: false } : {}),
    }
  }
}

export function dataStoreInfo(files = []) {
  const list = Array.isArray(files) ? files : []
  return {
    backend: BACKEND,
    mode: getMode(),
    realDir: REAL_DIR,
    demoDir: DEMO_DIR,
    files: list.map(filename => {
      const dir = dirForFile(filename)
      const json = statJson(filename, dir)
      const sqliteInfo = sqlite().getSqliteDataInfo(filename)
      const active =
        BACKEND === 'sqlite'
          ? {
              kind: 'sqlite-kv',
              label: `${path.basename(sqliteInfo.dbPath)}:kv_store/${filename}`,
              exists: sqliteInfo.rowExists,
              bytes: sqliteInfo.rowBytes,
              updatedAt: sqliteInfo.updatedAt,
            }
          : {
              kind: 'json-file',
              label: path.relative(process.cwd(), json.jsonPath) || json.jsonPath,
              exists: json.jsonExists,
              bytes: json.jsonBytes,
              updatedAt: json.jsonMtimeMs,
            }
      return {
        filename,
        ...(filename === VAULT_FILE ? { encrypted: BACKEND === 'sqlite' ? sqliteInfo.encrypted : json.encrypted } : {}),
        pinnedToReal: PINNED_TO_REAL.has(filename),
        directory: dir,
        active,
        json,
        sqlite: sqliteInfo,
      }
    }),
  }
}
