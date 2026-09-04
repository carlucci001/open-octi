'use client'

import { actionsForContext } from './operatorContextActions'

const SECTION_LABELS = {
  dashboard: 'Dashboard',
  agents: 'Agents',
  'agent-labs': 'Agent Sandbox',
  'nvidia-labs': 'AI Lab',
  'voice-labs': 'Voice Labs',
  repository: 'Repository',
  credentials: 'Credentials',
  ops: 'Ops Lab',
}

function displayLabel(tab) {
  if (!tab) return 'Dashboard'
  return SECTION_LABELS[tab] || String(tab).split('-').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
}

function IconButton({ children, title, onClick }) {
  return (
    <button type="button" title={title} aria-label={title} onClick={onClick} className="operator-rail-icon">
      {children}
    </button>
  )
}

function PanelIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path strokeLinecap="round" d="M15 4v16" />
      <path strokeLinecap="round" d="M7 8h4M7 12h4" />
    </svg>
  )
}

function SparkIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" />
    </svg>
  )
}

function AgentIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 20c1.7-4 4.4-6 8-6s6.3 2 8 6" />
    </svg>
  )
}

function ChevronIcon({ closed }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d={closed ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6'} />
    </svg>
  )
}

function UpIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M18 15l-6-6-6 6" />
    </svg>
  )
}

export default function OperatorContextRail({ activeTab, operatorContext, collapsed, onToggle, promptHidden = false, onShowPrompt }) {
  const context = operatorContext || { tab: activeTab }
  const handoff = context.handoff || null
  const workspaceLabel = displayLabel(context.tab || activeTab)
  const actions = actionsForContext(context)
  const ask = (prompt) => {
    window.dispatchEvent(new CustomEvent('fcc:ai-prompt', { detail: { prompt, open: true, autoSend: false, section: context.tab || activeTab, operatorContext: context } }))
  }

  if (collapsed) {
    return (
      <aside className="operator-context-rail is-collapsed" aria-label="Operator context rail collapsed">
        <div className="operator-rail-edge-stack">
          <button type="button" title="Expand right rail" aria-label="Expand right rail" onClick={onToggle} className="operator-rail-edge-toggle">
            <ChevronIcon closed />
          </button>
        </div>
        <div className="operator-rail-spacer" />
        {promptHidden && (
          <IconButton title="Show bottom command bar" onClick={onShowPrompt}><UpIcon /></IconButton>
        )}
      </aside>
    )
  }

  return (
    <aside className="operator-context-rail" aria-label="Operator context rail">
      <button type="button" title="Collapse right rail" aria-label="Collapse right rail" onClick={onToggle} className="operator-rail-edge-toggle">
        <ChevronIcon />
      </button>
      <div className="operator-rail-head">
        <div className="operator-rail-mark"><PanelIcon /></div>
        <div>
          <div className="operator-rail-kicker">Workspace</div>
          <h2>{context.subtab ? `${workspaceLabel} / ${context.subtab}` : workspaceLabel}</h2>
          {context.recordName && <p className="operator-rail-record">{context.recordName}</p>}
        </div>
      </div>

      <div className="operator-rail-section">
        <div className="operator-rail-title">Wizard Playbooks</div>
        <div className="operator-rail-actions">
          {actions.map(action => (
            <button key={action.label} type="button" onClick={() => ask(action.prompt)}>
              <SparkIcon />
              <span>{action.label}</span>
            </button>
          ))}
        </div>
      </div>

      {handoff && (
        <div className="operator-rail-section">
          <div className="operator-rail-title">Agent Handoff</div>
          <div className="operator-rail-note" style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, color: 'var(--text)' }}>
              <AgentIcon />
              <span>{handoff.title || `${handoff.agentName || 'Agent'} Handoff`}</span>
            </div>
            <div>{handoff.preview || 'Workspace context is ready for this agent.'}</div>
            {handoff.reason && <div><strong>Reason:</strong> {handoff.reason}</div>}
            {handoff.intent && <div><strong>Intent:</strong> {handoff.intent}</div>}
          </div>
          {Array.isArray(handoff.prompts) && handoff.prompts.length > 0 && (
            <div className="operator-rail-actions" style={{ marginTop: 10 }}>
              {handoff.prompts.slice(0, 3).map(prompt => (
                <button key={prompt} type="button" onClick={() => ask(prompt)}>
                  <SparkIcon />
                  <span>{prompt}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="operator-rail-section">
        <div className="operator-rail-title">Human Layer</div>
        <div className="operator-rail-note">
          Playbooks open in the AI Wizard for review. The bottom command bar calls specialist operator tools directly.
        </div>
      </div>

      <div className="operator-rail-spacer" />
      {promptHidden && (
        <button type="button" className="operator-rail-prompt-restore" onClick={onShowPrompt} aria-label="Show bottom command bar">
          <UpIcon />
          <span>Show command bar</span>
        </button>
      )}
    </aside>
  )
}
