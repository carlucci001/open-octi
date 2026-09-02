'use client'
import ThemedSelect from '../components/ThemedSelect'
import { Plus, Trash2, ArrowUp, ArrowDown, HelpCircle, Zap } from 'lucide-react'

// Interview-node editor: gates run in Phase 1. Action nodes describe work but
// remain honest deferred records until Phase 2 wires their real executors.

const field = { background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 10px', borderRadius: 8, fontSize: 13, outline: 'none', width: '100%' }
const muted = { fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }
const chipBtn = { background: 'var(--surface2)', color: 'var(--accent)', border: '1px solid var(--border)', borderRadius: 8, minHeight: 36, padding: '0 10px', fontWeight: 600, cursor: 'pointer', fontSize: 12 }

export const FLOW_CAPABILITIES = [
  { id: 'gate', label: 'Gate', description: 'Asks the operator a question, captures an answer when needed, and follows the selected branch.', available: true },
  { id: 'agent', label: 'Agent action', description: 'Records which agent would receive the instruction. Real agent invocation starts in Phase 2.', available: false },
  { id: 'tasks', label: 'Task action', description: 'Records the task request. It does not create CRM tasks in Phase 1.', available: false },
  { id: 'document', label: 'Document action', description: 'Records the requested draft and footer note. It does not create a document in Phase 1.', available: false },
  { id: 'api_call', label: 'API call', description: 'Adds a “would call” transcript stub. No HTTP request is sent in Phase 1.', available: false },
  { id: 'mcp_call', label: 'MCP call', description: 'Adds a “would call” transcript stub. No MCP tool is invoked in Phase 1.', available: false },
]

export const ACTION_KINDS = [
  { id: 'agent', label: 'Agent action (Phase 2)' },
  { id: 'tasks', label: 'Task action (Phase 2)' },
  { id: 'document', label: 'Document action (Phase 2)' },
  { id: 'api_call', label: 'API call stub' },
  { id: 'mcp_call', label: 'MCP call stub' },
]

let stepSeq = 0
const newStepId = () => `step_${Date.now().toString(36)}_${++stepSeq}`

export function newGate() {
  return { id: newStepId(), type: 'gate', question: '', options: [{ label: 'Yes', next: '', capture: null }, { label: 'No', next: '', capture: null }] }
}
export function newAction() {
  return { id: newStepId(), type: 'action', kind: 'tasks', name: '', agentId: '', instruction: '' }
}

export default function FlowSteps({ steps = [], agents = [], onChange }) {
  const set = (i, patch) => onChange(steps.map((s, idx) => idx === i ? { ...s, ...patch } : s))
  const move = (i, dir) => {
    const j = i + dir
    if (j < 0 || j >= steps.length) return
    const next = [...steps]
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }
  const remove = (i) => onChange(steps.filter((_, idx) => idx !== i))
  const jumpTargets = (i) => steps.map((s, idx) => ({ id: s.id, label: `${idx + 1}. ${s.type === 'gate' ? (s.question || 'question') : (s.name || s.kind)}` })).filter((_, idx) => idx !== i)

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Interview steps</div>
          <div style={muted}>Runs top to bottom. Gates ask and branch now. Every action is recorded as deferred until its real Phase 2 executor exists.</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" style={chipBtn} onClick={() => onChange([...steps, newGate()])}><HelpCircle size={12} style={{ display: 'inline', marginRight: 4 }} />Add question</button>
          <button type="button" style={chipBtn} onClick={() => onChange([...steps, newAction()])}><Zap size={12} style={{ display: 'inline', marginRight: 4 }} />Add action</button>
        </div>
      </div>
      {steps.length === 0 && <p style={muted}>No steps yet. Add a question ("Does this client need an NDA?") or an action.</p>}

      {steps.map((s, i) => (
        <div key={s.id} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: s.type === 'gate' ? 'var(--accent)' : 'var(--text)' }}>
              {i + 1}. {s.type === 'gate' ? 'QUESTION' : `ACTION · ${ACTION_KINDS.find(k => k.id === s.kind)?.label || s.kind}`}
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <button type="button" aria-label={`Move node ${i + 1} up`} style={{ ...chipBtn, padding: '0 8px' }} onClick={() => move(i, -1)}><ArrowUp size={13} /></button>
              <button type="button" aria-label={`Move node ${i + 1} down`} style={{ ...chipBtn, padding: '0 8px' }} onClick={() => move(i, 1)}><ArrowDown size={13} /></button>
              <button type="button" aria-label={`Delete node ${i + 1}`} style={{ ...chipBtn, padding: '0 8px', color: 'var(--red)' }} onClick={() => remove(i)}><Trash2 size={13} /></button>
            </div>
          </div>

          {s.type === 'gate' ? (
            <div style={{ display: 'grid', gap: 8 }}>
              <input aria-label={`Question for gate ${i + 1}`} style={field} value={s.question} placeholder='e.g. Does this client need an NDA?' onChange={e => set(i, { question: e.target.value })} />
              {(s.options || []).map((o, oi) => (
                <div key={oi} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                  <input aria-label={`Answer ${oi + 1} for gate ${i + 1}`} style={{ ...field, width: 130, flex: '0 0 auto' }} value={o.label} placeholder="Answer" onChange={e => set(i, { options: s.options.map((x, xi) => xi === oi ? { ...x, label: e.target.value } : x) })} />
                  <span style={muted}>then</span>
                  <ThemedSelect aria-label={`Next node for answer ${oi + 1}`} style={{ ...field, width: 'auto', minWidth: 170, flex: '0 0 auto' }} value={o.next || ''} onChange={e => set(i, { options: s.options.map((x, xi) => xi === oi ? { ...x, next: e.target.value } : x) })}>
                    <option value="">next step</option>
                    {jumpTargets(i).map(t => <option key={t.id} value={t.id}>jump to {t.label}</option>)}
                    <option value="end">end the flow</option>
                  </ThemedSelect>
                  <input aria-label={`Capture field for answer ${oi + 1}`} style={{ ...field, flex: 1, minWidth: 120 }} value={o.capture?.field || ''} placeholder="save answer as… (e.g. domain)" onChange={e => set(i, { options: s.options.map((x, xi) => xi === oi ? { ...x, capture: e.target.value.trim() ? { field: e.target.value.trim(), ...(x.capture?.prompt ? { prompt: x.capture.prompt } : {}) } : null } : x) })} />
                  {o.capture?.field && <input aria-label={`Capture prompt for answer ${oi + 1}`} style={{ ...field, flex: 1, minWidth: 160 }} value={o.capture?.prompt || ''} placeholder="prompt for the detail…" onChange={e => set(i, { options: s.options.map((x, xi) => xi === oi ? { ...x, capture: { ...x.capture, prompt: e.target.value } } : x) })} />}
                  <button type="button" aria-label={`Delete answer ${oi + 1}`} style={{ ...chipBtn, padding: '0 8px', color: 'var(--red)' }} onClick={() => set(i, { options: s.options.filter((_, xi) => xi !== oi) })}><Trash2 size={12} /></button>
                </div>
              ))}
              <button type="button" style={{ ...chipBtn, width: 'fit-content' }} onClick={() => set(i, { options: [...(s.options || []), { label: '', next: '', capture: null }] })}><Plus size={12} style={{ display: 'inline', marginRight: 4 }} />Add answer option</button>
            </div>
          ) : (

            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <ThemedSelect aria-label={`Action kind for node ${i + 1}`} style={{ ...field, width: 'auto', minWidth: 200, flex: '0 0 auto' }} value={s.kind} onChange={e => set(i, { kind: e.target.value })}>
                  {ACTION_KINDS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
                </ThemedSelect>
                <input aria-label={`Action name for node ${i + 1}`} style={{ ...field, flex: 1, minWidth: 140 }} value={s.name || ''} placeholder="Node name (e.g. Draft NDA)" onChange={e => set(i, { name: e.target.value })} />
                {['agent', 'document', 'mcp_call'].includes(s.kind) && (
                  <ThemedSelect aria-label={`Assigned agent for node ${i + 1}`} style={{ ...field, width: 'auto', minWidth: 160, flex: '0 0 auto' }} value={s.agentId || ''} onChange={e => set(i, { agentId: e.target.value })}>
                    <option value="">Choose agent…</option>
                    {agents.map(a => <option key={a.id} value={a.id}>{a.emoji} {a.name}</option>)}
                  </ThemedSelect>
                )}
              </div>
              {s.kind === 'api_call' && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <ThemedSelect aria-label={`HTTP method for node ${i + 1}`} style={{ ...field, width: 90, flex: '0 0 auto' }} value={s.method || 'GET'} onChange={e => set(i, { method: e.target.value })}>
                    {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map(m => <option key={m} value={m}>{m}</option>)}
                  </ThemedSelect>
                  <input aria-label={`API URL for node ${i + 1}`} style={{ ...field, flex: 2, minWidth: 200 }} value={s.url || ''} placeholder="https://api.example.com/… ({tokens} from captured answers work)" onChange={e => set(i, { url: e.target.value })} />
                  <input aria-label={`Vault credential reference for node ${i + 1}`} style={{ ...field, flex: 1, minWidth: 120 }} value={s.credRef || ''} placeholder="vault cred name (optional)" onChange={e => set(i, { credRef: e.target.value })} />
                  <input aria-label={`Response capture field for node ${i + 1}`} style={{ ...field, flex: 1, minWidth: 120 }} value={s.captureAs || ''} placeholder="save response as…" onChange={e => set(i, { captureAs: e.target.value })} />
                </div>
              )}
              {s.kind === 'api_call' && <textarea aria-label={`API body template for node ${i + 1}`} style={{ ...field, minHeight: 48, resize: 'vertical' }} value={s.bodyTemplate || ''} placeholder="Optional request body template (credentials stay in the vault)" onChange={e => set(i, { bodyTemplate: e.target.value })} />}
              {s.kind === 'mcp_call' && (
                <input aria-label={`MCP tool for node ${i + 1}`} style={field} value={s.mcpTool || ''} placeholder="MCP tool name the agent should use" onChange={e => set(i, { mcpTool: e.target.value })} />
              )}
              {s.kind === 'document' && <input aria-label={`Document footer note for node ${i + 1}`} style={field} value={s.footerNote || ''} placeholder="Required footer note (e.g. attorney review)" onChange={e => set(i, { footerNote: e.target.value })} />}
              {['agent', 'document', 'mcp_call'].includes(s.kind) && <input aria-label={`Required harness tools for node ${i + 1}`} style={field} value={(s.requiredTools || []).join(', ')} placeholder="Required harness tools, comma-separated" onChange={e => set(i, { requiredTools: e.target.value.split(',').map(value => value.trim()).filter(Boolean) })} />}
              <textarea aria-label={`Instruction for node ${i + 1}`} style={{ ...field, minHeight: 56, resize: 'vertical' }} value={s.instruction || ''}
                placeholder={s.kind === 'tasks' ? 'Describe the Phase 2 task request. {client}, {domain}, and other captured values are supported.' : 'Describe what Phase 2 would do. {client}, {domain}, and other captured values are supported.'}
                onChange={e => set(i, { instruction: e.target.value })} />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
