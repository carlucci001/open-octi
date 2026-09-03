import fs from 'node:fs'
import path from 'node:path'
import { readData, writeData } from './dataStore'

const PROFILE_FILE = 'openocti-profile.json'

export function normalizeOpenOctiProfile(value = {}) {
  return {
    businessName: String(value.businessName || '').trim().slice(0, 120),
    ownerName: String(value.ownerName || '').trim().slice(0, 120),
    phone: String(value.phone || '').trim().slice(0, 40),
    website: String(value.website || '').trim().slice(0, 240),
  }
}

export function getOpenOctiProfile(env = process.env) {
  const saved = normalizeOpenOctiProfile(readData(PROFILE_FILE) || {})
  const profile = {
    businessName: saved.businessName || String(env.OPENOCTI_BUSINESS_NAME || '').trim(),
    ownerName: saved.ownerName || String(env.OPENOCTI_OWNER_NAME || '').trim(),
    phone: saved.phone,
    website: saved.website,
  }
  return { ...profile, complete: Boolean(profile.businessName && profile.ownerName) }
}

export function applyOpenOctiProfile(stateDir, value) {
  const profile = normalizeOpenOctiProfile(value)
  if (!profile.businessName || !profile.ownerName || !stateDir || !fs.existsSync(stateDir)) return 0
  const workspaceRoot = path.join(stateDir, 'workspace')
  if (!fs.existsSync(workspaceRoot)) return 0
  let changed = 0
  const pending = [workspaceRoot]
  while (pending.length) {
    const current = pending.pop()
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const file = path.join(current, entry.name)
      if (entry.isDirectory()) pending.push(file)
      else if (entry.name.endsWith('.md')) {
        const source = fs.readFileSync(file, 'utf8')
        const next = source
          .replaceAll('{{business_name}}', profile.businessName)
          .replaceAll('{{owner_name}}', profile.ownerName)
          .replaceAll('Your business', profile.businessName)
          .replaceAll('the owner', profile.ownerName)
        if (next !== source) {
          fs.writeFileSync(file, next)
          changed += 1
        }
      }
    }
  }
  return changed
}

export function saveOpenOctiProfile(value, env = process.env) {
  const profile = normalizeOpenOctiProfile(value)
  if (!profile.businessName || !profile.ownerName) throw new Error('Business name and owner name are required.')
  writeData(PROFILE_FILE, { ...profile, configuredAt: new Date().toISOString() })
  const configPath = String(env.OPENCLAW_CONFIG_PATH || '').trim()
  const stateDir = configPath ? path.dirname(configPath) : ''
  const updatedWorkspaceFiles = applyOpenOctiProfile(stateDir, profile)
  return { ...profile, complete: true, updatedWorkspaceFiles }
}
