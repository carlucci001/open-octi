'use client'

import ThemedSelect from '../components/ThemedSelect'
import { useEffect, useState } from 'react'
import {
  Activity,
  BarChart3,
  Brain,
  CheckCircle2,
  Clock3,
  Cpu,
  DatabaseZap,
  FlaskConical,
  KeyRound,
  Layers,
  Play,
  RefreshCw,
  Route,
  ShieldCheck,
  Sparkles,
  AlertTriangle,
  Zap,
} from 'lucide-react'
import PageHeader, { ViewToggle } from '../components/PageHeader'
import {
  canRunModelComparison,
  countSelectedProviders,
  selectReadyModelSlate,
  selectedModelEntries,
} from '../../lib/ai-lab-selection'
import OrchestrationDesigner from './OrchestrationDesigner'
import BenchRegistry from './BenchRegistry'

const TABS = [
  { id: 'bench', label: 'Bench' },
  { id: 'results', label: 'Results' },
  { id: 'orchestration', label: 'Orchestration' },
  { id: 'connectors', label: 'Connectors' },
  { id: 'catalog', label: 'Catalog' },
  { id: 'runtime', label: 'Runtime' },
]

const RUNTIME_LANES = [
  {
    id: 'hosted-api',
    title: 'Hosted API lane',
    status: 'Ready first',
    body: 'OpenAI, Gemini, Anthropic, DeepSeek, OpenRouter, Hugging Face, and NVIDIA NIM all fit here when credentials are present.',
    use: 'Best for fast model bakeoffs, agent routing decisions, and demo-safe evaluation.',
  },
  {
    id: 'apify-context',
    title: 'Apify context lane',
    status: 'Next module',
    body: 'Run an Apify actor, turn the result into a context packet, then replay the same packet through selected models.',
    use: 'Best for lead research, website intelligence, market scans, and data-grounded model tests.',
  },
  {
    id: 'gpu-runtime',
    title: 'NVIDIA GPU lane',
    status: 'Specialized',
    body: 'NVIDIA NIM and future NVCF jobs stay available for heavier reasoning, retrieval, rerank, safety, and custom GPU workloads.',
    use: 'Best for leased agents with custom performance or retrieval requirements.',
  },
]

export default function NvidiaLabs() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState('bench')
  const [error, setError] = useState('')
  const [presetId, setPresetId] = useState('reasoning-nuance')
  const [prompt, setPrompt] = useState('')
  const [context, setContext] = useState('')
  const [useCaseId, setUseCaseId] = useState('crm-operator')
  const [budgetId, setBudgetId] = useState('balanced')
  const [clientBudgetMonthly, setClientBudgetMonthly] = useState('')
  const [selectedModels, setSelectedModels] = useState([])
  const [activeRun, setActiveRun] = useState(null)
  const [lastRefreshedAt, setLastRefreshedAt] = useState(null)
  const [refreshCount, setRefreshCount] = useState(0)
  const [toolRegistry, setToolRegistry] = useState(null)
  const [agents, setAgents] = useState([])
  const [agentsError, setAgentsError] = useState('')
  const [selectedAgentId, setSelectedAgentId] = useState('')
  const [promotionTargets, setPromotionTargets] = useState([])
  const [promotionLoading, setPromotionLoading] = useState(false)
  const [promotionTargetId, setPromotionTargetId] = useState('__new_frankenstein__')
  const [promotionName, setPromotionName] = useState('')
  const [promotionPrimary, setPromotionPrimary] = useState('')
  const [promotionFallback, setPromotionFallback] = useState('')
  const [promotionBusy, setPromotionBusy] = useState(false)
  const [promotionStatus, setPromotionStatus] = useState('')
  const [promotionError, setPromotionError] = useState('')

  const load = async ({ refresh = false } = {}) => {
    if (refresh) setRefreshing(true)
    else setLoading(!data)
    setError('')
    try {
      const nonce = Date.now()
      const response = await fetch(`/api/ai-lab/compare?refresh=${nonce}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      })
      const json = await response.json()
      if (!response.ok || !json.ok) throw new Error(json.error || 'AI Lab failed to load')
      const tools = await fetch(`/api/agents/available-tools?refresh=${nonce}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      }).then(r => r.ok ? r.json() : null).catch(() => null)
      if (tools?.ok) setToolRegistry(tools)
      const agentData = await fetch(`/api/openclaw/agents?refresh=${nonce}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      }).then(r => r.ok ? r.json() : null).catch(e => ({ ok: false, error: e.message }))
      if (agentData?.ok && Array.isArray(agentData.agents)) {
        const liveAgents = agentData.agents.filter(agent => agent && agent.enabled !== false)
        setAgents(liveAgents)
        setAgentsError('')
        setSelectedAgentId(current => current || liveAgents[0]?.id || '')
      } else if (agentData?.error) {
        setAgentsError(agentData.error)
      }
      setData(json)
      setActiveRun(json.runs?.[0] || null)
      setLastRefreshedAt(new Date().toISOString())
      if (refresh) setRefreshCount(count => count + 1)
      const preset = (json.presets || []).find(item => item.id === presetId) || json.presets?.[0]
      if (preset && !prompt) {
        setPresetId(preset.id)
        setPrompt(preset.prompt)
      }
    } catch (e) {
      setError(e.message || String(e))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => { load() }, [])

  const models = data?.models || []
  const benchEntries = data?.benchEntries || models.map(model => ({ ...model, modelId: model.id, displayName: model.name, benchNotes: model.notes || '', enabled: true, custom: false }))
  const providers = data?.providers || []
  const presets = data?.presets || []
  const runs = data?.runs || []
  const planning = data?.planning || {}
  const instrumentation = data?.instrumentation || {}
  const useCases = planning.useCases || []
  const budgets = planning.budgets || []
  const connectors = planning.connectors || []
  const configuredProviders = providers.filter(provider => provider.configured)
  const readyModels = models.filter(model => model.configured)
  const connectorReady = connectors.filter(connector => connector.status === 'ready' || connector.status === 'guarded')

  const selectedEntries = selectedModelEntries(selectedModels, models)
  const selectedProviderCount = countSelectedProviders(selectedEntries)
  const selectedAllReady = selectedEntries.length === selectedModels.length && selectedEntries.every(model => model.configured)
  const canRunComparison = canRunModelComparison(selectedModels, prompt) && selectedAllReady && Boolean(selectedAgentId)

  const selectPreset = (id) => {
    const preset = presets.find(item => item.id === id)
    setPresetId(id)
    if (preset) setPrompt(preset.prompt)
  }

  const toggleModel = (id) => {
    const model = models.find(item => item.id === id)
    if (model && !model.configured && !selectedModels.includes(id)) return
    setSelectedModels(current => {
      if (current.includes(id)) return current.filter(item => item !== id)
      return [...current, id].slice(0, 6)
    })
  }

  const selectReadyPair = () => {
    const enabled = new Set(benchEntries.filter(entry => entry.enabled).map(entry => entry.modelId))
    setSelectedModels(selectReadyModelSlate(models.filter(model => enabled.has(model.id)), 2))
  }

  const selectReadySlate = () => {
    const enabled = new Set(benchEntries.filter(entry => entry.enabled).map(entry => entry.modelId))
    setSelectedModels(selectReadyModelSlate(models.filter(model => enabled.has(model.id)), 4))
  }

  const mutateBench = async (action, entry) => {
    const response = await fetch('/api/ai-lab/compare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: `bench-${action}`, entry }),
    })
    const json = await response.json()
    if (!response.ok || !json.ok) throw new Error(json.error || `Bench ${action} failed`)
    const nextEntries = json.benchEntries || []
    setData(current => ({ ...current, benchEntries: nextEntries }))
    const enabledModelIds = new Set(nextEntries.filter(item => item.enabled).map(item => item.modelId))
    setSelectedModels(current => current.filter(modelId => enabledModelIds.has(modelId)))
    return json
  }

  const runComparison = async () => {
    setBusy(true)
    setError('')
    setActiveRun(null)
    try {
      const response = await fetch('/api/ai-lab/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelIds: selectedModels, prompt, context, presetId, useCaseId, budgetId, clientBudgetMonthly, agentId: selectedAgentId }),
      })
      const json = await response.json()
      if (!response.ok || !json.ok) throw new Error(json.error || 'Comparison failed')
      setActiveRun(json.run)
      setData(current => ({ ...current, runs: json.runs || current?.runs || [], instrumentation: json.instrumentation || current?.instrumentation }))
      setTab('results')
    } catch (e) {
      setError(e.message || String(e))
    } finally {
      setBusy(false)
    }
  }

  const openCredentials = () => {
    window.dispatchEvent(new CustomEvent('fcc:set-tab', {
      detail: {
        tab: 'credentials',
        returnTo: { tab: 'nvidia-labs', label: 'AI Lab' },
      },
    }))
  }

  const latestRun = activeRun || runs[0] || null
  const selectedAgent = agents.find(agent => agent.id === selectedAgentId) || latestRun?.agent || null
  const fastest = latestRun?.summary?.fastestModelId || ''
  const cheapest = latestRun?.summary?.lowestEstimatedCostModelId || ''
  const successfulResults = latestRun?.results?.filter(result => result.ok) || []

  useEffect(() => {
    if (!latestRun) return
    const primary = latestRun.cva?.winnerModelId || fastest || successfulResults[0]?.modelId || ''
    const fallback = latestRun.cva?.fallbackModelId || cheapest || successfulResults.find(result => result.modelId !== primary)?.modelId || ''
    setPromotionPrimary(primary)
    setPromotionFallback(fallback && fallback !== primary ? fallback : '')
    setPromotionName(`Frankenstein ${shortModel(primary) || 'Lab Agent'}`)
    setPromotionStatus('')
    setPromotionError('')
    setPromotionLoading(true)
    fetch('/api/ai-lab/promote', { cache: 'no-store' })
      .then(response => response.json())
      .then(json => {
        if (!json.ok) throw new Error(json.error || 'Promotion targets failed to load')
        setPromotionTargets(json.targets || [])
      })
      .catch(e => setPromotionError(e.message || String(e)))
      .finally(() => setPromotionLoading(false))
  }, [latestRun?.id])

  const promoteWinner = async () => {
    if (!latestRun || !promotionPrimary) return
    setPromotionBusy(true)
    setPromotionError('')
    setPromotionStatus('')
    try {
      const sourceResult = successfulResults.find(result => result.modelId === promotionPrimary) || null
      const response = await fetch('/api/ai-lab/promote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          runId: latestRun.id,
          primaryModelId: promotionPrimary,
          fallbackModelId: promotionFallback,
          targetAgentId: promotionTargetId,
          createName: promotionTargetId === '__new_frankenstein__' ? promotionName : '',
          sourceResult,
        }),
      })
      const json = await response.json()
      if (!response.ok || !json.ok) throw new Error(json.error || 'Promotion failed')
      setPromotionStatus(`${json.promotion.agentName} now uses ${shortModel(json.promotion.primaryModelId)}${json.promotion.fallbackModelId ? ` with ${shortModel(json.promotion.fallbackModelId)} fallback` : ''}.`)
      setPromotionTargetId(json.promotion.agentId)
      const targets = await fetch('/api/ai-lab/promote', { cache: 'no-store' }).then(r => r.json()).catch(() => null)
      if (targets?.ok) setPromotionTargets(targets.targets || [])
    } catch (e) {
      setPromotionError(e.message || String(e))
    } finally {
      setPromotionBusy(false)
    }
  }

  if (loading) {
    return <div style={loadingStyle}>Loading AI Lab...</div>
  }

  return (
    <div className="ai-lab-workspace command-workspace lab-mobile-dense p-6" style={workspaceStyle}>
      <PageHeader
        icon={<FlaskConical size={20} />}
        title="AI Lab"
        subtitle="Model command bench"
        viewToggle={<ViewToggle view={tab} setView={setTab} options={TABS} />}
        actions={(
          <div style={heroActionsStyle}>
            <button type="button" onClick={() => load({ refresh: true })} disabled={busy || refreshing} style={buttonStyle('secondary')}>
              <RefreshCw size={15} /> {refreshing ? 'Refreshing' : 'Refresh'}
            </button>
            <button type="button" onClick={openCredentials} style={buttonStyle('secondary')}>
              <KeyRound size={15} /> Credentials
            </button>
          </div>
        )}
      >
        <div style={heroReadinessStyle}>
          <StatusDot tone={selectedAgentId ? 'ok' : 'warn'} label={selectedAgentId ? `Agent: ${agentName(selectedAgent)}` : 'Agent needed'} />
          <StatusDot tone={selectedModels.length >= 2 ? 'ok' : 'neutral'} label={`${selectedModels.length}/6 routes`} />
          <StatusDot tone={prompt.trim() ? 'ok' : 'warn'} label={prompt.trim() ? 'Prompt loaded' : 'Prompt needed'} />
        </div>
      </PageHeader>

      {error && <div role="alert" style={noticeStyle('warn')}><AlertTriangle size={16} /> {error}</div>}
      {lastRefreshedAt && (
        <div style={refreshStatusStyle}>
          <RefreshCw size={13} />
          <span>{refreshing ? 'Refreshing lab data...' : `Lab data updated ${new Date(lastRefreshedAt).toLocaleTimeString()}`}</span>
          {refreshCount > 0 && <span>Refresh clicks: {refreshCount}</span>}
          {latestRun && <span>Visible run: {latestRun.id}</span>}
        </div>
      )}

      <section style={snapshotStyle}>
        <div className="lab-summary-grid" style={summaryGridStyle}>
          <MetricCard icon={<KeyRound size={18} />} label="Configured providers" value={`${configuredProviders.length}/${providers.length}`} detail={configuredProviders.map(p => p.label).join(', ') || 'Add keys before live tests'} tone={configuredProviders.length ? 'ok' : 'warn'} />
          <MetricCard icon={<Layers size={18} />} label="Live runnable models" value={String(readyModels.length)} detail="Only providers with a resolved live key are shown here" tone={readyModels.length ? 'ok' : 'neutral'} />
          <MetricCard icon={<DatabaseZap size={18} />} label="Callable tools" value={toolRegistry?.counts ? String(toolRegistry.counts.callable) : `${connectorReady.length}/${connectors.length || 0}`} detail={toolRegistry?.counts ? `${toolRegistry.counts.vocabulary} dispatcher tools, ${Object.keys(toolRegistry.counts.byCategory || {}).length} categories` : connectorReady.map(c => c.name).slice(0, 3).join(', ') || 'Connector catalog loading'} tone={(toolRegistry?.counts?.callable || connectorReady.length) ? 'ok' : 'neutral'} />
          <MetricCard icon={<Clock3 size={18} />} label="Last run" value={latestRun ? `${latestRun.summary.successful}/${latestRun.summary.totalModels}` : 'None'} detail={latestRun ? new Date(latestRun.createdAt).toLocaleString() : 'Run a bench to start a record'} tone={latestRun?.summary?.failed ? 'warn' : latestRun ? 'ok' : 'neutral'} />
          <MetricCard icon={<Route size={18} />} label="Decision output" value={fastest ? 'Measured' : 'Pending'} detail={fastest ? `Fastest: ${shortModel(fastest)}` : 'Primary, fallback, evaluation-only'} tone={fastest ? 'ok' : 'neutral'} />
        </div>
        <div className="lab-instrumentation-bar" style={instrumentationBarStyle}>
          <MiniMetric label="Saved runs" value={instrumentation.runCount ?? 0} />
          <MiniMetric label="Success rate" value={instrumentation.successRate == null ? 'No data' : `${Math.round(instrumentation.successRate * 100)}%`} />
          <MiniMetric label="p50 latency" value={instrumentation.latency?.p50 ? `${instrumentation.latency.p50}ms` : 'No data'} />
          <MiniMetric label="p95 latency" value={instrumentation.latency?.p95 ? `${instrumentation.latency.p95}ms` : 'No data'} />
          <MiniMetric label="Total est. spend" value={money(instrumentation.totalEstimatedUsd)} />
        </div>
      </section>

      {tab === 'bench' && (
        <div className="ai-lab-bench-grid" style={benchGridStyle}>
          <section style={panelStyle}>
            <SectionTitle icon={<Brain size={18} />} title="Task setup" action={`${selectedModels.length}/6 models`} />
            <div style={noticeStyle(selectedModels.length >= 2 ? 'ok' : 'neutral')}>
              <Sparkles size={16} />
              {selectedModels.length >= 2
                ? `Ready to run ${selectedModels.length} model routes for ${agentName(selectedAgent)} across ${selectedProviderCount} provider${selectedProviderCount === 1 ? '' : 's'}. Each route receives the same task once.`
                : 'Select at least two model routes in the right column, then run the same task against both.'}
            </div>
            <div className="ai-lab-agent-picker" style={agentPickerStyle}>
              <div style={providerHeaderStyle}>
                <div>
                  <div style={rowTitleStyle}>Agent under test</div>
                  <div style={mutedStyle}>Pick the agent persona and tool profile this model bakeoff is evaluating.</div>
                </div>
                <span style={pillStyle(selectedAgentId ? 'ok' : 'warn')}>{selectedAgentId ? 'selected' : 'needed'}</span>
              </div>
              <div className="ai-lab-agent-picker-grid" style={agentPickerGridStyle}>
                <div>
                  <label style={labelStyle}>Agent</label>
                  <ThemedSelect value={selectedAgentId} onChange={e => setSelectedAgentId(e.target.value)} style={inputStyle}>
                    {!agents.length && <option value="">No agents loaded</option>}
                    {agents.map(agent => (
                      <option key={agent.id} value={agent.id}>{agentName(agent)}</option>
                    ))}
                  </ThemedSelect>
                </div>
                <div style={selectedAgentSummaryStyle}>
                  <div style={sectionLabelStyle}>Current test profile</div>
                  <div style={rowTitleStyle}>{agentName(selectedAgent)}</div>
                  <div style={mutedStyle}>{selectedAgent?.role || selectedAgent?.title || selectedAgent?.category || 'Agent persona will be included in the run context.'}</div>
                </div>
              </div>
              {agentsError && <div style={{ ...mutedStyle, color: 'var(--amber, #f59e0b)' }}>Agents could not load: {agentsError}</div>}
              <div style={agentChipRailStyle}>
                {agents.slice(0, 8).map(agent => (
                  <button key={agent.id} type="button" onClick={() => setSelectedAgentId(agent.id)} style={agentChipStyle(agent.id === selectedAgentId)}>
                    {agentName(agent)}
                  </button>
                ))}
              </div>
            </div>
            <div style={presetGridStyle}>
              {presets.map(preset => (
                <button key={preset.id} type="button" onClick={() => selectPreset(preset.id)} style={presetButtonStyle(preset.id === presetId)}>
                  <span style={presetCategoryStyle}>{preset.category}</span>
                  <strong>{preset.name}</strong>
                </button>
              ))}
            </div>
            <label style={labelStyle}>Prompt</label>
            <textarea value={prompt} onChange={e => setPrompt(e.target.value)} style={{ ...inputStyle, minHeight: 156, resize: 'vertical' }} />
            <label style={{ ...labelStyle, marginTop: 12 }}>Optional context packet</label>
            <textarea
              value={context}
              onChange={e => setContext(e.target.value)}
              placeholder="Paste Apify scrape notes, lead research, transcript excerpts, or a CRM scenario here."
              style={{ ...inputStyle, minHeight: 96, resize: 'vertical' }}
            />
            <div style={decisionControlsStyle}>
              <div>
                <label style={labelStyle}>Use case</label>
                <ThemedSelect value={useCaseId} onChange={e => setUseCaseId(e.target.value)} style={inputStyle}>
                  {useCases.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                </ThemedSelect>
              </div>
              <div>
                <label style={labelStyle}>Budget posture</label>
                <ThemedSelect value={budgetId} onChange={e => setBudgetId(e.target.value)} style={inputStyle}>
                  {budgets.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                </ThemedSelect>
              </div>
              <div>
                <label style={labelStyle}>Client cap/mo</label>
                <input value={clientBudgetMonthly} onChange={e => setClientBudgetMonthly(e.target.value.replace(/[^\d.]/g, ''))} placeholder="Optional" style={inputStyle} />
              </div>
            </div>
            <div style={benchActionRowStyle}>
              <button type="button" onClick={runComparison} disabled={busy || !canRunComparison} style={buttonStyle('primary')}>
                <Play size={15} /> {busy ? 'Running bench...' : canRunComparison ? `Run ${selectedModels.length}-route comparison` : 'Run comparison'}
              </button>
              <div style={mutedStyle}>{!selectedAgentId ? 'Pick an agent to test first.' : selectedModels.length < 2 ? 'Pick two or more models first. No mock scores are created.' : 'No mock scores. CVA appears only after real model results are recorded.'}</div>
            </div>
          </section>

          <BenchRegistry
            entries={benchEntries}
            catalogModels={models}
            selectedModels={selectedModels}
            onToggleModel={toggleModel}
            onSelectReadyPair={selectReadyPair}
            onSelectReadySlate={selectReadySlate}
            onClear={() => setSelectedModels([])}
            onCreate={entry => mutateBench('create', entry)}
            onUpdate={entry => mutateBench('update', { id: entry.id, displayName: entry.displayName, notes: entry.notes, enabled: entry.enabled })}
            onDelete={entry => mutateBench('delete', { id: entry.id })}
          />
        </div>
      )}

      {tab === 'orchestration' && <OrchestrationDesigner />}

      {tab === 'results' && (
        <div className="ai-lab-results-grid" style={resultsGridStyle}>
          <section style={panelStyle}>
            <SectionTitle icon={<BarChart3 size={18} />} title="Comparison results" action={latestRun ? `Run ${latestRun.id}` : 'No run'} />
            {!latestRun && <EmptyState text="Run a comparison from the Bench tab to see model output, latency, TTFT, usage, and estimated cost." />}
            {latestRun && (
              <div style={{ display: 'grid', gap: 12 }}>
                {latestRun.agent && (
                  <div style={noticeStyle('neutral')}>
                    <Brain size={16} />
                    Tested for {agentName(latestRun.agent)}{latestRun.agent.role ? `: ${latestRun.agent.role}` : ''}
                  </div>
                )}
                <div style={decisionStripStyle}>
                  <DecisionCard label="Fastest" value={shortModel(fastest)} icon={<Zap size={16} />} />
                  <DecisionCard label="Lowest est. cost" value={shortModel(cheapest)} icon={<Activity size={16} />} />
                  <DecisionCard label="Total est. spend" value={money(latestRun.summary.totalEstimatedUsd)} icon={<DatabaseZap size={16} />} />
                </div>
                {latestRun.results.map(result => (
                  <ResultCard key={result.modelId} result={result} fastest={result.modelId === fastest} cheapest={result.modelId === cheapest} />
                ))}
              </div>
            )}
          </section>

          <section style={panelStyle}>
            <SectionTitle icon={<ShieldCheck size={18} />} title="Promotion decision" action="PM view" />
            {!latestRun && <EmptyState text="The lab will surface primary, fallback, and evaluation-only candidates after a run." compact />}
            {latestRun && (
              <div style={{ display: 'grid', gap: 10 }}>
                <GuidanceRow tone="ok" title="Primary candidate" body={latestRun.cva?.winnerModelId ? `${shortModel(latestRun.cva.winnerModelId)} is the CVA winner. ${latestRun.cva.rationale}` : 'No successful model yet.'} />
                <GuidanceRow tone="neutral" title="Fallback candidate" body={latestRun.cva?.fallbackModelId ? `${shortModel(latestRun.cva.fallbackModelId)} is the fallback candidate.` : cheapest ? `${shortModel(cheapest)} is the cost-control candidate. Use it for background or low-risk work if quality holds.` : 'No cost candidate yet.'} />
                <GuidanceRow tone={latestRun.cva?.withinBudget === false ? 'warn' : 'ok'} title="Client price estimate" body={latestRun.cva ? `${money(latestRun.cva.estimatedClientMonthly).replace('.000000', '')}/mo. ${latestRun.cva.decision}. Confidence: ${latestRun.cva.confidence}.` : 'Run a comparison to price the stack.'} />
                <GuidanceRow tone={latestRun.summary.failed ? 'warn' : 'ok'} title="Risk" body={latestRun.summary.failed ? `${latestRun.summary.failed} model test failed. Review credentials, model IDs, or provider rate limits.` : 'All selected models answered.'} />
                <GuidanceRow tone="neutral" title="Next action" body="Repeat this preset with an Apify context packet, then compare the recommendation against a real CRM workflow." />
                <div style={promotionBoxStyle}>
                  <div style={providerHeaderStyle}>
                    <div>
                      <div style={rowTitleStyle}>Promote to Frankenstein agent</div>
                      <div style={mutedStyle}>Guarded promotion: experimental, sandbox, draft, lab, or newly created Frankenstein agents only.</div>
                    </div>
                    <span style={pillStyle('neutral')}>sandbox only</span>
                  </div>
                  <div style={promotionFormStyle}>
                    <div>
                      <label style={labelStyle}>Target</label>
                      <ThemedSelect style={inputStyle} value={promotionTargetId} onChange={e => setPromotionTargetId(e.target.value)} disabled={promotionBusy || promotionLoading}>
                        <option value="__new_frankenstein__">Create new Frankenstein agent</option>
                        {promotionTargets.map(agent => (
                          <option key={agent.id} value={agent.id}>{agent.name || agent.id}</option>
                        ))}
                      </ThemedSelect>
                    </div>
                    {promotionTargetId === '__new_frankenstein__' && (
                      <div>
                        <label style={labelStyle}>New agent name</label>
                        <input style={inputStyle} value={promotionName} onChange={e => setPromotionName(e.target.value)} placeholder="Frankenstein Kimi Lab Agent" disabled={promotionBusy} />
                      </div>
                    )}
                    <div>
                      <label style={labelStyle}>Primary model</label>
                      <ThemedSelect style={inputStyle} value={promotionPrimary} onChange={e => setPromotionPrimary(e.target.value)} disabled={promotionBusy}>
                        {successfulResults.map(result => (
                          <option key={result.modelId} value={result.modelId}>{result.modelName || result.modelId}</option>
                        ))}
                      </ThemedSelect>
                    </div>
                    <div>
                      <label style={labelStyle}>Fallback model</label>
                      <ThemedSelect style={inputStyle} value={promotionFallback} onChange={e => setPromotionFallback(e.target.value)} disabled={promotionBusy}>
                        <option value="">No fallback</option>
                        {successfulResults.filter(result => result.modelId !== promotionPrimary).map(result => (
                          <option key={result.modelId} value={result.modelId}>{result.modelName || result.modelId}</option>
                        ))}
                      </ThemedSelect>
                    </div>
                  </div>
                  {promotionError && <div role="alert" style={noticeStyle('warn')}><AlertTriangle size={15} /> {promotionError}</div>}
                  {promotionStatus && <div role="status" style={noticeStyle('ok')}><CheckCircle2 size={15} /> {promotionStatus}</div>}
                  <div style={promotionActionStyle}>
                    <button type="button" onClick={promoteWinner} disabled={promotionBusy || promotionLoading || !promotionPrimary || (promotionTargetId === '__new_frankenstein__' && !promotionName.trim())} style={buttonStyle('primary')}>
                      <ShieldCheck size={15} /> {promotionBusy ? 'Promoting...' : 'Promote lab winner'}
                    </button>
                    <span style={mutedStyle}>{promotionLoading ? 'Loading experimental agents...' : `${promotionTargets.length} existing experimental target${promotionTargets.length === 1 ? '' : 's'} found`}</span>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {tab === 'connectors' && (
        <section style={panelStyle}>
          <SectionTitle icon={<DatabaseZap size={18} />} title="Connector readiness" action="Assignable to agents" />
          <p style={bodyTextStyle}>This is the live planning surface for agent leasing. It shows connector capability status only; it does not pretend a connector is configured for a client until credentials and permissions exist.</p>
          {toolRegistry?.counts && (
            <div style={decisionStripStyle}>
              <DecisionCard label="Callable tools" value={String(toolRegistry.counts.callable)} icon={<Zap size={16} />} />
              <DecisionCard label="Dispatcher vocabulary" value={String(toolRegistry.counts.vocabulary)} icon={<Route size={16} />} />
              <DecisionCard label="Registry generated" value={new Date(toolRegistry.generatedAt).toLocaleTimeString()} icon={<Activity size={16} />} />
            </div>
          )}
          <div style={connectorGridStyle}>
            {connectors.map(connector => (
              <div key={connector.id} style={connectorCardStyle(connector.status)}>
                <div style={providerHeaderStyle}>
                  <div>
                    <div style={rowTitleStyle}>{connector.name}</div>
                    <div style={mutedStyle}>Risk: {connector.risk}</div>
                  </div>
                  <span style={pillStyle(connector.status === 'ready' || connector.status === 'guarded' ? 'ok' : connector.status === 'planned' ? 'warn' : 'neutral')}>{connector.status}</span>
                </div>
                <div style={{ ...mutedStyle, marginTop: 10 }}>{connector.assignable ? 'Can be assigned in a guarded agent package.' : 'Lab/planning only until wired and verified.'}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {tab === 'catalog' && (
        <section style={panelStyle}>
          <SectionTitle icon={<Layers size={18} />} title="Runnable model routes" action={`${models.length} live`} />
          <div style={providerGridStyle}>
            {configuredProviders.map(provider => (
              <div key={provider.id} style={providerCardStyle(provider.configured)}>
                <div style={providerHeaderStyle}>
                  <div>
                    <div style={rowTitleStyle}>{provider.label}</div>
                    <div style={mutedStyle}>{provider.modelCount} runnable catalog models</div>
                  </div>
                  <span style={pillStyle(provider.configured ? 'ok' : 'warn')}>{provider.configured ? provider.source : provider.envKey}</span>
                </div>
              </div>
            ))}
          </div>
          <div style={catalogTableStyle}>
            {models.map(model => (
              <div key={model.id} className="ai-lab-catalog-row" style={catalogRowStyle}>
                <div>
                  <div style={rowTitleStyle}>{model.name}</div>
                  <div style={monoMutedStyle}>{model.id}</div>
                </div>
                <span style={pillStyle(model.configured ? 'ok' : 'warn')}>{model.providerLabel}</span>
                <span style={pillStyle('neutral')}>{model.tier}</span>
                <span style={mutedStyle}>{model.bestFor}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {tab === 'runtime' && (
        <div style={runtimeGridStyle}>
          {RUNTIME_LANES.map(lane => (
            <section key={lane.id} style={panelStyle}>
              <SectionTitle icon={lane.id === 'gpu-runtime' ? <Cpu size={18} /> : <Route size={18} />} title={lane.title} action={lane.status} />
              <p style={bodyTextStyle}>{lane.body}</p>
              <div style={sectionLabelStyle}>Command Center use</div>
              <p style={mutedStyle}>{lane.use}</p>
            </section>
          ))}
          <section style={panelStyle}>
            <SectionTitle icon={<DatabaseZap size={18} />} title="Cost ledger" action="Per run" />
            <p style={bodyTextStyle}>Each comparison records estimated model cost from the catalog, tokens when the provider returns usage, latency, TTFT when stream data is available, and failed-provider count.</p>
            <p style={mutedStyle}>Catalog prices are planning estimates, not billing truth. Billing truth still comes from provider usage APIs and invoices.</p>
          </section>
        </div>
      )}
    </div>
  )
}

function SectionTitle({ icon, title, action }) {
  return (
    <div style={sectionTitleStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <span style={{ color: 'var(--accent)' }}>{icon}</span>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>{title}</h2>
      </div>
      {action && <span style={pillStyle('neutral')}>{action}</span>}
    </div>
  )
}

function MetricCard({ icon, label, value, detail, tone }) {
  return (
    <div style={metricCardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <span style={{ color: toneColor(tone) }}>{icon}</span>
        <span style={pillStyle(tone)}>{label}</span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 850, color: 'var(--text)', marginTop: 14 }}>{value}</div>
      <div style={{ ...mutedStyle, marginTop: 5, minHeight: 34 }}>{detail}</div>
    </div>
  )
}

function DecisionCard({ icon, label, value }) {
  return (
    <div style={decisionCardStyle}>
      <span style={{ color: 'var(--accent)' }}>{icon}</span>
      <div>
        <div style={sectionLabelStyle}>{label}</div>
        <div style={rowTitleStyle}>{value || 'n/a'}</div>
      </div>
    </div>
  )
}

function ResultCard({ result, fastest, cheapest }) {
  return (
    <article style={resultCardStyle(result.ok)}>
      <div style={resultHeaderStyle}>
        <div style={{ minWidth: 0 }}>
          <div style={modelTitleStyle}>{result.modelName}</div>
          <div style={monoMutedStyle}>{result.modelId}</div>
        </div>
        <div style={modelBadgesStyle}>
          {fastest && <span style={pillStyle('ok')}>fastest</span>}
          {cheapest && <span style={pillStyle('neutral')}>lowest cost</span>}
          {result.openWeights && <span style={pillStyle('ok')}>open weights{result.license ? ` · ${result.license}` : ''}</span>}
          {result.weightPolicy === 'mixed' && <span style={pillStyle('warn')}>mixed model ownership</span>}
          <span style={pillStyle(result.ok ? 'ok' : 'warn')}>{result.ok ? 'answered' : 'failed'}</span>
        </div>
      </div>
      <div style={resultMetricsStyle}>
        <MiniMetric label="Latency" value={result.latencyMs ? `${result.latencyMs}ms` : 'n/a'} />
        <MiniMetric label="TTFT" value={result.ttftMs ? `${result.ttftMs}ms` : 'n/a'} />
        <MiniMetric label="Tokens" value={result.cost?.totalTokens || 'n/a'} />
        <MiniMetric label={result.cost?.exact ? 'Exact cost' : 'Est. cost'} value={result.cost?.estimatedUsd == null ? 'provider-priced' : money(result.cost.estimatedUsd)} />
        {result.route?.resolvedModel && <MiniMetric label="Resolved model" value={result.route.resolvedModel} />}
        {result.route?.router && <MiniMetric label="Router" value={result.route.router} />}
      </div>
      {result.ok ? <pre style={resultTextStyle}>{result.text || 'No text returned.'}</pre> : <div style={noticeStyle('warn')}>{result.error}</div>}
    </article>
  )
}

function MiniMetric({ label, value }) {
  return (
    <div style={miniMetricStyle}>
      <div style={sectionLabelStyle}>{label}</div>
      <div style={rowTitleStyle}>{value}</div>
    </div>
  )
}

function StatusDot({ tone, label }) {
  const color = toneColor(tone)
  return (
    <span style={statusDotStyle(color)}>
      <span style={statusDotBulletStyle(color)} />
      {label}
    </span>
  )
}

function GuidanceRow({ tone, title, body }) {
  return (
    <div style={guidanceStyle(tone)}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {tone === 'warn' ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
        <strong>{title}</strong>
      </div>
      <div style={{ ...mutedStyle, marginTop: 5 }}>{body}</div>
    </div>
  )
}

function EmptyState({ text, compact = false }) {
  return <div style={{ ...emptyStyle, minHeight: compact ? 96 : 220 }}>{text}</div>
}

function shortModel(id) {
  return String(id || '').split('/').slice(-1)[0] || ''
}

function agentName(agent) {
  if (!agent) return 'selected agent'
  return agent.name || agent.displayName || agent.id || 'selected agent'
}

function money(value) {
  const n = Number(value || 0)
  if (!n) return '$0.000000'
  return `$${n.toFixed(6)}`
}

function toneColor(tone) {
  if (tone === 'ok') return 'var(--green, #10b981)'
  if (tone === 'warn') return 'var(--amber, #f59e0b)'
  return 'var(--accent, #3b82f6)'
}

function pillStyle(tone) {
  const color = toneColor(tone)
  return {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    padding: '4px 9px',
    fontSize: 11,
    fontWeight: 800,
    color,
    background: `color-mix(in srgb, ${color} 13%, transparent)`,
    border: `1px solid color-mix(in srgb, ${color} 34%, transparent)`,
    whiteSpace: 'nowrap',
  }
}

function buttonStyle(kind) {
  const base = {
    minHeight: 38,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: 8,
    padding: '8px 12px',
    fontSize: 13,
    fontWeight: 750,
    cursor: 'pointer',
    border: '1px solid var(--border)',
  }
  if (kind === 'primary') return { ...base, background: 'var(--accent)', color: 'var(--accent-text)' }
  return { ...base, background: 'var(--surface2)', color: 'var(--text)' }
}

function noticeStyle(tone) {
  const color = toneColor(tone)
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '10px 12px',
    borderRadius: 8,
    background: `color-mix(in srgb, ${color} 12%, var(--surface))`,
    border: `1px solid color-mix(in srgb, ${color} 38%, var(--border))`,
    color: 'var(--text)',
    fontSize: 13,
    marginBottom: 14,
  }
}

const loadingStyle = { padding: 24, color: 'var(--text-muted)' }
const workspaceStyle = { color: 'var(--text)', display: 'grid', gap: 16, minWidth: 0 }
const heroReadinessStyle = { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 8 }
const heroActionsStyle = { display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, flexWrap: 'wrap' }
const refreshStatusStyle = { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', minHeight: 34, margin: 0, padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text-muted)', fontSize: 12, fontWeight: 750 }
const snapshotStyle = { display: 'grid', gap: 10 }
const summaryGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }
const instrumentationBarStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }
const benchGridStyle = { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 16, alignItems: 'start' }
const resultsGridStyle = { display: 'grid', gridTemplateColumns: 'minmax(min(100%, 420px), 1fr) minmax(min(100%, 280px), 360px)', gap: 16, alignItems: 'start' }
const runtimeGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }
const panelStyle = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 18, minWidth: 0, boxShadow: '0 10px 28px rgba(0,0,0,0.10)' }
const metricCardStyle = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 14, minHeight: 122 }
const sectionTitleStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 14 }
const presetGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, marginBottom: 14 }
const decisionControlsStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginTop: 12 }
const agentPickerStyle = { display: 'grid', gap: 10, border: '1px solid var(--border)', borderRadius: 8, padding: 12, background: 'var(--surface2)', marginBottom: 14 }
const agentPickerGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 210px), 1fr))', gap: 10, alignItems: 'stretch', minWidth: 0 }
const selectedAgentSummaryStyle = { minHeight: 42, border: '1px solid var(--border)', borderRadius: 8, background: 'var(--surface)', padding: '8px 10px', minWidth: 0, overflow: 'hidden' }
const agentChipRailStyle = { display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }
const selectionToolbarStyle = { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }
const selectedRoutesStyle = { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minHeight: 44, border: '1px dashed var(--border)', borderRadius: 8, padding: 10, background: 'var(--surface2)', marginBottom: 12 }
const priorityRailStyle = { border: '1px solid var(--border)', borderRadius: 8, padding: 10, background: 'var(--surface2)', marginBottom: 12 }
const priorityModelGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8, marginTop: 8 }
const priorityModelNameStyle = { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
const selectionSummaryStyle = { display: 'inline-flex', alignItems: 'center', borderRadius: 999, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text-muted)', padding: '6px 10px', fontSize: 12, fontWeight: 800 }
const selectedChipStyle = { display: 'inline-flex', alignItems: 'center', maxWidth: '100%', borderRadius: 999, border: '1px solid color-mix(in srgb, var(--accent) 35%, transparent)', background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--text)', padding: '6px 10px', fontSize: 12, fontWeight: 800, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
const selectionHelpStyle = { fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.45, margin: '-4px 0 12px' }
const presetCategoryStyle = { display: 'block', color: 'var(--text-muted)', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', marginBottom: 3 }
const labelStyle = { display: 'block', fontSize: 12, fontWeight: 800, color: 'var(--text)', marginBottom: 6 }
const inputStyle = { width: '100%', minHeight: 42, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', padding: '10px 12px', fontSize: 13, fontFamily: 'inherit', lineHeight: 1.45 }
const benchActionRowStyle = { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 14 }
const searchWrapStyle = { minHeight: 42, display: 'flex', alignItems: 'center', gap: 8, border: '1px solid var(--border)', borderRadius: 8, padding: '0 10px', background: 'var(--surface2)', marginBottom: 12, color: 'var(--text-muted)' }
const searchInputStyle = { flex: 1, minWidth: 0, border: 0, outline: 'none', background: 'transparent', color: 'var(--text)', fontSize: 13 }
const modelListStyle = { display: 'grid', gap: 8, maxHeight: 640, overflow: 'auto', paddingRight: 4 }
const modelBadgesStyle = { display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center', gap: 6 }
const providerGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 10, marginBottom: 16 }
const connectorGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 10, marginTop: 14 }
const providerHeaderStyle = { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start' }
const catalogTableStyle = { display: 'grid', gap: 8 }
const decisionStripStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }
const decisionCardStyle = { display: 'flex', gap: 10, alignItems: 'center', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }
const promotionBoxStyle = { display: 'grid', gap: 12, border: '1px solid var(--border)', background: 'var(--surface2)', borderRadius: 8, padding: 12 }
const promotionFormStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }
const promotionActionStyle = { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }
const resultHeaderStyle = { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'start', marginBottom: 12 }
const resultMetricsStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(80px, 1fr))', gap: 8, marginBottom: 12 }
const miniMetricStyle = { background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: 10, minWidth: 0 }
const bodyTextStyle = { fontSize: 13.5, color: 'var(--text)', lineHeight: 1.55, margin: '0 0 12px' }
const rowTitleStyle = { fontSize: 14, fontWeight: 800, color: 'var(--text)' }
const modelTitleStyle = { ...rowTitleStyle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
const mutedStyle = { fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.45 }
const monoMutedStyle = { ...mutedStyle, fontFamily: 'monospace', overflowWrap: 'anywhere' }
const modelMetaStyle = { ...mutedStyle, marginTop: 4 }
const sectionLabelStyle = { fontSize: 11, fontWeight: 850, textTransform: 'uppercase', color: 'var(--text-muted)', margin: '0 0 3px' }
const emptyStyle = { display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', border: '1px dashed var(--border)', borderRadius: 8, color: 'var(--text-muted)', fontSize: 13, padding: 18 }
const resultTextStyle = { whiteSpace: 'pre-wrap', margin: 0, padding: 12, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 13, lineHeight: 1.55, fontFamily: 'inherit', maxHeight: 360, overflow: 'auto' }

function statusDotStyle(color) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 7,
    minHeight: 30,
    maxWidth: '100%',
    borderRadius: 999,
    border: `1px solid color-mix(in srgb, ${color} 30%, var(--border))`,
    background: `color-mix(in srgb, ${color} 9%, var(--surface))`,
    color: 'var(--text)',
    padding: '5px 10px',
    fontSize: 12,
    fontWeight: 800,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  }
}

function statusDotBulletStyle(color) {
  return {
    width: 8,
    height: 8,
    borderRadius: 999,
    flex: '0 0 auto',
    background: color,
    boxShadow: `0 0 0 3px color-mix(in srgb, ${color} 18%, transparent)`,
  }
}

function presetButtonStyle(active) {
  return {
    textAlign: 'left',
    borderRadius: 8,
    border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
    background: active ? 'color-mix(in srgb, var(--accent) 12%, var(--surface2))' : 'var(--surface2)',
    color: 'var(--text)',
    padding: 11,
    cursor: 'pointer',
    minHeight: 74,
  }
}

function modelPickStyle(active, configured) {
  return {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    gap: 12,
    alignItems: 'start',
    textAlign: 'left',
    borderRadius: 8,
    border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
    background: active ? 'color-mix(in srgb, var(--accent) 10%, var(--surface2))' : 'var(--surface2)',
    color: configured ? 'var(--text)' : 'var(--text-muted)',
    padding: 12,
    cursor: configured ? 'pointer' : 'not-allowed',
    opacity: configured ? 1 : 0.66,
  }
}

function priorityModelStyle(active, configured) {
  return {
    minHeight: 42,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    borderRadius: 8,
    border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
    background: active ? 'color-mix(in srgb, var(--accent) 12%, var(--surface))' : 'var(--surface)',
    color: configured ? 'var(--text)' : 'var(--text-muted)',
    padding: '8px 10px',
    fontSize: 12,
    fontWeight: 850,
    cursor: configured ? 'pointer' : 'not-allowed',
    opacity: configured ? 1 : 0.66,
  }
}

function providerCardStyle(configured) {
  return {
    borderRadius: 8,
    border: configured ? '1px solid color-mix(in srgb, var(--green, #10b981) 38%, var(--border))' : '1px solid var(--border)',
    background: 'var(--surface2)',
    padding: 12,
  }
}

function connectorCardStyle(status) {
  const ready = status === 'ready' || status === 'guarded'
  const color = ready ? 'var(--green, #10b981)' : status === 'planned' ? 'var(--amber, #f59e0b)' : 'var(--accent)'
  return {
    borderRadius: 8,
    border: `1px solid color-mix(in srgb, ${color} 34%, var(--border))`,
    background: 'var(--surface2)',
    padding: 12,
    minHeight: 116,
  }
}

const catalogRowStyle = {
  display: 'grid',
  gridTemplateColumns: 'minmax(min(100%, 240px), 1fr) auto auto minmax(min(100%, 220px), 0.7fr)',
  gap: 10,
  alignItems: 'center',
  padding: 12,
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: 'var(--surface2)',
}

function agentChipStyle(active) {
  return {
    flex: '0 0 auto',
    minHeight: 30,
    maxWidth: 180,
    borderRadius: 999,
    border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
    background: active ? 'color-mix(in srgb, var(--accent) 13%, var(--surface))' : 'var(--surface)',
    color: active ? 'var(--accent)' : 'var(--text-muted)',
    padding: '5px 9px',
    fontSize: 11.5,
    fontWeight: 850,
    cursor: 'pointer',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  }
}

function resultCardStyle(ok) {
  return {
    borderRadius: 8,
    border: ok ? '1px solid var(--border)' : '1px solid color-mix(in srgb, var(--amber, #f59e0b) 40%, var(--border))',
    background: 'var(--surface)',
    padding: 14,
  }
}

function guidanceStyle(tone) {
  const color = toneColor(tone)
  return {
    borderRadius: 8,
    border: `1px solid color-mix(in srgb, ${color} 34%, var(--border))`,
    background: `color-mix(in srgb, ${color} 9%, var(--surface2))`,
    color: 'var(--text)',
    padding: 12,
  }
}
