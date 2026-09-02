import fs from 'fs'
import path from 'path'
import Database from 'better-sqlite3'
import { dirForFile, REAL_DIR, DEMO_DIR } from './mode.js'
import { isOpenOcti } from './edition.js'

const DB_FILENAME = 'crm.sqlite'
const dbs = new Map()
const stmts = new Map()

function getDb(dir) {
  let db = dbs.get(dir)
  if (db) return db
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  db = new Database(path.join(dir, DB_FILENAME))
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.exec(`CREATE TABLE IF NOT EXISTS kv_store (
    filename   TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )`)
  dbs.set(dir, db)
  stmts.set(dir, {
    get: db.prepare('SELECT data FROM kv_store WHERE filename = ?'),
    put: db.prepare('INSERT OR REPLACE INTO kv_store (filename, data, updated_at) VALUES (?, ?, ?)'),
  })
  return db
}

export function readDataSqlite(f, opts = {}) {
  const dir = opts.forceReal ? REAL_DIR : dirForFile(f)
  getDb(dir)
  const row = stmts.get(dir).get.get(f)
  if (row) return JSON.parse(row.data)
  // Lazy migration: first time SQLite is asked for a file that only exists
  // as JSON, copy it in so subsequent reads are fast.
  const jsonPath = path.join(dir, f)
  if (fs.existsSync(jsonPath)) {
    const raw = fs.readFileSync(jsonPath, 'utf-8')
    try {
      const data = JSON.parse(raw)
      stmts.get(dir).put.run(f, raw, Date.now())
      return data
    } catch { return null }
  }
  if (isOpenOcti()) {
    const seedPath = path.join(DEMO_DIR, f)
    if (fs.existsSync(seedPath)) {
      try {
        const raw = fs.readFileSync(seedPath, 'utf-8')
        const data = JSON.parse(raw)
        stmts.get(dir).put.run(f, raw, Date.now())
        return data
      } catch { return null }
    }
  }
  return null
}

export function writeDataSqlite(f, d) {
  const dir = dirForFile(f)
  getDb(dir)
  stmts.get(dir).put.run(f, JSON.stringify(d), Date.now())
}

/**
 * Atomically read, transform, and replace one logical JSON document.
 * The mutator must return { data, result }. Throwing from the mutator rolls
 * back the SQLite transaction and leaves the prior document untouched.
 */
export function mutateDataSqlite(f, mutator) {
  if (typeof mutator !== 'function') throw new TypeError('mutator must be a function')
  const dir = dirForFile(f)
  const db = getDb(dir)
  const transaction = db.transaction(() => {
    const row = stmts.get(dir).get.get(f)
    let current = null
    if (row) {
      current = JSON.parse(row.data)
    } else {
      const jsonPath = path.join(dir, f)
      if (fs.existsSync(jsonPath)) {
        try {
          current = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'))
        } catch {
          current = null
        }
      }
    }

    const outcome = mutator(current)
    if (!outcome || typeof outcome !== 'object' || !Object.prototype.hasOwnProperty.call(outcome, 'data')) {
      throw new TypeError('mutator must return an object containing data')
    }
    stmts.get(dir).put.run(f, JSON.stringify(outcome.data), Date.now())
    return outcome.result
  })
  return transaction.immediate()
}

export function getSqliteDataInfo(f, opts = {}) {
  const dir = opts.forceReal ? REAL_DIR : dirForFile(f)
  const dbPath = path.join(dir, DB_FILENAME)
  const info = {
    dbPath,
    dbExists: fs.existsSync(dbPath),
    rowExists: false,
    rowBytes: 0,
    updatedAt: null,
  }

  if (!info.dbExists) return info

  const db = getDb(dir)
  db.exec(`CREATE TABLE IF NOT EXISTS kv_store (
    filename   TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )`)
  const row = db.prepare('SELECT length(data) AS rowBytes, updated_at AS updatedAt FROM kv_store WHERE filename = ?').get(f)
  if (!row) return info

  return {
    ...info,
    rowExists: true,
    rowBytes: row.rowBytes || 0,
    updatedAt: row.updatedAt || null,
  }
}

export function closeAllSqlite() {
  for (const db of dbs.values()) try { db.close() } catch {}
  dbs.clear()
  stmts.clear()
}
