// URL report engine — takes a website URL, measures it for real (multi-page
// crawl + Google PageSpeed), computes deterministic 0-100 scores per report
// type, draws inline-SVG charts, and has Gemini write the narrative from
// those measurements only. Output is a self-contained HTML document filed to
// the owning account. Report types: seo, aeo (answer engines), geo
// (generative/AI engines).
import { JSDOM } from 'jsdom'
import { readData, writeData } from './dataStore'
import { getCred } from './agent-creds'
import { safeFetchText } from './safe-url-fetch'

export const URL_REPORT_TYPES = {
  seo: { id: 'seo', label: 'SEO' },
  aeo: { id: 'aeo', label: 'AEO' },
  geo: { id: 'geo', label: 'GEO' },
}

// Concierge portal pricing (100 credits = $1): one complete SEO + AEO + GEO
// report for $4.99. The portal API always requests all three disciplines, but
// this helper remains defensive for internal callers and returns zero when no
// valid discipline was supplied.
export function urlReportPriceCredits(types = []) {
  const count = [...new Set(types.map(type => String(type || '').toLowerCase()))].filter(type => URL_REPORT_TYPES[type]).length
  if (!count) return 0
  return 499
}

const FETCH_UA = 'FarringtonReportBot/1.0 (+https://company.example.com)'
const MAX_EXTRA_PAGES = 3

// Document palette (warm brand, white surface). Status colors carry meaning
// and always ship with a visible number or label, never color alone.
const INK = '#3a352d'
const INK_MUTED = '#8a8275'
const ACCENT = '#C15F3C'
const STATUS = { good: '#1e7a46', warning: '#996c1f', serious: '#b3401f' }
const scoreStatus = score => (score >= 80 ? 'good' : score >= 60 ? 'warning' : 'serious')

export class UrlReportError extends Error {
  constructor(message, meta = {}) {
    super(message)
    this.name = 'UrlReportError'
    Object.assign(this, meta)
  }
}

export function normalizeReportUrl(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  try {
    const url = new URL(withScheme)
    if (!/^https?:$/.test(url.protocol) || !url.hostname.includes('.')) return ''
    if (url.username || url.password) return ''
    if (/^(localhost|.*\.localhost|.*\.local|.*\.internal|metadata\.google\.internal)$/i.test(url.hostname)) return ''
    return url.toString()
  } catch {
    return ''
  }
}

async function fetchText(url, timeoutMs = 12000) {
  try {
    return await safeFetchText(url, {
      headers: { 'User-Agent': FETCH_UA, Accept: 'text/html,application/xhtml+xml,text/plain,*/*' },
      timeoutMs,
    })
  } catch (error) {
    return { ok: false, status: 0, text: '', finalUrl: url, error: error?.message || 'fetch failed' }
  }
}

function analyzeHtml(html, baseUrl) {
  const dom = new JSDOM(html)
  const doc = dom.window.document
  const origin = new URL(baseUrl).origin

  const text = doc.body ? doc.body.textContent.replace(/\s+/g, ' ').trim() : ''
  const links = [...doc.querySelectorAll('a[href]')]
  let internal = 0
  let external = 0
  const internalPaths = []
  for (const link of links) {
    try {
      const href = new URL(link.getAttribute('href'), baseUrl)
      if (href.origin === origin) {
        internal += 1
        const path = href.pathname.replace(/\/$/, '')
        if (path && path !== new URL(baseUrl).pathname.replace(/\/$/, '') && !/\.(pdf|jpg|jpeg|png|gif|svg|webp|mp4|zip)$/i.test(path)) {
          internalPaths.push(path)
        }
      } else if (/^https?:$/.test(href.protocol)) external += 1
    } catch {}
  }

  const images = [...doc.querySelectorAll('img')]
  const jsonLdTypes = []
  let faqSchema = false
  for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const parsed = JSON.parse(script.textContent)
      const nodes = Array.isArray(parsed) ? parsed : (parsed['@graph'] || [parsed])
      for (const node of nodes) {
        const type = node && node['@type']
        if (type) jsonLdTypes.push(...(Array.isArray(type) ? type : [type]).map(String))
      }
    } catch {}
  }
  if (jsonLdTypes.some(type => /faqpage/i.test(type))) faqSchema = true

  const headings = level => [...doc.querySelectorAll(level)].map(node => node.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean)
  const h1s = headings('h1')
  const h2s = headings('h2')

  return {
    title: (doc.querySelector('title')?.textContent || '').trim(),
    metaDescription: doc.querySelector('meta[name="description"]')?.getAttribute('content')?.trim() || '',
    canonical: doc.querySelector('link[rel="canonical"]')?.getAttribute('href') || '',
    lang: doc.documentElement.getAttribute('lang') || '',
    viewport: Boolean(doc.querySelector('meta[name="viewport"]')),
    ogTagCount: doc.querySelectorAll('meta[property^="og:"]').length,
    h1Count: h1s.length,
    h1Sample: h1s.slice(0, 3),
    h2Count: h2s.length,
    h2Sample: h2s.slice(0, 8),
    questionHeadings: [...h1s, ...h2s].filter(heading => /^(who|what|when|where|why|how|can|does|is|are|should)\b/i.test(heading) || heading.endsWith('?')).length,
    wordCount: text ? text.split(' ').length : 0,
    imageCount: images.length,
    imagesMissingAlt: images.filter(img => !String(img.getAttribute('alt') || '').trim()).length,
    missingAltSrcs: images.filter(img => !String(img.getAttribute('alt') || '').trim()).map(img => String(img.getAttribute('src') || '').slice(0, 120)).filter(Boolean).slice(0, 5),
    internalLinks: internal,
    externalLinks: external,
    internalPaths,
    jsonLdTypes: [...new Set(jsonLdTypes)].slice(0, 12),
    faqSchema,
  }
}

async function crawlSite(url) {
  const homepage = await fetchText(url)
  if (!homepage.ok || !homepage.text) {
    throw new UrlReportError(`Could not fetch ${url} (${homepage.status || homepage.error || 'no response'})`, { stage: 'crawl' })
  }
  const origin = new URL(homepage.finalUrl).origin
  const home = analyzeHtml(homepage.text, homepage.finalUrl)

  // Crawl a few distinct internal pages so the report covers the site, not
  // just the front door.
  const seen = new Set()
  const candidates = home.internalPaths.filter(path => {
    if (seen.has(path)) return false
    seen.add(path)
    return true
  }).slice(0, 12)
  const pages = [{ path: new URL(homepage.finalUrl).pathname || '/', label: 'Homepage', ...home }]
  for (const path of candidates) {
    if (pages.length > MAX_EXTRA_PAGES) break
    const result = await fetchText(`${origin}${path}`, 9000)
    if (!result.ok || !result.text || !/<html/i.test(result.text.slice(0, 2000))) continue
    pages.push({ path, label: path.split('/').filter(Boolean).pop() || path, ...analyzeHtml(result.text, result.finalUrl) })
  }

  const [robots, sitemap, llms] = await Promise.all([
    fetchText(`${origin}/robots.txt`, 6000),
    fetchText(`${origin}/sitemap.xml`, 6000),
    fetchText(`${origin}/llms.txt`, 6000),
  ])

  return {
    requestedUrl: url,
    finalUrl: homepage.finalUrl,
    httpsResolved: homepage.finalUrl.startsWith('https://'),
    page: home,
    pages,
    pagesCrawled: pages.length,
    robotsTxt: robots.ok,
    robotsBlocksAll: robots.ok && /^\s*user-agent:\s*\*\s*[\r\n]+\s*disallow:\s*\/\s*$/im.test(robots.text),
    sitemapXml: sitemap.ok && /<(urlset|sitemapindex)/i.test(sitemap.text),
    llmsTxt: llms.ok && llms.text.trim().length > 0 && !/<html/i.test(llms.text),
  }
}

async function fetchPageSpeed(url) {
  const key = String(process.env.PAGESPEED_API_KEY || process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || getCred('gemini')?.key || getCred('google')?.key || '').trim()
  const endpoint = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed')
  endpoint.searchParams.set('url', url)
  endpoint.searchParams.set('strategy', 'mobile')
  endpoint.searchParams.append('category', 'PERFORMANCE')
  endpoint.searchParams.append('category', 'SEO')
  if (key) endpoint.searchParams.set('key', key)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 45000)
  try {
    const response = await fetch(endpoint, { signal: controller.signal })
    const body = await response.json().catch(() => null)
    if (!response.ok || !body?.lighthouseResult) return null
    const lighthouse = body.lighthouseResult
    const audit = id => lighthouse.audits?.[id]?.displayValue || ''
    return {
      performanceScore: Math.round((lighthouse.categories?.performance?.score || 0) * 100),
      seoScore: Math.round((lighthouse.categories?.seo?.score || 0) * 100),
      lcp: audit('largest-contentful-paint'),
      cls: audit('cumulative-layout-shift'),
      tbt: audit('total-blocking-time'),
      speedIndex: audit('speed-index'),
    }
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

// Deterministic scores from the measurements. Each factor is a real check the
// report also lists, so the number is always explainable.
function computeScores(facts, pagespeed) {
  const page = facts.page
  const pages = facts.pages || [page]
  const avg = pick => pages.reduce((sum, item) => sum + pick(item), 0) / pages.length
  const clamp = value => Math.max(0, Math.min(100, Math.round(value)))
  const altCoverage = page.imageCount ? 1 - page.imagesMissingAlt / page.imageCount : 1

  const seo = clamp(
    (page.title && page.title.length >= 15 && page.title.length <= 70 ? 13 : page.title ? 7 : 0)
    + (page.metaDescription && page.metaDescription.length >= 50 && page.metaDescription.length <= 170 ? 13 : page.metaDescription ? 7 : 0)
    + (avg(item => item.h1Count === 1 ? 1 : 0) * 10)
    + (page.viewport ? 5 : 0)
    + (facts.httpsResolved ? 8 : 0)
    + (page.canonical ? 5 : 0)
    + (facts.sitemapXml ? 8 : 0)
    + (facts.robotsTxt && !facts.robotsBlocksAll ? 5 : 0)
    + (altCoverage * 10)
    + (page.internalLinks >= 10 ? 5 : page.internalLinks / 2)
    + (avg(item => Math.min(1, item.wordCount / 300)) * 8)
    + (pagespeed ? (pagespeed.seoScore / 100) * 10 : 5)
  )

  const aeo = clamp(
    (page.faqSchema ? 25 : 0)
    + (Math.min(1, avg(item => item.questionHeadings) / 3) * 20)
    + (page.jsonLdTypes.length ? 15 : 0)
    + (page.metaDescription ? 10 : 0)
    + (Math.min(1, avg(item => item.h2Count) / 4) * 15)
    + (Math.min(1, avg(item => item.wordCount) / 500) * 15)
  )

  const geo = clamp(
    (facts.llmsTxt ? 28 : 0)
    + (Math.min(1, page.jsonLdTypes.length / 2) * 20)
    + (facts.sitemapXml ? 10 : 0)
    + (facts.robotsTxt && !facts.robotsBlocksAll ? 10 : 0)
    + (Math.min(1, page.ogTagCount / 3) * 10)
    + (Math.min(1, avg(item => item.wordCount) / 400) * 12)
    + (page.canonical ? 10 : 0)
  )

  return { seo, aeo, geo }
}

// ---------- inline SVG charts (self-contained, print-safe) ----------

function esc(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Donut gauge: status color by band, number always visible in ink.
function gaugeSvg(score, label) {
  const color = STATUS[scoreStatus(score)]
  const radius = 44
  const circumference = 2 * Math.PI * radius
  const filled = (score / 100) * circumference
  return [
    `<svg width="128" height="148" viewBox="0 0 128 148" style="max-width:100%;height:auto;" role="img" aria-label="${esc(label)} score ${score} out of 100">`,
    `<circle cx="64" cy="64" r="${radius}" fill="none" stroke="#eee8dd" stroke-width="11"/>`,
    `<circle cx="64" cy="64" r="${radius}" fill="none" stroke="${color}" stroke-width="11" stroke-linecap="round"`,
    ` stroke-dasharray="${filled.toFixed(1)} ${circumference.toFixed(1)}" transform="rotate(-90 64 64)"/>`,
    `<text x="64" y="60" text-anchor="middle" font-size="28" font-weight="700" fill="${INK}">${score}</text>`,
    `<text x="64" y="80" text-anchor="middle" font-size="11" fill="${INK_MUTED}">/ 100</text>`,
    `<text x="64" y="140" text-anchor="middle" font-size="14" font-weight="600" fill="${INK}">${esc(label)}</text>`,
    `</svg>`,
  ].join('')
}

// Horizontal bars, single hue, thin marks with rounded data-ends, direct value
// labels — no legend needed for a single series.
function hBarSvg(rows, { max = 100, unit = '', width = 560 } = {}) {
  const labelWidth = 170
  const barArea = width - labelWidth - 70
  const rowHeight = 30
  const height = rows.length * rowHeight + 8
  const parts = [`<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="max-width:100%;height:auto;" role="img" aria-label="Bar chart">`]
  rows.forEach((row, index) => {
    const y = index * rowHeight + 8
    const value = Math.max(0, Math.min(max, row.value))
    const barWidth = Math.max(4, (value / max) * barArea)
    const color = row.status ? STATUS[row.status] : ACCENT
    parts.push(
      `<text x="${labelWidth - 10}" y="${y + 12}" text-anchor="end" font-size="13" fill="${INK}">${esc(row.label)}</text>`,
      `<rect x="${labelWidth}" y="${y}" width="${barArea}" height="12" rx="4" fill="#f1ece3"/>`,
      `<rect x="${labelWidth}" y="${y}" width="${barWidth.toFixed(1)}" height="12" rx="4" fill="${color}"/>`,
      `<text x="${labelWidth + barWidth + 8}" y="${y + 11}" font-size="13" font-weight="600" fill="${INK}">${esc(row.display ?? `${row.value}${unit}`)}</text>`,
    )
  })
  parts.push('</svg>')
  return parts.join('')
}

function checklistHtml(items) {
  return items.map(item => {
    const color = item.pass ? STATUS.good : STATUS.serious
    const mark = item.pass ? '✓' : '✕'
    return `<tr>`
      + `<td style="padding:7px 10px;border-bottom:1px solid #eee8dd;width:26px;"><span style="display:inline-block;width:20px;height:20px;border-radius:10px;background:${color};color:#fff;text-align:center;line-height:20px;font-size:12px;font-weight:700;">${mark}</span></td>`
      + `<td style="padding:7px 10px;border-bottom:1px solid #eee8dd;font-weight:600;color:${INK};">${esc(item.label)}</td>`
      + `<td style="padding:7px 10px;border-bottom:1px solid #eee8dd;color:${INK_MUTED};font-size:12px;">${esc(item.note || '')}</td>`
      + `</tr>`
  }).join('')
}

async function geminiNarrative(facts, pagespeed, scores, types) {
  const key = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || getCred('gemini')?.key || getCred('google')?.key
  if (!key) return { narrative: null, usage: null, model: '' }
  const model = process.env.URL_REPORT_GEMINI_MODEL || 'gemini-2.5-flash'
  const typeLabels = types.map(type => URL_REPORT_TYPES[type].label).join(', ')

  const prompt = [
    `You are writing the narrative for a ${typeLabels} website report prepared by Farrington Development for a client.`,
    'Use ONLY the measurements provided below. Never invent metrics, rankings, or traffic numbers. If a measurement is missing, say it was not collected.',
    'SEO = classic search optimization. AEO = answer engine optimization (featured answers, FAQ schema, question-shaped content). GEO = generative engine optimization (being found and quoted correctly by AI assistants: llms.txt, structured data, factual clarity).',
    `The computed scores (0-100, from the checklist factors) are: ${JSON.stringify(scores)}. Your narrative must be consistent with them and explain the biggest factors behind each requested score.`,
    'Write for a busy business owner: plain language, short sentences, jargon explained in one line. Reference specific pages by path when the per-page data supports it.',
    'Return JSON with this exact shape:',
    '{"summary": "<4-5 sentence executive summary>",',
    ' "sections": [{"heading": "...", "paragraphs": ["...", "...", "..."]}],',
    ' "actionPlan": [{"priority": "high|medium|low", "title": "<short imperative>", "why": "<what the measurement showed and why it matters>", "how": ["<concrete step 1>", "<step 2>", "<step 3>"], "impact": "<one line on what improves>", "effort": "quick win|moderate|project"}],',
    ' "rewrites": {"title": {"current": "...", "suggested": "...", "reason": "..."}, "metaDescription": {"current": "...", "suggested": "...", "reason": "..."}}}',
    `One section per requested report type (${typeLabels}), in that order, 3-4 substantial paragraphs each covering what was found on specific pages.`,
    '8-14 actionPlan items, most impactful first, each with 2-5 concrete how steps a non-technical owner could hand to their web person verbatim. Suggested rewrites must be grounded in the actual site content provided and follow best-practice lengths (title 50-60 chars, meta description 140-160 chars).',
    '',
    `MEASUREMENTS:\n${JSON.stringify({ site: { ...facts, pages: undefined, page: undefined }, homepage: facts.page, pages: facts.pages.map(p => ({ path: p.path, title: p.title, words: p.wordCount, h1s: p.h1Count, h2s: p.h2Count, questionHeadings: p.questionHeadings, missingAlt: p.imagesMissingAlt, images: p.imageCount })), pagespeed: pagespeed || 'not collected' }, null, 2)}`,
  ].join('\n')

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.3, maxOutputTokens: 8192 },
    }),
  })
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    throw new UrlReportError(`Gemini narrative failed (${body?.error?.message || response.status})`, { stage: 'narrative' })
  }
  const text = body?.candidates?.[0]?.content?.parts?.map(part => part.text || '').join('') || ''
  let narrative = null
  try { narrative = JSON.parse(text) } catch {}
  return { narrative, usage: body?.usageMetadata || null, model }
}

function sectionHeading(text) {
  return `<h2 style="font-size:18px;margin:30px 0 10px;color:#2b2620;border-bottom:2px solid #eee8dd;padding-bottom:6px;">${esc(text)}</h2>`
}

function renderReportHtml({ facts, pagespeed, scores, narrative, narrativeModel, types, accountName, generatedAt }) {
  const page = facts.page
  const typeLabels = types.map(type => URL_REPORT_TYPES[type].label).join(' + ')
  const hostname = new URL(facts.finalUrl).hostname

  const gauges = types.map(type => gaugeSvg(scores[type], `${URL_REPORT_TYPES[type].label}`)).join('')

  const speedChart = pagespeed ? hBarSvg([
    { label: 'Performance (mobile)', value: pagespeed.performanceScore, status: scoreStatus(pagespeed.performanceScore), display: `${pagespeed.performanceScore}/100` },
    { label: 'Technical SEO', value: pagespeed.seoScore, status: scoreStatus(pagespeed.seoScore), display: `${pagespeed.seoScore}/100` },
  ]) : ''

  const maxWords = Math.max(...facts.pages.map(item => item.wordCount), 1)
  const contentChart = hBarSvg(
    facts.pages.map(item => ({ label: item.label === 'Homepage' ? 'Homepage' : item.path, value: item.wordCount, display: `${item.wordCount.toLocaleString()} words` })),
    { max: Math.ceil(maxWords * 1.15) },
  )

  const altCoveragePct = page.imageCount ? Math.round((1 - page.imagesMissingAlt / page.imageCount) * 100) : 100
  const checklist = checklistHtml([
    { pass: facts.httpsResolved, label: 'HTTPS', note: 'Secure connection' },
    { pass: Boolean(page.title && page.title.length >= 15 && page.title.length <= 70), label: 'Page title', note: page.title ? `${page.title.length} characters` : 'Missing' },
    { pass: Boolean(page.metaDescription), label: 'Meta description', note: page.metaDescription ? `${page.metaDescription.length} characters` : 'Search engines will improvise one' },
    { pass: Boolean(page.canonical), label: 'Canonical URL', note: page.canonical || 'Not set' },
    { pass: page.viewport, label: 'Mobile viewport', note: '' },
    { pass: facts.sitemapXml, label: 'sitemap.xml', note: 'Helps every crawler find your pages' },
    { pass: facts.robotsTxt && !facts.robotsBlocksAll, label: 'robots.txt', note: facts.robotsBlocksAll ? 'WARNING: blocks all crawlers' : '' },
    { pass: page.jsonLdTypes.length > 0, label: 'Structured data (JSON-LD)', note: page.jsonLdTypes.length ? page.jsonLdTypes.join(', ') : 'None found' },
    { pass: page.faqSchema, label: 'FAQ schema', note: 'Feeds answer boxes and AI assistants' },
    { pass: facts.llmsTxt, label: 'llms.txt', note: 'Guidance file for AI / generative engines' },
    { pass: altCoveragePct >= 90, label: 'Image alt text', note: `${altCoveragePct}% coverage (${page.imagesMissingAlt} of ${page.imageCount} missing)` },
    { pass: page.ogTagCount >= 3, label: 'Open Graph tags', note: `${page.ogTagCount} tags — controls social and link previews` },
  ])

  const pageRows = facts.pages.map(item => (
    `<tr>`
    + `<td style="padding:6px 10px;border-bottom:1px solid #eee8dd;font-weight:600;">${esc(item.label === 'Homepage' ? 'Homepage' : item.path)}</td>`
    + `<td style="padding:6px 10px;border-bottom:1px solid #eee8dd;">${esc(item.title || '(no title)')}</td>`
    + `<td style="padding:6px 10px;border-bottom:1px solid #eee8dd;text-align:right;">${item.h1Count}</td>`
    + `<td style="padding:6px 10px;border-bottom:1px solid #eee8dd;text-align:right;">${item.questionHeadings}</td>`
    + `<td style="padding:6px 10px;border-bottom:1px solid #eee8dd;text-align:right;">${item.wordCount.toLocaleString()}</td>`
    + `</tr>`
  )).join('')

  const sections = (narrative?.sections || []).map(section => (
    sectionHeading(section.heading)
    + (section.paragraphs || []).map(paragraph => `<p style="margin:0 0 11px;line-height:1.6;">${esc(paragraph)}</p>`).join('')
  )).join('')

  const actionPlan = (narrative?.actionPlan || []).map((item, index) => {
    const color = item.priority === 'high' ? STATUS.serious : item.priority === 'medium' ? STATUS.warning : INK_MUTED
    const steps = (item.how || []).map(step => `<li style="margin:3px 0;line-height:1.5;">${esc(step)}</li>`).join('')
    return `<div style="border:1px solid #eee8dd;border-radius:10px;padding:14px 16px;margin:0 0 14px;">`
      + `<div style="display:flex;gap:10px;align-items:baseline;flex-wrap:wrap;">`
      + `<strong style="font-size:15px;color:#2b2620;">${index + 1}. ${esc(item.title)}</strong>`
      + `<span style="text-transform:uppercase;font-size:10px;letter-spacing:0.06em;font-weight:700;color:#fff;background:${color};border-radius:9px;padding:2px 9px;">${esc(item.priority)}</span>`
      + (item.effort ? `<span style="font-size:11px;color:${INK_MUTED};">${esc(item.effort)}</span>` : '')
      + `</div>`
      + (item.why ? `<p style="margin:8px 0 6px;line-height:1.55;font-size:13px;">${esc(item.why)}</p>` : '')
      + (steps ? `<ol style="margin:4px 0 6px;padding-left:20px;font-size:13px;list-style:decimal;">${steps}</ol>` : '')
      + (item.impact ? `<p style="margin:4px 0 0;font-size:12px;color:${STATUS.good};">Expected impact: ${esc(item.impact)}</p>` : '')
      + `</div>`
  }).join('')

  const rewriteBlock = (label, rewrite) => {
    if (!rewrite?.suggested) return ''
    return `<div style="margin:0 0 14px;">`
      + `<div style="font-weight:600;font-size:13px;margin-bottom:6px;">${esc(label)}</div>`
      + `<div style="border:1px solid #eee8dd;border-left:4px solid ${STATUS.serious};border-radius:8px;padding:9px 12px;margin-bottom:6px;font-size:13px;color:${INK_MUTED};">Now: ${esc(rewrite.current || '(missing)')}</div>`
      + `<div style="border:1px solid #eee8dd;border-left:4px solid ${STATUS.good};border-radius:8px;padding:9px 12px;font-size:13px;">Suggested: <strong>${esc(rewrite.suggested)}</strong></div>`
      + (rewrite.reason ? `<p style="margin:5px 0 0;font-size:12px;color:${INK_MUTED};">${esc(rewrite.reason)}</p>` : '')
      + `</div>`
  }
  const rewrites = narrative?.rewrites
    ? rewriteBlock('Page title', narrative.rewrites.title) + rewriteBlock('Meta description', narrative.rewrites.metaDescription)
    : ''

  const pageIssueList = item => {
    const issues = []
    if (!item.title) issues.push('Missing page title')
    else if (item.title.length > 70) issues.push(`Title too long (${item.title.length} characters — aim for 50-60)`)
    else if (item.title.length < 15) issues.push(`Title too short (${item.title.length} characters)`)
    if (!item.metaDescription) issues.push('Missing meta description')
    else if (item.metaDescription.length > 170) issues.push(`Meta description too long (${item.metaDescription.length} characters — aim for 140-160)`)
    if (item.h1Count === 0) issues.push('No H1 heading')
    else if (item.h1Count > 1) issues.push(`${item.h1Count} H1 headings — use exactly one`)
    if (item.wordCount < 300) issues.push(`Thin content (${item.wordCount} words — aim for 300+)`)
    if (item.questionHeadings === 0) issues.push('No question-shaped headings for answer engines')
    if (item.imagesMissingAlt > 0) issues.push(`${item.imagesMissingAlt} of ${item.imageCount} images missing alt text`)
    return issues
  }
  const perPageAudit = facts.pages.map(item => {
    const issues = pageIssueList(item)
    const list = issues.length
      ? `<ul style="margin:4px 0 0;padding-left:18px;font-size:13px;list-style:disc;">${issues.map(issue => `<li style="margin:3px 0;">${esc(issue)}</li>`).join('')}</ul>`
      : `<p style="margin:4px 0 0;font-size:13px;color:${STATUS.good};">No page-level issues found ✓</p>`
    return `<div style="margin:0 0 12px;">`
      + `<div style="font-weight:600;font-size:13px;">${esc(item.label === 'Homepage' ? 'Homepage' : item.path)} <span style="color:${INK_MUTED};font-weight:400;">— ${issues.length} issue${issues.length === 1 ? '' : 's'}</span></div>`
      + list
      + `</div>`
  }).join('')

  const codeBox = code => `<pre style="background:#faf7f0;border:1px solid #eee8dd;border-radius:8px;padding:12px 14px;font-size:12px;line-height:1.5;overflow-x:auto;white-space:pre-wrap;">${esc(code)}</pre>`
  const templates = []
  if (!facts.llmsTxt) {
    templates.push(
      `<h3 style="font-size:14px;margin:16px 0 6px;color:#2b2620;">Starter llms.txt — save this as ${esc(hostname)}/llms.txt</h3>`
      + codeBox(`# ${accountName || hostname}\n\n> One-paragraph description of what ${accountName || hostname} does, who it serves, and where it operates.\n\n## Key pages\n${facts.pages.map(item => `- [${item.title || item.path}](https://${hostname}${item.path === '/' ? '' : item.path})`).join('\n')}\n\n## Contact\n- Website: https://${hostname}`)
    )
  }
  if (!page.faqSchema) {
    templates.push(
      `<h3 style="font-size:14px;margin:16px 0 6px;color:#2b2620;">FAQ schema — paste inside &lt;head&gt; and replace with your real questions</h3>`
      + codeBox(`<script type="application/ld+json">\n{\n  "@context": "https://schema.org",\n  "@type": "FAQPage",\n  "mainEntity": [{\n    "@type": "Question",\n    "name": "What does ${accountName || hostname} do?",\n    "acceptedAnswer": { "@type": "Answer", "text": "Your two-sentence answer here." }\n  }, {\n    "@type": "Question",\n    "name": "How do I get started?",\n    "acceptedAnswer": { "@type": "Answer", "text": "Your two-sentence answer here." }\n  }]\n}\n</script>`)
    )
  }
  if (page.missingAltSrcs?.length) {
    templates.push(
      `<h3 style="font-size:14px;margin:16px 0 6px;color:#2b2620;">Images missing alt text on the homepage</h3>`
      + `<ul style="margin:0;padding-left:18px;font-size:12px;list-style:disc;color:${INK_MUTED};">${page.missingAltSrcs.map(src => `<li style="margin:3px 0;">${esc(src)}</li>`).join('')}</ul>`
    )
  }
  const fixTemplates = templates.join('')

  return [
    `<div style="font-family:Inter,system-ui,sans-serif;color:${INK};max-width:860px;">`,
    `<p style="text-transform:uppercase;letter-spacing:0.08em;font-size:11px;color:${INK_MUTED};margin:0 0 4px;">Farrington Development · Website Intelligence</p>`,
    `<h1 style="font-size:24px;margin:0 0 2px;color:#2b2620;">${esc(typeLabels)} Report — ${esc(accountName || hostname)}</h1>`,
    `<p style="margin:0 0 20px;color:#5c554a;">${esc(facts.finalUrl)} · ${facts.pagesCrawled} pages measured · Generated ${esc(generatedAt)}</p>`,
    `<div style="display:flex;flex-wrap:wrap;gap:22px;justify-content:center;margin:0 0 8px;">${gauges}</div>`,
    narrative?.summary ? `<div style="background:#faf7f0;border:1px solid #eee8dd;border-radius:12px;padding:16px 18px;margin:14px 0 8px;line-height:1.6;font-size:14px;">${esc(narrative.summary)}</div>` : '',
    pagespeed
      ? sectionHeading('Speed & Core Web Vitals') + speedChart
        + `<p style="margin:8px 0 0;font-size:12px;color:${INK_MUTED};">Largest Contentful Paint ${esc(pagespeed.lcp)} · Layout Shift ${esc(pagespeed.cls)} · Blocking Time ${esc(pagespeed.tbt)} · Speed Index ${esc(pagespeed.speedIndex)} — Google PageSpeed, mobile.</p>`
      : sectionHeading('Speed & Core Web Vitals') + `<p style="margin:0;color:${INK_MUTED};font-size:13px;">PageSpeed measurements were not available for this run; they were not collected rather than estimated.</p>`,
    sectionHeading('Content across your pages'),
    contentChart,
    `<table style="border-collapse:collapse;width:100%;font-size:13px;margin-top:12px;">`,
    `<tr><th style="text-align:left;padding:6px 10px;color:${INK_MUTED};font-size:11px;text-transform:uppercase;letter-spacing:0.04em;">Page</th><th style="text-align:left;padding:6px 10px;color:${INK_MUTED};font-size:11px;text-transform:uppercase;letter-spacing:0.04em;">Title</th><th style="text-align:right;padding:6px 10px;color:${INK_MUTED};font-size:11px;text-transform:uppercase;letter-spacing:0.04em;">H1s</th><th style="text-align:right;padding:6px 10px;color:${INK_MUTED};font-size:11px;text-transform:uppercase;letter-spacing:0.04em;">Question headings</th><th style="text-align:right;padding:6px 10px;color:${INK_MUTED};font-size:11px;text-transform:uppercase;letter-spacing:0.04em;">Words</th></tr>`,
    pageRows,
    `</table>`,
    sectionHeading('Site health checklist'),
    `<table style="border-collapse:collapse;width:100%;font-size:13px;">${checklist}</table>`,
    sections,
    rewrites ? sectionHeading('Ready-to-use rewrites') + rewrites : '',
    actionPlan ? sectionHeading('Your action plan') + `<p style="margin:0 0 12px;font-size:13px;color:${INK_MUTED};">Each item below can be handed to your web person as-is: what to do, why, and the exact steps.</p>` + actionPlan : '',
    sectionHeading('Page-by-page audit'),
    perPageAudit,
    fixTemplates ? sectionHeading('Copy-and-paste fixes') + fixTemplates : '',
    `<p style="margin:30px 0 0;font-size:11px;color:${INK_MUTED};">Every metric was measured directly from the live site${pagespeed ? ' and Google PageSpeed' : ''}. Scores are computed from the checklist factors above${narrativeModel ? `; narrative written by ${esc(narrativeModel)} from those measurements only` : ''}.</p>`,
    `</div>`,
  ].join('')
}

export async function runUrlReport({ url, types = ['seo', 'aeo', 'geo'], accountId, accountName = '', createdBy = '' }) {
  const cleanUrl = normalizeReportUrl(url)
  if (!cleanUrl) throw new UrlReportError('A valid website URL is required', { stage: 'input' })
  const cleanTypes = [...new Set(types.map(type => String(type || '').toLowerCase()))].filter(type => URL_REPORT_TYPES[type])
  if (!cleanTypes.length) throw new UrlReportError('At least one report type is required', { stage: 'input' })
  if (!accountId) throw new UrlReportError('accountId is required', { stage: 'input' })

  const facts = await crawlSite(cleanUrl)
  const pagespeed = await fetchPageSpeed(facts.finalUrl)
  const scores = computeScores(facts, pagespeed)
  const { narrative, usage, model } = await geminiNarrative(facts, pagespeed, scores, cleanTypes)

  const now = new Date()
  const generatedAt = now.toISOString().slice(0, 10)
  const hostname = new URL(facts.finalUrl).hostname
  const typeLabels = cleanTypes.map(type => URL_REPORT_TYPES[type].label).join(' + ')
  const body = renderReportHtml({ facts, pagespeed, scores, narrative, narrativeModel: model, types: cleanTypes, accountName, generatedAt })

  const store = readData('documents.json') || { documents: [] }
  const document = {
    id: `doc_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
    title: `${typeLabels} Report — ${hostname} — ${generatedAt}`,
    templateId: '',
    templateName: 'URL Report',
    clientId: accountId,
    clientName: accountName,
    contactId: '',
    signerName: '',
    signerEmail: '',
    folder: 'Reports',
    body,
    values: {},
    requiresSignature: false,
    portalVisible: String(createdBy || '').startsWith('portal:'),
    status: 'delivered',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    createdBy,
    linkedTo: { accountId },
    meta: {
      generator: 'url-report-engine',
      url: facts.finalUrl,
      types: cleanTypes,
      scores,
      pagesCrawled: facts.pagesCrawled,
      pagespeedCollected: Boolean(pagespeed),
      narrativeModel: model || null,
      narrativeTokens: usage ? { prompt: usage.promptTokenCount || 0, output: usage.candidatesTokenCount || 0 } : null,
      engagementSummary: narrative?.summary || '',
      actionPlan: Array.isArray(narrative?.actionPlan)
        ? narrative.actionPlan.slice(0, 12).map(item => ({
            priority: String(item?.priority || 'medium'),
            title: String(item?.title || ''),
            why: String(item?.why || ''),
            impact: String(item?.impact || ''),
            effort: String(item?.effort || ''),
          })).filter(item => item.title)
        : [],
    },
  }
  store.documents = [document, ...(store.documents || [])]
  writeData('documents.json', store)

  return {
    documentId: document.id,
    title: document.title,
    summary: narrative?.summary || `Measured ${facts.pagesCrawled} pages of ${hostname}. Scores — ${cleanTypes.map(type => `${URL_REPORT_TYPES[type].label} ${scores[type]}`).join(', ')}.`,
    scores,
    usage: document.meta.narrativeTokens,
    model: model || null,
  }
}
