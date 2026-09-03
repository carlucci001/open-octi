'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  DatabaseZap,
  FlaskConical,
  KeyRound,
  Play,
  RefreshCw,
  Search,
  ShieldCheck,
  Zap,
} from 'lucide-react'
import PageHeader from '../components/PageHeader'

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']
const AUTH_TYPES = [
  { id: 'bearer', label: 'Bearer' },
  { id: 'header', label: 'Header' },
  { id: 'query', label: 'Query key' },
  { id: 'none', label: 'None' },
]

const defaultHeaders = '{\n  "Accept": "application/json"\n}'
const newsroomHeaders = '{\n  "Accept": "application/json",\n  "Content-Type": "application/json",\n  "X-Tenant-ID": "wnct-times"\n}'
const NEWSROOM_SEARCH_SAMPLE = '{\n  "query": "City, ST local news",\n  "limit": 5\n}'

function safeJson(value, fallback) {
  try {
    if (!String(value || '').trim()) return fallback
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function pretty(value) {
  if (value === undefined || value === null || value === '') return ''
  if (typeof value === 'string') return value
  return JSON.stringify(value, null, 2)
}

function schemaSample(schema, depth = 0) {
  if (!schema || typeof schema !== 'object' || depth > 4) return {}
  if (schema.example !== undefined) return schema.example
  if (schema.default !== undefined) return schema.default
  if (schema.enum?.length) return schema.enum[0]
  if (schema.$ref) return {}
  if (schema.oneOf?.length) return schemaSample(schema.oneOf[0], depth + 1)
  if (schema.anyOf?.length) return schemaSample(schema.anyOf[0], depth + 1)
  if (schema.allOf?.length) return Object.assign({}, ...schema.allOf.map(item => schemaSample(item, depth + 1)))
  if (schema.type === 'array') return [schemaSample(schema.items, depth + 1)]
  if (schema.type === 'integer' || schema.type === 'number') return 0
  if (schema.type === 'boolean') return true
  if (schema.type === 'string') return schema.format === 'date-time' ? new Date().toISOString() : 'string'
  const props = schema.properties || {}
  const out = {}
  for (const [key, prop] of Object.entries(props).slice(0, 24)) out[key] = schemaSample(prop, depth + 1)
  return out
}

function Badge({ tone = 'neutral', children }) {
  const colors = {
    ok: ['var(--green-soft)', 'var(--green)'],
    warn: ['var(--yellow-soft)', 'var(--yellow)'],
    danger: ['var(--red-soft)', 'var(--red)'],
    accent: ['var(--accent-soft)', 'var(--accent)'],
    neutral: ['var(--surface2)', 'var(--text-muted)'],
  }[tone] || ['var(--surface2)', 'var(--text-muted)']
  return (
    <span className="inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold" style={{ background: colors[0], color: colors[1], border: '1px solid var(--border)' }}>
      {children}
    </span>
  )
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold mb-1" style={{ color: 'var(--text-muted)' }}>{label}</span>
      {children}
    </label>
  )
}

function JsonBlock({ value }) {
  return (
    <pre className="text-xs overflow-auto rounded-lg p-3" style={{ maxHeight: 420, background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', whiteSpace: 'pre-wrap' }}>
      {pretty(value) || 'No body'}
    </pre>
  )
}

function normalizePath(path) {
  const raw = String(path || '').trim()
  if (!raw) return '/'
  return raw.startsWith('/') || raw.startsWith('http') ? raw : `/${raw}`
}

export default function ApiLab() {
  const [presets, setPresets] = useState([])
  const [presetId, setPresetId] = useState('custom')
  const [baseUrl, setBaseUrl] = useState('https://www.content.example.com')
  const [endpointUrl, setEndpointUrl] = useState('https://www.content.example.com/api/ai/search-news')
  const [authType, setAuthType] = useState('bearer')
  const [headerName, setHeaderName] = useState('Authorization')
  const [queryName, setQueryName] = useState('key')
  const [prefix, setPrefix] = useState('Bearer')
  const [apiKey, setApiKey] = useState('')
  const [headersText, setHeadersText] = useState(newsroomHeaders)
  const [discoveryPaths, setDiscoveryPaths] = useState('/openapi.json\n/swagger.json')
  const [method, setMethod] = useState('POST')
  const [path, setPath] = useState('/api/ai/search-news')
  const [bodyText, setBodyText] = useState(NEWSROOM_SEARCH_SAMPLE)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [discovery, setDiscovery] = useState(null)
  const [response, setResponse] = useState(null)
  const [filter, setFilter] = useState('')
  const [history, setHistory] = useState([])

  useEffect(() => {
    let cancelled = false
    fetch('/api/api-lab', { cache: 'no-store' })
      .then(r => r.json())
      .then(data => {
        if (!cancelled && data?.presets) {
          setPresets(data.presets)
        }
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  const selectedPreset = useMemo(() => presets.find(item => item.id === presetId) || null, [presets, presetId])

  const operations = useMemo(() => {
    const list = discovery?.catalog?.operations || []
    const q = filter.trim().toLowerCase()
    if (!q) return list
    return list.filter(op => [op.method, op.path, op.summary, ...(op.tags || [])].join(' ').toLowerCase().includes(q))
  }, [discovery, filter])

  const auth = useMemo(() => ({
    type: authType,
    key: apiKey,
    headerName,
    queryName,
    prefix,
  }), [authType, apiKey, headerName, queryName, prefix])

  function applyPreset(preset, updateId = true) {
    if (!preset) return
    if (updateId) setPresetId(preset.id)
    setBaseUrl(preset.baseUrl || '')
    setEndpointUrl('')
    setAuthType(preset.auth?.type || 'bearer')
    setHeaderName(preset.auth?.headerName || (preset.auth?.type === 'bearer' ? 'Authorization' : 'x-api-key'))
    setQueryName(preset.auth?.queryName || 'key')
    setPrefix(preset.auth?.prefix ?? (preset.auth?.type === 'bearer' ? 'Bearer' : ''))
    setHeadersText(pretty({ Accept: 'application/json', ...(preset.defaultHeaders || {}) }))
    setDiscoveryPaths((preset.discoveryPaths || ['/openapi.json', '/swagger.json']).join('\n'))
    const sample = preset.samples?.[0]
    if (sample) {
      setMethod(sample.method || 'GET')
      setPath(sample.path || '/')
      setBodyText(sample.body ? pretty(sample.body) : '')
    }
  }

  function applyEndpoint(value) {
    const raw = String(value || '').trim()
    setEndpointUrl(raw)
    setPresetId('custom')
    if (!raw) return
    try {
      const url = new URL(raw.includes('://') ? raw : `https://${raw}`)
      setBaseUrl(url.origin)
      setPath(`${url.pathname || '/'}${url.search || ''}`)
    } catch {
      setPath(normalizePath(raw))
    }
  }

  function requestPayload(overrides = {}) {
    const headers = safeJson(headersText, {})
    const body = overrides.body !== undefined ? overrides.body : safeJson(bodyText, bodyText.trim())
    return {
      baseUrl,
      headers,
      auth,
      timeoutMs: 20000,
      ...overrides,
      body,
    }
  }

  async function postLab(payload) {
    const res = await fetch('/api/api-lab', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || data?.error) throw new Error(data?.error || `API Lab request failed with ${res.status}`)
    return data
  }

  async function runDiscovery() {
    setBusy('discover')
    setError('')
    try {
      const data = await postLab(requestPayload({
        action: 'discover',
        discoveryPaths: discoveryPaths.split('\n').map(v => v.trim()).filter(Boolean),
      }))
      setDiscovery(data)
    } catch (err) {
      setError(err.message)
      setDiscovery(null)
    } finally {
      setBusy('')
    }
  }

  async function runRequest(overrides = {}) {
    setBusy('request')
    setError('')
    try {
      const nextMethod = overrides.method || method
      const nextPath = normalizePath(overrides.path || path)
      const data = await postLab(requestPayload({
        action: 'request',
        method: nextMethod,
        path: nextPath,
        ...overrides,
      }))
      setResponse(data)
      setHistory(prev => [{ method: nextMethod, path: nextPath, status: data.result?.status, latencyMs: data.result?.latencyMs, at: new Date().toLocaleTimeString() }, ...prev].slice(0, 8))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy('')
    }
  }

  function useOperation(op) {
    setMethod(op.method)
    setPath(op.path)
    const jsonBody = op.requestBody?.find(item => item.contentType.includes('json')) || op.requestBody?.[0]
    if (jsonBody?.rawSchema) setBodyText(pretty(schemaSample(jsonBody.rawSchema)))
    else setBodyText('')
    if (jsonBody?.contentType) {
      const headers = safeJson(headersText, {})
      setHeadersText(pretty({ ...headers, 'Content-Type': jsonBody.contentType }))
    }
  }

  const statusTone = response?.result?.status < 300 ? 'ok' : response?.result?.status < 500 ? 'warn' : 'danger'

  return (
    <div className="api-lab-workspace command-workspace p-6" style={workspaceStyle}>
      <PageHeader
        icon={<FlaskConical size={20} />}
        title="API Lab"
        subtitle={`${operations.length || 0} operations / transient keys / public hosts only`}
        actions={(
        <div style={commandActionsStyle}>
          <button type="button" onClick={runDiscovery} disabled={busy === 'discover'} className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 font-semibold" style={primaryButton}>
            {busy === 'discover' ? <RefreshCw size={16} className="animate-spin" /> : <Search size={16} />} Discover
          </button>
          <button type="button" onClick={() => runRequest()} disabled={busy === 'request'} className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 font-semibold" style={secondaryButton}>
            {busy === 'request' ? <RefreshCw size={16} className="animate-spin" /> : <Play size={16} />} Run
          </button>
        </div>
        )}
      />

      {error && (
        <div role="alert" className="rounded-lg p-3 mb-4 flex items-center gap-2" style={{ background: 'var(--red-soft)', color: 'var(--red)', border: '1px solid var(--border)' }}>
          <AlertTriangle size={16} /> {error}
        </div>
      )}

      <div className="api-lab-rebuilt-layout" style={labGridStyle}>
        <section className="rounded-lg p-4" style={panelStyle}>
          <div className="flex items-center justify-between gap-3 mb-4">
            <h2 className="font-semibold flex items-center gap-2"><KeyRound size={18} /> Connection</h2>
            <button type="button" onClick={() => setApiKey('')} className="rounded-lg px-3 py-2 text-sm" style={ghostButton}>Clear key</button>
          </div>

          <div className="space-y-3">
            <div className="rounded-lg p-3" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Custom API</div>
                <Badge tone={presetId === 'custom' ? 'accent' : 'neutral'}>{presetId === 'custom' ? 'active' : 'available'}</Badge>
              </div>
              <Field label="Full endpoint URL">
                <input value={endpointUrl} onChange={e => applyEndpoint(e.target.value)} placeholder="https://www.content.example.com/api/ai/search-news" style={inputStyle} />
              </Field>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
                <button
                  type="button"
                  onClick={() => {
                    setPresetId('custom')
                    setBaseUrl('https://www.content.example.com')
                    applyEndpoint('https://www.content.example.com/api/ai/search-news')
                    setMethod('POST')
                    setAuthType('header')
                    setHeaderName('X-API-Key')
                    setPrefix('')
                    setHeadersText(newsroomHeaders)
                    setBodyText(NEWSROOM_SEARCH_SAMPLE)
                  }}
                  className="rounded-lg px-3 py-2 text-sm font-semibold"
                  style={secondaryButton}
                >
                  Load ContentHub search
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPresetId('custom')
                    setEndpointUrl('')
                    setBaseUrl('')
                    setPath('/')
                    setMethod('GET')
                    setBodyText('')
                    setHeadersText(defaultHeaders)
                  }}
                  className="rounded-lg px-3 py-2 text-sm font-semibold"
                  style={ghostButton}
                >
                  Blank custom API
                </button>
              </div>
            </div>
            <Field label="Preset">
              <select value={presetId} onChange={e => {
                const id = e.target.value
                setPresetId(id)
                const preset = presets.find(item => item.id === id)
                if (preset) applyPreset(preset, false)
              }} style={inputStyle}>
                {presets.map(preset => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
                <option value="custom">Custom API</option>
              </select>
            </Field>
            <Field label="Base URL">
              <input value={baseUrl} onChange={e => { setBaseUrl(e.target.value); setEndpointUrl(''); setPresetId('custom') }} placeholder="https://api.example.com/v1" style={inputStyle} />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Auth">
                <select value={authType} onChange={e => setAuthType(e.target.value)} style={inputStyle}>
                  {AUTH_TYPES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
              </Field>
              <Field label={authType === 'query' ? 'Query name' : 'Header'}>
                <input value={authType === 'query' ? queryName : headerName} onChange={e => authType === 'query' ? setQueryName(e.target.value) : setHeaderName(e.target.value)} style={inputStyle} />
              </Field>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-[120px_1fr] gap-3">
              <Field label="Prefix">
                <input
                  value={prefix}
                  onChange={e => setPrefix(e.target.value)}
                  placeholder={authType === 'header' ? 'Optional header prefix' : 'Bearer'}
                  style={inputStyle}
                  disabled={authType === 'query' || authType === 'none'}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  name="fcc-api-lab-auth-prefix"
                />
              </Field>
              <Field label="API key">
                <input value={apiKey} onChange={e => setApiKey(e.target.value)} type="password" autoComplete="off" placeholder="Paste key for this session" style={inputStyle} disabled={authType === 'none'} />
              </Field>
            </div>
            <Field label="Headers JSON">
              <textarea value={headersText} onChange={e => setHeadersText(e.target.value)} rows={5} spellCheck={false} style={monoInputStyle} />
            </Field>
            <Field label="Discovery paths">
              <textarea value={discoveryPaths} onChange={e => setDiscoveryPaths(e.target.value)} rows={4} spellCheck={false} style={monoInputStyle} />
            </Field>
          </div>

          {selectedPreset?.samples?.length ? (
            <div className="mt-4">
              <div className="text-xs font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>Quick tests</div>
              <div className="grid grid-cols-1 gap-2">
                {selectedPreset.samples.map(sample => (
                  <button
                    key={`${sample.method}-${sample.path}`}
                    type="button"
                    onClick={() => {
                      setMethod(sample.method)
                      setPath(sample.path)
                      setBodyText(sample.body ? pretty(sample.body) : '')
                      runRequest({ method: sample.method, path: sample.path, body: sample.body || '' })
                    }}
                    className="rounded-lg px-3 py-2 text-left"
                    style={sampleButton}
                  >
                    <span className="font-semibold">{sample.name}</span>
                    <span className="block text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{sample.method} {sample.path}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        <section className="rounded-lg p-4" style={panelStyle}>
            <div className="flex items-center justify-between gap-3 mb-4">
              <h2 className="font-semibold flex items-center gap-2"><DatabaseZap size={18} /> Endpoints</h2>
              {discovery?.sourceUrl ? <Badge tone="ok">OpenAPI</Badge> : <Badge>Manual</Badge>}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[110px_1fr] gap-3 mb-3">
              <select value={method} onChange={e => setMethod(e.target.value)} style={inputStyle}>
                {METHODS.map(item => <option key={item} value={item}>{item}</option>)}
              </select>
              <input value={path} onChange={e => setPath(e.target.value)} placeholder="/v1/resource" style={inputStyle} />
            </div>
            <Field label="Body">
              <textarea value={bodyText} onChange={e => setBodyText(e.target.value)} rows={8} spellCheck={false} placeholder='{"name":"test"}' style={monoInputStyle} />
            </Field>

            <div className="mt-4 mb-3">
              <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter discovered operations" style={inputStyle} />
            </div>

            <div className="space-y-2 overflow-auto pr-1" style={{ maxHeight: 520 }}>
              {operations.map(op => (
                <button key={`${op.method}-${op.path}-${op.id}`} type="button" onClick={() => useOperation(op)} className="w-full rounded-lg p-3 text-left" style={operationButton(op.method === method && op.path === path)}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-semibold text-sm">{op.method} {op.path}</span>
                    <Badge tone={op.requestBody?.length ? 'accent' : 'neutral'}>{op.requestBody?.length ? 'payload' : 'no body'}</Badge>
                  </div>
                  {op.summary ? <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{op.summary.slice(0, 160)}</p> : null}
                  <div className="flex flex-wrap gap-1 mt-2">
                    {(op.responses || []).slice(0, 5).map(code => <Badge key={code} tone={String(code).startsWith('2') ? 'ok' : 'neutral'}>{code}</Badge>)}
                    {(op.requestBody || []).slice(0, 2).map(body => <Badge key={body.contentType} tone="accent">{body.contentType}</Badge>)}
                  </div>
                </button>
              ))}
              {!operations.length && (
                <div className="rounded-lg p-4 text-sm" style={{ background: 'var(--surface2)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                  Run discovery or enter a path manually.
                </div>
              )}
            </div>
        </section>

        <section className="rounded-lg p-4" style={panelStyle}>
            <div className="flex items-center justify-between gap-3 mb-4">
              <h2 className="font-semibold flex items-center gap-2"><Activity size={18} /> Test Console</h2>
              {response?.result ? <Badge tone={statusTone}>{response.result.status} in {response.result.latencyMs}ms</Badge> : <Badge>idle</Badge>}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-4">
              <Metric icon={<ShieldCheck size={17} />} label="Boundary" value="Public HTTPS" />
              <Metric icon={<Zap size={17} />} label="Timeout" value="20s" />
              <Metric icon={<CheckCircle2 size={17} />} label="Storage" value="None" />
            </div>

            {discovery?.attempts?.length ? (
              <div className="mb-4">
                <div className="text-xs font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>Discovery attempts</div>
                <div className="grid grid-cols-1 gap-2">
                  {discovery.attempts.slice(0, 6).map((attempt, index) => (
                    <div key={`${attempt.url}-${index}`} className="rounded-lg px-3 py-2 text-xs flex items-center justify-between gap-3" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                      <span className="truncate">{attempt.url}</span>
                      <Badge tone={attempt.openapi ? 'ok' : attempt.ok ? 'warn' : 'neutral'}>{attempt.openapi ? 'schema' : attempt.status || 'skip'}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {response?.result ? (
              <div className="space-y-4">
                <div>
                  <div className="text-xs font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>Response body</div>
                  <JsonBlock value={response.result.json || response.result.text} />
                </div>
                <div>
                  <div className="text-xs font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>Response headers</div>
                  <JsonBlock value={response.result.headers} />
                </div>
              </div>
            ) : (
              <div className="rounded-lg p-5 text-sm" style={{ background: 'var(--surface2)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                No test response yet.
              </div>
            )}

            {history.length ? (
              <div className="mt-4">
                <div className="text-xs font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>Recent runs</div>
                <div className="space-y-2">
                  {history.map((item, index) => (
                    <button key={`${item.at}-${index}`} type="button" onClick={() => { setMethod(item.method); setPath(item.path) }} className="w-full rounded-lg px-3 py-2 text-left text-xs flex items-center justify-between gap-3" style={sampleButton}>
                      <span className="truncate">{item.method} {item.path}</span>
                      <span style={{ color: 'var(--text-muted)' }}>{item.status} / {item.latencyMs}ms</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
        </section>
      </div>
    </div>
  )
}

function Metric({ icon, label, value }) {
  return (
    <div className="rounded-lg p-3" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
      <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>{icon} {label}</div>
      <div className="font-bold mt-1" style={{ color: 'var(--text)' }}>{value}</div>
    </div>
  )
}

const workspaceStyle = {
  color: 'var(--text)',
  width: '100%',
  inlineSize: '100%',
  maxWidth: 'none',
  minHeight: '100%',
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
  gap: 16,
  overflowX: 'hidden',
  overflowY: 'visible',
}

const commandActionsStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  gap: 8,
  flexWrap: 'wrap',
}

const labGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))',
  alignItems: 'start',
  gap: 16,
  width: '100%',
  minWidth: 0,
}

const panelStyle = {
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  minWidth: 0,
}

const inputStyle = {
  width: '100%',
  minHeight: 44,
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--surface2)',
  color: 'var(--text)',
  padding: '0 12px',
  outline: 'none',
}

const monoInputStyle = {
  ...inputStyle,
  minHeight: 0,
  padding: 12,
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  fontSize: 12,
  lineHeight: 1.5,
}

const primaryButton = {
  minHeight: 44,
  background: 'var(--accent)',
  color: 'var(--accent-text)',
}

const secondaryButton = {
  minHeight: 44,
  background: 'var(--surface2)',
  color: 'var(--text)',
  border: '1px solid var(--border)',
}

const ghostButton = {
  minHeight: 40,
  background: 'transparent',
  color: 'var(--text-muted)',
  border: '1px solid var(--border)',
}

const sampleButton = {
  background: 'var(--surface2)',
  color: 'var(--text)',
  border: '1px solid var(--border)',
}

function operationButton(active) {
  return {
    background: active ? 'var(--accent-soft)' : 'var(--surface2)',
    color: 'var(--text)',
    border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
  }
}
