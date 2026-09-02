// lib/lead-name-enrichment.js
// Decision-maker name extraction for lead sweeps (Carl, 2026-08-01: a lead
// without the person's name is a fail). Google Maps has no people in it, so we
// read the business's own website — the pages we already crawl for emails —
// and have a cheap model pull the owner/principal's name and title.
//
// Best-effort by design: any failure (site down, no key, model error) leaves
// the lead as-is and is reported in the run summary. Never blocks a sweep.

import { runAiModel } from './ai-lab'

// DeepSeek: working vault credential, cheapest capable tier (2026-08-01 —
// prod's OPENAI_API_KEY is revoked; swap back via LEAD_NAME_MODEL_ID if renewed).
const DEFAULT_MODEL_ID = 'deepseek/deepseek-v4-flash'
const PAGE_PATHS = ['', '/about', '/about-us', '/contact', '/team']
const PAGE_TIMEOUT_MS = 6000
const PAGE_MAX_BYTES = 150 * 1024
const TEXT_BUDGET = 8000

export function resolveNameEnrichConfig(overrides = {}) {
  const env = process.env
  const enabled = !(String(overrides.enabled ?? env.LEAD_NAME_ENRICH_ENABLED ?? 'true').toLowerCase() === 'false')
  return {
    enabled,
    modelId: String(overrides.modelId || env.LEAD_NAME_MODEL_ID || DEFAULT_MODEL_ID).trim(),
  }
}

export function stripHtml(html = '') {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&#\d+;|&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function fetchPageText(url) {
  try {
    const response = await fetch(url, {
      headers: { accept: 'text/html', 'user-agent': 'Mozilla/5.0 (compatible; FarringtonLeadSweep/1.0)' },
      signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
      cache: 'no-store',
    })
    if (!response.ok) return ''
    const type = response.headers.get('content-type') || ''
    if (type && !/html|text/i.test(type)) return ''
    const text = await response.text()
    return stripHtml(text.slice(0, PAGE_MAX_BYTES))
  } catch {
    return ''
  }
}

async function fetchSiteText(website) {
  let origin
  try {
    origin = new URL(String(website)).origin
  } catch {
    return ''
  }
  let combined = ''
  for (const path of PAGE_PATHS) {
    if (combined.length >= TEXT_BUDGET) break
    const text = await fetchPageText(origin + path)
    if (text) combined += ` ${text}`
  }
  return combined.trim().slice(0, TEXT_BUDGET)
}

// Strict-JSON extraction; tolerate models that wrap JSON in prose.
export function parseNameResult(raw = '') {
  const match = String(raw).match(/\{[\s\S]*?\}/)
  if (!match) return { name: '', title: '' }
  try {
    const parsed = JSON.parse(match[0])
    const name = String(parsed.name || '').trim().slice(0, 80)
    const title = String(parsed.title || '').trim().slice(0, 80)
    // A usable contact name is a real person: at least first + last, no URLs,
    // not a refusal placeholder.
    if (!name || !/^[a-z' .-]+ [a-z' .-]+/i.test(name) || /unknown|not (?:found|named|listed)|n\/a/i.test(name)) {
      return { name: '', title: '' }
    }
    return { name, title }
  } catch {
    return { name: '', title: '' }
  }
}

// "gina.sutton@…" / "gina_sutton@…" → "Gina Sutton". Only separator-delimited
// locals — a concatenated "ginasutton@" cannot be split reliably, so we don't.
export function nameFromEmail(email = '') {
  const match = String(email).toLowerCase().match(/^([a-z]{2,})[._-]([a-z]{2,})@/)
  if (!match) return ''
  const cap = part => part[0].toUpperCase() + part.slice(1)
  const generic = /^(info|sales|office|admin|contact|support|service|hello|team|billing|mail)$/
  if (generic.test(match[1]) || generic.test(match[2])) return ''
  return `${cap(match[1])} ${cap(match[2])}`
}

async function extractContactName({ businessName, siteText, modelId }) {
  const prompt = [
    `Website text for the business "${businessName}" follows. Identify the primary human contact — the owner, founder, principal, or (failing that) the most senior named manager.`,
    'Respond with STRICT JSON only, no other text: {"name":"Full Name","title":"their role"}',
    'Use empty strings if no individual person is named in the text. Never invent a name.',
  ].join('\n')
  const result = await runAiModel({ modelId, prompt, context: siteText })
  return parseNameResult(result?.text || '')
}

// Website fetches for different businesses are fully independent, and running
// them one at a time (up to 5 pages x 6s each, plus a model call, per lead) was
// the single biggest contributor to a 10-lead sweep blowing past the gateway
// timeout. A small worker pool keeps the wall clock proportional to the slowest
// site rather than the sum of all of them.
const NAME_CONCURRENCY = 4

// Mutates drafts in place (name/title/tags/notes). Returns a summary.
export async function enrichDraftNames(drafts = [], { modelId, onProgress } = {}) {
  const summary = { requested: 0, found: 0, modelId: modelId || DEFAULT_MODEL_ID, error: null }
  const targets = drafts.filter(draft => !draft.name && draft.website)
  if (!targets.length) return summary
  summary.requested = targets.length

  async function enrichOne(draft) {
    try {
      const siteText = await fetchSiteText(draft.website)
      if (siteText) {
        const { name, title } = await extractContactName({
          businessName: draft.businessName,
          siteText,
          modelId: summary.modelId,
        })
        if (name) {
          draft.name = name
          if (title && !draft.title) draft.title = title
          draft.tags = [...(draft.tags || []), 'name-enriched']
          draft.notes = `${draft.notes || ''}\nContact (from their website): ${name}${title ? ` — ${title}` : ''}`
          summary.found += 1
          return
        }
      }
    } catch (error) {
      // A hard model failure (usually a bad API key) applies to every target —
      // record it, but still fall through to the email heuristic below.
      summary.error = error.message || 'name extraction failed'
    }
    const derived = nameFromEmail(draft.email)
    if (derived) {
      draft.name = derived
      draft.tags = [...(draft.tags || []), 'name-from-email']
      draft.notes = `${draft.notes || ''}\nContact (derived from email address): ${derived}`
      summary.found += 1
    }
  }

  const queue = [...targets]
  let done = 0
  const workers = Array.from({ length: Math.min(NAME_CONCURRENCY, queue.length) }, async () => {
    while (queue.length) {
      const draft = queue.shift()
      await enrichOne(draft)
      done += 1
      if (typeof onProgress === 'function') {
        try { onProgress({ done, total: targets.length }) } catch { /* progress is best-effort */ }
      }
    }
  })
  await Promise.all(workers)
  return summary
}
