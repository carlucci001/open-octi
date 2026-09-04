'use client'
// Call scripts for the Leads screen.
//
// The scripts themselves have lived in /api/scripts (kv_store scripts.json,
// seeded from lib/sponsor-scripts.js) all along — but only the Sponsors screen
// ever fetched them. Carl works leads in LeadsManager now, so this component
// brings the same scripts, the picker, editing, and outcome logging to a lead.
// It talks to the exact same API the Sponsors screen uses: edits made here
// show up there and vice versa. SponsorCRM is untouched.
import { useState, useEffect, useCallback } from 'react'
import ThemedSelect from './ThemedSelect'

const CAMPAIGNS = [
  { id: 'farrington_dev', label: 'Farrington Dev' },
  { id: 'sponsors', label: 'Sponsors' },
  { id: 'newspapers', label: 'Newspapers' },
  { id: 'tda_outreach', label: 'TDA Outreach' },
  { id: 'campaigns', label: 'Political Campaigns' },
]

// Which script set a lead's brand most likely wants on the phone.
const BRAND_DEFAULT_CAMPAIGN = {
  farrington_dev: 'farrington_dev',
  ContentStudio: 'newspapers',
  sample_business: 'sponsors',
}

const OUTCOMES = [
  { v: 'no_answer', l: 'No answer' },
  { v: 'voicemail', l: 'Left voicemail' },
  { v: 'gatekeeper', l: 'Gatekeeper' },
  { v: 'pitched', l: 'Pitched' },
  { v: 'interested', l: 'Interested' },
  { v: 'wants_demo', l: 'Wants demo' },
  { v: 'not_interested', l: 'Not interested' },
  { v: 'closed', l: 'Closed' },
]
// Outcomes that mean a human conversation happened → lead becomes "contacted".
const CONTACT_OUTCOMES = ['gatekeeper', 'pitched', 'interested', 'wants_demo', 'not_interested', 'closed']

const inp = { background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', width: '100%', padding: '8px 10px', borderRadius: 8, fontSize: 13, outline: 'none' }

export default function LeadCallScripts({ lead, onClose, onContacted, onEmail }) {
  const [scripts, setScripts] = useState(null) // null = loading
  const [campaign, setCampaign] = useState(() => lead.signal?.trigger === 'campaign' || lead.tags?.includes('signal:campaign') ? 'campaigns' : BRAND_DEFAULT_CAMPAIGN[lead.brandContext] || 'farrington_dev')
  const [activeId, setActiveId] = useState('')
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(null)
  const [outcome, setOutcome] = useState('pitched')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/scripts')
      const data = await res.json()
      setScripts(Array.isArray(data) ? data : [])
    } catch {
      setScripts([])
    }
  }, [])
  useEffect(() => { load() }, [load])

  const campaignScripts = (scripts || []).filter(s => s.campaign === campaign && s.active !== false)
  const active = campaignScripts.find(s => s.id === activeId) || campaignScripts[0] || null
  useEffect(() => {
    if (!scripts) return
    if (!active && campaignScripts[0]) setActiveId(campaignScripts[0].id)
    else if (active && active.id !== activeId) setActiveId(active.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scripts, campaign])

  const api = async (payload) => {
    const res = await fetch('/api/scripts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    const data = await res.json().catch(() => ({}))
    if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`)
    return data
  }

  const startEdit = () => {
    if (!active) return
    setDraft(JSON.parse(JSON.stringify(active)))
    setEditing(true)
    setStatus('')
  }

  const saveDraft = async () => {
    if (!draft) return
    setBusy(true)
    setStatus('')
    try {
      await api({ action: 'save', script: draft })
      await load()
      setEditing(false)
      setStatus('Script saved.')
    } catch (e) {
      setStatus(e.message || 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  const createScript = async () => {
    setBusy(true)
    setStatus('')
    try {
      const data = await api({ action: 'create', campaign })
      await load()
      if (data.script?.id) { setActiveId(data.script.id); setDraft(JSON.parse(JSON.stringify(data.script))); setEditing(true) }
    } catch (e) {
      setStatus(e.message || 'Create failed')
    } finally {
      setBusy(false)
    }
  }

  const deleteScript = async () => {
    if (!active) return
    if (!confirm(`Delete script "${active.name}"? This removes it for the Sponsors screen too.`)) return
    setBusy(true)
    try {
      await api({ action: 'delete', id: active.id })
      setActiveId('')
      await load()
      setEditing(false)
    } catch (e) {
      setStatus(e.message || 'Delete failed')
    } finally {
      setBusy(false)
    }
  }

  // Log the call: bump the script's stats (same math as SponsorCRM), write an
  // activity on the lead, flip the lead to contacted for real conversations.
  const logCall = async () => {
    if (!active) return
    setBusy(true)
    setStatus('')
    try {
      const stats = active.stats || { calls: 0, interested: 0, closed: 0 }
      await api({
        action: 'save',
        script: {
          ...active,
          stats: {
            calls: (stats.calls || 0) + 1,
            interested: (stats.interested || 0) + (['interested', 'wants_demo'].includes(outcome) ? 1 : 0),
            closed: (stats.closed || 0) + (['closed', 'signed_up'].includes(outcome) ? 1 : 0),
          },
        },
      })
      fetch('/api/activities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add',
          activity: {
            type: 'call',
            subject: `Call logged: ${OUTCOMES.find(o => o.v === outcome)?.l || outcome} (script ${active.tag}: ${active.name})`,
            body: note || '',
            linkedTo: { leadId: lead.id },
          },
        }),
      }).catch(() => {})
      if (CONTACT_OUTCOMES.includes(outcome)) onContacted?.()
      await load()
      setNote('')
      setStatus('Call logged.')
    } catch (e) {
      setStatus(e.message || 'Log failed')
    } finally {
      setBusy(false)
    }
  }

  // ---- draft editing helpers (edit mode) ----
  const ud = (k, v) => setDraft(p => ({ ...p, [k]: v }))
  const udSection = (i, k, v) => setDraft(p => ({ ...p, sections: p.sections.map((s, idx) => idx === i ? { ...s, [k]: v } : s) }))
  const addSection = () => setDraft(p => ({ ...p, sections: [...(p.sections || []), { heading: 'New section', lines: [''] }] }))
  const removeSection = (i) => setDraft(p => ({ ...p, sections: p.sections.filter((_, idx) => idx !== i) }))
  const udObjection = (i, k, v) => setDraft(p => ({ ...p, objections: p.objections.map((o, idx) => idx === i ? { ...o, [k]: v } : o) }))
  const addObjection = () => setDraft(p => ({ ...p, objections: [...(p.objections || []), { obj: '', response: '' }] }))
  const removeObjection = (i) => setDraft(p => ({ ...p, objections: p.objections.filter((_, idx) => idx !== i) }))

  const smallBtn = (extra = {}) => ({ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 12px', fontSize: 12, cursor: 'pointer', ...extra })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div className="relative w-full max-w-3xl rounded-xl p-6 animate-fade-in max-h-[88vh] overflow-auto" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
        <button type="button" aria-label="Close" onClick={onClose} className="absolute top-3 right-3 w-9 h-9 rounded-lg text-lg font-bold" style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }}>X</button>
        <h2 className="text-lg font-semibold mb-1 pr-10" style={{ color: 'var(--text)' }}>
          {editing ? `Edit script: ${draft?.name || ''}` : `Call scripts — ${lead.businessName || lead.name || 'lead'}`}
        </h2>
        {!editing && lead.phone && <div className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>{lead.name ? `${lead.name} · ` : ''}{lead.phone}</div>}

        {scripts === null ? (
          <div className="text-sm py-8 text-center" style={{ color: 'var(--text-muted)' }}>Loading scripts...</div>
        ) : editing && draft ? (
          <div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-1">
              <div><label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-muted)' }}>Script name</label><input style={inp} value={draft.name} onChange={e => ud('name', e.target.value)} /></div>
              <div><label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text-muted)' }}>Campaign</label>
                <ThemedSelect style={inp} value={draft.campaign} onChange={e => ud('campaign', e.target.value)}>
                  {CAMPAIGNS.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </ThemedSelect>
              </div>
            </div>
            <label className="block text-xs mb-1 mt-2 font-medium" style={{ color: 'var(--text-muted)' }}>Description / when to use</label>
            <textarea style={{ ...inp, minHeight: 56, resize: 'vertical' }} value={draft.description || ''} onChange={e => ud('description', e.target.value)} />

            <div className="text-xs font-semibold uppercase tracking-wider mt-4 mb-2" style={{ color: 'var(--accent)' }}>Script sections</div>
            {(draft.sections || []).map((s, i) => (
              <div key={i} className="rounded-lg p-3 mb-2" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                <div className="flex gap-2 items-center mb-2">
                  <input style={{ ...inp, background: 'var(--surface)' }} value={s.heading} onChange={e => udSection(i, 'heading', e.target.value)} placeholder="Section heading" />
                  <button type="button" style={smallBtn({ color: 'var(--red)' })} onClick={() => removeSection(i)}>Remove</button>
                </div>
                <textarea style={{ ...inp, background: 'var(--surface)', minHeight: 90, resize: 'vertical' }} value={(s.lines || []).join('\n')}
                  onChange={e => udSection(i, 'lines', e.target.value.split('\n'))} placeholder="One talking line per row" />
              </div>
            ))}
            <button type="button" style={smallBtn()} onClick={addSection}>+ Add section</button>

            <div className="text-xs font-semibold uppercase tracking-wider mt-4 mb-2" style={{ color: 'var(--amber)' }}>Objection handling</div>
            {(draft.objections || []).map((o, i) => (
              <div key={i} className="rounded-lg p-3 mb-2" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                <div className="flex gap-2 items-center mb-2">
                  <input style={{ ...inp, background: 'var(--surface)' }} value={o.obj || ''} onChange={e => udObjection(i, 'obj', e.target.value)} placeholder='They say: "..."' />
                  <button type="button" style={smallBtn({ color: 'var(--red)' })} onClick={() => removeObjection(i)}>Remove</button>
                </div>
                <textarea style={{ ...inp, background: 'var(--surface)', minHeight: 60, resize: 'vertical' }} value={o.response || ''} onChange={e => udObjection(i, 'response', e.target.value)} placeholder="You answer..." />
              </div>
            ))}
            <button type="button" style={smallBtn()} onClick={addObjection}>+ Add objection</button>

            {status && <div className="text-xs mt-3" style={{ color: status.includes('saved') ? 'var(--green)' : 'var(--red)' }}>{status}</div>}
            <div className="flex gap-2 justify-end flex-wrap mt-4">
              <button type="button" className="px-4 rounded-lg text-sm" style={{ background: 'var(--surface2)', color: 'var(--text-muted)', minHeight: 44 }} onClick={() => setEditing(false)} disabled={busy}>Cancel</button>
              <button type="button" className="px-5 rounded-lg text-sm font-semibold" style={{ background: 'var(--accent)', color: 'var(--accent-text)', minHeight: 44 }} onClick={saveDraft} disabled={busy}>{busy ? 'Saving...' : 'Save script'}</button>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex gap-2 items-center flex-wrap mb-3">
              <ThemedSelect style={{ ...inp, width: 'auto', minWidth: 160 }} value={campaign} onChange={e => { setCampaign(e.target.value); setActiveId('') }}>
                {CAMPAIGNS.map(c => <option key={c.id} value={c.id}>{c.label} scripts</option>)}
              </ThemedSelect>
              <div className="flex gap-1.5 flex-wrap">
                {campaignScripts.map(s => (
                  <button key={s.id} type="button" onClick={() => setActiveId(s.id)} className="px-3 py-2 rounded-lg text-xs font-semibold"
                    style={active?.id === s.id
                      ? { background: 'var(--accent)', color: 'var(--accent-text)', border: '1px solid var(--accent)' }
                      : { background: 'var(--surface2)', color: 'var(--accent)', border: '1px solid var(--border)' }}>
                    {s.tag}: {s.name}
                  </button>
                ))}
              </div>
            </div>

            {!active ? (
              <div className="text-sm py-6 text-center" style={{ color: 'var(--text-muted)' }}>No active scripts in this set yet — create one below.</div>
            ) : (
              <div className="rounded-lg p-4 mb-3" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
                {active.description && <div className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>{active.description}</div>}
                {(active.sections || []).map((s, i) => (
                  <div key={i} className="mb-3">
                    <div className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--accent)' }}>{s.heading}</div>
                    {(s.lines || []).map((line, j) => line.trim() && (
                      <div key={j} className="text-sm mb-1.5 leading-relaxed" style={{ color: 'var(--text)' }}>{line}</div>
                    ))}
                  </div>
                ))}
                {(active.objections || []).length > 0 && (
                  <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
                    <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--amber)' }}>If they push back</div>
                    {(active.objections || []).map((o, i) => (
                      <div key={i} className="mb-2">
                        <div className="text-xs font-semibold" style={{ color: 'var(--text)' }}>&ldquo;{o.obj}&rdquo;</div>
                        <div className="text-sm" style={{ color: 'var(--text-muted)' }}>{o.response}</div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="text-[11px] mt-2" style={{ color: 'var(--text-muted)' }}>
                  Stats: {active.stats?.calls || 0} calls · {active.stats?.interested || 0} interested · {active.stats?.closed || 0} closed
                </div>
              </div>
            )}

            <div className="rounded-lg p-3 mb-3" style={{ background: 'var(--surface2)', border: '1px solid var(--border)' }}>
              <div className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--green)' }}>Off the phone? Log it</div>
              <div className="flex gap-1.5 flex-wrap">
                <ThemedSelect style={{ ...inp, width: 'auto', minWidth: 140, background: 'var(--surface)' }} value={outcome} onChange={e => setOutcome(e.target.value)}>
                  {OUTCOMES.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                </ThemedSelect>
                <input style={{ ...inp, flex: 1, minWidth: 160, background: 'var(--surface)' }} value={note} onChange={e => setNote(e.target.value)} placeholder="Quick note..." onKeyDown={e => { if (e.key === 'Enter') logCall() }} />
                <button type="button" className="px-4 rounded-lg text-sm font-semibold" style={{ background: 'var(--green)', color: 'var(--accent-text)', minHeight: 40 }} onClick={logCall} disabled={busy || !active}>Log call</button>
                {lead.email && onEmail && (
                  <button type="button" className="px-4 rounded-lg text-sm font-semibold" style={{ background: 'var(--accent)', color: 'var(--accent-text)', minHeight: 40 }} onClick={() => onEmail(lead)} title={`Send follow-up to ${lead.email}`}>Send follow-up email</button>
                )}
              </div>
            </div>

            {status && <div className="text-xs mb-3" style={{ color: status.includes('logged') || status.includes('saved') ? 'var(--green)' : 'var(--red)' }}>{status}</div>}
            <div className="flex gap-2 justify-end flex-wrap">
              <button type="button" className="px-4 rounded-lg text-sm" style={{ background: 'var(--surface2)', color: 'var(--red)', border: '1px solid var(--border)', minHeight: 44 }} onClick={deleteScript} disabled={busy || !active}>Delete script</button>
              <button type="button" className="px-4 rounded-lg text-sm" style={{ background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)', minHeight: 44 }} onClick={createScript} disabled={busy}>New script</button>
              <button type="button" className="px-5 rounded-lg text-sm font-semibold" style={{ background: 'var(--accent)', color: 'var(--accent-text)', minHeight: 44 }} onClick={startEdit} disabled={busy || !active}>Edit script</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
