import { getCred } from './agent-creds'
import { MODEL_CATALOG, PROVIDERS } from './model-catalog'
import { estimateModelCost } from './model-prices'
import { recordUsageEvent } from './usage-events'
import { isOpenOcti } from './edition'
import { resolveProviderKey } from './openocti-keys'

export const AI_LAB_PRESETS = [
  {
    id: 'reasoning-nuance',
    name: 'Reasoning and nuance',
    category: 'Thinking',
    prompt: 'A client wants to replace a messy spreadsheet process with a CRM workflow, but their staff is anxious about automation. Write a recommendation that balances business value, implementation risk, staff trust, and a practical first 30-day rollout.',
    scoring: ['judgment', 'specificity', 'risk awareness', 'tone'],
  },
  {
    id: 'crm-sales-reply',
    name: 'CRM sales reply',
    category: 'Sales',
    prompt: 'Draft a concise reply to a small business owner who says the CRM sounds useful but they are worried it will be too expensive and too much work to adopt.',
    scoring: ['clarity', 'persuasion', 'empathy', 'next step'],
  },
  {
    id: 'coding-debug',
    name: 'Coding diagnosis',
    category: 'Engineering',
    prompt: 'A Next.js API route intermittently returns stale customer totals after a payment is recorded. Give a debugging plan that distinguishes cache, database, and client-state causes.',
    scoring: ['debugging order', 'root-cause discipline', 'testability', 'brevity'],
  },
  {
    id: 'agent-persona',
    name: 'Agent persona discipline',
    category: 'Agents',
    prompt: 'You are a client-facing finance agent in a CRM. Explain an overdue invoice and ask for payment without sounding robotic, threatening, or apologetic.',
    scoring: ['persona consistency', 'human tone', 'professionalism', 'constraint following'],
  },
  {
    id: 'apify-context',
    name: 'Apify context handoff',
    category: 'Research',
    prompt: 'You receive scraped website notes for a local contractor. Turn them into five CRM-ready qualification questions, three likely objections, and one recommended follow-up message.',
    scoring: ['context use', 'lead quality', 'actionability', 'structure'],
  },
]

export const AI_LAB_USE_CASES = [
  { id: 'leased-voice-agent', name: 'Leased voice agent', weights: { quality: 0.36, speed: 0.28, cost: 0.16, reliability: 0.2 }, voiceCritical: true },
  { id: 'crm-operator', name: 'CRM operator', weights: { quality: 0.34, speed: 0.2, cost: 0.2, reliability: 0.26 } },
  { id: 'research-agent', name: 'Research agent', weights: { quality: 0.42, speed: 0.12, cost: 0.18, reliability: 0.28 } },
  { id: 'coding-agent', name: 'Coding/repo agent', weights: { quality: 0.46, speed: 0.12, cost: 0.12, reliability: 0.3 } },
  { id: 'premium-gpu-client', name: 'Premium GPU client', weights: { quality: 0.5, speed: 0.18, cost: 0.04, reliability: 0.28 }, gpuFriendly: true },
]

export const AI_LAB_BUDGETS = [
  { id: 'cost-control', name: 'Cost control', costWeight: 1.7, priceMultiplier: 2.7 },
  { id: 'balanced', name: 'Balanced', costWeight: 1, priceMultiplier: 3.2 },
  { id: 'premium', name: 'Premium', costWeight: 0.55, priceMultiplier: 4 },
  { id: 'cost-no-object', name: 'Cost no object', costWeight: 0.15, priceMultiplier: 5.5 },
]

export const AI_LAB_CONNECTORS = [
  { id: 'crm', name: 'CRM records', status: 'ready', risk: 'medium', assignable: true },
  { id: 'email', name: 'Email', status: 'ready', risk: 'high', assignable: true },
  { id: 'calendar', name: 'Calendar', status: 'ready', risk: 'medium', assignable: true },
  { id: 'documents', name: 'Documents/signatures', status: 'ready', risk: 'high', assignable: true },
  { id: 'stripe', name: 'Stripe/payments', status: 'guarded', risk: 'critical', assignable: true },
  { id: 'obsidian', name: 'Command Vault knowledge', status: 'ready', risk: 'low', assignable: true },
  { id: 'repository', name: 'Repository/Gitea', status: 'ready', risk: 'high', assignable: true },
  { id: 'apify', name: 'Apify research', status: 'planned', risk: 'medium', assignable: false },
  { id: 'voice', name: 'Voice/Twilio/ElevenLabs', status: 'ready', risk: 'high', assignable: true },
  { id: 'gpu', name: 'NVIDIA GPU/NIM lane', status: 'lab', risk: 'medium', assignable: false },
]

const OPENAI_COMPATIBLE_BASES = {
  kimi: 'https://api.moonshot.ai/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  orcarouter: 'https://api.orcarouter.ai/v1',
  deepseek: 'https://api.deepseek.com',
  nvidia: 'https://integrate.api.nvidia.com/v1',
}

const PROVIDER_CREDENTIALS = {
  openai: { names: ['openai'], env: ['OPENAI_API_KEY'] },
  anthropic: { names: ['anthropic'], env: ['ANTHROPIC_API_KEY'] },
  google: { names: ['gemini', 'google gemini', 'google'], env: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'] },
  kimi: { names: ['kimi', 'moonshot'], env: ['KIMI_API_KEY', 'MOONSHOT_API_KEY'] },
  openrouter: { names: ['openrouter'], env: ['OPENROUTER_API_KEY'] },
  orcarouter: { names: ['orcarouter', 'orca router'], env: ['ORCAROUTER_API_KEY'] },
  deepseek: { names: ['deepseek', 'deep seek', 'deep seats'], env: ['DEEPSEEK_API_KEY'] },
  nvidia: { names: ['nvidia', 'nim', 'ngc'], env: ['NVIDIA_API_KEY', 'NVIDIA_NIM_API_KEY', 'NGC_API_KEY'] },
  huggingface: { names: ['huggingface', 'hugging face'], env: ['HF_TOKEN', 'HUGGINGFACE_API_KEY'] },
}

function envKey(provider) {
  return PROVIDER_CREDENTIALS[provider]?.env?.[0]
}

function keyFor(provider) {
  const config = PROVIDER_CREDENTIALS[provider] || { names: [provider], env: [] }
  if (isOpenOcti()) {
    const openOctiProvider = provider === 'google' ? 'gemini' : provider
    try {
      const resolved = resolveProviderKey(openOctiProvider)
      if (resolved.key) return { key: resolved.key, source: resolved.source, credentialName: resolved.envKey }
    } catch {}
  }
  for (const name of config.names) {
    const fromVault = getCred(name)?.key
    if (fromVault) return { key: fromVault, source: 'vault', credentialName: name }
  }
  for (const envName of config.env) {
    if (process.env[envName]) return { key: process.env[envName], source: 'env', credentialName: envName }
  }
  return { key: '', source: 'missing' }
}

export function availableProviderSummary() {
  return Object.entries(PROVIDERS).map(([id, meta]) => {
    const key = keyFor(id)
    return {
      id,
      label: meta.label,
      envKey: meta.envKey,
      configured: Boolean(key.key),
      source: key.source,
      modelCount: MODEL_CATALOG.filter(model => model.provider === id && model.ctx !== 0 && model.chat !== false).length,
    }
  })
}

export function labCatalog() {
  const providers = availableProviderSummary()
  const providerMap = new Map(providers.map(provider => [provider.id, provider]))
  return MODEL_CATALOG
    .filter(model => model.ctx !== 0 && model.chat !== false)
    .filter(model => Boolean(providerMap.get(model.provider)?.configured))
    .map(model => ({
      ...model,
      providerLabel: PROVIDERS[model.provider]?.label || model.provider,
      configured: Boolean(providerMap.get(model.provider)?.configured),
    }))
}

export function labPlanningCatalog() {
  return {
    useCases: AI_LAB_USE_CASES,
    budgets: AI_LAB_BUDGETS,
    connectors: AI_LAB_CONNECTORS,
  }
}

export function summarizeLabRuns(runs = []) {
  const results = runs.flatMap(run => Array.isArray(run.results) ? run.results.map(result => ({ ...result, runId: run.id, createdAt: run.createdAt })) : [])
  const successful = results.filter(result => result.ok)
  const failed = results.filter(result => !result.ok)
  const latencies = successful.map(result => Number(result.latencyMs || 0)).filter(Boolean).sort((a, b) => a - b)
  const ttfts = successful.map(result => Number(result.ttftMs || 0)).filter(Boolean).sort((a, b) => a - b)
  const totalEstimatedUsd = results.reduce((sum, result) => sum + Number(result.cost?.estimatedUsd || 0), 0)
  const totalTokens = results.reduce((sum, result) => sum + Number(result.cost?.totalTokens || result.usage?.total_tokens || 0), 0)
  const byProvider = {}
  for (const result of results) {
    const key = result.provider || 'unknown'
    if (!byProvider[key]) byProvider[key] = { total: 0, ok: 0, failed: 0, estimatedUsd: 0 }
    byProvider[key].total++
    if (result.ok) byProvider[key].ok++
    else byProvider[key].failed++
    byProvider[key].estimatedUsd = Number((byProvider[key].estimatedUsd + Number(result.cost?.estimatedUsd || 0)).toFixed(6))
  }
  const errorCounts = {}
  for (const result of failed) {
    const key = String(result.error || 'unknown error').slice(0, 90)
    errorCounts[key] = (errorCounts[key] || 0) + 1
  }
  const percentile = (arr, p) => {
    if (!arr.length) return null
    const index = Math.min(arr.length - 1, Math.max(0, Math.ceil((p / 100) * arr.length) - 1))
    return arr[index]
  }
  return {
    runCount: runs.length,
    resultCount: results.length,
    successful: successful.length,
    failed: failed.length,
    successRate: results.length ? Number((successful.length / results.length).toFixed(3)) : null,
    latency: { p50: percentile(latencies, 50), p95: percentile(latencies, 95) },
    ttft: { p50: percentile(ttfts, 50), p95: percentile(ttfts, 95) },
    totalEstimatedUsd: Number(totalEstimatedUsd.toFixed(6)),
    totalTokens,
    byProvider,
    commonErrors: Object.entries(errorCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([error, count]) => ({ error, count })),
    lastRunAt: runs[0]?.createdAt || null,
  }
}

function splitModelId(id) {
  const raw = String(id || '')
  const index = raw.indexOf('/')
  if (index < 1) return { provider: '', model: raw }
  return { provider: raw.slice(0, index), model: raw.slice(index + 1) }
}

function catalogEntry(modelId) {
  return MODEL_CATALOG.find(model => model.id === modelId) || null
}

function estimateCost(modelId, usage = {}) {
  const entry = catalogEntry(modelId)
  if (!entry) return null
  const promptTokens = Number(usage.prompt_tokens ?? usage.input_tokens ?? usage.promptTokenCount ?? 0)
  const completionTokens = Number(usage.completion_tokens ?? usage.output_tokens ?? usage.candidatesTokenCount ?? 0)
  const exactValue = usage.cost_usd ?? usage.costUsd
  const exactCost = exactValue === null || exactValue === undefined ? Number.NaN : Number(exactValue)
  if (Number.isFinite(exactCost)) {
    return {
      estimatedUsd: exactCost,
      exactUsd: exactCost,
      exact: true,
      inputUsd: null,
      outputUsd: null,
      promptTokens,
      completionTokens,
      totalTokens: Number(usage.total_tokens ?? usage.totalTokenCount ?? promptTokens + completionTokens),
    }
  }
  if (entry.dynamicPricing) {
    return {
      estimatedUsd: null,
      inputUsd: null,
      outputUsd: null,
      promptTokens,
      completionTokens,
      totalTokens: Number(usage.total_tokens ?? usage.totalTokenCount ?? promptTokens + completionTokens),
    }
  }
  const input = promptTokens * Number(entry.costIn || 0) / 1_000_000
  const output = completionTokens * Number(entry.costOut || 0) / 1_000_000
  return {
    estimatedUsd: Number((input + output).toFixed(6)),
    inputUsd: Number(input.toFixed(6)),
    outputUsd: Number(output.toFixed(6)),
    promptTokens,
    completionTokens,
    totalTokens: Number(usage.total_tokens ?? usage.totalTokenCount ?? promptTokens + completionTokens),
  }
}

function normalizeUsage(usage = {}) {
  return {
    prompt_tokens: usage.prompt_tokens ?? usage.input_tokens ?? usage.promptTokenCount ?? null,
    completion_tokens: usage.completion_tokens ?? usage.output_tokens ?? usage.candidatesTokenCount ?? null,
    total_tokens: usage.total_tokens ?? usage.totalTokenCount ?? null,
    cost_usd: usage.cost_usd ?? usage.costUsd ?? null,
  }
}

function orcaRouteMetadata(response) {
  if (!response?.headers) return null
  const metadata = {
    requestId: response.headers.get('x-orca-request-id') || '',
    resolvedModel: response.headers.get('x-orca-resolved-model') || '',
    router: response.headers.get('x-orca-router') || '',
    version: response.headers.get('x-orca-version') || '',
  }
  return Object.values(metadata).some(Boolean) ? metadata : null
}

async function fetchOpenAICompatible(url, requestOptions, provider) {
  const attempts = provider === 'orcarouter' ? 3 : 1
  let response
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    response = await fetch(url, requestOptions)
    const retryable = response.status === 429 || [502, 503, 504].includes(response.status)
    if (!retryable || attempt === attempts - 1) return response
    await response.body?.cancel().catch(() => {})
    await new Promise(resolve => setTimeout(resolve, 250 * (2 ** attempt)))
  }
  return response
}

function agentContextBlock(agent) {
  if (!agent?.id && !agent?.name) return ''
  const tools = Array.isArray(agent.tools) && agent.tools.length ? agent.tools.slice(0, 16).join(', ') : ''
  const channels = Array.isArray(agent.channels) && agent.channels.length ? agent.channels.slice(0, 8).join(', ') : ''
  return [
    `Agent under test: ${agent.name || agent.id}`,
    agent.role ? `Role: ${agent.role}` : '',
    agent.description ? `Description: ${String(agent.description).slice(0, 700)}` : '',
    agent.jobDescription ? `Job description: ${String(agent.jobDescription).slice(0, 1200)}` : '',
    tools ? `Available tools: ${tools}` : '',
    channels ? `Channels: ${channels}` : '',
  ].filter(Boolean).join('\n')
}

function buildMessages({ prompt, context, agent }) {
  const system = [
    'You are participating in Farrington Command Center Model Lab.',
    'Answer the task directly. Do not mention benchmarks unless the task asks.',
    'Prefer concrete operational advice over generic AI filler.',
    agent?.name ? `Evaluate the answer as if it will be used by the selected CRM agent: ${agent.name}.` : '',
  ].join(' ')
  const agentBlock = agentContextBlock(agent)
  const content = [
    agentBlock ? `Selected agent profile:\n${agentBlock}` : '',
    context ? `Context:\n${context}` : '',
    `Task:\n${prompt}`,
  ].filter(Boolean).join('\n\n')
  return { system, messages: [{ role: 'user', content }] }
}

async function parseOpenAIStream(response, startedAt) {
  const reader = response.body?.getReader()
  if (!reader) {
    const body = await response.json()
    return {
      text: body.choices?.[0]?.message?.content || '',
      usage: normalizeUsage(body.usage),
      ttftMs: null,
    }
  }

  const decoder = new TextDecoder()
  let buffer = ''
  let output = ''
  let usage = null
  let ttftMs = null

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    if (ttftMs === null) ttftMs = Date.now() - startedAt
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n\n')
    buffer = parts.pop() || ''
    for (const part of parts) {
      const line = part.split('\n').find(row => row.startsWith('data: '))
      if (!line) continue
      const payload = line.slice(6).trim()
      if (!payload || payload === '[DONE]') continue
      try {
        const json = JSON.parse(payload)
        const delta = json.choices?.[0]?.delta?.content || ''
        if (delta) output += delta
        if (json.usage) usage = json.usage
      } catch {}
    }
  }

  return { text: output, usage: normalizeUsage(usage || {}), ttftMs }
}

async function callOpenAICompatible({ provider, model, prompt, context, agent, maxTokens }) {
  const outputCap = Number.isFinite(Number(maxTokens)) && Number(maxTokens) > 0 ? Math.min(16000, Math.floor(Number(maxTokens))) : 900
  const { key } = keyFor(provider)
  if (!key) throw new Error(`${provider} credential is not configured`)
  const baseUrl = provider === 'openai' ? 'https://api.openai.com/v1' : OPENAI_COMPATIBLE_BASES[provider]
  if (!baseUrl) throw new Error(`${provider} is not configured as an OpenAI-compatible provider`)
  const providerModel = provider === 'nvidia' ? `nvidia/${model}` : model
  const isOpenAiGpt5 = provider === 'openai' && /^gpt-5(?:[.-]|$)/i.test(model)
  const { system, messages } = buildMessages({ prompt, context, agent })
  const startedAt = Date.now()
  const body = {
    model: providerModel,
    messages: [{ role: 'system', content: system }, ...messages],
    stream: true,
    stream_options: { include_usage: true },
  }
  if (isOpenAiGpt5) body.max_completion_tokens = outputCap
  else body.max_tokens = outputCap
  if (provider === 'kimi') body.thinking = { type: 'disabled' }
  else if (isOpenAiGpt5) body.reasoning_effort = 'low'
  else body.temperature = 0.2
  const requestOptions = {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://crm.company.example.com',
      'X-Title': 'Farrington Command Center AI Lab',
      ...(provider === 'orcarouter' ? { 'X-OrcaRouter-Include-Cost': 'true' } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(provider === 'kimi' ? 120000 : 45000),
  }
  let response = await fetchOpenAICompatible(`${baseUrl}/chat/completions`, requestOptions, provider)
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    const shouldRetryOpenAiTokenParam = provider === 'openai'
      && body.max_tokens
      && /max_completion_tokens/i.test(text)
      && /max_tokens/i.test(text)
    if (shouldRetryOpenAiTokenParam) {
      const retryBody = { ...body, max_completion_tokens: body.max_tokens }
      delete retryBody.max_tokens
      response = await fetch(`${baseUrl}/chat/completions`, {
        ...requestOptions,
        body: JSON.stringify(retryBody),
        signal: AbortSignal.timeout(45000),
      })
      if (response.ok) {
        const parsed = await parseOpenAIStream(response, startedAt)
        return { ...parsed, latencyMs: Date.now() - startedAt }
      }
      const retryText = await response.text().catch(() => '')
      throw new Error(`${provider} ${response.status}: ${retryText.slice(0, 240)}`)
    }
    throw new Error(`${provider} ${response.status}: ${text.slice(0, 240)}`)
  }
  const route = provider === 'orcarouter' ? orcaRouteMetadata(response) : null
  const parsed = await parseOpenAIStream(response, startedAt)
  return { ...parsed, latencyMs: Date.now() - startedAt, route }
}

async function callAnthropic({ model, prompt, context, agent }) {
  const { key } = keyFor('anthropic')
  if (!key) throw new Error('Anthropic credential is not configured')
  const { system, messages } = buildMessages({ prompt, context, agent })
  const startedAt = Date.now()
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model, max_tokens: 900, system, messages }),
    signal: AbortSignal.timeout(45000),
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`Anthropic ${response.status}: ${text.slice(0, 240)}`)
  const body = JSON.parse(text)
  return {
    text: (body.content || []).filter(item => item.type === 'text').map(item => item.text).join('\n'),
    usage: normalizeUsage(body.usage),
    latencyMs: Date.now() - startedAt,
    ttftMs: null,
  }
}

async function callGoogle({ model, prompt, context, agent }) {
  const { key } = keyFor('google')
  if (!key) throw new Error('Google Gemini credential is not configured')
  const { system, messages } = buildMessages({ prompt, context, agent })
  const startedAt = Date.now()
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: messages.map(message => ({ role: 'user', parts: [{ text: message.content }] })),
      generationConfig: { maxOutputTokens: 900, temperature: 0.2 },
    }),
    signal: AbortSignal.timeout(45000),
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`Google ${response.status}: ${text.slice(0, 240)}`)
  const body = JSON.parse(text)
  return {
    text: body.candidates?.[0]?.content?.parts?.map(part => part.text).join('\n') || '',
    usage: normalizeUsage(body.usageMetadata),
    latencyMs: Date.now() - startedAt,
    ttftMs: null,
  }
}

async function callHuggingFace({ model, prompt, context, agent }) {
  const { key } = keyFor('huggingface')
  if (!key) throw new Error('Hugging Face credential is not configured')
  const { system, messages } = buildMessages({ prompt, context, agent })
  const startedAt = Date.now()
  const response = await fetch('https://api-inference.huggingface.co/models/' + encodeURIComponent(model), {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      inputs: `${system}\n\n${messages[0].content}`,
      parameters: { max_new_tokens: 700, temperature: 0.2, return_full_text: false },
    }),
    signal: AbortSignal.timeout(60000),
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`Hugging Face ${response.status}: ${text.slice(0, 240)}`)
  const body = JSON.parse(text)
  const output = Array.isArray(body)
    ? body.map(item => item.generated_text || item.summary_text || '').join('\n')
    : body.generated_text || body.summary_text || ''
  return { text: output, usage: normalizeUsage({}), latencyMs: Date.now() - startedAt, ttftMs: null }
}

async function dispatchModel({ modelId, prompt, context, agent, maxTokens }) {
  const { provider, model } = splitModelId(modelId)
  if (['openai', 'kimi', 'openrouter', 'orcarouter', 'deepseek', 'nvidia'].includes(provider)) {
    return callOpenAICompatible({ provider, model, prompt, context, agent, maxTokens })
  }
  if (provider === 'anthropic') return callAnthropic({ model, prompt, context, agent })
  if (provider === 'google') return callGoogle({ model, prompt, context, agent })
  if (provider === 'huggingface') return callHuggingFace({ model, prompt, context, agent })
  throw new Error(`Unsupported provider: ${provider || 'unknown'}`)
}

function resultShell(modelId) {
  const entry = catalogEntry(modelId)
  const { provider } = splitModelId(modelId)
  return {
    modelId,
    provider,
    providerLabel: PROVIDERS[provider]?.label || provider,
    modelName: entry?.name || modelId,
    tier: entry?.tier || '',
    bestFor: entry?.bestFor || '',
    openWeights: entry?.openWeights === true,
    weightPolicy: entry?.weightPolicy || (entry?.openWeights ? 'open' : ''),
    license: entry?.license || '',
  }
}

function cvaRecommendation({ results, useCaseId, budgetId, clientBudgetMonthly }) {
  const successful = results.filter(result => result.ok)
  const useCase = AI_LAB_USE_CASES.find(item => item.id === useCaseId) || AI_LAB_USE_CASES[1]
  const budget = AI_LAB_BUDGETS.find(item => item.id === budgetId) || AI_LAB_BUDGETS[1]
  if (!successful.length) {
    return {
      useCaseId: useCase.id,
      budgetId: budget.id,
      winnerModelId: '',
      fallbackModelId: '',
      decision: 'No promotion',
      rationale: 'No selected model completed successfully. Check credentials, model IDs, provider limits, or network health.',
      estimatedClientMonthly: 0,
      confidence: 'low',
    }
  }

  const maxLatency = Math.max(...successful.map(r => Number(r.latencyMs || 1)))
  const maxCost = Math.max(...successful.map(r => Number(r.cost?.estimatedUsd || 0.000001)))
  const scored = successful.map(result => {
    const latency = Number(result.latencyMs || maxLatency)
    const cost = Number(result.cost?.estimatedUsd || 0.000001)
    const speedScore = maxLatency ? 1 - (latency / maxLatency) : 0.5
    const costScore = maxCost ? 1 - (cost / maxCost) : 0.5
    const qualityProxy = Math.min(1, Math.max(0.2, Number(result.chars || 0) / 1200))
    const reliability = result.ttftMs == null || Number(result.ttftMs) < 10000 ? 0.82 : 0.62
    const weights = useCase.weights
    const score =
      qualityProxy * weights.quality +
      speedScore * weights.speed +
      costScore * weights.cost * budget.costWeight +
      reliability * weights.reliability
    return { ...result, cvaScore: Number(score.toFixed(4)), qualityProxy, speedScore, costScore, reliability }
  }).sort((a, b) => b.cvaScore - a.cvaScore)

  const winner = scored[0]
  const fallback = scored.find(item => item.modelId !== winner.modelId) || null
  const perRun = Number(winner.cost?.estimatedUsd || 0)
  const monthlyFloor = useCase.gpuFriendly ? 750 : useCase.voiceCritical ? 250 : 150
  const estimatedClientMonthly = Math.max(monthlyFloor, Math.ceil((perRun * 3000 * budget.priceMultiplier + monthlyFloor) / 25) * 25)
  const budgetCap = Number(clientBudgetMonthly || 0)
  const withinBudget = !budgetCap || estimatedClientMonthly <= budgetCap

  return {
    useCaseId: useCase.id,
    budgetId: budget.id,
    winnerModelId: winner.modelId,
    fallbackModelId: fallback?.modelId || '',
    decision: withinBudget ? 'Candidate approved for sandbox promotion' : 'Quality candidate exceeds stated budget',
    rationale: `${winner.modelName} scored highest for ${useCase.name}. ${fallback ? `${fallback.modelName} is the fallback candidate.` : 'No fallback candidate was available.'}`,
    estimatedClientMonthly,
    withinBudget,
    confidence: scored.length >= 2 ? 'medium' : 'low',
    scored: scored.map(item => ({
      modelId: item.modelId,
      score: item.cvaScore,
      qualityProxy: Number(item.qualityProxy.toFixed(3)),
      speedScore: Number(item.speedScore.toFixed(3)),
      costScore: Number(item.costScore.toFixed(3)),
      reliability: Number(item.reliability.toFixed(3)),
    })),
  }
}

export async function runAiModel({ modelId, prompt, context = '', agent = null, maxTokens, usageContext = {} } = {}) {
  if (!String(modelId || '').trim()) throw new Error('Model is required')
  if (!String(prompt || '').trim()) throw new Error('Prompt is required')
  const raw = await dispatchModel({ modelId, prompt, context, agent, maxTokens })
  const { provider, model } = splitModelId(modelId)
  const cost = estimateCost(modelId, raw.usage)
  const promptTokens = Number(raw.usage?.prompt_tokens || 0)
  const completionTokens = Number(raw.usage?.completion_tokens || 0)
  const resolvedModel = raw.route?.resolvedModel || model
  const estimated = cost?.estimatedUsd !== null && cost?.estimatedUsd !== undefined
    ? { estCostUsd: cost.estimatedUsd, unknown: false }
    : estimateModelCost({ model: resolvedModel, promptTokens, completionTokens, exactCostUsd: raw.usage?.cost_usd })
  recordUsageEvent({
    agentId: usageContext.agentId || agent?.id || agent?.slug || agent || 'ai-lab',
    provider,
    model: resolvedModel,
    promptTokens,
    completionTokens,
    ...estimated,
    clientId: usageContext.clientId,
    productId: usageContext.productId,
    requestId: usageContext.requestId || raw.route?.requestId,
    runId: usageContext.runId,
    source: usageContext.source || 'ai-lab',
  })
  return {
    text: raw.text,
    provider,
    model,
    modelId,
    usage: raw.usage,
    cost,
    latencyMs: raw.latencyMs,
    ttftMs: raw.ttftMs,
    route: raw.route || null,
  }
}

export async function runModelComparison({ modelIds, prompt, context = '', presetId = '', useCaseId = 'crm-operator', budgetId = 'balanced', clientBudgetMonthly = 0, agent = null }) {
  const ids = Array.from(new Set((modelIds || []).filter(Boolean))).slice(0, 6)
  if (!ids.length) throw new Error('Select at least one model')
  if (!String(prompt || '').trim()) throw new Error('Prompt is required')

  const startedAt = new Date()
  const results = await Promise.all(ids.map(async modelId => {
    const shell = resultShell(modelId)
    try {
      const raw = await runAiModel({ modelId, prompt, context, agent, usageContext: { source: 'ai-lab' } })
      return {
        ...shell,
        ok: true,
        text: raw.text,
        usage: raw.usage,
        cost: raw.cost,
        latencyMs: raw.latencyMs,
        ttftMs: raw.ttftMs,
        route: raw.route || null,
        chars: raw.text?.length || 0,
      }
    } catch (e) {
      return {
        ...shell,
        ok: false,
        error: e.message || String(e),
        text: '',
        usage: normalizeUsage({}),
        cost: estimateCost(modelId, {}),
        latencyMs: null,
        ttftMs: null,
        chars: 0,
      }
    }
  }))

  const successful = results.filter(result => result.ok)
  const totalEstimatedUsd = results.reduce((sum, result) => sum + Number(result.cost?.estimatedUsd || 0), 0)
  return {
    id: `lab_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: startedAt.toISOString(),
    presetId,
    prompt,
    contextChars: String(context || '').length,
    agent,
    useCaseId,
    budgetId,
    clientBudgetMonthly: Number(clientBudgetMonthly || 0),
    modelIds: ids,
    results,
    cva: cvaRecommendation({ results, useCaseId, budgetId, clientBudgetMonthly }),
    summary: {
      totalModels: results.length,
      successful: successful.length,
      failed: results.length - successful.length,
      fastestModelId: successful.slice().sort((a, b) => Number(a.latencyMs || Infinity) - Number(b.latencyMs || Infinity))[0]?.modelId || '',
      lowestEstimatedCostModelId: successful.slice().sort((a, b) => Number(a.cost?.estimatedUsd || Infinity) - Number(b.cost?.estimatedUsd || Infinity))[0]?.modelId || '',
      totalEstimatedUsd: Number(totalEstimatedUsd.toFixed(6)),
    },
  }
}
