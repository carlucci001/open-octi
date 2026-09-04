import { loadAll, saveAll } from '@/lib/entityStore'
import { classifyBeatText } from './taxonomy'
import { fetchPressJson, fetchPressText, isDeniedPressDomain } from './fetch'
import { auditBlueskyOutletLinks, matchBlueskyOutletByDomain } from './bluesky-linking'
import { parsePressFeed } from './acquisition'

const MEDIAWIKI_API = 'https://en.wikipedia.org/w/api.php'
const WIKIDATA_API = 'https://www.wikidata.org/w/api.php'

const NON_OUTLET_NAME = /^(?:list of|newspapers? in |history of|media in |category:|template:|portal:|draft:|wikipedia:)|\((?:disambiguation|film|song|album)\)$/i
const NON_OFFICIAL_HOSTS = /(?:wikipedia|wikimedia|facebook|instagram|youtube|tiktok|archive|google|bing|yahoo|worldcat|doi\.org|noaa\.gov|newspapers\.com|loc\.gov)$/i
const NATIONAL_NAMES = /^(?:usa today|the wall street journal|the new york times|the washington post|los angeles times|associated press|reuters|bloomberg|politico|axios|the hill|newsweek|time|forbes|fortune|the atlantic|the new yorker|national review|the nation|the christian science monitor)$/i
const MAJOR_METROS = new Set([
  'Atlanta','Austin','Baltimore','Boston','Charlotte','Chicago','Dallas','Denver','Detroit','Houston','Las Vegas',
  'Los Angeles','Miami','Minneapolis','Nashville','New York','Orlando','Philadelphia','Phoenix','Pittsburgh',
  'Portland','Sacramento','San Antonio','San Diego','San Francisco','Seattle','St. Louis','Tampa','Washington',
])

function chunks(values, size = 40) {
  const result = []
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size))
  return result
}

function normalizedTitle(value) {
  return String(value || '').replaceAll('_', ' ').replace(/^\.\//, '').trim().toLowerCase()
}

function wikipediaTitle(outlet) {
  const source = (outlet.sources || []).find(item => item?.type === 'wikipedia-article' && item.url)
  if (!source) return ''
  try {
    const marker = '/wiki/'
    const index = new URL(source.url).pathname.indexOf(marker)
    return index >= 0 ? decodeURIComponent(new URL(source.url).pathname.slice(index + marker.length)) : ''
  } catch {
    return ''
  }
}

function validPublicUrl(value) {
  try {
    const url = new URL(/^https?:\/\//i.test(String(value || '')) ? value : 'https://' + value)
    const host = url.hostname.toLowerCase().replace(/^www\./, '')
    if (!host.includes('.') || NON_OFFICIAL_HOSTS.test(host) || isDeniedPressDomain(host)) return ''
    return url.href
  } catch {
    return ''
  }
}

function websiteFromWikitext(wikitext) {
  for (const match of String(wikitext || '').matchAll(/^\|\s*(?:website|url|homepage)\s*=\s*(.+)$/gim)) {
    const value = match[1].replace(/<!--.*?-->/g, '').trim()
    const explicit = value.match(/https?:\/\/[^\s|}\]<]+/i)?.[0]
    if (explicit && validPublicUrl(explicit)) return validPublicUrl(explicit)
    const template = value.match(/\{\{\s*(?:url|official url)\s*\|\s*(?:1\s*=\s*)?([^|}]+)/i)?.[1]
    if (template && validPublicUrl(template.trim())) return validPublicUrl(template.trim())
    const bare = value.match(/(?:www\.)?[a-z0-9][a-z0-9.-]+\.[a-z]{2,}(?:\/[^\s|}\]]*)?/i)?.[0]
    if (bare && validPublicUrl(bare)) return validPublicUrl(bare)
  }
  return ''
}

function websiteFromExternalLinks(links = [], outletName = '') {
  const tokens = String(outletName || '').toLowerCase().split(/[^a-z0-9]+/)
    .filter(token => token.length >= 5 && !/^(?:daily|weekly|newspaper|journal|gazette|herald|tribune|observer|record|press|times|news)$/.test(token))
  for (const item of links) {
    const value = validPublicUrl(item?.['*'] || item?.url || item)
    if (!value) continue
    const host = new URL(value).hostname.toLowerCase().replace(/^www\./, '').replace(/[^a-z0-9]/g, '')
    if (tokens.some(token => host.includes(token))) return value
  }
  return ''
}

function circulationFrom(wikitext) {
  const value = String(wikitext || '').match(/^\|\s*(?:circulation|daily_circulation)\s*=\s*([^\n]+)/im)?.[1] || ''
  const digits = value.replace(/\{\{[^}]+}}/g, '').match(/[\d][\d,. ]{2,}/)?.[0] || ''
  return Number(digits.replace(/[^\d]/g, '')) || 0
}

function fieldValue(wikitext, names) {
  const pattern = new RegExp('^\\|\\s*(?:' + names.join('|') + ')\\s*=\\s*([^\\n]+)', 'im')
  return String(wikitext || '').match(pattern)?.[1]?.replace(/\{\{[^}]+}}|\[\[[^\]|]+\|?|]]/g, '').trim() || ''
}

function metroFromField(wikitext) {
  const raw = String(wikitext || '').match(/^\|\s*(?:headquarters|location|publishing_city)\s*=\s*([^\n]+)/im)?.[1] || ''
  const linked = [...raw.matchAll(/\[\[(?:[^|\]]+\|)?([^\]]+)]]/g)].map(match => match[1].trim())
  const plain = raw.replace(/\{\{[^}]+}}|<[^>]+>|\[\[|]]/g, '').split(',').map(item => item.trim())
  const stateSuffix = /\s+(?:AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming)$/i
  return [...linked, ...plain].map(item => item.replace(/[^A-Za-z .'-]/g, '').trim()
    .replace(/^(?:suite|p\.?o\.? box)\s*/i, '').replace(stateSuffix, '').trim()).find(item =>
    item.length >= 3 && item.length <= 50
    && !/(?:\b(?:street|road|avenue|boulevard|department|elevation|united states|county)\b|(?:^|\s)(?:st|rd|ave|blvd)\.?$)/i.test(item)
    && !/^(?:Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming)$/i.test(item)
  ) || ''
}

export function classifyOutletFromWikipedia(outlet, wikitext = '') {
  const text = String(wikitext || '')
  const frequency = fieldValue(text, ['frequency', 'type'])
  const weekly = /\b(?:weekly|biweekly|semiweekly|community newspaper)\b/i.test(frequency + ' ' + text.slice(0, 1800))
  const daily = !weekly && /\b(?:daily newspaper|published daily|frequency\s*=\s*daily)\b/i.test(text.slice(0, 2400))
  const circulation = circulationFrom(text)
  const metro = metroFromField(text)
  const national = NATIONAL_NAMES.test(outlet.name || '') || /\bnational (?:daily )?newspaper\b/i.test(text.slice(0, 2500))
  let tier = 4
  if (national || circulation >= 500000) tier = 1
  else if (circulation >= 100000 || (daily && MAJOR_METROS.has(metro))) tier = 2
  else if (daily || circulation >= 10000) tier = 3
  return {
    type: weekly ? 'weekly' : daily ? 'daily' : outlet.type || 'newspaper',
    tier,
    circulation: circulation || outlet.circulation || null,
    geo: {
      ...(outlet.geo || {}),
      scope: national ? 'national' : outlet.geo?.scope || 'state',
      metro: metro || outlet.geo?.metro || '',
    },
  }
}

export function isObviousNonOutlet(outlet, page = {}) {
  const name = String(outlet?.name || '').trim()
  const text = String(page?.wikitext || '')
  return !name || NON_OUTLET_NAME.test(name) || Boolean(page?.missing)
    || /\{\{\s*disambiguation\b/i.test(text)
    || /\b(?:was a|defunct) (?:daily |weekly )?(?:American )?newspaper\b/i.test(text.slice(0, 1800))
}

function mediaWikiUrl(titles) {
  const params = new URLSearchParams({
    action: 'query', format: 'json', formatversion: '2', redirects: '1', origin: '*',
    prop: 'revisions|pageprops|extlinks', rvprop: 'content', rvslots: 'main', ellimit: 'max',
    titles: titles.join('|'),
  })
  return MEDIAWIKI_API + '?' + params
}

function wikidataUrl(ids) {
  const params = new URLSearchParams({
    action: 'wbgetentities', format: 'json', origin: '*', props: 'claims', ids: ids.join('|'),
  })
  return WIKIDATA_API + '?' + params
}

function wikidataWebsites(payload) {
  const result = new Map()
  for (const [id, entity] of Object.entries(payload?.entities || {})) {
    const claims = entity?.claims?.P856 || []
    const preferred = claims.find(claim => claim.rank === 'preferred') || claims[0]
    const value = validPublicUrl(preferred?.mainsnak?.datavalue?.value)
    if (value) result.set(id, value)
  }
  return result
}

export async function runPressDomainResolution(_automation, options = {}) {
  let outlets = options.outlets || loadAll('pressOutlets')
  const before = outlets.length
  outlets = outlets.filter(outlet => !isObviousNonOutlet(outlet))
  const removed = before - outlets.length
  const pending = outlets.filter(outlet => wikipediaTitle(outlet)
    && (options.reclassify || (!outlet.domain && !outlet.domainResolvedAt)))
  const limit = Math.max(1, Number(options.limit || pending.length))
  const selected = pending.slice(0, limit)
  const byId = new Map(outlets.map(outlet => [outlet.id, outlet]))
  let resolved = 0
  let classified = 0
  const errors = []

  for (const batch of chunks(selected, Math.min(50, Math.max(1, Number(options.batchSize || 40))))) {
    const titleMap = new Map(batch.map(outlet => [normalizedTitle(wikipediaTitle(outlet)), outlet]))
    try {
      // robots.txt governs page crawling; these two user-directed public API endpoints
      // publish their own access contract. They still pass through the 1 req/s host queue.
      const apiFetchOptions = { ...(options.fetchOptions || {}), respectRobots: false }
      const payload = await fetchPressJson(mediaWikiUrl(batch.map(wikipediaTitle)), apiFetchOptions)
      const redirects = new Map((payload?.query?.redirects || []).map(item => [normalizedTitle(item.to), normalizedTitle(item.from)]))
      const pages = payload?.query?.pages || []
      const qids = pages.map(page => page?.pageprops?.wikibase_item).filter(Boolean)
      let wikidata = new Map()
      if (qids.length) {
        try { wikidata = wikidataWebsites(await fetchPressJson(wikidataUrl(qids), apiFetchOptions)) }
        catch (error) { errors.push({ source: 'wikidata', error: error.message }) }
      }
      for (const page of pages) {
        const key = redirects.get(normalizedTitle(page.title)) || normalizedTitle(page.title)
        const outlet = titleMap.get(key)
        if (!outlet) continue
        const wikitext = page?.revisions?.[0]?.slots?.main?.content || ''
        if (isObviousNonOutlet(outlet, { ...page, wikitext })) continue
        const website = websiteFromWikitext(wikitext)
          || wikidata.get(page?.pageprops?.wikibase_item)
          || websiteFromExternalLinks(page?.extlinks, outlet.name)
        const classification = classifyOutletFromWikipedia(outlet, wikitext)
        const resolvedDomain = website ? new URL(website).hostname.toLowerCase().replace(/^www\./, '')
          : options.reclassify && outlet.domainResolutionSource === 'mediawiki-extlinks' ? '' : outlet.domain
        const domainChanged = Boolean(outlet.domain && resolvedDomain !== outlet.domain)
        const next = {
          ...outlet,
          ...classification,
          domain: resolvedDomain,
          mastheadUrl: website || (domainChanged ? '' : outlet.mastheadUrl),
          ...(domainChanged ? { rssFeeds: [], newsSitemaps: [], contentDiscoveryAt: null, articleHarvestAt: null } : {}),
          domainResolvedAt: new Date().toISOString(),
          domainResolutionSource: websiteFromWikitext(wikitext) ? 'mediawiki-infobox'
            : wikidata.get(page?.pageprops?.wikibase_item) ? 'wikidata-p856' : website ? 'mediawiki-extlinks' : 'none',
          updatedAt: new Date().toISOString(),
        }
        if (next.domain && !outlet.domain) resolved += 1
        if (next.tier !== outlet.tier || next.type !== outlet.type || next.geo?.metro !== outlet.geo?.metro) classified += 1
        byId.set(outlet.id, next)
      }
      outlets = outlets.map(outlet => byId.get(outlet.id) || outlet)
      saveAll('pressOutlets', outlets)
      options.onBatch?.({ checked: Math.min(selected.length, resolved + classified), resolved, classified, removed })
    } catch (error) {
      errors.push({ source: 'mediawiki', titles: batch.length, error: error.message })
    }
  }
  return { runner: 'press-domain-resolution', checked: selected.length, resolved, classified, removed, errors }
}

const INVALID_PRESS_AUTHOR = /\d|https?:|@|[<>/:]|&#?\w+;|\b(?:staff|staff reports?|staff writer|photo|enterprise staff|editorial|newsroom|newswire|wire services?|news service|press release|sponsored(?: content| story)?|contributed|courtesy|getty images?|special to (?:the )?|usa today network|assistant|writer|content by|more by|exchange report|daily news)\b|\b(?:co\.?|ltd\.?|inc\.?|llc)\b|^(?:admin|author|editor|contributor|associated press|reuters|sports|news|opinion|opinions|lifestyles?)$/i

export function isPlausiblePressAuthor(value) {
  const name = String(value || '').replace(/\s+/g, ' ').trim()
  const words = name.split(/\s+/).filter(Boolean)
  return name.length >= 3
    && name.length <= 100
    && words.length >= 2
    && words.length <= 8
    && !INVALID_PRESS_AUTHOR.test(name)
    && !/,\s*(?:opinions?|lifestyles?|sports|news|editorial|editor|writer|reporter)(?:\s+.*)?$/i.test(name)
}

export function extractArticleAuthors(html) {
  const document = String(html || '')
  const values = []
  const metaTags = document.match(/<meta\b[^>]*>/gi) || []
  for (const tag of metaTags) {
    const key = tag.match(/\b(?:name|property)=["']([^"']+)/i)?.[1] || ''
    const value = tag.match(/\bcontent=["']([^"']+)/i)?.[1] || ''
    if (/^(?:author|article:author|parsely-author|byl)$/i.test(key) && value) values.push(value)
  }
  for (const block of document.match(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/gi) || []) {
    const raw = block.replace(/^<script\b[^>]*>|<\/script>$/gi, '').trim()
    try {
      const visit = value => {
        if (!value || typeof value !== 'object') return
        if (value.author) {
          for (const author of Array.isArray(value.author) ? value.author : [value.author]) {
            if (typeof author === 'string') values.push(author)
            else if (author?.name) values.push(author.name)
          }
        }
        if (Array.isArray(value['@graph'])) value['@graph'].forEach(visit)
      }
      visit(JSON.parse(raw))
    } catch {}
  }
  const bylinePattern = /<(?:span|div|p|a)\b[^>]*(?:class=["'][^"']*(?:byline|author-name)[^"']*["']|rel=["']author["'])[^>]*>([\s\S]*?)<\/(?:span|div|p|a)>/gi
  for (const match of document.matchAll(bylinePattern)) values.push(match[1].replace(/<[^>]+>/g, ' '))
  return [...new Set(values.flatMap(value => String(value).replace(/&amp;/g, '&').replace(/^\s*by\s+/i, '')
    .split(/\s+(?:and|&)\s+|,\s*(?=[A-Z][a-z]+\s+[A-Z])/)
    .map(item => item.replace(/\s+/g, ' ').replace(/,?\s+(?:staff writer|reporter|editor|correspondent|contributor)$/i, '').trim())
    .filter(isPlausiblePressAuthor)))]
}

export function pruneInvalidBylineContacts(data = {}) {
  const contacts = data.contacts || loadAll('pressContacts')
  const bylines = data.bylines || loadAll('pressBylines')
  const invalid = new Set(contacts.filter(contact => String(contact.id || '').startsWith('pc_byline-')
    && !isPlausiblePressAuthor(contact.name))
    .map(contact => contact.id))
  const nextContacts = contacts.filter(contact => !invalid.has(contact.id))
  const nextBylines = bylines.filter(byline => !invalid.has(byline.contactId))
  if (!data.contacts) saveAll('pressContacts', nextContacts)
  if (!data.bylines) saveAll('pressBylines', nextBylines)
  return { contactsRemoved: contacts.length - nextContacts.length, bylinesRemoved: bylines.length - nextBylines.length }
}

export function parseNewsSitemap(xml, sitemapUrl) {
  return (String(xml || '').match(/<url\b[\s\S]*?<\/url>/gi) || []).map(block => ({
    url: block.match(/<loc>([\s\S]*?)<\/loc>/i)?.[1]?.trim().replace(/&amp;/g, '&') || '',
    headline: block.match(/<news:title>([\s\S]*?)<\/news:title>/i)?.[1]?.replace(/<!\[CDATA\[|]]>/g, '').trim() || '',
    publishedAt: block.match(/<news:publication_date>([\s\S]*?)<\/news:publication_date>/i)?.[1]?.trim() || '',
    creator: '',
    source: 'news-sitemap',
    feedUrl: sitemapUrl,
  })).filter(item => item.url)
}

export function classifyArticleBeat(item, html = '') {
  const sectionTag = (String(html || '').match(/<meta\b[^>]*(?:name|property)=["'](?:article:section|parsely-section)["'][^>]*>/i) || [])[0] || ''
  const section = sectionTag.match(/\bcontent=["']([^"']+)/i)?.[1] || ''
  return classifyBeatText([item?.headline, section].filter(Boolean).join(' '))
}

export async function fetchArticleAuthors(item, options = {}) {
  if (!item?.url) return { authors: item?.creator ? [item.creator] : [], html: '' }
  const html = await fetchPressText(item.url, {
    timeoutMs: 8000, maxRetries: 1, initialBackoffMs: 5000,
    ...options, maxBytes: options.maxBytes || 1_500_000,
  })
  const authors = extractArticleAuthors(html)
  if (!authors.length && item.creator) authors.push(item.creator)
  return { authors, html }
}

function absoluteUrl(value, base) {
  try { return new URL(value, base).href } catch { return '' }
}

export function discoverContentSourceLinks(html, pageUrl) {
  const rssFeeds = []
  for (const tag of String(html || '').match(/<link\b[^>]*>/gi) || []) {
    const type = tag.match(/\btype=["']([^"']+)/i)?.[1] || ''
    const rel = tag.match(/\brel=["']([^"']+)/i)?.[1] || ''
    const href = tag.match(/\bhref=["']([^"']+)/i)?.[1] || ''
    if (/alternate/i.test(rel) && /(?:rss|atom|xml)/i.test(type) && href) rssFeeds.push(absoluteUrl(href, pageUrl))
  }
  const newsSitemaps = [...String(html || '').matchAll(/<loc>([^<]*(?:news[-_]?sitemap|sitemap[-_]?news)[^<]*)<\/loc>/gi)]
    .map(match => absoluteUrl(match[1].replace(/&amp;/g, '&').trim(), pageUrl))
  return {
    rssFeeds: [...new Set(rssFeeds.filter(Boolean))],
    newsSitemaps: [...new Set(newsSitemaps.filter(Boolean))],
  }
}

function contentKind(text) {
  const start = String(text || '').slice(0, 5000)
  if (/<(?:rss|feed|rdf:RDF)\b/i.test(start) && /<(?:item|entry)\b/i.test(text)) return 'feed'
  if (/<(?:urlset|sitemapindex)\b/i.test(start)) return 'sitemap'
  return ''
}

async function probeOutletSources(outlet, options = {}) {
  const probeOptions = { maxRetries: 1, initialBackoffMs: 5000, ...options }
  const home = outlet.mastheadUrl && /^https?:\/\//i.test(outlet.mastheadUrl)
    ? outlet.mastheadUrl
    : 'https://' + outlet.domain
  let homepage = ''
  try { homepage = await fetchPressText(home, { ...probeOptions, maxBytes: 750_000 }) } catch {}
  const declared = discoverContentSourceLinks(homepage, home)
  const origin = (() => { try { return new URL(home).origin } catch { return 'https://' + outlet.domain } })()
  const sections = [...new Set([...homepage.matchAll(/href=["']\/(?:section\/)?(news|local|business|sports|technology|health|politics|science)(?:\/|["'])/gi)]
    .map(match => match[1].toLowerCase()))].slice(0, 4)
  const candidates = [
    ...declared.rssFeeds.map(url => ({ url, expected: 'feed' })),
    ...declared.newsSitemaps.map(url => ({ url, expected: 'sitemap' })),
    { url: origin + '/feed/', expected: 'feed' },
    { url: origin + '/feed', expected: 'feed' },
    { url: origin + '/rss/', expected: 'feed' },
    { url: origin + '/rss.xml', expected: 'feed' },
    { url: origin + '/arc/outboundfeeds/rss/', expected: 'feed' },
    { url: origin + '/arc/outboundfeeds/rss/?outputType=xml', expected: 'feed' },
    { url: origin + '/feeds/', expected: 'feed' },
    { url: origin + '/search/?f=rss&t=article&l=50&s=start_time&sd=desc', expected: 'feed' },
    ...sections.flatMap(section => [
      { url: origin + '/section/' + section + '/feed/', expected: 'feed' },
      { url: origin + '/' + section + '/feed/', expected: 'feed' },
    ]),
    { url: origin + '/news-sitemap.xml', expected: 'sitemap' },
    { url: origin + '/sitemap-news.xml', expected: 'sitemap' },
    { url: origin + '/sitemap.xml', expected: 'sitemap' },
    { url: origin + '/wp-sitemap.xml', expected: 'sitemap' },
  ]
  const seen = new Set()
  const rssFeeds = []
  const newsSitemaps = []
  const errors = []
  for (const candidate of candidates) {
    if (!candidate.url || seen.has(candidate.url)) continue
    seen.add(candidate.url)
    try {
      const text = await fetchPressText(candidate.url, { ...probeOptions, maxBytes: 750_000 })
      const kind = contentKind(text)
      if (kind === 'feed') rssFeeds.push(candidate.url)
      if (kind === 'sitemap') {
        const nested = discoverContentSourceLinks(text, candidate.url).newsSitemaps
        newsSitemaps.push(...(nested.length ? nested : [candidate.url]))
      }
      if (rssFeeds.length + newsSitemaps.length >= Math.max(1, Number(options.maxSources || 2))) break
    } catch (error) {
      errors.push({ url: candidate.url, error: error.message })
      if (/robots\.txt disallows/i.test(error.message)) break
    }
  }
  return {
    rssFeeds: [...new Set(rssFeeds)],
    newsSitemaps: [...new Set(newsSitemaps)],
    errors,
  }
}

export async function runPressContentDiscovery(_automation, options = {}) {
  let outlets = options.outlets || loadAll('pressOutlets')
  const pending = outlets.filter(outlet => outlet.domain
    && !(outlet.rssFeeds?.length || outlet.newsSitemaps?.length)
    && (!outlet.contentDiscoveryAt || options.retryChecked))
  const selected = pending.slice(0, Math.max(1, Number(options.limit || pending.length)))
  const byId = new Map(outlets.map(outlet => [outlet.id, outlet]))
  const batchSize = Math.min(100, Math.max(1, Number(options.concurrency || 80)))
  let checked = 0
  let outletsWithSources = 0
  let feeds = 0
  let sitemaps = 0
  const errors = []
  for (const batch of chunks(selected, batchSize)) {
    const results = await Promise.all(batch.map(async outlet => {
      try { return { outlet, result: await probeOutletSources(outlet, options.fetchOptions) } }
      catch (error) { return { outlet, error } }
    }))
    for (const item of results) {
      checked += 1
      if (item.error) {
        errors.push({ outletId: item.outlet.id, error: item.error.message })
        continue
      }
      const rssFeeds = [...new Set([...(item.outlet.rssFeeds || []), ...item.result.rssFeeds])]
      const newsSitemaps = [...new Set([...(item.outlet.newsSitemaps || []), ...item.result.newsSitemaps])]
      if (rssFeeds.length + newsSitemaps.length) outletsWithSources += 1
      feeds += item.result.rssFeeds.length
      sitemaps += item.result.newsSitemaps.length
      byId.set(item.outlet.id, {
        ...item.outlet, rssFeeds, newsSitemaps,
        contentDiscoveryAt: new Date().toISOString(),
        contentDiscoveryErrors: item.result.errors.slice(-3),
        updatedAt: new Date().toISOString(),
      })
    }
    outlets = outlets.map(outlet => byId.get(outlet.id) || outlet)
    saveAll('pressOutlets', outlets)
    options.onBatch?.({ checked, outletsWithSources, feeds, sitemaps })
  }
  return { runner: 'press-content-discovery', checked, outletsWithSources, feeds, sitemaps, errors }
}

function stableSlug(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100)
}

function shortHash(value) {
  let hash = 2166136261
  for (const char of String(value || '')) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619)
  return (hash >>> 0).toString(36)
}

function feedItems(xml, sourceUrl) {
  if (/<(?:urlset|sitemapindex)\b/i.test(String(xml || '').slice(0, 5000))) return parseNewsSitemap(xml, sourceUrl)
  return parsePressFeed(xml, sourceUrl).map(item => ({ ...item, source: 'rss', feedUrl: sourceUrl }))
}

function contactRecord(outlet, name, beats) {
  return {
    id: 'pc_byline-' + stableSlug(outlet.id + '-' + name),
    name,
    outlet: outlet.name,
    outletId: outlet.id,
    beats: beats.length ? beats : ['national-news'],
    title: 'Reporter',
    geo: outlet.geo,
    email: { value: '', status: 'unknown', source: '', verifiedAt: null },
    social: { bluesky: '', x: '', site: '' },
    bylineStats: { count90d: 0, lastAt: null },
    score: 0,
    scoreExplain: [],
    doNotPitch: false,
    suppressedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

export async function gdeltItemsForDomain(domain, options = {}) {
  const params = new URLSearchParams({
    query: 'domain:' + String(domain || '').replace(/^www\./, ''),
    mode: 'artlist', maxrecords: String(Math.min(50, Math.max(1, Number(options.limit || 12)))), format: 'json',
  })
  const payload = await fetchPressJson('https://api.gdeltproject.org/api/v2/doc/doc?' + params, {
    ...(options.fetchOptions || {}), respectRobots: false, initialBackoffMs: 60_000, maxRetries: 4,
  })
  return (payload?.articles || []).map(article => ({
    headline: article.title || '', creator: article.author || '', publishedAt: article.seendate || '',
    url: article.url || '', source: 'gdelt', feedUrl: '',
  })).filter(item => item.url)
}

export async function runPressArticleHarvest(_automation, options = {}) {
  const outlets = options.outlets || loadAll('pressOutlets')
  let contacts = options.contacts || loadAll('pressContacts')
  let bylines = options.bylines || loadAll('pressBylines')
  const pending = outlets.filter(outlet => (outlet.rssFeeds?.length || outlet.newsSitemaps?.length) && !outlet.articleHarvestAt)
  const selected = pending.slice(0, Math.max(1, Number(options.limit || pending.length)))
  const contactIds = new Set(contacts.map(item => item.id))
  const bylineIds = new Set(bylines.map(item => item.id))
  const outletMap = new Map(outlets.map(item => [item.id, item]))
  const batchSize = Math.min(100, Math.max(1, Number(options.concurrency || 80)))
  const errors = []
  let checked = 0
  let contactsCreated = 0
  let bylinesCreated = 0
  for (const batch of chunks(selected, batchSize)) {
    const harvested = await Promise.all(batch.map(async outlet => {
      const found = []
      const seenUrls = new Set()
      const harvestItem = async item => {
        if (!item?.url || seenUrls.has(item.url)) return
        seenUrls.add(item.url)
        try {
          const article = await fetchArticleAuthors(item, options.fetchOptions)
          const beats = classifyArticleBeat(item, article.html)
          for (const author of article.authors) found.push({ author, item, beats })
        } catch (error) {
          if (item.creator) found.push({ author: item.creator, item, beats: classifyArticleBeat(item) })
          else errors.push({ outletId: outlet.id, url: item.url, error: error.message })
        }
      }
      const sources = [...(outlet.rssFeeds || []), ...(outlet.newsSitemaps || [])]
      for (const sourceUrl of sources.slice(0, Math.max(1, Number(options.sourcesPerOutlet || 2)))) {
        try {
          const xml = await fetchPressText(sourceUrl, {
            timeoutMs: 8000, maxRetries: 1, initialBackoffMs: 5000,
            ...(options.fetchOptions || {}), maxBytes: 1_500_000,
          })
          let items = feedItems(xml, sourceUrl)
          if (/<sitemapindex\b/i.test(xml.slice(0, 5000))) {
            const nested = [...xml.matchAll(/<loc>([\s\S]*?)<\/loc>/gi)].map(match => match[1].trim().replace(/&amp;/g, '&'))
              .filter(url => /(?:news|post|article)/i.test(url)).slice(0, 2)
            for (const nestedUrl of nested) {
              try {
                const nestedXml = await fetchPressText(nestedUrl, {
                  timeoutMs: 8000, maxRetries: 1, initialBackoffMs: 5000,
                  ...(options.fetchOptions || {}), maxBytes: 1_500_000,
                })
                items.push(...parseNewsSitemap(nestedXml, nestedUrl))
              } catch (error) {
                errors.push({ outletId: outlet.id, sourceUrl: nestedUrl, error: error.message })
              }
            }
          }
          items = items.slice(0, Math.max(1, Number(options.articlesPerOutlet || 20)))
          for (const item of items) await harvestItem(item)
        } catch (error) {
          errors.push({ outletId: outlet.id, sourceUrl, error: error.message })
        }
      }
      if (options.useGdelt === true && found.length < Math.max(1, Number(options.gdeltMinimumAuthors || 3))) {
        try {
          const items = await gdeltItemsForDomain(outlet.domain, { limit: options.articlesPerOutlet || 20, fetchOptions: options.fetchOptions })
          for (const item of items) await harvestItem(item)
        } catch (error) {
          errors.push({ outletId: outlet.id, sourceUrl: 'gdelt', error: error.message })
        }
      }
      return { outlet, found }
    }))
    for (const result of harvested) {
      checked += 1
      for (const found of result.found) {
        const contact = contactRecord(result.outlet, found.author, found.beats)
        if (!contactIds.has(contact.id)) {
          contactIds.add(contact.id)
          contacts.push(contact)
          contactsCreated += 1
        }
        const identity = found.author + '-' + (found.item.url || result.outlet.id + '-' + found.item.headline)
        const bylineId = 'pby_' + stableSlug(found.author + '-' + found.item.headline).slice(0, 72) + '-' + shortHash(identity)
        if (!bylineIds.has(bylineId)) {
          bylineIds.add(bylineId)
          bylines.push({
            id: bylineId,
            contactId: contact.id,
            outletId: result.outlet.id,
            url: found.item.url,
            headline: found.item.headline,
            publishedAt: found.item.publishedAt,
            beat: found.beats[0] || 'national-news',
            source: found.item.source || 'article',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          })
          bylinesCreated += 1
        }
      }
      outletMap.set(result.outlet.id, { ...result.outlet, articleHarvestAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
    }
    saveAll('pressContacts', contacts)
    saveAll('pressBylines', bylines)
    saveAll('pressOutlets', outlets.map(outlet => outletMap.get(outlet.id) || outlet))
    options.onBatch?.({ checked, contactsCreated, bylinesCreated })
  }
  return { runner: 'press-article-harvest', checked, contactsCreated, bylinesCreated, errors }
}

export async function runPressGdeltArticleBackfill(_automation, options = {}) {
  const outlets = options.outlets || loadAll('pressOutlets')
  let contacts = options.contacts || loadAll('pressContacts')
  let bylines = options.bylines || loadAll('pressBylines')
  const selected = outlets.filter(outlet => outlet.domain && !outlet.gdeltHarvestAt)
    .slice(0, Math.max(1, Number(options.limit || 100)))
  const contactIds = new Set(contacts.map(item => item.id))
  const bylineIds = new Set(bylines.map(item => item.id))
  const outletMap = new Map(outlets.map(item => [item.id, item]))
  const errors = []
  let checked = 0
  let contactsCreated = 0
  let bylinesCreated = 0
  for (const batch of chunks(selected, Math.min(20, Math.max(1, Number(options.batchSize || 10))))) {
    const results = await Promise.all(batch.map(async outlet => {
      const found = []
      try {
        const items = await gdeltItemsForDomain(outlet.domain, { limit: options.articlesPerOutlet || 10, fetchOptions: options.fetchOptions })
        for (const item of items) {
          try {
            const article = await fetchArticleAuthors(item, options.fetchOptions)
            const beats = classifyArticleBeat(item, article.html)
            for (const author of article.authors) found.push({ author, item, beats })
          } catch (error) {
            errors.push({ outletId: outlet.id, url: item.url, error: error.message })
          }
        }
      } catch (error) {
        errors.push({ outletId: outlet.id, sourceUrl: 'gdelt', error: error.message })
      }
      return { outlet, found }
    }))
    for (const result of results) {
      checked += 1
      for (const found of result.found) {
        const contact = contactRecord(result.outlet, found.author, found.beats)
        if (!contactIds.has(contact.id)) { contactIds.add(contact.id); contacts.push(contact); contactsCreated += 1 }
        const identity = found.author + '-' + found.item.url
        const bylineId = 'pby_' + stableSlug(found.author + '-' + found.item.headline).slice(0, 72) + '-' + shortHash(identity)
        if (!bylineIds.has(bylineId)) {
          bylineIds.add(bylineId)
          bylines.push({
            id: bylineId, contactId: contact.id, outletId: result.outlet.id, url: found.item.url,
            headline: found.item.headline, publishedAt: found.item.publishedAt,
            beat: found.beats[0] || 'national-news', source: 'gdelt',
            createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
          })
          bylinesCreated += 1
        }
      }
      outletMap.set(result.outlet.id, { ...result.outlet, gdeltHarvestAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
    }
    saveAll('pressContacts', contacts)
    saveAll('pressBylines', bylines)
    saveAll('pressOutlets', outlets.map(outlet => outletMap.get(outlet.id) || outlet))
    options.onBatch?.({ checked, contactsCreated, bylinesCreated })
  }
  return { runner: 'press-gdelt-article-backfill', checked, contactsCreated, bylinesCreated, errors }
}

export const BLUESKY_PRIORITY_BEATS = Object.freeze([
  'technology','startups-vc','cybersecurity','health','medicine','science','sports','real-estate','environment','climate',
])

const BLUESKY_API = 'https://public.api.bsky.app/xrpc/'
const JOURNALIST_BIO = /\b(?:journalist|reporter|editor|correspondent|news writer|columnist|producer|news director|covers?)\b/i

function publicEmail(value) {
  return String(value || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]?.toLowerCase() || ''
}

export function pruneUnlinkedBlueskyContacts(data = {}) {
  const outlets = data.outlets || loadAll('pressOutlets')
  const contacts = data.contacts || loadAll('pressContacts')
  const result = auditBlueskyOutletLinks({ contacts, outlets })
  if (!data.contacts) saveAll('pressContacts', result.contacts)
  return { before: contacts.length, after: result.contacts.length, removed: 0, ...result.stats }
}

function blueskyApiUrl(method, params = {}) {
  return BLUESKY_API + method + '?' + new URLSearchParams(params)
}

async function starterPackProfiles(beat, options = {}) {
  const fetchOptions = { initialBackoffMs: 30_000, maxRetries: 2, ...(options.fetchOptions || {}), respectRobots: false }
  const search = await fetchPressJson(blueskyApiUrl('app.bsky.graph.searchStarterPacks', {
    q: beat.replaceAll('-', ' '), limit: String(Math.min(100, Number(options.packsPerBeat || 100))),
  }), fetchOptions)
  const packs = search?.starterPacks || []
  const packByList = new Map(packs.map(pack => [pack?.record?.list || pack?.list?.uri, pack]))
  const listUris = [...new Set(packs.map(pack => pack?.record?.list || pack?.list?.uri).filter(Boolean))]
    .filter(uri => !options.seenLists?.has(uri))
  const profiles = []
  for (const list of listUris) {
    options.seenLists?.add(list)
    let cursor = ''
    for (let page = 0; page < Math.max(1, Number(options.pagesPerPack || 5)); page += 1) {
      const payload = await fetchPressJson(blueskyApiUrl('app.bsky.graph.getList', {
        list, limit: '100', ...(cursor ? { cursor } : {}),
      }), fetchOptions)
      const pack = packByList.get(list)
      const packContext = [pack?.record?.name, pack?.record?.description, payload?.list?.name, payload?.list?.description].filter(Boolean).join(' ')
      profiles.push(...(payload?.items || []).map(item => item?.subject ? { ...item.subject, _packContext: packContext } : null).filter(Boolean))
      cursor = payload?.cursor || ''
      if (!cursor) break
    }
  }
  return profiles
}

export async function runPressBlueskyStarterPacks(_automation, options = {}) {
  const outlets = options.outlets || loadAll('pressOutlets')
  let contacts = options.contacts || loadAll('pressContacts')
  const ids = new Set(contacts.map(item => item.id))
  const handles = new Set(contacts.map(item => item.social?.bluesky).filter(Boolean))
  const catalogBeats = loadAll('pressBeats').map(item => item.slug || item.id).filter(Boolean)
  const beats = options.beats || [...new Set([...BLUESKY_PRIORITY_BEATS, ...catalogBeats])]
  const seenLists = new Set()
  const errors = []
  let profilesChecked = 0
  let contactsCreated = 0
  for (const beat of beats) {
    try {
      const profiles = await starterPackProfiles(beat, { ...options, seenLists })
      for (const profile of profiles) {
        profilesChecked += 1
        const description = String(profile?.description || '')
        if (!profile?.handle || handles.has(profile.handle) || !JOURNALIST_BIO.test(description)) continue
        const outlet = matchBlueskyOutletByDomain(profile, outlets)
        if (!outlet) continue
        const name = String(profile.displayName || profile.handle).trim()
        const id = 'pc_bsky-' + stableSlug(profile.did || profile.handle)
        if (ids.has(id)) continue
        const inferred = [...new Set([beat, ...classifyBeatText(description)])].slice(0, 4)
        const email = publicEmail(description)
        contacts.push({
          ...contactRecord(outlet, name, inferred),
          id,
          title: description.match(/\b(?:senior |staff |associate |assistant )?(?:journalist|reporter|editor|correspondent|columnist|producer|news director)\b/i)?.[0] || 'Journalist',
          email: { value: email, status: email ? 'published' : 'unknown', source: email ? 'bluesky-bio' : '', verifiedAt: email ? new Date().toISOString() : null },
          social: { bluesky: profile.handle, blueskyFollowers: Number(profile.followersCount || 0), x: '', site: '' },
          doNotPitch: /\b(?:do not pitch|no pitches|no pr|not for pitches)\b/i.test(description),
          bio: description,
          linkContext: String(profile._packContext || ''),
          source: 'bluesky-starter-pack',
          linkEvidence: 'profile-domain',
        })
        ids.add(id)
        handles.add(profile.handle)
        contactsCreated += 1
      }
      saveAll('pressContacts', contacts)
      options.onBeat?.({ beat, profilesChecked, contactsCreated })
      if (contactsCreated >= Number(options.target || 1500)) break
    } catch (error) {
      errors.push({ beat, error: error.message })
    }
  }
  return { runner: 'press-bluesky-starter-packs', beats: beats.length, profilesChecked, contactsCreated, errors }
}

export const STATE_PRESS_ASSOCIATIONS = Object.freeze([
  ['AL','Alabama Press Association','https://alabamapress.org'],['AK','Alaska Press Club','https://alaskapressclub.com'],
  ['AZ','Arizona Newspapers Association','https://aznewsmedia.com'],['AR','Arkansas Press Association','https://arkansaspress.org'],
  ['CA','California News Publishers Association','https://cnpa.com'],['CO','Colorado Press Association','https://coloradopressassociation.com'],
  ['CT','Connecticut Daily Newspapers Association','https://ctdailynewspapers.com'],['DE','Maryland Delaware DC Press Association','https://mddcpress.com'],
  ['FL','Florida Press Association','https://flpress.com'],['GA','Georgia Press Association','https://gapress.org'],
  ['HI','Hawaii Publishers Association','https://hawaiipublishersassociation.com'],['ID','Newspaper Association of Idaho','https://newspaperassociationofidaho.com'],
  ['IL','Illinois Press Association','https://illinoispress.org'],['IN','Hoosier State Press Association','https://hspainfo.net'],
  ['IA','Iowa Newspaper Association','https://inanews.com'],['KS','Kansas Press Association','https://kspress.com'],
  ['KY','Kentucky Press Association','https://kypress.com'],['LA','Louisiana Press Association','https://lapress.com'],
  ['ME','Maine Press Association','https://mainepressassociation.org'],['MD','Maryland Delaware DC Press Association','https://mddcpress.com'],
  ['MA','New England Newspaper and Press Association','https://nenpa.com'],['MI','Michigan Press Association','https://michiganpress.org'],
  ['MN','Minnesota Newspaper Association','https://mna.org'],['MS','Mississippi Press Association','https://mspress.org'],
  ['MO','Missouri Press Association','https://mopress.com'],['MT','Montana Newspaper Association','https://mtnewspapers.com'],
  ['NE','Nebraska Press Association','https://nebpress.com'],['NV','Nevada Press Association','https://nvpress.com'],
  ['NH','New England Newspaper and Press Association','https://nenpa.com'],['NJ','New Jersey Press Association','https://njpa.org'],
  ['NM','New Mexico Press Association','https://nmpress.org'],['NY','New York News Publishers Association','https://nynpa.com'],
  ['NC','North Carolina Press Association','https://ncpress.com'],['ND','North Dakota Newspaper Association','https://ndna.com'],
  ['OH','Ohio News Media Association','https://ohionews.org'],['OK','Oklahoma Press Association','https://okpress.com'],
  ['OR','Oregon Newspaper Publishers Association','https://orenews.com'],['PA','Pennsylvania NewsMedia Association','https://panewsmedia.org'],
  ['RI','New England Newspaper and Press Association','https://nenpa.com'],['SC','South Carolina Press Association','https://scpress.org'],
  ['SD','South Dakota Newspaper Association','https://sdna.com'],['TN','Tennessee Press Association','https://tnpress.com'],
  ['TX','Texas Press Association','https://texaspress.com'],['UT','Utah Press Association','https://utahpress.com'],
  ['VT','Vermont Press Association','https://vermontpressassociation.com'],['VA','Virginia Press Association','https://vpa.net'],
  ['WA','Washington Newspaper Publishers Association','https://wnpa.com'],['WV','West Virginia Press Association','https://wvpress.org'],
  ['WI','Wisconsin Newspaper Association','https://wnanews.com'],['WY','Wyoming Press Association','https://wyopress.org'],
].map(([state, name, homeUrl]) => ({ state, name, homeUrl })))

export function isObviousAssociationNonOutletName(value) {
  const name = String(value || '').replace(/\s+/g, ' ').trim()
  const words = name.split(/\s+/).filter(Boolean)
  return !name || words.length > 10
    || /\b(?:press releases?|find a newspaper|newspaper week|news tracker|newspaper in education|press association|media release|local news project|news reader|foundation|podcast|convention|aspiring journalist|mainstream news)\b/i.test(name)
}

export function parseAssociationDirectory(html, association, pageUrl, existingOutlets = []) {
  const associationHost = new URL(pageUrl).hostname.toLowerCase().replace(/^www\./, '')
  const knownByDomain = new Map(existingOutlets.filter(item => item.domain).map(item => [item.domain.replace(/^www\./, '').toLowerCase(), item]))
  const outlets = []
  const contacts = []
  for (const match of String(html || '').matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const url = absoluteUrl(match[1].replace(/&amp;/g, '&'), pageUrl)
    const name = match[2].replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim()
    if (isObviousAssociationNonOutletName(name)) continue
    let domain = ''
    try { domain = new URL(url).hostname.toLowerCase().replace(/^www\./, '') } catch {}
    if (!domain || domain === associationHost || isDeniedPressDomain(domain)) continue
    const known = knownByDomain.get(domain)
    if (!known && !/\b(?:news|newspaper|times|tribune|herald|gazette|journal|observer|record|press|post|daily|weekly|dispatch|sun|star)\b/i.test(name)) continue
    outlets.push(known || {
      id: 'po_assoc-' + association.state.toLowerCase() + '-' + stableSlug(domain), name: name || domain, domain,
      type: 'newspaper', geo: { scope: 'state', state: association.state, metro: '', county: '', fips: '' }, tier: 4,
      rssFeeds: [], newsSitemaps: [], mastheadUrl: url, emailPattern: { pattern: '', confidence: 0, examples: [] },
      sources: [{ type: 'state-press-association', url: pageUrl }], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    })
  }
  const document = String(html || '')
  for (const match of document.matchAll(/([A-Z][A-Za-z.' -]{2,80})[^@<>]{0,120}\b(?:editor|publisher|news director)\b[^@<>]{0,120}([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi)) {
    const context = document.slice(Math.max(0, match.index - 600), match.index)
    const anchors = [...context.matchAll(/<a\b[^>]*href=["']([^"']+)["']/gi)]
    let outletDomain = ''
    try { outletDomain = new URL(absoluteUrl(anchors.at(-1)?.[1], pageUrl)).hostname.toLowerCase().replace(/^www\./, '') } catch {}
    contacts.push({ name: match[1].trim(), title: match[0].match(/\b(?:editor|publisher|news director)\b/i)?.[0] || 'Editor', email: match[2].toLowerCase(), outletDomain })
  }
  return { outlets: [...new Map(outlets.map(item => [item.domain, item])).values()], contacts }
}

export function pruneAssociationImportArtifacts(data = {}) {
  const outlets = data.outlets || loadAll('pressOutlets')
  const contacts = data.contacts || loadAll('pressContacts')
  const bylines = data.bylines || loadAll('pressBylines')
  const removedOutletIds = new Set(outlets.filter(outlet => (outlet.sources || []).some(source => source.type === 'state-press-association')
    && isObviousAssociationNonOutletName(outlet.name)).map(outlet => outlet.id))
  const nextOutlets = outlets.filter(outlet => !removedOutletIds.has(outlet.id))
  const nextContacts = contacts.filter(contact => !removedOutletIds.has(contact.outletId))
  const nextBylines = bylines.filter(byline => !removedOutletIds.has(byline.outletId))
  if (!data.outlets) saveAll('pressOutlets', nextOutlets)
  if (!data.contacts) saveAll('pressContacts', nextContacts)
  if (!data.bylines) saveAll('pressBylines', nextBylines)
  return {
    outletsRemoved: outlets.length - nextOutlets.length,
    contactsRemoved: contacts.length - nextContacts.length,
    bylinesRemoved: bylines.length - nextBylines.length,
  }
}

export async function runPressAssociationDirectories(_automation, options = {}) {
  let outlets = options.outlets || loadAll('pressOutlets')
  let contacts = options.contacts || loadAll('pressContacts')
  const associations = options.associations || STATE_PRESS_ASSOCIATIONS
  const outletByDomain = new Map(outlets.filter(item => item.domain).map(item => [item.domain, item]))
  const contactIds = new Set(contacts.map(item => item.id))
  const publicDirectories = []
  const blockedOrPrivate = []
  let outletsCreated = 0
  let contactsCreated = 0
  const probed = await Promise.all(associations.map(async association => {
    const candidates = ['', '/members/', '/member-newspapers/', '/newspapers/', '/directory/'].map(path => association.homeUrl.replace(/\/$/, '') + path)
    let found = null
    for (const url of candidates) {
      try {
        const html = await fetchPressText(url, { ...(options.fetchOptions || {}), maxBytes: 1_500_000 })
        const parsed = parseAssociationDirectory(html, association, url, outlets)
        if (parsed.outlets.length >= 5 || parsed.contacts.length) { found = { url, ...parsed }; break }
      } catch (error) {
        if (/robots\.txt disallows/i.test(error.message)) break
      }
    }
    return { association, found }
  }))
  for (const { association, found } of probed) {
    if (!found) {
      blockedOrPrivate.push({ state: association.state, association: association.name })
      continue
    }
    publicDirectories.push({ state: association.state, association: association.name, url: found.url, outlets: found.outlets.length, contacts: found.contacts.length })
    for (const outlet of found.outlets) {
      if (!outletByDomain.has(outlet.domain)) { outlets.push(outlet); outletByDomain.set(outlet.domain, outlet); outletsCreated += 1 }
    }
    for (const foundContact of found.contacts) {
      const nearbyOutlet = found.outlets.find(item => item.domain === foundContact.outletDomain)
      if (!nearbyOutlet) continue
      const id = 'pc_assoc-' + stableSlug(association.state + '-' + foundContact.email)
      if (contactIds.has(id)) continue
      contacts.push({
        ...contactRecord(nearbyOutlet, foundContact.name, ['local-news']), id, title: foundContact.title,
        email: { value: foundContact.email, status: 'published', source: 'state-press-association', verifiedAt: new Date().toISOString() },
        source: 'state-press-association',
      })
      contactIds.add(id)
      contactsCreated += 1
    }
    options.onAssociation?.(publicDirectories.at(-1))
  }
  saveAll('pressOutlets', outlets)
  saveAll('pressContacts', contacts)
  return { runner: 'press-association-directories', checked: associations.length, publicDirectories, blockedOrPrivate, outletsCreated, contactsCreated }
}

export function pressDeskMetrics(data = {}) {
  const outlets = data.outlets || loadAll('pressOutlets')
  const contacts = data.contacts || loadAll('pressContacts')
  const bylines = data.bylines || loadAll('pressBylines')
  const national = new Map()
  const states = new Map()
  const metros = new Map()
  for (const contact of contacts) {
    for (const beat of contact.beats || []) {
      national.set(beat, (national.get(beat) || 0) + 1)
    }
    if (contact.geo?.state) states.set(contact.geo.state, (states.get(contact.geo.state) || 0) + 1)
    if (contact.geo?.metro) metros.set(contact.geo.metro, (metros.get(contact.geo.metro) || 0) + 1)
  }
  return {
    outlets: outlets.length,
    outletsWithDomain: outlets.filter(item => item.domain).length,
    outletsWithFeeds: outlets.filter(item => item.rssFeeds?.length || item.newsSitemaps?.length).length,
    rssOutlets: outlets.filter(item => item.rssFeeds?.length).length,
    sitemapOutlets: outlets.filter(item => item.newsSitemaps?.length).length,
    bylines: bylines.length,
    contacts: contacts.length,
    contactsWithBeat: contacts.filter(item => item.beats?.length).length,
    contactsWithEmail: contacts.filter(item => item.email?.value).length,
    blueskyContacts: contacts.filter(item => item.source === 'bluesky-starter-pack').length,
    nationalBeats20: [...national.values()].filter(count => count >= 20).length,
    states20: [...states.values()].filter(count => count >= 20).length,
    metros20: [...metros.values()].filter(count => count >= 20).length,
    nationalBeatGaps: [...loadAll('pressBeats').map(item => item.slug || item.id)].filter(beat => (national.get(beat) || 0) < 20),
    stateGaps: [...new Set(outlets.map(item => item.geo?.state).filter(Boolean))].filter(state => (states.get(state) || 0) < 20),
    metroGaps: [...new Set(outlets.map(item => item.geo?.metro).filter(Boolean))].filter(metro => (metros.get(metro) || 0) < 20),
  }
}

export function syncPressContactGeography(data = {}) {
  const outlets = data.outlets || loadAll('pressOutlets')
  const contacts = data.contacts || loadAll('pressContacts')
  const outletById = new Map(outlets.map(item => [item.id, item]))
  let updated = 0
  const next = contacts.map(contact => {
    const geo = outletById.get(contact.outletId)?.geo
    if (!geo || JSON.stringify(geo) === JSON.stringify(contact.geo || {})) return contact
    updated += 1
    return { ...contact, geo, updatedAt: new Date().toISOString() }
  })
  if (!data.contacts) saveAll('pressContacts', next)
  return { contacts: next.length, updated }
}
