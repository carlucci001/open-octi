import { pullRestGeneric } from './rest-generic'
import { pullArcgis } from './arcgis'
import { pullSocrata } from './socrata'
import { pullFecCampaigns } from './fec'
import { pullStructuredDownload } from './structured-download'

async function pullBulkFileLazy(input) {
  const { pullBulkFile } = await import('./bulk-file')
  return pullBulkFile(input)
}

const adapters = {
  'rest-generic': pullRestGeneric,
  arcgis: pullArcgis,
  socrata: pullSocrata,
  fec: pullFecCampaigns,
  'structured-download': pullStructuredDownload,
  'bulk-file': pullBulkFileLazy,
}

export function adapterFor(manifest) {
  if (manifest.proving?.status === 'excluded-from-build') throw new Error(`${manifest.name} is excluded from the API-only build`)
  const adapter = adapters[manifest.platform]
  if (!adapter) throw new Error(`No lead-source adapter for ${manifest.platform}`)
  return adapter
}

export async function pullLeadSignals(input) {
  return adapterFor(input.manifest)(input)
}

export { LeadSourceNeedsKeyError } from './common'
