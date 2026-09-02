/**
 * Conference store — meetings + saved rooms.
 *
 * Backed by data/conference.json today via dataStore (which automatically
 * redirects to data-demo/ when demo mode is on, so demo flows never see real
 * meetings and vice versa).
 *
 * Designed for a clean Firebase port:
 *   - Each record has an `ownerUid` field reserved for Firestore auth scoping.
 *   - IDs are UUID-ish strings, no array-index dependence.
 *   - Status is a single string field (`scheduled | live | ended`), so a
 *     Firestore query like where('status', '==', 'live') drops in.
 *   - Meeting + Room are two separate top-level arrays, mirroring the two
 *     Firestore collections we'll create tonight.
 *
 * Caller surface is intentionally narrow — the API route is the only client.
 */
import { readData, writeData } from './dataStore'

const FILE = 'conference.json'
const VERSION = 1

function load() {
  const data = readData(FILE)
  if (data && data.__version) return data
  return { __version: VERSION, meetings: [], rooms: [] }
}

function save(data) {
  data.__version = VERSION
  data.lastUpdated = new Date().toISOString()
  writeData(FILE, data)
}

function genId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}

function nowISO() { return new Date().toISOString() }

// -------- Meetings --------

export function listMeetings(filter = {}) {
  const data = load()
  let list = data.meetings || []
  if (filter.status) list = list.filter(m => m.status === filter.status)
  if (filter.linkedToId) {
    list = list.filter(m =>
      m.linkedTo?.leadId === filter.linkedToId ||
      m.linkedTo?.accountId === filter.linkedToId ||
      m.linkedTo?.contactId === filter.linkedToId ||
      m.linkedTo?.projectId === filter.linkedToId
    )
  }
  if (filter.fromTime) {
    const cutoff = new Date(filter.fromTime).getTime()
    list = list.filter(m => {
      const t = new Date(m.scheduledAt || m.startedAt || m.createdAt).getTime()
      return t >= cutoff
    })
  }
  // Default sort: scheduled time, fallback created time, descending (newest first)
  list = [...list].sort((a, b) => {
    const at = new Date(a.scheduledAt || a.startedAt || a.createdAt).getTime()
    const bt = new Date(b.scheduledAt || b.startedAt || b.createdAt).getTime()
    return bt - at
  })
  return list
}

export function getMeeting(id) {
  return load().meetings.find(m => m.id === id) || null
}

export function createMeeting(input = {}) {
  const data = load()
  const now = nowISO()
  const meeting = {
    id: input.id || genId('mtg'),
    ownerUid: null,
    title: input.title || 'Untitled meeting',
    type: input.type || 'instant',           // 'instant' | 'scheduled' | 'recurring'
    room: input.room || null,
    url: input.url || null,
    scheduledAt: input.scheduledAt || null,
    startedAt: input.type === 'instant' ? now : null,
    endedAt: null,
    durationMinutes: input.durationMinutes || 30,
    participants: Array.isArray(input.participants) ? input.participants : [],
    linkedTo: input.linkedTo || {},
    status: input.type === 'instant' ? 'live' : 'scheduled',
    pinned: false,
    notes: input.notes || '',
    createdAt: now,
    updatedAt: now,
  }
  data.meetings.push(meeting)
  save(data)
  return meeting
}

export function updateMeeting(id, patch = {}) {
  const data = load()
  const idx = data.meetings.findIndex(m => m.id === id)
  if (idx < 0) throw new Error(`Meeting not found: ${id}`)
  const existing = data.meetings[idx]
  // Shallow merge with linkedTo deep-merged
  const next = {
    ...existing,
    ...patch,
    linkedTo: { ...(existing.linkedTo || {}), ...(patch.linkedTo || {}) },
    updatedAt: nowISO(),
  }
  data.meetings[idx] = next
  save(data)
  return next
}

export function startMeeting(id) {
  return updateMeeting(id, { status: 'live', startedAt: nowISO() })
}

export function endMeeting(id, { notes } = {}) {
  return updateMeeting(id, { status: 'ended', endedAt: nowISO(), ...(notes ? { notes } : {}) })
}

export function deleteMeeting(id) {
  const data = load()
  const before = data.meetings.length
  data.meetings = data.meetings.filter(m => m.id !== id)
  save(data)
  return { ok: true, removed: before - data.meetings.length }
}

// -------- Rooms (saved/persistent) --------

export function listRooms() {
  const data = load()
  // Pinned first, then most-recently-used
  return [...(data.rooms || [])].sort((a, b) => {
    if ((b.isPinned ? 1 : 0) !== (a.isPinned ? 1 : 0)) return (b.isPinned ? 1 : 0) - (a.isPinned ? 1 : 0)
    const at = new Date(a.lastUsedAt || a.createdAt).getTime()
    const bt = new Date(b.lastUsedAt || b.createdAt).getTime()
    return bt - at
  })
}

export function createRoom(input = {}) {
  if (!input.name || !input.url) throw new Error('createRoom requires name + url')
  const data = load()
  const now = nowISO()
  const room = {
    id: input.id || genId('rm'),
    ownerUid: null,
    name: input.name,
    slug: input.slug || input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    url: input.url,
    isPinned: !!input.isPinned,
    useCount: 0,
    lastUsedAt: now,
    linkedTo: input.linkedTo || {},
    createdAt: now,
  }
  data.rooms.push(room)
  save(data)
  return room
}

export function updateRoom(id, patch = {}) {
  const data = load()
  const idx = data.rooms.findIndex(r => r.id === id)
  if (idx < 0) throw new Error(`Room not found: ${id}`)
  data.rooms[idx] = { ...data.rooms[idx], ...patch }
  save(data)
  return data.rooms[idx]
}

export function deleteRoom(id) {
  const data = load()
  const before = data.rooms.length
  data.rooms = data.rooms.filter(r => r.id !== id)
  save(data)
  return { ok: true, removed: before - data.rooms.length }
}

export function bumpRoomUse(id) {
  const data = load()
  const room = data.rooms.find(r => r.id === id)
  if (!room) return null
  room.useCount = (room.useCount || 0) + 1
  room.lastUsedAt = nowISO()
  save(data)
  return room
}
