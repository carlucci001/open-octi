import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { isOpenOcti } from './edition'

function settingsPath(env) { return path.join(env.CRM_DATA_DIR || path.join(process.cwd(), 'data'), 'openocti-postiz.json') }
function encryptionKey(env) {
  if (!String(env.CRM_SESSION_SECRET || '').trim()) throw new Error('The installation secret is required to protect Postiz settings.')
  return Buffer.from(crypto.hkdfSync('sha256', Buffer.from(env.CRM_SESSION_SECRET), Buffer.from('openocti-postiz-v1'), Buffer.from('settings'), 32))
}
export function validatePostizSettings(input) {
  const base = String(input?.base || '').trim().replace(/\/+$/, '')
  const publicUrl = String(input?.publicUrl || '').trim().replace(/\/+$/, '')
  const key = String(input?.key || '').trim()
  for (const [label, value] of [['Public API URL', base], ['Dashboard URL', publicUrl]]) {
    let url
    try { url = new URL(value) } catch { throw new Error(`Enter a valid Postiz ${label}.`) }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || /(?:^|\.)example\.com$/.test(url.hostname)) throw new Error(`Enter a valid Postiz ${label} without credentials or a query string.`)
  }
  if (!/\/(?:api\/)?public\/v1$/.test(new URL(base).pathname)) throw new Error('The Public API URL must end in /api/public/v1 or /public/v1.')
  if (!key || key.length > 8192 || /[\r\n]/.test(key)) throw new Error('Enter a valid Postiz API key in the secure settings field.')
  return { base, publicUrl, key }
}
export function readOpenOctiPostizSettings(env = process.env) {
  if (!isOpenOcti(env)) return null
  try {
    const record = JSON.parse(fs.readFileSync(settingsPath(env), 'utf8'))
    if (record.version !== 1) throw new Error('version')
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(env), Buffer.from(record.iv, 'base64'))
    decipher.setAuthTag(Buffer.from(record.tag, 'base64'))
    return validatePostizSettings(JSON.parse(Buffer.concat([decipher.update(Buffer.from(record.data, 'base64')), decipher.final()]).toString('utf8')))
  } catch (error) {
    if (error.code === 'ENOENT') return null
    return { error: 'Saved Postiz settings could not be read. Re-enter them in Postiz settings.' }
  }
}
export function saveOpenOctiPostizSettings(input, env = process.env) {
  if (!isOpenOcti(env)) throw new Error('Postiz setup is unavailable in this edition.')
  const previous = readOpenOctiPostizSettings(env)
  const value = validatePostizSettings({ ...input, key: input.key || previous?.key || env.POSTIZ_API_KEY })
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(env), iv)
  const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()])
  const file = settingsPath(env)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const temp = `${file}.${crypto.randomUUID()}.tmp`
  try {
    fs.writeFileSync(temp, JSON.stringify({ version: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), data: data.toString('base64') }), { mode: 0o600 })
    fs.renameSync(temp, file)
  } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp) }
  return { saved: true }
}
