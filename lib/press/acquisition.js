import { create, loadAll, saveAll, update } from '@/lib/entityStore'
import { classifyBeatText } from './taxonomy'
import { fetchPressJson, fetchPressText } from './fetch'

export const STATE_CODES = Object.freeze([
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD',
  'MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC',
  'SD','TN','TX','UT','VT','VA','WA','WV','WI','WY',
])

export const STATE_NAMES = Object.freeze({
  AL:'Alabama', AK:'Alaska', AZ:'Arizona', AR:'Arkansas', CA:'California', CO:'Colorado', CT:'Connecticut',
  DE:'Delaware', FL:'Florida', GA:'Georgia', HI:'Hawaii', ID:'Idaho', IL:'Illinois', IN:'Indiana', IA:'Iowa',
  KS:'Kansas', KY:'Kentucky', LA:'Louisiana', ME:'Maine', MD:'Maryland', MA:'Massachusetts', MI:'Michigan',
  MN:'Minnesota', MS:'Mississippi', MO:'Missouri', MT:'Montana', NE:'Nebraska', NV:'Nevada', NH:'New Hampshire',
  NJ:'New Jersey', NM:'New Mexico', NY:'New York', NC:'North Carolina', ND:'North Dakota', OH:'Ohio', OK:'Oklahoma',
  OR:'Oregon', PA:'Pennsylvania', RI:'Rhode Island', SC:'South Carolina', SD:'South Dakota', TN:'Tennessee',
  TX:'Texas', UT:'Utah', VT:'Vermont', VA:'Virginia', WA:'Washington', WV:'West Virginia', WI:'Wisconsin', WY:'Wyoming',
})

const WIKIDATA_ENDPOINT = 'https://query.wikidata.org/sparql'
const GDELT_ENDPOINT = 'https://api.gdeltproject.org/api/v2/doc/doc'
const BLUESKY_ENDPOINT = 'https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile'
const MEDIACLOUD_ENDPOINT = 'https://api.mediacloud.org/api/v2/stories_public/count'

function stableSlug(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 72)
}

function hostname(value) {
  try { return new URL(value).hostname.replace(/^www\./, '').toLowerCase() } catch { return '' }
}

function stateCode(label) {
  const match = String(label || '').match(/\b([A-Z]{2})\b/)
  return match && STATE_CODES.includes(match[1]) ? match[1] : ''
}

function upsert(type, records, match) {
  const existing = loadAll(type)
  let created = 0
  let updated = 0
  for (const record of records) {
    const prior = existing.find(item => match(item, record))
    if (prior) {
      update(type, prior.id, record)
      updated += 1
    } else {
      const saved = create(type, record)
      existing.push(saved)
      created += 1
    }
  }
  return { created, updated }
}

export function normalizeWikidataOutlet(binding) {
  const name = binding?.outletLabel?.value || ''
  const website = binding?.website?.value || ''
  const state = stateCode(binding?.stateCode?.value || binding?.stateLabel?.value)
  if (!name) return null
  return {
    id: 'po_wd-' + stableSlug(binding?.outlet?.value || name),
    name,
    domain: hostname(website),
    type: 'daily',
    geo: { scope: state ? 'state' : 'national', state, metro: '', county: '', fips: '' },
    tier: 4,
    rssFeeds: [],
    mastheadUrl: '',
    emailPattern: { pattern: '', confidence: 0, examples: [] },
    sources: [
      { type: 'wikidata', url: binding?.outlet?.value || '' },
      state ? { type: 'wikipedia-state-list', url: 'https://en.wikipedia.org/wiki/List_of_newspapers_in_' + encodeURIComponent(binding.stateLabel?.value || state) } : null,
    ].filter(Boolean),
    updatedAt: new Date().toISOString(),
  }
}

export async function fetchWikidataOutlets(options = {}) {
  const query = [
    'SELECT DISTINCT ?outlet ?outletLabel ?website ?state ?stateLabel ?stateCode WHERE {',
    '  ?outlet wdt:P31/wdt:P279* wd:Q11032; wdt:P17 wd:Q30.',
    '  OPTIONAL { ?outlet wdt:P856 ?website. }',
    '  OPTIONAL { ?outlet wdt:P131* ?state. ?state wdt:P31 wd:Q35657. OPTIONAL { ?state wdt:P300 ?stateCode. } }',
    '  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }',
    '} LIMIT ' + Math.min(10000, Math.max(1, Number(options.limit || 10000))),
  ].join('\n')
  const url = WIKIDATA_ENDPOINT + '?format=json&query=' + encodeURIComponent(query)
  const payload = await fetchPressJson(url, options.fetchOptions)
  return (payload?.results?.bindings || []).map(normalizeWikidataOutlet).filter(Boolean)
}

export async function runPressOutletsSeed(_automation, options = {}) {
  let outlets = options.outlets
  let source = options.outlets ? 'provided' : 'wikidata'
  let wikidataError = ''
  if (!outlets) {
    try {
      outlets = await fetchWikidataOutlets(options)
    } catch (error) {
      wikidataError = error.message
      source = 'wikipedia-state-lists'
      outlets = await fetchWikipediaStateOutlets(options)
    }
  }
  const result = upsert('pressOutlets', outlets, (left, right) =>
    (left.domain && right.domain && left.domain === right.domain)
    || left.id === right.id,
  )
  const states = new Set(loadAll('pressOutlets').map(item => item.geo?.state).filter(Boolean))
  return {
    runner: 'press-outlets-seed',
    source,
    wikidataError,
    fetched: outlets.length,
    ...result,
    states: states.size,
  }
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&ndash;|&#8211;/g, '–')
    .replace(/&mdash;|&#8212;/g, '—')
    .replace(/&nbsp;|&#160;/g, ' ')
    .trim()
}

export function parseWikipediaStateOutlets(html, state, stateName, pageUrl) {
  const document = String(html || '')
  const startMatch = document.match(/id=["'](?:List_of_newspapers|Newspapers|Daily_newspapers)["']/i)
  const start = startMatch?.index || document.search(/<div[^>]+class="[^"]*mw-parser-output/i)
  const tail = start >= 0 ? document.slice(start) : document
  const end = tail.search(/id=["'](?:Defunct_newspapers|See_also|References|External_links)["']/i)
  const content = end > 0 ? tail.slice(0, end) : tail
  const blocks = content.match(/<(?:li|tr)\b[\s\S]*?<\/(?:li|tr)>/gi) || []
  const seen = new Set()
  const outlets = []
  const excluded = /^(list of|newspapers? in |history of|geography of|media in |outline of|index of|bibliography of|portal:|category:|template:|help:|wikipedia:|file:)/i
  for (const block of blocks) {
    const anchors = [...block.matchAll(/<a\b[^>]*href="((?:https:\/\/en\.wikipedia\.org\/wiki\/|\/wiki\/|\.\/)[^"#?]+)"[^>]*(?:title="([^"]*)")?[^>]*>([\s\S]*?)<\/a>/gi)]
    if (!anchors.length) continue
    const candidate = anchors.find(match => {
      const title = decodeHtml(match[2] || match[3])
      return title.length >= 3 && !excluded.test(title) && !title.includes(stateName + ' newspapers')
    })
    if (!candidate) continue
    const name = decodeHtml(candidate[2] || candidate[3])
    const external = [...block.matchAll(/<a\b[^>]*href="(https?:\/\/[^"#?]+)"[^>]*>/gi)]
      .map(match => match[1].replace(/&amp;/g, '&'))
      .find(value => {
        try {
          const host = new URL(value).hostname.toLowerCase()
          return !host.endsWith('wikipedia.org') && !host.endsWith('wikimedia.org')
        } catch {
          return false
        }
      }) || ''
    const key = name.toLowerCase()
    if (!name || seen.has(key)) continue
    seen.add(key)
    outlets.push({
      id: 'po_wp-' + state.toLowerCase() + '-' + stableSlug(name),
      name,
      domain: hostname(external),
      type: /radio/i.test(name) ? 'radio' : /tv|television/i.test(name) ? 'tv' : 'daily',
      geo: { scope: 'state', state, metro: '', county: '', fips: '' },
      tier: 4,
      rssFeeds: [],
      mastheadUrl: external,
      emailPattern: { pattern: '', confidence: 0, examples: [] },
      sources: [
        { type: 'wikipedia-state-list', url: pageUrl },
        { type: 'wikipedia-article', url: absoluteUrl(candidate[1], pageUrl) },
      ],
      updatedAt: new Date().toISOString(),
    })
  }
  return outlets
}

export async function fetchWikipediaStateOutlets(options = {}) {
  const states = options.states || STATE_CODES
  const all = []
  for (const state of states) {
    const stateName = STATE_NAMES[state]
    if (!stateName) continue
    const pageUrl = 'https://en.wikipedia.org/wiki/List_of_newspapers_in_' + encodeURIComponent(stateName.replaceAll(' ', '_'))
    try {
      const html = await fetchPressText(pageUrl, options.fetchOptions)
      all.push(...parseWikipediaStateOutlets(html, state, stateName, pageUrl))
    } catch (error) {
      if (options.onSourceError) options.onSourceError({ state, pageUrl, error: error.message })
    }
  }
  return all
}

function absoluteUrl(value, base) {
  try { return new URL(value, base).href } catch { return '' }
}

export function discoverFeedLinks(html, pageUrl) {
  const links = []
  const linkPattern = /<link\b[^>]*>/gi
  for (const tag of String(html || '').match(linkPattern) || []) {
    const type = tag.match(/\btype=["']([^"']+)/i)?.[1] || ''
    const rel = tag.match(/\brel=["']([^"']+)/i)?.[1] || ''
    const href = tag.match(/\bhref=["']([^"']+)/i)?.[1] || ''
    if (/alternate/i.test(rel) && /(rss|atom|xml)/i.test(type) && href) links.push(absoluteUrl(href, pageUrl))
  }
  return [...new Set(links.filter(Boolean))]
}

export async function runPressFeedDiscovery(_automation, options = {}) {
  const limit = Math.max(1, Number(options.limit || 25))
  const outlets = loadAll('pressOutlets').filter(outlet => outlet.domain).slice(0, limit)
  let discovered = 0
  const errors = []
  const concurrency = Math.min(20, Math.max(1, Number(options.concurrency || 10)))
  let cursor = 0
  async function worker() {
    while (cursor < outlets.length) {
      const outlet = outlets[cursor]
      cursor += 1
    try {
      const home = 'https://' + outlet.domain
      const html = await fetchPressText(home, options.fetchOptions)
      const feeds = discoverFeedLinks(html, home)
      if (feeds.length) {
        update('pressOutlets', outlet.id, { rssFeeds: feeds, updatedAt: new Date().toISOString() })
        discovered += feeds.length
      }
    } catch (error) {
      errors.push({ outletId: outlet.id, error: error.message })
    }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()))
  return { runner: 'press-feed-discovery', checked: outlets.length, discovered, errors }
}

function decodeXml(value) {
  return String(value || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/<[^>]+>/g, '').trim()
}

function tagValue(xml, names) {
  for (const name of names) {
    const escaped = name.replace(':', '\\:')
    const match = xml.match(new RegExp('<' + escaped + '(?:\\s[^>]*)?>([\\s\\S]*?)<\\/' + escaped + '>', 'i'))
    if (match) return decodeXml(match[1])
  }
  return ''
}

export function parsePressFeed(xml, feedUrl) {
  const blocks = String(xml || '').match(/<(?:item|entry)\b[\s\S]*?<\/(?:item|entry)>/gi) || []
  return blocks.map(block => {
    const headline = tagValue(block, ['title'])
    const creator = tagValue(block, ['dc:creator', 'author', 'name'])
    const publishedAt = tagValue(block, ['pubDate', 'published', 'updated'])
    const linkTag = block.match(/<link\b[^>]*href=["']([^"']+)/i)?.[1]
    const link = linkTag || tagValue(block, ['link', 'guid'])
    return { headline, creator, publishedAt, url: absoluteUrl(link, feedUrl) }
  }).filter(item => (item.headline || item.url) && (item.creator || item.url))
}

export async function gdeltBackfill(query, options = {}) {
  const url = GDELT_ENDPOINT + '?query=' + encodeURIComponent(query) + '&mode=artlist&maxrecords=250&format=json'
  const payload = await fetchPressJson(url, options.fetchOptions)
  return (payload?.articles || []).map(article => ({
    headline: article.title || '',
    creator: article.author || '',
    publishedAt: article.seendate || '',
    url: article.url || '',
    domain: article.domain || '',
  })).filter(item => item.headline && item.creator)
}

export async function mediaCloudStoryCount(query, options = {}) {
  if (!process.env.MEDIACLOUD_API_KEY) return { skipped: true, reason: 'MEDIACLOUD_API_KEY not configured' }
  const url = MEDIACLOUD_ENDPOINT + '?q=' + encodeURIComponent(query)
  const payload = await fetchPressJson(url, {
    ...options.fetchOptions,
    headers: { Authorization: 'Bearer ' + process.env.MEDIACLOUD_API_KEY },
  })
  return { skipped: false, payload }
}

export async function runPressBylineHarvest(_automation, options = {}) {
  const outlets = loadAll('pressOutlets')
  const limit = Math.max(1, Number(options.limit || 50))
  let bylinesCreated = 0
  let contactsCreated = 0
  const errors = []
  const targets = outlets.filter(item => item.rssFeeds?.length).slice(0, limit)
  const concurrency = Math.min(20, Math.max(1, Number(options.concurrency || 10)))
  let cursor = 0
  async function worker() {
    while (cursor < targets.length) {
      const outlet = targets[cursor]
      cursor += 1
    for (const feed of outlet.rssFeeds) {
      try {
        const xml = await fetchPressText(feed, options.fetchOptions)
        const items = parsePressFeed(xml, feed)
        for (const item of items) {
          const contactId = 'pc_byline-' + stableSlug(outlet.id + '-' + item.creator)
          if (!loadAll('pressContacts').some(contact => contact.id === contactId)) {
            create('pressContacts', {
              id: contactId,
              name: item.creator,
              outlet: outlet.name,
              outletId: outlet.id,
              beats: classifyBeatText(item.headline),
              title: 'Reporter',
              geo: outlet.geo,
              email: { value: '', status: 'unknown', source: '', verifiedAt: null },
              social: { bluesky: '', x: '', site: '' },
              bylineStats: { count90d: 0, lastAt: null },
              score: 0,
              scoreExplain: [],
              doNotPitch: false,
              suppressedAt: null,
            })
            contactsCreated += 1
          }
          const bylineId = 'pby_' + stableSlug(item.url || outlet.id + '-' + item.creator + '-' + item.headline)
          if (!loadAll('pressBylines').some(byline => byline.id === bylineId)) {
            create('pressBylines', {
              id: bylineId,
              contactId,
              outletId: outlet.id,
              url: item.url,
              headline: item.headline,
              publishedAt: item.publishedAt,
              beat: classifyBeatText(item.headline)[0] || 'national-news',
              source: 'rss',
            })
            bylinesCreated += 1
          }
        }
      } catch (error) {
        errors.push({ outletId: outlet.id, feed, error: error.message })
      }
    }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()))
  return { runner: 'press-byline-harvest', contactsCreated, bylinesCreated, errors }
}

export function contactBeatCounts(contactId, bylines) {
  const counts = new Map()
  for (const byline of bylines.filter(item => item.contactId === contactId)) {
    for (const beat of classifyBeatText(byline.beat + ' ' + byline.headline)) {
      counts.set(beat, (counts.get(beat) || 0) + 1)
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
}

export async function runPressBeatTagging() {
  const bylines = loadAll('pressBylines')
  const contacts = loadAll('pressContacts')
  const byContact = new Map()
  for (const byline of bylines) {
    const list = byContact.get(byline.contactId) || []
    list.push(byline)
    byContact.set(byline.contactId, list)
  }
  let updated = 0
  const next = contacts.map(contact => {
    const counts = contactBeatCounts(contact.id, byContact.get(contact.id) || [])
    if (!counts.length) return contact
    updated += 1
    return { ...contact, beats: counts.slice(0, 3).map(([beat]) => beat), updatedAt: new Date().toISOString() }
  })
  saveAll('pressContacts', next)
  return { runner: 'press-beat-tagging', updated }
}

export function scorePressContact(contact, outlet, now = new Date()) {
  const count90d = Math.max(0, Number(contact?.bylineStats?.count90d || 0))
  const byline = Math.min(1, Math.log1p(count90d) / Math.log(31))
  const tier = Math.max(0, Math.min(1, (5 - Number(outlet?.tier || 4)) / 4))
  const lastAt = Date.parse(contact?.bylineStats?.lastAt || '')
  const ageDays = Number.isFinite(lastAt) ? Math.max(0, (now.getTime() - lastAt) / 86_400_000) : 90
  const freshness = Math.max(0, 1 - ageDays / 90)
  const followers = Math.max(0, Number(contact?.social?.blueskyFollowers || 0))
  const social = Math.min(1, Math.log1p(followers) / Math.log(100001))
  const geo = contact?.geo?.state || contact?.geo?.metro ? 1 : 0
  const parts = { byline, tier, freshness, social, geo }
  const score = Math.round((0.35 * byline + 0.25 * tier + 0.20 * freshness + 0.15 * social + 0.05 * geo) * 100)
  return {
    score,
    scoreExplain: [
      count90d + ' bylines in 90 days',
      'outlet tier ' + String(outlet?.tier || 4),
      Number.isFinite(lastAt) ? Math.round(ageDays) + ' days since last byline' : 'no recent byline date',
      followers ? followers + ' Bluesky followers' : 'no Bluesky following recorded',
      geo ? 'geography matched' : 'national geography only',
    ],
    parts,
  }
}

export async function runPressScoring(_automation, options = {}) {
  const contacts = loadAll('pressContacts')
  const outlets = new Map(loadAll('pressOutlets').map(outlet => [outlet.id, outlet]))
  const bylines = loadAll('pressBylines')
  const byContact = new Map()
  for (const byline of bylines) {
    const list = byContact.get(byline.contactId) || []
    list.push(byline)
    byContact.set(byline.contactId, list)
  }
  const cutoff = (options.now || new Date()).getTime() - 90 * 86_400_000
  let updated = 0
  const next = contacts.map(contact => {
    const recent = (byContact.get(contact.id) || []).filter(byline => Date.parse(byline.publishedAt || 0) >= cutoff)
      .sort((a, b) => Date.parse(b.publishedAt || 0) - Date.parse(a.publishedAt || 0))
    const withStats = {
      ...contact,
      bylineStats: {
        count90d: recent.length,
        lastAt: recent[0]?.publishedAt || contact.bylineStats?.lastAt || null,
      },
    }
    const result = scorePressContact(withStats, outlets.get(contact.outletId), options.now || new Date())
    updated += 1
    return {
      ...contact,
      bylineStats: withStats.bylineStats,
      score: result.score,
      scoreExplain: result.scoreExplain,
      updatedAt: new Date().toISOString(),
    }
  })
  saveAll('pressContacts', next)
  return { runner: 'press-scoring', updated }
}

export async function enrichBlueskyContact(contact, options = {}) {
  const actor = contact?.social?.bluesky
  if (!actor) return { skipped: true, reason: 'No Bluesky handle' }
  const profile = await fetchPressJson(BLUESKY_ENDPOINT + '?actor=' + encodeURIComponent(actor), options.fetchOptions)
  const description = String(profile?.description || '')
  const email = description.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || ''
  const doNotPitch = /\b(do not pitch|no pitches|no pr)\b/i.test(description)
  return {
    skipped: false,
    blueskyFollowers: Number(profile?.followersCount || 0),
    bio: description,
    publishedEmail: email,
    doNotPitch,
  }
}
