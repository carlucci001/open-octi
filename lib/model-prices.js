// Maintained model pricing used for internal cost attribution.
// Values are USD per 1M tokens. Provider-reported exact costs always win.
export const MODEL_PRICES = Object.freeze({
  'openai/gpt-5': { prompt: 2.5, completion: 12 },
  'openai/gpt-5-mini': { prompt: 0.25, completion: 1.5 },
  'openai/gpt-4.1': { prompt: 2, completion: 8 },
  'gpt-5': { prompt: 2.5, completion: 12 },
  'gpt-5-mini': { prompt: 0.25, completion: 1.5 },
  'gpt-4.1': { prompt: 2, completion: 8 },
  'anthropic/claude-fable-5': { prompt: 10, completion: 50 },
  'anthropic/claude-opus-4-8': { prompt: 5, completion: 25 },
  'anthropic/claude-sonnet-4-6': { prompt: 3, completion: 15 },
  'anthropic/claude-haiku-4-5-20251001': { prompt: 1, completion: 5 },
  'deepseek/deepseek-chat': { prompt: 0.14, completion: 0.28 },
  'deepseek/deepseek-v4-flash': { prompt: 0.14, completion: 0.28 },
  'deepseek/deepseek-v4-pro': { prompt: 0.435, completion: 0.87 },
  'google/gemini-2.5-pro': { prompt: 1.25, completion: 10 },
  'gemini-2.5-pro': { prompt: 1.25, completion: 10 },
  'farrington-gemini-2-5-pro': { prompt: 1.25, completion: 10 },
  'google/gemini-2.5-flash': { prompt: 0.3, completion: 2.5 },
  'gemini-2.5-flash': { prompt: 0.3, completion: 2.5 },
  'perplexity/sonar-pro': { prompt: 3, completion: 15 },
  'sonar-pro': { prompt: 3, completion: 15 },
})

function cleanModel(value) {
  return String(value || '').trim().toLowerCase()
}

function finiteNonNegative(value) {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : 0
}

export function providerForModel(model, fallback = 'unknown') {
  const key = cleanModel(model)
  if (key.includes('/')) return key.split('/')[0]
  if (key.includes('gemini')) return 'google'
  if (key.includes('claude')) return 'anthropic'
  if (key.includes('gpt') || key.includes('openai')) return 'openai'
  if (key.includes('deepseek')) return 'deepseek'
  if (key.includes('sonar') || key.includes('perplexity')) return 'perplexity'
  return fallback
}

export function estimateModelCost({ model, promptTokens = 0, completionTokens = 0, exactCostUsd } = {}) {
  if (exactCostUsd !== null && exactCostUsd !== undefined && Number.isFinite(Number(exactCostUsd))) {
    return { estCostUsd: Number(Number(exactCostUsd).toFixed(6)), unknown: false }
  }
  const price = MODEL_PRICES[cleanModel(model)]
  if (!price) return { estCostUsd: 0, unknown: true }
  const cost = (finiteNonNegative(promptTokens) * price.prompt + finiteNonNegative(completionTokens) * price.completion) / 1_000_000
  return { estCostUsd: Number(cost.toFixed(6)), unknown: false }
}

function usageNumbers(value = {}) {
  return {
    promptTokens: finiteNonNegative(value.promptTokens ?? value.prompt_tokens ?? value.inputTokens ?? value.input_tokens ?? value.input_token_count),
    completionTokens: finiteNonNegative(value.completionTokens ?? value.completion_tokens ?? value.outputTokens ?? value.output_tokens ?? value.output_token_count),
  }
}

// DeerFlow/LangGraph messages commonly place token data in usage_metadata and
// the resolved model in response_metadata. Walk the final state once and sum
// message-level usage records without counting parent containers twice.
export function extractModelUsage(payload) {
  const seen = new Set()
  let promptTokens = 0
  let completionTokens = 0
  let model = ''

  function visit(value) {
    if (!value || typeof value !== 'object' || seen.has(value)) return
    seen.add(value)
    const usage = value.usage_metadata || value.usage || value.token_usage
    if (usage && typeof usage === 'object') {
      const numbers = usageNumbers(usage)
      promptTokens += numbers.promptTokens
      completionTokens += numbers.completionTokens
    }
    model ||= String(value.response_metadata?.model_name || value.response_metadata?.model || value.model_name || value.model || '')
    for (const child of Object.values(value)) visit(child)
  }

  visit(payload)
  return { model, promptTokens, completionTokens }
}
