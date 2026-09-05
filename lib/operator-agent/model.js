import { MODEL_CATALOG } from '@/lib/model-catalog'
import { resolveProviderKey } from '@/lib/openocti-keys'
import { toAnthropicTools, toGeminiTools } from '@/lib/agent-tools'

function modelFor(provider, requestedModel) {
  if (requestedModel) {
    const match = MODEL_CATALOG.find(item => item.id === requestedModel && item.provider === provider)
    if (match) return match
  }
  return MODEL_CATALOG.find(item => item.provider === provider && item.tier === 'standard')
    || MODEL_CATALOG.find(item => item.provider === provider)
}

export function selectFrontierLane({ requestedModel, resolveKey = resolveProviderKey } = {}) {
  const anthropic = resolveKey('anthropic')
  if (anthropic?.key) {
    const model = modelFor('anthropic', requestedModel)
    return { provider: 'anthropic', model: model?.id?.replace(/^anthropic\//, '') || 'claude-sonnet-4-6', catalogId: model?.id, key: anthropic.key, keySource: anthropic.source }
  }
  const google = resolveKey('google')
  if (google?.key) {
    const model = modelFor('google', requestedModel)
    return { provider: 'google', model: model?.id?.replace(/^google\//, '') || 'gemini-2.5-pro', catalogId: model?.id, key: google.key, keySource: google.source }
  }
  return { state: 'needs-key', needs: ['anthropic', 'google'] }
}

function anthropicMessages(messages = []) {
  return messages.filter(item => item.role === 'user' || item.role === 'assistant').map(item => ({ role: item.role, content: item.content }))
}

export async function callFrontierModel({ lane, system, messages, tools, maxTokens = 1800 }) {
  if (!lane || lane.state === 'needs-key') return { state: 'needs-key', needs: lane?.needs || ['anthropic', 'google'] }
  if (lane.provider === 'anthropic') {
    const { default: Anthropic } = await import('@anthropic-ai/sdk')
    const client = new Anthropic({ apiKey: lane.key })
    const response = await client.messages.create({ model: lane.model, system, messages: anthropicMessages(messages), tools: toAnthropicTools(tools), max_tokens: maxTokens })
    return {
      text: (response.content || []).filter(item => item.type === 'text').map(item => item.text).join('\n').trim(),
      toolCalls: (response.content || []).filter(item => item.type === 'tool_use').map(item => ({ id: item.id, name: item.name, input: item.input || {} })),
      usage: { inputTokens: response.usage?.input_tokens || 0, outputTokens: response.usage?.output_tokens || 0 },
      provider: lane.provider, model: lane.model, rawAssistant: response.content,
    }
  }
  const { GoogleGenAI } = await import('@google/genai')
  const client = new GoogleGenAI({ apiKey: lane.key })
  const response = await client.models.generateContent({
    model: lane.model,
    contents: messages.map(item => ({ role: item.role === 'assistant' ? 'model' : 'user', parts: [{ text: String(item.content || '') }] })),
    config: { systemInstruction: system, tools: toGeminiTools(tools), maxOutputTokens: maxTokens },
  })
  const calls = response.functionCalls || []
  return { text: String(response.text || '').trim(), toolCalls: calls.map((item, index) => ({ id: item.id || `gemini-${index}`, name: item.name, input: item.args || {} })), usage: { inputTokens: response.usageMetadata?.promptTokenCount || 0, outputTokens: response.usageMetadata?.candidatesTokenCount || 0 }, provider: lane.provider, model: lane.model }
}
