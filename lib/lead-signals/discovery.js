import zipcodes from 'zipcodes'
import { fetchJson } from './adapters/common'
import { refreshLeadSourceRegistry, upsertDiscoveredManifest } from './registry'

const FIELD_PATTERNS = {
  name: [/^(?:owner|ownname|own_name|owner1)$/i, /owner|business|licensee|applicant|contractor|company|name/i],
  line1: [/^(?:mailadd|mail_address|mailing_address|maddr.*|maddstr)$/i, /^address$/i, /^careof$/i, /address|street|site.*addr|situs.*addr|property.*addr|location/i],
  city: [/^(?:mcity|mail_city|mailing_city)$/i, /^cityname$/i, /city/i],
  state: [/^(?:mstate|mail_state|mailing_state)$/i, /(?:^|_)state$|state_abbr|^st$/i],
  zip: [/^(?:mzip|mail_zip|mailing_zip)$/i, /^zipcode$/i, /zip|postal/i],
  triggeredAt: [/^(?:deeddate|saledate|sale_date)$/i, /most.*issued|recent.*issue|date.*issued|issue.*date|issued|sale.*date|deed.*date|update.*date|modified|created|record_status|permit.*date/i],
  externalId: [/(?:^|_)id$|objectid|globalid|pin|parcel.*id|permit.*id|license.*id|record.*id/i],
  price: [/^(?:saleprice|sale_price|parval)$/i, /^(?:job_value|valuation|project_value)$/i],
}

function slug(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70)
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)) }

function fieldMap(names = []) {
  const fields = {}
  for (const [target, patterns] of Object.entries(FIELD_PATTERNS)) {
    fields[target] = patterns.reduce((match, pattern) => match || names.find(name => pattern.test(String(name))), null) || null
  }
  if (!fields.externalId) fields.externalId = names.find(name => /id|number|num/i.test(String(name))) || names[0] || 'id'
  if (!fields.name) fields.name = names.find(name => /owner|business|applicant|contractor|name/i.test(String(name))) || fields.externalId
  fields.triggeredAt = names.find(name => /most.*issued|recent.*issue|date.*issued|update.*date|last.*modified/i.test(String(name))) || fields.triggeredAt
  return fields
}

function triggerFor(name) {
  const text = String(name || '').toLowerCase()
  if (/parcel|property|deed|sale/.test(text)) return 'new-homeowner'
  if (/license/.test(text)) return 'new-license'
  return 'permit'
}

function deepUrls(value, out = []) {
  if (typeof value === 'string' && /^https?:\/\//i.test(value)) out.push(value)
  else if (Array.isArray(value)) value.forEach(item => deepUrls(item, out))
  else if (value && typeof value === 'object') Object.values(value).forEach(item => deepUrls(item, out))
  return out
}

export async function zipJurisdiction(zip) {
  const cleanZip = String(zip || '').trim()
  if (!/^\d{5}$/.test(cleanZip)) throw new Error('A valid five-digit ZIP is required')
  const local = zipcodes.lookup(cleanZip)
  if (!local) throw new Error(`ZIP ${cleanZip} is not in the local US ZIP index`)
  const endpoint = new URL('https://geocoding.geo.census.gov/geocoder/geographies/coordinates')
  endpoint.searchParams.set('x', String(local.longitude))
  endpoint.searchParams.set('y', String(local.latitude))
  endpoint.searchParams.set('benchmark', 'Public_AR_Current')
  endpoint.searchParams.set('vintage', 'Current_Current')
  endpoint.searchParams.set('format', 'json')
  let county = null
  let censusError = null
  for (let attempt = 0; attempt < 2 && !county; attempt += 1) {
    try {
      const payload = await fetchJson(endpoint.toString(), {}, 12000)
      county = payload?.result?.geographies?.Counties?.[0] || null
    } catch (error) {
      censusError = error
    }
    if (!county && attempt === 0) await sleep(250)
  }
  if (!county) {
    await sleep(200)
    const fallback = new URL('https://geo.fcc.gov/api/census/area')
    fallback.searchParams.set('lat', String(local.latitude))
    fallback.searchParams.set('lon', String(local.longitude))
    fallback.searchParams.set('format', 'json')
    const payload = await fetchJson(fallback.toString(), {}, 12000)
    const area = payload?.results?.[0]
    if (!area?.county_fips) throw new Error(`Government geocoders did not return a county for ZIP ${cleanZip}: ${censusError?.message || 'no county match'}`)
    county = {
      NAME: area.county_name,
      BASENAME: area.county_name,
      GEOID: area.county_fips,
      STATE: String(area.county_fips).slice(0, 2),
      COUNTY: String(area.county_fips).slice(2),
    }
  }
  return {
    zip: cleanZip,
    city: local.city,
    state: local.state,
    county: String(county.NAME || county.BASENAME || '').replace(/ County$/i, ''),
    countyFips: county.GEOID || `${county.STATE || ''}${county.COUNTY || ''}`,
    stateFips: county.STATE || String(county.GEOID || '').slice(0, 2),
  }
}

function candidateBase({ jurisdiction, platform, endpoint, datasetId, name, fields, request, catalog }) {
  const trigger = triggerFor(name)
  return {
    id: slug(`${jurisdiction.state}-${jurisdiction.county}-${platform}-${datasetId}`),
    name,
    level: 'county',
    coverage: [`${jurisdiction.state}-${jurisdiction.county}`],
    triggers: [trigger],
    verticals: trigger === 'new-homeowner' ? ['home-services', 'real-estate', 'insurance-agencies'] : ['home-services', 'remodeling-specialty-trades', 'restaurants-hospitality'],
    platform,
    tier: 'A',
    endpoint,
    request,
    fields,
    auth: { type: 'none' },
    cadence: 'unknown',
    compliance: { channels: trigger === 'new-homeowner' ? ['mail', 'email-b2c'] : ['mail', 'email-b2b', 'manual-phone'], dppa: false, fcra: false, tosReviewedAt: new Date().toISOString().slice(0, 10), tosVerdict: 'catalog-discovered-public-api' },
    proving: { thresholds: trigger === 'new-homeowner' ? { geoPrecision: 0.8, mailAddress: 0.95 } : { geoPrecision: 0.8, mailAddress: 0.6 }, status: 'candidate' },
    discovered: true,
    excludedReason: null,
    discovery: { ...jurisdiction, catalog, discoveredAt: new Date().toISOString() },
    links: [`[[trigger/${trigger}]]`, `[[jurisdiction/${jurisdiction.state}-${jurisdiction.county}]]`, `[[platform/${platform}]]`],
    notes: `Discovered for ZIP ${jurisdiction.zip} through the ${catalog} public catalog. Review the field map and run Proving Ground before use.`,
  }
}

async function arcgisCandidates(jurisdiction, limit) {
  const hits = []
  for (const term of ['parcels', 'permits', 'business licenses']) {
    const url = new URL('https://hub.arcgis.com/api/search/v1/collections/dataset/items')
    url.searchParams.set('q', `${jurisdiction.county} County ${term}`)
    url.searchParams.set('limit', '3')
    const payload = await fetchJson(url.toString(), {}, 15000)
    const rows = payload.data || payload.features || payload.items || []
    hits.push(...rows.filter(hit => new RegExp(term.replace('business licenses', 'license'), 'i').test(hit.name || hit.properties?.title || '')).slice(0, 1))
    await sleep(150)
  }
  const candidates = []
  for (const hit of [...new Map(hits.map(item => [item.id || item.properties?.id, item])).values()].slice(0, limit)) {
    const detailUrl = deepUrls(hit).find(value => /hub\.arcgis\.com\/api\/search\/v1\/collections\/dataset\/items\//i.test(value))
    const detail = detailUrl ? await fetchJson(detailUrl, {}, 12000) : hit
    let endpoint = deepUrls(detail).find(value => /\/(?:FeatureServer|MapServer)\/\d+(?:\?|$)/i.test(value))
      || deepUrls(detail).find(value => /\/(?:FeatureServer|MapServer)(?:\?|$)/i.test(value))
    if (!endpoint) continue
    endpoint = endpoint.replace(/\?.*$/, '').replace(/\/$/, '')
    await sleep(125)
    let metadata = await fetchJson(`${endpoint}?f=json`, {}, 12000)
    if (!metadata.fields?.length && metadata.layers?.length) {
      endpoint = `${endpoint}/${metadata.layers[0].id}`
      metadata = await fetchJson(`${endpoint}?f=json`, {}, 12000)
    }
    const fields = fieldMap((metadata.fields || []).map(field => field.name))
    const datasetId = hit.id || hit.properties?.id || slug(metadata.name || endpoint)
    const name = metadata.name || hit.name || hit.properties?.title || `ArcGIS ${jurisdiction.county} public records`
    candidates.push(candidateBase({ jurisdiction, platform: 'arcgis', endpoint, datasetId, name, fields, request: { method: 'GET', where: '1=1', dateFilter: true, outFields: '*', orderByFields: fields.triggeredAt ? `${fields.triggeredAt} DESC` : '', pageSize: 100 }, catalog: 'ArcGIS Hub' }))
  }
  return candidates
}

async function socrataCandidates(jurisdiction, limit) {
  const hits = []
  for (const term of ['parcels', 'permits', 'business licenses']) {
    const url = new URL('https://api.us.socrata.com/api/catalog/v1')
    url.searchParams.set('q', `${jurisdiction.county} County ${term}`)
    url.searchParams.set('limit', '4')
    const payload = await fetchJson(url.toString(), {}, 15000)
    const relevant = (payload.results || []).find(hit => {
      const text = `${hit.resource?.name || ''} ${hit.resource?.description || ''} ${hit.metadata?.domain || ''}`
      return new RegExp(`${jurisdiction.county}|${jurisdiction.city}`, 'i').test(text)
        && new RegExp(term.replace('business licenses', 'license'), 'i').test(text)
    })
    if (relevant) hits.push(relevant)
    await sleep(150)
  }
  const candidates = []
  for (const hit of hits.slice(0, limit)) {
    const domain = hit.metadata?.domain
    const datasetId = hit.resource?.id
    if (!domain || !datasetId) continue
    const endpoint = `https://${domain}/resource/${datasetId}.json`
    const fields = fieldMap(hit.resource?.columns_field_name || [])
    candidates.push(candidateBase({ jurisdiction, platform: 'socrata', endpoint, datasetId, name: hit.resource?.name || `Socrata ${jurisdiction.county} public records`, fields, request: { method: 'GET', where: fields.zip ? `${fields.zip}='${jurisdiction.zip}'` : '', order: fields.triggeredAt ? `${fields.triggeredAt} DESC` : '' }, catalog: 'Socrata' }))
  }
  return candidates
}

export async function discoverLocalSources({ zip, limitPerCatalog = 3, persist = true, index = true, jurisdiction: suppliedJurisdiction } = {}) {
  const jurisdiction = suppliedJurisdiction || await zipJurisdiction(zip)
  const candidates = []
  const errors = []
  for (const [catalog, discover] of [['arcgis', arcgisCandidates], ['socrata', socrataCandidates]]) {
    try { candidates.push(...await discover(jurisdiction, limitPerCatalog)) }
    catch (error) { errors.push({ catalog, error: error.message }) }
    await sleep(200)
  }
  const unique = [...new Map(candidates.map(candidate => [candidate.endpoint, candidate])).values()]
  if (persist) {
    unique.forEach(upsertDiscoveredManifest)
    if (unique.length && index) await refreshLeadSourceRegistry()
  }
  return { jurisdiction, candidates: unique, errors }
}

export { fieldMap }
