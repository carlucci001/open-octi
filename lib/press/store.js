import fs from 'node:fs'
import path from 'node:path'
import { create, loadAll, saveAll } from '@/lib/entityStore'
import { readData, writeData } from '@/lib/dataStore'
import { PRESS_BEATS, normalizeBeatSlugs } from './taxonomy'
import { PRESS_RELEASE_AGENT_ID, PRESS_RELEASE_AGENT_RECORD } from './release-agent-config'

function slug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64)
}

function domainFrom(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  if (text.includes('@')) return text.split('@').pop().toLowerCase()
  try { return new URL(text).hostname.replace(/^www\./, '').toLowerCase() } catch { return '' }
}

function legacyGeo(region) {
  const text = String(region || '')
  const lower = text.toLowerCase()
  const metro = lower.includes('City, ST') ? 'City, ST' : ''
  const state = lower.includes('north carolina') || lower.includes('wnc') || metro ? 'NC' : ''
  return { scope: metro ? 'metro' : state ? 'state' : 'local', state, metro, county: '', fips: '' }
}

function emailStatus(address, name) {
  if (!address) return 'unknown'
  return /^(tips|news|editor|hello|letters|publisher|iteam|realitycheck)@/i.test(address)
    || /desk|newsroom|pitches|team/i.test(String(name || ''))
    ? 'tips-fallback'
    : 'published'
}

export function migrateLegacyPressContacts(legacyRows = [], existingOutlets = [], existingContacts = []) {
  const outlets = [...existingOutlets]
  const contacts = [...existingContacts]
  const outletByName = new Map(outlets.map(outlet => [String(outlet.name || '').toLowerCase(), outlet]))
  const contactKeys = new Set(contacts.map(contact => contact.legacyKey).filter(Boolean))
  let migratedOutlets = 0
  let migratedContacts = 0

  for (const row of legacyRows) {
    const name = String(row?.name || '').trim()
    const outletName = String(row?.outlet || '').trim()
    if (!name || !outletName) continue
    const emailAddress = String(row.email || '').trim().toLowerCase()
    const sourceDomain = domainFrom(row.sourceUrl)
    const outletKey = outletName.toLowerCase()
    let outlet = outletByName.get(outletKey)
    if (!outlet) {
      const idSlug = slug(outletName) || 'legacy-' + String(outlets.length + 1)
      outlet = {
        id: 'po_' + idSlug,
        name: outletName,
        domain: sourceDomain || domainFrom(emailAddress),
        type: /radio|fm|bpr/i.test(outletName) ? 'radio' : /news 13|wlos/i.test(outletName) ? 'tv' : /today|now|newsline/i.test(outletName) ? 'digital' : 'daily',
        geo: legacyGeo(row.region),
        tier: 4,
        rssFeeds: [],
        mastheadUrl: row.sourceUrl || '',
        emailPattern: { pattern: '', confidence: 0, examples: [] },
        sources: [{ type: 'legacy-curated', url: row.sourceUrl || '' }],
        updatedAt: new Date().toISOString(),
      }
      outlets.push(outlet)
      outletByName.set(outletKey, outlet)
      migratedOutlets += 1
    }

    const legacyKey = [outletName.toLowerCase(), name.toLowerCase(), emailAddress].join('|')
    if (contactKeys.has(legacyKey)) continue
    const beats = normalizeBeatSlugs([row.beat])
    contacts.push({
      id: ['pc', slug(outletName), slug(name), String(contacts.length + 1).padStart(2, '0')].join('_'),
      name,
      outlet: outletName,
      beat: row.beat || '',
      notes: row.notes || '',
      region: row.region || '',
      status: row.status || 'active',
      sourceUrl: row.sourceUrl || '',
      legacyEmail: emailAddress,
      legacyKey,
      outletId: outlet.id,
      beats: beats.length ? beats : ['national-news'],
      title: /desk|newsroom|team|pitches/i.test(name) ? 'News desk' : 'Reporter',
      geo: outlet.geo,
      email: {
        value: emailAddress,
        status: emailStatus(emailAddress, name),
        source: row.sourceUrl || 'legacy-curated',
        verifiedAt: null,
      },
      social: { bluesky: '', x: '', site: '' },
      bylineStats: { count90d: 0, lastAt: null },
      score: 0,
      scoreExplain: ['Migrated from the curated WNC starter list; byline scoring pending.'],
      doNotPitch: false,
      suppressedAt: null,
    })
    contactKeys.add(legacyKey)
    migratedContacts += 1
  }

  return { outlets, contacts, migratedOutlets, migratedContacts }
}

export function ensurePressDeskSeeds() {
  for (const type of ['pressBeats', 'pressOutlets', 'pressContacts']) {
    const rows = loadAll(type)
    const unique = [...new Map(rows.map(row => [row.id || row.legacyKey, row])).values()]
    if (unique.length !== rows.length) saveAll(type, unique)
  }
  const existingBeats = loadAll('pressBeats')
  const beatSlugs = new Set(existingBeats.map(beat => beat.slug))
  for (const beat of PRESS_BEATS) {
    if (!beatSlugs.has(beat.slug)) create('pressBeats', beat)
  }

  let legacy = readData('press-contacts.json')
  if (!legacy) {
    try {
      legacy = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'data', 'press-contacts.json'), 'utf8'))
    } catch {
      legacy = null
    }
  }
  const legacyRows = Array.isArray(legacy) ? legacy : (legacy?.contacts || [])
  const result = migrateLegacyPressContacts(
    legacyRows,
    loadAll('pressOutlets'),
    loadAll('pressContacts'),
  )
  if (result.migratedOutlets > 0) {
    for (const outlet of result.outlets.slice(-result.migratedOutlets)) create('pressOutlets', outlet)
  }
  if (result.migratedContacts > 0) {
    for (const contact of result.contacts.slice(-result.migratedContacts)) create('pressContacts', contact)
  }

  const agentsData = readData('agents.json')
  const mark = agentsData?.agents?.['ContentStudio-promoter']
  const needsMarkUpdate = mark && !String(mark.jobDescription || '').includes('Press Desk')
  const needsPressAgent = !agentsData?.agents?.[PRESS_RELEASE_AGENT_ID]
  if (needsMarkUpdate || needsPressAgent) {
    writeData('agents.json', {
      ...(agentsData || {}),
      agents: {
        ...(agentsData?.agents || {}),
        ...(needsMarkUpdate ? {
          'ContentStudio-promoter': {
            ...mark,
            jobDescription: [
              mark.jobDescription || '',
              'Press Desk workflow: parse the release, propose beats and geography, query ranked contacts, show reasons,',
              'build two-sentence personalization from each contact’s last three headlines, require explicit approval,',
              'send through the compliance gate, then report sends, bounces, replies, opens, and pickups.',
            ].filter(Boolean).join(' '),
          },
        } : {}),
        ...(needsPressAgent ? { [PRESS_RELEASE_AGENT_ID]: PRESS_RELEASE_AGENT_RECORD } : {}),
      },
    })
  }

  return {
    beats: loadAll('pressBeats').length,
    outlets: loadAll('pressOutlets').length,
    contacts: loadAll('pressContacts').length,
    migratedOutlets: result.migratedOutlets,
    migratedContacts: result.migratedContacts,
    pressAgentSeeded: needsPressAgent,
  }
}
