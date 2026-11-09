// Heuristic spam scoring for public, unauthenticated lead-intake endpoints
// (website intake, product inquiry, portal demo request). Pure functions,
// no I/O — routes call assessSubmission() and decide what to do with the
// verdict (quarantine + fake-success on 'spam', proceed normally on 'ok').

const GIBBERISH_MIN_LENGTH = 10
const GIBBERISH_MIN_UPPERCASE = 3
const GIBBERISH_MIN_CONSONANT_RUN = 6
const DOT_STUFFED_MIN_DOTS = 3
const TOO_FAST_MS = 3000
const SPAM_SCORE_THRESHOLD = 3

// 'y' is treated as a vowel here so common consonant-cluster surnames
// (Krzysztof, Schwartzkopf) don't trip the consonant-run heuristic.
const VOWELS = new Set(['a', 'e', 'i', 'o', 'u', 'y'])

function isLetter(ch) {
  return /[a-zA-Z]/.test(ch)
}

function isConsonant(ch) {
  return isLetter(ch) && !VOWELS.has(ch.toLowerCase())
}

function countUppercaseAfterFirst(token) {
  let count = 0
  for (let i = 1; i < token.length; i++) {
    if (token[i] >= 'A' && token[i] <= 'Z') count++
  }
  return count
}

function longestConsonantRun(token) {
  let run = 0
  let max = 0
  for (const ch of token) {
    if (isConsonant(ch)) {
      run++
      max = Math.max(max, run)
    } else {
      run = 0
    }
  }
  return max
}

/**
 * A token is "gibberish" when it has no whitespace, is at least
 * GIBBERISH_MIN_LENGTH characters, and either has a burst of uppercase
 * letters after the first character or a long run of consecutive
 * consonants — both signatures of randomly generated bot text.
 */
export function isGibberishToken(value) {
  const token = String(value ?? '').trim()
  if (!token || /\s/.test(token)) return false
  if (token.length < GIBBERISH_MIN_LENGTH) return false
  if (countUppercaseAfterFirst(token) >= GIBBERISH_MIN_UPPERCASE) return true
  return longestConsonantRun(token) >= GIBBERISH_MIN_CONSONANT_RUN
}

function gmailLikeDomain(domain) {
  return domain === 'gmail.com' || domain === 'googlemail.com'
}

function splitEmail(email) {
  const value = String(email ?? '').trim().toLowerCase()
  const at = value.indexOf('@')
  if (at < 0) return null
  return { local: value.slice(0, at), domain: value.slice(at + 1) }
}

export function isDotStuffedGmail(email) {
  const parts = splitEmail(email)
  if (!parts || !gmailLikeDomain(parts.domain)) return false
  const dots = (parts.local.match(/\./g) || []).length
  return dots >= DOT_STUFFED_MIN_DOTS
}

/**
 * Normalizes an email for rate-limiting / dedupe purposes: lowercases it,
 * and for gmail/googlemail addresses strips dots and "+tag" suffixes from
 * the local part so bot variants of the same mailbox collapse to one key.
 */
export function normalizeEmailForLimits(email) {
  const parts = splitEmail(email)
  if (!parts) return String(email ?? '').trim().toLowerCase()
  let { local, domain } = parts
  if (gmailLikeDomain(domain)) {
    local = local.split('+')[0].replace(/\./g, '')
  }
  return `${local}@${domain}`
}

/**
 * Scores an inbound public-form submission for bot/gibberish signals.
 *
 * fields: { name, company, role, notes, description, email }
 * honeypot: value of a hidden field real users never fill in
 * elapsedMs: time between form render and submit, if the client sends it
 * upstreamGuard: an already-computed verdict from an upstream relay (e.g.
 *   the marketing site's own bot check), shaped like { verdict, reasons? }
 */
export function assessSubmission({ fields = {}, honeypot, elapsedMs, upstreamGuard } = {}) {
  if (honeypot != null && String(honeypot).trim() !== '') {
    return { verdict: 'spam', score: SPAM_SCORE_THRESHOLD + 1, reasons: ['honeypot'] }
  }

  if (upstreamGuard && upstreamGuard.verdict === 'spam') {
    return { verdict: 'spam', score: SPAM_SCORE_THRESHOLD + 1, reasons: ['upstream'] }
  }

  const reasons = []
  let score = 0

  const { name, role, notes, description, email } = fields || {}

  if (isGibberishToken(name)) {
    score += 2
    reasons.push('gibberish-name')
  }

  const gibberishTextHits = [role, notes, description].filter(isGibberishToken).length
  if (gibberishTextHits > 0) {
    score += Math.min(gibberishTextHits, 2)
    reasons.push('gibberish-text')
  }

  if (isDotStuffedGmail(email)) {
    score += 2
    reasons.push('dot-stuffed-gmail')
  }

  const elapsedNumber = Number(elapsedMs)
  if (elapsedMs === undefined || elapsedMs === null || !Number.isFinite(elapsedNumber)) {
    score += 1
    reasons.push('no-timing')
  } else if (elapsedNumber < TOO_FAST_MS) {
    score += 2
    reasons.push('too-fast')
  }

  return { verdict: score >= SPAM_SCORE_THRESHOLD ? 'spam' : 'ok', score, reasons }
}
