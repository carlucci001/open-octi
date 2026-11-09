import { readData } from './dataStore.js'

/** Read the credential vault through the backend's transparent decryption. */
export function readVault() {
  return readData('credentials.json')
}

/** Find one entry by exact name, name pattern, or credential predicate. */
export function findCredential(nameOrMatcher) {
  const credentials = readVault()?.credentials || []
  if (typeof nameOrMatcher === 'function') return credentials.find(nameOrMatcher)
  if (nameOrMatcher instanceof RegExp) {
    const pattern = new RegExp(nameOrMatcher.source, nameOrMatcher.flags.replace(/[gy]/g, ''))
    return credentials.find(entry => pattern.test(String(entry?.name || '')))
  }
  const name = String(nameOrMatcher || '').toLowerCase()
  return credentials.find(entry => String(entry?.name || '').toLowerCase() === name)
}
