import fs from 'node:fs'
import path from 'node:path'
import { loadAll, saveAll } from './entityStore'
import { readData, writeData } from './dataStore'

const ENTITY_TYPES = ['accounts', 'contacts', 'leads', 'opportunities', 'projects', 'tasks', 'activities']
const EXTRA_FILES = [{ file: 'documents.json', key: 'documents' }, { file: 'openocti-calendar-samples.json', key: 'events' }]

function sampleSeed(file) {
  try { return JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data-demo', file), 'utf8')) } catch { return {} }
}

export function openOctiSampleStatus() {
  const setting = readData('openocti-sample-settings.json')
  const count = ENTITY_TYPES.reduce((sum, type) => sum + loadAll(type).filter(record => record.sample === true).length, 0)
    + EXTRA_FILES.reduce((sum, item) => sum + ((readData(item.file)?.[item.key] || []).filter(record => record.sample === true).length), 0)
  return { enabled: setting?.enabled !== false && count > 0, count }
}

export function setOpenOctiSamples(enabled) {
  let changed = 0
  for (const type of ENTITY_TYPES) {
    const current = loadAll(type)
    if (enabled) {
      const seed = sampleSeed(`${type}.json`)[type] || []
      const existingIds = new Set(current.map(record => record.id))
      const additions = seed.filter(record => record.sample === true && !existingIds.has(record.id))
      if (additions.length) { saveAll(type, [...additions, ...current]); changed += additions.length }
    } else {
      const next = current.filter(record => record.sample !== true)
      if (next.length !== current.length) { saveAll(type, next); changed += current.length - next.length }
    }
  }
  for (const { file, key } of EXTRA_FILES) {
    const currentStore = readData(file) || { [key]: [] }; const current = currentStore[key] || []
    if (enabled) {
      const seed = sampleSeed(file)[key] || []; const ids = new Set(current.map(record => record.id)); const additions = seed.filter(record => record.sample === true && !ids.has(record.id))
      if (additions.length) { writeData(file, { ...currentStore, [key]: [...additions, ...current] }); changed += additions.length }
    } else {
      const next = current.filter(record => record.sample !== true)
      if (next.length !== current.length) { writeData(file, { ...currentStore, [key]: next }); changed += current.length - next.length }
    }
  }
  writeData('openocti-sample-settings.json', { enabled: Boolean(enabled), updatedAt: new Date().toISOString() })
  return { ...openOctiSampleStatus(), changed }
}

export function relativeOpenOctiCalendarSamples(now = new Date()) {
  return (readData('openocti-calendar-samples.json')?.events || []).filter(event => event.sample === true).map(event => {
    const start = new Date(now); start.setHours(Number(event.hour || 9), 0, 0, 0); start.setDate(start.getDate() + Number(event.relativeDay || 0))
    const end = new Date(start.getTime() + Number(event.durationMinutes || 45) * 60_000)
    return { ...event, start: start.toISOString(), end: end.toISOString(), status: 'confirmed' }
  })
}
