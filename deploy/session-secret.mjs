import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

export function ensureSessionSecret(env = process.env) {
  if (env.CRM_SESSION_SECRET && env.CRM_SESSION_SECRET !== 'replace-with-a-long-random-value') return env.CRM_SESSION_SECRET
  const directory = path.resolve(env.CRM_DATA_DIR || 'data')
  const file = path.join(directory, '.session-secret')
  fs.mkdirSync(directory, { recursive: true })
  if (!fs.existsSync(file)) {
    const temporary = `${file}.${crypto.randomUUID()}.tmp`
    try {
      fs.writeFileSync(temporary, crypto.randomBytes(48).toString('hex'), { flag: 'wx', mode: 0o600 })
      try { fs.linkSync(temporary, file) } catch (error) { if (error.code !== 'EEXIST') throw error }
    } finally { fs.rmSync(temporary, { force: true }) }
  }
  const descriptor = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0))
  try {
    const stat = fs.fstatSync(descriptor)
    if (!stat.isFile() || stat.size !== 96) throw new Error('Invalid session secret file')
    if (process.platform !== 'win32') {
      if (stat.uid !== process.getuid()) throw new Error('Session secret must belong to the app user')
      fs.fchmodSync(descriptor, 0o600)
    }
    const secret = fs.readFileSync(descriptor, 'utf8')
    if (!/^[a-f0-9]{96}$/.test(secret)) throw new Error('Invalid session secret file')
    return secret
  } finally { fs.closeSync(descriptor) }
}
