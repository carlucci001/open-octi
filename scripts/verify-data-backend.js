const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')
const Database = require('better-sqlite3')
const { parseProcessEnvironment, selectNextServerPid } = require('./verify-data-backend-process')

const ROOT = path.resolve(__dirname, '..')
const DATA_DIR = path.join(ROOT, 'data')
const DB_PATH = path.join(DATA_DIR, 'crm.sqlite')
const CRITICAL_FILES = [
  { file: 'users.json', key: 'users', min: 1 },
  { file: 'accounts.json', key: 'accounts', min: 1 },
  { file: 'activities.json', key: 'activities', min: 1 },
  { file: 'leads.json', key: 'leads', min: 1 },
]

function fail(message) {
  console.error(`FAIL ${message}`)
  process.exitCode = 1
}

function ok(message) {
  console.log(`OK   ${message}`)
}

function getRunningNextEnv() {
  if (process.platform !== 'linux') return null
  let ps
  try {
    ps = execSync('ps -u "$USER" -o pid=,args=', { encoding: 'utf8', shell: '/bin/bash' })
  } catch {
    return null
  }
  const pid = selectNextServerPid(ps, ROOT, candidate => fs.realpathSync(`/proc/${candidate}/cwd`))
  if (!pid) return null
  try {
    return parseProcessEnvironment(fs.readFileSync(`/proc/${pid}/environ`, 'utf8'))
  } catch {
    return null
  }
}

function collectionCount(data, key) {
  if (Array.isArray(data)) return data.length
  if (Array.isArray(data?.[key])) return data[key].length
  return null
}

console.log('Data backend verification')

if (process.env.DATA_BACKEND) {
  if (process.env.DATA_BACKEND.toLowerCase() === 'sqlite') ok('current command DATA_BACKEND=sqlite')
  else fail(`current command DATA_BACKEND=${process.env.DATA_BACKEND}; expected sqlite`)
} else {
  console.warn('WARN current command DATA_BACKEND is unset')
}

const runningEnv = getRunningNextEnv()
if (runningEnv) {
  if ((runningEnv.DATA_BACKEND || '').toLowerCase() === 'sqlite') ok('running Next service DATA_BACKEND=sqlite')
  else fail(`running Next service DATA_BACKEND=${runningEnv.DATA_BACKEND || '<unset>'}; expected sqlite`)
} else if (process.platform === 'linux') {
  console.warn('WARN no running next-server process found')
}

if (!fs.existsSync(DB_PATH)) {
  fail(`SQLite database missing at ${DB_PATH}`)
} else {
  ok(`SQLite database exists at ${DB_PATH}`)
}

let db = null
try {
  db = new Database(DB_PATH, { readonly: true })
  const table = db.prepare("select name from sqlite_master where type='table' and name='kv_store'").get()
  if (!table) fail('SQLite kv_store table is missing')
  else ok('SQLite kv_store table exists')

  for (const item of CRITICAL_FILES) {
    const row = db.prepare('select data, updated_at from kv_store where filename = ?').get(item.file)
    if (!row) {
      fail(`SQLite row missing for ${item.file}`)
      continue
    }
    let parsed
    try {
      parsed = JSON.parse(row.data)
    } catch {
      fail(`SQLite row for ${item.file} is not valid JSON`)
      continue
    }
    const count = collectionCount(parsed, item.key)
    if (count === null) fail(`${item.file} does not contain ${item.key}[]`)
    else if (count < item.min) fail(`${item.file} has ${count} ${item.key}; expected at least ${item.min}`)
    else ok(`${item.file} has ${count} ${item.key}`)
  }
} finally {
  try { db?.close() } catch {}
}

if (process.exitCode) {
  console.error('Data backend verification failed. Do not demo or restart as healthy.')
  process.exit(process.exitCode)
}

console.log('Data backend verification passed.')
