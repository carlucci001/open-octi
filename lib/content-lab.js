import { getCred } from './agent-creds'
import { isOpenOcti } from './edition'
import { resolveProviderKey } from './openocti-keys'
import { readData, writeData } from './dataStore'

const FILE = 'content-lab.json'
const DEFAULT_MODEL = 'gpt-4.1'
const DEFAULT_WORKFLOW = 'social-post'

export const CONTENT_WORKFLOWS = [
  {
    id: 'story',
    label: 'Story',
    format: 'article',
    destination: 'Editorial queue',
    brief: 'Local-style story or client narrative with headline, nut graf, body, and callouts.',
  },
  {
    id: 'blog',
    label: 'Blog',
    format: 'article',
    destination: 'Website draft',
    brief: 'SEO-aware blog post with title, slug idea, excerpt, sections, and CTA.',
  },
  {
    id: 'social-post',
    label: 'Social Post',
    format: 'social',
    destination: 'Social calendar',
    brief: 'Platform-ready post package with caption, hook, hashtags, and visual direction.',
  },
  {
    id: 'meme',
    label: 'Meme',
    format: 'creative',
    destination: 'Media',
    brief: 'Meme concept with setup, punchline, layout, image prompt, and safe caption.',
  },
  {
    id: 'email',
    label: 'Email',
    format: 'email',
    destination: 'Campaign draft',
    brief: 'Subject lines, preview text, email body, and follow-up angle.',
  },
  {
    id: 'video-script',
    label: 'Video Script',
    format: 'script',
    destination: 'Video planner',
    brief: 'Short-form script with scenes, voiceover, shot list, and image/video prompt.',
  },
  {
    id: 'video-package',
    label: 'Video Package',
    format: 'video-package',
    destination: 'OpenMontage pipeline',
    brief: 'Production-ready plan with script, scene beats, assets, captions, narration, and suggested OpenMontage pipeline.',
  },
  {
    id: 'image-brief',
    label: 'Image Brief',
    format: 'visual',
    destination: 'Image generator',
    brief: 'Image generation prompt with composition, style, negative prompt, and usage notes.',
  },
  {
    id: 'campaign-package',
    label: 'Campaign Package',
    format: 'campaign',
    destination: 'Approval queue',
    brief: 'Multi-channel campaign with offer, posts, email, image/video briefs, and tasks.',
  },
]

function blankStore() {
  return { version: 1, jobs: [], lastUpdated: '' }
}

function readStore() {
  const data = readData(FILE) || blankStore()
  return {
    version: data.version || 1,
    jobs: Array.isArray(data.jobs) ? data.jobs : [],
    lastUpdated: data.lastUpdated || '',
  }
}

function writeStore(data) {
  data.lastUpdated = new Date().toISOString()
  writeData(FILE, data)
  return data
}

function workflowFor(id) {
  return CONTENT_WORKFLOWS.find(workflow => workflow.id === id) || CONTENT_WORKFLOWS.find(workflow => workflow.id === DEFAULT_WORKFLOW)
}

function slug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

function field(value, fallback = '') {
  return String(value || fallback || '').trim()
}

function buildFallbackDraft({ workflow, topic, audience, tone, goal, source, keywords, openMontagePipeline }) {
  const title = topic ? `${topic} - ${workflow.label} Draft` : `${workflow.label} Draft`
  const keywordLine = keywords ? `Keywords: ${keywords}` : 'Keywords: Add target terms before publishing.'
  const sourceLine = source ? `Source material: ${source}` : 'Source material: Add client notes, source links, or campaign facts.'
  const pipeline = openMontagePipeline || 'screen-demo, podcast-repurpose, documentary-montage, animated-explainer, or talking-head'
  return [
    `# ${title}`,
    '',
    `Audience: ${audience || 'Target client or community audience'}`,
    `Tone: ${tone || 'Clear, useful, confident'}`,
    `Goal: ${goal || workflow.destination}`,
    keywordLine,
    '',
    '## Working Brief',
    sourceLine,
    '',
    '## Draft',
    `Open with the clearest promise around ${topic || 'the selected campaign topic'}. Explain why it matters now, give the reader practical proof, and end with a direct next step.`,
    '',
    '## Visual Direction',
    'Create one primary image or short video prompt that supports the hook, keeps the subject readable, and avoids fake logos or unreadable UI text.',
    workflow.id === 'video-package' ? `\n## OpenMontage Handoff\nRecommended pipeline: ${pipeline}. Include scene list, source assets needed, narration notes, caption style, render format, and review checkpoints.` : '',
    '',
    '## Approval Notes',
    'Review for factual accuracy, client voice, compliance, and publishing destination before sending or posting.',
  ].join('\n')
}

async function generateWithOpenAI(prompt, context) {
  const key = isOpenOcti()
    ? resolveProviderKey('openai').key
    : process.env.OPENAI_API_KEY || getCred('openai')?.key
  if (!key) throw new Error('OpenAI key unavailable')
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: process.env.CONTENT_LAB_OPENAI_MODEL || DEFAULT_MODEL,
      messages: [
        { role: 'system', content: context },
        { role: 'user', content: prompt },
      ],
      temperature: 0.65,
      max_tokens: 1800,
    }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload?.error?.message || `OpenAI content generation failed ${response.status}`)
  return {
    provider: 'openai',
    model: payload.model || process.env.CONTENT_LAB_OPENAI_MODEL || DEFAULT_MODEL,
    content: payload.choices?.[0]?.message?.content || '',
    usage: payload.usage || null,
  }
}

async function generateWithGemini(prompt, context) {
  const key = isOpenOcti()
    ? resolveProviderKey('gemini').key
    : process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || getCred('gemini')?.key || getCred('google')?.key
  if (!key) throw new Error('Gemini key unavailable')
  const model = process.env.CONTENT_LAB_GEMINI_MODEL || 'gemini-2.5-flash'
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: context }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.65, maxOutputTokens: 1800 },
    }),
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload?.error?.message || `Gemini content generation failed ${response.status}`)
  return {
    provider: 'gemini',
    model,
    content: (payload.candidates?.[0]?.content?.parts || []).map(part => part.text).filter(Boolean).join('\n'),
    usage: payload.usageMetadata || null,
  }
}

async function generateDraft(input, workflow) {
  const topic = field(input.topic)
  const audience = field(input.audience)
  const tone = field(input.tone, 'plainspoken, useful, credible')
  const goal = field(input.goal, workflow.destination)
  const source = field(input.source)
  const keywords = field(input.keywords)
  const openMontagePipeline = field(input.openMontagePipeline)
  const context = [
    'You are the Farrington Command Center AI Content Lab.',
    'Create practical business content that can move into approval, media generation, or publishing.',
    'Return clean markdown with useful headings. Avoid fake claims, fake testimonials, fake dates, and unverifiable facts.',
    'When visual media is useful, include a section named Visual Direction with an image or video prompt.',
    workflow.id === 'video-package' ? 'For Video Package workflows, include an OpenMontage Handoff with selected pipeline, scene plan, asset list, narration direction, caption approach, render format, and review checkpoints.' : '',
  ].join(' ')
  const prompt = [
    `Workflow: ${workflow.label}`,
    `Format: ${workflow.format}`,
    `Destination: ${goal}`,
    `Topic: ${topic || 'Not specified'}`,
    `Audience: ${audience || 'Not specified'}`,
    `Tone: ${tone}`,
    `Keywords: ${keywords || 'None provided'}`,
    workflow.id === 'video-package' ? `Selected OpenMontage pipeline: ${openMontagePipeline || 'Recommend the best fit'}` : '',
    `Source material: ${source || 'None provided'}`,
    '',
    'Produce a complete first draft package for this workflow.',
  ].join('\n')

  const providers = field(input.provider, 'auto') === 'gemini' ? ['gemini', 'openai'] : ['openai', 'gemini']
  const errors = []
  for (const provider of providers) {
    try {
      const result = provider === 'openai'
        ? await generateWithOpenAI(prompt, context)
        : await generateWithGemini(prompt, context)
      if (result.content) return result
    } catch (e) {
      errors.push(`${provider}: ${e.message}`)
    }
  }
  return {
    provider: 'template',
    model: 'structured-fallback',
    content: buildFallbackDraft({ workflow, topic, audience, tone, goal, source, keywords, openMontagePipeline }),
    usage: null,
    warnings: errors,
  }
}

export function listContentJobs({ q = '', status = '', workflow = '', limit = 50 } = {}) {
  const needle = String(q || '').toLowerCase().trim()
  const jobs = readStore().jobs
    .filter(job => !status || job.status === status)
    .filter(job => !workflow || job.workflow === workflow)
    .filter(job => {
      if (!needle) return true
      return [job.title, job.topic, job.audience, job.goal, job.content, ...(job.tags || [])]
        .some(value => String(value || '').toLowerCase().includes(needle))
    })
    .sort((a, b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')))
  return jobs.slice(0, Math.max(1, Math.min(200, Number(limit) || 50)))
}

export async function createContentJob(input = {}) {
  const workflow = workflowFor(input.workflow)
  const now = new Date().toISOString()
  const draft = await generateDraft(input, workflow)
  const title = field(input.title) || field(input.topic) || `${workflow.label} Draft`
  const job = {
    id: `content-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    workflow: workflow.id,
    workflowLabel: workflow.label,
    format: workflow.format,
    status: 'draft',
    title,
    slug: slug(title),
    topic: field(input.topic),
    audience: field(input.audience),
    tone: field(input.tone),
    goal: field(input.goal, workflow.destination),
    source: field(input.source),
    keywords: field(input.keywords),
    openMontagePipeline: field(input.openMontagePipeline),
    provider: draft.provider,
    model: draft.model,
    content: draft.content,
    usage: draft.usage,
    warnings: draft.warnings || [],
    tags: Array.isArray(input.tags) ? input.tags : [],
    createdBy: field(input.createdBy, 'content-lab'),
    createdAt: now,
    updatedAt: now,
  }
  const store = readStore()
  store.jobs.push(job)
  writeStore(store)
  return job
}

export function updateContentJob(id, patch = {}) {
  const store = readStore()
  const idx = store.jobs.findIndex(job => job.id === id)
  if (idx < 0) return null
  const current = store.jobs[idx]
  const updated = {
    ...current,
    ...patch,
    id: current.id,
    updatedAt: new Date().toISOString(),
  }
  store.jobs[idx] = updated
  writeStore(store)
  return updated
}

export function deleteContentJob(id) {
  const store = readStore()
  const before = store.jobs.length
  store.jobs = store.jobs.filter(job => job.id !== id)
  if (store.jobs.length === before) return false
  writeStore(store)
  return true
}
