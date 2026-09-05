import { readData, writeData } from '@/lib/dataStore'

const FILE = 'operator-agent-conversations.json'

function initial(id) {
  return { id, messages: [], toolEvents: [], pendingProposal: null, approvalGrant: null, interview: null, transcriptDocumentId: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
}

export function loadOperatorConversation(id) {
  const data = readData(FILE) || { conversations: [] }
  return data.conversations?.find(item => item.id === id) || initial(id)
}

export function saveOperatorConversation(state) {
  const data = readData(FILE) || { conversations: [] }
  const list = Array.isArray(data.conversations) ? data.conversations : []
  const next = { ...state, updatedAt: new Date().toISOString() }
  const index = list.findIndex(item => item.id === state.id)
  if (index >= 0) list[index] = next
  else list.push(next)
  writeData(FILE, { conversations: list.slice(-100), lastUpdated: next.updatedAt })
  return next
}

export function createMemoryConversationStore(seed = {}) {
  const states = new Map(Object.entries(seed))
  return {
    load(id) { return states.get(id) || initial(id) },
    save(state) { states.set(state.id, state); return state },
  }
}

export const persistentConversationStore = { load: loadOperatorConversation, save: saveOperatorConversation }
