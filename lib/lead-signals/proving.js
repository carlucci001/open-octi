import fs from 'node:fs'
import path from 'node:path'
import { create, loadAll, update } from '@/lib/entityStore'
import { pullLeadSignals, LeadSourceNeedsKeyError } from './adapters'
import { zipJurisdiction } from './discovery'
import { getLeadSource, LEAD_SOURCE_ROOT, loadLeadSourceRegistry } from './registry'

function ratio(rows, predicate) {
  return rows.length ? rows.filter(predicate).length / rows.length : 0
}

function cadenceDays(cadence = '') {
  const value = String(cadence).toLowerCase()
  if (/real-time|same-day|daily|live/.test(value)) return 1
  if (/weekly/.test(value)) return 7
  if (/monthly/.test(value)) return 31
  if (/quarter/.test(value)) return 92
  return 45
}

function identityKeys(value) {
  const entity = value.entity || value
  return [entity.phone, entity.website, entity.name && entity.address?.zip ? `${entity.name}|${entity.address.zip}` : null]
    .filter(Boolean)
    .map(item => String(item).toLowerCase().replace(/[^a-z0-9|]/g, ''))
}

export function computeScorecard({ manifest, rows, stats = {}, existingLeads = [], now = new Date() }) {
  const dated = rows.map(row => row.triggeredAt && new Date(row.triggeredAt)).filter(date => date && !Number.isNaN(date.getTime()))
  const newest = dated.sort((a, b) => b - a)[0] || null
  const ageDays = newest ? Math.max(0, (now.getTime() - newest.getTime()) / 86400000) : null
  const freshness = newest ? Math.max(0, Math.min(1, 1 - ageDays / (cadenceDays(manifest.cadence) * 2))) : 0
  const catalogCountyCoverage = Boolean(manifest.discovered && manifest.discovery?.countyFips)
  const geoPrecision = ratio(rows, row => catalogCountyCoverage || Boolean(row.entity?.address?.zip || row.entity?.address?.county || row.entity?.address?.state))
  const contactability = ratio(rows, row => Boolean(row.entity?.phone || row.entity?.website))
  const mailAddress = ratio(rows, row => Boolean(row.entity?.address?.line1 && row.entity?.address?.city && row.entity?.address?.state && row.entity?.address?.zip))
  const leadKeys = new Set(existingLeads.flatMap(identityKeys))
  const crmOverlap = ratio(rows, row => identityKeys(row).some(key => leadKeys.has(key)))
  const dimensions = {
    reachability: stats.reachability === true ? 1 : 0,
    freshness,
    volume: Math.min(1, rows.length / 25),
    geoPrecision,
    contactability,
    mailAddress,
    novelty: 1 - crmOverlap,
    cost: 1,
    compliance: manifest.compliance?.dppa || manifest.compliance?.fcra ? 0 : 1,
  }
  const score = Math.round(Object.values(dimensions).reduce((sum, value) => sum + value, 0) / Object.keys(dimensions).length * 100)
  const thresholds = manifest.proving?.thresholds || {}
  const usesMail = thresholds.mailAddress !== undefined
  const passed = rows.length > 0 && dimensions.reachability === 1 && dimensions.compliance === 1
    && dimensions.geoPrecision >= (thresholds.geoPrecision ?? 0.8)
    && (usesMail ? dimensions.mailAddress >= thresholds.mailAddress : dimensions.contactability >= (thresholds.contactability ?? 0.4))
    && (thresholds.freshness === 0 || (newest ? ageDays <= cadenceDays(manifest.cadence) * 2 : false))
  return {
    score,
    dimensions,
    thresholds,
    passed,
    newestRecordAt: newest?.toISOString() || null,
    ageDays: ageDays === null ? null : Math.round(ageDays * 10) / 10,
    sampleSize: rows.length,
  }
}

function writeProvingNote(validation) {
  const stamp = validation.createdAt.replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')
  const dir = path.join(LEAD_SOURCE_ROOT, '_proving', validation.sourceId)
  fs.mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `${stamp}.md`)
  const rows = Object.entries(validation.scorecard.dimensions).map(([key, value]) => `| ${key} | ${(value * 100).toFixed(1)}% |`).join('\n')
  const mapped = Object.entries(validation.fieldMapPreview.mapped).map(([target, source]) => `${target} -> ${Array.isArray(source) ? source.join(' | ') : source}`).join(', ')
  const retries = validation.adapterStats.retryLadder?.map(step => `- ${step.mode}: ${step.outcome}${step.rows === undefined ? '' : ` (${step.rows} rows)`}${step.message ? ` - ${step.message}` : ''}`).join('\n') || '- Not applicable'
  fs.writeFileSync(file, `# ${validation.sourceName} proving run\n\n- Jurisdiction: ${validation.jurisdiction.label || validation.jurisdiction.zip || validation.jurisdiction.state || 'US'}\n- Status: ${validation.status}\n- Score: ${validation.scorecard.score}/100\n- Sample: ${validation.scorecard.sampleSize}\n- Field map: ${mapped || 'none'}\n- Coverage: mailAddress ${(validation.fieldMapPreview.ratios.mailAddress * 100).toFixed(1)}%; geoPrecision ${(validation.fieldMapPreview.ratios.geoPrecision * 100).toFixed(1)}%\n\n## Adapter retry ladder\n\n${retries}\n\n| Dimension | Result |\n|---|---:|\n${rows}\n\n[[${validation.sourceId}]]\n`)
  return file
}

export async function persistLeadSourceValidation(validation, { index = false } = {}) {
  const record = create('sourceValidations', validation)
  const persisted = { ...validation, id: record.id, updatedAt: record.updatedAt }
  persisted.note = writeProvingNote(persisted)
  update('sourceValidations', record.id, { note: persisted.note })
  loadLeadSourceRegistry({ force: true })
  if (index) {
    const { indexVault } = await import('@/lib/fkl-index')
    await indexVault('lead-sources', LEAD_SOURCE_ROOT, '')
  }
  return persisted
}

export async function proveLeadSource({ sourceId, jurisdiction = {}, since, limit = 50, pull = pullLeadSignals, persist = true, index = false, onProgress } = {}) {
  const manifest = getLeadSource(sourceId, { syncStore: persist })
  if (!manifest) throw new Error(`Unknown lead source: ${sourceId}`)
  if (manifest.proving?.status === 'excluded-from-build') throw new Error(`${manifest.name} is excluded from the API-only build`)
  const requestText = JSON.stringify(manifest.request || {})
  const needsCountyContext = manifest.platform === 'fec' || /\{(?:countyFips|stateFips|county|state)\}/.test(requestText)
  const resolvedJurisdiction = jurisdiction.zip && needsCountyContext && !jurisdiction.countyFips
    ? { ...await zipJurisdiction(jurisdiction.zip), ...jurisdiction }
    : jurisdiction
  onProgress?.({ phase: 'fetching', completed: 0, total: 1, label: `Sampling ${manifest.name}` })
  let result
  try {
    result = await pull({
      manifest,
      jurisdiction: resolvedJurisdiction,
      since,
      limit: Math.min(Number(limit) || 50, 200),
      proving: true,
      onProgress,
    })
  } catch (error) {
    if (error instanceof LeadSourceNeedsKeyError || error?.code === 'needs-key') throw error
    const wrapped = new Error(`Could not prove ${manifest.name}: ${error.message}`)
    wrapped.code = 'unreachable'
    throw wrapped
  }
  onProgress?.({ phase: 'scoring', completed: result.rows.length, total: result.rows.length || 1, label: 'Scoring bounded sample' })
  const scorecard = computeScorecard({ manifest, rows: result.rows, stats: result.stats, existingLeads: persist ? loadAll('leads') : [] })
  const validation = {
    sourceId,
    sourceName: manifest.name,
    jurisdiction: resolvedJurisdiction,
    status: scorecard.passed ? 'proven' : 'rejected',
    score: scorecard.score,
    scorecard,
    adapterStats: result.stats,
    fieldMapPreview: {
      mapped: Object.fromEntries(Object.entries(manifest.fields || {}).filter(([, source]) => source !== null && source !== undefined && source !== '')),
      ratios: {
        mailAddress: scorecard.dimensions.mailAddress,
        geoPrecision: scorecard.dimensions.geoPrecision,
      },
    },
    sample: result.rows.slice(0, 5),
    createdAt: new Date().toISOString(),
  }
  return persist ? persistLeadSourceValidation(validation, { index }) : validation
}

export function provingHistory(sourceId) {
  return loadAll('sourceValidations')
    .filter(item => !sourceId || item.sourceId === sourceId)
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))
}
