import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const KEYS = ['POSTIZ_JWT_SECRET', 'POSTIZ_DB_PASSWORD', 'POSTIZ_TEMPORAL_DB_PASSWORD']
export function preparePostizEnvironment(root = process.cwd()) {
  const file = path.resolve(root, '.env')
  if (fs.existsSync(file) && (!fs.lstatSync(file).isFile() || fs.lstatSync(file).isSymbolicLink())) throw new Error('The .env path must be a regular file.')
  let contents = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
  let created = 0
  for (const key of KEYS) {
    const expression = new RegExp(`^${key}=([^\\r\\n]*)`, 'm')
    const match = contents.match(expression)
    if (match && match[1].trim()) continue
    const entry = `${key}=${crypto.randomBytes(32).toString('hex')}`
    contents = match ? contents.replace(expression, entry) : `${contents.replace(/\s*$/, '')}\n${entry}\n`
    created++
  }
  if (created) fs.writeFileSync(file, contents.replace(/^\n/, ''), { mode: 0o600 })
  return { created }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const result = preparePostizEnvironment()
    console.log(`Postiz installation secrets ready (${result.created} created; existing values preserved). No secrets displayed.`)
    console.log('Next: docker compose up -d. Open http://localhost:4007 for Postiz, then configure its Public API key in OpenOcti Postiz settings.')
  } catch { console.error('Postiz setup could not write .env. Check its path and permissions.'); process.exitCode = 1 }
}
