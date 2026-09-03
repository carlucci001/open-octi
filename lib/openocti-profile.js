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
    firstLoginCompletedAt: String(value.firstLoginCompletedAt || '').trim(),
    firstRunDismissed: value.firstRunDismissed === true,
    firstRunVisitedAgentsAt: String(value.firstRunVisitedAgentsAt || '').trim(),
    firstRunImportOpenedAt: String(value.firstRunImportOpenedAt || '').trim(),
  }
}

export function getOpenOctiProfile(env = process.env) {
  const saved = normalizeOpenOctiProfile(readData(PROFILE_FILE) || {})
  const profile = {
    businessName: saved.businessName || String(env.OPENOCTI_BUSINESS_NAME || '').trim(),
    ownerName: saved.ownerName || String(env.OPENOCTI_OWNER_NAME || '').trim(),
    phone: saved.phone,
    website: saved.website,
    firstLoginCompletedAt: saved.firstLoginCompletedAt,
    firstRunDismissed: saved.firstRunDismissed,
    firstRunVisitedAgentsAt: saved.firstRunVisitedAgentsAt,
    firstRunImportOpenedAt: saved.firstRunImportOpenedAt,
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
  const existing = normalizeOpenOctiProfile(readData(PROFILE_FILE) || {})
  writeData(PROFILE_FILE, {
    ...existing,
    businessName: profile.businessName,
    ownerName: profile.ownerName,
    phone: profile.phone,
    website: profile.website,
    configuredAt: new Date().toISOString(),
  })
  const configPath = String(env.OPENCLAW_CONFIG_PATH || '').trim()
  const stateDir = configPath ? path.dirname(configPath) : ''
  const updatedWorkspaceFiles = applyOpenOctiProfile(stateDir, profile)
  return { ...profile, complete: true, updatedWorkspaceFiles }
}

export function updateOpenOctiFirstRun(action, now = new Date()) {
  const existing = normalizeOpenOctiProfile(readData(PROFILE_FILE) || {})
  const updated = { ...existing }
  if (action === 'visit-agents') updated.firstRunVisitedAgentsAt ||= now.toISOString()
  else if (action === 'open-import') updated.firstRunImportOpenedAt ||= now.toISOString()
  else if (action === 'dismiss') updated.firstRunDismissed = true
  else throw new Error('Unsupported setup action')
  writeData(PROFILE_FILE, updated)
  return getOpenOctiProfile()
}

export function markOpenOctiFirstLoginComplete(now = new Date()) {
  const existing = normalizeOpenOctiProfile(readData(PROFILE_FILE) || {})
  const firstLoginCompletedAt = existing.firstLoginCompletedAt || now.toISOString()
  writeData(PROFILE_FILE, { ...existing, firstLoginCompletedAt })
  return { ...getOpenOctiProfile(), firstLoginCompletedAt }
}
