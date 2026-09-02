import fs from 'fs'
import path from 'path'
import { randomUUID } from 'node:crypto'
import { dirForFile, getMode, REAL_DIR, DEMO_DIR, PINNED_TO_REAL } from './mode'
import { isOpenOcti } from './edition'

const DEFAULT_BACKEND = 'sqlite'
const BACKEND = (process.env.DATA_BACKEND || DEFAULT_BACKEND).toLowerCase()

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
    try { return JSON.parse(fs.readFileSync(seedPath, 'utf-8')) } catch { return null }
  }
  const hit = cache.get(p)
  if (hit && hit.mtime === stat.mtimeMs && hit.size === stat.size) return hit.data
  const data = JSON.parse(fs.readFileSync(p, 'utf-8'))
  cache.set(p, { mtime: stat.mtimeMs, size: stat.size, data })
  return data
}

function writeJson(f, d) {
  const dir = dirForFile(f)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const p = path.join(dir, f)
  const tempPath = `${p}.${process.pid}.${randomUUID()}.tmp`
  try {
    fs.writeFileSync(tempPath, JSON.stringify(d, null, 2), 'utf-8')
    fs.renameSync(tempPath, p)
  } finally {
    try {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath)
    } catch {}
  }
  const stat = fs.statSync(p)
  cache.set(p, { mtime: stat.mtimeMs, size: stat.size, data: d })
}

function cloneJson(value) {
  if (value === null || value === undefined) return value
  return JSON.parse(JSON.stringify(value))
}

// Lazy-load the SQLite adapter so that when DATA_BACKEND=json the
// better-sqlite3 native module never gets touched.
let _sqlite
function sqlite() {
  if (!_sqlite) _sqlite = require('./dataStoreSqlite')
  return _sqlite
}

export function readData(f) {
  if (BACKEND === 'sqlite') return sqlite().readDataSqlite(f)
  return readJson(f)
}

export function writeData(f, d) {
  if (BACKEND === 'sqlite') return sqlite().writeDataSqlite(f, d)
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
  if (BACKEND === 'sqlite') return sqlite().mutateDataSqlite(f, mutator)
  const outcome = mutator(cloneJson(readJson(f)))
  if (!outcome || typeof outcome !== 'object' || !Object.prototype.hasOwnProperty.call(outcome, 'data')) {
    throw new TypeError('mutator must return an object containing data')
  }
  writeJson(f, outcome.data)
  return outcome.result
}

export function readRealData(f) {
  if (BACKEND === 'sqlite') return sqlite().readDataSqlite(f, { forceReal: true })
  const p = path.join(REAL_DIR, f)
  let stat
  try { stat = fs.statSync(p) } catch { return null }
  const hit = cache.get(p)
  if (hit && hit.mtime === stat.mtimeMs && hit.size === stat.size) return hit.data
  const data = JSON.parse(fs.readFileSync(p, 'utf-8'))
  cache.set(p, { mtime: stat.mtimeMs, size: stat.size, data })
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
    }
  } catch {
    return {
      jsonPath,
      jsonExists: false,
      jsonBytes: 0,
      jsonMtimeMs: null,
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
        pinnedToReal: PINNED_TO_REAL.has(filename),
        directory: dir,
        active,
        json,
        sqlite: sqliteInfo,
      }
    }),
  }
}
