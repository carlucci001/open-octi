import crypto from 'node:crypto'
import { readData, writeData } from './dataStore'
import { isOpenOcti } from './edition'
const FILE = 'openocti-postiz-progress.json'
const fingerprint = config => crypto.createHash('sha256').update(`${config.base}\0${config.key}`).digest('hex')
export function postizSetupProgress(config) {
  if (!isOpenOcti() || !config?.key || config.error) return null
  const progress = readData(FILE)
  return progress?.installation === fingerprint(config) && progress?.postId ? progress : null
}
export function recordPostizSetupSchedule(receipt, config) {
  if (!isOpenOcti() || !receipt.postId || !config?.key) return
  writeData(FILE, { installation: fingerprint(config), postId: receipt.postId, scheduledFor: receipt.scheduledFor, acceptedAt: new Date().toISOString(), confirmedPublishedAt: null })
}
export function confirmPostizSetupPublished(config) {
  const progress = postizSetupProgress(config)
  if (!progress) throw new Error('Schedule a test post from this installation before confirming it.')
  writeData(FILE, { ...progress, confirmedPublishedAt: new Date().toISOString() })
}
