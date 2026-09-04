import fs from 'node:fs'
import path from 'node:path'
import { GoogleGenAI } from '@google/genai'
import { getCred } from '../agent-creds'
import { PRESS_RELEASE_META_LANGUAGE, scorePressRelease } from './release-quality'

const MODEL = 'gemini-2.5-pro'
const TRAINING_FILES = [
  'deploy/openclaw/seed/workspace/press-release-agent/SOUL.md',
  'deploy/openclaw/seed/workspace/press-release-agent/knowledge/press-release-playbook.md',
  'deploy/openclaw/seed/workspace/press-release-agent/knowledge/evaluation-rubric.md',
  'deploy/openclaw/seed/workspace/press-release-agent/knowledge/example-releases.md',
]

function clean(value, max = 30000) {
  return String(value || '').replace(/\r/g, '').trim().slice(0, max)
}

function words(value) {
  return clean(value).replace(/\s+/g, ' ').split(' ').filter(Boolean)
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function resolvePressModelKey() {
  return String(
    process.env.GEMINI_API_KEY
      || process.env.GOOGLE_API_KEY
      || getCred('gemini')?.key
      || getCred('google gemini')?.key
      || '',
  ).trim()
}

export function loadReeseTrainingPack() {
  return TRAINING_FILES.map(relativePath => {
    try {
      return `\n## ${relativePath}\n${fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')}`
    } catch {
      return ''
    }
  }).join('\n').trim()
}

function parseJsonResponse(value) {
  const text = clean(value).replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('Reese returned a draft in an unreadable format')
  return JSON.parse(text.slice(start, end + 1))
}

function sentence(value) {
  const result = clean(value, 5000).replace(/\s+/g, ' ')
  if (!result) return ''
  return /[.!?][”"']?$/.test(result) ? result : `${result}.`
}

function stripDateline(value) {
  return clean(value, 5000).replace(/^[A-Z][A-Za-z .'-]+,\s*[A-Z][A-Za-z. ]+\s+—\s+/i, '')
}

function formatDraft(payload, brief) {
  const headline = clean(payload?.headline, 160).replace(/^#+\s*/, '').replace(/[\r\n]+/g, ' ')
  const lede = sentence(stripDateline(payload?.lede))
  const paragraphs = Array.isArray(payload?.bodyParagraphs) ? payload.bodyParagraphs.map(sentence).filter(Boolean) : []
  const boilerplate = sentence(payload?.boilerplate)
  const location = clean(brief.location || 'City, ST, N.C.', 160).toUpperCase()
  const releaseBody = [`${location} — ${lede}`, ...paragraphs, `About ${brief.businessName}\n${boilerplate}`].join('\n\n')
  const contact = [brief.contactName, brief.contactRole, brief.contactEmail, brief.contactPhone].map(value => clean(value, 254)).filter(Boolean)
  return {
    title: headline,
    lede,
    body: `# ${headline}\n\n${releaseBody}\n\nMedia contact:\n${contact.join('\n')}\n\n###`,
    bodyWordCount: words(releaseBody).length,
    contact,
    source: 'model',
    model: MODEL,
    fallback: false,
  }
}

function promptFor(brief, trainingPack, feedback = '') {
  return `You are Reese, a veteran local-news editor writing a finished press release from verified client facts.

Follow this training pack:
${trainingPack}

Return JSON only with this shape:
{"headline":"...","lede":"...","bodyParagraphs":["..."],"boilerplate":"..."}

Non-negotiable requirements:
- AP style and inverted-pyramid order.
- Headline is active, specific, no more than 90 characters, and uses the organization name no more than once.
- Write a 25- to 30-word lede that answers who, what, when, where, and why it matters. It must never exceed the hard 35-word limit.
- Body includes exactly one quoted passage: the exact approved quote, once, attributed to the named person and title. Never add a second quotation or extend the approved quote.
- Target 420-470 words after adding the lede and boilerplate, excluding contact details; the hard allowed range is 300-500. Do not stop near the minimum.
- Use only the verified facts below. Do not invent claims, dates, people, outcomes, rankings, or context.
- Every sentence must map directly to a field in the verified brief. Omit implications such as "aims to," "enhances," "reinforces," "demonstrates," "commitment," "valuable," or "extensive experience" unless those exact facts are stated.
- Preserve chronology exactly. Never conflate a booking or registration date with the date a location, role, or event begins.
- Write for publication. Never discuss briefs, supplied materials, approvals, drafting, editors' needs, source authority, guardrails, or the release-writing process.
- Do not repeat a sentence or substantially restate the lede in the next paragraph. Start the body with a new concrete detail.
- Use six to eight short body paragraphs in addition to the lede and boilerplate. Prefer specific facts over promotional adjectives.
- Do not include Markdown, a dateline, city/state prefix, contact block, or ###; the application adds those.
- Avoid every denied phrase: ${PRESS_RELEASE_META_LANGUAGE.join('; ')}.

Verified brief:
${JSON.stringify(brief, null, 2)}
${feedback ? `\nThe previous attempt failed these gates. Correct every item:\n${feedback}` : ''}`
}

export async function generatePressReleaseDraft(brief, { apiKey, client, trainingPack, maxAttempts = 3 } = {}) {
  const key = String(apiKey || resolvePressModelKey()).trim()
  if (!key) return fallbackPressRelease(brief)
  const gemini = client || new GoogleGenAI({ apiKey: key })
  const pack = trainingPack || loadReeseTrainingPack()
  let feedback = ''
  let lastError = null
  let lastFeedback = ''

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await gemini.models.generateContent({
        model: MODEL,
        contents: promptFor(brief, pack, feedback),
        config: { temperature: 0.25, responseMimeType: 'application/json' },
      })
      const draft = formatDraft(parseJsonResponse(response?.text), brief)
      const rubric = scorePressRelease(draft, brief)
      if (rubric.pass) return { ...draft, rubric }
      feedback = [
        ...rubric.checks,
        ...rubric.readability,
      ].filter(item => !item.pass).map(item => `- ${item.key}: ${item.evidence}`).join('\n')
      lastFeedback = feedback
      lastError = new Error(`Draft failed the release rubric (${rubric.score}/5 plus readability gates)`)
    } catch (error) {
      lastError = error
      feedback = `- Return valid JSON and satisfy every requirement. Provider/parser error: ${clean(error?.message, 180)}`
      lastFeedback = feedback
    }
  }

  throw new Error(`Reese model could not produce a publication-ready draft after ${maxAttempts} attempts: ${clean(lastError?.message, 220)}${lastFeedback ? `; ${clean(lastFeedback, 320)}` : ''}`)
}

export function fallbackPressRelease(brief = {}) {
  const company = clean(brief.businessName || 'The organization', 140)
  const announcement = sentence(brief.announcement)
  const impact = sentence(brief.audienceImpact)
  const proof = sentence(brief.proofPoint)
  const quote = clean(brief.quote, 1000).replace(/^[“"']|[”"']$/g, '')
  const description = sentence(brief.businessSummary || brief.offerings || `${company} serves its local community`)
  if (!company || !announcement || !impact || !quote || !brief.quoteName || !brief.quoteTitle || !brief.contactName || !(brief.contactEmail || brief.contactPhone)) {
    throw new Error('The release still needs the announcement, audience impact, approved quote, speaker, and media contact')
  }
  const headline = announcement.replace(/[.!?]$/, '').replace(new RegExp(escapeRegExp(company), 'ig'), '').replace(/^\s*[:—-]\s*/, '').trim().slice(0, 90) || 'Local organization announces new service'
  const lede = words(`${company} ${announcement} ${impact}`).slice(0, 35).join(' ')
  const releaseBody = `${clean(brief.location || 'City, ST, N.C.', 160).toUpperCase()} — ${sentence(lede)}\n\n${proof}\n\n“${quote},” said ${clean(brief.quoteName, 140)}, ${clean(brief.quoteTitle, 140)} at ${company}.\n\nAbout ${company}\n${description}`
  const contact = [brief.contactName, brief.contactRole, brief.contactEmail, brief.contactPhone].map(value => clean(value, 254)).filter(Boolean)
  const draft = {
    title: headline,
    lede: sentence(lede),
    body: `# ${headline}\n\n${releaseBody}\n\nMedia contact:\n${contact.join('\n')}\n\n###`,
    bodyWordCount: words(releaseBody).length,
    contact,
    source: 'fallback',
    fallback: true,
    label: 'draft (fallback — model key needed)',
  }
  return { ...draft, rubric: scorePressRelease(draft, brief) }
}
