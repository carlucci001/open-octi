import { pullRestGeneric } from './rest-generic'
import { pullArcgis } from './arcgis'
import { pullSocrata } from './socrata'
import { pullFecCampaigns } from './fec'
import { pullStructuredDownload } from './structured-download'

const adapters = {
  'rest-generic': pullRestGeneric,
  arcgis: pullArcgis,
  socrata: pullSocrata,
  fec: pullFecCampaigns,
  'structured-download': pullStructuredDownload,
}

export function adapterFor(manifest) {
  if (manifest.proving?.status === 'excluded-from-build') throw new Error(`${manifest.name} is excluded from the API-only build`)
  const adapter = adapters[manifest.platform]
  if (!adapter) throw new Error(`No API-only adapter for ${manifest.platform}`)
  return adapter
}

export async function pullLeadSignals(input) {
  return adapterFor(input.manifest)(input)
}

export { LeadSourceNeedsKeyError } from './common'
