#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'

const ROOT = process.cwd()
const TARGETS = ['data', 'data-demo']

function migrateDir(dir) {
  const abs = path.join(ROOT, dir)
  if (!fs.existsSync(abs)) {
    console.log(`[skip] ${dir} (not present)`)
    return
  }
  const dbPath = path.join(abs, 'crm.sqlite')
  const fresh = !fs.existsSync(dbPath)
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.exec(`CREATE TABLE IF NOT EXISTS kv_store (
    filename   TEXT PRIMARY KEY,
    data       TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )`)
  const put = db.prepare('INSERT OR REPLACE INTO kv_store (filename, data, updated_at) VALUES (?, ?, ?)')
  const txn = db.transaction((rows) => {
    for (const r of rows) put.run(r.name, r.raw, r.mtime)
  })

  const rows = []
  let skipped = 0
  for (const name of fs.readdirSync(abs)) {
    if (!name.endsWith('.json')) continue
    if (name.startsWith('.')) continue
    const full = path.join(abs, name)
    const stat = fs.statSync(full)
    if (!stat.isFile()) continue
    const raw = fs.readFileSync(full, 'utf-8')
    try { JSON.parse(raw) } catch { skipped++; continue }
    rows.push({ name, raw, mtime: Math.floor(stat.mtimeMs) })
  }
  txn(rows)
  db.close()
  console.log(`[${fresh ? 'created' : 'updated'}] ${path.relative(ROOT, dbPath)} — ${rows.length} files migrated, ${skipped} skipped (malformed)`)
}

for (const t of TARGETS) migrateDir(t)
console.log('Done. Set DATA_BACKEND=sqlite to switch the app over.')
