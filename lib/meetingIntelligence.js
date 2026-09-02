import OpenAI from 'openai'
import { getCred } from './agent-creds'

function apiKey() {
  return process.env.OPENAI_API_KEY || getCred('openai')?.key || ''
}

function cleanText(value, max = 4000) {
  return String(value || '').replace(/\r\n/g, '\n').trim().slice(0, max)
}

function sentenceSplit(text) {
  return cleanText(text, 50000).replace(/\s+/g, ' ').split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(Boolean)
}

function parseJsonObject(text) {
  const raw = cleanText(text, 30000)
  try { return JSON.parse(raw) } catch {}
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start >= 0 && end > start) {
    try { return JSON.parse(raw.slice(start, end + 1)) } catch {}
  }
  return null
}

function speakerConfigDefaults(speakerConfig = {}) {
  return {
    mode: speakerConfig.mode || 'transcript-only',
    primarySpeakerName: cleanText(speakerConfig.primarySpeakerName || 'Carl Farrington', 80),
    secondarySpeakerName: cleanText(speakerConfig.secondarySpeakerName || 'Other speaker', 80),
    ownerFirst: speakerConfig.ownerFirst !== false,
  }
}

function normalizeSpeakerLabel(label, speakerConfig = {}) {
  const cfg = speakerConfigDefaults(speakerConfig)
  const raw = cleanText(label, 80)
  if (/^(speaker\s*)?1$/i.test(raw) || /^speaker\s*a$/i.test(raw) || /^carl$/i.test(raw)) return cfg.primarySpeakerName
  if (/^(speaker\s*)?2$/i.test(raw) || /^speaker\s*b$/i.test(raw)) return cfg.secondarySpeakerName
  return raw
}

function parseSpeakerSegments(transcript, speakerConfig = {}) {
  const cfg = speakerConfigDefaults(speakerConfig)
  const lines = cleanText(transcript, 50000).split('\n').map(x => x.trim()).filter(Boolean)
  const labelled = []
  for (const line of lines) {
    const match = line.match(/^([^:\n]{1,48}):\s*(.+)$/)
    if (match) labelled.push({ speaker: normalizeSpeakerLabel(match[1].trim(), cfg), text: match[2].trim(), confidence: 'explicit-label' })
  }
  if (labelled.length) return labelled.slice(0, 80)
  const speakers = cfg.ownerFirst
    ? [cfg.primarySpeakerName, cfg.secondarySpeakerName]
    : [cfg.secondarySpeakerName, cfg.primarySpeakerName]
  return sentenceSplit(transcript).slice(0, 40).map((text, index) => ({
    speaker: cfg.mode === 'owner-first-two-speaker' ? speakers[index % 2] : 'Unknown speaker',
    text,
    confidence: cfg.mode === 'owner-first-two-speaker' ? 'owner-first-inferred' : 'not-diarized',
  }))
}

function normalizeActionItem(item) {
  if (typeof item === 'string') return { task: cleanText(item, 220), owner: '', dueDate: '', priority: 'medium' }
  return {
    task: cleanText(item?.task || item?.title || item?.action || '', 220),
    owner: cleanText(item?.owner || '', 80),
    dueDate: cleanText(item?.dueDate || item?.due || '', 40),
    priority: ['low', 'medium', 'high', 'urgent'].includes(String(item?.priority || '').toLowerCase()) ? String(item.priority).toLowerCase() : 'medium',
  }
}

function normalizeList(value, max = 12) {
  return (Array.isArray(value) ? value : [])
    .map(item => typeof item === 'string' ? cleanText(item, 500) : cleanText(item?.text || item?.decision || item?.summary || item?.item || '', 500))
    .filter(Boolean)
    .slice(0, max)
}

function normalizeIntelligence(raw, transcript, source = 'ai', speakerConfig = {}) {
  const cfg = speakerConfigDefaults(speakerConfig)
  const fallback = fallbackMeetingIntelligence(transcript, cfg)
  const speakerSegments = Array.isArray(raw?.speakerSegments) && raw.speakerSegments.length
    ? raw.speakerSegments.map(s => ({
      speaker: normalizeSpeakerLabel(s?.speaker || 'Unknown speaker', cfg),
      text: cleanText(s?.text || '', 1000),
      confidence: cleanText(s?.confidence || 'inferred', 40),
    })).filter(s => s.text).slice(0, 80)
    : fallback.speakerSegments
  const participants = Array.isArray(raw?.participants) && raw.participants.length
    ? raw.participants.map(p => ({
      name: cleanText(p?.name || p, 80),
      role: cleanText(p?.role || '', 120),
      confidence: cleanText(p?.confidence || 'inferred', 40),
    })).filter(p => p.name).slice(0, 12)
    : [...new Set(speakerSegments.map(s => s.speaker).filter(Boolean))].slice(0, 12).map(name => ({ name, role: '', confidence: name === 'Unknown speaker' ? 'not-diarized' : 'inferred' }))

  return {
    source,
    generatedAt: new Date().toISOString(),
    diarizationMode: raw?.diarizationMode || (cfg.mode === 'owner-first-two-speaker' ? 'owner-first-two-speaker' : (speakerSegments.some(s => s.confidence === 'explicit-label') ? 'speaker-labels' : 'transcript-only-inference')),
    speakerConfig: cfg,
    summary: cleanText(raw?.summary || fallback.summary, 1600),
    participants,
    speakerSegments,
    decisions: normalizeList(raw?.decisions, 12).length ? normalizeList(raw.decisions, 12) : fallback.decisions,
    actionItems: (Array.isArray(raw?.actionItems) ? raw.actionItems : fallback.actionItems).map(normalizeActionItem).filter(a => a.task).slice(0, 10),
    followUps: normalizeList(raw?.followUps, 10),
    promises: normalizeList(raw?.promises, 10),
    openQuestions: normalizeList(raw?.openQuestions, 10),
    crmUpdates: normalizeList(raw?.crmUpdates, 10),
    confidence: cleanText(raw?.confidence || (source === 'ai' ? 'medium' : 'low'), 40),
    limitations: normalizeList(raw?.limitations, 6).length ? normalizeList(raw.limitations, 6) : ['No separate speaker audio tracks were provided, so speaker attribution may be inferred from transcript wording, labels, or owner-first two-speaker setup.'],
  }
}

export function fallbackMeetingIntelligence(transcript, speakerConfig = {}) {
  const cfg = speakerConfigDefaults(speakerConfig)
  const sentences = sentenceSplit(transcript)
  const actionWords = /\b(need to|make sure|follow up|create|add|send|call|price out|check|verify|build|save|wire|finish|schedule|assign)\b/i
  const decisionWords = /\b(agreed|decided|correct|approved|source of truth|should be|will be|we will|let's|the system should)\b/i
  const speakerSegments = parseSpeakerSegments(transcript, cfg)
  return {
    source: 'fallback',
    generatedAt: new Date().toISOString(),
    diarizationMode: speakerSegments.some(s => s.confidence === 'explicit-label') ? 'speaker-labels' : cfg.mode,
    speakerConfig: cfg,
    summary: sentences.slice(0, 4).join(' ') || 'Transcript captured.',
    participants: [...new Set(speakerSegments.map(s => s.speaker))].slice(0, 12).map(name => ({ name, role: '', confidence: name === 'Unknown speaker' ? 'not-diarized' : 'explicit-label' })),
    speakerSegments,
    decisions: sentences.filter(s => decisionWords.test(s)).slice(0, 8),
    actionItems: sentences.filter(s => actionWords.test(s)).slice(0, 8).map(task => ({ task, owner: '', dueDate: '', priority: 'medium' })),
    followUps: [],
    promises: [],
    openQuestions: sentences.filter(s => /\?$/.test(s)).slice(0, 8),
    crmUpdates: [],
    confidence: 'low',
    limitations: ['Fallback analysis used keyword extraction because AI meeting intelligence was unavailable. Speaker turns may be owner-first inferred.'],
  }
}

export async function analyzeMeetingTranscript({ transcript, title = '', clientName = '', speakerConfig = {} }) {
  const cfg = speakerConfigDefaults(speakerConfig)
  const key = apiKey()
  if (!key) return fallbackMeetingIntelligence(transcript, cfg)

  const client = new OpenAI({ apiKey: key })
  const system = [
    'You are Maggie, a CRM meeting intelligence engine inside Farrington Command Center.',
    'Analyze transcripts into useful business records. Return only valid JSON.',
    'Do not invent facts. If speaker identities are not explicit, mark them as inferred or unknown.',
    cfg.mode === 'owner-first-two-speaker'
      ? `Use owner-first two-speaker assignment when the transcript lacks labels: the first speaker is ${cfg.primarySpeakerName}; the second speaker is ${cfg.secondarySpeakerName}. Reconstruct speaker turns from sentence boundaries and conversation cues, but mark confidence as inferred when audio diarization is not available.`
      : '',
    'Extract decisions, action items with owners and due dates when stated, promises, follow-ups, open questions, and CRM updates.',
  ].filter(Boolean).join('\n')
  const schemaHint = `Return JSON with keys: summary, diarizationMode, participants[{name,role,confidence}], speakerSegments[{speaker,text,confidence}], decisions[], actionItems[{task,owner,dueDate,priority}], followUps[], promises[], openQuestions[], crmUpdates[], confidence, limitations[].`
  try {
    const response = await client.responses.create({
      model: process.env.MEETING_INTELLIGENCE_MODEL || 'gpt-4.1-mini',
      input: [
        { role: 'system', content: system },
        { role: 'user', content: `${schemaHint}\n\nTitle: ${title || 'Untitled meeting'}\nClient/account: ${clientName || 'None selected'}\nSpeaker setup: ${cfg.mode}; primary=${cfg.primarySpeakerName}; secondary=${cfg.secondarySpeakerName}; ownerFirst=${cfg.ownerFirst ? 'yes' : 'no'}\n\nTranscript:\n${cleanText(transcript, 50000)}` },
      ],
      max_output_tokens: 2200,
    })
    const parsed = parseJsonObject(response.output_text)
    if (!parsed) throw new Error('model returned non-json')
    return normalizeIntelligence(parsed, transcript, 'ai', cfg)
  } catch {
    return fallbackMeetingIntelligence(transcript, cfg)
  }
}
