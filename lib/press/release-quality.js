export const PRESS_RELEASE_META_LANGUAGE = Object.freeze([
  'supplied materials',
  'approved client brief',
  'this release is intended',
  'client-approved materials',
  'remain the authority',
  'the draft does not add',
])

function clean(value, max = 30000) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function words(value) {
  return clean(value).split(/\s+/).filter(Boolean)
}

function countOccurrences(value, needle) {
  const haystack = clean(value).toLocaleLowerCase()
  const target = clean(needle).toLocaleLowerCase()
  if (!haystack || !target) return 0
  return haystack.split(target).length - 1
}

function normalizedSentences(body) {
  const release = String(body || '').split(/\nMedia contact:/i)[0]
    .replace(/^#.*$/gm, '')
    .replace(/^About [^\n]+$/gim, '')
  return release
    .split(/(?<=[.!?])[”"']?\s+/)
    .map(value => clean(value).toLocaleLowerCase().replace(/[“”"'()[\]{}]/g, '').replace(/[^a-z0-9]+/g, ' ').trim())
    .filter(value => value.split(' ').length >= 5)
}

function duplicateSentences(body) {
  const seen = new Set()
  const duplicates = new Set()
  for (const sentence of normalizedSentences(body)) {
    if (seen.has(sentence)) duplicates.add(sentence)
    seen.add(sentence)
  }
  return [...duplicates]
}

function quoteAttributed(draft, brief) {
  const paragraphs = String(draft?.body || '').split(/\n\s*\n/).map(value => clean(value).toLocaleLowerCase())
  const quote = clean(brief?.quote).replace(/^[“"']|[”"']$/g, '').toLocaleLowerCase()
  const name = clean(brief?.quoteName).toLocaleLowerCase()
  const title = clean(brief?.quoteTitle).toLocaleLowerCase()
  return Boolean(quote && name && title && paragraphs.some(paragraph => paragraph.includes(quote) && paragraph.includes(name) && paragraph.includes(title)))
}

function quotedPassageCount(body) {
  const release = String(body || '').split(/\nMedia contact:/i)[0]
  return (release.match(/[“"](?=\S)/g) || []).length
}

export function scorePressRelease(draft, brief = {}) {
  const headline = clean(draft?.title, 500)
  const lede = clean(draft?.lede, 2000)
  const body = String(draft?.body || '')
  const bodyWordCount = Number(draft?.bodyWordCount || 0)
  const organizationCount = countOccurrences(headline, brief.businessName)
  const duplicates = duplicateSentences(body)
  const metaLanguage = PRESS_RELEASE_META_LANGUAGE.filter(phrase => body.toLocaleLowerCase().includes(phrase))
  const attributed = quoteAttributed(draft, brief)
  const quoteCount = quotedPassageCount(body)

  const checks = [
    { key: 'newsHook', pass: Boolean(headline && headline.length <= 90 && lede && brief.announcement && brief.audienceImpact), evidence: `${headline.length} headline characters; concrete lede present.` },
    { key: 'claimsVerified', pass: Boolean(brief.proofSource), evidence: brief.proofSource ? 'A source is identified for the supporting fact.' : 'No supporting-fact source is identified.' },
    { key: 'realQuote', pass: attributed && quoteCount === 1, evidence: attributed && quoteCount === 1 ? 'The one approved quote is attributed to a named person and title.' : `Expected one approved quoted passage; found ${quoteCount}.` },
    { key: 'contactBlock', pass: Boolean(brief.contactName && brief.contactRole && (brief.contactEmail || brief.contactPhone) && /Media contact:/i.test(body)), evidence: 'Media contact requires a name, role, and supplied route.' },
    { key: 'length', pass: bodyWordCount >= 300 && bodyWordCount <= 500, evidence: `${bodyWordCount} release words, excluding the contact block and end mark.` },
  ]

  const readability = [
    { key: 'noDuplicatedSentences', pass: duplicates.length === 0, evidence: duplicates.length ? `${duplicates.length} duplicated sentence(s) found.` : 'No sentence is repeated.' },
    { key: 'noMetaLanguage', pass: metaLanguage.length === 0, evidence: metaLanguage.length ? `Denied phrase(s): ${metaLanguage.join(', ')}.` : 'No production-process meta-language found.' },
    { key: 'headlineOrganizationCount', pass: organizationCount <= 1, evidence: `Organization name appears ${organizationCount} time(s) in the headline.` },
    { key: 'ledeLength', pass: words(lede).length <= 35 && words(lede).length > 0, evidence: `${words(lede).length} lede words.` },
    { key: 'namedQuoteAttribution', pass: attributed, evidence: attributed ? 'Quote has a named speaker and title.' : 'Quote attribution is incomplete.' },
    { key: 'oneQuotedPassage', pass: quoteCount === 1, evidence: `${quoteCount} quoted passage(s) found.` },
  ]

  const fallback = draft?.source === 'fallback' || draft?.fallback === true
  const score = checks.filter(item => item.pass).length
  return {
    score,
    total: 5,
    pass: !fallback && checks.every(item => item.pass) && readability.every(item => item.pass),
    checks,
    readability,
    fallback,
  }
}
