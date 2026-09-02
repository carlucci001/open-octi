'use client'
import ThemedSelect from '../components/ThemedSelect'
import { useState, useEffect, useMemo } from 'react'

function api(url, body) { return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()) }

const inp = { background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', width: '100%', padding: '8px 12px', borderRadius: 8, fontSize: 13, outline: 'none', fontFamily: 'inherit' }

export default function QualifyWizard({ lead, pipelines, onComplete, onClose }) {
  const [step, setStep] = useState(1) // 1 = dedupe, 2 = pipeline+stage, 3 = finalize
  const [matches, setMatches] = useState([])
  const [existingContact, setExistingContact] = useState(null)
  const [chosenAccountId, setChosenAccountId] = useState(null) // null = create new
  const [pipelineId, setPipelineId] = useState(lead.suggestedPipelineId || pipelines.find(p => p.id === 'farrington_dev')?.id || pipelines[0]?.id || '')
  const [stageId, setStageId] = useState('')
  const [value, setValue] = useState('')
  const [expectedClose, setExpectedClose] = useState('')
  const [leadRequirementsPrompt, setLeadRequirementsPrompt] = useState('')
  const [dailyLeadTarget, setDailyLeadTarget] = useState('')
  const [leadGenGeography, setLeadGenGeography] = useState('')
  const [leadGenIndustries, setLeadGenIndustries] = useState('')
  const [leadGenProvider, setLeadGenProvider] = useState('auto')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Run dedupe check when opened
  useEffect(() => {
    setLoading(true)
    api('/api/leads', { action: 'dedupe_check', businessName: lead.businessName, email: lead.email })
      .then(r => {
        setMatches(r.matches || [])
        setExistingContact(r.existingContact || null)
        setLoading(false)
      })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [lead.businessName, lead.email])

  const pipeline = useMemo(() => pipelines.find(p => p.id === pipelineId), [pipelines, pipelineId])

  useEffect(() => {
    if (pipeline && !pipeline.stages.some(s => s.id === stageId)) {
      setStageId(pipeline.stages[0]?.id || '')
    }
  }, [pipeline, stageId])

  const finalize = async () => {
    setLoading(true); setError(null)
    const r = await api('/api/leads', {
      action: 'qualify',
      leadId: lead.id,
      accountId: chosenAccountId || undefined,
      pipelineId,
      stageId,
      value: Number(value) || 0,
      expectedClose: expectedClose || null,
      opportunityName: `${lead.businessName || lead.name} — ${pipeline?.name || pipelineId}`,
      probability: pipeline?.stages.find(s => s.id === stageId)?.probability || 0,
      leadRequirementsPrompt,
      leadGeneration: {
        enabled: Boolean(leadRequirementsPrompt.trim() || dailyLeadTarget || leadGenGeography || leadGenIndustries),
        dailyLeadTarget: Number(dailyLeadTarget) || 0,
        geography: leadGenGeography,
        industries: leadGenIndustries,
        sourceTypes: '',
        providerPreference: leadGenProvider,
      },
    })
    if (r.error) { setLoading(false); setError(r.error); return }
    if (r.opportunity?.id && (leadRequirementsPrompt.trim() || dailyLeadTarget || leadGenGeography || leadGenIndustries)) {
      await api('/api/opportunities/requirements', {
        opportunityId: r.opportunity.id,
        instructions: leadRequirementsPrompt || lead.notes || '',
      })
    }
    setLoading(false)
    onComplete?.(r)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)' }} onClick={onClose}>
      <div className="w-full max-w-2xl rounded-xl p-6 animate-fade-in max-h-[90vh] overflow-auto" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 mb-1">
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>Convert Lead</h2>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>· Step {step} of 3</span>
        </div>
        <p className="text-sm mb-4" style={{ color: 'var(--text-muted)' }}>
          Converting <strong style={{ color: 'var(--text)' }}>{lead.name || '(no name)'}</strong> at <strong style={{ color: 'var(--text)' }}>{lead.businessName || '(no company)'}</strong> into a Prospect + Contact + Opportunity. Promote the prospect from the sales pipeline when it becomes a real client account.
        </p>

        {error && <div className="mb-3 px-3 py-2 rounded-lg text-xs" style={{ background: 'var(--red-soft)', color: 'var(--red)', border: '1px solid var(--red)' }}>⚠ {error}</div>}

        {/* Step 1: dedupe */}
        {step === 1 && (
          <div>
            <div className="text-sm font-semibold mb-2" style={{ color: 'var(--text)' }}>Dedupe check</div>
            {loading ? (
              <div className="text-sm py-4" style={{ color: 'var(--text-muted)' }}>Searching for existing accounts…</div>
            ) : matches.length === 0 ? (
              <div className="rounded-lg p-4" style={{ background: 'var(--green-soft)', color: 'var(--green)', border: '1px solid var(--green)' }}>
                No matching accounts found. A new prospect record will be created for <strong>{lead.businessName || lead.name}</strong>.
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs" style={{ color: 'var(--amber)' }}>⚠ Found {matches.length} possible match{matches.length !== 1 ? 'es' : ''}. Link to an existing account to avoid duplicates.</p>
                {matches.map(m => (
                  <button key={m.account.id} onClick={() => setChosenAccountId(m.account.id)} className="w-full text-left rounded-lg p-3 transition-all"
                    style={{ background: chosenAccountId === m.account.id ? 'var(--accent-soft)' : 'var(--surface2)', border: `1px solid ${chosenAccountId === m.account.id ? 'var(--accent)' : 'var(--border)'}` }}>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>{m.account.name}</div>
                        <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{m.reason} · {m.account.type}</div>
                      </div>
                      {chosenAccountId === m.account.id && <span className="text-xs font-semibold" style={{ color: 'var(--accent)' }}>✓ Linked</span>}
                    </div>
                  </button>
                ))}
                <button onClick={() => setChosenAccountId(null)} className="w-full text-left rounded-lg p-3 transition-all"
                  style={{ background: chosenAccountId === null ? 'var(--accent-soft)' : 'var(--surface2)', border: `1px solid ${chosenAccountId === null ? 'var(--accent)' : 'var(--border)'}` }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Create a new prospect</div>
                      <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Skip dedupe - a brand-new prospect record will be created.</div>
                    </div>
                    {chosenAccountId === null && <span className="text-xs font-semibold" style={{ color: 'var(--accent)' }}>✓ Selected</span>}
                  </div>
                </button>
              </div>
            )}
            {existingContact && (
              <div className="mt-3 rounded-lg p-3 text-xs" style={{ background: 'var(--surface2)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                Existing contact found: <strong style={{ color: 'var(--text)' }}>{existingContact.name}</strong> ({existingContact.email}) — will be reused instead of creating a duplicate.
              </div>
            )}
            <div className="flex gap-2 mt-5">
              <button onClick={() => setStep(2)} disabled={loading} className="flex-1 py-2 rounded-lg text-sm font-medium disabled:opacity-50" style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}>Continue →</button>
              <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm" style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>Cancel</button>
            </div>
          </div>
        )}

        {/* Step 2: sales pipeline/stage */}
        {step === 2 && (
          <div>
            <div className="text-sm font-semibold mb-2" style={{ color: 'var(--text)' }}>Choose sales pipeline & stage</div>
            <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>Where does this deal belong?</p>
            <div className="mb-3">
              <label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-muted)' }}>Sales Pipeline</label>
              <ThemedSelect style={inp} value={pipelineId} onChange={e => setPipelineId(e.target.value)}>
                {pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </ThemedSelect>
            </div>
            <div className="mb-3">
              <label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-muted)' }}>Starting stage</label>
              <div className="flex flex-wrap gap-1.5">
                {pipeline?.stages.filter(s => !s.terminal).map(s => (
                  <button key={s.id} onClick={() => setStageId(s.id)} className="px-3 py-1.5 rounded-full text-[11px] font-medium"
                    style={{
                      background: stageId === s.id ? s.color : 'var(--surface2)',
                      color: stageId === s.id ? 'var(--accent-text)' : s.color,
                      border: `1px solid ${stageId === s.id ? s.color : 'var(--border)'}`,
                    }}>
                    {s.label} {stageId === s.id && `(${s.probability}%)`}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setStep(1)} className="px-4 py-2 rounded-lg text-sm" style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>← Back</button>
              <button onClick={() => setStep(3)} disabled={!pipelineId || !stageId} className="flex-1 py-2 rounded-lg text-sm font-medium disabled:opacity-50" style={{ background: 'var(--accent)', color: 'var(--accent-text)' }}>Continue →</button>
            </div>
          </div>
        )}

        {/* Step 3: finalize */}
        {step === 3 && (
          <div>
            <div className="text-sm font-semibold mb-2" style={{ color: 'var(--text)' }}>Opportunity details (optional)</div>
            <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>Fill in what you know. You can edit later from the sales pipeline view.</p>
            <div className="mb-3">
              <label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-muted)' }}>Estimated value ($)</label>
              <input type="number" style={inp} value={value} onChange={e => setValue(e.target.value)} placeholder="0" />
            </div>
            <div className="mb-3">
              <label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-muted)' }}>Expected close date</label>
              <input type="date" style={inp} value={expectedClose} onChange={e => setExpectedClose(e.target.value)} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="mb-3">
                <label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-muted)' }}>Leads per day</label>
                <input type="number" min="0" style={inp} value={dailyLeadTarget} onChange={e => setDailyLeadTarget(e.target.value)} placeholder="0" />
              </div>
              <div className="mb-3">
                <label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-muted)' }}>Provider</label>
                <ThemedSelect style={inp} value={leadGenProvider} onChange={e => setLeadGenProvider(e.target.value)}>
                  <option value="auto">Auto</option>
                  <option value="apify">Apify</option>
                  <option value="perplexity">Perplexity</option>
                  <option value="google">Google</option>
                  <option value="manual">Manual</option>
                </ThemedSelect>
              </div>
              <div className="mb-3">
                <label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-muted)' }}>Geography</label>
                <input style={inp} value={leadGenGeography} onChange={e => setLeadGenGeography(e.target.value)} placeholder="Asheville, NC" />
              </div>
            </div>
            <div className="mb-3">
              <label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-muted)' }}>Industries / lead types</label>
              <input style={inp} value={leadGenIndustries} onChange={e => setLeadGenIndustries(e.target.value)} placeholder="restaurants, hotels, chambers, tourism offices" />
            </div>
            <div className="mb-3">
              <label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-muted)' }}>Natural language requirements</label>
              <textarea style={{ ...inp, minHeight: 72, resize: 'vertical' }} value={leadRequirementsPrompt} onChange={e => setLeadRequirementsPrompt(e.target.value)} placeholder="Find qualified prospects matching this opportunity, summarize fit, collect decision-maker clues, and suggest the next outreach." />
            </div>
            <div className="rounded-lg p-3 mb-4 text-xs" style={{ background: 'var(--accent-soft)', color: 'var(--accent)', border: '1px solid var(--accent)' }}>
              <div className="font-semibold mb-1">Ready to convert:</div>
              <div>Prospect: {chosenAccountId ? `Linking to existing (${matches.find(m => m.account.id === chosenAccountId)?.account.name})` : `New - "${lead.businessName || lead.name}"`}</div>
              <div>Sales Pipeline: {pipeline?.name}</div>
              <div>Stage: {pipeline?.stages.find(s => s.id === stageId)?.label}</div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setStep(2)} className="px-4 py-2 rounded-lg text-sm" style={{ background: 'var(--surface2)', color: 'var(--text-muted)' }}>← Back</button>
              <button onClick={finalize} disabled={loading} className="flex-1 py-2 rounded-lg text-sm font-medium disabled:opacity-50" style={{ background: 'var(--green)', color: 'var(--accent-text)' }}>
                {loading ? 'Converting...' : 'Create Prospect + Opportunity'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
