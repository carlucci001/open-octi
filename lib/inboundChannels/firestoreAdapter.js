// Firestore adapter for inbound channels.
// Listens on a configurable collection where { [statusField]: newValue },
// imports each new doc, and updates the source doc to importedValue so it
// won't be reprocessed. Survives Next.js HMR via a shared registry.
import path from 'path'
import fs from 'fs'
import { initializeApp, cert, getApps, deleteApp } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { insertLeadFromChannel } from './leadInsert'

function loadServiceAccount(relPath) {
  const abs = path.isAbsolute(relPath) ? relPath : path.join(process.cwd(), relPath)
  if (!fs.existsSync(abs)) throw new Error(`Service account file missing at ${abs}`)
  return JSON.parse(fs.readFileSync(abs, 'utf8'))
}

function ensureFirebaseApp(channel) {
  const appName = `inbound-${channel.id}`
  const existing = getApps().find(a => a.name === appName)
  if (existing) return existing
  const sa = loadServiceAccount(channel.config.serviceAccountFile)
  return initializeApp({
    credential: cert(sa),
    projectId: channel.config.projectId || sa.project_id,
  }, appName)
}

function teardownFirebaseApp(channel) {
  const appName = `inbound-${channel.id}`
  const existing = getApps().find(a => a.name === appName)
  if (existing) {
    try { deleteApp(existing) } catch {}
  }
}

function payloadFromDoc(channel, doc) {
  const data = doc.data() || {}
  const map = channel.config.fieldMap || {}
  const pick = (key) => data[map[key] || key]

  // Defensive timestamp handling
  let preferredTime = pick('preferredTime') || null
  if (preferredTime?.toDate) preferredTime = preferredTime.toDate().toISOString()
  else if (preferredTime?._seconds) preferredTime = new Date(preferredTime._seconds * 1000).toISOString()

  return {
    name: pick('name') || '',
    email: pick('email') || '',
    phone: pick('phone') || '',
    company: pick('company') || '',
    title: pick('title') || '',
    preferredTime,
    message: pick('message') || '',
    tags: pick('tags') || [],
    _sourceMeta: data.meta || data.sourceMeta || null,
  }
}

export function startFirestoreChannel(channel, state) {
  const cfg = channel.config || {}
  const statusField = cfg.statusField || 'status'
  const newValue = cfg.newValue || 'new'
  const importedValue = cfg.importedValue || 'imported'

  const app = ensureFirebaseApp(channel)
  const db = getFirestore(app)

  const unsub = db.collection(cfg.collection)
    .where(statusField, '==', newValue)
    .onSnapshot(async (snap) => {
      state.lastEventAt = new Date().toISOString()
      for (const change of snap.docChanges()) {
        if (change.type !== 'added') continue
        try {
          const payload = payloadFromDoc(channel, change.doc)
          const sourceMeta = payload._sourceMeta
          delete payload._sourceMeta
          const result = await insertLeadFromChannel({
            channel,
            payload,
            externalId: change.doc.id,
            sourceMeta,
          })
          if (result.skipped) state.skippedCount++
          else if (result.lead) {
            state.importedCount++
            state.lastImported = {
              at: new Date().toISOString(),
              name: result.lead.name,
              email: result.lead.email,
              externalId: change.doc.id,
              leadId: result.lead.id,
            }
          }
          await change.doc.ref.update({
            [statusField]: importedValue,
            importedAt: FieldValue.serverTimestamp(),
          })
        } catch (err) {
          state.errorCount++
          state.lastError = `${new Date().toISOString()}: ${err.message}`
          console.error(`[channel:${channel.id}] import error:`, err.message)
        }
      }
    }, (err) => {
      state.errorCount++
      state.lastError = `${new Date().toISOString()}: snapshot error — ${err.message}`
      console.error(`[channel:${channel.id}] snapshot error:`, err.message)
    })

  return {
    unsubscribe: () => {
      try { unsub() } catch {}
      teardownFirebaseApp(channel)
    },
  }
}
