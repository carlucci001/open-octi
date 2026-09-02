import { readData, writeData } from './dataStore'

const FILE = 'release-annotations.json'
const MAX_NOTES = 3000

function readAnnotations() {
  const data = readData(FILE)
  return Array.isArray(data?.annotations) ? data.annotations.filter(row => row?.platformId && row?.releaseId) : []
}

function annotationId(platformId, releaseId) {
  return `release-note:${String(platformId)}:${String(releaseId)}`
}

export function getReleaseAnnotation(platformId, releaseId) {
  return readAnnotations().find(row => row.platformId === String(platformId) && row.releaseId === String(releaseId)) || null
}

export function saveReleaseAnnotation(input = {}, now = new Date().toISOString()) {
  const platformId = String(input.platformId || '').trim()
  const releaseId = String(input.releaseId || '').trim()
  const notes = String(input.notes || '').trim().slice(0, MAX_NOTES)
  if (!platformId || !releaseId) throw new Error('Platform and release are required')
  if (!notes) throw new Error('Annotation notes are required')

  const annotations = readAnnotations()
  const index = annotations.findIndex(row => row.platformId === platformId && row.releaseId === releaseId)
  const previous = index >= 0 ? annotations[index] : null
  const annotation = {
    id: annotationId(platformId, releaseId),
    platformId,
    releaseId,
    notes,
    createdAt: previous?.createdAt || now,
    updatedAt: now,
  }
  if (index >= 0) annotations[index] = annotation
  else annotations.unshift(annotation)
  writeData(FILE, { annotations, lastUpdated: now })
  return annotation
}

export function deleteReleaseAnnotation(input = {}, now = new Date().toISOString()) {
  const platformId = String(input.platformId || '').trim()
  const releaseId = String(input.releaseId || '').trim()
  if (!platformId || !releaseId) throw new Error('Platform and release are required')
  const annotations = readAnnotations()
  const next = annotations.filter(row => row.platformId !== platformId || row.releaseId !== releaseId)
  writeData(FILE, { annotations: next, lastUpdated: now })
  return { deleted: next.length !== annotations.length, platformId, releaseId }
}
