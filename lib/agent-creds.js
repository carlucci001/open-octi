import { readData, writeData } from '@/lib/dataStore'

function fieldVal(cred, labelRx) {
  const f = (cred?.fields || []).find(x => labelRx.test(x.label || ''))
  if (f?.value?.trim()) return f.value.trim()
  const fallback = (cred?.fields || []).find(x => String(x.value || '').trim())
  return fallback?.value?.trim() || ''
}

export function getCred(nameMatch) {
  const data = readData('credentials.json') || { credentials: [] }
  const n = nameMatch.toLowerCase()
  const cred = data.credentials.find(c => c.name.toLowerCase().includes(n))
  if (!cred) return null
  return {
    key: fieldVal(cred, /key|token|api/i),
    fields: cred.fields,
  }
}

export function upsertCredential({ name, category = 'AI Providers', fields = [], notes = '' }) {
  if (!name) throw new Error('credential name required')
  const data = readData('credentials.json') || { credentials: [] }
  data.credentials = Array.isArray(data.credentials) ? data.credentials : []
  const existing = data.credentials.find(c => String(c.name || '').toLowerCase() === String(name).toLowerCase())
    || data.credentials.find(c => String(c.name || '').toLowerCase().includes(String(name).toLowerCase()))
  const credential = {
    ...(existing || {}),
    id: existing?.id || `cred_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    name,
    category,
    fields,
    notes,
    updatedAt: new Date().toISOString(),
  }
  if (existing) {
    const idx = data.credentials.findIndex(c => c.id === existing.id)
    data.credentials[idx] = credential
  } else {
    data.credentials.push(credential)
  }
  data.lastUpdated = new Date().toISOString()
  writeData('credentials.json', data)
  return { id: credential.id, name: credential.name, category: credential.category, fieldCount: credential.fields.length }
}
