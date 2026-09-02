// lib/lead-geo.js
//
// Offline location -> ZIP resolver for the lead pipeline.
//
// Why this exists: the Apollo people actor's only working geo filter is
// companyCityPostalCode with ZIP codes (proven 2026-08-06 — city names and
// companyState silently return nationwide and bill for it). The previous
// resolver called zippopotam.us over the network; it failed transiently on
// cities it had resolved before and had no state support at all
// (run lsr_msrqawbkuhbcol, 2026-08-13). This module resolves everything from
// the full US ZIP database (42,555 codes) shipped inside the `zipcodes` npm
// package. Zero network calls. Nothing external to fail.
//
// Env:
//   LEAD_DEFAULT_STATE  preferred state for ambiguous bare cities (e.g. "NC")
//   LEAD_GEO_MAX_ZIPS   optional cap on how many ZIPs are returned (unset = no cap)

import zipcodes from 'zipcodes'

// abbrev -> Full Name, all states + DC + territories, from the package's own
// table so it never disagrees with the ZIP data.
export const STATE_NAMES = Object.fromEntries(
  Object.entries(zipcodes.states.full).map(([name, abbrev]) => [
    abbrev,
    name.replace(/\w\S*/g, w => w[0] + w.slice(1).toLowerCase()),
  ]),
)

const NAME_TO_ABBREV = Object.fromEntries(
  Object.entries(zipcodes.states.full).map(([name, abbrev]) => [name.toLowerCase(), abbrev]),
)

// "NC" / "North Carolina" / "north carolina" -> "NC"; anything else -> ''.
export function stateAbbrevOf(text = '') {
  const t = String(text || '').trim()
  if (!t) return ''
  if (/^[A-Za-z]{2}$/.test(t) && STATE_NAMES[t.toUpperCase()]) return t.toUpperCase()
  return NAME_TO_ABBREV[t.toLowerCase()] || ''
}

const ZIP_RE = /^\d{5}$/

// Lazily built: cityLower -> Map(stateAbbrev -> [zips])
let cityIndex = null
function getCityIndex() {
  if (cityIndex) return cityIndex
  cityIndex = new Map()
  for (const entry of Object.values(zipcodes.codes)) {
    if (!entry || entry.country !== 'US' || !entry.city || !entry.state) continue
    const key = entry.city.toLowerCase()
    let byState = cityIndex.get(key)
    if (!byState) cityIndex.set(key, (byState = new Map()))
    let zips = byState.get(entry.state)
    if (!zips) byState.set(entry.state, (zips = []))
    zips.push(entry.zip)
  }
  return cityIndex
}

function stateZips(abbrev) {
  return (zipcodes.lookupByState(abbrev) || []).map(e => e.zip)
}

// Even-stride sample so a capped list still spans the whole area. ZIPs are
// roughly geographically ordered, so slice(0, cap) would return one corner of
// a state; sampling every Nth spreads coverage across all of it.
export function sampleZips(zips, cap) {
  const n = Number(cap)
  if (!Number.isFinite(n) || n <= 0 || zips.length <= n) return zips
  const step = zips.length / n
  return Array.from({ length: n }, (_, i) => zips[Math.floor(i * step)])
}

function capped(result, maxZips) {
  const cap = Number(maxZips)
  if (Number.isFinite(cap) && cap > 0 && result.zips.length > cap) {
    const total = result.zips.length
    result.zips = sampleZips(result.zips, cap)
    result.note = [result.note, `sampled ${cap} of ${total} ZIPs evenly (LEAD_GEO_MAX_ZIPS)`]
      .filter(Boolean).join('; ')
  }
  return result
}

function resolveCity(city, hintAbbrev, defaultState) {
  const byState = getCityIndex().get(city.toLowerCase())
  if (!byState || !byState.size) return null

  if (hintAbbrev) {
    const zips = byState.get(hintAbbrev)
    if (!zips) return null // "Asheville, TX" — that city is not in that state
    return { zips: [...zips], city, state: STATE_NAMES[hintAbbrev], stateAbbrev: hintAbbrev, scope: `${city}, ${hintAbbrev}` }
  }

  const states = [...byState.keys()]
  if (states.length === 1) {
    const st = states[0]
    return { zips: [...byState.get(st)], city, state: STATE_NAMES[st], stateAbbrev: st, scope: `${city}, ${st}` }
  }

  // Ambiguous bare city: prefer LEAD_DEFAULT_STATE, else the state where the
  // city is largest (most ZIPs). Never refuse a real US city.
  const preferred = stateAbbrevOf(defaultState)
  const chosen = preferred && byState.has(preferred)
    ? preferred
    : states.sort((a, b) => byState.get(b).length - byState.get(a).length || a.localeCompare(b))[0]
  return {
    zips: [...byState.get(chosen)],
    city,
    state: STATE_NAMES[chosen],
    stateAbbrev: chosen,
    scope: `${city}, ${chosen}`,
    note: `"${city}" exists in ${states.length} states (${states.slice(0, 6).join(', ')}${states.length > 6 ? ', …' : ''}) — used ${chosen}`,
  }
}

// Resolve any of, case-insensitively:
//   "28801" / "28801, 28803"                    -> validated pass-through
//   "Asheville"                                  -> that city's ZIPs
//   "Asheville, NC" / "Asheville, North Carolina"
//   "Asheville North Carolina" (no comma)
//   "NC" / "North Carolina"                      -> every ZIP in the state
// Returns { zips, city, state, stateAbbrev, scope, note? } or null (true
// no-match only — pair with suggest() for the error message).
export function resolveLocationToZips(location, opts = {}) {
  const defaultState = opts.defaultState ?? process.env.LEAD_DEFAULT_STATE
  const maxZips = opts.maxZips ?? process.env.LEAD_GEO_MAX_ZIPS
  const raw = String(location || '').trim()
  if (!raw) return null

  // Pure ZIP input (single, comma- or space-separated list): validate and pass through.
  const tokens = raw.split(/[\s,;]+/).filter(Boolean)
  if (tokens.every(t => ZIP_RE.test(t))) {
    const valid = [...new Set(tokens)].filter(z => zipcodes.lookup(z))
    if (!valid.length) return null
    const dropped = new Set(tokens.filter(z => !zipcodes.lookup(z)))
    const first = zipcodes.lookup(valid[0])
    return capped({
      zips: valid,
      city: '',
      state: STATE_NAMES[first.state] || '',
      stateAbbrev: first.state || '',
      scope: `${valid.length} ZIP${valid.length > 1 ? 's' : ''}`,
      note: dropped.size ? `dropped invalid ZIP${dropped.size > 1 ? 's' : ''} ${[...dropped].join(', ')}` : undefined,
    }, maxZips)
  }

  // Whole input is a state ("NC", "North Carolina").
  const wholeState = stateAbbrevOf(raw)
  if (wholeState) {
    return capped({
      zips: stateZips(wholeState),
      city: '',
      state: STATE_NAMES[wholeState],
      stateAbbrev: wholeState,
      scope: `all of ${STATE_NAMES[wholeState]}`,
    }, maxZips)
  }

  // "City, State" (ignore any trailing ZIP parts like "Asheville, NC, 28801").
  const parts = raw.split(',').map(p => p.trim()).filter(Boolean)
  if (parts.length >= 2) {
    const hint = stateAbbrevOf(parts[1].replace(/\s+\d{5}(-\d{4})?$/, ''))
    const hit = resolveCity(parts[0], hint || '', defaultState)
    if (hit) return capped(hit, maxZips)
    // Fall through to bare-city handling of the first part (bad state hint).
    const loose = resolveCity(parts[0], '', defaultState)
    return loose ? capped(loose, maxZips) : null
  }

  // No comma: try "City State" / "City State Name" (last 1–2 words as state).
  const words = raw.split(/\s+/)
  for (const take of [2, 1]) {
    if (words.length > take) {
      const hint = stateAbbrevOf(words.slice(-take).join(' '))
      if (hint) {
        const hit = resolveCity(words.slice(0, -take).join(' '), hint, defaultState)
        if (hit) return capped(hit, maxZips)
      }
    }
  }

  // Bare city.
  const hit = resolveCity(raw, '', defaultState)
  return hit ? capped(hit, maxZips) : null
}

// Did-you-mean for the refuse-nationwide error message. Returns e.g.
// "Ashville (NY, PA, AL, OH)" for "Ashvile", or null when there is no close
// city name. Only called on the failure path, so a full scan is fine.
export function suggest(location) {
  const raw = String(location || '').trim().toLowerCase()
  const city = raw.split(',')[0].trim()
  if (!city || ZIP_RE.test(city)) return null
  if (getCityIndex().has(city)) return null // it exists; failure was something else

  let best = null
  let bestDist = 3 // accept distance 1–2 only
  for (const name of getCityIndex().keys()) {
    if (Math.abs(name.length - city.length) >= bestDist) continue
    const d = editDistance(city, name, bestDist)
    if (d < bestDist) { bestDist = d; best = name }
  }
  if (!best) return null
  const states = [...getCityIndex().get(best).keys()]
  const pretty = best.replace(/\w\S*/g, w => w[0].toUpperCase() + w.slice(1))
  return `${pretty} (${states.slice(0, 6).join(', ')}${states.length > 6 ? ', …' : ''})`
}

// Bounded Levenshtein: returns min(distance, limit).
function editDistance(a, b, limit) {
  if (a === b) return 0
  const m = a.length
  const n = b.length
  if (Math.abs(m - n) >= limit) return limit
  let prev = Array.from({ length: n + 1 }, (_, j) => j)
  for (let i = 1; i <= m; i++) {
    const cur = [i]
    let rowMin = i
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      )
      if (cur[j] < rowMin) rowMin = cur[j]
    }
    if (rowMin >= limit) return limit
    prev = cur
  }
  return Math.min(prev[n], limit)
}
