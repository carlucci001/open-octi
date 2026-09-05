import Database from 'better-sqlite3'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

export function openMonitoringHistory(filename = process.env.MONITORING_HISTORY_DB
  || path.join(process.env.CRM_DATA_DIR || path.join(process.cwd(), 'data'), 'monitoring.sqlite')) {
  if (filename !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(filename)), { recursive: true })
  const db = new Database(filename)
  db.pragma('journal_mode = WAL')
  db.pragma('busy_timeout = 5000')
  db.exec(`CREATE TABLE IF NOT EXISTS monitoring_runs (id TEXT PRIMARY KEY, checked_at TEXT NOT NULL, report TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS monitoring_lock (id INTEGER PRIMARY KEY CHECK(id=1), token TEXT, expires_at INTEGER);
    CREATE TABLE IF NOT EXISTS monitoring_state (id INTEGER PRIMARY KEY CHECK(id=1), last_alert_status TEXT);`)
  return {
    claim(now = Date.now()) {
      return db.transaction(() => {
        const lock = db.prepare('SELECT expires_at FROM monitoring_lock WHERE id=1').get()
        if (lock && lock.expires_at > now) return null
        const token = randomUUID()
        db.prepare('INSERT OR REPLACE INTO monitoring_lock VALUES (1, ?, ?)').run(token, now + 30 * 60 * 1000)
        return token
      })()
    },
    release(token) { db.prepare('DELETE FROM monitoring_lock WHERE id=1 AND token=?').run(token) },
    latest() {
      const row = db.prepare('SELECT report FROM monitoring_runs ORDER BY checked_at DESC, rowid DESC LIMIT 1').get()
      return row ? JSON.parse(row.report) : null
    },
    list(limit = 48) {
      return db.prepare('SELECT report FROM monitoring_runs ORDER BY checked_at DESC, rowid DESC LIMIT ?')
        .all(Math.min(288, Math.max(1, Number(limit) || 48))).map(row => JSON.parse(row.report))
    },
    save(report) {
      db.transaction(() => {
        db.prepare('INSERT INTO monitoring_runs VALUES (?, ?, ?)').run(randomUUID(), report.checkedAt, JSON.stringify(report))
        db.prepare('DELETE FROM monitoring_runs WHERE rowid NOT IN (SELECT rowid FROM monitoring_runs ORDER BY checked_at DESC, rowid DESC LIMIT 288)').run()
      })()
    },
    alertStatus() { return db.prepare('SELECT last_alert_status FROM monitoring_state WHERE id=1').get()?.last_alert_status || null },
    acknowledgeAlert(status) { db.prepare('INSERT OR REPLACE INTO monitoring_state VALUES (1, ?)').run(status) },
    close() { db.close() },
  }
}
