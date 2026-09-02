/**
 * Curated model catalog. Each entry maps a model id to friendly metadata
 * the Agent Manager UI uses for selection.
 *
 * - tier: which Brain profile this fits (fast/standard/premium/cheap)
 * - costIn / costOut: $ per million tokens (best-effort, update over time)
 * - bestFor: short tag for UI
 * - notes: optional human note
 *
 * The actual list of available providers is filtered at runtime against
 * openclaw.json (must have a configured apiKey or env: ref).
 */

export const PROVIDERS = {
  anthropic:   { label: 'Anthropic',  emoji: '🟧', envKey: 'ANTHROPIC_API_KEY' },
  openai:      { label: 'OpenAI',     emoji: '🟢', envKey: 'OPENAI_API_KEY' },
  deepseek:    { label: 'DeepSeek',   emoji: '🔷', envKey: 'DEEPSEEK_API_KEY' },
  google:      { label: 'Google',     emoji: '🟦', envKey: 'GOOGLE_API_KEY' },
  kimi:        { label: 'Kimi',       emoji: 'K2', envKey: 'KIMI_API_KEY' },
  openrouter:  { label: 'OpenRouter', emoji: '🟪', envKey: 'OPENROUTER_API_KEY' },
  orcarouter:  { label: 'OrcaRouter', emoji: 'OR', envKey: 'ORCAROUTER_API_KEY' },
  nvidia:      { label: 'NVIDIA',     emoji: '🟢', envKey: 'NVIDIA_API_KEY' },
  huggingface: { label: 'Hugging Face', emoji: '🤗', envKey: 'HF_TOKEN' },
}

export const MODEL_CATALOG = [
  // Anthropic
  { id: 'anthropic/claude-fable-5',            provider: 'anthropic', name: 'Claude Fable 5',      tier: 'premium',  ctx: 1000000, costIn: 10,   costOut: 50,  bestFor: 'Most capable Claude for demanding reasoning and long-horizon agentic work', notes: 'Generally available on Claude API; public Mythos-class model with safeguards.' },
  { id: 'anthropic/claude-mythos-5',           provider: 'anthropic', name: 'Claude Mythos 5',     tier: 'premium',  ctx: 1000000, costIn: 10,   costOut: 50,  bestFor: 'Limited Project Glasswing access', notes: 'Invitation-only limited availability; not shown in runnable bench unless access is explicitly enabled.', chat: false },
  { id: 'anthropic/claude-opus-4-8',           provider: 'anthropic', name: 'Claude Opus 4.8',     tier: 'premium',  ctx: 1000000, costIn: 5,    costOut: 25,  bestFor: 'Opus-tier reasoning, long-horizon coding, high-autonomy agents', notes: 'Latest Opus release; use Fable 5 for highest available Claude capability.' },
  { id: 'anthropic/claude-opus-4-7',           provider: 'anthropic', name: 'Claude Opus 4.7',     tier: 'premium',  ctx: 1000000, costIn: 15,   costOut: 75,  bestFor: 'Previous Opus release', notes: 'Pinned snapshot; keep for regression comparisons.' },
  { id: 'anthropic/claude-opus-4-6',           provider: 'anthropic', name: 'Claude Opus 4.6',     tier: 'premium',  ctx: 200000, costIn: 15,   costOut: 75,  bestFor: 'Legacy premium baseline', notes: 'Pinned snapshot; keep for regression comparisons.' },
  { id: 'anthropic/claude-sonnet-4-6',         provider: 'anthropic', name: 'Claude Sonnet 4.6',   tier: 'standard', ctx: 200000, costIn: 3,    costOut: 15,  bestFor: 'Everyday work — best value', notes: 'Default standard pick' },
  { id: 'anthropic/claude-haiku-4-5-20251001', provider: 'anthropic', name: 'Claude Haiku 4.5',    tier: 'fast',     ctx: 200000, costIn: 1,    costOut: 5,   bestFor: 'Fast, cheap, surprisingly capable', notes: 'Great for high-volume routine work' },

  // OpenAI
  { id: 'openai/gpt-5.5',                      provider: 'openai',    name: 'GPT-5.5',             tier: 'premium',  ctx: 400000, costIn: 5,    costOut: 25,  bestFor: 'Reasoning, image generation, agentic',  notes: 'Codex OAuth route only (Plus/Pro/Business). Not via API key.', chat: false },
  { id: 'openai/gpt-5',                        provider: 'openai',    name: 'GPT-5',               tier: 'standard', ctx: 400000, costIn: 2.5,  costOut: 12,  bestFor: 'Strong general purpose', notes: '' },
  { id: 'openai/gpt-5-mini',                   provider: 'openai',    name: 'GPT-5 Mini',          tier: 'fast',     ctx: 200000, costIn: 0.25, costOut: 1.5, bestFor: 'Fast, cheap OpenAI', notes: '' },
  { id: 'openai/gpt-4.1',                      provider: 'openai',    name: 'GPT-4.1',             tier: 'standard', ctx: 128000, costIn: 2,    costOut: 8,   bestFor: 'Solid fallback', notes: '' },
  { id: 'openai/gpt-realtime',                 provider: 'openai',    name: 'GPT Realtime',        tier: 'premium',  ctx: 32000,  costIn: 0,    costOut: 0,   bestFor: 'Live speech-to-speech demos', notes: 'Used by the OpenAI Realtime voice path, not OpenClaw chat.', chat: false },
  { id: 'openai/gpt-image-1',                  provider: 'openai',    name: 'GPT Image 1',         tier: 'premium',  ctx: 0,      costIn: 0,    costOut: 0,   bestFor: 'Image generation tool',  notes: 'Used as a tool, not a chat model' },

  // DeepSeek
  { id: 'deepseek/deepseek-chat',              provider: 'deepseek',  name: 'DeepSeek Chat (legacy alias)', tier: 'cheap',   ctx: 1000000, costIn: 0.14,  costOut: 0.28, bestFor: 'Compatibility alias', notes: 'Currently maps to V4 Flash; DeepSeek plans to discontinue this alias on 2026-07-24' },
  { id: 'deepseek/deepseek-v4-flash',          provider: 'deepseek',  name: 'DeepSeek V4 Flash',    tier: 'fast',    ctx: 1000000, costIn: 0.14,  costOut: 0.28, bestFor: 'Fast everyday calls', notes: 'Explicit V4 Flash model id' },
  { id: 'deepseek/deepseek-v4-pro',            provider: 'deepseek',  name: 'DeepSeek V4 Pro',      tier: 'premium', ctx: 1000000, costIn: 0.435, costOut: 0.87, bestFor: 'Reasoning and long-form work', notes: 'Current discounted V4 Pro pricing through 2026-05-31 per DeepSeek docs' },

  // Google
  { id: 'google/gemini-2.5-pro',               provider: 'google',    name: 'Gemini 2.5 Pro',      tier: 'premium',  ctx: 1000000, costIn: 1.25, costOut: 10, bestFor: 'Long-context reasoning', notes: 'Current Google project returns 403 until the Gemini Generative Language API is enabled.', chat: false },
  { id: 'google/gemini-2.5-flash',             provider: 'google',    name: 'Gemini 2.5 Flash',    tier: 'fast',     ctx: 1000000, costIn: 0.15, costOut: 0.6, bestFor: 'Fast, long-context, cheap', notes: 'Current Google project returns 403 until the Gemini Generative Language API is enabled.', chat: false },

  // Kimi / Moonshot
  { id: 'kimi/kimi-k2.6',                       provider: 'kimi',      name: 'Kimi K2.6',           tier: 'premium', ctx: 262144, costIn: 0.95, costOut: 4, bestFor: 'Long-context coding, agents, multimodal reasoning', notes: 'OpenAI-compatible Moonshot endpoint; cache-hit input pricing is lower.' },
  { id: 'kimi/kimi-k2.5',                       provider: 'kimi',      name: 'Kimi K2.5',           tier: 'standard', ctx: 262144, costIn: 0.6,  costOut: 2.5, bestFor: 'Agent and coding fallback', notes: 'Keep as fallback behind K2.6.' },

  // OpenRouter (routes to many providers)
  { id: 'openrouter/meta-llama/llama-3.3-70b-instruct', provider: 'openrouter', name: 'Llama 3.3 70B Instruct', tier: 'standard', ctx: 128000, costIn: 0.35, costOut: 0.4, bestFor: 'Open weights via OpenRouter', notes: '' },
  { id: 'openrouter/qwen/qwen3.6-27b',         provider: 'openrouter', name: 'Qwen 3.6 27B',       tier: 'fast',     ctx: 128000, costIn: 0.2,  costOut: 0.3,  bestFor: 'Fast multilingual',           notes: '' },

  // OrcaRouter (OpenAI-compatible gateway; route ids remain provider-prefixed)
  { id: 'orcarouter/orcarouter/auto',          provider: 'orcarouter', name: 'OrcaRouter Auto',            tier: 'standard', ctx: 128000, costIn: 0,    costOut: 0,    bestFor: 'Adaptive routing across open and proprietary models', notes: 'Mixed model ownership. OrcaRouter selects the upstream model per request; inspect the resolved-model metadata before promoting a workflow.', dynamicPricing: true, weightPolicy: 'mixed' },
  { id: 'orcarouter/orcarouter/free',          provider: 'orcarouter', name: 'OrcaRouter Free Router',     tier: 'fast',     ctx: 65536,  costIn: 0,    costOut: 0,    bestFor: 'No-charge experiments and high-volume trial runs', notes: 'The resolved free model can vary. Reasoning models may consume substantial completion tokens before visible text appears.', dynamicPricing: true, weightPolicy: 'mixed' },
  { id: 'orcarouter/qwen/qwen3.8-27b-free',    provider: 'orcarouter', name: 'Qwen 3.8 27B — Open Weights', tier: 'fast',     ctx: 65536,  costIn: 0,    costOut: 0,    bestFor: 'Explicit Apache-2.0 open-weight coding, extraction, and automation', notes: 'OrcaRouter reports this model as self-hosted on its infrastructure. Allow output-token headroom for reasoning.', openWeights: true, license: 'Apache-2.0' },
  { id: 'orcarouter/openai/gpt-4o-mini',       provider: 'orcarouter', name: 'GPT-4o Mini via OrcaRouter',  tier: 'fast',     ctx: 128000, costIn: 0.15, costOut: 0.6,  bestFor: 'Predictable low-cost closed-model baseline', notes: 'Closed-weight OpenAI model routed through OrcaRouter.', weightPolicy: 'closed' },

  // NVIDIA NIM
  { id: 'nvidia/llama-3.3-nemotron-super-49b-v1.5', provider: 'nvidia', name: 'Llama Nemotron Super 49B v1.5', tier: 'standard', ctx: 128000, costIn: 0.5, costOut: 0.8, bestFor: 'Tool use & reasoning', notes: 'NVIDIA key can list this model, but this account returns 403 for hosted chat completions. Keep in NVIDIA Runtime until chat entitlement is active.', chat: false },
  { id: 'nvidia/nemotron-3-super-120b-a12b',    provider: 'nvidia',    name: 'Nemotron 3 Super 120B', tier: 'premium',  ctx: 128000, costIn: 0.8,  costOut: 1.2,  bestFor: 'Deeper reasoning & evaluation', notes: 'NVIDIA key can list this model, but this account returns 403 for hosted chat completions. Keep in NVIDIA Runtime until chat entitlement is active.', chat: false },

  // Hugging Face Inference (subscription — covered by HF Pro plan)
  { id: 'huggingface/meta-llama/Llama-3.3-70B-Instruct',     provider: 'huggingface', name: 'Llama 3.3 70B',     tier: 'standard', ctx: 128000, costIn: 0,    costOut: 0,    bestFor: 'Strong open-weights fallback', notes: 'Local runtime cannot resolve api-inference.huggingface.co right now; keep out of live bench until endpoint access is restored.', chat: false },
  { id: 'huggingface/Qwen/Qwen2.5-72B-Instruct',             provider: 'huggingface', name: 'Qwen 2.5 72B',      tier: 'standard', ctx: 131072, costIn: 0,    costOut: 0,    bestFor: 'Multilingual + code',          notes: 'Local runtime cannot resolve api-inference.huggingface.co right now; keep out of live bench until endpoint access is restored.', chat: false },
  { id: 'huggingface/mistralai/Mistral-Small-24B-Instruct',  provider: 'huggingface', name: 'Mistral Small 24B', tier: 'fast',     ctx: 32000,  costIn: 0,    costOut: 0,    bestFor: 'Fast cheap fallback',          notes: 'Local runtime cannot resolve api-inference.huggingface.co right now; keep out of live bench until endpoint access is restored.', chat: false },
]

export const TIER_LABEL = {
  premium:  { label: 'Premium',  emoji: '💎', desc: 'Highest quality. Use for high-stakes drafting and decisions.' },
  standard: { label: 'Standard', emoji: '⭐', desc: 'Balanced. Right for most everyday work.' },
  fast:     { label: 'Fast',     emoji: '⚡', desc: 'Quick and inexpensive. Good for routine, high-volume tasks.' },
  cheap:    { label: 'Budget',   emoji: '💰', desc: 'Cheapest reasonable option. Good for high-volume background jobs.' },
}

/**
 * Filter catalog by what the user actually has access to.
 * `availableProviders` is a Set of provider ids that have apiKey configured.
 */
export function filterAvailable(availableProviders) {
  const set = availableProviders instanceof Set ? availableProviders : new Set(availableProviders || [])
  return MODEL_CATALOG.filter(m => set.has(m.provider))
}

/** Detect which providers have an apiKey configured in openclaw.json. */
export function detectAvailableProviders(openclawConfig) {
  const providers = (openclawConfig?.models?.providers) || {}
  const out = new Set()
  for (const [id, p] of Object.entries(providers)) {
    if (p?.apiKey) out.add(id)
  }
  return out
}
