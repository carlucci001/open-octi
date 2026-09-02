import { NextResponse } from 'next/server'
import { readData } from '@/lib/dataStore'
import { requireCapability } from '@/lib/permissions'
import { logAuditEvent } from '@/lib/auditLog'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1'

const STATIC_SHORTLIST = [
  {
    id: 'nvidia/llama-3.3-nemotron-super-49b-v1.5',
    family: 'Reasoning',
    fit: 'Primary brain candidate for leased agents that need tool use, planning, and client-facing answers.',
    agentUse: 'Quote drafting, CRM follow-up, sales assistants, intake triage.',
    status: 'API catalog',
  },
  {
    id: 'nvidia/nemotron-3-super-120b-a12b',
    family: 'Deep reasoning',
    fit: 'Higher-depth evaluator or escalation model when you need stronger judgment than the day-to-day model.',
    agentUse: 'Proposal review, compliance checks, long-form analysis.',
    status: 'API catalog',
  },
  {
    id: 'nvidia/llama-nemotron-embed-1b-v2',
    family: 'Retrieval',
    fit: 'Embedding layer for customer-specific knowledge bases and leased-agent document memory.',
    agentUse: 'Website page recall, support docs, contract clause search.',
    status: 'API catalog',
  },
  {
    id: 'nvidia/llama-nemotron-rerank-1b-v2',
    family: 'Retrieval',
    fit: 'Reranks retrieved passages before an agent answers, improving answer quality without rewriting the whole stack.',
    agentUse: 'Better RAG for custom client pages and support agents.',
    status: 'API catalog',
  },
  {
    id: 'nvidia/llama-3.1-nemoguard-8b-content-safety',
    family: 'Safety',
    fit: 'Guardrail candidate for leased agents that need content policy checks before public responses.',
    agentUse: 'Public web chat, SMS assistants, inbound lead screening.',
    status: 'API catalog',
  },
  {
    id: 'nvidia/nemotron-parse',
    family: 'Document / vision',
    fit: 'Parse documents or page assets into structured text before an agent reasons over them.',
    agentUse: 'Contracts, uploaded specs, client site assets, intake packets.',
    status: 'API catalog',
  },
  {
    id: 'black-forest-labs/flux.1-schnell',
    family: 'Visual design',
    fit: 'Fast visual generation candidate for page assets and campaign images when the license and output quality fit.',
    agentUse: 'Landing page concepts, ad images, product mockups.',
    status: 'API catalog',
  },
]

const SURFACES = [
  {
    id: 'nim-api',
    name: 'NIM hosted APIs',
    status: 'Ready to test',
    description: 'OpenAI-compatible hosted endpoints from build.nvidia.com for text, retrieval, visual, multimodal, and safety models.',
    commandCenterUse: 'Plug into OpenClaw as an OpenAI-compatible provider, then assign NVIDIA models per agent or as fallbacks.',
    risk: 'Developer keys and model availability can carry rate limits; benchmark before promising leased-agent SLAs.',
    docsUrl: 'https://docs.api.nvidia.com/nim/reference/llm-apis',
  },
  {
    id: 'nvcf',
    name: 'NVIDIA Cloud Functions',
    status: 'Architecture candidate',
    description: 'A function layer for deploying and invoking GPU-backed inference, fine-tuning, batch, and simulation workloads.',
    commandCenterUse: 'Use for custom containers or GPU jobs when hosted NIM is not enough and a customer needs a specialized workflow.',
    risk: 'Needs a controlled deployment/account setup; do not wire client production traffic until a function and scoped invocation key are proven.',
    docsUrl: 'https://docs.nvidia.com/nvcf/api',
  },
  {
    id: 'build-gpus',
    name: 'Build GPUs / developer runtimes',
    status: 'Manual enrollment',
    description: 'NVIDIA Build links to GPU and workstation paths for experimenting with accelerated software and developer runtime access.',
    commandCenterUse: 'Track which demos need real GPU time versus hosted APIs, then decide whether to lease API usage, self-host NIM, or use NVCF.',
    risk: 'Access and terms vary by program; keep this as discovery until the specific runtime is available in the account.',
    docsUrl: 'https://build.nvidia.com/explore/discover',
  },
]

const IMPLEMENTATION_PATHS = [
  {
    id: 'fallback-brain',
    title: 'Agent brain fallback',
    value: 'Low-risk first step',
    description: 'Add NVIDIA NIM as an OpenAI-compatible provider and route selected agents to Nemotron as primary or fallback.',
  },
  {
    id: 'rag-upgrade',
    title: 'Knowledge retrieval upgrade',
    value: 'Good for leased agents',
    description: 'Use NVIDIA embedding and reranking models to improve custom site/page knowledge before answers are generated.',
  },
  {
    id: 'asset-lab',
    title: 'Page asset generator',
    value: 'Needs license review',
    description: 'Evaluate visual-design models for campaign concepts, client page graphics, and branded media drafts.',
  },
  {
    id: 'gpu-workload',
    title: 'Custom GPU workload',
    value: 'Later-stage',
    description: 'Use NVCF or self-hosted NIM only after a specific customer workflow justifies runtime ownership.',
  },
]

function readVaultCredentials() {
  const data = readData('credentials.json') || { credentials: [] }
  return Array.isArray(data.credentials) ? data.credentials : []
}

function findCredentialKey() {
  const envCandidates = [
    ['NVIDIA_API_KEY', process.env.NVIDIA_API_KEY],
    ['NVIDIA_NIM_API_KEY', process.env.NVIDIA_NIM_API_KEY],
    ['NGC_API_KEY', process.env.NGC_API_KEY],
  ]
  for (const [name, value] of envCandidates) {
    if (value && String(value).trim()) {
      return { key: String(value).trim(), source: 'env', sourceLabel: name, credentialName: name }
    }
  }

  const creds = readVaultCredentials()
  const match = creds.find(c => /nvidia|nim|ngc/i.test(c.name || ''))
  if (!match) return { key: '', source: 'missing', sourceLabel: '', credentialName: '' }
  const field = (match.fields || []).find(f => /api\s*key|key|token|ngc|nim/i.test(f.label || '') && String(f.value || '').trim())
    || (match.fields || []).find(f => String(f.value || '').trim())
  return {
    key: field?.value?.trim() || '',
    source: field?.value ? 'vault' : 'missing',
    sourceLabel: field?.label || (field?.value ? 'Unlabeled key field' : ''),
    credentialId: match.id,
    credentialName: match.name || 'NVIDIA',
  }
}

function safeKeyStatus(keyInfo) {
  return {
    configured: !!keyInfo.key,
    source: keyInfo.source,
    sourceLabel: keyInfo.sourceLabel,
    credentialId: keyInfo.credentialId || '',
    credentialName: keyInfo.credentialName || '',
  }
}

async function nvidiaFetch(path, key, opts = {}) {
  const res = await fetch(`${NVIDIA_BASE_URL}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
    signal: AbortSignal.timeout(15000),
    cache: 'no-store',
  })
  const text = await res.text()
  let body
  try { body = JSON.parse(text) } catch { body = text }
  return { ok: res.ok, status: res.status, body }
}

async function probeModels(key) {
  const started = Date.now()
  const result = await nvidiaFetch('/models', key, { method: 'GET' })
  const latencyMs = Date.now() - started
  if (!result.ok) {
    return {
      ok: false,
      status: result.status,
      latencyMs,
      error: result.body?.error?.message || result.body?.message || `HTTP ${result.status}`,
      models: [],
    }
  }
  const raw = Array.isArray(result.body?.data) ? result.body.data : []
  const seen = new Set()
  const models = raw
    .map(item => ({
      id: item.id,
      ownedBy: item.owned_by || item.ownedBy || '',
      created: item.created || null,
    }))
    .filter(item => {
      if (!item.id || seen.has(item.id)) return false
      seen.add(item.id)
      return true
    })
    .sort((a, b) => a.id.localeCompare(b.id))
  return { ok: true, status: result.status, latencyMs, models, count: models.length }
}

function pickDefaultModel(models = []) {
  const preferred = [
    'nvidia/llama-3.3-nemotron-super-49b-v1.5',
    'nvidia/llama-3.3-nemotron-super-49b-v1',
    'nvidia/nemotron-3-super-120b-a12b',
    'meta/llama-3.3-70b-instruct',
  ]
  const ids = new Set(models.map(m => m.id))
  return preferred.find(id => ids.has(id)) || models[0]?.id || STATIC_SHORTLIST[0].id
}

function buildPayload(extra = {}) {
  return {
    ok: true,
    fetchedAt: new Date().toISOString(),
    baseUrl: NVIDIA_BASE_URL,
    key: safeKeyStatus(findCredentialKey()),
    shortlist: STATIC_SHORTLIST,
    surfaces: SURFACES,
    implementationPaths: IMPLEMENTATION_PATHS,
    docs: [
      { label: 'NVIDIA NIM API reference', url: 'https://docs.api.nvidia.com/nim/reference/llm-apis' },
      { label: 'NVIDIA Build catalog', url: 'https://build.nvidia.com/explore/discover' },
      { label: 'NVIDIA Cloud Functions API', url: 'https://docs.nvidia.com/nvcf/api' },
      { label: 'NVCF developer overview', url: 'https://developer.nvidia.com/dgx-cloud/nvcf' },
    ],
    ...extra,
  }
}

export async function GET(request) {
  const { user, error } = await requireCapability(request, 'system:manage')
  if (error) return error

  const keyInfo = findCredentialKey()
  let probe = null
  if (keyInfo.key) {
    probe = await probeModels(keyInfo.key).catch(e => ({ ok: false, error: e.message, models: [] }))
  }

  logAuditEvent({
    request,
    user,
    action: 'nvidia_labs_opened',
    area: 'labs',
    severity: 'info',
    meta: { configured: !!keyInfo.key, modelCount: probe?.count || 0 },
  })

  return NextResponse.json(buildPayload({
    key: safeKeyStatus(keyInfo),
    probe,
    defaultModel: pickDefaultModel(probe?.models || []),
  }))
}

export async function POST(request) {
  const { user, error } = await requireCapability(request, 'system:manage')
  if (error) return error
  const body = await request.json().catch(() => ({}))
  const action = body.action || 'probe'
  const keyInfo = findCredentialKey()
  if (!keyInfo.key) {
    return NextResponse.json(buildPayload({
      key: safeKeyStatus(keyInfo),
      ok: false,
      error: 'No NVIDIA API key found in env or Credentials Vault.',
    }), { status: 400 })
  }

  if (action === 'probe') {
    const probe = await probeModels(keyInfo.key).catch(e => ({ ok: false, error: e.message, models: [] }))
    logAuditEvent({
      request,
      user,
      action: 'nvidia_labs_probe',
      area: 'labs',
      severity: probe.ok ? 'info' : 'warn',
      meta: { modelCount: probe.count || 0, error: probe.error || '' },
    })
    return NextResponse.json(buildPayload({
      key: safeKeyStatus(keyInfo),
      probe,
      defaultModel: pickDefaultModel(probe.models || []),
    }))
  }

  if (action === 'chat') {
    const model = String(body.model || STATIC_SHORTLIST[0].id).trim()
    const prompt = String(body.prompt || '').trim().slice(0, 2000)
    if (!prompt) return NextResponse.json({ ok: false, error: 'Prompt is required.' }, { status: 400 })

    const started = Date.now()
    const upstream = await nvidiaFetch('/chat/completions', keyInfo.key, {
      method: 'POST',
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: 'You are evaluating whether an NVIDIA-hosted model is suitable for a leased business agent. Answer briefly and concretely.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.2,
        max_tokens: 180,
      }),
    }).catch(e => ({ ok: false, status: 0, body: { error: { message: e.message } } }))
    const latencyMs = Date.now() - started
    const content = upstream.body?.choices?.[0]?.message?.content || ''
    const result = {
      ok: upstream.ok,
      model,
      latencyMs,
      content,
      usage: upstream.body?.usage || null,
      error: upstream.ok ? '' : (upstream.body?.error?.message || upstream.body?.message || `HTTP ${upstream.status}`),
    }

    logAuditEvent({
      request,
      user,
      action: 'nvidia_labs_chat_test',
      area: 'labs',
      severity: result.ok ? 'info' : 'warn',
      meta: { model, latencyMs, ok: result.ok, error: result.error || '' },
    })

    return NextResponse.json(result, { status: upstream.ok ? 200 : 502 })
  }

  return NextResponse.json({ ok: false, error: 'Unknown NVIDIA Labs action.' }, { status: 400 })
}
